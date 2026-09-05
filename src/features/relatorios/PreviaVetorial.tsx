import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icone } from '../../components/Icone';
import { VisualizadorPdfBytes } from '../../components/VisualizadorPdf';
import { textoDoErro } from '../../services/textoDoErro';
import { gerarPreviaRelatorio } from './pdfVetorial/gerarRelatorio';
import { montarModeloRelatorio } from './pdfVetorial/modelo';
import type { CampoEditavel } from './pdfVetorial/documento';
import { oQueFalta, type DestinoEdicao, type ItemFaltante } from './oQueFalta';
import EditorCampoDocumento from './EditorCampoDocumento';
import {
  carregarOverrides,
  comOverride,
  contarOverrides,
  gravarOverrides,
  overrideDeTexto,
  semOverride,
  type MapaOverrides,
} from './overridesRelatorio';

/** A4 em mm — a régua que converte a caixa do gerador em pixels da tela. */
const A4 = { largura: 210, altura: 297 };

/**
 * Fase 13D · a PRÉVIA é o documento — e, desde 13D-bis, é onde ele se EDITA.
 *
 * ## O que muda
 *
 * Até aqui o usuário revisava 27 folhas HTML e assinava um PDF desenhado por
 * outro caminho: o que ele via não era o que ele emitia. Este componente mostra
 * **o mesmo gerador**, em modo `preview` — mesmo layout, mesmos dados, mesma
 * paginação, com os campos vazios em amarelo-claro.
 *
 * ## A camada de edição
 *
 * O gerador devolve, junto dos bytes, ONDE cada campo editável caiu no papel.
 * Sobre cada página desenhada vai uma camada de botões transparentes nessas
 * posições: clicar abre o editor daquele campo. O PDF não é tocado — nada de
 * `contenteditable` no canvas, nada de reabrir o arquivo pronto para adivinhar
 * qual texto é qual.
 *
 * ## Por que existe um botão, e não geração automática
 *
 * Gerar o PDF a cada tecla travaria a tela num relatório grande (o vetorial leva
 * ~1,8 s num documento completo). A prévia é gerada quando alguém pede — e,
 * enquanto houver edição mais nova que a última geração, um aviso discreto diz
 * que a prévia está atrasada. Salvar um override é exceção: ali a regeneração é
 * imediata, porque o usuário acabou de pedir para ver aquela mudança.
 *
 * ## O que ela NÃO faz
 *
 * Não arquiva, não calcula SHA oficial, não grava `pdfRef`, não cria histórico,
 * não mexe em vencimento e não escreve no Livro.
 */
