import { useState } from 'react';
import { carregarDadosFormulario, salvarDadosFormulario } from '../inspecaoService';
import { useAutosaveFormulario } from '../useAutosaveFormulario';
import { mesclarPreenchimento, prefillUltrassom } from './autoPreencher';
import ResultadoEnsaio, { type ResultadoEnsaioValor } from './ResultadoEnsaio';

const ESTILO_DICA = { fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 } as const;
const DICA_AUTO = 'Campos preenchidos automaticamente a partir do cadastro; edite se necessário.';

export type RegiaoME = 'ts' | 'casco' | 'ti';

export interface PontoME {
  id: string;
  rotulo: string;
  regiao: RegiaoME;
}

// Os 6 pontos históricos. Container salvo SEM a lista de pontos assume exatamente estes,
// nesta ordem — dado antigo abre idêntico ao que sempre foi.
const PONTOS_PADRAO: PontoME[] = [
  { id: 'ts', rotulo: 'Tampo Superior', regiao: 'ts' },
  { id: 'c1', rotulo: 'Casco 1', regiao: 'casco' },
  { id: 'c2', rotulo: 'Casco 2', regiao: 'casco' },
  { id: 'c3', rotulo: 'Casco 3', regiao: 'casco' },
  { id: 'c4', rotulo: 'Casco 4', regiao: 'casco' },
  { id: 'ti', rotulo: 'Tampo Inferior', regiao: 'ti' },
];

// O vaso tem SEMPRE tampo + casco + tampo. Tampo = UMA linha só (os pontos extras são
// COLUNAS, distribuídas na circunferência: N pontos => ângulos de 360/N em 360/N).
// Casco = N linhas (Casco 1..N) e também colunas próprias com a mesma distribuição.
const REGIOES: { chave: RegiaoME; titulo: string; prefixo: string; rotuloBase: string; linhaUnica: boolean }[] = [
  { chave: 'ts', titulo: 'Tampo Superior', prefixo: 'ts', rotuloBase: 'Tampo Superior', linhaUnica: true },
  { chave: 'casco', titulo: 'Costado (Casco)', prefixo: 'c', rotuloBase: 'Casco', linhaUnica: false },
  { chave: 'ti', titulo: 'Tampo Inferior', prefixo: 'ti', rotuloBase: 'Tampo Inferior', linhaUnica: true },
];

export type ColunasME = Record<RegiaoME, number>;

const COLUNAS_PADRAO: ColunasME = { ts: 4, casco: 4, ti: 4 };
const MIN_COLUNAS = 1;
const MAX_COLUNAS = 12;

/** Ângulos da região para N pontos na circunferência: 360/N em 360/N, a partir de 0°. */
export function angulosDe(n: number): string[] {
  const qtd = Math.min(MAX_COLUNAS, Math.max(MIN_COLUNAS, Math.round(n) || 4));
  return Array.from({ length: qtd }, (_, i) => String(Math.round((i * 360) / qtd)));
}

type Medidas = Record<string, Record<string, string>>;

const ESTILO_REGIAO_CABECALHO = {
  display: 'block',
  margin: '14px 0 8px',
  fontSize: 12,
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--text-muted)',
} as const;

const ESTILO_BTN_ADD = {
  width: '100%',
  minHeight: 44,
  padding: '10px 12px',
  marginBottom: 10,
  border: '1px dashed var(--border-solid)',
  borderRadius: 8,
  background: 'transparent',
  color: 'var(--text-main)',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
} as const;

const ESTILO_BTN_REMOVER = {
  minHeight: 36,
  padding: '6px 12px',
  border: '1px solid var(--border-solid)',
  borderRadius: 6,
  background: 'transparent',
  color: 'var(--text-muted)',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
} as const;

const ESTILO_BTN_CONFIRMA = {
  ...ESTILO_BTN_REMOVER,
  borderColor: '#b91c1c',
  color: '#b91c1c',
} as const;

interface Dados {
  equipamento: string;
  dataUltrassom: string;
  area: string;
  espNomCasco: string;
  ano: string;
  material: string;
  aparelho: string;
  acoplante: string;
  tempSup: string;
  estadoSup: string;
  cabecote: string;
  velSonica: string;
  resultado: ResultadoEnsaioValor;
  medidas: Medidas;
  /** Pontos de medição do container. Ausente em dados antigos => PONTOS_PADRAO. */
  pontos: PontoME[];
  /** Nº de colunas (pontos na circunferência) por região. Ausente em dados antigos => 4. */
  colunas: ColunasME;
}

