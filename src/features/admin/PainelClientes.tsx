import { useMemo, useState } from 'react';
import { rotuloStatusAssinatura } from '../../services/assinatura';
import { fmtBytes, fmtPercentual, fracaoBase64, ordenarPorConsumo, type StorageStats, type UsoStats } from '../../pages/adminMetricas';
import { fmtBRL, type Faturamento } from './painelAdmin';
import { ROTULO_TAG, TAGS, type TagConta } from './classificarConta';

/**
 * A ABA ÚNICA DE CLIENTES (21/09/2026).
 *
 * ## O que ela substitui
 *
 * O painel tinha cinco abas. "Faturamento" mostrava receita e uso por conta;
 * "Clientes pagantes" mostrava as mesmas contas com outras colunas e as ações;
 * "Testes e expirados" e "Leads" acompanhavam o trial, que saiu do produto; e
 * "Sub-logins" listava contas que o dono não administra uma a uma.
 *
 * Eram três telas para responder uma pergunta só — *quem são meus clientes,
 * quanto pagam e o que estão fazendo* — e a resposta ficava partida: o valor
 * numa aba, o botão de suspender em outra, o consumo numa terceira.
 *
 * Aqui é uma tela: KPIs, ocupação do servidor, a lista com tag e mensalidade
 * editáveis, e as ações no fim de cada linha.
 *
 * ## O que virou modal, e por quê
 *
 * O consumo POR CONTA (banco, bucket, base64, legado) é dado de diagnóstico:
 * ele importa quando alguém pergunta "por que esta conta ocupa tanto", e não a
 * cada olhada na lista. Como coluna, ele empurrava a tabela para a rolagem
 * horizontal; como modal, abre sob demanda e a lista respira.
 *
 * O cadastro de cliente também: era um formulário permanente no meio da
 * página, ocupando altura fixa para uma ação eventual.
 *
 * ## O que este componente NÃO faz
 *
 * Não grava nada. Toda escrita sai por callback para a página, que é quem fala
 * com o Supabase — o painel é filho, e um import de volta fecharia um ciclo.
 */

export interface ContaCliente {
  id: string;
  email: string | null;
  criado_em: string | null;
  ativo: boolean;
  assinatura_status?: string | null;
  acesso_expira_em?: string | null;
  classificacao?: string | null;
  valor_mensal?: number | null;
  /** A tag EFETIVA — manual, ou a deduzida. Calculada na página. */
  tag: TagConta;
}

export interface MetaLogin {
  last_sign_in_at: string | null;
}

export interface MetricaSessao {
  sessoesTotal: number;
}

function data(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
}

