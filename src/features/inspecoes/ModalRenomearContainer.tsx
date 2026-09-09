import { useEffect, useRef, useState } from 'react';
import FeedbackSalvamento, { useSalvamento } from '../../components/FeedbackSalvamento';
import { renomearContainer } from './inspecaoService';
import type { ContainerInspecao } from './tipos';

/**
 * RENOMEAR O CONTAINER — 10/09/2026.
 *
 * Pequeno de propósito: é uma pergunta só. O que ele NÃO faz é tão importante
 * quanto o que faz — não mexe em `id`, `criadoEm`, `ensaios` nem `dados`, e por
 * isso renomear não desfaz o vínculo dos ensaios já preenchidos nem a origem
 * (`meta.containerOrigemId`) de um relatório que já usou este container.
 *
 * Fechar clicando fora está DESLIGADO: há texto digitado, e perder a edição por
 * um toque ao lado é o tipo de acidente que a regra de acessibilidade desta
 * rodada manda evitar. Sai pelo ESC, pelo X ou pelo Cancelar.
 */
export default function ModalRenomearContainer({
  tag,
  container,
  aoFechar,
  aoRenomear,
}: {
  tag: string;
  container: ContainerInspecao;
  aoFechar: () => void;
  /** Chamado depois da gravação — quem chama recarrega a lista. */
  aoRenomear: () => void;
}) {
  const [nome, setNome] = useState(container.nome);
  const salvamento = useSalvamento();
  const campo = useRef<HTMLInputElement>(null);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    campo.current?.focus();
    campo.current?.select();
  }, []);

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        aoFechar();
        return;
      }
      if (e.key !== 'Tab' || !caixa.current) return;
      const focaveis = caixa.current.querySelectorAll<HTMLElement>('button, input');
      if (focaveis.length === 0) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      } else if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      }
    }
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aoFechar]);

  const vazio = nome.trim() === '';

  async function salvar() {
    if (vazio) return;
    const ok = await salvamento.executar(() => renomearContainer(tag, container.id, nome));
    if (ok) {
      aoRenomear();
      aoFechar();
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="ren-cont-titulo">
      <div className="modal-content mrc-modal" ref={caixa} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id="ren-cont-titulo">Renomear container</h3>
          <button type="button" className="btn-close-modal" onClick={aoFechar} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="modal-body">
          <label className="mrc-campo">
            <span>Nome do container</span>
            <input
              ref={campo}
              type="text"
              value={nome}
              maxLength={120}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !vazio) void salvar();
              }}
              placeholder={`Inspeção de ${container.criadoEm}`}
            />
          </label>
          <p className="mrc-nota">
            Muda só o nome que aparece na lista. Os ensaios preenchidos e os relatórios que já usaram
            esta inspeção continuam ligados a ela.
          </p>
          {vazio && (
            <p className="mrc-erro" role="alert">
              O nome não pode ficar vazio.
            </p>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secundario" onClick={aoFechar}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primario"
            disabled={vazio || salvamento.salvando}
            onClick={() => void salvar()}
          >
            Salvar
          </button>
        </div>
      </div>

      <FeedbackSalvamento
        estado={salvamento.estado}
        erro={salvamento.erro}
        aoTentarNovamente={() => void salvar()}
        aoFechar={salvamento.limpar}
      />
    </div>
  );
}
