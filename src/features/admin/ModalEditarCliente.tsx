import { useState } from 'react';
import { ROTULO_TAG, TAGS, type TagConta } from './classificarConta';
import type { ContaCliente } from './PainelClientes';

/**
 * EDITAR UM CLIENTE (21/09/2026).
 *
 * ## Por que a lista deixou de ser editável
 *
 * A tag era um `<select>` e a mensalidade um `<input>` em cada linha. Com 16
 * contas, a tela virava um formulário de 32 campos para uma coisa que se olha
 * muito mais do que se altera — e um clique errado no seletor trocava a
 * classificação de um cliente sem nenhuma confirmação, direto no banco.
 *
 * Agora a linha é LEITURA: a tag aparece como etiqueta colorida e o valor como
 * texto. Alterar exige abrir este modal, que mostra o que está mudando e em
 * qual conta.
 *
 * ## O que ele reúne
 *
 * Tag, mensalidade e as ações de acesso (suspender/liberar, prazo, excluir).
 * Estavam em três lugares: o seletor na linha, o campo ao lado e os botões no
 * fim dela.
 *
 * ## O que ele NÃO faz
 *
 * Não grava: devolve a intenção para a página, que fala com o Supabase. Excluir
 * continua passando pela confirmação da página — é irreversível e não vai
 * atrás de um clique só.
 */
export default function ModalEditarCliente({
  conta,
  ocupado,
  mensalidadePadrao,
  onFechar,
  onSalvar,
  onAlternarAcesso,
  onValidade,
  onExcluir,
}: {
  conta: ContaCliente;
  ocupado: boolean;
  mensalidadePadrao: number;
  onFechar: () => void;
  /** Tag e mensalidade, juntas — é o que o botão "Salvar" grava. */
  onSalvar: (tag: TagConta, valorMensal: string) => void;
  onAlternarAcesso: () => void;
  onValidade: () => void;
  onExcluir: () => void;
}) {
  const [tag, setTag] = useState<TagConta>(conta.tag);
  const [valor, setValor] = useState(conta.valor_mensal != null ? String(conta.valor_mensal) : '');

  const mudou = tag !== conta.tag || valor !== (conta.valor_mensal != null ? String(conta.valor_mensal) : '');

  return (
    <div
      className="fj-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Editar ${conta.email ?? 'cliente'}`}
      onClick={(e) => e.target === e.currentTarget && !ocupado && onFechar()}
    >
      <div className="fj-modal-box adm-modal">
        <div className="fj-modal-head">
          <div>
            <div className="fj-eyebrow">Cliente</div>
            <h2>{conta.email}</h2>
          </div>
          {!ocupado && (
            <button type="button" className="fj-modal-close" onClick={onFechar} aria-label="Fechar">
              ×
            </button>
          )}
        </div>

        <div className="adm-modal-corpo">
          <div className="adm-form-linha">
            <label>
              Tipo de cliente
              <select value={tag} onChange={(e) => setTag(e.target.value as TagConta)} disabled={ocupado}>
                {TAGS.map((t) => (
                  <option key={t} value={t}>
                    {ROTULO_TAG[t]}
                  </option>
                ))}
              </select>
              <small className={`adm-tag adm-tag-${tag}`}>{ROTULO_TAG[tag]}</small>
            </label>

            <label>
              Mensalidade (R$)
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder={String(mensalidadePadrao)}
                disabled={ocupado || tag !== 'pagante'}
              />
              <small>
                {tag === 'pagante'
                  ? 'Em branco usa o valor padrão do painel.'
                  : 'Só a tag Pagante entra no faturamento.'}
              </small>
            </label>
          </div>

          <div className="adm-modal-secao">
            <span className="adm-modal-secao-rot">Acesso</span>
            <div className="adm-acoes-linha">
              <button
                type="button"
                className={`fj-btn${conta.ativo ? '' : ' fj-btn-primary'}`}
                disabled={ocupado}
                onClick={onAlternarAcesso}
              >
                {conta.ativo ? 'Suspender acesso' : 'Liberar acesso'}
              </button>
              <button type="button" className="fj-btn" disabled={ocupado} onClick={onValidade}>
                Definir validade
              </button>
              <button type="button" className="fj-btn adm-btn-perigo" disabled={ocupado} onClick={onExcluir}>
                Excluir cliente
              </button>
            </div>
            <small className="adm-inline-muted">
              {conta.ativo ? 'Conta ativa.' : 'Conta bloqueada — o cliente não consegue entrar.'}
            </small>
          </div>
        </div>

        <div className="mf-acoes">
          <button type="button" className="fj-btn" onClick={onFechar} disabled={ocupado}>
            Cancelar
          </button>
          <button
            type="button"
            className="fj-btn fj-btn-primary"
            disabled={ocupado || !mudou}
            onClick={() => onSalvar(tag, valor)}
          >
            {ocupado ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
