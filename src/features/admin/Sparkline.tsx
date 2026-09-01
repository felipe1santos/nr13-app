import { areaSparkline, pontosSparkline, type PontoSerie } from './painelAdmin';

/**
 * Gráfico de linha miúdo, em SVG puro.
 *
 * SEM biblioteca: o projeto não tem nenhuma lib de gráfico no `package.json`, e
 * trazer uma (recharts/chart.js) para desenhar cinco linhas custaria centenas de
 * KB no bundle de TODO o app — o painel admin é uma tela só, e quem paga o
 * download é o inspetor abrindo o sistema no celular em campo.
 *
 * O `viewBox` é fixo e o SVG estica por CSS (`width:100%`), então a resolução
 * não depende do tamanho renderizado. `preserveAspectRatio="none"` é proposital:
 * a linha deve ocupar a largura toda do card, esticando na horizontal.
 */
const L = 300;
const A = 72;

export function Sparkline({
  serie,
  cor = 'var(--adm-verde)',
  rotulo,
}: {
  serie: PontoSerie[];
  cor?: string;
  rotulo?: string;
}) {
  const pontos = pontosSparkline(serie, L, A);
  const area = areaSparkline(serie, L, A);
  // `id` único por instância: dois gradientes com o mesmo id no documento fazem
  // o segundo card herdar a cor do primeiro.
  const idGrad = `spark-${cor.replace(/[^a-z0-9]/gi, '')}-${serie.length}`;

  if (!pontos) {
    return <div className="adm-spark-vazio">sem dados</div>;
  }

  return (
    <svg
      className="adm-spark"
      viewBox={`0 0 ${L} ${A}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={rotulo ?? 'série diária'}
    >
      <defs>
        <linearGradient id={idGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={cor} stopOpacity="0.28" />
          <stop offset="100%" stopColor={cor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${idGrad})`} />
      <polyline
        points={pontos}
        fill="none"
        stroke={cor}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * Barra de consumo contra uma cota. `usado`/`cota` em bytes (ou qualquer unidade
 * — só a razão importa). Cota nula = não sabemos o teto: desenha a barra vazia
 * e o rótulo diz "—", em vez de fingir 0%.
 */
export function BarraCota({ usado, cota }: { usado: number | null; cota: number | null }) {
  const fracao = usado != null && cota != null && cota > 0 ? Math.min(usado / cota, 1) : null;
  const critico = fracao != null && fracao >= 0.9;
  const atencao = fracao != null && fracao >= 0.7 && !critico;
  return (
    <div className="adm-barra">
      <span
        className={`adm-barra-fill${critico ? ' critico' : atencao ? ' atencao' : ''}`}
        style={{ width: fracao == null ? 0 : `${(fracao * 100).toFixed(1)}%` }}
      />
    </div>
  );
}
