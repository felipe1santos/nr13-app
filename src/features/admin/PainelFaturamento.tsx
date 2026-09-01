import { rotuloStatusAssinatura } from '../../services/assinatura';
import { fmtBytes, type StorageStats, type UsoStats } from '../../pages/adminMetricas';
import { fmtBRL, type Faturamento } from './painelAdmin';
import { ROTULO_TIPO, type TipoConta } from './classificarConta';

/**
 * Faturamento — receita e uso por conta.
 *
 * As contas vêm separadas em três baldes por `classificarConta`, e os TRÊS
 * aparecem na tela. Só o primeiro entra no MRR:
 *
 *  · **Pagante** — assinatura ativa ou prazo pago. É a receita.
 *  · **Vitalícia** — liberada pelo Admin, sem cobrança. Usa o sistema, não paga.
 *  · **Interna** — conta do próprio dono. Não é cliente.
 *
 * Mostrar os três é o que torna o total auditável: se uma conta cair no balde
 * errado, isso fica visível na linha dela em vez de sumir dentro da soma. Nada
 * é apagado — o filtro é sobre o total, não sobre o dado.
 *
 * As props são estruturais (o mínimo que a tabela lê) em vez de importarem
 * `Profile` do `Admin.tsx`: o painel é filho da página, e um import de volta
 * fecharia um ciclo entre os dois módulos.
 */

export interface ContaLinha {
  id: string;
  email: string | null;
  criado_em: string | null;
  assinatura_status?: string | null;
}

/** Só o campo do último login; vem da Edge `admin` (`auth_meta`). */
export interface MetaLogin {
  last_sign_in_at: string | null;
}

/** Só a contagem de sessões; calculada em `Admin.tsx` a partir de `login_events`. */
export interface MetricaSessao {
  sessoesTotal: number;
}

function fmtSomenteData(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

export default function PainelFaturamento({
  faturamento,
  assinantes,
  cortesia,
  internas,
  uso,
  storage,
  metas,
  metricas,
}: {
  faturamento: Faturamento;
  assinantes: ContaLinha[];
  cortesia: ContaLinha[];
  internas: ContaLinha[];
  uso: Map<string, UsoStats>;
  storage: Map<string, StorageStats>;
  metas: Map<string, MetaLogin>;
  metricas: Map<string, MetricaSessao>;
}) {
  // Uma lista só, com o tipo carimbado, para a tabela mostrar tudo junto.
  // Mais ativos primeiro dentro de cada balde: quem emite relatório é quem
  // sustenta a renovação.
  const porRelatorios = (a: ContaLinha, b: ContaLinha) =>
    (uso.get(b.id)?.relatorios ?? 0) - (uso.get(a.id)?.relatorios ?? 0) ||
    (a.email ?? '').localeCompare(b.email ?? '');

  const linhas: Array<ContaLinha & { tipo: TipoConta }> = [
    ...[...assinantes].sort(porRelatorios).map((c) => ({ ...c, tipo: 'pagante' as const })),
    ...[...cortesia].sort(porRelatorios).map((c) => ({ ...c, tipo: 'cortesia' as const })),
    ...[...internas].sort(porRelatorios).map((c) => ({ ...c, tipo: 'interna' as const })),
  ];

  return (
    <section className="adm-faturamento">
      <div className="adm-kpis">
        <div className="adm-kpi destaque">
          <span className="adm-kpi-rot">Receita mensal (MRR)</span>
          <strong className="adm-kpi-val">{fmtBRL(faturamento.mrr)}</strong>
          <small>
            {faturamento.assinantes} pagante(s) × {fmtBRL(faturamento.mensalidade)}
          </small>
        </div>
        <div className="adm-kpi">
          <span className="adm-kpi-rot">Receita anual projetada</span>
          <strong className="adm-kpi-val">{fmtBRL(faturamento.anual)}</strong>
          <small>MRR × 12, mantida a base atual</small>
        </div>
        <div className="adm-kpi">
          <span className="adm-kpi-rot">Contas vitalícias</span>
          <strong className="adm-kpi-val">{cortesia.length}</strong>
          <small>liberadas pelo Admin, sem cobrança</small>
        </div>
        <div className="adm-kpi">
          <span className="adm-kpi-rot">Mensalidade</span>
          <strong className="adm-kpi-val">{fmtBRL(faturamento.mensalidade)}</strong>
          <small>valor único para todos os assinantes</small>
        </div>
      </div>

      <div className="admin-tabela-wrap">
        <table className="admin-tabela">
          <thead>
            <tr>
              <th>Conta</th>
              <th>Tipo</th>
              <th>Status</th>
              <th>Mensalidade</th>
              <th>Cliente desde</th>
              <th>Último acesso</th>
              <th>Acessos</th>
              <th>Equipamentos</th>
              <th>Relatórios</th>
              <th>Consumo</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((p) => {
              const u = uso.get(p.id);
              const st = storage.get(p.id);
              const equipamentos =
                (u?.equip_vaso ?? 0) + (u?.equip_caldeira ?? 0) + (u?.equip_autoclave ?? 0);
              const consumo = (u?.bytes_total ?? 0) + (st?.bytes ?? 0);
              return (
                <tr key={p.id}>
                  <td data-label="Conta" className="admin-email">
                    {p.email}
                  </td>
                  <td data-label="Tipo">
                    <span className={`adm-tipo ${p.tipo}`}>{ROTULO_TIPO[p.tipo]}</span>
                  </td>
                  <td data-label="Status">{rotuloStatusAssinatura(p.assinatura_status ?? null)}</td>
                  {/* Só quem paga mostra valor. "R$ 197,00" ao lado de uma conta
                      vitalícia é a linha exata que faria alguém somar errado. */}
                  <td data-label="Mensalidade">
                    {p.tipo === 'pagante' ? fmtBRL(faturamento.mensalidade) : '—'}
                  </td>
                  <td data-label="Cliente desde">{fmtSomenteData(p.criado_em)}</td>
                  <td data-label="Último acesso">
                    {fmtSomenteData(metas.get(p.id)?.last_sign_in_at ?? null)}
                  </td>
                  <td data-label="Acessos">{metricas.get(p.id)?.sessoesTotal ?? 0}</td>
                  <td data-label="Equipamentos">{u ? equipamentos : '—'}</td>
                  <td data-label="Relatórios">{u ? u.relatorios : '—'}</td>
                  <td data-label="Consumo">{u || st ? fmtBytes(consumo) : '—'}</td>
                </tr>
              );
            })}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={10} className="admin-vazio">
                  Nenhuma conta ativa. Testes e expirados ficam na aba "Testes e expirados".
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="adm-rodape-nota">
        <strong>Pagante</strong> = conta vigente com assinatura na Kiwify ou prazo pago —
        só ela entra no MRR. <strong>Vitalícia</strong> = liberada pelo Admin, ativa e sem
        vencimento nenhum. <strong>Interna</strong> = conta do próprio dono do produto. Sub-logins
        não aparecem: eles usam a assinatura do cliente que os criou, e contá-los dobraria aquela
        receita. Se alguma linha estiver no tipo errado, o motivo é a conta não ter{' '}
        <code>kiwify_subscription_id</code> nem prazo gravado — dá para corrigir pelo Admin sem
        mexer em nada do banco.
      </p>
    </section>
  );
}
