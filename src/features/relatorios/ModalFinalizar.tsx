import { Icone } from '../../components/Icone';
import type { ResultadoValidacao } from './validacaoFinalizacao';
import './modalFinalizar.css';

/**
 * Fase 10B.1 · o aviso antes do ponto sem volta.
 *
 * Finalizar gera o PDF, calcula o SHA-256 e tranca o documento — depois disso
 * nem a UI, nem o conteúdo dentro do iframe, nem as chaves por TAG conseguem
 * alterá-lo (§7-ter). Uma ação assim NUNCA pode acontecer em silêncio, e é por
 * isso que este modal existe em vez de um `confirm()`: ele mostra o que ainda
 * está em branco antes de perguntar.
 *
 * As duas listas não têm o mesmo peso, e a tela precisa deixar isso claro:
 * obrigatório faltando **esconde o botão de finalizar**; opcional em branco é
 * informação, e o botão continua lá.
 */
export default function ModalFinalizar({
  validacao,
  ocupado,
  progresso,
  erro,
  aoFechar,
  aoConfirmar,
}: {
  validacao: ResultadoValidacao;
  ocupado: boolean;
  progresso: { feito: number; total: number } | null;
  erro: string;
  aoFechar: () => void;
  aoConfirmar: () => void;
}) {
  const { obrigatorios, opcionais, podeFinalizar } = validacao;

  return (
    <div
      className="fj-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && !ocupado && aoFechar()}
      role="dialog"
      aria-modal="true"
      aria-label="Finalizar relatório"
    >
      <div className="fj-modal-box mf-box">
        <div className="fj-modal-head">
          <div>
            <div className="fj-eyebrow">Relatório</div>
            <h2>Finalizar relatório</h2>
          </div>
          {!ocupado && (
            <button type="button" className="fj-modal-close" onClick={aoFechar} aria-label="Fechar">
              <Icone nome="x" tam={15} />
            </button>
          )}
        </div>

        <div className="mf-corpo">
          <div className="mf-alerta">
            <Icone nome="alerttri" tam={18} />
            <div>
              <b>Esta ação é irreversível.</b> Ao finalizar, o sistema gera o PDF definitivo,
              calcula o código de verificação (SHA-256) e <b>tranca o documento</b>. Depois disso
              o relatório não pode mais ser editado — para mudar qualquer coisa será preciso
              duplicá-lo e emitir um novo.
            </div>
          </div>

          {obrigatorios.length > 0 && (
            <section className="mf-secao mf-bloqueia">
              <h3>
                <Icone nome="x" tam={13} /> Falta preencher para poder finalizar
              </h3>
              <ul>
                {obrigatorios.map((p) => (
                  <li key={p.campo}>
                    {p.texto} <span className="mf-onde">· {p.onde}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {opcionais.length > 0 && (
            <section className="mf-secao mf-avisa">
              <h3>
                <Icone nome="alerttri" tam={13} /> Antes de finalizar, revise
              </h3>
              <ul>
                {opcionais.map((p) => (
                  <li key={p.campo}>
                    {p.texto} <span className="mf-onde">· {p.onde}</span>
                  </li>
                ))}
              </ul>
              {/* Dizer que dá para seguir assim evita o efeito colateral clássico
                  da lista de alerta: o usuário inventar um valor só para a lista
                  esvaziar. Campo em branco é melhor do que campo mentindo. */}
              <p className="mf-nota">
                Nenhum destes impede a finalização — eles aparecem em branco no documento.
              </p>
            </section>
          )}

          {obrigatorios.length === 0 && opcionais.length === 0 && (
            <p className="mf-ok">
              <Icone nome="checkcircle" tam={15} /> Nenhuma pendência encontrada.
            </p>
          )}

          {erro && (
            <div className="mf-erro" role="alert">
              {erro}
            </div>
          )}
        </div>

        <div className="mf-acoes">
          <button type="button" className="fj-btn fj-btn-ghost" onClick={aoFechar} disabled={ocupado}>
            Voltar e revisar
          </button>
          {podeFinalizar && (
            <button
              type="button"
              className={`fj-btn fj-btn-primary${ocupado ? ' is-loading' : ''}`}
              onClick={aoConfirmar}
              disabled={ocupado}
            >
              {progresso
                ? `Gerando PDF ${progresso.feito}/${progresso.total}…`
                : ocupado
                  ? 'Finalizando…'
                  : 'Finalizar relatório'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
