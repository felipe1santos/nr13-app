import { useState } from 'react';
import { carregarDadosFormulario, salvarDadosFormulario } from '../inspecaoService';
import { useAutosaveFormulario } from '../useAutosaveFormulario';
import { AvisoRevisaoNc, CabecalhoNaoConformidade, ItemNaoConformidade } from './ExameNaoConformidade';
import { SEMANTICA_NC_ATUAL, carimboInicial, precisaConfirmarSemantica, type RespostaNc } from './semanticaNc';
import { mesclarPreenchimento, prefillVisual } from './autoPreencher';
import ResultadoEnsaio, { type ResultadoEnsaioValor } from './ResultadoEnsaio';
import type { RefFoto } from '../../../services/fotos';
import EditorFotosDescritas from '../EditorFotosDescritas';
import { normalizarFotos } from '../fotosDescritas';
import FeedbackSalvamento, { useSalvamento } from '../../../components/FeedbackSalvamento';

const ESTILO_DICA = { fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 } as const;
const DICA_AUTO = 'Campos preenchidos automaticamente a partir do cadastro; edite se necessário.';

const ITENS = [
  'Juntas, conexões e vedações',
  'Elementos de fixação',
  'Cordões de solda',
  'Estruturas de apoio, suporte e içamento',
  'Estrutura física do equipamento',
  'Dispositivo(s) de drenagem',
  'Acúmulo residual ou material',
  'Proteção contra eletricidade estática',
  'Iluminação',
  'Dispositivo(s) de alívio de pressão',
  'Indicador(es) de pressão',
  'Sistema contra bloqueio inadvertido de dispositivo(s) de segurança',
  'Placa de identificação',
  'Acessibilidade e localização do equipamento',
  'Ventilação',
];

/**
 * O catálogo de verificações desta folha, para o DOCUMENTO.
 *
 * O formulário grava `itens: { "1": "sim" }` — só o número. Sem esta lista
 * exportada o relatório imprimia "1", "2" na coluna VERIFICAÇÃO no lugar da
 * pergunta (medido no E2E de 05/09/2026). A ORDEM é o identificador: o item n
 * do formulário é `ITENS_VISUAL_EXTERNO[n - 1]`, e por isso nenhum item pode ser removido
 * do meio da lista — some a pergunta de toda inspeção já gravada.
 */
export const ITENS_VISUAL_EXTERNO = ITENS;


interface DadosVisual {
  contratante: string;
  rastreabilidade: string;
  endereco: string;
  dataInspecao: string;
  serie: string;
  tipoEquipamento: string;
  fabricante: string;
  itens: Record<string, 'sim' | 'nao' | 'na' | ''>;
  itemObs: Record<string, string>;
  observacoes: string;
  conclusao: string;
  resultado: ResultadoEnsaioValor;
  // Fase 5 · `id` e `ordem` (opcionais: registro antigo não tem) — ver
  // `fotosDescritas.ts`. O array é mantido na ordem de `ordem`.
  fotos: { id?: string; ordem?: number; base64?: string; ref?: RefFoto; descricao: string }[];
  /**
   * Carimbo da semântica "SIM = não conformidade encontrada" (18/09/2026).
   * Presente = respondido com a pergunta na tela. Ausente num registro COM
   * respostas = preenchido antes; fica para revisão. Ver `semanticaNc.ts`.
   */
  semanticaNc?: number;
}

function dadosPadrao(): DadosVisual {
  return {
    contratante: '',
    rastreabilidade: '',
    endereco: '',
    dataInspecao: new Date().toISOString().split('T')[0],
    serie: '',
    tipoEquipamento: '',
    fabricante: '',
    itens: {},
    itemObs: {},
    observacoes: '',
    conclusao: '',
    resultado: '',
    fotos: [],
  };
}

