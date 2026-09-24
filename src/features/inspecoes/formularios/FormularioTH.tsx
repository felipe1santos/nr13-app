import { useState } from 'react';
import { carregarDadosFormulario, salvarDadosFormulario } from '../inspecaoService';
import { useAutosaveFormulario } from '../useAutosaveFormulario';
import { mesclarPreenchimento, prefillTH } from './autoPreencher';
import { ler } from '../../../services/storage';
import { rotuloPressao, valorNaUnidade, type SistemaUnidade } from '../../../calc/unidades';
import { pressaoDeProjetoMpa } from '../../memorial/pressaoProjeto';
import { unidadeDoRegistroTh, unidadeDoEquipamento, fluidoEhOperacional } from './unidadeTh';
import ResultadoEnsaio, { type ResultadoEnsaioValor } from './ResultadoEnsaio';
import type { RefFoto } from '../../../services/fotos';
import EditorFotosDescritas from '../EditorFotosDescritas';
import { normalizarFotos } from '../fotosDescritas';
import FeedbackSalvamento, { useSalvamento } from '../../../components/FeedbackSalvamento';

const ESTILO_DICA = { fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 } as const;
const DICA_AUTO = 'Campos preenchidos automaticamente a partir do cadastro; edite se necessário.';
const ESTILO_TEXTAREA = {
  width: '100%',
  padding: 12,
  border: '1px solid var(--border-solid)',
  borderRadius: 8,
  fontSize: 14,
  fontFamily: 'inherit',
  resize: 'vertical',
  boxSizing: 'border-box',
} as const;

interface LinhaCurva {
  tempo: string;
  pressao: string;
}

interface Foto {
  /** Fase 5 · identidade e ordem explícitas (ausentes em registro antigo). */
  id?: string;
  ordem?: number;
  /** Referência no bucket. Fotos novas usam só isto. */
  ref?: RefFoto;
  /** LEGADO: base64 das fotos gravadas antes de 10/08/2026. */
  base64?: string;
  descricao: string;
}

/**
 * Os campos do ensaio.
 *
 * ## Os sete que entraram em 07/09/2026
 *
 * `pressaoTrabalho`, `duracao`, `tempFluido`, `normas`, `validadeLaudo`,
 * `procedimento` e `parecer` **já eram impressos** na folha 7.5 do relatório e
 * lidos pelo modelo (`pdfVetorial/modelo.ts`) — só que nenhum formulário os
 * coletava. O laudo saía com "DURAÇÃO DO TESTE: —" e o engenheiro tinha de
 * digitar dentro do documento, um por relatório, sem nada disso voltar para a
 * inspeção.
 *
 * Os nomes são os que o modelo já lê. Nenhuma chave nova: continuam dentro do
 * `dados.th` do container de inspeção, gravados pelo mesmo
 * `salvarDadosFormulario`. Ensaio antigo simplesmente não tem os campos, e o
 * `mesclarPreenchimento` os traz do padrão — o documento segue abrindo.
 */
interface DadosTH {
  cliente: string;
  docNum: string;
  equipamento: string;
  dataTeste: string;
  pressaoProj: string;
  /** Pressão máxima de OPERAÇÃO. Pré-preenchida da PMO adotada na ficha. */
  pressaoTrabalho: string;
  pressaoTeste: string;
  fluido: string;
  /** Quanto tempo a pressão de teste foi mantida (ex.: "30 min"). */
  duracao: string;
  tempFluido: string;
  normas: string;
  /** Validade do laudo DESTE ensaio — não é a validade da inspeção (`meta.validade`). */
  validadeLaudo: string;
  procedimento: string;
  /** A conclusão técnica do TH. Pertence ao ensaio, como a do exame visual. */
  parecer: string;
  resultado: ResultadoEnsaioValor;
  curva: LinhaCurva[];
  fotos: Foto[];
  /**
   * Em que unidade as pressões DESTE registro foram digitadas (18/09/2026).
   * Carimbada pelo formulário com a unidade do equipamento. Ausente = registro
   * antigo, digitado sob o rótulo fixo "(kgf/cm²)" — ver `unidadeTh.ts`.
   */
  unidade?: SistemaUnidade;
}

function dadosPadrao(unidade: SistemaUnidade): DadosTH {
  return {
    cliente: '',
    docNum: '',
    equipamento: 'Vaso de Pressão',
    dataTeste: new Date().toISOString().split('T')[0],
    pressaoProj: '',
    pressaoTrabalho: '',
    pressaoTeste: '',
    // SEM valor padrão: o fluido do ENSAIO é informação do técnico. O antigo
    // "Água Potável" era sobrescrito pelo fluido de operação da categoria e,
    // quando não era, afirmava um fluido que ninguém conferiu.
    fluido: '',
    unidade,
    duracao: '',
    tempFluido: '',
    // O mesmo texto que a folha antiga trazia impresso: é a norma que este
    // ensaio segue em praticamente todo vaso, e continua editável.
    normas: 'ASME VIII Div.1 / NR-13',
    validadeLaudo: '',
    procedimento: '',
    parecer: '',
    resultado: '',
    curva: [{ tempo: '', pressao: '' }, { tempo: '', pressao: '' }, { tempo: '', pressao: '' }],
    fotos: [],
  };
}

