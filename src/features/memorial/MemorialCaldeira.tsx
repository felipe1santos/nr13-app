import { useEffect, useState } from 'react';
import Campo from './Campo';
import MemorialLog from './MemorialLog';
import { ler } from '../../services/storage';
import { comLoadingGlobal } from '../../app/loadingGlobal';
import {
  calcularAbaCaldeira,
  calcularResumoCaldeira,
  calcularResumoAqua,
  calcularAbaAqua,
  carregarDadosCaldeira,
  carregarDadosAqua,
  carregarTiposCaldeira,
  chaveDadosCaldeira,
  salvarDadosCaldeira,
  salvarDadosAqua,
  salvarResumoCaldeira,
  salvarResumoAqua,
  salvarTiposCaldeira,
  ABAS_AQUATUBULAR,
  ROTULOS_AQUATUBULAR,
  ABAS_MISTA,
  calcularResumoMista,
  carregarAtivasMista,
  chaveAbaMista,
  salvarAtivasMista,
  salvarResumoMista,
  type AbaCaldeira,
  type AbaAquatubular,
  type AbaMista,
  type ResumoMemorialCaldeira,
  type ResumoMemorialAqua,
  type ResumoMemorialMista,
  type TiposCaldeira,
} from './caldeiraMemorialService';
import type { ResultadoCalculo } from '../../calc/tipos';
import './memorial.css';

const ABAS_FLAMO: { value: AbaCaldeira; label: string }[] = [
  { value: 'costado', label: 'Costado' },
  { value: 'tampo', label: 'Tampo/Fundo' },
  { value: 'espelho', label: 'Espelho' },
  { value: 'fornalha', label: 'Fornalha' },
  { value: 'tubo', label: 'Tubos de Fogo' },
];

// Caldeira vertical fogotubular: mesmos 5 componentes/cálculos do flamotubular, só muda a
// nomenclatura (fornalha interna, espelho = placa tubular) e o default da fornalha (lisa).
const ABAS_VERTICAL: { value: AbaCaldeira; label: string }[] = [
  { value: 'costado', label: 'Costado' },
  { value: 'tampo', label: 'Tampo Superior' },
  { value: 'espelho', label: 'Espelho/Placa Tubular' },
  { value: 'fornalha', label: 'Fornalha Interna' },
  { value: 'tubo', label: 'Tubos de Fogo' },
];

export type SubtipoCaldeiraMemorial = 'flamotubular' | 'aquatubular' | 'vertical' | 'mista';

