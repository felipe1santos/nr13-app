import { useRef, useState } from 'react';
import { comprimirImagem } from '../../../services/imagem';
import { carregarDadosFormulario, salvarDadosFormulario } from '../inspecaoService';
import { useAutosaveFormulario } from '../useAutosaveFormulario';

const OPCOES_EXISTE = ['Existe', 'Não identificado', 'Não aplica'];
const OPCOES_SIM_NAO = ['Sim', 'Não'];
const OPCOES_SIM_NAO_NA = ['Sim', 'Não', 'N/A'];
const OPCOES_RGI = ['Sim (RGI)', 'Não'];
const OPCOES_LOCAL = ['Ambiente aberto', 'Ambiente fechado', 'Outro'];

interface Pergunta {
  id: string;
  texto: string;
  opcoes: string[];
}

const SECAO_DOCUMENTACAO: Pergunta[] = [
  { id: 'v51-registro-seguranca', texto: 'Registro de segurança', opcoes: OPCOES_EXISTE },
  { id: 'v51-desenho-conjunto', texto: 'Desenho do conjunto geral', opcoes: OPCOES_EXISTE },
  { id: 'v51-prontuario', texto: 'Prontuário', opcoes: OPCOES_EXISTE },
  { id: 'v51-memoria-calculo', texto: 'Memória de cálculo da PMTA das partes do vaso de pressão', opcoes: OPCOES_EXISTE },
  { id: 'v51-relatorio-insp-inicial', texto: 'Relatório de inspeção inicial', opcoes: OPCOES_EXISTE },
  { id: 'v51-projeto-instalacao', texto: 'Projeto de instalação do vaso de pressão', opcoes: OPCOES_EXISTE },
  { id: 'v51-manual-operacao', texto: 'Manual de operação para vasos de categoria I e II', opcoes: OPCOES_EXISTE },
  { id: 'v51-operador-qualificado', texto: 'Operador qualificado para operação de vasos de categoria I e II', opcoes: OPCOES_EXISTE },
  { id: 'v51-comprovante-estagio', texto: 'Comprovante de estágio supervisionado', opcoes: OPCOES_EXISTE },
  { id: 'v51-laudo-th', texto: 'Laudo de teste hidrostático/pneumático', opcoes: OPCOES_EXISTE },
  { id: 'v51-cert-calibracao', texto: 'Certificados de calibração dos dispositivos de segurança, onde aplicável', opcoes: OPCOES_EXISTE },
  { id: 'v51-programa-inspecoes', texto: 'Programa de inspeções com suas datas limites', opcoes: OPCOES_EXISTE },
  { id: 'v51-recomendacoes-anteriores', texto: 'Recomendações de inspeções anteriores e que não foram realizadas', opcoes: OPCOES_EXISTE },
  { id: 'v51-mapa-espessuras', texto: 'Mapa de medição de espessuras por ultrassom', opcoes: OPCOES_EXISTE },
  {
    id: 'v51-art-assinada',
    texto:
      'A.R.T assinada (Anotação de Responsabilidade Técnica) do profissional habilitado responsável pela documentação/ensaios descritos acima.',
    opcoes: OPCOES_EXISTE,
  },
];

const SECAO_RESULTADOS_GERAIS: Pergunta[] = [
  {
    id: 'chk-pv8',
    texto:
      'O vaso possui o produto "P.V." maior do que 8 (oito), onde "P" é a máxima pressão de operação em kPa e "V" é o volume geométrico em m³? Portanto se enquadra na NR-13?',
    opcoes: OPCOES_SIM_NAO,
  },
  { id: 'chk-rgi', texto: 'O vaso constitui risco grave e iminente?', opcoes: OPCOES_RGI },
  {
    id: 'chk-placa',
    texto: 'Possui placa de identificação? Possui no mínimo as seguintes informações, conforme a norma NR-13?',
    opcoes: OPCOES_SIM_NAO,
  },
  { id: 'chk-categoria', texto: 'Possui em local visível a identificação do vaso e sua categoria?', opcoes: OPCOES_SIM_NAO },
];

const SECAO_PRONTUARIO: Pergunta[] = [
  { id: 'chk-prontuario', texto: 'O vaso de pressão possui prontuário?', opcoes: OPCOES_SIM_NAO },
  {
    id: 'chk-caract-prontuario',
    texto: 'As características do vaso de pressão conferem com as informações do prontuário?',
    opcoes: OPCOES_SIM_NAO,
  },
  {
    id: 'chk-livro',
    texto: 'O vaso de pressão possui livro de registro de segurança conforme a norma NR-13?',
    opcoes: OPCOES_SIM_NAO,
  },
];

