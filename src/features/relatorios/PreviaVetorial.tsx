import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icone } from '../../components/Icone';
import { VisualizadorPdfBytes } from '../../components/VisualizadorPdf';
import { textoDoErro } from '../../services/textoDoErro';
import { gerarPreviaRelatorio } from './pdfVetorial/gerarRelatorio';
import type { CampoEditavel } from './pdfVetorial/documento';
import { oQueFalta, type DestinoEdicao, type ItemFaltante } from './oQueFalta';
import { agruparPendencias, proximoDoGrupo, type GrupoPendencia } from './agruparPendencias';
import EditorCampoDocumento from './EditorCampoDocumento';
import ModalPredefinicoes from './predefinicoes/ModalPredefinicoes';
import { listarPredefinicoes, type Predefinicao } from './predefinicoes/modelo';
import { listaComSistema } from './predefinicoes/conjuntoSistema';
import {
  overridesDaAplicacao,
  type ModoAplicacao,
  type PlanoAplicacao,
} from './predefinicoes/aplicacao';
import { prepararImagem } from './imagensDoDocumento';
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
  aplicadoEm,
  idRelatorio,
  onIrPara,
  onOverrides,
}: {
  tag: string;
  documentos: string[];
  /** Muda a cada edição salva — é o que marca a prévia como atrasada. */
  versaoDados: number;
  /**
   * Carimbo de quando um PAINEL gravou (Configurações, Medições, Laudo). Muda
   * → a prévia se refaz sozinha. Ver o efeito que o consome.
   */
  aplicadoEm?: number;
  /** O id do relatório em edição: é a quem os overrides pertencem. */
  idRelatorio?: string;
  /** `campo`: no modal de Configurações, qual input focar e destacar. */
  onIrPara?: (destino: Exclude<DestinoEdicao, null>, campo?: string) => void;
  /** Avisa a tela do documento quantos campos foram alterados à mão. */
  onOverrides?: (mapa: MapaOverrides) => void;
}) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [paginas, setPaginas] = useState(0);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState('');
  const [faltando, setFaltando] = useState<ItemFaltante[]>([]);
  const [painelAberto, setPainelAberto] = useState(false);
  /**
   * 10/09/2026 · a barra passa a mostrar AÇÕES, não células.
   *
   * A detecção continua campo a campo — `faltando` tem os cem. O que muda é
   * a apresentação: `agruparPendencias` funde por campo do painel e por
   * seção, e é a contagem de GRUPOS que vai para o botão. Ver o cabeçalho de
   * `agruparPendencias.ts`.
   */
  const grupos = useMemo(() => agruparPendencias(faltando), [faltando]);
  /** O último campo visitado de cada grupo — clicar de novo avança na seção. */
  const ultimoDoGrupo = useRef<Map<string, string>>(new Map());

  function irAteGrupo(g: GrupoPendencia) {
    const alvo = proximoDoGrupo(g, ultimoDoGrupo.current.get(g.id) ?? null);
    ultimoDoGrupo.current.set(g.id, alvo.id);
    irAtePendencia(alvo);
  }

  /** O campo que a barra pediu para mostrar — some depois de 1,5 s. */
  const [destacado, setDestacado] = useState<string | null>(null);
  const [irParaPonto, setIrParaPonto] = useState<{ pagina: number; fracaoY: number; pedido: number } | null>(null);
  const [versaoGerada, setVersaoGerada] = useState<number | null>(null);
  const [editaveis, setEditaveis] = useState<CampoEditavel[]>([]);
  const [overrides, setOverrides] = useState<MapaOverrides>(() =>
    idRelatorio ? carregarOverrides(idRelatorio, tag) : {},
  );
  const [emEdicao, setEmEdicao] = useState<CampoEditavel | null>(null);
  const [salvandoCampo, setSalvandoCampo] = useState(false);
  /** As predefinições da organização — ver `predefinicoes/modelo.ts`. */
  const [predefinicoes, setPredefinicoes] = useState<Predefinicao[]>(() => listarPredefinicoes());
  const [modalPredef, setModalPredef] = useState(false);

  const gerar = useCallback(
    async (mapa: MapaOverrides = overrides) => {
      setGerando(true);
      setErro('');
      try {
        const r = await gerarPreviaRelatorio(tag, documentos, mapa, idRelatorio);
        setBytes(r.bytes);
        setPaginas(r.paginas);
        setEditaveis(r.editaveis);
        // As pendências saem dos CAMPOS que o gerador acabou de desenhar — a
        // mesma fonte do amarelo. Antes vinham de uma segunda lista, montada
        // sobre o modelo, que cobria uma dúzia de campos.
        setFaltando(oQueFalta(r.editaveis));
        setVersaoGerada(versaoDados);
      } catch (e) {
        setErro(textoDoErro(e, 'Não foi possível gerar a prévia.'));
      } finally {
        setGerando(false);
      }
    },
    [tag, documentos, versaoDados, overrides, idRelatorio],
  );

  // Uma geração na abertura: chegar numa tela vazia com um botão "Atualizar"
  // obrigaria o usuário a pedir o que ele veio ver.
  useEffect(() => {
    void gerar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na montagem; as demais são sob demanda
  }, []);

  /**
   * O QUE SAI DE UM PAINEL VOLTA PARA O DOCUMENTO SOZINHO (10/09/2026).
   *
   * A prévia é gerada sob demanda porque desenhar 30 folhas custa caro, e
   * `versaoDados` só a marca como ATRASADA. Mas há um caminho em que esperar o
   * usuário pedir de novo é errado: ele clicou numa pendência da barra, a barra
   * abriu o painel (Configurações, Medições ou Laudo), ele preencheu e mandou
   * aplicar. Aí o pedido já foi feito.
   *
   * Medido em produção: preencher o Nº da A.R.T. vindo do "O que falta" e
   * clicar em "Atualizar" não mudava nada na tela — o campo continuava amarelo
   * e a pendência continuava na lista. Havia um segundo botão, com outro nome
   * ("Atualizar prévia"), em outro canto da barra. Quem edita pelo painel não
   * tem por que descobrir isso.
   *
   * `aplicadoEm` só muda quando um painel GRAVA. Trocar de folha, abrir e
   * fechar o modal ou salvar rascunho continuam sem regerar nada.
   */
  const primeiroAplicado = useRef(true);
  useEffect(() => {
    if (primeiroAplicado.current) {
      primeiroAplicado.current = false;
      return;
    }
    void gerar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só o carimbo do painel dispara
  }, [aplicadoEm]);

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

  /**
   * Bloco 1 · a imagem escolhida vira override DESTE relatório.
   *
   * O arquivo sobe pelo cofre (fila offline por baixo) e o override guarda o
   * CAMINHO — nunca os bytes. É a mesma razão do §2-bis: Base64 numa chave lida
   * a cada geração é o que estourou a cota deste sistema uma vez.
   */
  const trocarImagem = useCallback(
    async (campo: CampoEditavel, arquivo: File) => {
      setSalvandoCampo(true);
      setErro('');
      try {
        const valor = await prepararImagem(arquivo);
        await aplicar(comOverride(overrides, campo.id, overrideDeTexto(valor, campo.auto)));
      } catch (e) {
        setErro(textoDoErro(e, 'Não foi possível usar esta imagem.'));
      } finally {
        setSalvandoCampo(false);
      }
    },
    [aplicar, overrides],
  );
  /**
   * Aplicar uma predefinição = escrever os campos do PLANO, de uma vez.
   *
   * O plano já foi revisado pelo usuário na tela de aplicação: ele sabe quais
   * campos serão escritos, quais já tinham conteúdo e o que escolheu fazer com
   * eles. Aqui só resta virar override do relatório aberto, exatamente como se
   * cada campo tivesse sido digitado na folha — inclusive os que a predefinição
   * deixa VAZIOS, que viram `branco` e voltam a ser cobrados pela barra "O que
   * falta".
   *
   * Um mapa só, uma gravação só, uma geração só: aplicar campo a campo
   * redesenharia o documento uma vez por campo.
   */
  const aplicarPlanoPredefinicao = useCallback(
    async (plano: PlanoAplicacao, modo: ModoAplicacao) => {
      await aplicar(overridesDaAplicacao(overrides, plano, modo));
    },
    [aplicar, overrides],
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
        O que falta{grupos.length > 0 ? ` (${grupos.length})` : ''}
      </button>
      {/* Ao lado do "O que falta" de propósito: os dois respondem à mesma
          pergunta — "o que ainda falta escrever aqui" —, e as predefinições são
          a resposta pronta para a parte que se repete de relatório em relatório. */}
      <button
        type="button"
        className="vpdf-btn"
        onClick={() => setModalPredef(true)}
        title="Conjuntos de campos guardados para reusar em qualquer relatório"
      >
        {/* O número conta o que o MODAL lista — o conjunto do sistema incluído.
            Contar só os gravados faria o botão dizer "Predefinições" a uma
            organização nova e abrir com um item dentro. */}
        <Icone nome="book" tam={13} /> Predefinições ({listaComSistema(predefinicoes).length})
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

  /**
   * O clique numa pendência LEVA ATÉ O CAMPO.
   *
   * Não basta abrir a página: o campo pode estar no pé de uma folha A4, e uma
   * barra que só diz "está na 16" devolve ao revisor o trabalho que ela veio
   * poupar. Aqui: rola até a posição exata, e o campo pisca por 1,5 s.
   *
   * Quando o campo NÃO se edita na folha (datas, ART, quem assina), o destino é
   * o painel que o preenche — mandá-lo para a folha seria levá-lo a um lugar
   * onde ele não consegue resolver o que a barra apontou.
   */
  const irAtePendencia = useCallback(
    (f: ItemFaltante) => {
      if (f.onde) {
        onIrPara?.(f.onde as Exclude<DestinoEdicao, null>, f.campoConfig);
        return;
      }
      const campo = editaveis.find((c) => c.id === f.id);
      if (!campo) return;
      setIrParaPonto({ pagina: campo.pagina, fracaoY: campo.y / A4.altura, pedido: Date.now() });
      setDestacado(f.id);
    },
    [editaveis, onIrPara],
  );

  // O destaque dura 1,5 s e se apaga sozinho. Um realce permanente viraria mais
  // uma cor no documento; o que se quer é o olho achar o campo e seguir.
  useEffect(() => {
    if (!destacado) return;
    const t = window.setTimeout(() => setDestacado(null), 1500);
    return () => window.clearTimeout(t);
  }, [destacado]);

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
              /* UM item por AÇÃO, na ordem das folhas. O grupo diz quantos
                 campos carrega; clicar leva ao primeiro deles e, de novo, ao
                 seguinte — sem listar os cem. */
              <ul className="previa-pend-lista">
                {grupos.map((g) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      onClick={() => irAteGrupo(g)}
                      title={
                        g.detalhe
                          ? `${g.titulo} — ${g.detalhe}. Clique para ir ao primeiro.`
                          : `${g.titulo} — página ${g.primeiro.pagina}`
                      }
                    >
                      <span className="previa-pend-nome">{g.titulo}</span>
                      <span className="previa-pend-pag">
                        {g.detalhe
                          ? g.detalhe
                          : g.primeiro.onde === 'configuracoes'
                            ? 'Configurações'
                            : g.primeiro.onde === 'medicoes'
                              ? 'Medições'
                              : g.primeiro.onde === 'laudo'
                                ? 'Laudo'
                                : `p. ${g.primeiro.pagina}`}
                      </span>
                    </button>
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
              irParaPonto={irParaPonto ?? undefined}
              sobreposicao={(pagina, largura, altura) => (
                <div className="previa-camada">
                  {(camposPorPagina.get(pagina) ?? []).map((c) => (
                    <button
                      key={`${c.id}-${c.y}`}
                      type="button"
                      className={`previa-alvo${c.origem !== 'auto' ? ' is-manual' : ''}${
                        destacado === c.id ? ' is-destacado' : ''
                      }`}
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
            <div className="vpdf-aviso">
              {gerando ? (
                'Desenhando o documento…'
              ) : (
                <>
                  {/* A geração de abertura pode não completar (aba congelada pelo
                      navegador, por exemplo). Um aviso morto deixaria o revisor sem
                      saída; o botão devolve o controle. */}
                  A prévia ainda não foi desenhada.{' '}
                  <button type="button" className="fj-btn fj-btn-ghost" onClick={() => void gerar()}>
                    Gerar prévia
                  </button>
                </>
              )}
            </div>
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
              onEscolherImagem={(arquivo) => void trocarImagem(emEdicao, arquivo)}
              onSalvar={(texto) =>
                void aplicar(comOverride(overrides, emEdicao.id, overrideDeTexto(texto, emEdicao.auto)))
              }
              onRestaurar={() => void aplicar(semOverride(overrides, emEdicao.id))}
            />
          </div>
        </div>
      )}

      {modalPredef && (
        <ModalPredefinicoes
          lista={predefinicoes}
          editaveis={editaveis}
          onFechar={() => setModalPredef(false)}
          onLista={setPredefinicoes}
          onAplicar={aplicarPlanoPredefinicao}
        />
      )}
    </div>
  );
}
