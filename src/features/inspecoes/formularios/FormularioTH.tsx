import { useRef, useState } from 'react';
import { carregarDadosFormulario, salvarDadosFormulario } from '../inspecaoService';
import { useAutosaveFormulario } from '../useAutosaveFormulario';
import { mesclarPreenchimento, prefillTH } from './autoPreencher';
import ResultadoEnsaio, { type ResultadoEnsaioValor } from './ResultadoEnsaio';
import { salvarFoto, type RefFoto } from '../../../services/fotos';
import FotoImg from '../../../components/FotoImg';
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
}

function dadosPadrao(): DadosTH {
  return {
    cliente: '',
    docNum: '',
    equipamento: 'Vaso de Pressão',
    dataTeste: new Date().toISOString().split('T')[0],
    pressaoProj: '',
    pressaoTrabalho: '',
    pressaoTeste: '',
    fluido: 'Água Potável',
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
  const [dados, setDados] = useState<DadosTH>(() =>
    mesclarPreenchimento(dadosPadrao(), prefillTH(tag), carregarDadosFormulario<DadosTH>(tag, containerId, 'th')),
  );
  useAutosaveFormulario(tag, containerId, 'th', dados);
  // 10/09/2026 · o aviso de salvamento passou a ser UM componente do sistema
  // (`FeedbackSalvamento`). Antes cada formulário tinha a sua cópia — quatro
  // versões da mesma ideia, e o ultrassom sem nenhuma.
  const salvamento = useSalvamento();
  const salvando = salvamento.salvando;
  const inputRef = useRef<HTMLInputElement>(null);

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

  async function adicionarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    try {
      // 800px para qualidade adequada no laudo impresso
      const ref = await salvarFoto(arquivo, `${tag}/th`);
      setDados((d) => ({ ...d, fotos: [...d.fotos, { ref, descricao: '' }] }));
    } catch {
      // Falha ao processar a imagem também é falha de salvamento aos olhos do
      // usuário: ele anexou uma foto e ela não ficou. Mesmo aviso, mesmo lugar.
      salvamento.falhar('Erro ao processar a imagem. Tente outra foto.');
    }
    if (inputRef.current) inputRef.current.value = '';
  }

  function setDescricaoFoto(i: number, descricao: string) {
    setDados((d) => ({ ...d, fotos: d.fotos.map((f, idx) => (idx === i ? { ...f, descricao } : f)) }));
  }

  function removerFoto(i: number) {
    setDados((d) => ({ ...d, fotos: d.fotos.filter((_, idx) => idx !== i) }));
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
            Pressão de Projeto (kgf/cm²)
            <input type="number" step="0.01" value={dados.pressaoProj} onChange={(e) => set('pressaoProj', e.target.value)} />
          </label>
          <label>
            Pressão de Trabalho (kgf/cm²)
            <input type="number" step="0.01" value={dados.pressaoTrabalho} onChange={(e) => set('pressaoTrabalho', e.target.value)} />
          </label>
          <label>
            Pressão de Teste (kgf/cm²)
            <input type="number" step="0.01" value={dados.pressaoTeste} onChange={(e) => set('pressaoTeste', e.target.value)} />
          </label>
          <label>
            Fluido Utilizado
            <input type="text" value={dados.fluido} onChange={(e) => set('fluido', e.target.value)} />
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
                <input type="number" value={linha.tempo} onChange={(e) => setLinha(i, 'tempo', e.target.value)} />
              </label>
              <label>
                Pressão (kgf/cm²)
                <input type="number" step="0.01" value={linha.pressao} onChange={(e) => setLinha(i, 'pressao', e.target.value)} />
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

        <div className="fotos-formulario-grid">
          {dados.fotos.map((f, i) => (
            <div key={i} className="foto-formulario-item">
              <FotoImg foto={f} alt={`Foto ${i + 1}`} variante="thumb" />
              <input
                type="text"
                placeholder={`Legenda da Foto ${i + 1}`}
                value={f.descricao}
                onChange={(e) => setDescricaoFoto(i, e.target.value)}
              />
              <button type="button" className="btn-remover-linha" onClick={() => removerFoto(i)}>
                Remover
              </button>
            </div>
          ))}
        </div>

        {/* Botão sempre visível — sem limite */}
        <label className="btn-add-foto" style={{ display: 'block', textAlign: 'center', marginTop: 10 }}>
          + Adicionar Foto
          <input ref={inputRef} type="file" accept="image/*" onChange={adicionarFoto} style={{ display: 'none' }} />
        </label>
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