function linhaVazia(colunas: number): Record<string, string> {
  const m: Record<string, string> = {};
  for (const a of angulosDe(colunas)) m[a] = '';
  return m;
}

function medidasVazias(): Medidas {
  const m: Medidas = {};
  for (const c of PONTOS_PADRAO) m[c.id] = linhaVazia(4);
  return m;
}

function normalizarColunas(bruto: unknown): ColunasME {
  const b = (bruto ?? {}) as Partial<Record<RegiaoME, unknown>>;
  const num = (v: unknown) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(MAX_COLUNAS, Math.max(MIN_COLUNAS, n)) : 4;
  };
  return { ts: num(b.ts), casco: num(b.casco), ti: num(b.ti) };
}

/**
 * Saneia a lista vinda do storage; qualquer coisa inválida cai nos 6 pontos originais.
 * Tampos têm UMA linha: pontos extras de ts/ti (dado antigo do modelo anterior) são
 * descartados — só a primeira linha de cada tampo sobrevive.
 */
function normalizarPontos(bruto: unknown): PontoME[] {
  if (!Array.isArray(bruto) || bruto.length === 0) return PONTOS_PADRAO.map((p) => ({ ...p }));
  const validos: PontoME[] = [];
  const vistos = new Set<string>();
  const tampoVisto: Record<'ts' | 'ti', boolean> = { ts: false, ti: false };
  for (const item of bruto) {
    if (!item || typeof item !== 'object') continue;
    const p = item as Partial<PontoME>;
    const id = typeof p.id === 'string' ? p.id.trim() : '';
    if (!id || vistos.has(id)) continue;
    const regiao: RegiaoME = p.regiao === 'ts' || p.regiao === 'casco' || p.regiao === 'ti' ? p.regiao : 'casco';
    if (regiao !== 'casco') {
      if (tampoVisto[regiao]) continue;
      tampoVisto[regiao] = true;
    }
    vistos.add(id);
    validos.push({ id, rotulo: typeof p.rotulo === 'string' && p.rotulo.trim() ? p.rotulo : id, regiao });
  }
  return validos.length ? validos : PONTOS_PADRAO.map((p) => ({ ...p }));
}

/**
 * Próximo id livre de uma região, continuando a numeração histórica:
 * casco => c5, c6…; tampo superior => ts2, ts3…; tampo inferior => ti2…
 * Nunca reaproveita um id já usado por outro ponto nem já presente em `medidas`.
 */
function proximoId(prefixo: string, pontos: PontoME[], medidas: Medidas): string {
  const usados = new Set<string>([...pontos.map((p) => p.id), ...Object.keys(medidas || {})]);
  // `c1` e `ts`/`ti` (sem sufixo) já ocupam o nº 1 — a busca começa no 2.
  for (let n = 2; ; n++) {
    const candidato = `${prefixo}${n}`;
    if (!usados.has(candidato)) return candidato;
  }
}

function dadosPadrao(): Dados {
  return {
    equipamento: '',
    dataUltrassom: new Date().toISOString().split('T')[0],
    area: '',
    espNomCasco: '',
    ano: '',
    material: '',
    aparelho: '',
    acoplante: '',
    tempSup: '',
    estadoSup: '',
    cabecote: '',
    velSonica: '5920',
    resultado: '',
    medidas: medidasVazias(),
    pontos: PONTOS_PADRAO.map((p) => ({ ...p })),
    colunas: { ...COLUNAS_PADRAO },
  };
}

