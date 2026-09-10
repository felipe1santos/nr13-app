import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Icone } from '../components/Icone';
import ModalGuia from '../features/info/ModalGuia';
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
 * ## A ordem da tela
 *
 * 1. **busca** — a maioria chega com uma dúvida, não querendo ler tudo;
 * 2. **o fluxo** — a resposta para "por onde começo", que é a pergunta nº 1;
 * 3. **guias por assunto** — em quatro categorias, na ordem em que o trabalho
 *    acontece: primeiros passos → operação → documentação → gestão;
 * 4. **dúvidas frequentes** — escritas na língua de quem pergunta.
 *
 * Buscar filtra as três seções de baixo AO MESMO TEMPO. Uma busca que devolve
 * só guias, com o FAQ intacto abaixo, faria o usuário concluir que não há
 * resposta quando ela está três dedos abaixo.
 *
 * ## Deep link
 *
 * `/info?guia=<id>` abre o guia direto. É o que permite apontar para uma ajuda
 * específica de qualquer lugar do sistema sem duplicar o texto.
 */
export default function Info() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [termo, setTermo] = useState('');

  const guias = useMemo(() => buscarGuias(termo), [termo]);
  const faq = useMemo(() => buscarFaq(termo), [termo]);
  const buscando = termo.trim() !== '';
  const nada = buscando && guias.length === 0 && faq.length === 0;

  const abertoId = params.get('guia');
  const aberto = abertoId ? guiaPorId(abertoId) : null;

  const abrir = (id: string) => {
    const p = new URLSearchParams(params);
    p.set('guia', id);
    setParams(p, { replace: false });
  };
  const fechar = () => {
    const p = new URLSearchParams(params);
    p.delete('guia');
    setParams(p, { replace: true });
  };

  return (
    <div className="info-page">
      <header className="info-hero">
        <div>
          <span className="info-hero-eyebrow">Info</span>
          <h1>Central de ajuda do NR-13</h1>
          <p>
            Entenda o fluxo do sistema, siga os guias passo a passo e tire dúvidas sobre cada
            módulo.
          </p>
        </div>
        <span className="info-hero-ic" aria-hidden>
          <Icone nome="info" tam={26} />
        </span>
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
          <h2 id="info-fluxo">Comece por aqui</h2>
          <p className="info-secao-sub">
            O caminho do sistema, na ordem em que o trabalho acontece. Cada etapa depende da
            anterior.
          </p>
          <ol className="info-fluxo">
            {PRIMEIROS_PASSOS.map((p, i) => (
              <li key={p.titulo} className="info-fluxo-passo">
                <button type="button" onClick={() => navigate(p.rota)}>
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
          <button type="button" className="btn-secundario info-fluxo-guia" onClick={() => abrir('comecar')}>
            <Icone nome="book" tam={13} /> Abrir o guia completo
          </button>
        </section>
      )}

      {guias.length > 0 && (
        <section className="info-secao" aria-labelledby="info-guias">
          <h2 id="info-guias">Guias</h2>
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
                      <button type="button" className="info-card" onClick={() => abrir(g.id)}>
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
            {faq.map((f) => (
              <li key={f.pergunta}>
                <details>
                  <summary>{f.pergunta}</summary>
                  <div className="info-faq-corpo">
                    <p>{f.resposta}</p>
                    {f.guia && (
                      <button type="button" className="info-faq-link" onClick={() => abrir(f.guia!)}>
                        Ver o guia <Icone nome="arrowright" tam={12} />
                      </button>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}

      {nada && (
        <p className="info-vazio">
          Tente outra palavra — por exemplo <b>inspeção</b>, <b>certificado</b>, <b>prazo</b> ou{' '}
          <b>rascunho</b>. A central tem {GUIAS.length} guias e {FAQ.length} perguntas.
        </p>
      )}

      {aberto && <ModalGuia guia={aberto} aoFechar={fechar} />}
    </div>
  );
}
