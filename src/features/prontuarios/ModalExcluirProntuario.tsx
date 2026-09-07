import { Icone } from '../../components/Icone';
import '../relatorios/modalFinalizar.css';

/**
 * Excluir o prontuário de um equipamento, a partir da lista.
 *
 * ## O que a exclusão apaga — e o que ela NÃO apaga
 *
 * `excluirProntuario` remove `nr13_prontuario_<TAG>`, a meta do documento, os
 * assinantes escolhidos e o PNG legado do croqui 3D. Ele **não** toca em:
 *
 * - `nr13_pront_emitido_<TAG>` — as EMISSÕES já arquivadas, com `pdfRef` e
 *   SHA-256. Documento emitido é arquivo imutável (Fase 12), e apagar o
 *   cadastro não pode destruir o que já foi assinado e entregue;
 * - `nr13_croqui2d_<TAG>` e `nr13_modelo3d_<TAG>` — o croqui do vaso continua
 *   salvo, e refazer o prontuário reaproveita o desenho.
 *
 * O modal diz as duas coisas porque a diferença muda a decisão de quem clica: a
 * palavra "excluir" sozinha faria parecer que o PDF entregue ao cliente some
 * junto.
 *
 * Modal, e não `confirm()`, pela mesma razão do resto do sistema: a caixa do
 * navegador não cabe explicar nada, e esta ação apaga dado técnico.
 */
export default function ModalExcluirProntuario({
  tag,
  temEmissao,
  ocupado = false,
  aoFechar,
  aoConfirmar,
}: {
  tag: string;
  /** Há PDF já emitido para este equipamento? Muda o texto, não a regra. */
  temEmissao: boolean;
  ocupado?: boolean;
  aoFechar: () => void;
  aoConfirmar: () => void;
}) {
  return (
    <div
      className="fj-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && !ocupado && aoFechar()}
      role="dialog"
      aria-modal="true"
      aria-label={`Excluir o prontuário de ${tag}`}
    >
      <div className="fj-modal-box mf-box">
        <div className="fj-modal-head">
          <div>
            <div className="fj-eyebrow">Prontuário</div>
            <h2>Excluir o prontuário de {tag}?</h2>
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
              Apaga os <b>dados cadastrados</b> do prontuário deste equipamento — identificação,
              projeto, materiais, dimensões e os assinantes escolhidos. Não há como desfazer.
            </div>
          </div>

          <section className="mf-secao">
            <h3>
              <Icone nome="checkcircle" tam={13} /> O que continua salvo
            </h3>
            <ul>
              {temEmissao && (
                <li>
                  Os <b>PDFs já emitidos</b> deste prontuário, com o código de verificação de cada
                  um. Documento emitido é arquivo, e não é apagado daqui.
                </li>
              )}
              <li>
                O <b>croqui 2D</b> do equipamento. Refazendo o prontuário, o desenho volta junto.
              </li>
              <li>Relatórios, inspeções e o Livro de Registro do equipamento.</li>
            </ul>
          </section>
        </div>

        <div className="mf-acoes">
          <button type="button" className="fj-btn fj-btn-ghost" onClick={aoFechar} disabled={ocupado}>
            Cancelar
          </button>
          <button
            type="button"
            className={`fj-btn fj-btn-danger${ocupado ? ' is-loading' : ''}`}
            onClick={aoConfirmar}
            disabled={ocupado}
          >
            {ocupado ? 'Excluindo…' : 'Excluir prontuário'}
          </button>
        </div>
      </div>
    </div>
  );
}