export default function PainelClientes({
  faturamento,
  contas,
  uso,
  storage,
  metas,
  metricas,
  ocupado,
  busca,
  onBusca,
  onTag,
  onMensalidade,
  onNovoCliente,
  acoes,
}: {
  faturamento: Faturamento;
  contas: ContaCliente[];
  uso: Map<string, UsoStats>;
  storage: Map<string, StorageStats>;
  metas: Map<string, MetaLogin>;
  metricas: Map<string, MetricaSessao>;
  ocupado: string | null;
  busca: string;
  onBusca: (v: string) => void;
  onTag: (c: ContaCliente, tag: TagConta) => void;
  onMensalidade: (c: ContaCliente, valor: string) => void;
  onNovoCliente: () => void;
  /** As ações daquela linha (suspender, validade, excluir…), montadas na página. */
  acoes: (c: ContaCliente) => React.ReactNode;
}) {
  const [consumoDe, setConsumoDe] = useState<ContaCliente | null>(null);

  // ── OCUPAÇÃO DO SERVIDOR, em seis quadros compactos ───────────────────────
  const ocupacao = useMemo(() => {
    const linhas = [...uso.values()];
    const arquivos = [...storage.values()];
    const soma = (f: (u: UsoStats) => number) => linhas.reduce((a, u) => a + (f(u) ?? 0), 0);
    return {
      banco: soma((u) => u.bytes_total ?? 0),
      base64: soma((u) => u.bytes_base64 ?? 0),
      legado: soma((u) => u.bytes_legado ?? 0),
      legadoPendente: soma((u) => u.relatorios_legado ?? 0),
      bucket: arquivos.reduce((a, s) => a + (s.bytes ?? 0), 0),
      pdfs: arquivos.reduce((a, s) => a + (s.pdfs ?? 0), 0),
      fotos: arquivos.reduce((a, s) => a + (s.fotos ?? 0), 0),
      organizacoes: linhas.length,
    };
  }, [uso, storage]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return q ? contas.filter((c) => (c.email ?? '').toLowerCase().includes(q)) : contas;
  }, [contas, busca]);

  return (
    <section className="adm-faturamento adm-clientes">
      {/* ── TOPO: receita + a porta de entrada de um cliente novo ──────────── */}
      <div className="adm-clientes-topo">
        <div className="adm-kpis">
          <div className="adm-kpi destaque">
            <span className="adm-kpi-rot">Receita mensal (MRR)</span>
            <strong className="adm-kpi-val">{fmtBRL(faturamento.mrr)}</strong>
            <small>
              {faturamento.assinantes} pagante(s) · soma das mensalidades
            </small>
          </div>
          <div className="adm-kpi">
            <span className="adm-kpi-rot">Receita anual projetada</span>
            <strong className="adm-kpi-val">{fmtBRL(faturamento.anual)}</strong>
            <small>MRR × 12, mantida a base atual</small>
          </div>
          <div className="adm-kpi">
            <span className="adm-kpi-rot">Contas no sistema</span>
            <strong className="adm-kpi-val">{contas.length}</strong>
            <small>{contas.filter((c) => c.tag === 'vitalicio').length} vitalícia(s)</small>
          </div>
        </div>
        <button type="button" className="adm-btn-novo" onClick={onNovoCliente}>
          + Novo cliente
        </button>
      </div>

      {/* ── OCUPAÇÃO DO SERVIDOR: só os números do enchimento ──────────────── */}
      <div className="adm-ocupacao">
        <span className="adm-ocupacao-rot">Ocupação</span>
        <div className="adm-ocupacao-quadros">
          <div className="adm-quadro">
            <span>Banco</span>
            <strong>{fmtBytes(ocupacao.banco)}</strong>
            <small>{ocupacao.organizacoes} org.</small>
          </div>
          <div className="adm-quadro">
            <span>Bucket</span>
            <strong>{fmtBytes(ocupacao.bucket)}</strong>
            <small>{ocupacao.pdfs} PDFs</small>
          </div>
          <div className="adm-quadro">
            <span>Base64 no banco</span>
            <strong>{fmtBytes(ocupacao.base64)}</strong>
            {/* PISO: conta chaves com marcador `base64,`. Dimensiona a migração
                das fotos, não declara que ela acabou. */}
            <small>{fmtPercentual(ocupacao.banco ? ocupacao.base64 / ocupacao.banco : null)} · piso</small>
          </div>
          <div className="adm-quadro">
            <span>Histórico legado</span>
            <strong>{fmtBytes(ocupacao.legado)}</strong>
            <small>{ocupacao.legadoPendente} relatório(s)</small>
          </div>
          <div className="adm-quadro">
            <span>Fotos</span>
            <strong>{ocupacao.fotos}</strong>
            <small>no bucket</small>
          </div>
          <div className="adm-quadro">
            <span>Total</span>
            <strong>{fmtBytes(ocupacao.banco + ocupacao.bucket)}</strong>
            <small>banco + bucket</small>
          </div>
        </div>
      </div>

      <input
        className="admin-busca"
        type="search"
        placeholder="Buscar por e-mail…"
        value={busca}
        onChange={(e) => onBusca(e.target.value)}
      />

      <div className="admin-tabela-wrap">
        <table className="admin-tabela">
          <thead>
            <tr>
              <th>Conta</th>
              <th title="Só a tag Pagante entra no MRR">Tag</th>
              <th>Mensalidade</th>
              <th>Status</th>
              <th>Cliente desde</th>
              <th>Último acesso</th>
              <th>Acessos</th>
              <th>Equip.</th>
              <th>Relatórios</th>
              <th>Consumo</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((c) => {
              const u = uso.get(c.id);
              const st = storage.get(c.id);
              const equipamentos = (u?.equip_vaso ?? 0) + (u?.equip_caldeira ?? 0) + (u?.equip_autoclave ?? 0);
              const consumo = (u?.bytes_total ?? 0) + (st?.bytes ?? 0);
              return (
                <tr key={c.id} className={ocupado === c.id ? 'ocupado' : ''}>
                  <td data-label="Conta" className="admin-email">
                    {c.email}
                    {!c.ativo && <span className="adm-inline-sub">acesso bloqueado</span>}
                  </td>
                  <td data-label="Tag">
                    <select
                      className="admin-sel-tag"
                      value={c.tag}
                      disabled={ocupado === c.id}
                      title={c.classificacao ? 'Definida manualmente' : 'Deduzida dos dados da conta'}
                      onChange={(e) => onTag(c, e.target.value as TagConta)}
                    >
                      {TAGS.map((t) => (
                        <option key={t} value={t}>
                          {ROTULO_TAG[t]}
                        </option>
                      ))}
                    </select>
                  </td>
                  {/* Só quem paga mostra valor. "R$ 197,00" ao lado de uma conta
                      vitalícia é a linha exata que faria alguém somar errado. */}
                  <td data-label="Mensalidade">
                    {c.tag === 'pagante' ? (
                      <input
                        className="admin-inp-valor"
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        placeholder={String(faturamento.mensalidade)}
                        defaultValue={c.valor_mensal ?? ''}
                        disabled={ocupado === c.id}
                        title="Em branco = usa o valor padrão"
                        onBlur={(e) => onMensalidade(c, e.target.value)}
                      />
                    ) : (
                      <span className="adm-inline-muted">—</span>
                    )}
                  </td>
                  <td data-label="Status">{rotuloStatusAssinatura(c.assinatura_status ?? null)}</td>
                  <td data-label="Cliente desde">{data(c.criado_em)}</td>
                  <td data-label="Último acesso">{data(metas.get(c.id)?.last_sign_in_at ?? null)}</td>
                  <td data-label="Acessos">{metricas.get(c.id)?.sessoesTotal ?? 0}</td>
                  <td data-label="Equip.">{u ? equipamentos : '—'}</td>
                  <td data-label="Relatórios">{u ? u.relatorios : '—'}</td>
                  <td data-label="Consumo">
                    <button
                      type="button"
                      className="b b-acoes"
                      onClick={() => setConsumoDe(c)}
                      title="Ver o consumo detalhado desta conta"
                    >
                      {u || st ? fmtBytes(consumo) : '—'}
                    </button>
                  </td>
                  <td data-label="Ações" className="admin-acoes">
                    {acoes(c)}
                  </td>
                </tr>
              );
            })}
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={11} className="admin-vazio">
                  {busca.trim() ? 'Nenhuma conta com esse e-mail.' : 'Nenhuma conta cadastrada.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {consumoDe && (
        <ModalConsumo
          conta={consumoDe}
          uso={uso}
          storage={storage}
          onFechar={() => setConsumoDe(null)}
        />
      )}
    </section>
  );
}

