/**
 * O filtro de `/equipamentos` — modal, e não quatro controles na barra.
 *
 * ## Por que um modal próprio, e não o de prontuários
 *
 * A moldura é a mesma (`modalFiltrosProntuarios.css`), mas as PERGUNTAS não
 * são: lá a primeira seção é "com/sem prontuário", que aqui não quer dizer
 * nada. Reusar aquele componente obrigaria a lista de equipamentos a exibir um
 * seletor sobre um documento que ela não lista.
 *
 * ## Dois filtros vão ao servidor, dois ficam no cliente
 *
 * `tipo` e `categoria` são parâmetros de `buscar_equipamentos`: filtram na
 * origem, exatos, sem varredura. `cliente` e `fabricante` NÃO têm parâmetro na
 * RPC — são recorte do cliente sobre as páginas já trazidas, com o mesmo teto e
 * o mesmo aviso das outras telas. As opções desses dois vêm do que já foi
 * carregado, e é por isso que o aviso existe: filtro que esconde linha calado é
 * relato de dado sumido com outro nome.
 */
import { useEffect, useRef, useState } from 'react';
import { Icone } from '../../components/Icone';
import '../prontuarios/modalFiltrosProntuarios.css';

export interface ValoresFiltroEquip {
  /** Vai na CONSULTA (parâmetro da RPC). */
  tipo: string;
  /** Vai na CONSULTA (parâmetro da RPC). */
  categoria: string;
  /** Recorte do cliente: nome exato do cliente. */
  empresa: string;
  /** Recorte do cliente: fabricante exato. */
  fabricante: string;
}

export const FILTRO_EQUIP_VAZIO: ValoresFiltroEquip = {
  tipo: '',
  categoria: '',
  empresa: '',
  fabricante: '',
};

export function temAlgumFiltroEquip(v: ValoresFiltroEquip): boolean {
  return !!(v.tipo || v.categoria || v.empresa || v.fabricante);
}

const TIPOS = [
  { valor: 'vaso', rotulo: 'Vaso de Pressão' },
  { valor: 'caldeira', rotulo: 'Caldeira' },
  { valor: 'autoclave', rotulo: 'Autoclave' },
];

const CATEGORIAS = ['I', 'II', 'III', 'IV', 'V'];

export default function ModalFiltrosEquipamentos({
  valores,
  empresas,
  fabricantes,
  varreduraIncompleta,
  aoAplicar,
  aoFechar,
}: {
  valores: ValoresFiltroEquip;
  empresas: readonly string[];
  fabricantes: readonly string[];
  /** A varredura parou no teto — o recorte do cliente pode não ver tudo. */
  varreduraIncompleta: boolean;
  aoAplicar: (v: ValoresFiltroEquip) => void;
  aoFechar: () => void;
}) {
  // RASCUNHO até o "Aplicar": é o que dá sentido ao "Cancelar".
  const [v, setV] = useState<ValoresFiltroEquip>(valores);
  const caixa = useRef<HTMLDivElement>(null);
  const primeiro = useRef<HTMLSelectElement>(null);

  const set = <K extends keyof ValoresFiltroEquip>(campo: K, valor: ValoresFiltroEquip[K]) =>
    setV((atual) => ({ ...atual, [campo]: valor }));

  useEffect(() => {
    primeiro.current?.focus();
  }, []);

  // ESC fecha; Tab circula dentro do modal — a mesma regra dos outros filtros.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        aoFechar();
        return;
      }
      if (e.key !== 'Tab' || !caixa.current) return;
      const focaveis = caixa.current.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (focaveis.length === 0) return;
      const p = focaveis[0];
      const u = focaveis[focaveis.length - 1];
      if (!e.shiftKey && document.activeElement === u) {
        e.preventDefault();
        p.focus();
      } else if (e.shiftKey && document.activeElement === p) {
        e.preventDefault();
        u.focus();
      }
    }
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aoFechar]);

  return (
    <div
      className="fj-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && aoFechar()}
      role="dialog"
      aria-modal="true"
      aria-label="Filtrar equipamentos"
    >
      <div className="fj-modal-box mfp-box" ref={caixa}>
        <div className="fj-modal-head">
          <div>
            <div className="fj-eyebrow">Equipamentos</div>
            <h2>Filtrar equipamentos</h2>
          </div>
          <button type="button" className="fj-modal-close" onClick={aoFechar} aria-label="Fechar">
            <Icone nome="x" tam={15} />
          </button>
        </div>

        <div className="mfp-corpo">
          <section className="mfp-secao">
            <h3>Tipo do equipamento</h3>
            <select ref={primeiro} value={v.tipo} onChange={(e) => set('tipo', e.target.value)}>
              <option value="">Todos os tipos</option>
              {TIPOS.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.rotulo}
                </option>
              ))}
            </select>
          </section>

          <section className="mfp-secao">
            <h3>Categoria de risco</h3>
            <select value={v.categoria} onChange={(e) => set('categoria', e.target.value)}>
              <option value="">Todas as categorias</option>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  Categoria {c}
                </option>
              ))}
            </select>
          </section>

          <section className="mfp-secao">
            <h3>Cliente</h3>
            <select value={v.empresa} onChange={(e) => set('empresa', e.target.value)}>
              <option value="">Todos os clientes</option>
              {empresas.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </section>

          <section className="mfp-secao">
            <h3>Fabricante</h3>
            <select value={v.fabricante} onChange={(e) => set('fabricante', e.target.value)}>
              <option value="">Todos os fabricantes</option>
              {fabricantes.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <p className="mfp-nota">
              Cliente e fabricante são recortados sobre os equipamentos já carregados; tipo e
              categoria filtram na consulta.
            </p>
          </section>

          {varreduraIncompleta && (
            <p className="mfp-aviso" role="status">
              <Icone nome="alerttri" tam={13} /> O parque é grande e a varredura parou no limite: o
              recorte por cliente ou fabricante pode não ter visto todos os equipamentos. Refine a
              busca para ter certeza.
            </p>
          )}
        </div>

        <div className="mfp-acoes">
          <button
            type="button"
            className="fj-btn fj-btn-ghost"
            disabled={!temAlgumFiltroEquip(v)}
            onClick={() => setV(FILTRO_EQUIP_VAZIO)}
          >
            Limpar filtros
          </button>
          <div className="mfp-acoes-dir">
            <button type="button" className="fj-btn fj-btn-ghost" onClick={aoFechar}>
              Cancelar
            </button>
            <button type="button" className="fj-btn fj-btn-primary" onClick={() => aoAplicar(v)}>
              Aplicar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
