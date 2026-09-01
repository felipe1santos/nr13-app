import { Icone, type NomeIcone } from '../../components/Icone';
import { fmtBytes, fmtPercentual } from '../../pages/adminMetricas';
import {
  MENSALIDADE_PADRAO,
  fmtBRL,
  somaSerie,
  variacaoPercentual,
  type PontoSerie,
} from './painelAdmin';
import { BarraCota, Sparkline } from './Sparkline';
import type { InfraSupabase } from './infraSupabase';

/**
 * Visão Geral — o dashboard do painel admin.
 *
 * Arranjo espelhado do painel do Supabase: faixa de status à esquerda, cartão do
 * projeto à direita, séries diárias embaixo. Componente separado do `Admin.tsx`
 * de propósito: a página já passa de 1700 linhas, e o que esta tela faz (ler
 * números e desenhar) não tem nada em comum com o que a página faz (administrar
 * contas).
 *
 * REGRA: nenhum cartão inventa número. Métrica que não veio aparece como "—"
 * com o motivo ao lado. Zero é um valor e seria lido como "não consumiu nada".
 */

export interface SeriesVisao {
  acessos: PontoSerie[];
  cadastros: PontoSerie[];
  relatorios: PontoSerie[];
  equipamentos: PontoSerie[];
  inspecoes: PontoSerie[];
  requisicoes: PontoSerie[] | null;
}

export interface TotaisParque {
  banco: number;
  bucket: number;
  base64: number;
  equipamentos: number;
  relatorios: number;
  arquivos: number;
}

/** Cartão de status: quadrado do ícone à esquerda, rótulo miúdo, valor grande. */
function CardStatus({
  icone,
  rotulo,
  valor,
  detalhe,
  tom,
}: {
  icone: NomeIcone;
  rotulo: string;
  valor: string;
  detalhe?: string;
  tom?: 'verde' | 'ambar';
}) {
  return (
    <div className={`adm-status${tom ? ` ${tom}` : ''}`}>
      <span className="adm-status-ico">
        <Icone nome={icone} tam={18} />
      </span>
      <div className="adm-status-txt">
        <span className="adm-status-rot">{rotulo}</span>
        <strong className="adm-status-val">{valor}</strong>
        {detalhe && <small className="adm-status-det">{detalhe}</small>}
      </div>
    </div>
  );
}

/** Cartão de gráfico: título, total do período, variação e a linha. */
function CardSerie({
  titulo,
  serie,
  cor,
  nota,
}: {
  titulo: string;
  serie: PontoSerie[];
  cor?: string;
  nota?: string;
}) {
  const total = somaSerie(serie);
  const variacao = variacaoPercentual(serie);
  return (
    <div className="adm-grafico">
      <div className="adm-grafico-topo">
        <span className="adm-grafico-tit">{titulo}</span>
        {variacao !== null && (
          <span className={`adm-delta${variacao >= 0 ? ' sobe' : ' desce'}`}>
            {variacao >= 0 ? '▲' : '▼'} {Math.abs(variacao)}%
          </span>
        )}
      </div>
      <strong className="adm-grafico-num">{total.toLocaleString('pt-BR')}</strong>
      <Sparkline serie={serie} cor={cor} rotulo={titulo} />
      <div className="adm-grafico-eixo">
        <span>{serie[0]?.dia ?? ''}</span>
        <span>{serie[serie.length - 1]?.dia ?? ''}</span>
      </div>
      {nota && <small className="adm-grafico-nota">{nota}</small>}
    </div>
  );
}

