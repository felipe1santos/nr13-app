import { useState } from 'react';
import { carregarDadosFormulario, salvarDadosFormulario } from '../inspecaoService';

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
    medidas: medidasVazias(),
  };
}

export default function FormularioUltrassom({ tag, containerId }: { tag: string; containerId: string }) {
  const [dados, setDados] = useState<Dados>(
    () => carregarDadosFormulario<Dados>(tag, containerId, 'ultrassom') ?? dadosPadrao(),
  );
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

      <div className="formulario-acoes-fixas">
        <button type="button" className="btn-primario" onClick={salvar} disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </>
  );
}
