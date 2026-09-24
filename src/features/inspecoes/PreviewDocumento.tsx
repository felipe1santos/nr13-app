import { useEffect, useState } from 'react';
import PaginaA4 from '../../components/PaginaA4';
import RecusaPalco from '../../components/RecusaPalco';
import { VisualizadorPdfBytes, abrirPdfEmAba, baixarPdfDeBytes } from '../../components/VisualizadorPdf';
import { gerarDocumentoImagens } from './documentoImagens';
import { pendenciasParaEmissao } from './fotosDescritas';
import { textoDoErro } from '../../services/textoDoErro';
import { usePalcoDocumento } from '../documentos/usePalcoDocumento';
import { carregarContainer } from './inspecaoService';
import { DOCS_POR_FORMULARIO, ROTULO_FORMULARIO, type FormularioEnsaio } from './tipos';
import { gerarDocumentoDoEnsaio, temDocumentoVetorial } from './documentoVetorial';
import { gravarInspecaoOrigemAtual, gravarMetaAtual } from '../relatorios/relatoriosService';
import type { RelatorioMeta } from '../relatorios/tipos';

/**
 * A FOLHA DO RELATÓRIO daquele ensaio, montada com os dados de campo.
 *
 * ## 21/09/2026 · é o documento do relatório, não um parecido com ele
 *
 * Esta tela montava os templates HTML de `public/arquivos-inspecao/` em iframes,
 * enquanto o relatório final desenha as mesmas folhas pelo motor VETORIAL. Eram
 * dois desenhos e duas leituras do mesmo dado: na medição de espessura, o
 * template antigo imprimia `0,00` onde nada foi medido e rotulava as colunas
 * como P1/P2/P3, e o relatório imprimia travessão e os ângulos reais. O técnico
 * conferia uma coisa em campo e o cliente recebia outra.
 *
 * Agora o ensaio com folha vetorial (`temDocumentoVetorial`) é gerado pelo
 * MESMO gerador do relatório, com a composição reduzida às folhas daquele
 * ensaio — ver `documentoVetorial.ts`. O que aparece aqui são os bytes que o
 * relatório produziria para essas folhas.
 *
 * ## O caminho antigo continua, e para quem ele é
 *
 * `manometro` e `psv` são folhas de CALIBRAÇÃO: não têm equivalente vetorial
 * por decisão de arquitetura (§7-septies), porque o certificado é montado num
 * host isolado e rasterizado individualmente. Para eles, os iframes seguem
 * sendo o desenho correto — e por isso o componente do palco ficou inteiro.
 *
 * ## O que ela NÃO é
 *
 * Não é o documento emitido: sem número, sem assinatura, sem PDF arquivado, sem
 * histórico. O rodapé do modal diz isso.
 */
export default function PreviewDocumento({
  tag,
  containerId,
  formulario,
}: {
  tag: string;
  containerId: string;
  formulario: FormularioEnsaio;
}) {
  if (formulario === 'imagens') {
    return <DocumentoImagens tag={tag} containerId={containerId} />;
  }
  if (temDocumentoVetorial(formulario)) {
    return <DocumentoVetorial tag={tag} containerId={containerId} formulario={formulario} />;
  }
  return <DocumentoEmIframes tag={tag} containerId={containerId} formulario={formulario} />;
}

/**
 * Fase 5 · o RELATÓRIO DE IMAGENS — documento avulso com gerador próprio
 * (`documentoImagens.ts`).
 *
 * Visualizar é sempre possível, inclusive com o rascunho incompleto: o técnico
 * precisa ver como está ficando. Baixar e Imprimir são a EMISSÃO do avulso e
 * exigem ao menos uma imagem e todas descritas (`pendenciasParaEmissao`);
 * enquanto faltar, os botões ficam desligados e a tela diz o que falta.
 */
