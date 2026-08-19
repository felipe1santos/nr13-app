import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icone } from './Icone';
import { ler } from '../services/storage';
import { parseDataFlex, textoPrazo } from '../services/vencimentos';
import type { ItemVencimento } from '../services/vencimentos';
import { listarHistorico } from '../features/relatorios/relatoriosService';
import { listarCalibracoes } from '../features/calibracoes/calibracaoService';
import type { DadosCalibracao } from '../features/calibracoes/tipos';
import type { CategoriaSalva, InfoEquipamento } from '../features/equipamento/tipos';
import './modal-detalhe-equipamento.css';
import { rotaEquipamento } from '../app/rotas';

const ROTULO_TIPO: Record<string, string> = {
  vaso: 'Vaso de Pressão',
  caldeira: 'Caldeira',
  autoclave: 'Autoclave',
};

/** Agrupa certificados por componente (mesma regra do motor de vencimentos):
 *  o mais recente define o prazo; os demais ficam como histórico de documentos. */
function agruparAcessorios(cals: DadosCalibracao[]): { atual: DadosCalibracao; docs: DadosCalibracao[] }[] {
  const porComp = new Map<string, DadosCalibracao[]>();
  for (const cal of cals) {
    const chave = cal.componenteId ?? `nome:${cal.nome ?? cal.id}`;
    const grupo = porComp.get(chave) ?? [];
    grupo.push(cal);
    porComp.set(chave, grupo);
  }
  const ts = (c: DadosCalibracao) => parseDataFlex(c.dataProxCalibracao)?.getTime() ?? 0;
  return [...porComp.values()].map((grupo) => {
    const ordenado = [...grupo].sort((a, b) => ts(b) - ts(a));
    return { atual: ordenado[0], docs: ordenado };
  });
}

function StatusPrazoTexto({ item }: { item: ItemVencimento | undefined }) {
  if (!item || item.status === 'semPrazo') return <span className="det-muted">Sem prazo cadastrado</span>;
  const cls = item.status === 'crit' ? 'crit' : item.status === 'warn' ? 'warn' : 'ok';
  return <span className={`det-prazo ${cls}`}>{textoPrazo(item)}</span>;
}

interface Props {
  tag: string;
  itens: ItemVencimento[];
  onClose: () => void;
}

