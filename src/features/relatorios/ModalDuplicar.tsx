import { Icone } from '../../components/Icone';
import './modalFinalizar.css';

/**
 * "Duplicar este relatório?" — a confirmação diz o que acontece com cada um.
 *
 * O medo de quem duplica um documento assinado é mexer nele sem querer. Por
 * isso o texto separa os dois: o ORIGINAL não muda (mesmo PDF, mesmo código de
 * verificação) e a CÓPIA nasce rascunho, editável, com as datas da inspeção em
 * branco. Mesmo desenho do `ModalRemocao`.
 */
export default function ModalDuplicar({
  nome,
  ocupado,
  erro,
  aoFechar,
  aoConfirmar,
}: {
  nome: string;
  ocupado: boolean;
  erro: string;
  aoFechar: () => void;
  aoConfirmar: () => void;
}) {
  return (
    <div
      className="fj-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && !ocupado && aoFechar()}
      role="dialog"
      aria-modal="true"
      aria-label="Duplicar relatório"
    >
      <div className="fj-modal-box mf-box" style={{ width: 'min(520px, 96vw)' }}>
        <div className="fj-modal-head">
          <div>
            <div className="fj-eyebrow">Duplicar relatório</div>
            <h2>Duplicar este relatório?</h2>
          </div>
          {!ocupado && (
            <button type="button" className="fj-modal-close" onClick={aoFechar} aria-label="Fechar">
              <Icone nome="x" tam={15} />
            </button>
          )}
        </div>

        <div className="mf-corpo">
          <div className="mf-alerta">
            <Icone nome="copy" tam={18} />
            <div>
              Será criado um <b>novo rascunho</b>, editável, a partir de <b>{nome}</b>. O original{' '}
              <b>não muda</b>: o PDF e o código de verificação continuam os mesmos. A cópia recebe os seus
              próprios dados de inspeção (medições, ensaios e fotos), copiados do original; a emissão, as datas da
              inspeção, a validade e a ART começam em branco.
            </div>
          </div>

          {erro && (
            <div className="mf-erro" role="alert">
              {erro}
            </div>
          )}
        </div>

        <div className="mf-acoes">
          <button type="button" className="fj-btn fj-btn-ghost" onClick={aoFechar} disabled={ocupado}>
            Cancelar
          </button>
          <button type="button" className="fj-btn fj-btn-primary" onClick={aoConfirmar} disabled={ocupado}>
            {ocupado ? 'Duplicando…' : 'Duplicar'}
          </button>
        </div>
      </div>
    </div>
  );
}
