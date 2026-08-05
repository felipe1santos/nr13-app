import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listarFila } from '../services/sync';
import { resumoSelo, type ResumoSelo } from '../services/selo';
import { bloqueadoParaEscrita } from '../services/gateEscrita';
import { armazenamentoV2Ativo } from '../services/flag';
import { medir, garantirPersistencia, type EstadoQuota } from '../services/quotaDispositivo';
import { Icone, type NomeIcone } from './Icone';

const ICONE: Record<ResumoSelo['nivel'], NomeIcone> = {
  ok: 'cloudcheck',
  pendente: 'clock',
  falha: 'alerttri',
  bloqueado: 'cadeado',
};

/**
 * Selo fixo de sincronização.
 *
 * Existe para que "não subiu ainda" nunca seja confundido com "está salvo". A
 * conta do cliente perdeu 28 equipamentos justamente porque a tela dizia
 * "salvo" enquanto o dado nunca havia saído do aparelho.
 *
 * Só aparece no caminho v2 — na v1 não há fila para reportar.
 */
export default function SeloSync() {
  const navegar = useNavigate();
  const [resumo, setResumo] = useState<ResumoSelo>(() =>
    resumoSelo(listarFila(), bloqueadoParaEscrita()),
  );
  const [quota, setQuota] = useState<EstadoQuota>('normal');
  const [semPersistencia, setSemPersistencia] = useState(false);

  useEffect(() => {
    if (!armazenamentoV2Ativo()) return;

    // Pedido único por sessão; recusa não bloqueia nada, só avisa.
    void garantirPersistencia().then((p) => setSemPersistencia(p === 'recusada'));
    void medir('boot').then((m) => setQuota(m.estado === 'desconhecido' ? 'normal' : m.estado));

    const t = setInterval(() => {
      setResumo(resumoSelo(listarFila(), bloqueadoParaEscrita()));
    }, 5000);
    return () => clearInterval(t);
  }, []);

  if (!armazenamentoV2Ativo()) return null;

  const titulo = semPersistencia
    ? 'Este navegador não garantiu o armazenamento. Sincronize com frequência.'
    : 'Ver pendências de sincronização';

  return (
    <button
      type="button"
      className={`selo-sync selo-sync--${resumo.nivel}`}
      onClick={() => navegar('/pendencias')}
      title={titulo}
    >
      <Icone nome={ICONE[resumo.nivel]} />
      <span className="selo-sync__rotulo">{resumo.rotulo}</span>
      {quota !== 'normal' && (
        <span className="selo-sync__quota">
          {quota === 'critico' ? 'Espaço esgotando' : 'Espaço baixo'}
        </span>
      )}
      {semPersistencia && <span className="selo-sync__risco">Armazenamento sem garantia</span>}
    </button>
  );
}
