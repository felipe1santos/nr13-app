/**
 * A grade de medição de espessura da CALDEIRA, no formulário de ultrassom
 * (22/10/2026). Só aparece quando o equipamento é caldeira.
 *
 * Mobile primeiro: cada região é um cartão; corpo e fornalha mostram uma linha
 * por posição ao longo do comprimento com os quatro pontos da seção (A topo,
 * B direita, C baixo, D esquerda); as demais, uma leitura por linha. A mínima e
 * a máxima de cada região aparecem embaixo — as mesmas que o relatório imprime.
 */
import { REGIOES_CALDEIRA, celula, extremosCaldeira, valorCelula, type MedicaoCaldeira, type RegiaoCaldeira } from './medicaoCaldeira';

const fmt = (n: number | null) => (n === null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export default function GradeMedicaoCaldeira({
  valor,
  aoMudar,
}: {
  valor: MedicaoCaldeira | undefined;
  aoMudar: (proximo: MedicaoCaldeira) => void;
}) {
  const m = valor ?? {};
  const extremos = extremosCaldeira(m);

  function mudar(regiao: RegiaoCaldeira, ponto: string | null, linha: string, v: string) {
    aoMudar({ ...m, [regiao]: { ...(m[regiao] ?? {}), [celula(ponto, linha)]: v } });
  }

  return (
    <div className="formulario-secao">
      <h3>Medidas Encontradas — Caldeira (mm)</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        Corpo e fornalha: pontos A (topo), B (direita), C (baixo) e D (esquerda) em cada linha ao longo do
        comprimento. Chaminé, parede da reversão e espelhos: uma leitura por linha.
      </p>
      {REGIOES_CALDEIRA.map((r) => {
        const ext = extremos.find((e) => e.regiao === r.id)!;
        return (
          <div key={r.id} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, margin: '12px 0 6px' }}>{r.titulo}</div>
            {r.pontos.length > 0 ? (
              r.linhas.map((linha) => (
                <div key={linha} className="linha-medida-card">
                  <span className="linha-medida-titulo">Linha {linha}</span>
                  <div className="linha-medida-campos">
                    {r.pontos.map((p) => (
                      <label key={p}>
                        {p}
                        <input
                          type="text"
                          inputMode="decimal"
                          aria-label={`${r.titulo} — ponto ${p}, linha ${linha}`}
                          value={valorCelula(m, r.id, p, linha)}
                          onChange={(e) => mudar(r.id, p, linha, e.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="linha-medida-card">
                <div className="linha-medida-campos" style={{ flexWrap: 'wrap' }}>
                  {r.linhas.map((linha) => (
                    <label key={linha} style={{ minWidth: 64 }}>
                      L{linha}
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={`${r.titulo} — linha ${linha}`}
                        value={valorCelula(m, r.id, null, linha)}
                        onChange={(e) => mudar(r.id, null, linha, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Mínima: <b>{fmt(ext.minima)}</b> · Máxima: <b>{fmt(ext.maxima)}</b>
            </div>
          </div>
        );
      })}
    </div>
  );
}
