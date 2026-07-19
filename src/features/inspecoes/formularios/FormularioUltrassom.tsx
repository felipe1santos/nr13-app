import { useState } from 'react';
import { carregarDadosFormulario, salvarDadosFormulario } from '../inspecaoService';
import { useAutosaveFormulario } from '../useAutosaveFormulario';
import { mesclarPreenchimento, prefillUltrassom } from './autoPreencher';
import ResultadoEnsaio, { type ResultadoEnsaioValor } from './ResultadoEnsaio';

const ESTILO_DICA = { fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 } as const;
const DICA_AUTO = 'Campos preenchidos automaticamente a partir do cadastro; edite se necessário.';

const COMPONENTES = [
  { id: 'ts', nome: 'Tampo Superior' },
  { id: 'c1', nome: 'Casco 1' },
  { id: 'c2', nome: 'Casco 2' },
  { id: 'c3', nome: 'Casco 3' },
  { id: 'c4', nome: 'Casco 4' },
  { id: 'ti', nome: 'Tampo Inferior' },
];

const ANGULOS = ['0', '90', '180', '270'] as const;

type Medidas = Record<string, Record<(typeof ANGULOS)[number], string>>;

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
}

function medidasVazias(): Medidas {
  const m: Medidas = {};
  for (const c of COMPONENTES) m[c.id] = { '0': '', '90': '', '180': '', '270': '' };
  return m;
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
    return mesclarPreenchimento(base, prefill, salvo);
  });
  useAutosaveFormulario(tag, containerId, 'ultrassom', dados);
  const [salvando, setSalvando] = useState(false);

  function set(chave: keyof Dados, valor: string) {
    setDados((d) => ({ ...d, [chave]: valor }));
  }

  function setMedida(componenteId: string, angulo: (typeof ANGULOS)[number], valor: string) {
    setDados((d) => ({
      ...d,
      medidas: { ...d.medidas, [componenteId]: { ...d.medidas[componenteId], [angulo]: valor } },
    }));
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
        {COMPONENTES.map((c) => (
          <div key={c.id} className="linha-medida-card">
            <span className="linha-medida-titulo">{c.nome}</span>
            <div className="linha-medida-campos">
              {ANGULOS.map((ang) => (
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
          </div>
        ))}
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
