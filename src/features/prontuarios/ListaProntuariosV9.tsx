/**
 * A lista canônica de `/prontuarios` — UMA LINHA POR EQUIPAMENTO (24/09/2026).
 *
 * Regra de produto: 1 equipamento = 1 prontuário vigente + histórico. A linha
 * principal mostra o VIGENTE (e o rascunho em aberto, quando há); as versões
 * anteriores ficam atrás de "Histórico (N)". O índice NÃO mudou de formato — ele
 * segue com uma linha por documento, e o agrupamento é uma PROJEÇÃO da tela,
 * feita por `agruparPorTag` com o mesmo comparador que a ficha usa.
 *
 * ## Antes (até 24/09/2026): uma linha por DOCUMENTO
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
import { agruparPorTag, type GrupoProntuario } from './prontuarioVigente';
import ModalHistoricoProntuario from './ModalHistoricoProntuario';
import { carregarEmissoes } from './emissaoProntuario';
import { bytesDaVersao } from './bytesDaVersao';
import { baixarArquivo } from './abrirArquivo';
import { emitirAviso } from '../../services/eventos';
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
  /** TAG cujo histórico está aberto (modal read-only). */
  const [historicoTag, setHistoricoTag] = useState<string | null>(null);

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

  // Busca e filtro continuam valendo por DOCUMENTO (o nº de uma revisão
  // antiga acha o equipamento); a tela mostra o GRUPO de quem passou.
  const grupos = useMemo(() => {
    const tags = new Set(filtrarDocumentos(docs, termo).filter((d) => passaNoFiltro(d, f)).map((d) => d.tag));
    return agruparPorTag(docs).filter((g) => tags.has(g.tag));
  }, [docs, termo, f]);

  return (
    <>
      {/* BARRA · filtro · busca · criar, numa linha só. */}
      <BuscaLista
        valor={termo}
        aoMudar={setTermo}
        placeholder="Buscar por TAG, equipamento, cliente ou nº do documento…"
        contagem={{ total: grupos.length, exato: true }}
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

      {grupos.length === 0 ? (
        <VazioProntuarios temFiltro={!!termo || temFiltroDoc(f)} />
      ) : (
        <div className="bloco-dados painel-lista">
          {/* Mesmo cabeçalho de /relatorios: filete âmbar, nome da seção e a
              contagem. É o idioma que o sistema já usa em `.bloco-dados h3` e
              no `fj-panel-head` — nada de vocabulário novo. */}
          <div className="painel-lista-head" role="presentation">
            <span className="painel-lista-titulo">
              <strong>Prontuários</strong>
              <span>Um prontuário vigente por equipamento; as versões anteriores ficam no histórico</span>
            </span>
            <span className="painel-lista-contagem">
              {grupos.length} {grupos.length === 1 ? 'equipamento' : 'equipamentos'}
            </span>
          </div>
          <div className="pront-linha pront-linha-cabecalho" role="row" aria-hidden>
            <span />
            <span>Prontuário vigente</span>
            <span>TAG</span>
            <span>Cliente</span>
            <span>Revisão</span>
            <span>Data</span>
            <span>Situação</span>
            <span className="pront-col-acoes">Ações</span>
          </div>
          <ListaVirtualizada
            itens={grupos}
            chaveDe={(g) => g.tag}
            alturaEstimada={ALT_LINHA}
            classeGrade="pront-lista"
            chaveDoConjunto={`${termo}|${JSON.stringify(f)}`}
            desenhar={(g) => <LinhaGrupo grupo={g} aoAbrir={aoAbrir} aoVerHistorico={setHistoricoTag} />}
          />
        </div>
      )}

      {historicoTag && <ModalHistoricoProntuario tag={historicoTag} aoFechar={() => setHistoricoTag(null)} />}
    </>
  );
}

/** Baixa o vigente: resolve a emissão pelo id (cache ou leitura dirigida). */
async function baixarDocumento(doc: DocumentoProntuario) {
  try {
    const lista = await carregarEmissoes(doc.tag);
    const e = lista.find((x) => x.id === doc.id);
    if (!e) throw new Error('O registro deste documento não chegou a este aparelho. Verifique a conexão e tente de novo.');
    const { blob, nome } = await bytesDaVersao({ origem: e.origem === 'anexado' ? 'anexado' : 'gerado', emissao: e }, doc.tag);
    baixarArquivo(blob, nome);
  } catch (err) {
    emitirAviso({
      variante: 'erro',
      titulo: 'Não foi possível baixar o PDF',
      texto: err instanceof Error ? err.message : 'Tente novamente em instantes.',
    });
  }
}