const SECAO_EXAME_EXTERNO: Pergunta[] = [
  { id: 'chk-local-inst', texto: 'Local de instalação do vaso:', opcoes: OPCOES_LOCAL },
  {
    id: 'chk-exig-inst',
    texto: 'O vaso de pressão atende as exigências para o local de instalação, conforme NR-13?',
    opcoes: OPCOES_SIM_NAO,
  },
];

const SECAO_EXAME_INTERNO: Pergunta[] = [
  { id: 'chk-ex-int', texto: 'O vaso de pressão foi examinado internamente?', opcoes: OPCOES_SIM_NAO_NA },
  {
    id: 'chk-int-ok',
    texto:
      'Caso tenha sido inspecionado internamente, o vaso de pressão, depois de limpo, está em ordem e satisfaz a todas as condições de segurança constantes desta Norma NR-13 observáveis nesse exame?',
    opcoes: OPCOES_SIM_NAO_NA,
  },
  {
    id: 'chk-caract-exame',
    texto: 'A parte de caracterização do vaso de pressão acessível a esse exame confere com o que, sobre este, consta do prontuário?',
    opcoes: OPCOES_SIM_NAO,
  },
];

const SECAO_TH: Pergunta[] = [
  { id: 'chk-th-feito', texto: 'Foi realizado?', opcoes: OPCOES_SIM_NAO },
  { id: 'chk-psv', texto: 'Possui válvula ou dispositivos de segurança instalados no vaso de pressão?', opcoes: OPCOES_SIM_NAO },
  {
    id: 'chk-lacre-psv',
    texto:
      'O vaso de pressão possui dispositivo físico ou lacre com aviso de advertência para evitar o bloqueio da válvula de segurança ou outro dispositivo de segurança?',
    opcoes: OPCOES_SIM_NAO,
  },
  { id: 'chk-vacuo', texto: 'O vaso de pressão trabalha em condição de vácuo?', opcoes: OPCOES_SIM_NAO },
  { id: 'chk-quebra-vacuo', texto: 'Possui quebra-vácuo?', opcoes: OPCOES_SIM_NAO },
  { id: 'chk-psv-ok', texto: 'Foram examinadas todas as válvulas de segurança exigidas?', opcoes: OPCOES_SIM_NAO_NA },
  { id: 'chk-anomalia', texto: 'Foi observada alguma anomalia?', opcoes: OPCOES_SIM_NAO },
];

const SECAO_FINAL: Pergunta[] = [
  {
    id: 'chk-inst-ok',
    texto: 'Os instrumentos e controles de vasos de pressão são mantidos em boas condições operacionais?',
    opcoes: OPCOES_SIM_NAO_NA,
  },
  { id: 'chk-ensaios-compl', texto: 'Foram realizados ensaios complementares?', opcoes: OPCOES_SIM_NAO },
];

const INSTRUMENTOS = [
  { id: 'inst-man', calId: 'inst-man-cal', nome: 'Manômetro' },
  { id: 'inst-term', calId: 'inst-term-cal', nome: 'Termômetro' },
  { id: 'inst-vac', calId: 'inst-vac-cal', nome: 'Vacuômetro' },
  { id: 'inst-press', calId: 'inst-press-cal', nome: 'Pressostato' },
  { id: 'inst-trans', calId: 'inst-trans-cal', nome: 'Transmissor de pressão' },
];

type Foto = { base64: string; descricao: string };

interface DadosChecklist {
  dataInspecao: string;
  inspetor: string;
  respostas: Record<string, string>;
  instrumentos: Record<string, boolean>;
  // Dois grupos de foto distintos: `fotosDocumentacao` vira a folha "Fotos da Documentação"
  // (FOTOS-DOCUMENTACAO.html) e `fotos` vira "Fotos do Checklist" (CHECKLIST-FOTOS.html).
  fotosDocumentacao: Foto[];
  fotos: Foto[];
}

function dadosPadrao(): DadosChecklist {
  return {
    dataInspecao: new Date().toISOString().split('T')[0],
    inspetor: '',
    respostas: {},
    instrumentos: {},
    fotosDocumentacao: [],
    fotos: [],
  };
}

