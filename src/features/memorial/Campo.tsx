interface Props {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  options?: { value: string; label: string }[];
  disabled?: boolean;
  className?: string;
  warn?: boolean;
}

// Extrai a unidade de medida do fim do rótulo — "Pressão de Projeto P (MPa)" vira
// rótulo "Pressão de Projeto P" + sufixo "MPa" dentro da caixa (violeta, padrão
// design/painel_pmta.html). Parênteses longos (ex.: "(0.3 aparafusado)") não são unidade.
function separarUnidade(label: string): { rotulo: string; unidade: string | null } {
  const m = label.match(/^(.*?)\s*\(([^()]{1,10})\)\s*$/);
  if (!m) return { rotulo: label, unidade: null };
  return { rotulo: m[1], unidade: m[2] };
}

export default function Campo({ label, value, onChange, type = 'number', options, disabled, className, warn }: Props) {
  const vazio = warn ?? (value === '' || value === null || value === undefined);
  const { rotulo, unidade } = options ? { rotulo: label, unidade: null } : separarUnidade(label);

  return (
    <div className={`memorial-campo${vazio ? ' campo-aviso' : ''}${className ? ` ${className}` : ''}`}>
      <div className="memorial-campo-label-row">
        <label>{rotulo}</label>
        {vazio && <span className="campo-aviso-icon" title="Campo não preenchido">⚠</span>}
      </div>
      {options ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <div className={`memorial-campo-input${unidade ? ' has-unit' : ''}`}>
          <input
            type={type}
            value={value}
            step="any"
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            // roda do mouse NÃO altera o valor: perde o foco antes do incremento do
            // input number — só teclado edita
            onWheel={(e) => e.currentTarget.blur()}
          />
          {unidade && <span className="memorial-campo-unit">{unidade}</span>}
        </div>
      )}
    </div>
  );
}
