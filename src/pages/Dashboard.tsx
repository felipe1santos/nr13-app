import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CardEquipamento from '../features/equipamento/CardEquipamento';
import ModalCriarEquipamento from '../features/equipamento/ModalCriarEquipamento';
import { listarEquipamentos } from '../features/equipamento/equipamentoService';
import type { EquipamentoResumo } from '../features/equipamento/tipos';
import '../features/equipamento/equipamento.css';
import './dashboard.css';

export default function Dashboard() {
  const [equipamentos, setEquipamentos] = useState<EquipamentoResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const navigate = useNavigate();

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setEquipamentos(await listarEquipamentos());
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    // Fetch-on-mount padrão (sem lib de cache/query nesta app) — setState ocorre dentro de
    // carregar(), de forma assíncrona, não sincronamente no corpo do efeito.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, [carregar]);

  function handleCriado(tag: string) {
    setModalAberto(false);
    navigate(`/equipamento/${tag}`);
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <h1>Equipamentos</h1>
        <button type="button" className="btn-primario" onClick={() => setModalAberto(true)}>
          + Criar Equipamento
        </button>
      </div>

      {carregando ? (
        <p>Carregando...</p>
      ) : equipamentos.length === 0 ? (
        <p className="dashboard-vazio">Nenhum equipamento cadastrado ainda. Clique em "Criar Equipamento" para começar.</p>
      ) : (
        <div className="vasos-grid">
          {equipamentos.map((item) => (
            <CardEquipamento key={item.tag} item={item} />
          ))}
        </div>
      )}

      {modalAberto && <ModalCriarEquipamento onClose={() => setModalAberto(false)} onCriado={handleCriado} />}
    </div>
  );
}
