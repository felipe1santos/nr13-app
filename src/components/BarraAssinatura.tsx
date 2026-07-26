import { useState } from 'react';
import { statusAssinaturaLocal, assinaturaAte, calcularDiasRestantes } from '../services/assinatura';
import ModalAssinatura from './ModalAssinatura';
import { Icone } from './Icone';
import './barra-assinatura.css';

// Barra fixa acima do topbar. Some quando a assinatura está ativa; o trial continua
// na BarraTrial (contagem própria de 48h) — são estados mutuamente exclusivos, então
// as duas barras nunca aparecem juntas (ver `statusAssinaturaLocal` e `isTrial`).
export default function BarraAssinatura() {
  const [modal, setModal] = useState(false);
  const status = statusAssinaturaLocal();
  if (status === 'ativa' || status === 'trial') return null;

  const dias = calcularDiasRestantes(assinaturaAte());
  const texto =
    status === 'graca'
      ? `Não conseguimos cobrar seu cartão. Regularize em ${dias ?? 0} dia(s) para não perder o acesso.`
      : status === 'cancelada_no_prazo'
        ? `Assinatura cancelada. Seu acesso termina em ${dias ?? 0} dia(s).`
        : 'Sua assinatura está suspensa. O sistema está em modo somente leitura.';

  return (
    <>
      <div className={`barra-assinatura ${status}`} role="alert">
        <Icone nome="alerttri" tam={14} />
        <span>{texto}</span>
        <button type="button" onClick={() => setModal(true)}>
          {status === 'somente_leitura' ? 'Assinar agora' : 'Regularizar'}
        </button>
      </div>
      <ModalAssinatura aberto={modal} onFechar={() => setModal(false)} />
    </>
  );
}