export default function MemorialCaldeira({ tag, subtipo }: { tag: string; subtipo: SubtipoCaldeiraMemorial }) {
  const ehFlamoLike = subtipo === 'flamotubular' || subtipo === 'vertical';
  const abasFlamoRotulos = subtipo === 'vertical' ? ABAS_VERTICAL : ABAS_FLAMO;
  const [salvando, setSalvando] = useState(false);
  // "sujo" = há edições não persistidas no memorial salvo (nr13_calc). Avisa antes de sair.
  const [dirty, setDirty] = useState(false);

  // flamotubular state
  const [abaFlamo, setAbaFlamo] = useState<AbaCaldeira>('costado');
  const [tipos, setTipos] = useState<TiposCaldeira>(() => carregarTiposCaldeira(tag));
  const [resumoFlamo, setResumoFlamo] = useState<ResumoMemorialCaldeira | null>(null);

  // aquatubular state
  const [abaAqua, setAbaAqua] = useState<AbaAquatubular>('tubulaoSup');
  const [resumoAqua, setResumoAqua] = useState<ResumoMemorialAqua | null>(null);

  // mista state
  const [ativasMista, setAtivasMista] = useState<Record<string, boolean>>(() => carregarAtivasMista(tag));
  const [abaMista, setAbaMista] = useState<string>('aqua:tubulaoSup');
  const [resumoMista, setResumoMista] = useState<ResumoMemorialMista | null>(null);

  // Caldeira vertical: fornalha nasce como "lisa" na primeira abertura (sem dados salvos).
  useEffect(() => {
    if (subtipo !== 'vertical') return;
    if (ler(chaveDadosCaldeira(tag, 'fornalha')) == null) {
      void salvarDadosCaldeira(tag, 'fornalha', { tipo_fornalha: 'lisa' });
    }
  }, [subtipo, tag]);

  // Avisa ao tentar fechar/recarregar com memorial não salvo.
  useEffect(() => {
    function aviso(e: BeforeUnloadEvent) {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [dirty]);

  const marcarTipos: React.Dispatch<React.SetStateAction<TiposCaldeira>> = (acao) => {
    setTipos((t) => {
      const novo = typeof acao === 'function' ? (acao as (p: TiposCaldeira) => TiposCaldeira)(t) : acao;
      salvarTiposCaldeira(tag, novo); // persiste local (sync) p/ "Gerar" ler atualizado
      return novo;
    });
    setDirty(true);
  };

  function gerarFlamo() {
    // lê os dados já auto-persistidos de cada aba (não há mais dado preso em estado local de aba)
    setResumoFlamo(calcularResumoCaldeira(tag, tipos));
  }

  // Botão único: persiste as abas (já estão no localStorage), recalcula e salva o memorial completo.
  async function salvarFlamo() {
    setSalvando(true);
    try {
      const resumo = calcularResumoCaldeira(tag, tipos);
      setResumoFlamo(resumo);
      await comLoadingGlobal('Salvando memorial...', async () => {
        await salvarTiposCaldeira(tag, tipos);
        await salvarResumoCaldeira(tag, resumo, tipos);
      });
      setDirty(false);
      window.alert('Memorial salvo com sucesso!');
    } finally {
      setSalvando(false);
    }
  }

  function gerarAqua() {
    setResumoAqua(calcularResumoAqua(tag));
  }

  function alternarAbaMista(m: AbaMista, ligada: boolean) {
    const novo = { ...ativasMista, [chaveAbaMista(m)]: ligada };
    setAtivasMista(novo);
    void salvarAtivasMista(tag, novo);
    setDirty(true);
  }

  function gerarMista() {
    setResumoMista(calcularResumoMista(tag, tipos));
  }

  async function salvarMista() {
    setSalvando(true);
    try {
      const resumo = calcularResumoMista(tag, tipos);
      setResumoMista(resumo);
      await comLoadingGlobal('Salvando memorial...', async () => {
        await salvarTiposCaldeira(tag, tipos);
        await salvarResumoMista(tag, resumo, tipos);
      });
      setDirty(false);
      window.alert('Memorial salvo com sucesso!');
    } finally {
      setSalvando(false);
    }
  }

  async function salvarAqua() {
    setSalvando(true);
    try {
      const resumo = calcularResumoAqua(tag);
      setResumoAqua(resumo);
      await comLoadingGlobal('Salvando memorial...', () => salvarResumoAqua(tag, resumo));
      setDirty(false);
      window.alert('Memorial salvo com sucesso!');
    } finally {
      setSalvando(false);
    }
  }

  const abasMistaAtivas = ABAS_MISTA.filter((m) => ativasMista[chaveAbaMista(m)]);
  const abaMistaEfetiva = abasMistaAtivas.some((m) => chaveAbaMista(m) === abaMista)
    ? abaMista
    : abasMistaAtivas.length > 0
      ? chaveAbaMista(abasMistaAtivas[0])
      : '';
  const abaMistaObj = abasMistaAtivas.find((m) => chaveAbaMista(m) === abaMistaEfetiva) ?? null;

  function rotuloMista(m: AbaMista): string {
    return m.familia === 'aqua'
      ? ROTULOS_AQUATUBULAR[m.aba as AbaAquatubular]
      : (ABAS_FLAMO.find((a) => a.value === m.aba)?.label ?? m.aba);
  }

  if (subtipo === 'mista') {
    return (
      <div>
        <p className="memorial-dica-salvar" style={{ margin: '4px 0 8px' }}>
          Caldeira mista: ative apenas os componentes que o equipamento possui. Circuito aquatubular
          (tubulões, tubos geradores, coletores) + corpo fogotubular (costado, tampo, espelho, fornalha, tubos de fogo).
        </p>
        <div className="mista-toggles">
          {ABAS_MISTA.map((m) => {
            const chave = chaveAbaMista(m);
            return (
              <label key={chave} className={`mista-chip${ativasMista[chave] ? ' ativo' : ''}`}>
                <input type="checkbox" checked={!!ativasMista[chave]} onChange={(e) => alternarAbaMista(m, e.target.checked)} />
                {rotuloMista(m)}
              </label>
            );
          })}
        </div>

        <div className="abas-caldeira">
          {abasMistaAtivas.map((m) => {
            const chave = chaveAbaMista(m);
            return (
              <button
                key={chave}
                type="button"
                className={`aba-caldeira-btn ${abaMistaEfetiva === chave ? 'ativa' : ''}`}
                onClick={() => setAbaMista(chave)}
              >
                {rotuloMista(m)}
              </button>
            );
          })}
        </div>

        {abaMistaObj && abaMistaObj.familia === 'flamo' && (
          <PainelAbaFlamo
            key={abaMistaEfetiva}
            tag={tag}
            aba={abaMistaObj.aba as AbaCaldeira}
            tipos={tipos}
            setTipos={marcarTipos}
            onMudou={() => setDirty(true)}
          />
        )}
        {abaMistaObj && abaMistaObj.familia === 'aqua' && (
          <PainelAbaAqua key={abaMistaEfetiva} tag={tag} aba={abaMistaObj.aba as AbaAquatubular} onMudou={() => setDirty(true)} />
        )}

        <div className="memorial-acoes" style={{ marginTop: 18 }}>
          <button type="button" className="btn-secundario" onClick={gerarMista}>
            Pré-visualizar ({abasMistaAtivas.length} componentes)
          </button>
          <button type="button" className="btn-primario" onClick={salvarMista} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar Memorial Completo'}
          </button>
        </div>

        {resumoMista && (
          <div style={{ marginTop: 14 }}>
            <p>
              <strong>PMTA do equipamento:</strong>{' '}
              {resumoMista.pmtaFinal != null ? `${resumoMista.pmtaFinal.toFixed(2)} MPa` : '—'} &nbsp;|&nbsp;{' '}
              <strong>Pressão de Teste (1.5×, PG-99):</strong>{' '}
              {resumoMista.pthFinal != null ? `${resumoMista.pthFinal.toFixed(2)} MPa` : '—'}
            </p>
            <span className={`resultado-final-badge ${resumoMista.resultado === 'APROVADO' ? 'aprovado' : 'reprovado'}`}>
              {resumoMista.resultado}
            </span>
            <MemorialLog log={resumoMista.logCompleto} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {ehFlamoLike ? (
        /* ── FLAMOTUBULAR / VERTICAL ── */
        <div>
          <div className="abas-caldeira">
            {abasFlamoRotulos.map((a) => (
              <button
                key={a.value}
                type="button"
                className={`aba-caldeira-btn ${abaFlamo === a.value ? 'ativa' : ''}`}
                onClick={() => setAbaFlamo(a.value)}
              >
                {a.label}
              </button>
            ))}
          </div>

          <PainelAbaFlamo key={abaFlamo} tag={tag} aba={abaFlamo} tipos={tipos} setTipos={marcarTipos} onMudou={() => setDirty(true)} />

          <div className="memorial-acoes" style={{ marginTop: 18 }}>
            <button type="button" className="btn-secundario" onClick={gerarFlamo}>
              Pré-visualizar (5 componentes)
            </button>
            <button type="button" className="btn-primario" onClick={salvarFlamo} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar Memorial Completo'}
            </button>
          </div>

          {resumoFlamo && (
            <div style={{ marginTop: 14 }}>
              <p>
                <strong>PMTA do equipamento:</strong>{' '}
                {resumoFlamo.pmtaFinal != null ? `${resumoFlamo.pmtaFinal.toFixed(2)} MPa` : '—'} &nbsp;|&nbsp;{' '}
                <strong>Pressão de Teste (1.5×, PG-99):</strong>{' '}
                {resumoFlamo.pthFinal != null ? `${resumoFlamo.pthFinal.toFixed(2)} MPa` : '—'}
              </p>
              <span className={`resultado-final-badge ${resumoFlamo.resultado === 'APROVADO' ? 'aprovado' : 'reprovado'}`}>
                {resumoFlamo.resultado}
              </span>
              <MemorialLog log={resumoFlamo.logCompleto} />
            </div>
          )}
        </div>
      ) : (
        /* ── AQUATUBULAR ── */
        <div>
          <div className="abas-caldeira">
            {ABAS_AQUATUBULAR.map((a) => (
              <button
                key={a}
                type="button"
                className={`aba-caldeira-btn ${abaAqua === a ? 'ativa' : ''}`}
                onClick={() => setAbaAqua(a)}
              >
                {ROTULOS_AQUATUBULAR[a]}
              </button>
            ))}
          </div>

          <PainelAbaAqua key={abaAqua} tag={tag} aba={abaAqua} onMudou={() => setDirty(true)} />

          <div className="memorial-acoes" style={{ marginTop: 18 }}>
            <button type="button" className="btn-secundario" onClick={gerarAqua}>
              Pré-visualizar (8 componentes)
            </button>
            <button type="button" className="btn-primario" onClick={salvarAqua} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar Memorial Completo'}
            </button>
          </div>

          {resumoAqua && (
            <div style={{ marginTop: 14 }}>
              <p>
                <strong>PMTA do equipamento:</strong>{' '}
                {resumoAqua.pmtaFinal != null ? `${resumoAqua.pmtaFinal.toFixed(2)} MPa` : '—'} &nbsp;|&nbsp;{' '}
                <strong>Pressão de Teste (1.5×, PG-99):</strong>{' '}
                {resumoAqua.pthFinal != null ? `${resumoAqua.pthFinal.toFixed(2)} MPa` : '—'}
              </p>
              <span className={`resultado-final-badge ${resumoAqua.resultado === 'APROVADO' ? 'aprovado' : 'reprovado'}`}>
                {resumoAqua.resultado}
              </span>
              <MemorialLog log={resumoAqua.logCompleto} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Painel flamotubular (igual ao original) ──────────────────────────────────

function subtipoEfetivo(aba: AbaCaldeira, tipos: TiposCaldeira): string {
  if (aba === 'tampo') return tipos.tampo;
  if (aba === 'espelho') return tipos.espelho;
  return aba;
}

const ROTULOS_SUBTIPO: Record<string, string> = {
  costado: 'Costado / Tubulão',
  tubo: 'Tubo de Fogo',
  fornalha: 'Fornalha',
  tampoAbaulado: 'Tampo Abaulado (PG-29.1)',
  tampoElipsoidal: 'Tampo Elíptico 2:1 (PG-29.7)',
  tampoPlano: 'Tampo Plano (PG-31/UG-34)',
  espelhoEstaiado: 'Espelho Estaiado (PG-46.1)',
  espelhoNaoEstaiado: 'Espelho Não-Estaiado (PG-31)',
};

function PainelAbaFlamo({
  tag,
  aba,
  tipos,
  setTipos,
  onMudou,
}: {
  tag: string;
  aba: AbaCaldeira;
  tipos: TiposCaldeira;
  setTipos: React.Dispatch<React.SetStateAction<TiposCaldeira>>;
  onMudou: () => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [dados, setDados] = useState<Record<string, any>>(() => carregarDadosCaldeira(tag, aba));
  const [resultadoAba, setResultadoAba] = useState<ResultadoCalculo | null>(null);

  // Auto-persiste a aba a cada edição: assim trocar de aba não perde dados e "Gerar/Salvar"
  // sempre leem os valores atuais (corrige o memorial que vinha vazio/desatualizado).
  function set(chave: string, valor: unknown) {
    setDados((d) => {
      const novo = { ...d, [chave]: valor };
      salvarDadosCaldeira(tag, aba, novo);
      return novo;
    });
    onMudou();
  }

  function calcularAba() {
    setResultadoAba(calcularAbaCaldeira(aba, tipos, dados));
  }

  return (
    <div className="memorial-painel">
      <div className="memorial-painel-campos">
        {(aba === 'tampo' || aba === 'espelho' || aba === 'fornalha') && (
          <Campo
            label="Subtipo"
            value={aba === 'tampo' ? tipos.tampo : aba === 'espelho' ? tipos.espelho : (dados.tipo_fornalha as string) || 'fox'}
            onChange={(v) => {
              if (aba === 'tampo') setTipos((t) => ({ ...t, tampo: v as TiposCaldeira['tampo'] }));
              else if (aba === 'espelho') setTipos((t) => ({ ...t, espelho: v as TiposCaldeira['espelho'] }));
              else set('tipo_fornalha', v);
            }}
            options={
              aba === 'tampo'
                ? [
                    { value: 'tampoAbaulado', label: 'Tampo Abaulado (PG-29.1)' },
                    { value: 'tampoElipsoidal', label: 'Tampo Elipsoidal 2:1 (PG-29.7)' },
                    { value: 'tampoPlano', label: 'Tampo Plano (PG-31/UG-34)' },
                  ]
                : aba === 'espelho'
                  ? [
                      { value: 'espelhoEstaiado', label: 'Espelho Estaiado (PG-46.1)' },
                      { value: 'espelhoNaoEstaiado', label: 'Espelho Não-Estaiado (PG-31)' },
                    ]
                  : [
                      { value: 'lisa', label: 'Cilíndrica Lisa' },
                      { value: 'fox', label: 'Ondulada Fox (C=97)' },
                      { value: 'morison', label: 'Ondulada Morison (C=108)' },
                      { value: 'leeds', label: 'Ondulada Leeds (C=119)' },
                    ]
            }
          />
        )}

        <CamposAbaFlamo aba={aba} tipos={tipos} dados={dados} set={set} />

        <div className="memorial-acoes">
          <button type="button" className="btn-secundario" onClick={calcularAba}>
            Calcular esta aba
          </button>
          <span className="memorial-dica-salvar">Dados salvos automaticamente ao digitar. Use “Salvar Memorial Completo” no final.</span>
        </div>

        {resultadoAba && (
          <div>
            <span className={`resultado-final-badge ${resultadoAba.resultado === 'APROVADO' ? 'aprovado' : 'reprovado'}`}>
              {resultadoAba.resultado}
            </span>
            <MemorialLog log={resultadoAba.log} />
          </div>
        )}
      </div>
      <div className="memorial-painel-label">{ROTULOS_SUBTIPO[subtipoEfetivo(aba, tipos)] ?? aba}</div>
    </div>
  );
}

function CamposAbaFlamo({
  aba,
  tipos,
  dados,
  set,
}: {
  aba: AbaCaldeira;
  tipos: TiposCaldeira;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dados: Record<string, any>;
  set: (chave: string, valor: unknown) => void;
}) {
  const comuns = (
    <>
      <Campo label="P — Pressão de Projeto (MPa)" value={dados.pressao ?? ''} onChange={(v) => set('pressao', Number(v))} />
      <Campo label="CA — Corrosão Adm. (mm)" value={dados.ca ?? ''} onChange={(v) => set('ca', Number(v))} />
      <Campo label="Tnom — Esp. Comercial (mm)" value={dados.t_comercial ?? ''} onChange={(v) => set('t_comercial', Number(v))} />
      {/* Material é texto livre — injetado em componentes[].material no RESUMO, não entra no cálculo. */}
      <Campo label="Material" type="text" value={(dados.material as string) ?? ''} onChange={(v) => set('material', v)} />
    </>
  );

  if (aba === 'costado' || (aba === 'tampo' && tipos.tampo === 'tampoElipsoidal')) {
    return (
      <div className="memorial-campos-grid">
        {comuns}
        <Campo label="S — Tensão Adm. (MPa)" value={dados.tensao ?? ''} onChange={(v) => set('tensao', Number(v))} />
        <Campo label="E — Eficiência de Junta" value={dados.eficiencia ?? ''} onChange={(v) => set('eficiencia', Number(v))} />
        <Campo label="D — Diâmetro Externo (mm)" value={dados.diametro_externo ?? ''} onChange={(v) => set('diametro_externo', Number(v))} />
        <Campo label="Temperatura de Projeto (°C)" value={dados.temperatura ?? ''} onChange={(v) => set('temperatura', Number(v))} />
        <Campo label="y (vazio = automático pela temp.)" value={dados.y ?? ''} onChange={(v) => set('y', v === '' ? '' : Number(v))} />
      </div>
    );
  }

  if (aba === 'tampo' && tipos.tampo === 'tampoAbaulado') {
    return (
      <div className="memorial-campos-grid">
        {comuns}
        <Campo label="S — Tensão Adm. (MPa)" value={dados.tensao ?? ''} onChange={(v) => set('tensao', Number(v))} />
        <Campo label="L — Raio de Crown (mm)" value={dados.raio_crown ?? ''} onChange={(v) => set('raio_crown', Number(v))} />
        <Campo label="w — Fator de solda" value={dados.w_solda ?? 1} onChange={(v) => set('w_solda', Number(v))} />
      </div>
    );
  }

  if ((aba === 'tampo' && tipos.tampo === 'tampoPlano') || (aba === 'espelho' && tipos.espelho === 'espelhoNaoEstaiado')) {
    return (
      <div className="memorial-campos-grid">
        {comuns}
        <Campo label="S — Tensão Adm. (MPa)" value={dados.tensao ?? ''} onChange={(v) => set('tensao', Number(v))} />
        <Campo label="E — Eficiência" value={dados.eficiencia ?? 1} onChange={(v) => set('eficiencia', Number(v))} />
        <Campo label="C — Coeficiente da placa" value={dados.c_flat ?? 0.33} onChange={(v) => set('c_flat', Number(v))} />
        <Campo label="d — Diâmetro de medição (mm)" value={dados.diametro_medicao ?? ''} onChange={(v) => set('diametro_medicao', Number(v))} />
      </div>
    );
  }

  if (aba === 'espelho' && tipos.espelho === 'espelhoEstaiado') {
    return (
      <div className="memorial-campos-grid">
        {comuns}
        <Campo label="S — Tensão Adm. (MPa)" value={dados.tensao ?? ''} onChange={(v) => set('tensao', Number(v))} />
        <Campo label="p — Passo entre estais (mm)" value={dados.passo ?? ''} onChange={(v) => set('passo', Number(v))} />
        <Campo label="C_stay (PG-46.1)" value={dados.c_stay ?? 2.1} onChange={(v) => set('c_stay', Number(v))} />
        <Campo
          label="Estais soldados?"
          value={dados.estais_soldados ? 'sim' : 'nao'}
          onChange={(v) => set('estais_soldados', v === 'sim')}
          options={[
            { value: 'nao', label: 'Não' },
            { value: 'sim', label: 'Sim' },
          ]}
        />
      </div>
    );
  }

  if (aba === 'fornalha') {
    const ehLisa = dados.tipo_fornalha === 'lisa';
    return (
      <div className="memorial-campos-grid">
        {comuns}
        <Campo
          label={ehLisa ? 'D — Diâmetro Interno (mm)' : 'D — Diâmetro Médio (mm)'}
          value={dados.diametro_medio ?? ''}
          onChange={(v) => set('diametro_medio', Number(v))}
        />
        {ehLisa && (
          <>
            <Campo label="S — Tensão Adm. (MPa)" value={dados.tensao ?? ''} onChange={(v) => set('tensao', Number(v))} />
            <Campo label="E — Eficiência de Junta" value={dados.eficiencia ?? 1} onChange={(v) => set('eficiencia', Number(v))} />
          </>
        )}
      </div>
    );
  }

  // tubo de fogo
  return (
    <div className="memorial-campos-grid">
      {comuns}
      <Campo label="S — Tensão Adm. (MPa)" value={dados.tensao ?? ''} onChange={(v) => set('tensao', Number(v))} />
      <Campo label="D — Diâmetro Externo (mm, ≤125)" value={dados.diametro_externo ?? ''} onChange={(v) => set('diametro_externo', Number(v))} />
      <Campo label="e — Fator de ajuste (mm)" value={dados.e_fator ?? 0} onChange={(v) => set('e_fator', Number(v))} />
    </div>
  );
}

// ── Painel aquatubular ───────────────────────────────────────────────────────

function PainelAbaAqua({ tag, aba, onMudou }: { tag: string; aba: AbaAquatubular; onMudou: () => void }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [dados, setDados] = useState<Record<string, any>>(() => carregarDadosAqua(tag, aba));
  const [resultado, setResultado] = useState<ResultadoCalculo | null>(null);

  function set(chave: string, valor: unknown) {
    setDados((d) => {
      const novo = { ...d, [chave]: valor };
      salvarDadosAqua(tag, aba, novo);
      return novo;
    });
    onMudou();
  }

  function calcularAba() {
    setResultado(calcularAbaAqua(aba, dados));
  }

  return (
    <div className="memorial-painel">
      <div className="memorial-painel-campos">
        <CamposAbaAqua aba={aba} dados={dados} set={set} />

        <div className="memorial-acoes">
          <button type="button" className="btn-secundario" onClick={calcularAba}>
            Calcular esta aba
          </button>
          <span className="memorial-dica-salvar">Dados salvos automaticamente ao digitar. Use “Salvar Memorial Completo” no final.</span>
        </div>

        {resultado && (
          <div>
            <span className={`resultado-final-badge ${resultado.resultado === 'APROVADO' ? 'aprovado' : 'reprovado'}`}>
              {resultado.resultado}
            </span>
            <MemorialLog log={resultado.log} />
          </div>
        )}
      </div>
      <div className="memorial-painel-label">{ROTULOS_AQUATUBULAR[aba]}</div>
    </div>
  );
}

function CamposAbaAqua({
  aba,
  dados,
  set,
}: {
  aba: AbaAquatubular;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dados: Record<string, any>;
  set: (chave: string, valor: unknown) => void;
}) {
  const comunsCilindro = (
    <>
      <Campo label="P — Pressão de Projeto (MPa)" value={dados.pressao ?? ''} onChange={(v) => set('pressao', Number(v))} />
      <Campo label="S — Tensão Adm. (MPa)" value={dados.tensao ?? ''} onChange={(v) => set('tensao', Number(v))} />
      <Campo label="E — Eficiência de Junta" value={dados.eficiencia ?? 0.85} onChange={(v) => set('eficiencia', Number(v))} />
      <Campo label="D — Diâmetro Externo (mm)" value={dados.diametro_externo ?? ''} onChange={(v) => set('diametro_externo', Number(v))} />
      <Campo label="Tnom — Esp. Comercial (mm)" value={dados.t_comercial ?? ''} onChange={(v) => set('t_comercial', Number(v))} />
      <Campo label="CA — Corrosão Adm. (mm)" value={dados.ca ?? ''} onChange={(v) => set('ca', Number(v))} />
      <Campo label="Temperatura de Projeto (°C)" value={dados.temperatura ?? ''} onChange={(v) => set('temperatura', Number(v))} />
      {/* Material é texto livre — injetado em componentes[].material no RESUMO, não entra no cálculo. */}
      <Campo label="Material" type="text" value={(dados.material as string) ?? ''} onChange={(v) => set('material', v)} />
    </>
  );

  const comunsFundo = (
    <>
      <Campo label="P — Pressão de Projeto (MPa)" value={dados.pressao ?? ''} onChange={(v) => set('pressao', Number(v))} />
      <Campo label="S — Tensão Adm. (MPa)" value={dados.tensao ?? ''} onChange={(v) => set('tensao', Number(v))} />
      <Campo label="E — Eficiência de Junta" value={dados.eficiencia ?? 0.85} onChange={(v) => set('eficiencia', Number(v))} />
      <Campo label="D — Diâmetro Interno (mm)" value={dados.diametro ?? ''} onChange={(v) => set('diametro', Number(v))} />
      <Campo label="Tnom — Esp. Comercial (mm)" value={dados.t_comercial ?? ''} onChange={(v) => set('t_comercial', Number(v))} />
      <Campo label="CA — Corrosão Adm. (mm)" value={dados.ca ?? ''} onChange={(v) => set('ca', Number(v))} />
      {/* Material é texto livre — injetado em componentes[].material no RESUMO, não entra no cálculo. */}
      <Campo label="Material" type="text" value={(dados.material as string) ?? ''} onChange={(v) => set('material', v)} />
    </>
  );

  if (aba === 'tubulaoSup' || aba === 'tubulaoInf' || aba === 'coletor') {
    return <div className="memorial-campos-grid">{comunsCilindro}</div>;
  }

  if (aba === 'fundoEliptico') {
    return <div className="memorial-campos-grid">{comunsFundo}</div>;
  }

  if (aba === 'fundoTorisferico') {
    return (
      <div className="memorial-campos-grid">
        {comunsFundo}
        <Campo
          label="L — Raio de Coroa (mm, vazio = D)"
          value={dados.raio_crown ?? ''}
          onChange={(v) => set('raio_crown', v === '' ? undefined : Number(v))}
        />
      </div>
    );
  }

  // tubos geradores, superaquecedor, economizador — thin wall
  return (
    <div className="memorial-campos-grid">
      <Campo label="P — Pressão de Projeto (MPa)" value={dados.pressao ?? ''} onChange={(v) => set('pressao', Number(v))} />
      <Campo label="S — Tensão Adm. (MPa)" value={dados.tensao ?? ''} onChange={(v) => set('tensao', Number(v))} />
      <Campo label="E — Eficiência (1.0 = sem costura)" value={dados.eficiencia ?? 1} onChange={(v) => set('eficiencia', Number(v))} />
      <Campo label="D — Diâmetro Externo do tubo (mm)" value={dados.diametro_externo ?? ''} onChange={(v) => set('diametro_externo', Number(v))} />
      <Campo label="Tnom — Esp. Comercial (mm)" value={dados.t_comercial ?? ''} onChange={(v) => set('t_comercial', Number(v))} />
      <Campo label="CA — Corrosão Adm. (mm)" value={dados.ca ?? ''} onChange={(v) => set('ca', Number(v))} />
      {/* Material é texto livre — injetado em componentes[].material no RESUMO, não entra no cálculo. */}
      <Campo label="Material" type="text" value={(dados.material as string) ?? ''} onChange={(v) => set('material', v)} />
    </div>
  );
}
