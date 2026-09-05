import { useMemo, useState } from 'react';
import { textoDoErro } from '../../services/textoDoErro';
import { carregarLaudo, salvarLaudo } from './laudoConclusao';

/**
 * Fase 13C · o laudo APTO/INAPTO, em React.
 *
 * Substitui o SIM/NÃO da folha `CONCLUSAO.html` — o segundo e último campo do
 * relatório que a folha realmente grava. Mesma chave, mesmo formato.
 *
 * ## Três estados, não dois
 *
 * `null` é "ainda não respondido", e é o estado em que todo relatório nasce. A
 * tela mostra isso: enquanto ninguém marcar, nenhum dos dois botões fica aceso e
 * o aviso diz o que falta. Transformar ausência em "INAPTO" faria o parecer
 * reprovar um equipamento porque alguém não clicou.
 *
 * Quem barra a finalização continua sendo a validação existente — este painel
 * não valida nada, só grava a resposta.
 */
export default function ModalLaudo({
  tag,
  codigoRelatorio,
  onFechar,
  onSalvou,
}: {
  tag: string;
  codigoRelatorio: string;
  onFechar: () => void;
  onSalvou?: () => void;
}) {
  const inicial = useMemo(() => carregarLaudo(tag), [tag]);
  const [apto, setApto] = useState<boolean | null>(inicial.apto);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function gravar() {
    if (apto === null) return;
    setSalvando(true);
    setErro('');
    try {
      await salvarLaudo(tag, apto, codigoRelatorio);
      onSalvou?.();
      onFechar();
    } catch (e) {
      setErro(textoDoErro(e, 'Não foi possível salvar o laudo.'));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal-content" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Laudo da conclusão — {tag}</h3>
          <button type="button" className="btn-close-modal" onClick={onFechar} aria-label="Fechar">
            ×
          </button>
        </div>

        <div className="modal-body">
          <p className="laudo-pergunta">
            O equipamento está <strong>apto a operar</strong> nas condições de segurança da NR-13?
          </p>

          <div className="laudo-opcoes" role="radiogroup" aria-label="Resultado do laudo">
            <button
              type="button"
              role="radio"
              aria-checked={apto === true}
              className={`laudo-opcao apto${apto === true ? ' is-ativo' : ''}${apto === null ? ' vazia' : ''}`}
              onClick={() => setApto(true)}
              disabled={salvando}
            >
              <strong>SIM — APTO</strong>
              <span>O equipamento pode continuar operando.</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={apto === false}
              className={`laudo-opcao inapto${apto === false ? ' is-ativo' : ''}${apto === null ? ' vazia' : ''}`}
              onClick={() => setApto(false)}
              disabled={salvando}
            >
              <strong>NÃO — INAPTO</strong>
              <span>O equipamento não reúne as condições de segurança.</span>
            </button>
          </div>

          {apto === null && (
            <p className="laudo-aviso">
              Ainda não respondido. Enquanto ficar assim, o parecer sai com travessão e a
              finalização avisa que falta o laudo.
            </p>
          )}
          {inicial.atualizadoEm && (
            <p className="laudo-registro">
              Última marcação em {inicial.atualizadoEm.slice(0, 10).split('-').reverse().join('/')}
              {inicial.relatorioCodigo ? ` · ${inicial.relatorioCodigo}` : ''}
            </p>
          )}
          {erro && <p className="med-erro">{erro}</p>}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secundario" onClick={onFechar} disabled={salvando}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primario"
            onClick={() => void gravar()}
            disabled={salvando || apto === null || apto === inicial.apto}
          >
            {salvando ? 'Salvando…' : 'Salvar laudo'}
          </button>
        </div>
      </div>
    </div>
  );
}
