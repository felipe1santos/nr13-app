import { useState } from 'react';
import { ROTULO_TAG, TAGS, type TagConta } from './classificarConta';

/**
 * CADASTRAR UM CLIENTE (21/09/2026).
 *
 * ## Por que virou modal
 *
 * Era um formulário permanente no meio do painel — três campos e um botão
 * ocupando altura fixa numa tela que se abre todo dia para olhar a lista, por
 * uma ação que acontece quando entra um cliente novo. Agora mora atrás do
 * botão do canto superior direito.
 *
 * ## O que mudou junto
 *
 * Além de e-mail, senha e prazo, o cadastro já pergunta a TAG e a MENSALIDADE.
 * Antes o cliente nascia sem os dois e alguém precisava lembrar de voltar na
 * lista para marcar — e enquanto não marcasse, ele não entrava no MRR.
 *
 * ## O que ele NÃO faz
 *
 * Não cria a conta: entrega os campos para a página, que fala com a Edge
 * `admin`. Validação de senha e de e-mail duplicado continuam do lado de lá,
 * onde sempre estiveram.
 */
export interface DadosNovoCliente {
  email: string;
  senha: string;
  /** Dias de acesso. Vazio = sem prazo (vitalício/pagante sem vencimento). */
  dias: string;
  tag: TagConta;
  /** Mensalidade em texto, como digitada. Vazio = usa o padrão do painel. */
  valorMensal: string;
}

export default function ModalNovoCliente({
  ocupado,
  erro,
  onFechar,
  onCriar,
}: {
  ocupado: boolean;
  erro?: string | null;
  onFechar: () => void;
  onCriar: (d: DadosNovoCliente) => void;
}) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [dias, setDias] = useState('');
  const [tag, setTag] = useState<TagConta>('pagante');
  const [valorMensal, setValorMensal] = useState('');

  const podeCriar = email.trim() !== '' && senha.length >= 6 && !ocupado;

  return (
    <div
      className="fj-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Novo cliente"
      onClick={(e) => e.target === e.currentTarget && !ocupado && onFechar()}
    >
      <div className="fj-modal-box adm-modal">
        <div className="fj-modal-head">
          <div>
            <div className="fj-eyebrow">Clientes</div>
            <h2>Novo cliente</h2>
          </div>
          {!ocupado && (
            <button type="button" className="fj-modal-close" onClick={onFechar} aria-label="Fechar">
              ×
            </button>
          )}
        </div>

        <form
          className="adm-modal-corpo adm-form-novo"
          onSubmit={(e) => {
            e.preventDefault();
            if (podeCriar) onCriar({ email: email.trim(), senha, dias, tag, valorMensal });
          }}
        >
          <label>
            E-mail de acesso *
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              placeholder="cliente@empresa.com.br"
              required
            />
          </label>

          <label>
            Senha provisória *
            <input
              type="text"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="new-password"
              placeholder="mínimo 6 caracteres"
              minLength={6}
              required
            />
            <small>O cliente troca depois, pela tela de login.</small>
          </label>

          <div className="adm-form-linha">
            <label>
              Tag
              <select value={tag} onChange={(e) => setTag(e.target.value as TagConta)}>
                {TAGS.map((t) => (
                  <option key={t} value={t}>
                    {ROTULO_TAG[t]}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Mensalidade (R$)
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={valorMensal}
                onChange={(e) => setValorMensal(e.target.value)}
                placeholder="usa o padrão"
                disabled={tag !== 'pagante'}
                title={tag !== 'pagante' ? 'Só a tag Pagante entra no faturamento' : undefined}
              />
            </label>

            <label>
              Dias de acesso
              <input
                type="number"
                min={1}
                value={dias}
                onChange={(e) => setDias(e.target.value)}
                placeholder="vazio = sem prazo"
              />
            </label>
          </div>

          {erro && (
            <div className="mf-alerta" role="alert">
              <div>{erro}</div>
            </div>
          )}

          <div className="mf-acoes">
            <button type="button" className="fj-btn" onClick={onFechar} disabled={ocupado}>
              Cancelar
            </button>
            <button type="submit" className="fj-btn fj-btn-primary" disabled={!podeCriar}>
              {ocupado ? 'Criando…' : 'Criar e liberar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
