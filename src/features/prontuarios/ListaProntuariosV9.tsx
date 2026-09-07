/**
 * A lista canônica de `/prontuarios` — uma linha por DOCUMENTO.
 *
 * ## O que ela substitui
 *
 * `CatalogoProntuariosV9` em `modo="lista"` mostrava um EQUIPAMENTO por linha,
 * com um selo "Prontuário OK". Um equipamento com três revisões emitidas era
 * uma linha só, e as duas revisões anteriores — documentos assinados, com
 * `pdfRef` e SHA-256 próprios — não tinham onde ser vistas. Aquele componente
 * continua existindo e continua servindo ao que ele sempre foi bom: escolher um
 * EQUIPAMENTO, que é o passo 1 da criação, dentro do modal.
 *
 * ## De onde vêm as linhas
 *
 * De `indiceProntuarios` — uma chave global e leve que sincroniza pela v2. Ver
 * o cabeçalho daquele arquivo para o porquê de não ser varredura nem projeção.
 *
 * ## O que esta tela NÃO faz
 *
 * Não toca PDF. As linhas trazem `temArquivo`, um booleano; o arquivo só é
 * resolvido quando o usuário clica em abrir. É a mesma regra bloqueante de
 * `/relatorios`.
 */
import { useEffect, useMemo, useState } from 'react';
import BuscaLista from '../../components/BuscaLista';
import ListaVirtualizada from '../../components/ListaVirtualizada';
import { Icone } from '../../components/Icone';
import {
  filtrarDocumentos,
  listarDocumentos,
  reconciliar,
  type DocumentoProntuario,
} from './indiceProntuarios';
import ModalFiltrosDocumentos, {
  FILTRO_DOC_VAZIO,
  passaNoFiltro,
  temFiltroDoc,
  type FiltroDocumentos,
} from './ModalFiltrosDocumentos';
import { listarClientes } from '../cadastros/cadastroService';
import '../../pages/prontuarios.css';

/** Altura estimada da linha; corrigida por medição no primeiro quadro. */
const ALT_LINHA = 46;

/** `AAAA-MM-DD…` → `DD/MM/AAAA`. Vazio vira travessão. */
export function dataDoc(iso: string | null | undefined): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}

/** O rótulo da revisão. O rascunho não tem número: ele ainda não é revisão. */
export function rotuloRevisao(d: Pick<DocumentoProntuario, 'situacao' | 'revisao'>): string {
  if (d.situacao === 'rascunho') return '—';
  return d.revisao ? `Rev. ${String(d.revisao).padStart(2, '0')}` : '—';
}

export interface PropsListaProntuarios {
  /** Abrir o documento: emitido serve o arquivo; rascunho continua a edição. */
  aoAbrir: (doc: DocumentoProntuario) => void;
  /** O "+ Criar prontuário" do pai, à direita da barra. */
  acoes?: React.ReactNode;
  /** Recarrega quando o pai muda (salvou, emitiu, excluiu). */
  versao?: number;
}

export default function ListaProntuariosV9({ aoAbrir, acoes, versao = 0 }: PropsListaProntuarios) {
  const [docs, setDocs] = useState<DocumentoProntuario[]>(() => listarDocumentos());
  const [termo, setTermo] = useState('');
  const [f, setF] = useState<FiltroDocumentos>(FILTRO_DOC_VAZIO);
  const [filtroAberto, setFiltroAberto] = useState(false);

  /**
   * A reconciliação roda uma vez, ao montar: ela é o que faz o índice nascer
   * preenchido para quem já usava o sistema antes de ele existir. Só
   * ACRESCENTA, então rodar de novo não custa nada além da leitura.
   */
  useEffect(() => {
    let vivo = true;
    void reconciliar().then((n) => {
      if (vivo && n > 0) setDocs(listarDocumentos());
    });
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    setDocs(listarDocumentos());
  }, [versao]);

  /* Os clientes CADASTRADOS — é deles que sai a logo do filtro. A lista é
     lida uma vez; ela é pequena e local. */
  const clientes = useMemo(() => listarClientes(), []);

  const visiveis = useMemo(
    () => filtrarDocumentos(docs, termo).filter((d) => passaNoFiltro(d, f)),
    [docs, termo, f],
  );

  return (
    <>
      {/* BARRA · filtro · busca · criar, numa linha só. */}
      <BuscaLista
        valor={termo}
        aoMudar={setTermo}
        placeholder="Buscar por TAG, equipamento, cliente ou nº do documento…"
        contagem={{ total: visiveis.length, exato: true }}
        compacto
        antes={
          <button
            type="button"
            className={`fj-btn fj-btn-ghost pront-btn-filtro${temFiltroDoc(f) ? ' filtro-ativo' : ''}`}
            aria-haspopup="dialog"
            onClick={() => setFiltroAberto(true)}
          >
            <Icone nome="filter" tam={14} /> <span className="pront-btn-rotulo">Filtrar</span>
          </button>
        }
      >
        {acoes}
      </BuscaLista>

      {filtroAberto && (
        <ModalFiltrosDocumentos
          valores={f}
          docs={docs}
          clientes={clientes}
          aoAplicar={(v) => {
            setF(v);
            setFiltroAberto(false);
          }}
          aoFechar={() => setFiltroAberto(false)}
        />
      )}

      {visiveis.length === 0 ? (
        <VazioProntuarios temFiltro={!!termo || temFiltroDoc(f)} />
      ) : (
        <div className="bloco-dados painel-lista">
          {/* Mesmo cabeçalho de /relatorios: filete âmbar, nome da seção e a
              contagem. É o idioma que o sistema já usa em `.bloco-dados h3` e
              no `fj-panel-head` — nada de vocabulário novo. */}
          <div className="painel-lista-head" role="presentation">
            <span className="painel-lista-titulo">
              <strong>Prontuários e revisões</strong>
              <span>Cada linha é um documento — rascunho ou revisão emitida</span>
            </span>
            <span className="painel-lista-contagem">
              {visiveis.length} {visiveis.length === 1 ? 'linha' : 'linhas'}
            </span>
          </div>
          <div className="pront-linha pront-linha-cabecalho" role="row" aria-hidden>
            <span />
            <span>Documento</span>
            <span>TAG</span>
            <span>Cliente</span>
            <span>Revisão</span>
            <span>Data</span>
            <span>Situação</span>
            <span className="pront-col-acoes">Ações</span>
          </div>
          <ListaVirtualizada
            itens={visiveis}
            chaveDe={(d) => d.id}
            alturaEstimada={ALT_LINHA}
            classeGrade="pront-lista"
            chaveDoConjunto={`${termo}|${JSON.stringify(f)}`}
            desenhar={(d) => <LinhaDocumento doc={d} aoAbrir={aoAbrir} />}
          />
        </div>
      )}
    </>
  );
}

