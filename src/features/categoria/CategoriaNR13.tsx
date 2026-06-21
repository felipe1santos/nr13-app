import { useState } from 'react';
import { calcularESalvarCategoria, carregarCategoria } from './categoriaService';
import { FATORES_CONVERSAO, type SistemaUnidade } from '../../calc/unidades';
import type { CategoriaSalva } from '../equipamento/tipos';
import Campo from '../memorial/Campo';
import '../equipamento/equipamento.css';
import './categoria.css';

const GRUPOS_FLUIDO: { classe: string; label: string; opcoes: string[] }[] = [
  {
    classe: 'A',
    label: 'Classe A',
    opcoes: [
      'A - Fluido inflamável, combustível (T ≥ 200 °C)',
      'A - Tóxico com limite de tolerância ≤ 20 ppm',
      'A - Hidrogênio',
      'A - Acetileno',
    ],
  },
  {
    classe: 'B',
    label: 'Classe B',
    opcoes: [
      'B - Combustível com temperatura menor que 200 °C',
      'B - Tóxico com limite de tolerância > 20 ppm',
    ],
  },
  {
    classe: 'C',
    label: 'Classe C',
    opcoes: [
      'C - Vapor de água',
      'C - Gases asfixiantes simples',
      'C - Ar comprimido',
    ],
  },
  {
    classe: 'D',
    label: 'Classe D',
    opcoes: [
      'D - Outro Fluido',
    ],
  },
];

const DEFAULT_FLUIDO = GRUPOS_FLUIDO[0].opcoes[0];

// Legado: valores antigos começam com 'A'/'B'/'C'/'D' também — classe ainda extraída corretamente.
function resolverDefault(salvo: string | undefined): string {
  if (!salvo) return DEFAULT_FLUIDO;
  const todas = GRUPOS_FLUIDO.flatMap((g) => g.opcoes);
  return todas.includes(salvo) ? salvo : DEFAULT_FLUIDO;
}

export default function CategoriaNR13({ tag, unidade }: { tag: string; unidade: SistemaUnidade }) {
  const [salva, setSalva] = useState<CategoriaSalva | null>(() => carregarCategoria(tag));
  const [volume, setVolume] = useState(() => salva?.volInput ?? 1);
  const [pressao, setPressao] = useState(() => salva?.presInput ?? 1);
  const [fluido, setFluido] = useState(() => resolverDefault(salva?.fluidoInput));

  async function calcular() {
    const r = await calcularESalvarCategoria(tag, volume, pressao, unidade, fluido);
    setSalva(r);
  }

  return (
    <div className="bloco-categoria">
      <h3>Categoria NR-13</h3>
      <div className="memorial-campos-grid">
        <Campo label="Volume (m³)" value={volume} onChange={(v) => setVolume(Number(v))} />
        <Campo label={`Pressão (${FATORES_CONVERSAO[unidade].labelPressao})`} value={pressao} onChange={(v) => setPressao(Number(v))} />
        <div className="memorial-campo">
          <label>Fluido de Operação</label>
          <select value={fluido} onChange={(e) => setFluido(e.target.value)}>
            {GRUPOS_FLUIDO.map((g) => (
              <optgroup key={g.classe} label={g.label}>
                {g.opcoes.map((op) => (
                  <option key={op} value={op}>
                    {op.slice(4)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>
      <button type="button" className="btn-primario" style={{ marginTop: 12 }} onClick={calcular}>
        Calcular Categoria
      </button>

      {salva && (
        <div className="categoria-resultado">
          <div className={`categoria-enquadramento ${salva.isEnquadrado ? 'ok' : 'nao'}`}>
            <span className="lbl-view">Enquadramento da Norma — P(kPa) × V(m³) ≥ 8</span>
            <span className="val-view">
              {salva.isEnquadrado
                ? `ENQUADRA (P×V = ${salva.PV_enq} kPa·m³ > 8)`
                : `NÃO ENQUADRA (P×V = ${salva.PV_enq} kPa·m³ ≤ 8)`}
            </span>
          </div>

          <div className="categoria-specs-grid">
            <div className="resultado-item">
              <span className="lbl-view">Classe do Fluido</span>
              <span className="categoria-valor-grande">{salva.classe}</span>
              <span className="categoria-sub-calc" style={{ fontSize: 10 }}>
                {salva.fluidoInput.slice(4)}
              </span>
            </div>
            <div className="resultado-item">
              <span className="lbl-view">Grupo de Potencial de Risco — P(MPa) × V(m³)</span>
              <span className="categoria-valor-grande">{salva.grupo}</span>
              <span className="categoria-sub-calc">PV = {salva.PV_cat} MPa·m³</span>
            </div>
            <div className="resultado-item">
              <span className="lbl-view">Categoria Final</span>
              <span className="categoria-valor-grande accent">{salva.catFinal}</span>
            </div>
          </div>

          <div className="categoria-specs-grid categoria-specs-grid-secundaria">
            <div>
              <span className="lbl-view">Volume Geométrico</span>
              <span className="val-view">{salva.volInput} m³</span>
            </div>
            <div>
              <span className="lbl-view">Pressão Base (PMTA)</span>
              <span className="val-view">{salva.presInput} {FATORES_CONVERSAO[salva.unidInput ?? 'SI'].labelPressao}</span>
            </div>
            <div>
              <span className="lbl-view">P×V Enquadramento</span>
              <span className="val-view">{salva.PV_enq} kPa·m³</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
