// Campo conclusivo do ensaio (APROVADO/REPROVADO) — mobile-first, padrão Forja.
// Tocar na opção já selecionada desmarca (volta a "sem resultado"), igual à RespostaSegmentada.
export type ResultadoEnsaioValor = '' | 'aprovado' | 'reprovado';

const OPCOES: { value: Exclude<ResultadoEnsaioValor, ''>; label: string; cor: string; bgAtivo: string }[] = [
  { value: 'aprovado', label: 'APROVADO', cor: '#16a34a', bgAtivo: '#16a34a' },
  { value: 'reprovado', label: 'REPROVADO', cor: '#dc2626', bgAtivo: '#dc2626' },
];

export default function ResultadoEnsaio({
  valor,
  onChange,
}: {
  valor: ResultadoEnsaioValor;
  onChange: (v: ResultadoEnsaioValor) => void;
}) {
  return (
    <div className="formulario-secao">
      <h3>Resultado do Ensaio</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
        Resultado conclusivo — injetado automaticamente no "Resumo do que foi inspecionado" do relatório.
      </p>
      <div role="radiogroup" aria-label="Resultado do ensaio" style={{ display: 'flex', gap: 10 }}>
        {OPCOES.map((o) => {
          const ativa = valor === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={ativa}
              onClick={() => onChange(ativa ? '' : o.value)}
              style={{
                flex: 1,
                padding: '14px 8px',
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: '0.04em',
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                border: ativa ? `2px solid ${o.cor}` : '2px solid var(--border-solid)',
                background: ativa ? o.bgAtivo : 'transparent',
                color: ativa ? '#fff' : 'var(--text-muted)',
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
