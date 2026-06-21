import type { TipoEquipamento } from './tipos';
import './equipamento.css';

export default function BadgeTipoEquipamento({ tipo, label }: { tipo: TipoEquipamento; label: string }) {
  return <span className={`badge-tipo-equip badge-tipo-equip-${tipo}`}>{label}</span>;
}