/**
 * O consumo de UMA conta, mais o ranking de quem ocupa o servidor.
 *
 * Aberto sob demanda: enquanto era coluna fixa, empurrava a tabela para a
 * rolagem horizontal todos os dias por um dado que se olha quando o Supabase
 * reclama de cota.
 */
function ModalConsumo({
  conta,
  uso,
  storage,
  onFechar,
}: {
  conta: ContaCliente;
  uso: Map<string, UsoStats>;
  storage: Map<string, StorageStats>;
  onFechar: () => void;
}) {
  const u = uso.get(conta.id);
  const st = storage.get(conta.id);
  const ranking = useMemo(() => ordenarPorConsumo([...uso.values()], storage).slice(0, 8), [uso, storage]);
  const posicao = ranking.findIndex((r) => r.escopo === conta.id);

  return (
    <div className="fj-modal-overlay" role="dialog" aria-modal="true" aria-label="Consumo da conta" onClick={onFechar}>
      <div className="fj-modal-box adm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fj-modal-head">
          <div>
            <div className="fj-eyebrow">Consumo</div>
            <h2>{conta.email}</h2>
          </div>
          <button type="button" className="fj-modal-close" onClick={onFechar} aria-label="Fechar">
            ×
          </button>
        </div>

        <div className="adm-modal-corpo">
          <div className="adm-ocupacao-quadros">
            <div className="adm-quadro">
              <span>Banco</span>
              <strong>{fmtBytes(u?.bytes_total ?? null)}</strong>
              <small>{u?.chaves_total ?? 0} chaves</small>
            </div>
            <div className="adm-quadro">
              <span>Bucket</span>
              <strong>{fmtBytes(st?.bytes ?? null)}</strong>
              <small>{st?.pdfs ?? 0} PDFs · {st?.fotos ?? 0} fotos</small>
            </div>
            <div className="adm-quadro">
              <span>Base64 no banco</span>
              <strong>{fmtBytes(u?.bytes_base64 ?? null)}</strong>
              <small>{u ? fmtPercentual(fracaoBase64(u)) : '—'} do banco</small>
            </div>
            <div className="adm-quadro">
              <span>Histórico legado</span>
              <strong>{fmtBytes(u?.bytes_legado ?? null)}</strong>
              <small>{u?.relatorios_legado ?? 0} relatório(s)</small>
            </div>
          </div>

          <table className="admin-tabela-consumo">
            <thead>
              <tr>
                <th>#</th>
                <th>Organização</th>
                <th>Banco</th>
                <th>Bucket</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((r, i) => (
                <tr key={r.escopo} className={r.escopo === conta.id ? 'adm-linha-alvo' : ''}>
                  <td>{i + 1}</td>
                  <td>{r.escopo === conta.id ? conta.email : `org ${r.escopo.slice(0, 8)}`}</td>
                  <td>{fmtBytes(r.bytesBanco)}</td>
                  <td>{fmtBytes(r.bytesBucket)}</td>
                  <td>{fmtBytes(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="admin-nota">
            {posicao >= 0
              ? `Esta conta é a ${posicao + 1}ª que mais ocupa espaço.`
              : 'Esta conta está fora das 8 que mais ocupam espaço.'}
          </p>
        </div>
      </div>
    </div>
  );
}