export default function FormularioUltrassom({ tag, containerId }: { tag: string; containerId: string }) {
  const [dados, setDados] = useState<Dados>(() => {
    const salvo = carregarDadosFormulario<Dados>(tag, containerId, 'ultrassom');
    const prefill = prefillUltrassom(tag);
    // formulário novo: data do ensaio sugere hoje
    if (!salvo) return mesclarPreenchimento(dadosPadrao(), prefill, null);
    // Merge com o padrão pra inspeções antigas (sem `resultado`/`dataUltrassom`) não quebrarem.
    // Registro EXISTENTE sem `dataUltrassom` fica com data vazia — herdar "hoje" aqui faria o
    // autosave gravar uma data retroativa no container antigo ao simplesmente reeditar.
    const base = { ...dadosPadrao(), dataUltrassom: '' };
    const mesclado = mesclarPreenchimento(base, prefill, salvo);
    // Container sem lista salva => os 6 pontos originais (retrocompatibilidade).
    return {
      ...mesclado,
      pontos: normalizarPontos(mesclado.pontos),
      colunas: normalizarColunas(mesclado.colunas),
    };
  });
  useAutosaveFormulario(tag, containerId, 'ultrassom', dados);
  const [salvando, setSalvando] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);

  function set(chave: keyof Dados, valor: string) {
    setDados((d) => ({ ...d, [chave]: valor }));
  }

  function setMedida(componenteId: string, angulo: string, valor: string) {
    setDados((d) => ({
      ...d,
      medidas: { ...d.medidas, [componenteId]: { ...d.medidas[componenteId], [angulo]: valor } },
    }));
  }

  // Muda o nº de pontos na circunferência da região: os ângulos são redistribuídos
  // (360/N) e os valores já digitados migram POR POSIÇÃO para os novos ângulos.
  function mudarColunas(regiao: RegiaoME, delta: number) {
    setDados((d) => {
      const atual = d.colunas[regiao];
      const novo = Math.min(MAX_COLUNAS, Math.max(MIN_COLUNAS, atual + delta));
      if (novo === atual) return d;
      const antigos = angulosDe(atual);
      const novos = angulosDe(novo);
      const medidas: Medidas = { ...d.medidas };
      for (const p of d.pontos) {
        if (p.regiao !== regiao) continue;
        const linha = medidas[p.id] ?? {};
        const nova: Record<string, string> = {};
        novos.forEach((ang, i) => { nova[ang] = linha[antigos[i]] ?? ''; });
        medidas[p.id] = nova;
      }
      return { ...d, colunas: { ...d.colunas, [regiao]: novo }, medidas };
    });
  }

  function adicionarPonto(regiao: RegiaoME) {
    setDados((d) => {
      const cfg = REGIOES.find((r) => r.chave === regiao)!;
      const id = proximoId(cfg.prefixo, d.pontos, d.medidas);
      const numero = id.slice(cfg.prefixo.length) || '1';
      const novo: PontoME = { id, rotulo: `${cfg.rotuloBase} ${numero}`, regiao };
      // Insere logo após o último ponto da mesma região: a lista continua agrupada por região.
      let pos = -1;
      d.pontos.forEach((p, i) => { if (p.regiao === regiao) pos = i; });
      const pontos = [...d.pontos];
      pontos.splice(pos >= 0 ? pos + 1 : pontos.length, 0, novo);
      return {
        ...d,
        pontos,
        medidas: { ...d.medidas, [id]: linhaVazia(d.colunas[regiao]) },
      };
    });
  }

  function removerPonto(id: string) {
    setRemovendo(null);
    setDados((d) => {
      const medidas = { ...d.medidas };
      delete medidas[id];
      return { ...d, pontos: d.pontos.filter((p) => p.id !== id), medidas };
    });
  }

  async function salvar() {
    setSalvando(true);
    try {
      await salvarDadosFormulario(tag, containerId, 'ultrassom', dados);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <div className="formulario-secao">
        <h3>Informações do Componente Avaliado</h3>
        <p style={ESTILO_DICA}>{DICA_AUTO}</p>
        <div className="form-grid">
          <label>
            Equipamento
            <input type="text" value={dados.equipamento} onChange={(e) => set('equipamento', e.target.value)} />
          </label>
          <label>
            T.A.G.
            <input type="text" value={tag} disabled />
          </label>
          <label>
            Data do Ensaio
            <input type="date" value={dados.dataUltrassom} onChange={(e) => set('dataUltrassom', e.target.value)} />
          </label>
          <label>
            Área
            <input type="text" placeholder="Ex: Utilidades" value={dados.area} onChange={(e) => set('area', e.target.value)} />
          </label>
          <label>
            Esp. Nominal Casco (mm)
            <input type="number" step="0.01" value={dados.espNomCasco} onChange={(e) => set('espNomCasco', e.target.value)} />
          </label>
          <label>
            Ano de Fabricação
            <input type="text" value={dados.ano} onChange={(e) => set('ano', e.target.value)} />
          </label>
          <label>
            Material de Construção
            <input type="text" value={dados.material} onChange={(e) => set('material', e.target.value)} />
          </label>
        </div>
      </div>

      <div className="formulario-secao">
        <h3>Informações para o Ensaio</h3>
        <p style={ESTILO_DICA}>{DICA_AUTO}</p>
        <div className="form-grid">
          <label>
            Aparelho / Nº de Série
            <input type="text" value={dados.aparelho} onChange={(e) => set('aparelho', e.target.value)} />
          </label>
          <label>
            Acoplante
            <input type="text" value={dados.acoplante} onChange={(e) => set('acoplante', e.target.value)} />
          </label>
          <label>
            Temp. da Superfície (°C)
            <input type="text" value={dados.tempSup} onChange={(e) => set('tempSup', e.target.value)} />
          </label>
          <label>
            Estado da Superfície
            <input type="text" value={dados.estadoSup} onChange={(e) => set('estadoSup', e.target.value)} />
          </label>
          <label>
            Tipo de Cabeçote
            <input type="text" value={dados.cabecote} onChange={(e) => set('cabecote', e.target.value)} />
          </label>
          <label>
            Velocidade Sônica (m/s)
            <input type="number" value={dados.velSonica} onChange={(e) => set('velSonica', e.target.value)} />
          </label>
        </div>
      </div>

      <div className="formulario-secao">
        <h3>Medidas Encontradas (mm)</h3>
        <p style={ESTILO_DICA}>
          Os pontos de cada região são distribuídos na circunferência: N pontos = ângulos de
          360°/N em 360°/N. Tampos têm uma linha só; o casco aceita mais linhas (Casco 1, 2...).
        </p>
        {REGIOES.map((reg) => {
          const pontos = dados.pontos.filter((p) => p.regiao === reg.chave);
          const angulos = angulosDe(dados.colunas[reg.chave]);
          return (
            <div key={reg.chave}>
              <div style={{ display: 'block', margin: '14px 0 8px' }}>
                <span style={{ ...ESTILO_REGIAO_CABECALHO, display: 'inline', margin: 0 }}>{reg.titulo}</span>
                <span style={{ marginLeft: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                  Pontos na circunferência:{' '}
                  <button type="button" style={ESTILO_BTN_REMOVER} onClick={() => mudarColunas(reg.chave, -1)} disabled={dados.colunas[reg.chave] <= MIN_COLUNAS}>
                    −
                  </button>
                  <b style={{ margin: '0 8px' }}>{dados.colunas[reg.chave]}</b>
                  <button type="button" style={ESTILO_BTN_REMOVER} onClick={() => mudarColunas(reg.chave, 1)} disabled={dados.colunas[reg.chave] >= MAX_COLUNAS}>
                    +
                  </button>
                </span>
              </div>
              {pontos.map((c) => (
                <div key={c.id} className="linha-medida-card">
                  <span className="linha-medida-titulo">{c.rotulo}</span>
                  <div className="linha-medida-campos">
                    {angulos.map((ang) => (
                      <label key={ang}>
                        {ang}°
                        <input
                          type="number"
                          step="0.01"
                          value={dados.medidas[c.id]?.[ang] ?? ''}
                          onChange={(e) => setMedida(c.id, ang, e.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                  {/* Remoção em dois passos (nunca window.confirm — o fluxo é mobile). Só o casco
                      tem linhas removíveis; os tampos têm a linha única fixa. */}
                  {!reg.linhaUnica && (
                    <div style={{ textAlign: 'right' }}>
                      {removendo === c.id ? (
                        <>
                          <span style={{ fontSize: 12, color: '#b91c1c', marginRight: 8 }}>Remover este ponto?</span>
                          <button
                            type="button"
                            style={ESTILO_BTN_CONFIRMA}
                            onClick={() => removerPonto(c.id)}
                          >
                            Confirmar
                          </button>{' '}
                          <button type="button" style={ESTILO_BTN_REMOVER} onClick={() => setRemovendo(null)}>
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          style={ESTILO_BTN_REMOVER}
                          disabled={pontos.length <= 1}
                          title={pontos.length <= 1 ? 'A região precisa de ao menos um ponto' : 'Remover ponto'}
                          onClick={() => setRemovendo(c.id)}
                        >
                          Remover ponto
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {!reg.linhaUnica && (
                <button type="button" style={ESTILO_BTN_ADD} onClick={() => adicionarPonto(reg.chave)}>
                  + ponto em {reg.titulo}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <ResultadoEnsaio valor={dados.resultado} onChange={(v) => set('resultado', v)} />

      <div className="formulario-acoes-fixas">
        <button type="button" className="btn-primario" onClick={salvar} disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </>
  );
}
