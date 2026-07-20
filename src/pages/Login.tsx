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
} from '../services/auth';
import { injetarDadosDemo } from '../services/demoSeed';
import './login.css';

const REENVIO_SEGUNDOS = 60; // rate limit do Supabase: 1 e-mail de recuperação por minuto
const VERSAO_SISTEMA = 'V. 1.0.0 (Build 2026)';

// Troca de senha FORA do app é uma só: código por e-mail (modo 'recuperar').
// Logado, o usuário troca pela sidebar (ModalTrocarSenha) — com senha atual ou código.
type ModoLogin = 'entrar' | 'cadastrar' | 'recuperar' | 'trial';

const FUNCIONALIDADES = [
  'Mapeamento NR-13 completo',
  'Gestão de prontuários e relatórios',
  'Cálculo de PMTA e espessura mínima',
  'Croqui 2D com todas as cotas',
  'Livro de registro de segurança',
  'Calibração de PSVs e manômetros',
  'Inspeção em campo pelo celular',
];

// Frases digitadas e apagadas em loop no canto inferior esquerdo.
function Digitando() {
  const [texto, setTexto] = useState('');
  const [i, setI] = useState(0);
  const [apagando, setApagando] = useState(false);

  useEffect(() => {
    const frase = FUNCIONALIDADES[i % FUNCIONALIDADES.length];
    let t: number;
    if (!apagando && texto.length < frase.length) {
      t = window.setTimeout(() => setTexto(frase.slice(0, texto.length + 1)), 55);
    } else if (!apagando && texto.length === frase.length) {
      t = window.setTimeout(() => setApagando(true), 1600);
    } else if (apagando && texto.length > 0) {
      t = window.setTimeout(() => setTexto(texto.slice(0, -1)), 26);
    } else {
      t = window.setTimeout(() => {
        setApagando(false);
        setI((n) => n + 1);
      }, 250);
    }
    return () => window.clearTimeout(t);
  }, [texto, apagando, i]);

  return (
    <div className="login-digitando" aria-hidden="true">
      {texto}
      <span className="login-cursor" />
    </div>
  );
}

// Rodapé institucional (IP identificado + versão). O IP/localidade vem de um serviço
// público best-effort — falhou/offline, a linha simplesmente não sai.
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
      <Digitando />
      <div className="login-rodape-esq">
        <strong>SISTEMA DE GESTÃO E INTEGRIDADE NR-13</strong>
        {ipTexto && <span>{ipTexto}</span>}
      </div>
      <div className="login-rodape-dir">{VERSAO_SISTEMA}</div>
    </>
  );
}