function DocumentoImagens({ tag, containerId }: { tag: string; containerId: string }) {
  const chave = `${tag}|${containerId}|imagens`;
  const [res, setRes] = useState<{
    chave: string;
    bytes?: Uint8Array;
    paginas?: number;
    erro?: string;
  } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const container = carregarContainer(tag, containerId);
  const pendencias = pendenciasParaEmissao((container?.dados.imagens as { fotos?: unknown } | undefined)?.fotos);

  useEffect(() => {
    let vivo = true;
    void gerarDocumentoImagens(tag, containerId)
      .then((r) => {
        if (vivo) setRes({ chave, bytes: r.bytes, paginas: r.paginas });
      })
      .catch((e) => {
        if (vivo) setRes({ chave, erro: textoDoErro(e) });
      });
    return () => {
      vivo = false;
    };
  }, [tag, containerId, chave]);

  if (res?.chave !== chave) return <p className="prevdoc-aviso">Montando documento…</p>;
  if (res.erro || !res.bytes) {
    return <p className="prevdoc-aviso">Não foi possível montar o documento. {res.erro ?? ''}</p>;
  }
  const bytes = res.bytes;
  const nome = `${tag} — Relatório de Imagens.pdf`;
  const bloqueado = pendencias.length > 0;
  const motivo = bloqueado ? `Para emitir: ${pendencias.map((p) => p.mensagem).join(' ')}` : undefined;

  return (
    <>
      {bloqueado && (
        <p className="prevdoc-aviso" role="status" data-teste="imagens-pendencias">
          {motivo}
        </p>
      )}
      {aviso && (
        <p className="prevdoc-aviso" role="status">
          {aviso}
        </p>
      )}
      <VisualizadorPdfBytes
        bytes={bytes}
        paginas={res.paginas ?? 1}
        nomeArquivo={nome}
        selo={bloqueado ? 'Rascunho — faltam itens para emitir' : 'Documento avulso — não arquivado'}
        extras={
          <>
            <button
              type="button"
              className="vpdf-btn"
              disabled={bloqueado}
              title={motivo ?? 'Baixar o PDF'}
              data-teste="imagens-baixar"
              onClick={() => baixarPdfDeBytes(bytes, nome)}
            >
              Baixar
            </button>
            <button
              type="button"
              className="vpdf-btn"
              disabled={bloqueado}
              title={motivo ?? 'Abrir o PDF para imprimir'}
              data-teste="imagens-imprimir"
              onClick={() => {
                // Imprimir = abrir o PDF no leitor do navegador, que imprime
                // exatamente estes bytes. Bloqueador de pop-up → baixa.
                if (!abrirPdfEmAba(bytes)) {
                  baixarPdfDeBytes(bytes, nome);
                  setAviso('O navegador bloqueou a nova aba; o PDF foi baixado para imprimir.');
                }
              }}
            >
              Imprimir
            </button>
          </>
        }
      />
    </>
  );
}

/** O ensaio desenhado pelo motor do relatório. */
function DocumentoVetorial({
  tag,
  containerId,
  formulario,
}: {
  tag: string;
  containerId: string;
  formulario: FormularioEnsaio;
}) {
  /**
   * O resultado carrega a CHAVE do ensaio que o produziu.
   *
   * Marcador, não booleano: trocando de ensaio a chave muda e "ainda não
   * gerado" passa a ser uma derivação do render, sem `setState` no corpo do
   * efeito — que é render duplicado no mount, e é o que o lint barra. Mesmo
   * desenho do `gravadoPara` que o caminho dos iframes já usava.
   */
  const chave = `${tag}|${containerId}|${formulario}`;
  const [res, setRes] = useState<{
    chave: string;
    bytes?: Uint8Array;
    paginas?: number;
    erro?: string;
  } | null>(null);

  useEffect(() => {
    let vivo = true;
    void gerarDocumentoDoEnsaio(tag, containerId, formulario)
      .then((r) => {
        if (vivo) setRes({ chave, bytes: r.bytes, paginas: r.paginas });
      })
      .catch((e) => {
        if (vivo) setRes({ chave, erro: textoDoErro(e) });
      });
    return () => {
      vivo = false;
    };
  }, [tag, containerId, formulario, chave]);

  const pronto = res?.chave === chave;
  if (!pronto) return <p className="prevdoc-aviso">Montando documento…</p>;
  if (res.erro || !res.bytes) {
    return <p className="prevdoc-aviso">Não foi possível montar o documento. {res.erro ?? ''}</p>;
  }
  const doc = { bytes: res.bytes, paginas: res.paginas ?? 1 };

  return (
    <VisualizadorPdfBytes
      bytes={doc.bytes}
      paginas={doc.paginas}
      nomeArquivo={`${tag} — ${ROTULO_FORMULARIO[formulario] ?? formulario}.pdf`}
      selo="Prévia — não é o documento emitido"
    />
  );
}

