import { useEffect, useState } from 'react';
import { enviarCodigoTrocaSenha, trocarSenhaComCodigo, trocarSenhaComSenhaAtual } from '../services/auth';
import { Icone } from './Icone';
import './modal-trocar-senha.css';

type Metodo = 'codigo' | 'atual';

const REENVIO_SEGUNDOS = 60; // rate limit do Supabase: 1 e-mail de recuperação por minuto

export default function ModalTrocarSenha({ email, onClose }: { email: string; onClose: () => void }) {
  const [metodo, setMetodo] = useState<Metodo>('codigo');
  const [codigoEnviado, setCodigoEnviado] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  function trocarMetodo(m: Metodo) {
    setMetodo(m);
    setErro(null);
  }

  async function enviarCodigo() {
    setErro(null);
    setCarregando(true);
    try {
      const r = await enviarCodigoTrocaSenha(email);
      if (!r.sucesso) {
        setErro(r.erro || 'Falha ao enviar o código.');
        return;
      }
      setCodigoEnviado(true);
      setCooldown(REENVIO_SEGUNDOS);
    } finally {
      setCarregando(false);
    }
  }

  function validarNova(): string | null {
    if (novaSenha.length < 6) return 'A nova senha precisa ter no mínimo 6 caracteres.';
    if (novaSenha !== confirmar) return 'A confirmação não confere com a nova senha.';
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const invalido = validarNova();
    if (invalido) {
      setErro(invalido);
      return;
    }
    setErro(null);
    setCarregando(true);
    try {
      const r =
        metodo === 'codigo'
          ? await trocarSenhaComCodigo(email, codigo, novaSenha)
          : await trocarSenhaComSenhaAtual(senhaAtual, novaSenha);
      if (!r.sucesso) {
        setErro(r.erro || 'Falha ao trocar a senha.');
        return;
      }
      setOk(true);
      window.setTimeout(onClose, 1600);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="fj-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fj-modal-box mts-box">
        <div className="fj-modal-head">
          <h2>Trocar Senha</h2>
          <button type="button" className="fj-modal-close" onClick={onClose} aria-label="Fechar">
            <Icone nome="x" tam={15} />
          </button>
        </div>

        {ok ? (
          <div className="mts-sucesso">
            <Icone nome="checkcircle" tam={30} />
            <p>Senha alterada com sucesso!</p>
          </div>
        ) : (
          <form className="mts-corpo" onSubmit={handleSubmit}>
            <div className="mts-tabs">
              <button
                type="button"
                className={`mts-tab${metodo === 'codigo' ? ' ativo' : ''}`}
                onClick={() => trocarMetodo('codigo')}
              >
                Código por e-mail
              </button>
              <button
                type="button"
                className={`mts-tab${metodo === 'atual' ? ' ativo' : ''}`}
                onClick={() => trocarMetodo('atual')}
              >
                Senha atual
              </button>
            </div>

            {metodo === 'codigo' ? (
              <>
                <p className="mts-desc">
                  Enviaremos um código de confirmação para <b>{email}</b>. Digite o código recebido e
                  defina a nova senha.
                </p>
                <div className="mts-linha-codigo">
                  <button
                    type="button"
                    className="fj-btn mts-btn-enviar"
                    onClick={enviarCodigo}
                    disabled={carregando || cooldown > 0}
                  >
                    {cooldown > 0
                      ? `Reenviar em ${cooldown}s`
                      : codigoEnviado
                        ? 'Reenviar código'
                        : 'Enviar código'}
                  </button>
                  {codigoEnviado && cooldown > 0 && (
                    <span className="mts-enviado">
                      <Icone nome="check" tam={13} /> Código enviado — confira seu e-mail (e a caixa de spam).
                    </span>
                  )}
                </div>
                <div className="mts-campo">
                  <label htmlFor="mts-codigo">Código recebido no e-mail</label>
                  <input
                    id="mts-codigo"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    disabled={!codigoEnviado}
                    required
                  />
                </div>
              </>
            ) : (
              <>
                <p className="mts-desc">Confirme sua senha atual e defina a nova senha.</p>
                <div className="mts-campo">
                  <label htmlFor="mts-senha-atual">Senha atual</label>
                  <input
                    id="mts-senha-atual"
                    type="password"
                    autoComplete="current-password"
                    value={senhaAtual}
                    onChange={(e) => setSenhaAtual(e.target.value)}
                    required
                  />
                </div>
              </>
            )}

            <div className="mts-campo">
              <label htmlFor="mts-nova">Nova senha (mín. 6 caracteres)</label>
              <input
                id="mts-nova"
                type="password"
                autoComplete="new-password"
                minLength={6}
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                required
              />
            </div>
            <div className="mts-campo">
              <label htmlFor="mts-confirmar">Confirmar nova senha</label>
              <input
                id="mts-confirmar"
                type="password"
                autoComplete="new-password"
                minLength={6}
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                required
              />
            </div>

            {erro && <p className="mts-erro">{erro}</p>}

            <div className="mts-acoes">
              <button type="button" className="fj-btn fj-btn-ghost" onClick={onClose}>
                Cancelar
              </button>
              <button
                type="submit"
                className="fj-btn mts-btn-salvar"
                disabled={carregando || (metodo === 'codigo' && !codigoEnviado)}
              >
                {carregando ? 'Salvando...' : 'Trocar senha'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
