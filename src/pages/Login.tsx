import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  login,
  cadastrar,
  cadastrarTrial,
  confirmarCodigoTrial,
  reenviarCodigoTrial,
  cadastroAutomaticoPermitido,
  isAdmin,
  isCliente,
  enviarCodigoTrocaSenha,
  trocarSenhaComCodigo,
  trocarSenhaNaTelaDeLogin,
} from '../services/auth';
import { injetarDadosDemo } from '../services/demoSeed';
import './login.css';

const REENVIO_SEGUNDOS = 60; // rate limit do Supabase: 1 e-mail de recuperação por minuto
const VERSAO_SISTEMA = 'V. 1.0.0 (Build 2026)';

type ModoLogin = 'entrar' | 'cadastrar' | 'recuperar' | 'trocar' | 'trial';

// Rodapé institucional da tela de login (IP identificado + versão). O IP/localidade
// vem de um serviço público best-effort — falhou/offline, a linha simplesmente não sai.
function RodapeLogin() {
  const [ipTexto, setIpTexto] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch('https://ipapi.co/json/')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo || !d?.ip) return;
        const local = [d.city, d.region].filter(Boolean).join(' / ');
        setIpTexto(`IP Identificado: ${d.ip}${local ? ` · ${local}` : ''}`);
      })
      .catch(() => {
        // sem rede/adblock: rodapé fica só com o nome do sistema
      });
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <>
      <div className="login-rodape-esq">
        <strong>SISTEMA DE GESTÃO E INTEGRIDADE NR-13</strong>
        {ipTexto && <span>{ipTexto}</span>}
      </div>
      <div className="login-rodape-dir">{VERSAO_SISTEMA}</div>
    </>
  );
}