export default function PainelVisaoGeral({
  series,
  janela,
  setJanela,
  infra,
  totais,
  resumo,
  assinantes,
  serieUsoAusente,
}: {
  series: SeriesVisao;
  janela: 7 | 30 | 90;
  setJanela: (j: 7 | 30 | 90) => void;
  infra: InfraSupabase | null;
  totais: TotaisParque;
  resumo: { total: number; pendentes: number; ativosHoje: number; vencendo: number };
  assinantes: number;
  serieUsoAusente: boolean;
}) {
  const somaArmazenamento = totais.banco + totais.bucket;
  const fracaoB64 = totais.banco ? totais.base64 / totais.banco : null;
  const acessosPeriodo = somaSerie(series.acessos);
  const notaSerie = serieUsoAusente
    ? 'Rode supabase/admin_series.sql para popular'
    : 'atividade por dia';

  return (
    <section className="adm-visao">
      <div className="adm-hero">
        <div className="adm-status-grade">
          <CardStatus
            icone="users"
            rotulo="Assinantes"
            valor={String(assinantes)}
            detalhe={`${resumo.total} contas no total`}
            tom="verde"
          />
          <CardStatus
            icone="trendup"
            rotulo="Receita mensal"
            valor={fmtBRL(assinantes * MENSALIDADE_PADRAO)}
            detalhe={`${fmtBRL(MENSALIDADE_PADRAO)} por assinante`}
            tom="verde"
          />
          <CardStatus
            icone="clock"
            rotulo="Ativos hoje"
            valor={String(resumo.ativosHoje)}
            detalhe={`${acessosPeriodo} acessos em ${janela} dias`}
          />
          <CardStatus
            icone="alerttri"
            rotulo="Vencendo em 30 dias"
            valor={String(resumo.vencendo)}
            detalhe={`${resumo.pendentes} pendente(s) de liberação`}
            tom={resumo.vencendo > 0 ? 'ambar' : undefined}
          />
          <CardStatus
            icone="cylinder"
            rotulo="Equipamentos"
            valor={totais.equipamentos.toLocaleString('pt-BR')}
            detalhe={`${totais.relatorios.toLocaleString('pt-BR')} relatórios emitidos`}
          />
          <CardStatus
            icone="box"
            rotulo="Armazenamento"
            valor={fmtBytes(somaArmazenamento)}
            detalhe={`${fmtBytes(totais.banco)} banco · ${fmtBytes(totais.bucket)} arquivos`}
          />
        </div>

        {/* Cartão do projeto — o "Primary Database" do painel do Supabase. Sem a
            Edge `admin_infra` publicada, os campos de infra ficam em "—" com a
            instrução do que fazer; o que dá para medir no próprio banco (banco e
            storage) continua real e é usado como fallback. */}
        <aside className="adm-infra">
          <div className="adm-infra-head">
            <span className="adm-infra-ico">
              <Icone nome="box" tam={16} />
            </span>
            <div>
              <strong>Projeto Supabase</strong>
              <small>
                {infra?.regiao ?? 'região não informada'}
                {infra?.plano ? ` · ${infra.plano}` : ''}
              </small>
            </div>
          </div>

          <ul className="adm-infra-lista">
            <li>
              <div className="adm-infra-rot">
                <span>Egress</span>
                <strong>
                  {fmtBytes(infra?.egressBytes ?? null)}
                  {infra?.egressCotaBytes ? ` / ${fmtBytes(infra.egressCotaBytes)}` : ''}
                </strong>
              </div>
              <BarraCota usado={infra?.egressBytes ?? null} cota={infra?.egressCotaBytes ?? null} />
            </li>
            <li>
              <div className="adm-infra-rot">
                <span>Banco de dados</span>
                <strong>
                  {fmtBytes(infra?.dbBytes ?? totais.banco)}
                  {infra?.dbCotaBytes ? ` / ${fmtBytes(infra.dbCotaBytes)}` : ''}
                </strong>
              </div>
              <BarraCota usado={infra?.dbBytes ?? totais.banco} cota={infra?.dbCotaBytes ?? null} />
            </li>
            <li>
              <div className="adm-infra-rot">
                <span>Storage</span>
                <strong>
                  {fmtBytes(infra?.storageBytes ?? totais.bucket)}
                  {infra?.storageCotaBytes ? ` / ${fmtBytes(infra.storageCotaBytes)}` : ''}
                </strong>
              </div>
              <BarraCota
                usado={infra?.storageBytes ?? totais.bucket}
                cota={infra?.storageCotaBytes ?? null}
              />
            </li>
          </ul>

          <div className="adm-infra-chips">
            <span>
              CPU <b>{infra?.cpu != null ? `${Math.round(infra.cpu)}%` : '—'}</b>
            </span>
            <span>
              RAM <b>{infra?.ram != null ? `${Math.round(infra.ram)}%` : '—'}</b>
            </span>
            <span>
              Disco <b>{infra?.disco != null ? `${Math.round(infra.disco)}%` : '—'}</b>
            </span>
          </div>

          {infra === null ? (
            <p className="adm-infra-nota">
              Egress, requisições e CPU/RAM vêm da Management API do Supabase, que exige um
              Personal Access Token da conta — token que <strong>não pode ir no bundle</strong>,
              porque o bundle é arquivo público. Publique a Edge Function <code>admin_infra</code>{' '}
              e configure os secrets <code>SUPABASE_PAT</code> e <code>SUPABASE_PROJECT_REF</code>{' '}
              para estes campos saírem de "—". Os demais números desta tela vêm do próprio banco e
              já são reais.
            </p>
          ) : (
            infra.falhas.length > 0 && (
              <p className="adm-infra-nota">Não foi possível ler: {infra.falhas.join(' · ')}</p>
            )
          )}
        </aside>
      </div>

      <div className="adm-serie-head">
        <div className="adm-serie-resumo">
          <strong>{acessosPeriodo.toLocaleString('pt-BR')}</strong> acessos ·{' '}
          <strong>{somaSerie(series.relatorios).toLocaleString('pt-BR')}</strong> relatórios no
          período
        </div>
        <div className="adm-janela">
          {([7, 30, 90] as const).map((d) => (
            <button
              key={d}
              type="button"
              className={janela === d ? 'ativa' : ''}
              onClick={() => setJanela(d)}
            >
              {d} dias
            </button>
          ))}
        </div>
      </div>

      <div className="adm-graficos">
        <CardSerie titulo="Acessos ao sistema" serie={series.acessos} />
        <CardSerie titulo="Contas cadastradas" serie={series.cadastros} cor="var(--adm-azul)" />
        <CardSerie titulo="Relatórios" serie={series.relatorios} cor="var(--adm-roxo)" nota={notaSerie} />
        <CardSerie
          titulo="Equipamentos"
          serie={series.equipamentos}
          cor="var(--adm-ambar)"
          nota={notaSerie}
        />
        <CardSerie titulo="Inspeções" serie={series.inspecoes} cor="var(--adm-ciano)" nota={notaSerie} />
        {series.requisicoes ? (
          <CardSerie
            titulo="Requisições à API"
            serie={series.requisicoes}
            nota="Management API do Supabase"
          />
        ) : (
          <div className="adm-grafico vazio">
            <div className="adm-grafico-topo">
              <span className="adm-grafico-tit">Requisições à API</span>
            </div>
            <strong className="adm-grafico-num">—</strong>
            <small className="adm-grafico-nota">
              Precisa da Edge <code>admin_infra</code> publicada.
            </small>
          </div>
        )}
      </div>

      <p className="adm-rodape-nota">
        "Atividade por dia" conta escritas em <code>app_storage</code>, não criações: editar a
        ficha de um vaso antigo o traz para o dia de hoje. Acessos e cadastros têm carimbo de tempo
        real e são exatos. Ainda em base64 no banco: {fmtBytes(totais.base64)} (
        {fmtPercentual(fracaoB64)}).
      </p>
    </section>
  );
}
