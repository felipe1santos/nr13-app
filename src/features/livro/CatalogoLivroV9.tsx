/**
 * Fase 9 · 9F.4.4 — a LISTA de `/livro-registro` sem baixar a organização.
 *
 * ## O que muda em relação à lista antiga (que segue em `pages/LivroRegistro.tsx`)
 *
 *   · os equipamentos vêm da PROJEÇÃO, 50 por vez, em vez de `lerTudo()` — a
 *     hidratação INTEGRAL, que esta era a ÚLTIMA tela do sistema a chamar.
 *     Medido em produção em 02/09/2026: a organização de 39 equipamentos com UM
 *     livro baixava 780 KB para desenhar UMA linha de tabela;
 *   · o filtro "tem livro" acontece no SERVIDOR (`buscar_livros`). Fazê-lo no
 *     cliente devolveria 50 equipamentos para desenhar 2;
 *   · existe BUSCA. A tela antiga não tem campo de texto nenhum — para achar um
 *     equipamento, rola-se a tabela inteira;
 *   · a contagem de registros e a data do último vêm do servidor, como colunas.
 *     A tela antiga fazia `JSON.parse` do livro de CADA equipamento (mais
 *     `nr13_info_` e `nr13_cat_`) só para montar a tabela — e descartava 38 dos
 *     39 no `filter` seguinte.
 *
 * ## Por que um COMPONENTE, e não uma tela paralela
 *
 * Mesma razão da 9F.2 e da 9F.3: o que vem DEPOIS da lista — a timeline, o
 * lacre, o termo de abertura, o visualizador, o PDF — são ~900 linhas idênticas
 * nos dois caminhos, e são o registro de segurança que a fiscalização lê.
 * Duplicá-las criaria duas versões dele. O que a flag troca é a FONTE DA LISTA
 * e o momento em que o livro chega ao cache.
 *
 * ## Sem virtualização, e isso é uma decisão MEDIDA
 *
 * As outras telas da 9F virtualizam. Esta não, porque a lista dela já é
 * filtrada no servidor por "tem livro": medido em produção em 02/09/2026, são
 * **11 livros em toda a base**, e a maior organização tem **1**. Virtualizar 11
 * linhas adiciona um observador de rolagem, medição de altura e uma classe de
 * defeito (a rolagem que não volta ao topo na busca — que o gate da 9F.1 pegou)
 * para resolver um problema que não existe. A paginação por keyset FICA, porque
 * é ela que impede a página gigante no dia em que um parque grande tiver livro
 * em todos; a virtualização entra quando a medição pedir, e o gate de 50k
 * registra o número que decidiria isso.
 *
 * ## `null` não é "sem livro"
 *
 * Numa organização cuja projeção ainda não foi refeita, `livroEntradas` vem
 * `null` — e a linha ENTRA na lista, com a coluna de registros em branco. A
 * alternativa (esconder) faria a tela escrever "Nenhum livro de registro gerado
 * ainda" sobre um parque inteiro que ninguém contou. A regra mora em
 * `catalogoLivro`, onde a suíte alcança — o ambiente de teste é `node`, sem DOM.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BuscaLista from '../../components/BuscaLista';
import { Icone } from '../../components/Icone';
import * as buscaLivro from './buscaLivro';
import type { ItemLivro } from './buscaLivro';
import { rotuloRegistros } from './catalogoLivro';

const ROTULO_TIPO: Record<string, string> = {
  vaso: 'Vaso de Pressão',
  caldeira: 'Caldeira',
  autoclave: 'Autoclave',
};

export interface PropsCatalogoLivro {
  termo: string;
  aoMudarTermo: (termo: string) => void;
  /** Escolher um equipamento: o pai semeia a TAG e abre o livro. */
  aoEscolher: (tag: string) => void;
}