export default function Login() {
  const [modo, setModo] = useState<ModoLogin>('entrar');
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
  // Cadastro automático de trial (48h)
  const [trialPermitido, setTrialPermitido] = useState(false);
  const [leadNome, setLeadNome] = useState('');
  const [leadTelefone, setLeadTelefone] = useState('');
  const [leadEmpresa, setLeadEmpresa] = useState('');
  // Trial vencido no login: mostra o botão "Assinar agora" (placeholder do pagamento)
  const [trialExpirado, setTrialExpirado] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  // Flag global do admin (config_global via Edge Function): decide se o botão
  // "Testar gratuitamente" aparece. Falha de rede/função ausente = não aparece.
  useEffect(() => {
    let vivo = true;
    void cadastroAutomaticoPermitido().then((p) => {
      if (vivo) setTrialPermitido(p);
    });
    return () => {
      vivo = false;
    };
  }, []);

  function irPara(m: ModoLogin) {
    setErro(null);
    setAviso(null);
    setCodigoEnviado(false);
    setCodigo('');
    setNovaSenha('');
    setConfirmar('');
    setModo(m);
  }

  // Ponto único para plugar o pagamento no futuro (Stripe/Mercado Pago/etc.).
  function assinarAgora() {
    setAviso('Em breve! Para contratar o sistema agora, fale com a nossa equipe pelo e-mail acesso@auth.nr13sistema.com.br.');
  }

  async function handleTrialCadastro(e: React.FormEvent) {
    e.preventDefault();
    if (senha.length < 6) {
      setErro('A senha precisa ter no mínimo 6 caracteres.');
      return;
    }
    if (senha !== confirmar) {
      setErro('A confirmação não confere com a senha.');
      return;
    }
    setErro(null);
    setAviso(null);
    setCarregando(true);
    try {
      const r = await cadastrarTrial(email, senha, {
        nome: leadNome.trim(),
        telefone: leadTelefone.trim(),
        empresaNome: leadEmpresa.trim(),
      });
      if (r.precisaConfirmarEmail) {
        setCodigoEnviado(true);
        setCooldown(REENVIO_SEGUNDOS);
        setAviso('Enviamos um código de confirmação para seu e-mail.');
        return;
      }
      setErro(r.erro || 'Não foi possível concluir seu cadastro. Tente novamente.');
    } finally {
      setCarregando(false);
    }
  }

  async function handleTrialCodigo(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    setCarregando(true);
    try {
      const r = await confirmarCodigoTrial(email, codigo, {
        nome: leadNome.trim(),
        telefone: leadTelefone.trim(),
        empresaNome: leadEmpresa.trim(),
      });
      if (!r.sucesso) {
        setErro(r.erro || 'Código inválido ou expirado.');
        return;
      }
      // Dados de demonstração (best-effort: falha não impede a entrada).
      try {
        await injetarDadosDemo(leadEmpresa.trim());
      } catch {
        // seed é conveniência; o sistema funciona vazio
      }
      navigate('/dashboard');
    } finally {
      setCarregando(false);
    }
  }

  async function reenviarTrial() {
    setErro(null);
    setCarregando(true);
    try {
      const r = await reenviarCodigoTrial(email);
      if (!r.sucesso) {
        setErro(r.erro || 'Falha ao reenviar o código.');
        return;
      }
      setCooldown(REENVIO_SEGUNDOS);
      setAviso('Código reenviado.');
    } finally {
      setCarregando(false);
    }
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
      } else if (resultado.trialExpirado) {
        setTrialExpirado(true);
        setErro(resultado.erro || 'Seu período de teste terminou.');
      } else {
        setErro(resultado.erro || 'Falha na operação.');
      }
    } finally {
      setCarregando(false);
    }
  }

  if (modo === 'trial') {
    return (
      <div className="login-page">
        <form className="login-box" onSubmit={codigoEnviado ? handleTrialCodigo : handleTrialCadastro}>
          <svg className="login-logo" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
            <path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5l-8-3Z" />
          </svg>
          <h2>Teste Gratuito — 2 dias</h2>
          {!trialPermitido ? (
            <>
              <p className="login-desc">O cadastro automático está temporariamente indisponível.</p>
              <button
                type="button"
                className="btn-trocar-modo"
                onClick={() => irPara('entrar')}
                style={{ marginTop: 12, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}
              >
                ← Voltar para o login
              </button>
            </>
          ) : !codigoEnviado ? (
            <>
              <p className="login-desc">
                Preencha seus dados para testar o sistema por 48 horas, sem compromisso.
              </p>
              <div className="input-group">
                <label htmlFor="tri-nome">Nome completo</label>
                <input id="tri-nome" type="text" value={leadNome} onChange={(e) => setLeadNome(e.target.value)} required />
              </div>
              <div className="input-group">
                <label htmlFor="tri-email">E-mail</label>
                <input
                  id="tri-email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="input-group">
                <label htmlFor="tri-fone">Telefone</label>
                <input
                  id="tri-fone"
                  type="tel"
                  placeholder="(00) 00000-0000"
                  value={leadTelefone}
                  onChange={(e) => setLeadTelefone(e.target.value)}
                  required
                />
              </div>
              <div className="input-group">
                <label htmlFor="tri-empresa">Nome da empresa</label>
                <input id="tri-empresa" type="text" value={leadEmpresa} onChange={(e) => setLeadEmpresa(e.target.value)} required />
              </div>
              <div className="input-group">
                <label htmlFor="tri-senha">Senha (mín. 6 caracteres)</label>
                <input
                  id="tri-senha"
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  required
                />
              </div>
              <div className="input-group">
                <label htmlFor="tri-confirmar">Confirmar senha</label>
                <input
                  id="tri-confirmar"
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
                {carregando ? 'Aguarde...' : 'Criar conta de teste'}
              </button>
            </>
          ) : (
            <>
              <p className="login-desc">
                Enviamos um código de confirmação para <strong>{email}</strong>. Digite-o abaixo
                (confira também a caixa de spam).
              </p>
              <div className="input-group">
                <label htmlFor="tri-codigo">Código recebido no e-mail</label>
                <input
                  id="tri-codigo"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  required
                />
              </div>
              {erro && <p className="login-erro">{erro}</p>}
              {aviso && <p className="login-erro" style={{ color: '#1a7f37' }}>{aviso}</p>}
              <button type="submit" className="btn-login" disabled={carregando}>
                {carregando ? 'Aguarde...' : 'Confirmar e começar o teste'}
              </button>
              <button
                type="button"
                className="btn-login"
                onClick={reenviarTrial}
                disabled={carregando || cooldown > 0}
                style={{ marginTop: 10 }}
              >
                {cooldown > 0 ? `Reenviar em ${cooldown}s` : 'Reenviar código'}
              </button>
              <button
                type="button"
                className="btn-trocar-modo"
                onClick={() => {
                  setErro(null);
                  setAviso(null);
                  setCodigo('');
                  setCodigoEnviado(false);
                }}
                style={{ marginTop: 12, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}
              >
                Corrigir e-mail
              </button>
            </>
          )}
          {trialPermitido && (
            <button
              type="button"
              className="btn-trocar-modo"
              onClick={() => irPara('entrar')}
              style={{ marginTop: 4, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}
            >
              ← Voltar para o login
            </button>
          )}
        </form>
        <RodapeLogin />
      </div>
    );
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
        <RodapeLogin />
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
        <RodapeLogin />
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
        {trialExpirado && (
          <button type="button" className="btn-login" onClick={assinarAgora} style={{ marginBottom: 10 }}>
            Assinar agora
          </button>
        )}
        <button type="submit" className="btn-login" disabled={carregando}>
          {carregando
            ? 'Aguarde...'
            : modo === 'entrar'
              ? 'Entrar no Sistema'
              : 'Criar Conta'}
        </button>
        {modo === 'entrar' && trialPermitido && (
          <button
            type="button"
            className="btn-trocar-modo"
            onClick={() => irPara('trial')}
            style={{ marginTop: 12, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}
          >
            Testar o sistema gratuitamente por 2 dias
          </button>
        )}
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
      <RodapeLogin />
    </div>
  );
}
