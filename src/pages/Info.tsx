import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icone } from '../components/Icone';
import ModalGuia from '../features/info/ModalGuia';
import ModalJornada from '../features/info/ModalJornada';
import {
  CATEGORIAS,
  FAQ,
  GUIAS,
  PRIMEIROS_PASSOS,
  buscarFaq,
  buscarGuias,
  guiaPorId,
  guiasDaCategoria,
} from '../features/info/infoConteudo';
import './info.css';

/**
 * `/info` — a central de ajuda do sistema.
 *
 * ## Por que ela existe
 *
 * Todo o conhecimento de como operar o NR-13 estava na cabeça de quem o
 * construiu e em três ajudas espalhadas (containers, calibrações,
 * certificados). Quem entrava pela primeira vez tinha de descobrir sozinho que
 * a inspeção pende do equipamento, que marcar um ensaio não é preenchê-lo e
 * que rascunho não gera prazo.
 *
 * ## Duas profundidades, de propósito
 *
 * **"Comece por aqui"** é a jornada: doze cartões curtos, ligados por setas,
 * que se lêem em vinte segundos. Clicar num deles abre a etapa com o porquê e
 * o que se preenche — e de lá se avança de etapa em etapa, com progresso no
 * topo. É para aprender o CAMINHO.
 *
 * **"Guias"** é a referência por assunto: passo a passo detalhado, com
 * pré-requisitos e as regras que o usuário precisa saber mesmo sem perguntar.
 * É para resolver uma tarefa específica.
 *
 * Misturar as duas foi o erro da primeira versão: o cartão numerado abria a
 * mesma coisa que o card de guia, e a jornada virava um índice sem valor
 * próprio.
 *
 * ## Deep link
 *
 * `/info?guia=<id>` abre um guia direto; `/info?etapa=<n>` abre a jornada
 * naquela etapa.
 */
