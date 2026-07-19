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

  useEffect(() => {
    if (!isTrial()) return;
    const timer = window.setInterval(() => setMs(msRestantesTrial()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (ms !== 0) return;
    void verificarExpiracaoTrial().then((ativo) => {
      if (!ativo) navigate('/login');
    });
  }, [ms, navigate]);

  if (!isTrial() || ms === null) return null;

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