// Em nível de módulo (não dentro do render) para não recriar o componente a cada render,
// o que reiniciaria o estado aberto/fechado do <details>.
function Secao({
  titulo,
  perguntas,
  aberta,
  respostas,
  onResposta,
}: {
  titulo: string;
  perguntas: Pergunta[];
  aberta?: boolean;
  respostas: Record<string, string>;
  onResposta: (id: string, valor: string) => void;
}) {
  return (
    <details className="formulario-secao-collapse" open={aberta}>
      <summary>{titulo}</summary>
      <div className="formulario-secao-collapse-body">
        {perguntas.map((p) => (
          <div key={p.id} className="pergunta-checklist">
            <label>{p.texto}</label>
            <select value={respostas[p.id] ?? ''} onChange={(e) => onResposta(p.id, e.target.value)}>
              <option value="">Selecione...</option>
              {p.opcoes.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </details>
  );
}

export default function FormularioChecklist({ tag, containerId }: { tag: string; containerId: string }) {
  const [dados, setDados] = useState<DadosChecklist>(
    // Merge com o padrão pra inspeções antigas (sem `fotosDocumentacao`) não quebrarem.
    () => ({ ...dadosPadrao(), ...(carregarDadosFormulario<DadosChecklist>(tag, containerId, 'checklist') ?? {}) }),
  );
  useAutosaveFormulario(tag, containerId, 'checklist', dados);
  const [salvando, setSalvando] = useState(false);
  const [salvoOk, setSalvoOk] = useState(false);
  const [erroSalvar, setErroSalvar] = useState(false);
  const inputFotoRef = useRef<HTMLInputElement>(null);
  const inputFotoDocRef = useRef<HTMLInputElement>(null);

  function setResposta(id: string, valor: string) {
    setDados((d) => ({ ...d, respostas: { ...d.respostas, [id]: valor } }));
  }

  function setInstrumento(id: string, valor: boolean) {
    setDados((d) => ({ ...d, instrumentos: { ...d.instrumentos, [id]: valor } }));
  }

  type CampoFoto = 'fotos' | 'fotosDocumentacao';

  async function adicionarFoto(campo: CampoFoto, e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    const base64 = await comprimirImagem(arquivo, 800);
    setDados((d) => ({ ...d, [campo]: [...d[campo], { base64, descricao: '' }] }));
  }

  function setDescricaoFoto(campo: CampoFoto, idx: number, desc: string) {
    setDados((d) => ({ ...d, [campo]: d[campo].map((f, i) => (i === idx ? { ...f, descricao: desc } : f)) }));
  }

  function removerFoto(campo: CampoFoto, idx: number) {
    setDados((d) => ({ ...d, [campo]: d[campo].filter((_, i) => i !== idx) }));
  }

  async function salvar() {
    setSalvando(true);
    setErroSalvar(false);
    try {
      await salvarDadosFormulario(tag, containerId, 'checklist', dados);
      setSalvoOk(true);
      setTimeout(() => setSalvoOk(false), 2500);
    } catch {
      // Falha ao salvar (ex.: cota do localStorage estourada por excesso de fotos) precisa avisar
      // o usuário — senão ele acha que salvou e perde o preenchimento.
      setErroSalvar(true);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <div className="formulario-secao">
        <h3>Dados Gerais</h3>
        <div className="form-grid">
          <label>
            T.A.G. do Equipamento
            <input type="text" value={tag} disabled />
          </label>
          <label>
            Data da Inspeção
            <input type="date" value={dados.dataInspecao} onChange={(e) => setDados((d) => ({ ...d, dataInspecao: e.target.value }))} />
          </label>
          <label>
            Inspecionado Por (PH ou Inspetor)
            <input type="text" value={dados.inspetor} onChange={(e) => setDados((d) => ({ ...d, inspetor: e.target.value }))} />
          </label>
        </div>
      </div>

      <Secao titulo="5.1 Verificação da Documentação Existente" perguntas={SECAO_DOCUMENTACAO} aberta respostas={dados.respostas} onResposta={setResposta} />
      <Secao titulo="5.2 Resultados da Inspeção" perguntas={SECAO_RESULTADOS_GERAIS} respostas={dados.respostas} onResposta={setResposta} />
      <Secao titulo="Exame do Prontuário e Registro de Segurança" perguntas={SECAO_PRONTUARIO} respostas={dados.respostas} onResposta={setResposta} />
      <Secao titulo="Exame Externo" perguntas={SECAO_EXAME_EXTERNO} respostas={dados.respostas} onResposta={setResposta} />
      <Secao titulo="Exame Interno" perguntas={SECAO_EXAME_INTERNO} respostas={dados.respostas} onResposta={setResposta} />
      <Secao titulo="Ensaio Hidrostático" perguntas={SECAO_TH} respostas={dados.respostas} onResposta={setResposta} />

      <details className="formulario-secao-collapse">
        <summary>Instrumentos de Controle Instalados</summary>
        <div className="formulario-secao-collapse-body">
          {INSTRUMENTOS.map((i) => (
            <div key={i.id} className="instrumento-item">
              <label>
                <input type="checkbox" checked={!!dados.instrumentos[i.id]} onChange={(e) => setInstrumento(i.id, e.target.checked)} />
                {i.nome}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={!!dados.instrumentos[i.calId]}
                  onChange={(e) => setInstrumento(i.calId, e.target.checked)}
                />
                Calibrado dentro da validade
              </label>
            </div>
          ))}
          <div className="instrumento-item">
            <label>
              <input
                type="checkbox"
                checked={!!dados.instrumentos['inst-nenhum']}
                onChange={(e) => setInstrumento('inst-nenhum', e.target.checked)}
              />
              Não possui nenhum instrumento de controle
            </label>
          </div>
          {SECAO_FINAL.map((p) => (
            <div key={p.id} className="pergunta-checklist">
              <label>{p.texto}</label>
              <select value={dados.respostas[p.id] ?? ''} onChange={(e) => setResposta(p.id, e.target.value)}>
                <option value="">Selecione...</option>
                {p.opcoes.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </details>

      <div className="formulario-secao">
        <h3>Registro Fotográfico da Documentação</h3>
        <input ref={inputFotoDocRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => adicionarFoto('fotosDocumentacao', e)} />
        <div className="fotos-formulario-grid">
          {dados.fotosDocumentacao.map((foto, idx) => (
            <div key={idx} className="foto-formulario-item">
              <img src={foto.base64} alt={`Foto documentação ${idx + 1}`} />
              <input
                type="text"
                value={foto.descricao}
                placeholder="Descrição da foto..."
                onChange={(e) => setDescricaoFoto('fotosDocumentacao', idx, e.target.value)}
              />
              <button
                type="button"
                onClick={() => removerFoto('fotosDocumentacao', idx)}
                style={{ width: '100%', border: 'none', background: '#fee2e2', color: '#b91c1c', padding: '6px', fontSize: 12, cursor: 'pointer' }}
              >
                Remover
              </button>
            </div>
          ))}
          <button type="button" className="btn-add-foto" onClick={() => inputFotoDocRef.current?.click()}>
            + Adicionar Foto
          </button>
        </div>
      </div>

      <div className="formulario-secao">
        <h3>Registro Fotográfico do Checklist</h3>
        <input ref={inputFotoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => adicionarFoto('fotos', e)} />
        <div className="fotos-formulario-grid">
          {dados.fotos.map((foto, idx) => (
            <div key={idx} className="foto-formulario-item">
              <img src={foto.base64} alt={`Foto ${idx + 1}`} />
              <input
                type="text"
                value={foto.descricao}
                placeholder="Descrição da foto..."
                onChange={(e) => setDescricaoFoto('fotos', idx, e.target.value)}
              />
              <button
                type="button"
                onClick={() => removerFoto('fotos', idx)}
                style={{ width: '100%', border: 'none', background: '#fee2e2', color: '#b91c1c', padding: '6px', fontSize: 12, cursor: 'pointer' }}
              >
                Remover
              </button>
            </div>
          ))}
          <button type="button" className="btn-add-foto" onClick={() => inputFotoRef.current?.click()}>
            + Adicionar Foto
          </button>
        </div>
      </div>

      <div className="formulario-acoes-fixas">
        <button
          type="button"
          className="btn-primario"
          onClick={salvar}
          disabled={salvando}
          style={salvoOk ? { background: '#16a34a' } : undefined}
        >
          {salvando ? 'Salvando...' : salvoOk ? 'Salvo!' : 'Salvar Checklist'}
        </button>
        {erroSalvar && (
          <div style={{ color: '#dc2626', fontSize: 13, marginTop: 8, fontWeight: 600 }}>
            Falha ao salvar. Verifique o espaço de armazenamento (muitas fotos?) e tente novamente.
          </div>
        )}
      </div>
    </>
  );
}
