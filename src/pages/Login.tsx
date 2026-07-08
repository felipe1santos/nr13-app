import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  login,
  cadastrar,
  isAdmin,
  isCliente,
  enviarCodigoTrocaSenha,
  trocarSenhaComCodigo,
  trocarSenhaNaTelaDeLogin,
} from '../services/auth';
import './login.css';

const REENVIO_SEGUNDOS = 60; // rate limit do Supabase: 1 e-mail de recuperação por minuto

export default function Login() {
  const [modo, setModo] = useState<'entrar' | 'cadastrar' | 'recuperar' | 'trocar'>('entrar');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  // Recuperação de senha (código por e-mail)
  const [codigoEnviado, setCodigoEnviado] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  function irPara(m: 'entrar' | 'cadastrar' | 'recuperar' | 'trocar') {
    setErro(null);
    setAviso(null);
    setCodigoEnviado(false);
    setCodigo('');
    setNovaSenha('');
    setConfirmar('');
    setModo(m);
  }

  async function enviarCodigo() {
    if (!email) {
      setErro('Informe seu e-mail para receber o código.');
      return;
    }
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
      setAviso('Código enviado! Confira seu e-mail (e a caixa de spam).');
    } finally {
      setCarregando(false);
    }
  }

  async function handleTrocar(e: React.FormEvent) {
    e.preventDefault();
    if (novaSenha.length < 6) {
      setErro('A nova senha precisa ter no mínimo 6 caracteres.');
      return;
    }
    if (novaSenha !== confirmar) {
      setErro('A confirmação não confere com a nova senha.');
      return;
    }
    setErro(null);
    setAviso(null);
    setCarregando(true);
    try {
      const r = await trocarSenhaNaTelaDeLogin(email, senha, novaSenha);
      if (!r.sucesso) {
        setErro(r.erro || 'Falha ao trocar a senha.');
        return;
      }
      setSenha('');
      irPara('entrar');
      setAviso('Senha alterada! Entre com a nova senha.');
    } finally {
      setCarregando(false);
    }
  }

  async function handleRecuperar(e: React.FormEvent) {
    e.preventDefault();
    if (novaSenha.length < 6) {
      setErro('A nova senha precisa ter no mínimo 6 caracteres.');
      return;
    }
    if (novaSenha !== confirmar) {
      setErro('A confirmação não confere com a nova senha.');
      return;
    }
    setErro(null);
    setAviso(null);
    setCarregando(true);
    try {
      // encerrarSessao=true: a sessão criada pelo código não passa pelos gates de
      // liberação/expiração/sessão única — obriga o login normal com a senha nova.
      const r = await trocarSenhaComCodigo(email, codigo, novaSenha, true);
      if (!r.sucesso) {
        setErro(r.erro || 'Falha ao trocar a senha.');
        return;
      }
      irPara('entrar');
      setAviso('Senha alterada! Entre com a nova senha.');
    } finally {
      setCarregando(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    setCarregando(true);
    try {
      const resultado = modo === 'entrar' ? await login(email, senha) : await cadastrar(email, senha);
      if (resultado.sucesso) {
        // Redireciona por papel: admin da plataforma → painel; cliente final → portal;
        // mestre/gerente/funcionário → sistema.
        navigate(isAdmin() ? '/admin' : isCliente() ? '/portal' : '/dashboard');
      } else if (resultado.precisaConfirmarEmail) {
        setAviso('Conta criada! Confirme o e-mail pelo link enviado e depois entre.');
        setModo('entrar');
      } else if (resultado.aguardandoLiberacao) {
        setAviso('Conta criada! Aguarde a liberação do administrador para acessar o sistema.');
        setModo('entrar');
      } else {
        setErro(resultado.erro || 'Falha na operação.');
      }
    } finally {
      setCarregando(false);
    }
  }

  if (modo === 'trocar') {
    return (
      <div className="login-page">
        <form className="login-box" onSubmit={handleTrocar}>
          <svg className="login-logo" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
            <path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5l-8-3Z" />
          </svg>
          <h2>Trocar Senha</h2>
          <p className="login-desc">
            Confirme seu e-mail e a senha atual para definir uma nova senha.
          </p>
          <div className="input-group">
            <label htmlFor="tro-email">E-mail de acesso</label>
            <input
              id="tro-email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="input-group">
            <label htmlFor="tro-atual">Senha atual</label>
            <input
              id="tro-atual"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              minLength={6}
              required
            />
          </div>
          <div className="input-group">
            <label htmlFor="tro-nova">Nova senha (mín. 6 caracteres)</label>
            <input
              id="tro-nova"
              type="password"
              autoComplete="new-password"
              minLength={6}
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              required
            />
          </div>
          <div className="input-group">
            <label htmlFor="tro-confirmar">Confirmar nova senha</label>
            <input
              id="tro-confirmar"
              type="password"
              autoComplete="new-password"
              minLength={6}
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              required
            />
          </div>
          {erro && <p className="login-erro">{erro}</p>}
          {aviso && <p className="login-erro" style={{ color: '#1a7f37' }}>{aviso}</p>}
          <button type="submit" className="btn-login" disabled={carregando}>
            {carregando ? 'Aguarde...' : 'Trocar senha'}
          </button>
          <button
            type="button"
            className="btn-trocar-modo"
            onClick={() => irPara('entrar')}
            style={{ marginTop: 12, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}
          >
            ← Voltar para o login
          </button>
        </form>
      </div>
    );
  }

  if (modo === 'recuperar') {
    return (
      <div className="login-page">
        <form className="login-box" onSubmit={handleRecuperar}>
          <svg className="login-logo" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
            <path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5l-8-3Z" />
          </svg>
          <h2>Recuperar Senha</h2>
          <p className="login-desc">
            Informe seu e-mail para receber o código de confirmação e defina uma nova senha.
          </p>
          <div className="input-group">
            <label htmlFor="rec-email">E-mail de acesso</label>
            <input
              id="rec-email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <button
            type="button"
            className="btn-login"
            onClick={enviarCodigo}
            disabled={carregando || cooldown > 0}
            style={{ marginBottom: 14 }}
          >
            {cooldown > 0
              ? `Reenviar em ${cooldown}s`
              : codigoEnviado
                ? 'Reenviar código'
                : 'Enviar código por e-mail'}
          </button>
          {codigoEnviado && (
            <>
              <div className="input-group">
                <label htmlFor="rec-codigo">Código recebido no e-mail</label>
                <input
                  id="rec-codigo"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  required
                />
              </div>
              <div className="input-group">
                <label htmlFor="rec-nova">Nova senha (mín. 6 caracteres)</label>
                <input
                  id="rec-nova"
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  required
                />
              </div>
              <div className="input-group">
                <label htmlFor="rec-confirmar">Confirmar nova senha</label>
                <input
                  id="rec-confirmar"
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                  required
                />
              </div>
            </>
          )}
          {erro && <p className="login-erro">{erro}</p>}
          {aviso && <p className="login-erro" style={{ color: '#1a7f37' }}>{aviso}</p>}
          {codigoEnviado && (
            <button type="submit" className="btn-login" disabled={carregando}>
              {carregando ? 'Aguarde...' : 'Trocar senha'}
            </button>
          )}
          <button
            type="button"
            className="btn-trocar-modo"
            onClick={() => irPara('entrar')}
            style={{ marginTop: 12, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}
          >
            ← Voltar para o login
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="login-page">
      <form className="login-box" onSubmit={handleSubmit}>
        <svg className="login-logo" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
          <path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5l-8-3Z" />
        </svg>
        <h2>{modo === 'entrar' ? 'Acesso ao Sistema' : 'Criar Conta'}</h2>
        <p className="login-desc">
          {modo === 'entrar'
            ? 'Entre com seu e-mail e senha para acessar o NR-13.'
            : 'Crie uma conta com e-mail e senha para usar o NR-13.'}
        </p>
        <div className="input-group">
          <label htmlFor="login-email">E-mail de acesso</label>
          <input
            id="login-email"
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="input-group">
          <label htmlFor="login-senha">Senha</label>
          <input
            id="login-senha"
            type="password"
            placeholder="••••••••"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            minLength={6}
            required
          />
        </div>
        {erro && <p className="login-erro">{erro}</p>}
        {aviso && <p className="login-erro" style={{ color: '#1a7f37' }}>{aviso}</p>}
        <button type="submit" className="btn-login" disabled={carregando}>
          {carregando
            ? 'Aguarde...'
            : modo === 'entrar'
              ? 'Entrar no Sistema'
              : 'Criar Conta'}
        </button>
        {modo === 'entrar' && (
          <>
            <button
              type="button"
              className="btn-trocar-modo"
              onClick={() => irPara('trocar')}
              style={{ marginTop: 12, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}
            >
              Trocar minha senha
            </button>
            <button
              type="button"
              className="btn-trocar-modo"
              onClick={() => irPara('recuperar')}
              style={{ marginTop: 4, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}
            >
              Esqueci minha senha
            </button>
          </>
        )}
        <button
          type="button"
          className="btn-trocar-modo"
          onClick={() => irPara(modo === 'entrar' ? 'cadastrar' : 'entrar')}
          style={{ marginTop: modo === 'entrar' ? 4 : 12, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}
        >
          {modo === 'entrar' ? 'Não tem conta? Criar conta' : 'Já tem conta? Entrar'}
        </button>
      </form>
    </div>
  );
}
