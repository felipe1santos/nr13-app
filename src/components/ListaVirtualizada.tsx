/**
 * Fase 9 · janela de rolagem: o DOM passa a ser proporcional ao que se VÊ, não
 * ao que a organização tem.
 *
 * POR QUE ISTO É NECESSÁRIO MESMO COM PÁGINA DE 50 (desenho §12): paginação
 * controla quanto vem do SERVIDOR; virtualização controla quanto vai para o
 * DOM. "Carregar mais" acumula — 20 páginas = 1.000 cartões × 42 nós = os
 * 42.000 nós que a Fase 8 mediu, e que a 9C existe para derrubar.
 *
 * IMPLEMENTAÇÃO PRÓPRIA, e a escolha foi por medição: `@tanstack/react-virtual`
 * resolveria o mesmo, e este repositório evita dependência que consegue
 * dispensar (não usa `lucide`, tem sprite de ícone próprio, e busca o `xlsx`
 * fora do npm por causa de vulnerabilidade). O ganho medido está em
 * `docs/medicoes/2026-08-22-fase9c-tela.md`; se um dia faltar recurso aqui
 * (altura variável medida célula a célula, rolagem horizontal), trocar por
 * biblioteca é decisão barata, porque a interface deste componente é pequena
 * de propósito.
 *
 * A GRADE FICA DENTRO DA JANELA. Precisa ficar: é o `grid-template-columns` do
 * CSS que decide quantas colunas cabem, e o espaçador só sabe a altura total se
 * as linhas nascerem sob o mesmo contêiner que as mede.
 *
 * A ALTURA É ESTIMADA e depois MEDIDA. A estimativa serve ao primeiro quadro; a
 * medição real corrige o espaçador. Errar a altura não perde item — desalinha a
 * barra de rolagem até a primeira medição.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface PropsListaVirtualizada<T> {
  itens: T[];
  /** Chave estável por item. A TAG, nunca o índice. */
  chaveDe: (item: T) => string;
  desenhar: (item: T) => React.ReactNode;
  /** Altura estimada de UMA linha, em px, com o espaçamento. */
  alturaEstimada: number;
  /** Classe do contêiner das linhas (a grade ou a lista). */
  classeGrade: string;
  /** Linhas desenhadas além da janela visível, de cada lado. */
  folga?: number;
  /** Chamado quando a rolagem se aproxima do fim — "carregar mais". */
  aoChegarNoFim?: () => void;
  rodape?: React.ReactNode;
}