export default function CatalogoLivroV9({
  termo,
  aoMudarTermo,
  aoEscolher,
}: PropsCatalogoLivro) {
  const [itens, setItens] = useState<ItemLivro[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [temMais, setTemMais] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [contagem, setContagem] = useState<buscaLivro.ContagemLivros | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const filtro = useMemo(() => termo, [termo]);

  /** A resposta antiga não pode sobrescrever a nova — igual às etapas anteriores. */
  const geracao = useRef(0);
  const abortador = useRef<AbortController | null>(null);

  const buscar = useCallback(async () => {
    const minha = ++geracao.current;
    abortador.current?.abort();
    const ctrl = new AbortController();
    abortador.current = ctrl;

    setCarregando(true);
    setErro(null);
    try {
      const pagina = await buscaLivro.listarPagina(filtro, null, ctrl.signal);
      if (minha !== geracao.current) return;

      setItens(pagina.itens);
      setCursor(pagina.proximoCursor);
      setTemMais(pagina.temMais);

      void buscaLivro
        .contar(filtro, ctrl.signal)
        .then((c) => {
          if (minha === geracao.current) setContagem(c);
        })
        .catch(() => undefined); // contador é enfeite: nunca derruba a lista
    } catch (e) {
      if (minha !== geracao.current) return;
      if (ctrl.signal.aborted) return;
      setItens([]);
      setCursor(null);
      setTemMais(false);
      setContagem(null);
      // Sem catálogo local para o livro, e de propósito: o que esta tela
      // mostraria offline é uma lista de quem TEM livro, e essa informação só
      // existe na projeção. O que NÃO se faz aqui — e o desenho §16 proíbe — é
      // cair na hidratação integral, que é justamente o que a etapa removeu.
      setErro(
        e instanceof buscaLivro.ErroBuscaLivro
          ? 'Não foi possível carregar os livros de registro.'
          : 'Sem conexão. Os livros aparecem quando a internet voltar.',
      );
    } finally {
      if (minha === geracao.current) setCarregando(false);
    }
  }, [filtro]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void buscar();
    return () => abortador.current?.abort();
  }, [buscar]);

  const carregarMais = useCallback(async () => {
    if (!temMais || carregando || carregandoMais || !cursor) return;
    setCarregandoMais(true);
    const minha = geracao.current;
    try {
      const pagina = await buscaLivro.listarPagina(filtro, cursor);
      if (minha !== geracao.current) return;
      setItens((antigos) => {
        const vistos = new Set(antigos.map((i) => i.tag));
        return [...antigos, ...pagina.itens.filter((i) => !vistos.has(i.tag))];
      });
      setCursor(pagina.proximoCursor);
      setTemMais(pagina.temMais);
    } catch {
      setTemMais(false); // sem estourar erro no meio da rolagem
    } finally {
      setCarregandoMais(false);
    }
  }, [temMais, carregando, carregandoMais, cursor, filtro]);

  return (
    <>
      <BuscaLista
        valor={termo}
        aoMudar={aoMudarTermo}
        placeholder="Buscar por TAG, equipamento, fabricante ou cliente…"
        carregando={carregando}
        contagem={contagem}
        offline={false}
      />

      {erro && (
        <div className="rel-aviso-erro" role="status">
          {erro}
          <button type="button" className="fj-btn fj-btn-ghost" onClick={() => void buscar()}>
            Tentar de novo
          </button>
        </div>
      )}

      {!carregando && itens.length === 0 && !erro ? (
        <p className="dashboard-vazio">
          {termo
            ? `Nenhum livro encontrado para ${termo}.`
            : 'Nenhum livro de registro gerado ainda'}
        </p>
      ) : (
        <div className="fj-table-wrap">
          <table className="fj-table">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Categoria</th>
                <th>Registros</th>
                <th>Último registro</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((l) => (
                <tr key={l.tag} className="linha-clicavel" onClick={() => aoEscolher(l.tag)}>
                  <td className="cel-titulo">
                    <div className="fj-tag-cell">
                      <div className="fj-tag-ico">
                        <Icone nome="book" tam={15} />
                      </div>
                      <div>
                        <div className="fj-tag-code">{l.tag}</div>
                        <div className="fj-eq-name">
                          {l.descricao?.trim() || (l.tipo ? ROTULO_TIPO[l.tipo] : '') || 'Equipamento'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td data-rot="Categoria">
                    {l.categoria ? (
                      <span className="fj-badge neutro">Cat. {l.categoria}</span>
                    ) : (
                      <span className="fj-dash">—</span>
                    )}
                  </td>
                  {/* Em branco quando ninguém contou. "Sem registro" ali seria
                      afirmar uma ausência que não foi medida. */}
                  <td className="mono" data-rot="Registros">
                    {rotuloRegistros(l.livroEntradas) || <span className="fj-dash">—</span>}
                  </td>
                  <td className="mono" data-rot="Último registro">
                    {l.livroUltima ? (
                      formatarData(l.livroUltima)
                    ) : (
                      <span className="fj-dash">—</span>
                    )}
                  </td>
                  <td className="cel-acoes" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="fj-btn fj-btn-ghost"
                      onClick={() => aoEscolher(l.tag)}
                    >
                      <Icone nome="chevright" tam={13} /> Abrir livro
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {temMais && (
            <div className="rel-rodape-carregando">
              <button
                type="button"
                className="fj-btn fj-btn-ghost"
                disabled={carregandoMais}
                onClick={() => void carregarMais()}
              >
                {carregandoMais ? 'Carregando…' : 'Carregar mais'}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/**
 * `AAAA-MM-DD` → `DD/MM/AAAA`, que é como o resto do sistema mostra data.
 *
 * Fatiado, e não `new Date()`: a data do livro é um dia de calendário, e
 * `new Date('2026-07-10')` é interpretado como UTC — num fuso a oeste isso
 * exibe 09/07, um dia antes do que está no registro assinado.
 */
function formatarData(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : iso;
}