function LinhaDocumento({
  doc,
  aoAbrir,
}: {
  doc: DocumentoProntuario;
  aoAbrir: (d: DocumentoProntuario) => void;
}) {
  const emitido = doc.situacao === 'emitido';
  const nome = doc.equipamento?.trim() || doc.tag;
  return (
    <div className={`pront-linha pront-linha-${doc.situacao}`} role="row">
      <span className="pront-linha-icone" aria-hidden>
        <Icone nome={emitido ? 'filetext' : 'pencil'} tam={15} />
      </span>
      <span className="pront-linha-nome" title={nome}>
        <strong>{nome}</strong>
        <span className="pront-linha-sub">{doc.numero ?? 'sem número'}</span>
      </span>
      <span className="pront-linha-col">{doc.tag}</span>
      <span className="pront-linha-col" title={doc.cliente ?? ''}>{doc.cliente ?? '—'}</span>
      <span className="pront-linha-col pront-linha-data">{rotuloRevisao(doc)}</span>
      <span className="pront-linha-col pront-linha-data">{dataDoc(doc.atualizadoEm)}</span>
      <span className="pront-linha-situacao">
        <span className={`pront-selo pront-selo-${doc.situacao}`}>
          {emitido ? 'EMITIDO' : 'RASCUNHO'}
        </span>
        {/* Upload ainda não confirmado: a lista precisa poder dizer isso, senão
            o documento parece entregue e está só no aparelho. */}
        {doc.pdfPendente && (
          <span className="pront-selo pront-selo-pendente" title="O arquivo ainda não subiu para o servidor">
            NO APARELHO
          </span>
        )}
      </span>
      <span className="pront-linha-acoes">
        <button
          type="button"
          className="btn-icone cor-azul"
          title={emitido ? 'Abrir o documento emitido' : 'Continuar editando'}
          aria-label={`${emitido ? 'Abrir' : 'Continuar'} o prontuário de ${doc.tag}`}
          onClick={() => aoAbrir(doc)}
        >
          <Icone nome={emitido ? 'eye' : 'pencil'} tam={14} />
        </button>
      </span>
    </div>
  );
}

/**
 * O estado vazio.
 *
 * Ilustração leve, desenhada em SVG no próprio componente — sem arquivo, sem
 * dependência e sem requisição. Ela existe para a primeira visita não ser uma
 * tela em branco; some assim que houver um documento, e não aparece quando o
 * vazio é resultado de um filtro (aí o que falta é dizer que o filtro escondeu
 * tudo, não ensinar o que é a tela).
 */
function VazioProntuarios({ temFiltro }: { temFiltro: boolean }) {
  if (temFiltro) {
    return (
      <p className="dashboard-vazio">
        Nenhum documento encontrado com esses critérios.
      </p>
    );
  }
  return (
    <div className="pront-vazio">
      <IlustracaoProntuario />
      <h3>Nenhum prontuário ainda</h3>
      <p>
        O prontuário reúne os dados construtivos do equipamento — projeto, materiais, dimensões e o
        croqui — num documento único. Comece escolhendo o equipamento em <b>“+ Criar prontuário”</b>:
        o que você preencher fica salvo como rascunho e pode ser retomado depois, de qualquer
        aparelho. Quando estiver pronto, <b>emitir</b> gera o PDF definitivo com código de
        verificação.
      </p>
    </div>
  );
}

/** Um vaso esquemático com a folha do documento ao lado. Duas cores do tema. */
export function IlustracaoProntuario() {
  return (
    <svg
      className="pront-ilustra"
      viewBox="0 0 220 120"
      role="img"
      aria-label="Ilustração de um equipamento e do seu prontuário"
    >
      <rect x="12" y="34" width="96" height="52" rx="26" className="il-traco" />
      <path d="M12 60h96" className="il-guia" />
      <path d="M34 34v52M86 34v52" className="il-guia" />
      <rect x="52" y="18" width="16" height="16" rx="3" className="il-traco" />
      <path d="M60 18v-8" className="il-guia" />
      <rect x="128" y="16" width="76" height="88" rx="6" className="il-traco il-papel" />
      <path d="M142 36h48M142 50h48M142 64h32" className="il-linha" />
      <rect x="142" y="76" width="48" height="16" rx="3" className="il-marca" />
    </svg>
  );
}