export default function FormularioVisualExterno({ tag, containerId }: { tag: string; containerId: string }) {
  const [dados, setDados] = useState<DadosVisual>(() => {
    // Merge com o padrão pra inspeções antigas (sem `resultado`) não quebrarem.
    // Precedência: o que o usuário digitou > auto-preenchimento do cadastro > padrão.
    const salvo = carregarDadosFormulario<DadosVisual>(tag, containerId, 'visual_externo');
    const mesclado = mesclarPreenchimento(dadosPadrao(), prefillVisual(tag), salvo);
    // O carimbo NÃO vem do padrão: registro antigo com respostas fica sem ele
    // até a revisão explícita (`AvisoRevisaoNc`).
    return { ...mesclado, semanticaNc: carimboInicial(salvo) };
  });
  useAutosaveFormulario(tag, containerId, 'visual_externo', dados);
  // 10/09/2026 · o aviso de salvamento passou a ser UM componente do sistema
  // (`FeedbackSalvamento`). Antes cada formulário tinha a sua cópia — quatro
  // versões da mesma ideia, e o ultrassom sem nenhuma.
  const salvamento = useSalvamento();
  const salvando = salvamento.salvando;

  function set<K extends keyof DadosVisual>(k: K, v: DadosVisual[K]) {
    setDados((d) => ({ ...d, [k]: v }));
  }

  function confirmarSemantica() {
    setDados((d) => ({ ...d, semanticaNc: SEMANTICA_NC_ATUAL }));
  }

  function setItem(n: number, val: 'sim' | 'nao' | 'na' | '') {
    setDados((d) => ({ ...d, itens: { ...d.itens, [String(n)]: val } }));
  }

  function setItemObs(n: number, val: string) {
    setDados((d) => ({ ...d, itemObs: { ...d.itemObs, [String(n)]: val } }));
  }

  async function salvar() {
    await salvamento.executar(() => salvarDadosFormulario(tag, containerId, 'visual_externo', dados));
  }

  return (
    <>
      <div className="formulario-secao">
        <h3>Dados Gerais</h3>
        <p style={ESTILO_DICA}>{DICA_AUTO}</p>
        <div className="form-grid">
          <label>T.A.G. do Equipamento<input type="text" value={tag} disabled /></label>
          <label>Data da Inspeção<input type="date" value={dados.dataInspecao} onChange={(e) => set('dataInspecao', e.target.value)} /></label>
          <label>Contratante<input type="text" value={dados.contratante} onChange={(e) => set('contratante', e.target.value)} /></label>
          <label>Endereço<input type="text" value={dados.endereco} onChange={(e) => set('endereco', e.target.value)} /></label>
          <label>Rastreabilidade<input type="text" value={dados.rastreabilidade} onChange={(e) => set('rastreabilidade', e.target.value)} /></label>
        </div>
      </div>

      <div className="formulario-secao">
        <h3>Aspectos Gerais do Equipamento</h3>
        <p style={ESTILO_DICA}>{DICA_AUTO}</p>
        <div className="form-grid">
          <label>Nº de Série<input type="text" value={dados.serie} onChange={(e) => set('serie', e.target.value)} /></label>
          <label>Tipo de Equipamento<input type="text" value={dados.tipoEquipamento} onChange={(e) => set('tipoEquipamento', e.target.value)} /></label>
          <label>Fabricante<input type="text" value={dados.fabricante} onChange={(e) => set('fabricante', e.target.value)} /></label>
        </div>
      </div>

      <div className="formulario-secao">
        <h3>Itens de Verificação — Inspeção Visual Externa</h3>
        {/* A PERGUNTA que as três colunas respondem — a mesma do documento (7.2/7.3).
            Sem ela, SIM se lia "está ok"; no laudo, SIM é não conformidade. */}
        {precisaConfirmarSemantica(dados) && <AvisoRevisaoNc aoConfirmar={confirmarSemantica} />}
        <CabecalhoNaoConformidade
          respostas={ITENS.map((_, idx) => (dados.itens[String(idx + 1)] ?? '') as RespostaNc)}
        />
        {ITENS.map((item, idx) => {
          const n = idx + 1;
          return (
            <ItemNaoConformidade
              key={n}
              n={n}
              texto={item}
              valor={(dados.itens[String(n)] ?? '') as RespostaNc}
              observacao={dados.itemObs[String(n)] ?? ''}
              aoResponder={(v) => setItem(n, v)}
              aoObservar={(v) => setItemObs(n, v)}
            />
          );
        })}
      </div>

      <div className="formulario-secao">
        <h3>Observações Gerais</h3>
        <textarea
          rows={4}
          style={{ width: '100%', padding: 12, border: '1px solid var(--border-solid)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
          placeholder="Observações gerais sobre a inspeção visual externa..."
          value={dados.observacoes}
          onChange={(e) => set('observacoes', e.target.value)}
        />
      </div>

      <div className="formulario-secao">
        <h3>Conclusão Técnica</h3>
        <textarea
          rows={3}
          style={{ width: '100%', padding: 12, border: '1px solid var(--border-solid)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
          placeholder="Conclusão técnica sobre as condições do equipamento..."
          value={dados.conclusao}
          onChange={(e) => set('conclusao', e.target.value)}
        />
      </div>

      <ResultadoEnsaio valor={dados.resultado} onChange={(v) => set('resultado', v)} />

      <div className="formulario-secao">
        <h3>Registro Fotográfico ({dados.fotos.length} {dados.fotos.length === 1 ? 'foto' : 'fotos'})</h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
          Fotos salvas aqui serão injetadas automaticamente no documento de Inspeção Visual Externa.
        </p>
        <EditorFotosDescritas
          fotos={dados.fotos}
          escopo={`${tag}/visual-externo`}
          textoVazio="Nenhuma foto adicionada"
          rotuloAdicionar="Adicionar foto"
          alterar={(atualizar) => setDados((d) => ({ ...d, fotos: atualizar(normalizarFotos(d.fotos)) }))}
        />
      </div>

      <div className="formulario-acoes-fixas">
        <button type="button" className="btn-primario" onClick={salvar} disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar Checklist Visual'}
        </button>
      </div>
      <FeedbackSalvamento
        estado={salvamento.estado}
        erro={salvamento.erro}
        aoTentarNovamente={() => void salvar()}
        aoFechar={salvamento.limpar}
      />
    </>
  );
}
