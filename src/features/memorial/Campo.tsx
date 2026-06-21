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

export default function Campo({ label, value, onChange, type = 'number', options, disabled, className, warn }: Props) {
  const vazio = warn ?? (value === '' || value === null || value === undefined);

  return (
    <div className={`memorial-campo${vazio ? ' campo-aviso' : ''}${className ? ` ${className}` : ''}`}>
      <div className="memorial-campo-label-row">
        <label>{label}</label>
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
        <input type={type} value={value} step="any" onChange={(e) => onChange(e.target.value)} disabled={disabled} />
      )}
    </div>
  );
}
