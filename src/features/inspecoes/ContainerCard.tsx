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
import { FORM_POR_ENSAIO, TODOS_ENSAIOS, type ContainerInspecao, type TipoEnsaio } from './tipos';
import { rotaInspecaoContainer } from '../../app/rotas';
import { Icone } from '../../components/Icone';
import type { NomeIcone } from '../../components/Icone';

/** v5: cada ensaio com o seu ícone e um nome curto (o nome completo vai na dica). */
const ICONE_ENSAIO: Record<TipoEnsaio, NomeIcone> = {
  checklist: 'clipboard',
  ultrassom: 'pulso',
  visual_externo: 'eye',
  visual_interno: 'eye',
  teste_hidrostatico: 'manometro',
  relatorio_imagens: 'camera',
  acumulacao: 'valvula-psv',
};
const ROTULO_CURTO: Record<TipoEnsaio, string> = {
  checklist: 'Checklist NR-13',
  ultrassom: 'Espessura',
  visual_externo: 'Visual externo',
  visual_interno: 'Visual interno',
  teste_hidrostatico: 'Teste hidrostático',
  relatorio_imagens: 'Imagens',
  acumulacao: 'Acumulação',
};

export default function ContainerCard({
  container,
  tag,
  onExcluir,
  onRenomear,
}: {
  container: ContainerInspecao;
  tag: string;
  onExcluir: () => void;
  /** Abre o modal de renomear. Sem ele o lápis não aparece. */
  onRenomear?: () => void;
}) {
  const navigate = useNavigate();
  const formularios = formulariosDoContainer(container);
  // "Iniciado" = o formulário do ensaio já tem dado gravado no container. Não
  // é "concluído": o sistema não sabe se o técnico terminou de preencher.
  const iniciado = (e: TipoEnsaio) => container.dados[FORM_POR_ENSAIO[e]] != null;
  const nIniciados = formularios.filter((f) => container.dados[f] != null).length;
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
      <span className="cc-ico" aria-hidden="true">
        <Icone nome="clipboard" tam={18} />
      </span>
      <div className="cc-corpo">
        <div className="container-card-titulo">{container.nome || `Inspeção de ${container.criadoEm}`}</div>
        <div className="container-card-meta">
          {container.criadoEm} · {nIniciados} de {formularios.length}{' '}
          {formularios.length === 1 ? 'ensaio iniciado' : 'ensaios iniciados'}
        </div>
        <div className="container-card-badges">
          {container.ensaios.map((e) => (
            <span
              key={e}
              className={`badge-item-ensaio${iniciado(e) ? ' iniciado' : ''}`}
              title={TODOS_ENSAIOS.find((d) => d.value === e)?.label ?? e}
            >
              <Icone nome={ICONE_ENSAIO[e] ?? 'clipboard'} tam={14} />
              {ROTULO_CURTO[e] ?? TODOS_ENSAIOS.find((d) => d.value === e)?.label ?? e}
            </span>
          ))}
        </div>
      </div>
      <div className="container-card-acoes" onClick={(e) => e.stopPropagation()}>
        {/* Renomear vem ANTES de excluir: é a ação frequente, e a destrutiva
            não pode ser a primeira coisa que o dedo encontra. */}
        {onRenomear && !confirmando && (
          <button
            type="button"
            className="btn-icone cont-card-renomear"
            title="Renomear container"
            aria-label={`Renomear ${container.nome || 'container'}`}
            onClick={(e) => {
              e.stopPropagation();
              onRenomear();
            }}
          >
            <Icone nome="pencil" tam={16} />
          </button>
        )}
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
          <button
            type="button"
            className="btn-icone cc-excluir"
            title="Excluir container"
            aria-label={`Excluir ${container.nome || 'container'}`}
            onClick={handleExcluir}
          >
            <Icone nome="trash" tam={16} />
          </button>
        )}
        <span className="container-card-seta" aria-hidden>
          <Icone nome="chevright" tam={16} />
        </span>
      </div>
    </div>
  );
}
