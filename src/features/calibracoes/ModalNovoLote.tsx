/**
 * Criar (ou renomear) um LOTE de calibração.
 *
 * ## Por que virou modal com campos (11/09/2026)
 *
 * "+ Novo lote" abria um campo de nome solto acima da lista e criava um
 * accordion VAZIO, que o usuário tinha de expandir para descobrir o que fazer.
 * Duas coisas ficavam de fora:
 *
 * - **a data da execução**, que o lote nunca teve — só `criadoEm` automático.
 *   Calibração de acessório costuma ser anual e é lançada dias depois de
 *   feita; a data do registro não é a data do ensaio.
 * - **quais acessórios entram**, que o lote também nunca guardou. Sem isso o
 *   "2/2" comparava com o parque de HOJE, e cadastrar um manômetro novo fazia
 *   todo lote antigo "Completo" voltar a "Em andamento".
 *
 * Os dois campos existem agora (`LoteCal.data`, `LoteCal.itens`) e são pedidos
 * aqui, de uma vez, antes de o lote existir.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import FeedbackSalvamento, { useSalvamento } from '../../components/FeedbackSalvamento';
import FotoImg from '../../components/FotoImg';
import { Icone } from '../../components/Icone';
import { mascararData } from '../../services/mascaras';
import { fotoDoComponente, type ComponenteCal, type LoteCal } from './componentesService';
import { dataDoLote } from './lote';
import '../relatorios/modalFiltrosRelatorios.css';
import './modalLote.css';

/** Uma data só vale se for dd/mm/aaaa e existir no calendário. */
export function dataValida(d: string): boolean {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((d ?? '').trim());
  if (!m) return false;
  const [dia, mes, ano] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const x = new Date(ano, mes - 1, dia);
  return x.getDate() === dia && x.getMonth() === mes - 1 && x.getFullYear() === ano;
}

