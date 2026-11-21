/**
 * "Novo registro → Escolha o equipamento" (21/11/2026).
 *
 * Saiu de dentro do `CatalogoLivroV9`, onde filtrava a lista de quem JÁ TEM
 * livro — e por isso equipamento recém-criado nunca aparecia (a causa está em
 * `escolhaEquipamento.ts`). Aqui a fonte é o catálogo da organização inteira,
 * buscado no servidor pelo termo digitado.
 *
 * A foto é a de identificação do equipamento (`fotoRef` da projeção), em
 * miniatura; sem foto, o ícone do tipo, igual às outras listas Cobalto.
 *
 * Custo: a busca roda por TERMO (string, primitivo) com espera de 250 ms entre
 * teclas, e a resposta antiga é descartada pela geração — nada de uma consulta
 * por tecla, nada de efeito sobre objeto montado no render.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import FotoLista from '../../components/FotoLista';
import { Icone } from '../../components/Icone';
import type { ItemCatalogo } from '../../services/buscaIndex';
import { ErroEscolha, paginaParaRegistro } from './escolhaEquipamento';
import './escolhaEquipamento.css';

const ESPERA_MS = 250;

export default function ModalEscolhaEquipamento({
  aoEscolher,
  aoFechar,
}: {
  aoEscolher: (tag: string) => void;
  aoFechar: () => void;
}) {
  const [filtro, setFiltro] = useState('');
  const [termo, setTermo] = useState('');
  const [itens, setItens] = useState<ItemCatalogo[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [temMais, setTemMais] = useState(false);
  const [offline, setOffline] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const geracao = useRef(0);
  const abortador = useRef<AbortController | null>(null);

  // O termo só vale depois de o usuário parar de digitar.
  useEffect(() => {
    const t = setTimeout(() => setTermo(filtro.trim()), ESPERA_MS);
    return () => clearTimeout(t);
  }, [filtro]);

  const buscar = useCallback(async (t: string) => {
    const minha = ++geracao.current;
    abortador.current?.abort();
    const ctrl = new AbortController();
    abortador.current = ctrl;
    setCarregando(true);
    setErro(null);
    try {
      const pagina = await paginaParaRegistro(t, null, ctrl.signal);
      if (minha !== geracao.current) return;
      setItens(pagina.itens);
      setCursor(pagina.proximoCursor);
      setTemMais(pagina.temMais);
      setOffline(pagina.offline);
    } catch (e) {
      if (minha !== geracao.current || ctrl.signal.aborted) return;
      setItens([]);
      setTemMais(false);
      setErro(e instanceof ErroEscolha ? e.message : 'Não foi possível carregar os equipamentos.');
    } finally {
      if (minha === geracao.current) setCarregando(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void buscar(termo);
    return () => abortador.current?.abort();
  }, [buscar, termo]);

  async function carregarMais() {
    if (!temMais || !cursor || carregandoMais) return;
    const minha = geracao.current;
    setCarregandoMais(true);
    try {
      const pagina = await paginaParaRegistro(termo, cursor);
      if (minha !== geracao.current) return;
      setItens((antigos) => {
        const vistos = new Set(antigos.map((i) => i.tag));
        return [...antigos, ...pagina.itens.filter((i) => !vistos.has(i.tag))];
      });
      setCursor(pagina.proximoCursor);
      setTemMais(pagina.temMais);
    } catch {
      setTemMais(false);
    } finally {
      setCarregandoMais(false);
    }
  }

  return (
    // fecha-pelo-fundo: só ESCOLHE o equipamento — nada digitado se perde.
    <div className="fj-modal-overlay" onClick={(e) => e.target === e.currentTarget && aoFechar()}>
      <div
        className="fj-modal-box iv4-escolha reg-escolha"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reg-escolha-tit"
        onKeyDown={(e) => e.key === 'Escape' && aoFechar()}
      >
        <div className="fj-modal-head">
          <div>
            <h2 id="reg-escolha-tit">Novo registro</h2>
            <div className="fj-eyebrow">Escolha o equipamento</div>
          </div>
          <button type="button" className="fj-modal-close" onClick={aoFechar} aria-label="Fechar">
            <Icone nome="x" tam={15} />
          </button>
        </div>
        <div className="iv4-escolha-corpo">
          <label className="lc-busca">
            <Icone nome="search" tam={16} />
            <input
              autoFocus
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Buscar por TAG, equipamento, fabricante ou cliente"
              aria-label="Buscar equipamento"
            />
          </label>
          {offline && (
            <p className="reg-escolha-aviso" role="status">
              Sem conexão: mostrando os equipamentos já baixados neste aparelho.
            </p>
          )}
          <div className="iv4-escolha-lista" aria-busy={carregando}>
            {erro ? (
              <div className="reg-escolha-estado" role="status">
                {erro}
                <button type="button" className="fj-btn fj-btn-ghost" onClick={() => void buscar(termo)}>
                  Tentar de novo
                </button>
              </div>
            ) : carregando && itens.length === 0 ? (
              <div className="reg-escolha-estado" role="status">Carregando equipamentos…</div>
            ) : itens.length === 0 ? (
              <div className="reg-escolha-estado" role="status">
                {termo ? `Nenhum equipamento encontrado para "${termo}".` : 'Nenhum equipamento cadastrado ainda.'}
              </div>
            ) : (
              itens.map((i) => (
                <button
                  key={i.tag}
                  type="button"
                  className="iv4-escolha-item"
                  onClick={() => aoEscolher(i.tag)}
                >
                  <FotoLista tipo={i.tipo} fotoRef={i.fotoRef} />
                  <span className="t">
                    <b>{i.tag}</b>
                    <small>{i.descricao || '—'}</small>
                  </span>
                  {i.pendente && <span className="reg-escolha-pendente">não sincronizado</span>}
                  <Icone nome="chevright" tam={16} className="lc-seta" />
                </button>
              ))
            )}
            {temMais && !erro && (
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
        </div>
      </div>
    </div>
  );
}
