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
 * Selo de sincronização, na topbar ao lado do indicador de nuvem.
 *
 * Existe para que "não subiu ainda" nunca seja confundido com "está salvo". A
 * conta do cliente perdeu 28 equipamentos justamente porque a tela dizia
 * "salvo" enquanto o dado nunca havia saído do aparelho.
 *
 * Só aparece no caminho v2 — na v1 não há fila para reportar.
 *
 * FORMATO: em dia, é só um botão pequeno de nuvem. Quando há pendência, falha
 * ou bloqueio, o rótulo aparece junto — o aviso precisa ocupar espaço na
 * proporção do problema, e não o contrário. Os avisos de espaço/persistência
 * viram um pino no canto do botão, com o texto no title e na tela de
 * Pendências: eles não podem sumir, mas também não podem virar uma faixa
 * ocupando a largura da tela em cima de todo o app.
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

  const avisos = [
    quota === 'critico' ? 'Espaço do aparelho esgotando.' : '',
    quota === 'aviso' ? 'Espaço do aparelho ficando baixo.' : '',
    semPersistencia ? 'Este navegador não garantiu o armazenamento. Sincronize com frequência.' : '',
  ].filter(Boolean);

  const titulo = [resumo.rotulo, ...avisos, 'Toque para ver as pendências.'].join(' ');

  return (
    <button
      type="button"
      className={`selo-sync selo-sync--${resumo.nivel}`}
      onClick={() => navegar('/pendencias')}
      title={titulo}
      aria-label={titulo}
    >
      <Icone nome={ICONE[resumo.nivel]} tam={15} />
      {resumo.nivel !== 'ok' && <span className="selo-sync__rotulo">{resumo.rotulo}</span>}
      {avisos.length > 0 && <span className="selo-sync__pino" aria-hidden="true" />}
    </button>
  );
}