export default function PreviaVetorial({
  tag,
  documentos,
  versaoDados,
  idRelatorio,
  onIrPara,
  onOverrides,
}: {
  tag: string;
  documentos: string[];
  /** Muda a cada edição salva — é o que marca a prévia como atrasada. */
  versaoDados: number;
  /** O id do relatório em edição: é a quem os overrides pertencem. */
  idRelatorio?: string;
  onIrPara?: (destino: Exclude<DestinoEdicao, null>) => void;
  /** Avisa a tela do documento quantos campos foram alterados à mão. */
  onOverrides?: (mapa: MapaOverrides) => void;
}) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [paginas, setPaginas] = useState(0);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState('');
  const [faltando, setFaltando] = useState<ItemFaltante[]>([]);
  const [painelAberto, setPainelAberto] = useState(false);
  const [versaoGerada, setVersaoGerada] = useState<number | null>(null);
  const [editaveis, setEditaveis] = useState<CampoEditavel[]>([]);
  const [overrides, setOverrides] = useState<MapaOverrides>(() =>
    idRelatorio ? carregarOverrides(idRelatorio, tag) : {},
  );
  const [emEdicao, setEmEdicao] = useState<CampoEditavel | null>(null);
  const [salvandoCampo, setSalvandoCampo] = useState(false);

  const gerar = useCallback(
    async (mapa: MapaOverrides = overrides) => {
      setGerando(true);
      setErro('');
      try {
        const r = await gerarPreviaRelatorio(tag, documentos, mapa);
        setBytes(r.bytes);
        setPaginas(r.paginas);
        setEditaveis(r.editaveis);
        setFaltando(oQueFalta(montarModeloRelatorio(tag)));
        setVersaoGerada(versaoDados);
      } catch (e) {
        setErro(textoDoErro(e, 'Não foi possível gerar a prévia.'));
      } finally {
        setGerando(false);
      }
    },
    [tag, documentos, versaoDados, overrides],
  );

  // Uma geração na abertura: chegar numa tela vazia com um botão "Atualizar"
  // obrigaria o usuário a pedir o que ele veio ver.
  useEffect(() => {
    void gerar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na montagem; as demais são sob demanda
  }, []);

  const atrasada = versaoGerada !== null && versaoGerada !== versaoDados;

  /** Grava o mapa pelo caminho oficial e redesenha com o resultado. */
  const aplicar = useCallback(
    async (mapa: MapaOverrides) => {
      setSalvandoCampo(true);
      setErro('');
      try {
        if (idRelatorio) await gravarOverrides(idRelatorio, tag, mapa);
        setOverrides(mapa);
        onOverrides?.(mapa);
        setEmEdicao(null);
        await gerar(mapa);
      } catch (e) {
        setErro(textoDoErro(e, 'Não foi possível salvar a alteração deste campo.'));
      } finally {
        setSalvandoCampo(false);
      }
    },
    [idRelatorio, tag, gerar, onOverrides],
  );

  const camposPorPagina = useMemo(() => {
    const mapa = new Map<number, CampoEditavel[]>();
    for (const c of editaveis) {
      const lista = mapa.get(c.pagina) ?? [];
      lista.push(c);
      mapa.set(c.pagina, lista);
    }
    return mapa;
  }, [editaveis]);

  const manuais = contarOverrides(overrides);

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
      {manuais > 0 && (
        <span className="previa-manuais" title="Campos com texto alterado manualmente neste relatório">
          {manuais} campo{manuais > 1 ? 's' : ''} alterado{manuais > 1 ? 's' : ''}
        </span>
      )}
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
            <p className="previa-painel-dica">
              Clique em qualquer texto do documento para escrever direto nele.
            </p>
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
              sobreposicao={(pagina, largura, altura) => (
                <div className="previa-camada">
                  {(camposPorPagina.get(pagina) ?? []).map((c) => (
                    <button
                      key={`${c.id}-${c.y}`}
                      type="button"
                      className={`previa-alvo${c.origem !== 'auto' ? ' is-manual' : ''}`}
                      title={
                        c.origem === 'auto'
                          ? `${c.rotulo} — clique para editar`
                          : `${c.rotulo} — alterado manualmente`
                      }
                      style={{
                        left: `${(c.x / A4.largura) * largura}px`,
                        top: `${(c.y / A4.altura) * altura}px`,
                        width: `${(c.larg / A4.largura) * largura}px`,
                        height: `${(c.alt / A4.altura) * altura}px`,
                      }}
                      onClick={() => setEmEdicao(c)}
                    />
                  ))}
                </div>
              )}
            />
          ) : (
            <div className="vpdf-aviso">{gerando ? 'Desenhando o documento…' : 'Sem prévia.'}</div>
          )}
        </div>
      </div>

      {emEdicao && (
        <div className="previa-modal" onClick={() => !salvandoCampo && setEmEdicao(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <EditorCampoDocumento
              campo={emEdicao}
              ocupado={salvandoCampo}
              onFechar={() => setEmEdicao(null)}
              onSalvar={(texto) =>
                void aplicar(comOverride(overrides, emEdicao.id, overrideDeTexto(texto, emEdicao.auto)))
              }
              onRestaurar={() => void aplicar(semOverride(overrides, emEdicao.id))}
            />
          </div>
        </div>
      )}
    </div>
  );
}
