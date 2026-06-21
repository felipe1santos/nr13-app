import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../services/auth';
import './login.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      const resultado = await login(email, senha);
      if (resultado.sucesso) {
        navigate('/dashboard');
      } else {
        setErro(resultado.erro || 'Falha no login.');
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
        <h2>Acesso ao Sistema</h2>
        <p className="login-desc">Entre com seu e-mail e senha cadastrados para acessar o NR-13.</p>
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
            minLength={4}
            required
          />
        </div>
        {erro && <p className="login-erro">{erro}</p>}
        <button type="submit" className="btn-login" disabled={carregando}>
          {carregando ? 'Entrando...' : 'Entrar no Sistema'}
        </button>
      </form>
    </div>
  );
}