export default function ListaVirtualizada<T>({
  itens,
  chaveDe,
  desenhar,
  alturaEstimada,
  classeGrade,
  folga = 2,
  aoChegarNoFim,
  rodape,
}: PropsListaVirtualizada<T>) {
  const raiz = useRef<HTMLDivElement | null>(null);
  const grade = useRef<HTMLDivElement | null>(null);
  const [altura, setAltura] = useState(alturaEstimada);
  const [colunas, setColunas] = useState(1);
  const [faixa, setFaixa] = useState({ de: 0, ate: 1 });

  /**
   * QUEM ROLA NÃO É A JANELA — é o `<main class="main-content">` do Layout.
   *
   * Descoberto no navegador, não no teste: escutando `window` o componente
   * nunca recebia evento, `scrollY` ficava em 0, e a lista mostrava para sempre
   * as mesmas 16 linhas. A janela fica como recuo para telas que rolem no
   * documento (o Portal do Cliente é uma delas).
   */
  const [rolador, setRolador] = useState<HTMLElement | Window>(() =>
    typeof window === 'undefined' ? ({} as Window) : window,
  );
  useEffect(() => {
    let el: HTMLElement | null = raiz.current?.parentElement ?? null;
    while (el) {
      const s = getComputedStyle(el);
      if (/auto|scroll/.test(s.overflowY)) {
        setRolador(el);
        return;
      }
      el = el.parentElement;
    }
    setRolador(window);
  }, []);

  const porLinha = Math.max(1, colunas);
  const totalLinhas = Math.ceil(itens.length / porLinha);

  // Guardado em ref para que `recalcular` não mude de identidade a cada render
  // do pai — se mudasse, o ouvinte de rolagem seria removido e recriado a cada
  // quadro. Atribuído em efeito, não durante o render.
  const fimRef = useRef(aoChegarNoFim);
  useEffect(() => {
    fimRef.current = aoChegarNoFim;
  }, [aoChegarNoFim]);

  const recalcular = useCallback(() => {
    const el = raiz.current;
    if (!el) return;
    const caixa = el.getBoundingClientRect();

    // A "janela" é a do ROLADOR, não a do navegador: dentro de um contêiner com
    // `overflow`, o que está fora dele não está visível, por mais alta que a
    // tela seja.
    const ehJanela = rolador === window || !(rolador as HTMLElement).getBoundingClientRect;
    const caixaRolador = ehJanela
      ? { top: 0, height: window.innerHeight || 800 }
      : (rolador as HTMLElement).getBoundingClientRect();
    const alturaJanela = caixaRolador.height || 800;
    const acima = Math.max(0, caixaRolador.top - caixa.top);
    const primeiraVisivel = Math.floor(acima / altura);
    const cabem = Math.ceil(alturaJanela / altura);
    const de = Math.max(0, primeiraVisivel - folga);
    const ate = Math.max(de + 1, Math.min(totalLinhas, primeiraVisivel + cabem + folga));
    setFaixa((antiga) => (antiga.de === de && antiga.ate === ate ? antiga : { de, ate }));

    // "Carregar mais" quando falta menos de uma janela para o fim. A folga de
    // uma janela evita o branco entre acabar a lista e chegar a página nova.
    const fundo = caixa.bottom - (caixaRolador.top + alturaJanela);
    if (fimRef.current && fundo < alturaJanela) fimRef.current();
  }, [altura, folga, totalLinhas, rolador]);

  useEffect(() => {
    recalcular();
    // `passive`: o handler não chama `preventDefault`, e sem dizer isso o
    // navegador segura o quadro da rolagem esperando para descobrir.
    const alvo = rolador as unknown as EventTarget;
    alvo.addEventListener('scroll', recalcular, { passive: true });
    window.addEventListener('resize', recalcular);
    return () => {
      alvo.removeEventListener('scroll', recalcular);
      window.removeEventListener('resize', recalcular);
    };
  }, [recalcular, rolador]);

  /**
   * Mede a grade REAL: quantas colunas o CSS resolveu e quanto mede uma linha.
   *
   * `ResizeObserver`, e NÃO só um efeito — este foi o segundo defeito que só o
   * navegador mostrou. Medindo apenas quando `itens`/`colunas` mudam, a conta
   * era feita ANTES de as fotos carregarem: a linha media 135 px em vez de 564,
   * o espaçador ficava com um terço da altura certa e a rolagem chegava ao fim
   * sem ter mostrado a lista inteira. Nada depois disso remedia, porque
   * nenhuma dependência mudava.
   *
   * O observador reage à altura de verdade — foto que chega tarde, fonte que
   * troca, janela que muda de largura — e o espaçador acompanha.
   */
  const medir = useCallback(() => {
    const g = grade.current;
    if (!g) return;
    const filhos = [...g.children] as HTMLElement[];
    if (!filhos.length) return;

    const topoDoPrimeiro = filhos[0].offsetTop;
    // Colunas = quantos filhos compartilham o topo da primeira linha.
    const nColunas = Math.max(1, filhos.filter((f) => f.offsetTop === topoDoPrimeiro).length);
    setColunas((antes) => (antes === nColunas ? antes : nColunas));

    // ALTURA = DISTÂNCIA ENTRE DUAS LINHAS, não a média da grade.
    //
    // O quarto defeito que só o navegador mostrou, e o pior deles: a média
    // (`altura da grade ÷ linhas desenhadas`) MUDA conforme a última linha vem
    // cheia ou pela metade. Cada medição mudava a altura, a altura mudava a
    // faixa, a faixa mudava a última linha — e o render entrava em laço até
    // travar a aba.
    //
    // A distância entre o topo de duas linhas consecutivas já inclui o
    // espaçamento e NÃO depende de quantos itens a última linha tem.
    const medida =
      filhos.length > nColunas
        ? filhos[nColunas].offsetTop - filhos[0].offsetTop
        : filhos[0].getBoundingClientRect().height;

    // Tolerância de 1 px: sem ela, um arredondamento sub-pixel realimentaria a
    // medição para sempre.
    if (medida > 0) setAltura((antes) => (Math.abs(medida - antes) > 1 ? medida : antes));
  }, []);

  // A CADA RENDER, sem lista de dependências — de propósito.
  //
  // O terceiro defeito que só o navegador mostrou: o `ResizeObserver` sozinho
  // não basta. Com UM cartão a grade mede 557 px de altura; com QUATRO na mesma
  // linha, mede os MESMOS 557 px. A altura não muda, o observador não dispara,
  // e a contagem de colunas fica presa em 1 para sempre — a lista desenha uma
  // coluna e o espaçador fica quatro vezes maior que o necessário.
  //
  // Os dois `setState` comparam antes de gravar, então rodar a cada render não
  // realimenta nada.
  useLayoutEffect(medir);

  // E o observador continua, para o que o render não vê: foto que chega tarde,
  // fonte que troca, janela que muda de largura.
  useLayoutEffect(() => {
    const g = grade.current;
    if (!g || typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(medir);
    obs.observe(g);
    return () => obs.disconnect();
  }, [medir]);

  const inicio = faixa.de * porLinha;
  const fim = Math.min(itens.length, faixa.ate * porLinha);
  const visiveis = itens.slice(inicio, fim);

  return (
    <div ref={raiz} className="lista-virt">
      <div className="lista-virt-total" style={{ height: totalLinhas * altura }}>
        <div className="lista-virt-janela" style={{ transform: `translateY(${faixa.de * altura}px)` }}>
          <div ref={grade} className={classeGrade}>
            {visiveis.map((item) => (
              <ItemVirt key={chaveDe(item)}>{desenhar(item)}</ItemVirt>
            ))}
          </div>
        </div>
      </div>
      {rodape && <div className="lista-virt-fim">{rodape}</div>}
    </div>
  );
}

/**
 * Repassa o filho SEM embrulhar num elemento.
 *
 * Um `<div>` a mais aqui quebraria as duas grades desta tela: `.vasos-grid` e
 * `.lista-cards-horiz` posicionam os FILHOS DIRETOS. E é o que permite contar as
 * colunas por `offsetTop` acima — o filho medido tem de ser o próprio cartão.
 */
function ItemVirt({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
