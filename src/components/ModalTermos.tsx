import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ler, salvar } from '../services/storage';
import { logout } from '../services/auth';
import { Icone } from './Icone';

const CHAVE_ACEITE = 'nr13_termos_aceite';
const VERSAO_TERMOS = 1;

interface AceiteTermos {
  versao: number;
  aceitoEm: string;
}

// Boas-vindas + termos de uso do período de teste. Bloqueia o app até o aceite;
// recusar encerra a sessão. O aceite fica gravado (com data) no storage da conta.
export default function ModalTermos() {
  const [aceito, setAceito] = useState(() => {
    const a = ler<AceiteTermos>(CHAVE_ACEITE);
    return !!a && a.versao >= VERSAO_TERMOS;
  });
  const [marcado, setMarcado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const navigate = useNavigate();

  if (aceito) return null;

  async function aceitar() {
    setSalvando(true);
    try {
      await salvar(CHAVE_ACEITE, { versao: VERSAO_TERMOS, aceitoEm: new Date().toISOString() } satisfies AceiteTermos);
      setAceito(true);
    } finally {
      setSalvando(false);
    }
  }

  async function recusar() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="termos-overlay" role="dialog" aria-modal="true">
      <div className="termos-modal">
        <div className="termos-head">
          <Icone nome="shield" tam={26} />
          <div>
            <h2>Bem-vindo ao NR13 Sistema!</h2>
            <p>Antes de começar, leia e aceite os termos de uso do seu período de teste.</p>
          </div>
        </div>

        <div className="termos-corpo">
          <h3>O que o sistema faz</h3>
          <p>
            O NR13 Sistema apoia todo o ciclo da inspeção NR-13: cadastro de vasos de pressão,
            caldeiras e autoclaves; memoriais de cálculo (ASME) com PMTA e espessura mínima
            requerida; categorização de risco NR-13; inspeções em campo pelo celular (checklists,
            visual externo/interno, medição de espessura, teste hidrostático); croqui 2D cotado;
            prontuários, relatórios e livro de registro de segurança; calibração de válvulas e
            manômetros; e controle de vencimentos.
          </p>

          <h3>Termos de uso e responsabilidade</h3>
          <ol>
            <li>
              O sistema é uma <b>ferramenta de apoio</b> à elaboração de documentação NR-13. Ele
              <b> não substitui</b> o julgamento técnico do Profissional Habilitado (PH) responsável.
            </li>
            <li>
              <b>Todos os cálculos, resultados e documentos gerados devem ser revisados e validados
              previamente pelo engenheiro/usuário</b> antes de qualquer uso oficial. A
              responsabilidade técnica pela revisão, aprovação e assinatura é integralmente do
              engenheiro responsável e do usuário que opera o sistema.
            </li>
            <li>
              Não nos responsabilizamos por resultados decorrentes de <b>inserção incorreta de
              dados</b>, uso indevido da ferramenta, nem por <b>eventuais bugs ou inconsistências</b>
              — que devem ser identificados na análise prévia do profissional habilitado antes da
              emissão de qualquer documento.
            </li>
            <li>
              Documentos assinados (relatórios, prontuários, memoriais) são de responsabilidade
              exclusiva do profissional assinante, incluindo o recolhimento de ART quando aplicável.
            </li>
            <li>
              Conta de teste: acesso por <b>48 horas</b>, com download e impressão de documentos
              bloqueados. Os equipamentos de demonstração contêm <b>dados fictícios</b> e não devem
              ser usados em documentação real.
            </li>
            <li>
              O acesso é pessoal e intransferível; mantenha sua senha em sigilo. Os dados inseridos
              ficam vinculados à sua conta e não são compartilhados com outras organizações.
            </li>
          </ol>
        </div>

        <label className="termos-check">
          <input type="checkbox" checked={marcado} onChange={(e) => setMarcado(e.target.checked)} />
          Li e aceito os termos de uso e as condições de responsabilidade acima.
        </label>

        <div className="termos-acoes">
          <button type="button" className="termos-btn-recusar" onClick={() => void recusar()}>
            Recusar e sair
          </button>
          <button
            type="button"
            className="termos-btn-aceitar"
            disabled={!marcado || salvando}
            onClick={() => void aceitar()}
          >
            {salvando ? 'Salvando...' : 'Aceitar e começar'}
          </button>
        </div>
      </div>
    </div>
  );
}