function LinhaGrupo({
  grupo,
  aoAbrir,
  aoVerHistorico,
}: {
  grupo: GrupoProntuario;
  aoAbrir: (d: DocumentoProntuario) => void;
  aoVerHistorico: (tag: string) => void;
}) {
  const { vigente, rascunho, historico, tag } = grupo;
  // Sem vigente, a linha é do rascunho — o equipamento continua aparecendo.
  const principal = (vigente ?? rascunho)!;
  const anexado = vigente?.origem === 'anexado';
  const nome = principal.equipamento?.trim() || tag;
  const situacao = vigente ? 'emitido' : 'rascunho';
  return (
    <div className={`pront-linha pront-linha-${situacao}`} role="row" data-teste="linha-prontuario">
      <span className="pront-linha-icone" aria-hidden>
        <Icone nome={!vigente ? 'pencil' : anexado ? 'pdf' : 'filetext'} tam={15} />
      </span>
      <span className="pront-linha-nome" title={nome}>
        <strong>{nome}</strong>
        <span className="pront-linha-sub">
          {vigente ? ((anexado ? vigente.arquivoNome : null) ?? vigente.numero ?? 'sem número') : 'ainda não emitido'}
        </span>
      </span>
      {/* `display: contents` no desktop (cada campo na sua coluna); no celular
          vira UMA linha — os quatro na mesma área da grade se sobrepunham. */}
      <span className="pront-linha-meta">
        <span className="pront-linha-col">{tag}</span>
        <span className="pront-linha-col" title={principal.cliente ?? ''}>{principal.cliente ?? '—'}</span>
        <span className="pront-linha-col pront-linha-data">{vigente ? rotuloRevisao(vigente) : '—'}</span>
        <span className="pront-linha-col pront-linha-data">{dataDoc(principal.atualizadoEm)}</span>
      </span>
      <span className="pront-linha-situacao">
        {vigente ? (
          <span className={`pront-selo ${anexado ? 'pront-selo-anexado' : 'pront-selo-emitido'}`}>
            {anexado ? 'PDF ANEXADO' : 'EMITIDO'}
          </span>
        ) : null}
        {/* Rascunho é trabalho em aberto: NÃO substitui o vigente, só avisa. */}
        {rascunho && <span className="pront-selo pront-selo-rascunho">RASCUNHO</span>}
        {vigente?.pdfPendente && (
          <span className="pront-selo pront-selo-pendente" title="O arquivo ainda não subiu para o servidor">
            NO APARELHO
          </span>
        )}
      </span>
      <span className="pront-linha-acoes">
        {vigente && (
          <>
            <button
              type="button"
              className="btn-icone cor-azul"
              title={anexado ? 'Abrir o PDF anexado' : 'Abrir o documento emitido'}
              aria-label={`Abrir o prontuário vigente de ${tag}`}
              onClick={() => aoAbrir(vigente)}
            >
              <Icone nome="eye" tam={14} />
            </button>
            <button
              type="button"
              className="btn-icone cor-azul"
              title="Baixar o PDF"
              aria-label={`Baixar o prontuário vigente de ${tag}`}
              onClick={() => void baixarDocumento(vigente)}
            >
              <Icone nome="download" tam={14} />
            </button>
          </>
        )}
        {rascunho && (
          <button
            type="button"
            className="btn-icone cor-azul"
            title={vigente ? 'Continuar a nova revisão' : 'Continuar editando'}
            aria-label={`Continuar o prontuário de ${tag}`}
            onClick={() => aoAbrir(rascunho)}
          >
            <Icone nome="pencil" tam={14} />
          </button>
        )}
        {historico.length > 0 && (
          <button
            type="button"
            className="btn-icone cor-azul pront-btn-historico"
            title={`Ver histórico (${historico.length})`}
            aria-label={`Ver o histórico do prontuário de ${tag} (${historico.length} anteriores)`}
            onClick={() => aoVerHistorico(tag)}
          >
            <Icone nome="clock" tam={14} />
            <span className="pront-historico-n">{historico.length}</span>
          </button>
        )}
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