function IconeCadeado() {
  return (
    <svg className="login-cadeado" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
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
  // Popup do trial: 'codigo' (confirmar e-mail) → 'sucesso' (aviso das 48h)
  const [trialPopup, setTrialPopup] = useState<'codigo' | 'sucesso' | null>(null);
  const [popupErro, setPopupErro] = useState<string | null>(null);
  // Trial vencido no login: mostra o botão "Assinar agora" (placeholder do pagamento)
  const [trialExpirado, setTrialExpirado] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  // Flag global do admin: decide se o link "Teste grátis" aparece.
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
    setTrialPopup(null);
    setPopupErro(null);
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
        setCodigo('');
        setPopupErro(null);
        setCooldown(REENVIO_SEGUNDOS);
        setTrialPopup('codigo');
        return;
      }
      setErro(r.erro || 'Não foi possível concluir seu cadastro. Tente novamente.');
    } finally {
      setCarregando(false);
    }
  }

  async function handleTrialCodigo(e: React.FormEvent) {
    e.preventDefault();
    setPopupErro(null);
    setCarregando(true);
    try {
      const r = await confirmarCodigoTrial(email, codigo, {
        nome: leadNome.trim(),
        telefone: leadTelefone.trim(),
        empresaNome: leadEmpresa.trim(),
      });
      if (!r.sucesso) {
        setPopupErro(r.erro || 'Código inválido ou expirado.');
        return;
      }
      setTrialPopup('sucesso');
    } finally {
      setCarregando(false);
    }
  }

  async function comecarTeste() {
    setCarregando(true);
    try {
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
    setPopupErro(null);
    setCarregando(true);
    try {
      const r = await reenviarCodigoTrial(email);
      if (!r.sucesso) {
        setPopupErro(r.erro || 'Falha ao reenviar o código.');
        return;
      }
      setCooldown(REENVIO_SEGUNDOS);
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
        setAviso('Conta criada! Confirme o e-mail pelo código/link enviado e depois entre.');
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

  // ── Popup do trial (confirmação de e-mail → aviso das 48h) ─────────────────
  const popupTrial = trialPopup && (
    <div className="login-popup-overlay">
      <div className="login-popup" role="dialog" aria-modal="true">
        {trialPopup === 'codigo' ? (
          <form onSubmit={handleTrialCodigo}>
            <img className="login-popup-img" src="/login-suporte.webp" alt="Equipe de suporte" />
            <h3>Confirme seu e-mail</h3>
            <p>
              Enviamos um código de 6 dígitos para <strong>{email}</strong>. Digite-o abaixo para
              ativar seu teste (confira também a caixa de spam).
            </p>
            <div className="login-campo-codigo">
              <IconeCadeado />
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                maxLength={8}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                autoFocus
                required
              />
            </div>
            {popupErro && <p className="login-erro">{popupErro}</p>}
            <button type="submit" className="btn-login" disabled={carregando}>
              {carregando ? 'Verificando...' : 'Confirmar código'}
            </button>
            <div className="login-popup-acoes">
              <button type="button" onClick={reenviarTrial} disabled={carregando || cooldown > 0}>
                {cooldown > 0 ? `Reenviar em ${cooldown}s` : 'Reenviar código'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTrialPopup(null);
                  setPopupErro(null);
                }}
              >
                Corrigir e-mail
              </button>
            </div>
          </form>
        ) : (
          <div>
            <img className="login-popup-img" src="/login-suporte.webp" alt="Equipe de suporte" />
            <h3>Tudo certo! Seu teste começou</h3>
            <p>
              Você terá acesso completo ao sistema por <strong>48 horas</strong>. Aproveite para
              fazer um teste real de tudo — memorial de cálculo, categoria NR-13, inspeções em
              campo, prontuários e relatórios — assim você conhece bem o sistema antes de assinar.
            </p>
            <p className="login-popup-nota">
              Já deixamos equipamentos de demonstração na sua conta para você explorar à vontade.
            </p>
            <button type="button" className="btn-login" onClick={comecarTeste} disabled={carregando}>
              {carregando ? 'Preparando...' : 'Começar meu teste'}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  if (modo === 'trial') {
    return (
      <div className="login-page">
        <form className="login-box" onSubmit={handleTrialCadastro}>
          <img className="login-logo-img" src="/login-logo.webp" alt="NR-13" />
          <h2>Teste Gratuito — 48h</h2>
          {!trialPermitido ? (
            <>
              <p className="login-desc">O cadastro automático está temporariamente indisponível.</p>
              <button type="button" className="btn-link-login" onClick={() => irPara('entrar')}>
                ← Voltar para o login
              </button>
            </>
          ) : (
            <>
              <p className="login-desc">Preencha seus dados para testar o sistema por 2 dias, sem compromisso.</p>
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
              {aviso && <p className="login-aviso-ok">{aviso}</p>}
              <button type="submit" className="btn-login" disabled={carregando}>
                {carregando ? 'Aguarde...' : 'Criar conta de teste'}
              </button>
              <button type="button" className="btn-link-login" onClick={() => irPara('entrar')}>
                ← Voltar para o login
              </button>
            </>
          )}
        </form>
        {popupTrial}
        <RodapeLogin />
      </div>
    );
  }

  if (modo === 'recuperar') {
    return (
      <div className="login-page">
        <form className="login-box" onSubmit={handleRecuperar}>
          <img className="login-logo-img" src="/login-logo.webp" alt="NR-13" />
          <h2>Trocar Senha</h2>
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
          {aviso && <p className="login-aviso-ok">{aviso}</p>}
          {codigoEnviado && (
            <button type="submit" className="btn-login" disabled={carregando}>
              {carregando ? 'Aguarde...' : 'Trocar senha'}
            </button>
          )}
          <button type="button" className="btn-link-login" onClick={() => irPara('entrar')}>
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
        <img className="login-logo-img" src="/login-logo.webp" alt="NR-13" />
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
        {aviso && <p className="login-aviso-ok">{aviso}</p>}
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
        {modo === 'entrar' ? (
          <div className="login-links-grid">
            {trialPermitido && (
              <button type="button" className="btn-link-login destaque" onClick={() => irPara('trial')}>
                Teste grátis de 48h
              </button>
            )}
            <button type="button" className="btn-link-login" onClick={() => irPara('recuperar')}>
              Esqueci / trocar senha
            </button>
            <button
              type="button"
              className={`btn-link-login${trialPermitido ? ' col-toda' : ''}`}
              onClick={() => irPara('cadastrar')}
            >
              Não tem conta? Criar conta
            </button>
          </div>
        ) : (
          <div className="login-links-grid">
            <button type="button" className="btn-link-login col-toda" onClick={() => irPara('entrar')}>
              Já tem conta? Entrar
            </button>
          </div>
        )}
      </form>
      <RodapeLogin />
    </div>
  );
}
