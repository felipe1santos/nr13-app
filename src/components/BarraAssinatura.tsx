import { useEffect, useState } from 'react';
import { statusAssinaturaLocal, assinaturaAte, calcularDiasRestantes } from '../services/assinatura';
import { assinarAssinaturaAlterada } from '../services/eventos';
import ModalAssinatura from './ModalAssinatura';
import { Icone } from './Icone';
import './barra-assinatura.css';

/** Revalida a data de vencimento com a aba aberta (a graça pode acabar durante o uso). */
const RELEITURA_MS = 60_000;

// Barra fixa acima do topbar. Some quando a assinatura está ativa; o trial continua
// na BarraTrial (contagem própria de 48h) — são estados mutuamente exclusivos, então
// as duas barras nunca aparecem juntas (ver `statusAssinaturaLocal` e `isTrial`).
export default function BarraAssinatura() {
  const [modal, setModal] = useState(false);
  // O status vive no localStorage, que muda FORA do React (polling do pagamento, carregarPerfil
  // em outra rota). Lido só no render, a barra vermelha continuava na tela depois do pagamento
  // confirmado até um F5. Agora reage ao evento do espelho, ao voltar para a aba e ao relógio.
  const [status, setStatus] = useState(statusAssinaturaLocal);
  useEffect(() => {
    const reler = () => setStatus(statusAssinaturaLocal());
    reler();
    const cancelar = assinarAssinaturaAlterada(reler);
    window.addEventListener('focus', reler);
    const timer = window.setInterval(reler, RELEITURA_MS);
    return () => {
      cancelar();
      window.removeEventListener('focus', reler);
      window.clearInterval(timer);
    };
  }, []);

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
