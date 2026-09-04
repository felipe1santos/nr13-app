import { Icone } from '../../components/Icone';
import './modalFinalizar.css';

/**
 * Tirar um relatório da lista — e a caixa é DIFERENTE conforme o que ele é.
 *
 * ## Rascunho: destrói mesmo
 *
 * Nada nele foi emitido: não tem PDF, não tem SHA, não entrou no índice do
 * equipamento, não gerou vencimento nem apareceu no Portal. Apagar é apagar, e
 * o modal diz isso com todas as letras porque não há como desfazer.
 *
 * ## Finalizado: NÃO destrói, e o modal não finge que destrói
 *
 * Um relatório emitido é um arquivo imutável com hash que prova sua
 * integridade; ele alimenta o vencimento do equipamento, aparece no Portal do
 * Cliente e pode ter registro no Livro de Segurança. Um botão "excluir" que
 * apagasse isso destruiria evidência técnica de equipamento em operação.
 *
 * O que o usuário quase sempre quer é parar de ver — então é isso que é
 * oferecido, com o nome certo: **arquivar**. O texto explica onde o documento
 * continua e como voltar a ele.
 */
export default function ModalRemocao({
  modo,
  nome,
  ocupado,
  erro,
  aoFechar,
  aoConfirmar,
}: {
  modo: 'rascunho' | 'arquivar';
  nome: string;
  ocupado: boolean;
  erro: string;
  aoFechar: () => void;
  aoConfirmar: () => void;
}) {
  const rascunho = modo === 'rascunho';

  return (
    <div
      className="fj-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && !ocupado && aoFechar()}
      role="dialog"
      aria-modal="true"
      aria-label={rascunho ? 'Excluir rascunho' : 'Arquivar relatório'}
    >
      <div className="fj-modal-box mf-box" style={{ width: 'min(520px, 96vw)' }}>
        <div className="fj-modal-head">
          <div>
            <div className="fj-eyebrow">{rascunho ? 'Rascunho' : 'Relatório finalizado'}</div>
            <h2>{rascunho ? 'Excluir este rascunho definitivamente?' : 'Remover da lista?'}</h2>
          </div>
          {!ocupado && (
            <button type="button" className="fj-modal-close" onClick={aoFechar} aria-label="Fechar">
              <Icone nome="x" tam={15} />
            </button>
          )}
        </div>

        <div className="mf-corpo">
          <div className={`mf-alerta${rascunho ? ' mr-perigo' : ''}`}>
            <Icone nome={rascunho ? 'alerttri' : 'cadeado'} tam={18} />
            <div>
              {rascunho ? (
                <>
                  Todos os dados ainda não finalizados de <b>{nome}</b> serão removidos.{' '}
                  <b>Esta ação não pode ser desfeita.</b>
                </>
              ) : (
                <>
                  <b>{nome}</b> sai da lista, mas <b>não é apagado</b>. O PDF continua no cofre com o
                  mesmo código de verificação, o histórico do equipamento continua completo, e o
                  vencimento, o Portal do Cliente e o Livro de Registro seguem enxergando o
                  documento. Para reencontrá-lo, use o filtro <b>Arquivados</b>.
                </>
              )}
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
          <button
            type="button"
            className={`fj-btn ${rascunho ? 'mr-btn-perigo' : 'fj-btn-primary'}`}
            onClick={aoConfirmar}
            disabled={ocupado}
          >
            {ocupado
              ? rascunho
                ? 'Excluindo…'
                : 'Arquivando…'
              : rascunho
                ? 'Excluir definitivamente'
                : 'Remover da lista'}
          </button>
        </div>
      </div>
    </div>
  );
}
