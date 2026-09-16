import { FATORES_CONVERSAO, rotuloSistemaCompleto, type SistemaUnidade } from '../../calc/unidades';

// Os nomes vivem em `unidades.ts` desde 16/09/2026: o cadastro, o cartão e esta
// ficha mostram o mesmo rótulo, e três cópias divergiriam na primeira mudança.
const OPCOES: { value: SistemaUnidade; label: string }[] = (
  Object.keys(FATORES_CONVERSAO) as SistemaUnidade[]
).map((value) => ({ value, label: rotuloSistemaCompleto(value) }));

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
