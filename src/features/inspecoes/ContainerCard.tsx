/**
 * O cartão de um container de inspeção.
 *
 * Estava dentro de `pages/Inspecoes.tsx`. Saiu para cá na 9F.1 porque as DUAS
 * telas passam a usá-lo — a antiga e a nova — e a regra do rollout é que a tela
 * nova **não importa nada da tela legada**: quando o legado sair (9G), a remoção
 * não pode levar a nova junto. Foi a mesma razão pela qual `RelatoriosV9` não
 * importa de `Relatorios.tsx`.
 *
 * O componente é o MESMO, byte a byte no comportamento: o portão exige conteúdo
 * idêntico com a flag ligada e desligada.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formulariosDoContainer } from './inspecaoService';
import { ENSAIOS_DISPONIVEIS, type ContainerInspecao } from './tipos';
import { rotaInspecaoContainer } from '../../app/rotas';

export default function ContainerCard({
  container,
  tag,
  onExcluir,
}: {
  container: ContainerInspecao;
  tag: string;
  onExcluir: () => void;
}) {
  const navigate = useNavigate();
  const formularios = formulariosDoContainer(container);
  const [confirmando, setConfirmando] = useState(false);

  function handleExcluir(ev: React.MouseEvent) {
    ev.stopPropagation();
    if (!confirmando) { setConfirmando(true); return; }
    onExcluir();
  }

  function abrir() {
    navigate(rotaInspecaoContainer(tag, container.id));
  }

  return (
    <div
      className="container-card container-card-clicavel"
      onClick={abrir}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') abrir(); }}
    >
      <div className="container-card-header">
        <div>
          <div className="container-card-titulo">{container.nome || `Inspeção de ${container.criadoEm}`}</div>
          <div className="container-card-meta">
            {container.criadoEm} • {formularios.length} {formularios.length === 1 ? 'item' : 'itens'}
          </div>
          <div className="container-card-badges">
            {container.ensaios.map((e) => (
              <span key={e} className="badge-item-ensaio">
                {ENSAIOS_DISPONIVEIS.find((d) => d.value === e)?.label ?? e}
              </span>
            ))}
          </div>
        </div>
        <div className="container-card-acoes" onClick={(e) => e.stopPropagation()}>
          {confirmando ? (
            <>
              <button type="button" className="btn-remover" onClick={handleExcluir}>
                Confirmar
              </button>
              <button type="button" className="btn-secundario" onClick={(e) => { e.stopPropagation(); setConfirmando(false); }}>
                Cancelar
              </button>
            </>
          ) : (
            <button type="button" className="btn-remover" onClick={handleExcluir}>
              Excluir
            </button>
          )}
          <span className="container-card-seta" aria-hidden>›</span>
        </div>
      </div>
    </div>
  );
}