export default function Info() {
  const [params, setParams] = useSearchParams();
  const [termo, setTermo] = useState('');
  /**
   * O FAQ abre CORTADO (10/09/2026).
   *
   * Vinte e nove perguntas fechadas em fila é uma parede: quem chega para ler
   * desiste antes de rolar, e quem chega com uma dúvida específica usa a busca.
   * As oito primeiras cobrem o que mais se pergunta; o resto continua a um
   * clique, e a busca sempre mostra tudo que casa.
   */
  const [faqInteiro, setFaqInteiro] = useState(false);

  const guias = useMemo(() => buscarGuias(termo), [termo]);
  const faq = useMemo(() => buscarFaq(termo), [termo]);
  const buscando = termo.trim() !== '';
  const nada = buscando && guias.length === 0 && faq.length === 0;
  // Buscando, a lista vem inteira: cortar o resultado de uma busca esconderia
  // justamente a resposta que a pessoa foi procurar.
  const faqVisivel = buscando || faqInteiro ? faq : faq.slice(0, 8);
  const faqCortado = faq.length - faqVisivel.length;

  const abertoId = params.get('guia');
  const aberto = abertoId ? guiaPorId(abertoId) : null;
  const etapaParam = params.get('etapa');
  const etapa = etapaParam === null ? null : Number(etapaParam);
  const jornadaAberta =
    etapa !== null && Number.isInteger(etapa) && etapa >= 0 && etapa < PRIMEIROS_PASSOS.length
      ? etapa
      : null;

  const trocar = (chave: 'guia' | 'etapa', valor: string | null) => {
    const p = new URLSearchParams(params);
    p.delete('guia');
    p.delete('etapa');
    if (valor !== null) p.set(chave, valor);
    setParams(p, { replace: valor === null });
  };

  return (
    <div className="info-page">
      {/* Faixa FINA: identifica a tela e sai da frente. Ver o comentário no CSS. */}
      <header className="info-hero">
        <span className="info-hero-ic" aria-hidden>
          <Icone nome="info" tam={17} />
        </span>
        <div className="info-hero-txt">
          <span className="info-hero-eyebrow">Info</span>
          <h1>Central de ajuda do NR-13</h1>
          <p>Entenda o fluxo, siga os guias e tire dúvidas sobre cada módulo.</p>
        </div>
      </header>

      <div className="info-busca">
        <Icone nome="search" tam={15} />
        <input
          type="search"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Buscar ajuda, recurso ou dúvida…"
          aria-label="Buscar na central de ajuda"
        />
        {buscando && (
          <button type="button" className="info-busca-x" onClick={() => setTermo('')} aria-label="Limpar a busca">
            ×
          </button>
        )}
      </div>

      {buscando && (
        <p className="info-resultado" role="status">
          {nada
            ? `Nada encontrado para "${termo}".`
            : `${guias.length} guia${guias.length === 1 ? '' : 's'} e ${faq.length} pergunta${
                faq.length === 1 ? '' : 's'
              } para "${termo}".`}
        </p>
      )}

      {!buscando && (
        <section className="info-secao" aria-labelledby="info-fluxo">
          <div className="info-secao-topo">
            <div>
              <h2 id="info-fluxo">Comece por aqui</h2>
              <p className="info-secao-sub">
                A jornada do sistema, na ordem em que o trabalho acontece. Clique numa etapa para
                entendê-la.
              </p>
            </div>
            <button type="button" className="btn-secundario info-fluxo-guia" onClick={() => trocar('etapa', '0')}>
              <Icone nome="book" tam={13} /> Guia completo
            </button>
          </div>

          {/* A seta entre os cartões é CSS (`::after`), e é escondida no fim de
              cada fileira por `nth-child` — por isso as colunas são fixas por
              faixa em vez de `auto-fill`: com contagem variável não há como
              saber qual cartão termina a fileira, e a seta apontaria para o
              vazio da margem. */}
          <ol className="info-fluxo">
            {PRIMEIROS_PASSOS.map((p, i) => (
              <li key={p.titulo} className="info-fluxo-passo">
                <button
                  type="button"
                  onClick={() => trocar('etapa', String(i))}
                  aria-label={`Etapa ${i + 1}: ${p.titulo}`}
                >
                  <span className="info-fluxo-n" aria-hidden>
                    {i + 1}
                  </span>
                  <span className="info-fluxo-ic" aria-hidden>
                    <Icone nome={p.icone} tam={15} />
                  </span>
                  <span className="info-fluxo-txt">
                    <strong>{p.titulo}</strong>
                    <em>{p.texto}</em>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      {guias.length > 0 && (
        <section className="info-secao" aria-labelledby="info-guias">
          <h2 id="info-guias">Guias por seção</h2>
          {!buscando && (
            <p className="info-secao-sub">
              A referência detalhada de cada módulo: o que precisa existir antes, o passo a passo e
              as regras que valem ali.
            </p>
          )}
          {CATEGORIAS.map((cat) => {
            const daCategoria = guiasDaCategoria(cat.id, guias);
            if (daCategoria.length === 0) return null;
            return (
              <div className="info-cat" key={cat.id}>
                <div className="info-cat-topo">
                  <span className="info-cat-ic" aria-hidden>
                    <Icone nome={cat.icone} tam={14} />
                  </span>
                  <h3>{cat.titulo}</h3>
                  <span className="info-cat-sub">{cat.sub}</span>
                </div>
                <ul className="info-cards">
                  {daCategoria.map((g) => (
                    <li key={g.id}>
                      <button type="button" className="info-card" onClick={() => trocar('guia', g.id)}>
                        <span className="info-card-ic" aria-hidden>
                          <Icone nome={g.icone} tam={16} />
                        </span>
                        <span className="info-card-txt">
                          <strong>{g.titulo}</strong>
                          <em>{g.resumo}</em>
                        </span>
                        <span className="info-card-seta" aria-hidden>
                          <Icone nome="chevright" tam={14} />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      )}

      {faq.length > 0 && (
        <section className="info-secao" aria-labelledby="info-faq">
          <h2 id="info-faq">Dúvidas frequentes</h2>
          <ul className="info-faq">
            {faqVisivel.map((f) => (
              <li key={f.pergunta}>
                <details>
                  <summary>{f.pergunta}</summary>
                  <div className="info-faq-corpo">
                    <p>{f.resposta}</p>
                  </div>
                </details>
              </li>
            ))}
          </ul>
          {faqCortado > 0 && (
            <button type="button" className="info-faq-mais" onClick={() => setFaqInteiro(true)}>
              Ver todas as {faq.length} perguntas
              <Icone nome="chevdown" tam={13} />
            </button>
          )}
        </section>
      )}

      {nada && (
        <p className="info-vazio">
          Tente outra palavra — por exemplo <b>inspeção</b>, <b>certificado</b>, <b>prazo</b> ou{' '}
          <b>rascunho</b>. A central tem {GUIAS.length} guias e {FAQ.length} perguntas.
        </p>
      )}

      {aberto && <ModalGuia guia={aberto} aoFechar={() => trocar('guia', null)} />}
      {jornadaAberta !== null && (
        <ModalJornada inicio={jornadaAberta} aoFechar={() => trocar('etapa', null)} />
      )}
    </div>
  );
}
