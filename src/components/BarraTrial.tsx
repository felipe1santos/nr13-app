import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isTrial } from '../services/auth';
import { formatarContagem, msRestantesTrial, verificarExpiracaoTrial } from '../services/trial';
import { Icone } from './Icone';

// Barra fixa no topo do sistema durante o período de teste (48h): contagem
// regressiva ao segundo. Quando zera, quem decide é o SERVIDOR
// (verificarExpiracaoTrial → verificarAcesso faz logout se expirou de fato).
export default function BarraTrial() {
  const navigate = useNavigate();
  const [ms, setMs] = useState<number | null>(() => msRestantesTrial());
  // Trial vencido em servidor COM a migração da assinatura não desloga mais (achado C2): a
  // conta entra em somente leitura. Nesse caso esta barra sai de cena e quem fala é a
  // BarraAssinatura ("assinatura suspensa" + botão de pagar) — senão ficariam duas barras,
  // uma delas presa para sempre em "Verificando acesso...".
  const [cedeuVez, setCedeuVez] = useState(false);

  useEffect(() => {
    if (!isTrial()) return;
    const timer = window.setInterval(() => setMs(msRestantesTrial()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (ms !== 0) return;
    void verificarExpiracaoTrial().then((ativo) => {
      if (ativo) setCedeuVez(true);
      else navigate('/login');
    });
  }, [ms, navigate]);

  if (!isTrial() || ms === null || cedeuVez) return null;

  return (
    <div className="barra-trial" role="status">
      <Icone nome="clock" tam={14} />
      {ms > 0 ? (
        <span>
          Você está no período de teste. Restam <strong>{formatarContagem(ms)}</strong>.
        </span>
      ) : (
        <span>Seu período de teste terminou. Verificando acesso...</span>
      )}
    </div>
  );
}