/**
 * O caminho dos TEMPLATES em iframe — hoje só para as folhas de calibração.
 *
 * ## Duas etapas, e a ordem entre elas é o ponto
 *
 * Os templates leem os dados direto do `localStorage` no `DOMContentLoaded`
 * (§2 do CLAUDE.md) — eles não recebem props. E na v2 o `localStorage` é só o
 * **PALCO** (§2-ter): as chaves só existem ali enquanto o documento está
 * aberto, materializadas por `usePalcoDocumento`.
 *
 * Então: **gravar** as chaves e só então **montar o palco** e os iframes.
 * Inverter isso foi o defeito de 13/09/2026 — o palco era montado com o valor
 * anterior da chave e a folha saía com "--" em todos os campos, **sem erro
 * nenhum**, que é o pior tipo de falha deste sistema.
 */
function DocumentoEmIframes({
  tag,
  containerId,
  formulario,
}: {
  tag: string;
  containerId: string;
  formulario: FormularioEnsaio;
}) {
  const docs = DOCS_POR_FORMULARIO[formulario] ?? [];
  /**
   * Para QUAL ensaio as chaves de injeção já foram gravadas.
   *
   * Marcador, não booleano: trocando de ensaio a chave muda e a gravação volta
   * a ser pendente por derivação, sem `setState` no corpo do efeito.
   */
  const chave = `${tag}|${containerId}|${formulario}`;
  const [gravadoPara, setGravadoPara] = useState<string | null>(null);
  const gravado = gravadoPara === chave;

  useEffect(() => {
    let vivo = true;
    const container = carregarContainer(tag, containerId);
    void Promise.all([
      gravarInspecaoOrigemAtual(container?.dados ?? {}),
      // A meta vai VAZIA: `nr13_relatorio_meta_atual` é chave viva e
      // compartilhada, e sem zerá-la o cabeçalho sairia com o código e os
      // assinantes do último relatório aberto no visualizador.
      gravarMetaAtual({} as RelatorioMeta),
    ]).then(() => {
      if (vivo) setGravadoPara(chave);
    });
    return () => {
      vivo = false;
    };
  }, [tag, containerId, chave]);

  if (docs.length === 0) {
    return <p className="prevdoc-aviso">Pré-visualização não disponível para este tipo.</p>;
  }
  if (!gravado) return <p className="prevdoc-aviso">Montando documento…</p>;

  return <Encenado tag={tag} containerId={containerId} docs={docs} />;
}

/**
 * O palco e os iframes.
 *
 * Componente separado de propósito: `usePalcoDocumento` materializa as chaves
 * na MONTAGEM, e montá-lo só depois de a gravação confirmar é o que garante que
 * ele encene o dado deste container, e não o que estava lá antes.
 */
function Encenado({ tag, containerId, docs }: { tag: string; containerId: string; docs: string[] }) {
  // O "id do relatório" aqui é o do container: o palco usa isso para saber qual
  // documento está aberto e para a trava de dono por aba (`palcoTrava`).
  const palco = usePalcoDocumento(tag, containerId);

  if (palco.estado !== 'pronto') {
    return <RecusaPalco estado={palco.estado} falha={palco.falha} />;
  }

  return (
    <div className="relatorio-preview">
      {docs.map((doc, i) => {
        const sep = doc.includes('?') ? '&' : '?';
        return (
          <PaginaA4 key={`${doc}-${i}`}>
            <iframe
              src={`/arquivos-inspecao/${doc}${sep}tag=${encodeURIComponent(tag)}&page=${i + 1}${palco.paramsIframe}`}
              scrolling="no"
              title={doc}
            />
          </PaginaA4>
        );
      })}
    </div>
  );
}
