import { useCallback, useEffect, useState } from 'react';
import { Icone } from '../../components/Icone';
import { VisualizadorPdfBytes } from '../../components/VisualizadorPdf';
import { textoDoErro } from '../../services/textoDoErro';
import { gerarPreviaRelatorio } from './pdfVetorial/gerarRelatorio';
import { montarModeloRelatorio } from './pdfVetorial/modelo';
import { oQueFalta, type DestinoEdicao, type ItemFaltante } from './oQueFalta';

/**
 * Fase 13D · a PRÉVIA é o documento.
 *
 * ## O que muda
 *
 * Até aqui o usuário revisava 27 folhas HTML e assinava um PDF desenhado por
 * outro caminho: o que ele via não era o que ele emitia. Este componente mostra
 * **o mesmo gerador**, em modo `preview` — mesmo layout, mesmos dados, mesma
 * paginação, com os campos vazios em amarelo-claro.
 *
 * ## Por que existe um botão, e não geração automática
 *
 * Gerar o PDF a cada tecla travaria a tela num relatório grande (o vetorial leva
 * ~1,8 s num documento completo). A prévia é gerada quando alguém pede — e,
 * enquanto houver edição mais nova que a última geração, um aviso discreto diz
 * que a prévia está atrasada. Prévia silenciosamente velha seria pior do que
 * prévia nenhuma.
 *
 * ## O que ela NÃO faz
 *
 * Não arquiva, não calcula SHA oficial, não grava `pdfRef`, não cria histórico,
 * não mexe em vencimento e não escreve no Livro. `gerarPreviaRelatorio` devolve
 * bytes e nada mais.
 */
export default function PreviaVetorial({
  tag,
  documentos,
  versaoDados,
  onIrPara,
}: {
  tag: string;
  documentos: string[];
  /** Muda a cada edição salva — é o que marca a prévia como atrasada. */
  versaoDados: number;
  onIrPara?: (destino: Exclude<DestinoEdicao, null>) => void;
}) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [paginas, setPaginas] = useState(0);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState('');
  const [faltando, setFaltando] = useState<ItemFaltante[]>([]);
  const [painelAberto, setPainelAberto] = useState(false);
  const [versaoGerada, setVersaoGerada] = useState<number | null>(null);

  const gerar = useCallback(async () => {
    setGerando(true);
    setErro('');
    try {
      const r = await gerarPreviaRelatorio(tag, documentos);
      setBytes(r.bytes);
      setPaginas(r.paginas);
      setFaltando(oQueFalta(montarModeloRelatorio(tag)));
      setVersaoGerada(versaoDados);
    } catch (e) {
      setErro(textoDoErro(e, 'Não foi possível gerar a prévia.'));
    } finally {
      setGerando(false);
    }
  }, [tag, documentos, versaoDados]);

  // Uma geração na abertura: chegar numa tela vazia com um botão "Atualizar"
  // obrigaria o usuário a pedir o que ele veio ver.
  useEffect(() => {
    void gerar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na montagem; as demais são sob demanda
  }, []);

  const atrasada = versaoGerada !== null && versaoGerada !== versaoDados;

  // Os controles da prévia moram DENTRO da barra do visualizador — é o que
  // mantém uma barra só, em vez de uma fileira nossa empilhada sobre a dele.
  const controles = (
    <>
      <button type="button" className={`vpdf-btn${gerando ? ' is-loading' : ''}`} onClick={() => void gerar()} disabled={gerando}>
        <Icone nome="sliders" tam={13} /> {gerando ? 'Gerando…' : 'Atualizar prévia'}
      </button>
      <button
        type="button"
        className={`vpdf-btn${painelAberto ? ' is-ativo' : ''}`}
        onClick={() => setPainelAberto((v) => !v)}
        aria-pressed={painelAberto}
      >
        O que falta{faltando.length > 0 ? ` (${faltando.length})` : ''}
      </button>
      {atrasada && (
        <span className="previa-atrasada" title="A prévia foi gerada antes da última alteração.">
          Há alterações não refletidas
        </span>
      )}
    </>
  );

  return (
    <div className="previa">
      {erro && <p className="med-erro">{erro}</p>}

      <div className={`previa-corpo${painelAberto ? ' com-painel' : ''}`}>
        {painelAberto && (
          <aside className="previa-painel" aria-label="O que falta revisar">
            <h4>O que falta revisar</h4>
            {faltando.length === 0 ? (
              <p className="previa-painel-vazio">Nada em branco no documento.</p>
            ) : (
              <ul>
                {faltando.map((f, i) => (
                  <li key={`${f.nome}-${i}`}>
                    {f.onde && onIrPara ? (
                      <button type="button" onClick={() => onIrPara(f.onde as Exclude<DestinoEdicao, null>)}>
                        {f.nome}
                      </button>
                    ) : (
                      <span>{f.nome}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}

        <div className="previa-quadro">
          {bytes ? (
            <VisualizadorPdfBytes
              bytes={bytes}
              paginas={paginas}
              nomeArquivo={`previa-${tag}.pdf`}
              extras={controles}
              selo="Prévia — não é o documento emitido"
            />
          ) : (
            <div className="vpdf-aviso">{gerando ? 'Desenhando o documento…' : 'Sem prévia.'}</div>
          )}
        </div>
      </div>
    </div>
  );
}
