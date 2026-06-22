import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, cadastrar } from '../services/auth';
import './login.css';

export default function Login() {
  const [modo, setModo] = useState<'entrar' | 'cadastrar'>('entrar');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    setCarregando(true);
    try {
      const resultado = modo === 'entrar' ? await login(email, senha) : await cadastrar(email, senha);
      if (resultado.sucesso) {
        navigate('/dashboard');
      } else if (resultado.precisaConfirmarEmail) {
        setAviso('Conta criada! Confirme o e-mail pelo link enviado e depois entre.');
        setModo('entrar');
      } else {
        setErro(resultado.erro || 'Falha na operação.');
      }
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-box" onSubmit={handleSubmit}>
        <svg className="login-logo" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#1a73e8" strokeWidth="2">
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
        <button
          type="button"
          className="btn-trocar-modo"
          onClick={() => {
            setErro(null);
            setAviso(null);
            setModo((m) => (m === 'entrar' ? 'cadastrar' : 'entrar'));
          }}
          style={{ marginTop: 12, background: 'none', border: 'none', color: '#1a73e8', cursor: 'pointer' }}
        >
          {modo === 'entrar' ? 'Não tem conta? Criar conta' : 'Já tem conta? Entrar'}
        </button>
      </form>
    </div>
  );
}
