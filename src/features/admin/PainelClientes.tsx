import { useMemo, useState } from 'react';
import { rotuloStatusAssinatura } from '../../services/assinatura';
import { fmtBytes, fmtPercentual, fracaoBase64, ordenarPorConsumo, type StorageStats, type UsoStats } from '../../pages/adminMetricas';
import { fmtBRL, type Faturamento } from './painelAdmin';
import { ROTULO_TAG, type TagConta } from './classificarConta';
import { fracaoDaBarra, nivelDeOcupacao, rotuloDeOcupacao } from './coresPainel';
import type { InfraSupabase } from './infraSupabase';

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
  onEditar,
  onNovoCliente,
  infra,
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
  /** Abre o modal daquela conta — a lista é só leitura. */
  onEditar: (c: ContaCliente) => void;
  onNovoCliente: () => void;
  /** Cotas REAIS do plano, para a ocupação ter cor. `null` = sem a Edge. */
  infra: InfraSupabase | null;
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

      {/* ── OCUPAÇÃO DO SERVIDOR ───────────────────────────────────────────
          A cor sai da COTA REAL do plano (Management API), nunca de um teto
          inventado aqui: âmbar a partir de 75%, vermelho a partir de 90%. Sem
          cota conhecida o quadro fica no seu tom de repouso — pintar de
          vermelho um número sem referência é inventar um alarme. */}
      <div className="adm-ocupacao">
        <span className="adm-ocupacao-rot">Ocupação do servidor</span>
        <div className="adm-ocupacao-quadros">
          <Quadro
            rotulo="Banco"
            valor={fmtBytes(infra?.dbBytes ?? ocupacao.banco)}
            usado={infra?.dbBytes ?? ocupacao.banco}
            cota={infra?.dbCotaBytes ?? null}
            nota={`${ocupacao.organizacoes} organizações`}
            tom="azul"
          />
          <Quadro
            rotulo="Arquivos (bucket)"
            valor={fmtBytes(infra?.storageBytes ?? ocupacao.bucket)}
            usado={infra?.storageBytes ?? ocupacao.bucket}
            cota={infra?.storageCotaBytes ?? null}
            nota={`${ocupacao.pdfs} PDFs · ${ocupacao.fotos} fotos`}
            tom="roxo"
          />
          <Quadro
            rotulo="Egress do ciclo"
            valor={fmtBytes(infra?.egressBytes ?? null)}
            usado={infra?.egressBytes ?? null}
            cota={infra?.egressCotaBytes ?? null}
            nota="tráfego de saída"
            tom="ambar"
          />
          <Quadro
            rotulo="Base64 no banco"
            valor={fmtBytes(ocupacao.base64)}
            usado={ocupacao.base64}
            cota={ocupacao.banco || null}
            nota="piso · migração para o bucket"
            tom="roxo"
          />
          <Quadro
            rotulo="Histórico legado"
            valor={fmtBytes(ocupacao.legado)}
            usado={null}
            cota={null}
            nota={`${ocupacao.legadoPendente} relatório(s)`}
            tom="neutro"
          />
          <Quadro
            rotulo="Total em uso"
            valor={fmtBytes(ocupacao.banco + ocupacao.bucket)}
            usado={null}
            cota={null}
            nota="banco + arquivos"
            tom="verde"
          />
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
                  {/* ETIQUETA, não seletor: a lista é lida muito mais do que
                      alterada, e um clique errado no seletor trocava a
                      classificação de um cliente direto no banco. */}
                  <td data-label="Tag">
                    <span
                      className={`adm-tag adm-tag-${c.tag}`}
                      title={c.classificacao ? 'Definida manualmente' : 'Deduzida dos dados da conta'}
                    >
                      {ROTULO_TAG[c.tag]}
                    </span>
                  </td>
                  {/* Só quem paga mostra valor. "R$ 197,00" ao lado de uma conta
                      vitalícia é a linha exata que faria alguém somar errado. */}
                  <td data-label="Mensalidade">
                    {c.tag === 'pagante' ? (
                      <span className="adm-valor">
                        {fmtBRL(c.valor_mensal ?? faturamento.mensalidade)}
                        {c.valor_mensal == null && (
                          <i className="adm-tag-auto" title="usando o valor padrão do painel">
                            padrão
                          </i>
                        )}
                      </span>
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
                    <button
                      type="button"
                      className="adm-btn-editar"
                      disabled={ocupado === c.id}
                      onClick={() => onEditar(c)}
                    >
                      {ocupado === c.id ? 'Salvando…' : 'Editar'}
                    </button>
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
 * Um quadro da faixa de ocupação.
 *
 * `tom` é a cor de repouso — a identidade daquele número. O NÍVEL (âmbar,
 * vermelho) VENCE o tom quando o consumo se aproxima da cota: alarme precisa
 * ganhar da decoração.
 */
function Quadro({
  rotulo,
  valor,
  usado,
  cota,
  nota,
  tom,
}: {
  rotulo: string;
  valor: string;
  usado: number | null;
  cota: number | null;
  nota: string;
  tom: 'azul' | 'roxo' | 'verde' | 'ambar' | 'neutro';
}) {
  const nivel = nivelDeOcupacao(usado, cota);
  const fracao = fracaoDaBarra(usado, cota);
  const classe = nivel === 'desconhecido' ? `tom-${tom}` : `nivel-${nivel}`;
  return (
    <div className={`adm-quadro ${classe}`}>
      <span>{rotulo}</span>
      <strong>{valor}</strong>
      {fracao !== null ? (
        <>
          <div className="adm-barra" aria-hidden>
            <i style={{ width: `${Math.round(fracao * 100)}%` }} />
          </div>
          <small>{rotuloDeOcupacao(usado, cota)}</small>
        </>
      ) : (
        <small>{nota}</small>
      )}
    </div>
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
