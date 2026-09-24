import { useEffect, useState } from 'react';
import { VisualizadorPdfBytes, abrirPdfEmAba, baixarPdfDeBytes } from '../../components/VisualizadorPdf';
import { gerarDocumentoImagens } from './documentoImagens';
import { pendenciasParaEmissao } from './fotosDescritas';
import { textoDoErro } from '../../services/textoDoErro';
import { carregarContainer } from './inspecaoService';
import { ROTULO_FORMULARIO, type FormularioEnsaio } from './tipos';
import { gerarDocumentoDoEnsaio, temDocumentoVetorial } from './documentoVetorial';

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
 * ## Calibração não é ensaio de container (Fase 6, 24/09/2026)
 *
 * `manometro` e `psv` tinham aqui um caminho de templates em iframe que
 * GRAVAVA as chaves vivas do relatório em montagem (`nr13_inspecao_atual`,
 * `nr13_injecao_atual` e `nr13_relatorio_meta_atual = {}`) pelo `salvar` —
 * sincronizado com o servidor — para o template lê-las. Era o mesmo defeito que
 * a Fase 5.1 tirou dos avulsos dos ensaios, reproduzido no lab (10 mutações;
 * a meta de um relatório de outra aba virava `{}`). E era inalcançável pela
 * tela: nenhum container tem esses "ensaios" (`TipoEnsaio` não os inclui),
 * só a URL digitada `?documento=1`. O certificado de calibração se vê, emite
 * e imprime em Calibrações, pelo host isolado. Aqui fica só o aviso.
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
  return <SemDocumentoDeEnsaio formulario={formulario} />;
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
 * Formulário sem documento de ensaio (hoje: `manometro`, `psv`). Não grava
 * nada — nem as chaves vivas do relatório, nem o palco.
 */
function SemDocumentoDeEnsaio({ formulario }: { formulario: FormularioEnsaio }) {
  return (
    <p className="prevdoc-aviso" data-teste="sem-documento-de-ensaio">
      {ROTULO_FORMULARIO[formulario] ?? formulario} não tem documento de ensaio. O certificado de calibração é
      visualizado, emitido e impresso em Calibrações.
    </p>
  );
}
