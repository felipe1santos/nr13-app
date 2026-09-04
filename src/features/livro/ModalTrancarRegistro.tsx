import { Icone } from '../../components/Icone';
import type { ResultadoValidacaoRegistro } from './validacaoRegistro';
import '../relatorios/modalFinalizar.css';

/**
 * Fase 10B.2 · o aviso antes de TRANCAR um registro do Livro.
 *
 * Trancar incorpora o registro à cadeia de integridade: ele ganha hash, fica
 * encadeado no anterior, passa a contar como oficial, aparece no Portal e é
 * recusado pelo gatilho do banco se alguém tentar alterá-lo. Não há caminho de
 * volta — correção depois disso é RETIFICAÇÃO, um registro novo que aponta para
 * o antigo, e os dois permanecem no livro, como manda um livro legal.
 *
 * Reusa o CSS do modal de finalização do relatório (10B.1) de propósito: são a
 * mesma decisão, com o mesmo peso, e devem parecer a mesma coisa.
 */
export default function ModalTrancarRegistro({
  validacao,
  ocupado,
  erro,
  aoFechar,
  aoConfirmar,
}: {
  validacao: ResultadoValidacaoRegistro;
  ocupado: boolean;
  erro: string;
  aoFechar: () => void;
  aoConfirmar: () => void;
}) {
  const { obrigatorios, opcionais, podeTrancar } = validacao;

  return (
    <div
      className="fj-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && !ocupado && aoFechar()}
      role="dialog"
      aria-modal="true"
      aria-label="Trancar registro"
    >
      <div className="fj-modal-box mf-box">
        <div className="fj-modal-head">
          <div>
            <div className="fj-eyebrow">Livro de Registro de Segurança</div>
            <h2>Trancar este registro?</h2>
          </div>
          {!ocupado && (
            <button type="button" className="fj-modal-close" onClick={aoFechar} aria-label="Fechar">
              <Icone nome="x" tam={15} />
            </button>
          )}
        </div>

        <div className="mf-corpo">
          <div className="mf-alerta">
            <Icone nome="cadeado" tam={18} />
            <div>
              Após o trancamento, o conteúdo será <b>incorporado à cadeia de integridade</b> e
              <b> não poderá mais ser editado</b>. O registro passa a contar como oficial e fica
              visível para o cliente no Portal. Correção posterior só por <b>retificação</b> — um
              registro novo apontando para este, com os dois permanecendo no livro.
            </div>
          </div>

          {obrigatorios.length > 0 && (
            <section className="mf-secao mf-bloqueia">
              <h3>
                <Icone nome="x" tam={13} /> Falta preencher para poder trancar
              </h3>
              <ul>
                {obrigatorios.map((p) => (
                  <li key={p.campo}>{p.texto}</li>
                ))}
              </ul>
            </section>
          )}

          {opcionais.length > 0 && (
            <section className="mf-secao mf-avisa">
              <h3>
                <Icone nome="alerttri" tam={13} /> Antes de trancar, revise
              </h3>
              <ul>
                {opcionais.map((p) => (
                  <li key={p.campo}>{p.texto}</li>
                ))}
              </ul>
              <p className="mf-nota">
                Nenhum destes impede o trancamento — eles ficam em branco no registro.
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
          {podeTrancar && (
            <button
              type="button"
              className={`fj-btn fj-btn-primary${ocupado ? ' is-loading' : ''}`}
              onClick={aoConfirmar}
              disabled={ocupado}
            >
              {ocupado ? 'Trancando…' : 'Trancar registro'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