export default function FormularioTH({ tag, containerId }: { tag: string; containerId: string }) {
  // Merge com o padrão pra inspeções antigas (sem `resultado`) não quebrarem.
  // Precedência: o que o usuário digitou > auto-preenchimento do cadastro > padrão.
  //
  // A UNIDADE vem antes de tudo: o prefill precisa sair na unidade do REGISTRO.
  // Registro novo → a do equipamento; registro antigo sem carimbo → kgf/cm²,
  // que é o que o rótulo dizia quando ele foi digitado. Nada é convertido nem
  // regravado aqui — o formulário só mostra o rótulo certo para o número que já
  // está lá.
  const [dados, setDados] = useState<DadosTH>(() => {
    const salvo = carregarDadosFormulario<DadosTH>(tag, containerId, 'th');
    const unidade = unidadeDoRegistroTh(salvo, unidadeDoEquipamento(tag));
    const mesclado = mesclarPreenchimento(dadosPadrao(unidade), prefillTH(tag, unidade), salvo);
    // `mesclarPreenchimento` herdaria o carimbo do PADRÃO num registro antigo.
    return { ...mesclado, unidade };
  });
  useAutosaveFormulario(tag, containerId, 'th', dados);
  const rotuloP = rotuloPressao(dados.unidade ?? unidadeDoEquipamento(tag));
  // A pressão de PROJETO é dado do equipamento, do MEMORIAL — não se redigita.
  // Com memorial, o campo só mostra; sem ele, fica aberto (e o documento usa o
  // digitado). Nunca a PMTA.
  const projetoDoMemorial = valorNaUnidade(pressaoDeProjetoMpa(tag), dados.unidade ?? unidadeDoEquipamento(tag));
  const fluidoSuspeito = fluidoEhOperacional(dados.fluido, ler<{ fluidoInput?: string }>(`nr13_cat_${tag}`)?.fluidoInput);
  // 10/09/2026 · o aviso de salvamento passou a ser UM componente do sistema
  // (`FeedbackSalvamento`). Antes cada formulário tinha a sua cópia — quatro
  // versões da mesma ideia, e o ultrassom sem nenhuma.
  const salvamento = useSalvamento();
  const salvando = salvamento.salvando;

  function set(chave: keyof DadosTH, valor: string) {
    setDados((d) => ({ ...d, [chave]: valor }));
  }

  function setLinha(i: number, chave: keyof LinhaCurva, valor: string) {
    setDados((d) => ({ ...d, curva: d.curva.map((l, idx) => (idx === i ? { ...l, [chave]: valor } : l)) }));
  }

  function adicionarLinha() {
    setDados((d) => ({ ...d, curva: [...d.curva, { tempo: '', pressao: '' }] }));
  }

  function removerLinha(i: number) {
    setDados((d) => ({ ...d, curva: d.curva.filter((_, idx) => idx !== i) }));
  }

  async function salvar() {
    await salvamento.executar(() => salvarDadosFormulario(tag, containerId, 'th', dados));
  }

  const nFotos = dados.fotos.length;
  const nFolhas = Math.max(1, Math.ceil(nFotos / 4));

  return (
    <>
      <div className="formulario-secao">
        <h3>Informações Gerais do Teste</h3>
        <p style={ESTILO_DICA}>{DICA_AUTO}</p>
        <div className="form-grid">
          <label>
            Cliente / Empresa
            <input type="text" value={dados.cliente} onChange={(e) => set('cliente', e.target.value)} />
          </label>
          <label>
            Doc Nº
            <input type="text" value={dados.docNum} onChange={(e) => set('docNum', e.target.value)} />
          </label>
          <label>
            T.A.G.
            <input type="text" value={tag} disabled />
          </label>
          <label>
            Equipamento
            <input type="text" value={dados.equipamento} onChange={(e) => set('equipamento', e.target.value)} />
          </label>
          <label>
            Data do Teste
            <input type="date" value={dados.dataTeste} onChange={(e) => set('dataTeste', e.target.value)} />
          </label>
          <label>
            Pressão de Projeto ({rotuloP})
            {projetoDoMemorial !== null ? (
              <>
                <input type="text" value={projetoDoMemorial} disabled aria-describedby="th-projeto-dica" />
                <span id="th-projeto-dica" className="th-dica-campo">Do memorial de cálculo</span>
              </>
            ) : (
              <input type="text" inputMode="decimal" value={dados.pressaoProj} onChange={(e) => set('pressaoProj', e.target.value)} />
            )}
          </label>
          <label>
            Pressão de Trabalho ({rotuloP})
            <input type="text" inputMode="decimal" value={dados.pressaoTrabalho} onChange={(e) => set('pressaoTrabalho', e.target.value)} />
          </label>
          <label>
            Pressão de Teste ({rotuloP})
            <input type="text" inputMode="decimal" value={dados.pressaoTeste} onChange={(e) => set('pressaoTeste', e.target.value)} />
          </label>
          <label>
            Fluido de Teste
            <input
              type="text"
              placeholder="Ex.: água"
              value={dados.fluido}
              onChange={(e) => set('fluido', e.target.value)}
              aria-invalid={fluidoSuspeito || undefined}
            />
            {fluidoSuspeito && (
              <span className="th-dica-campo th-dica-alerta" role="alert">
                Este é o fluido de OPERAÇÃO (veio da categoria). Informe o fluido usado no teste.
              </span>
            )}
          </label>
        </div>
      </div>

      {/* Os campos que a folha 7.5 do relatório imprime na faixa "DADOS DO
          TESTE". Até 07/09/2026 eles saíam em branco no laudo porque o
          formulário não os coletava — o engenheiro digitava dentro do
          documento, um por relatório. */}
      <div className="formulario-secao">
        <h3>Condições do Ensaio</h3>
        <p style={ESTILO_DICA}>Vão para a faixa "Dados do Teste" do laudo.</p>
        <div className="form-grid">
          <label>
            Duração do Teste
            <input
              type="text"
              placeholder="Ex.: 30 min"
              value={dados.duracao}
              onChange={(e) => set('duracao', e.target.value)}
            />
          </label>
          <label>
            Temperatura do Fluido
            <input
              type="text"
              placeholder="Ex.: 22 °C"
              value={dados.tempFluido}
              onChange={(e) => set('tempFluido', e.target.value)}
            />
          </label>
          <label>
            Normas de Referência
            <input type="text" value={dados.normas} onChange={(e) => set('normas', e.target.value)} />
          </label>
          <label>
            Validade do Laudo
            <input
              type="date"
              value={dados.validadeLaudo}
              onChange={(e) => set('validadeLaudo', e.target.value)}
            />
          </label>
        </div>
        <label style={{ display: 'block', marginTop: 12 }}>
          Procedimento Aplicado
          <textarea
            rows={3}
            style={ESTILO_TEXTAREA}
            placeholder="Procedimento seguido na pressurização, estabilização e despressurização..."
            value={dados.procedimento}
            onChange={(e) => set('procedimento', e.target.value)}
          />
        </label>
      </div>

      <div className="formulario-secao">
        <h3>Curva de Pressurização e Estabilização</h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Os dados preenchidos aqui irão compor o gráfico de estabilização do laudo técnico.
        </p>
        {dados.curva.map((linha, i) => (
          <div key={i} className="linha-medida-card">
            <span className="linha-medida-titulo">Ponto {i + 1}</span>
            <div className="linha-medida-campos">
              <label>
                Tempo (min)
                <input type="text" inputMode="decimal" value={linha.tempo} onChange={(e) => setLinha(i, 'tempo', e.target.value)} />
              </label>
              <label>
                Pressão ({rotuloP})
                <input type="text" inputMode="decimal" value={linha.pressao} onChange={(e) => setLinha(i, 'pressao', e.target.value)} />
              </label>
            </div>
            {dados.curva.length > 1 && (
              <button type="button" className="btn-remover-linha" onClick={() => removerLinha(i)}>
                Remover ponto
              </button>
            )}
          </div>
        ))}
        <button type="button" className="btn-secundario" onClick={adicionarLinha}>
          + Adicionar Ponto
        </button>
      </div>

      <div className="formulario-secao">
        <h3>Parecer Técnico</h3>
        <textarea
          rows={4}
          style={ESTILO_TEXTAREA}
          placeholder="Parecer conclusivo sobre o teste hidrostático (estanqueidade, deformações, vazamentos)..."
          value={dados.parecer}
          onChange={(e) => set('parecer', e.target.value)}
        />
      </div>

      <ResultadoEnsaio valor={dados.resultado} onChange={(v) => set('resultado', v)} />

      <div className="formulario-secao">
        <h3>
          Registro Fotográfico
          {nFotos > 0 && (
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 10 }}>
              {nFotos} foto{nFotos !== 1 ? 's' : ''} → {nFolhas} folha{nFolhas !== 1 ? 's' : ''} de evidência no laudo
            </span>
          )}
        </h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Sem limite de fotos. 4 fotos por folha no laudo. Cada foto pode ter uma legenda.
        </p>

        <EditorFotosDescritas
          fotos={dados.fotos}
          escopo={`${tag}/th`}
          textoVazio="Nenhuma foto adicionada"
          rotuloAdicionar="Adicionar foto"
          alterar={(atualizar) => setDados((d) => ({ ...d, fotos: atualizar(normalizarFotos(d.fotos)) }))}
        />
      </div>

      <div className="formulario-acoes-fixas">
        <button type="button" className="btn-primario" onClick={salvar} disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar'}
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