export default function ModalNovoLote({
  componentes,
  lote,
  aoSalvar,
  aoFechar,
}: {
  componentes: ComponenteCal[];
  /** Lote existente = edição (nome, data e itens); ausente = criação. */
  lote?: LoteCal | null;
  aoSalvar: (v: { nome: string; data: string; itens: string[] }) => void | Promise<void>;
  aoFechar: () => void;
}) {
  const hoje = new Date().toLocaleDateString('pt-BR');
  const [nome, setNome] = useState(
    lote?.descricao ?? `Calibração ${new Date().getFullYear()}`,
  );
  const [data, setData] = useState(lote ? dataDoLote(lote) : hoje);
  const [itens, setItens] = useState<string[]>(
    // Criação começa com TODOS marcados: a rodada normal calibra o equipamento
    // inteiro, e desmarcar o que não entrou é menos trabalho do que marcar um
    // a um o que entrou.
    lote?.itens ?? componentes.map((c) => c.id),
  );
  const [busca, setBusca] = useState('');
  const salvamento = useSalvamento();
  const salvando = salvamento.salvando;
  const caixa = useRef<HTMLDivElement>(null);
  const primeiro = useRef<HTMLInputElement>(null);

  useEffect(() => {
    primeiro.current?.focus();
    primeiro.current?.select();
  }, []);

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape' && !salvando) {
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
  }, [aoFechar, salvando]);

  // A busca só aparece com muitos componentes: um campo de filtro sobre quatro
  // linhas é ruído, e é a quantidade que a maioria dos equipamentos tem.
  const temBusca = componentes.length > 6;
  const visiveis = useMemo(() => {
    const t = busca.trim().toLocaleLowerCase('pt-BR');
    if (t === '') return componentes;
    return componentes.filter((c) =>
      `${c.nome} ${c.fabricante ?? ''} ${c.serie ?? ''}`.toLocaleLowerCase('pt-BR').includes(t),
    );
  }, [busca, componentes]);

  const todosMarcados = componentes.length > 0 && itens.length === componentes.length;
  const nomeOk = nome.trim() !== '';
  const dataOk = dataValida(data);
  const podeSalvar = nomeOk && dataOk && itens.length > 0;

  function alternar(id: string) {
    setItens((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));
  }

  async function salvar() {
    if (!podeSalvar) return;
    await salvamento.executar(async () => {
      await aoSalvar({ nome: nome.trim(), data: data.trim(), itens });
    });
  }

  return (
    <div
      className="fj-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && !salvando && aoFechar()}
      role="dialog"
      aria-modal="true"
      aria-label={lote ? 'Editar lote de calibração' : 'Criar lote de calibração'}
    >
      <div className="fj-modal-box mlote-box" ref={caixa}>
        <div className="fj-modal-head">
          <div>
            <div className="fj-eyebrow">Calibrações</div>
            <h2>{lote ? 'Editar lote de calibração' : 'Criar lote de calibração'}</h2>
          </div>
          <button type="button" className="fj-modal-close" onClick={aoFechar} aria-label="Fechar">
            <Icone nome="x" tam={15} />
          </button>
        </div>

        <div className="mlote-corpo">
          <div className="mlote-grid">
            <label className="mlote-campo">
              <span>Nome do lote *</span>
              <input
                ref={primeiro}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Calibração anual 2026"
              />
            </label>
            <label className="mlote-campo">
              <span>Data da calibração *</span>
              <input
                value={data}
                onChange={(e) => setData(mascararData(e.target.value))}
                placeholder="DD/MM/AAAA"
                inputMode="numeric"
                aria-invalid={data !== '' && !dataOk}
              />
              {data !== '' && !dataOk && <em className="mlote-erro">Data inválida.</em>}
            </label>
          </div>
          {/* A data do lote SEMEIA a de cada certificado — e é a que o
              Dashboard usa como base do prazo, uma vez calibrado. */}
          <p className="mlote-nota">
            <Icone nome="info" tam={12} />
            <span>
              É a data em que a calibração foi executada. Cada certificado do lote nasce com ela, e
              pode ser ajustado individualmente.
            </span>
          </p>

          <div className="mlote-itens-topo">
            <h3>Itens que serão calibrados</h3>
            <button
              type="button"
              className="fj-btn fj-btn-ghost"
              onClick={() => setItens(todosMarcados ? [] : componentes.map((c) => c.id))}
              disabled={componentes.length === 0}
            >
              {todosMarcados ? 'Limpar seleção' : 'Selecionar todos'}
            </button>
          </div>

          {temBusca && (
            <div className="mlote-busca">
              <Icone nome="search" tam={14} />
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar componente…"
                aria-label="Buscar componente"
              />
            </div>
          )}

          {componentes.length === 0 ? (
            <p className="mlote-vazio">
              Nenhum componente cadastrado neste equipamento. Cadastre as válvulas e os manômetros
              antes de abrir um lote.
            </p>
          ) : (
            <ul className="mlote-itens">
              {visiveis.map((c) => {
                const marcado = itens.includes(c.id);
                return (
                  <li key={c.id}>
                    <label className={`mlote-item${marcado ? ' marcado' : ''}`}>
                      <input type="checkbox" checked={marcado} onChange={() => alternar(c.id)} />
                      <span className="mlote-item-foto" aria-hidden>
                        {fotoDoComponente(c) ? (
                          <FotoImg foto={fotoDoComponente(c)} alt="" placeholder="" variante="thumb" />
                        ) : (
                          <Icone nome={c.tipo === 'psv' ? 'valvula-psv' : 'manometro'} tam={18} />
                        )}
                      </span>
                      <span className="mlote-item-txt">
                        <strong>{c.nome}</strong>
                        <em>
                          {c.tipo === 'psv' ? 'Válvula de segurança' : 'Manômetro'}
                          {[c.fabricante, c.modelo, c.serie && `S/N ${c.serie}`]
                            .filter(Boolean)
                            .map((p) => ` · ${p}`)
                            .join('')}
                        </em>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mlote-acoes">
          <span className="mlote-contagem" role="status">
            {itens.length} de {componentes.length} selecionado{itens.length === 1 ? '' : 's'}
          </span>
          <button type="button" className="fj-btn fj-btn-ghost" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </button>
          <button
            type="button"
            className={`fj-btn fj-btn-primary${salvando ? ' is-loading' : ''}`}
            onClick={() => void salvar()}
            disabled={!podeSalvar || salvando}
          >
            {salvando ? 'Salvando…' : lote ? 'Salvar alterações' : 'Criar lote'}
          </button>
        </div>
      </div>

      <FeedbackSalvamento
        estado={salvamento.estado}
        erro={salvamento.erro}
        aoTentarNovamente={() => void salvar()}
        aoFechar={salvamento.limpar}
      />
    </div>
  );
}