export default function ModalDetalheEquipamento({ tag, itens, onClose }: Props) {
  const navigate = useNavigate();

  const info = useMemo(() => ler<InfoEquipamento>(`nr13_info_${tag}`), [tag]);
  const categoria = useMemo(() => ler<CategoriaSalva>(`nr13_cat_${tag}`), [tag]);

  // Último relatório feito — é dele que o painel tira o prazo do equipamento.
  // O índice já vem ordenado do mais recente para o mais antigo, e todos os
  // campos exibidos aqui (código, tipo, execução, emissão, próximas) estão nele:
  // o relatório completo não é carregado.
  const ultimoRel = useMemo(() => listarHistorico(tag)[0] ?? null, [tag]);

  const acessorios = useMemo(() => agruparAcessorios(listarCalibracoes(tag)), [tag]);

  const itemEquip = itens.find((i) => i.origem === 'inspecao' && i.tag === tag);
  const itemDoAcessorio = (cal: DadosCalibracao): ItemVencimento | undefined =>
    itens.find(
      (i) =>
        i.origem === 'calibracao' &&
        i.pertenceA === tag &&
        (cal.serie ? i.tag.endsWith(`-${cal.serie}`) : i.nome === (cal.nome?.trim() || i.nome)),
    );

  const tipoRotulo = info ? (ROTULO_TIPO[info.tipo] ?? 'Equipamento') : 'Equipamento';

  return (
    <div className="fj-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fj-modal-box det-box">
        <div className="fj-modal-head">
          <div>
            <div className="fj-eyebrow">{tipoRotulo}</div>
            <h2>{tag}{info?.descricao ? ` · ${info.descricao}` : ''}</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <StatusPrazoTexto item={itemEquip} />
            <button type="button" className="fj-modal-close" onClick={onClose} aria-label="Fechar">
              <Icone nome="x" tam={15} />
            </button>
          </div>
        </div>

        <div className="det-corpo">
          {/* ── Dados do equipamento ── */}
          <div className="det-secao">
            <div className="det-secao-titulo">Dados do equipamento</div>
            <div className="det-grid">
              <div><span>Tipo</span><b>{tipoRotulo}{info?.subtipo ? ` (${info.subtipo})` : ''}</b></div>
              <div><span>Fabricante</span><b>{info?.fabricante || '—'}</b></div>
              <div><span>Ano</span><b>{info?.ano || '—'}</b></div>
              <div><span>Nº de série</span><b>{info?.numeroSerie || '—'}</b></div>
              <div><span>Categoria NR-13</span><b>{categoria?.catFinal || '—'}</b></div>
            </div>
          </div>

          {/* ── Última inspeção / prazos ── */}
          <div className="det-secao">
            <div className="det-secao-titulo">Última inspeção e prazos</div>
            {ultimoRel ? (
              <div className="det-grid">
                <div><span>Relatório</span><b className="mono">{ultimoRel.codigo}</b></div>
                <div><span>Tipo</span><b>{ultimoRel.tipo}</b></div>
                <div><span>Execução</span><b className="mono">{ultimoRel.execucaoInspecao || "—"}</b></div>
                <div><span>Emissão</span><b className="mono">{ultimoRel.emissao || "—"}</b></div>
                <div><span>Próx. interna</span><b className="mono">{ultimoRel.proximaInspecaoInterna || "—"}</b></div>
                <div><span>Próx. externa</span><b className="mono">{ultimoRel.proximaInspecaoExterna || "—"}</b></div>
                <div>
                  <span>Vencimento (painel)</span>
                  <b className="mono">{itemEquip?.vencimento ? itemEquip.vencimento.toLocaleDateString('pt-BR') : '—'}</b>
                </div>
                <div><span>Situação</span><StatusPrazoTexto item={itemEquip} /></div>
              </div>
            ) : (
              <div className="det-muted">
                Nenhum relatório gerado ainda. O prazo do painel passa a valer a partir do primeiro
                relatório salvo (datas de Próx. Interna/Externa nas Configurações do Relatório).
              </div>
            )}
          </div>

          {/* ── Acessórios e calibrações ── */}
          <div className="det-secao">
            <div className="det-secao-titulo">
              Acessórios ({acessorios.length})
            </div>
            {acessorios.length === 0 ? (
              <div className="det-muted">Nenhuma calibração cadastrada para este equipamento.</div>
            ) : (
              acessorios.map(({ atual, docs }) => {
                const itemAc = itemDoAcessorio(atual);
                return (
                  <div key={atual.componenteId ?? atual.id} className="det-acessorio">
                    <div className="det-ac-head">
                      <div className="det-ac-ico">
                        <Icone nome={atual.tipo === 'psv' ? 'valvula-psv' : 'manometro'} tam={16} />
                      </div>
                      <div className="det-ac-main">
                        <div className="det-ac-nome">
                          {atual.nome?.trim() || (atual.tipo === 'psv' ? 'Válvula de Segurança' : 'Manômetro')}
                          {atual.serie && <span className="mono det-ac-serie"> · SN {atual.serie}</span>}
                        </div>
                        <div className="det-ac-sub">
                          Última calibração: <b className="mono">{atual.dataCalibracao || '—'}</b>
                          {' · '}Próxima: <b className="mono">{atual.dataProxCalibracao || '—'}</b>
                        </div>
                      </div>
                      <StatusPrazoTexto item={itemAc} />
                    </div>
                    <div className="det-ac-docs">
                      {docs.map((d) => (
                        <div key={d.id} className="det-doc">
                          <Icone nome="filetext" tam={13} />
                          <span className="mono">{d.numeroCertificado || d.id}</span>
                          <span className="det-doc-data mono">{d.dataCalibracao || d.criadoEm}</span>
                          {d.statusConclusao && (
                            <span className={`det-doc-status ${d.statusConclusao}`}>
                              {d.statusConclusao === 'aprovado' ? 'Aprovado' : 'Reprovado'}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="det-acoes">
          <button type="button" className="fj-btn fj-btn-ghost" onClick={() => navigate('/calibracoes')}>
            <Icone nome="sliders" tam={13} /> Calibrações
          </button>
          <button type="button" className="fj-btn fj-btn-primary" onClick={() => navigate(rotaEquipamento(tag))}>
            Abrir ficha completa <Icone nome="arrowright" tam={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
