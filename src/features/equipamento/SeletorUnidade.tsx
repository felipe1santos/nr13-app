import { FATORES_CONVERSAO, type SistemaUnidade } from '../../calc/unidades';

const OPCOES: { value: SistemaUnidade; label: string }[] = [
  { value: 'SI', label: `SI (${FATORES_CONVERSAO.SI.labelPressao})` },
  { value: 'TECNICO', label: `Técnico (${FATORES_CONVERSAO.TECNICO.labelPressao})` },
  { value: 'PETROBRAS', label: `Petrobras (${FATORES_CONVERSAO.PETROBRAS.labelPressao})` },
];

export default function SeletorUnidade({
  unidade,
  onChange,
}: {
  unidade: SistemaUnidade;
  onChange: (u: SistemaUnidade) => void;
}) {
  return (
    <select className="seletor-unidade" value={unidade} onChange={(e) => onChange(e.target.value as SistemaUnidade)}>
      {OPCOES.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
