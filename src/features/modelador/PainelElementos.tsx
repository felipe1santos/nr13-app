// Painel de elementos do Modelador de Vaso (fase 2) — estilo PVElite: seções colapsáveis
// (Geral, Casco, Tampo 1/2, Bocais, Suporte, Pesos) que editam o `ModeloVaso` em memória.
// Nenhum dado é persistido aqui — quem grava é `ModeladorVaso` (botão "Salvar" chama
// `salvarModelo`). Os campos numéricos aceitam vírgula decimal (padrão do app): o valor digitado
// fica em estado local do campo (draft) e só converte/propaga pro modelo no blur — evita que o
// input "salte"/corte a vírgula a cada tecla (problema clássico de number input controlado).
import { useEffect, useRef, useState } from 'react';
import { Icone } from '../../components/Icone';
import { dimensoesTampo, num, pesosKg } from './geometriaVaso';
import type { BocalModelo, ModeloVaso, SuporteModelo, TampoModelo, TipoTampoModelo } from './tiposModelador';

interface Props {
  modelo: ModeloVaso;
  onChange: (m: ModeloVaso) => void;
}

const OPCOES_TAMPO: { value: TipoTampoModelo; label: string }[] = [
  { value: 'eliptico', label: 'Elíptico 2:1' },
  { value: 'toriesferico', label: 'Toriesférico' },
  { value: 'hemisferico', label: 'Hemisférico' },
  { value: 'plano', label: 'Plano' },
];

const OPCOES_LOCAL: { value: BocalModelo['local']; label: string }[] = [
  { value: 'casco', label: 'Casco' },
  { value: 'tampo1', label: 'Tampo 1' },
  { value: 'tampo2', label: 'Tampo 2' },
];

const OPCOES_SUPORTE: { value: SuporteModelo['tipo']; label: string }[] = [
  { value: 'nenhum', label: 'Nenhum' },
  { value: 'saia', label: 'Saia' },
  { value: 'pes', label: 'Pés' },
  { value: 'selas', label: 'Selas' },
];

function fmt(v: number | null, casas = 1): string {
  if (v === null || !Number.isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas });
}

function proximoIdLivre(bocais: BocalModelo[]): string {
  let max = 0;
  for (const b of bocais) {
    const m = /^N(\d+)$/i.exec(b.id.trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `N${max + 1}`;
}

function bocalVazio(bocais: BocalModelo[]): BocalModelo {
  return {
    id: proximoIdLivre(bocais),
    doMemorial: false,
    servico: '',
    dn: '',
    diametro: '',
    espessura: '',
    flange: '',
    local: 'casco',
    posicaoAxial: '',
    angulo: 0,
    projecao: '',
  };
}

function CampoNumero({
  label,
  value,
  onChange,
  unidade,
  disabled,
}: {
  label: string;
  value: number | '';
  onChange: (v: number | '') => void;
  unidade?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value === '' ? '' : String(value));
  const focadoRef = useRef(false);

  useEffect(() => {
    if (!focadoRef.current) setDraft(value === '' ? '' : String(value));
  }, [value]);

  function commit() {
    focadoRef.current = false;
    const texto = draft.trim();
    if (texto === '') {
      onChange('');
      return;
    }
    const n = parseFloat(texto.replace(',', '.'));
    if (Number.isFinite(n)) {
      onChange(n);
      setDraft(String(n).replace('.', ','));
    } else {
      setDraft(value === '' ? '' : String(value));
    }
  }

  return (
    <label className="modelador-campo">
      <span>{label}</span>
      <div className={`modelador-campo-input${unidade ? ' has-unit' : ''}`}>
        <input
          type="text"
          inputMode="decimal"
          value={draft}
          disabled={disabled}
          onFocus={() => {
            focadoRef.current = true;
          }}
          onChange={(e) => {
            focadoRef.current = true;
            setDraft(e.target.value);
          }}
          onBlur={commit}
        />
        {unidade && <span className="modelador-campo-unit">{unidade}</span>}
      </div>
    </label>
  );
}

function CampoTexto({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="modelador-campo">
      <span>{label}</span>
      <input type="text" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function CampoSomenteLeitura({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="modelador-campo modelador-campo-ro">
      <span>{label}</span>
      <output>{valor}</output>
    </div>
  );
}

function SecaoTampo({
  titulo,
  tampo,
  D,
  onChange,
}: {
  titulo: string;
  tampo: TampoModelo;
  D: number | null;
  onChange: (t: TampoModelo) => void;
}) {
  const t = num(tampo.espessura);
  const dims = D !== null && t !== null ? dimensoesTampo(tampo.tipo, D, t) : null;

  return (
    <details className="modelador-secao" open>
      <summary>
        {titulo}
        <Icone nome="chevdown" tam={14} className="modelador-secao-seta" />
      </summary>
      <div className="modelador-secao-corpo">
        <label className="modelador-campo">
          <span>Tipo</span>
          <select value={tampo.tipo} onChange={(e) => onChange({ ...tampo, tipo: e.target.value as TipoTampoModelo })}>
            {OPCOES_TAMPO.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <CampoNumero label="Espessura (mm)" value={tampo.espessura} onChange={(v) => onChange({ ...tampo, espessura: v })} />
        <CampoSomenteLeitura label="Profundidade calculada" valor={dims ? `${fmt(dims.profundidade)} mm` : '—'} />
        {tampo.tipo === 'toriesferico' && (
          <>
            <CampoSomenteLeitura label="Raio da coroa (Rc)" valor={dims ? `${fmt(dims.raioCoroa)} mm` : '—'} />
            <CampoSomenteLeitura label="Raio de canto (rc)" valor={dims ? `${fmt(dims.raioCanto)} mm` : '—'} />
          </>
        )}
      </div>
    </details>
  );
}

export default function PainelElementos({ modelo, onChange }: Props) {
  const D = num(modelo.diametroInterno);
  const pesos = pesosKg(modelo);

  function atualizarBocal(idx: number, patch: Partial<BocalModelo>) {
    const bocais = modelo.bocais.map((b, i) => (i === idx ? { ...b, ...patch } : b));
    onChange({ ...modelo, bocais });
  }

  function adicionarBocal() {
    onChange({ ...modelo, bocais: [...modelo.bocais, bocalVazio(modelo.bocais)] });
  }

  function removerBocal(idx: number) {
    onChange({ ...modelo, bocais: modelo.bocais.filter((_, i) => i !== idx) });
  }

  return (
    <div className="modelador-painel-lista">
      <details className="modelador-secao" open>
        <summary>
          Geral
          <Icone nome="chevdown" tam={14} className="modelador-secao-seta" />
        </summary>
        <div className="modelador-secao-corpo">
          <label className="modelador-campo">
            <span>Orientação</span>
            <select
              value={modelo.orientacao}
              onChange={(e) => onChange({ ...modelo, orientacao: e.target.value as ModeloVaso['orientacao'] })}
            >
              <option value="horizontal">Horizontal</option>
              <option value="vertical">Vertical</option>
            </select>
          </label>
          <CampoNumero
            label="Ø Interno (mm)"
            value={modelo.diametroInterno}
            onChange={(v) => onChange({ ...modelo, diametroInterno: v })}
          />
          <CampoNumero
            label="Comprimento do Cilindro (mm)"
            value={modelo.comprimentoCilindro}
            onChange={(v) => onChange({ ...modelo, comprimentoCilindro: v })}
          />
          <CampoTexto label="Material" value={modelo.material} onChange={(v) => onChange({ ...modelo, material: v })} />
          <CampoNumero
            label="Densidade do Aço (kg/m³)"
            value={modelo.densidadeAco}
            onChange={(v) => onChange({ ...modelo, densidadeAco: v === '' ? 7850 : v })}
          />
        </div>
      </details>

      <details className="modelador-secao" open>
        <summary>
          Casco
          <Icone nome="chevdown" tam={14} className="modelador-secao-seta" />
        </summary>
        <div className="modelador-secao-corpo">
          <CampoNumero
            label="Espessura (mm)"
            value={modelo.espessuraCasco}
            onChange={(v) => onChange({ ...modelo, espessuraCasco: v })}
          />
        </div>
      </details>

      <SecaoTampo titulo="Tampo 1" tampo={modelo.tampo1} D={D} onChange={(t) => onChange({ ...modelo, tampo1: t })} />
      <SecaoTampo titulo="Tampo 2" tampo={modelo.tampo2} D={D} onChange={(t) => onChange({ ...modelo, tampo2: t })} />

      <details className="modelador-secao" open>
        <summary>
          Bocais
          <Icone nome="chevdown" tam={14} className="modelador-secao-seta" />
        </summary>
        <div className="modelador-secao-corpo modelador-bocais">
          {modelo.bocais.length === 0 && <p className="modelador-vazio">Nenhum bocal cadastrado.</p>}
          {modelo.bocais.map((b, idx) => (
            <div key={b.id} className="modelador-bocal-item">
              <div className="modelador-bocal-cabecalho">
                <CampoTexto
                  label="ID"
                  value={b.id}
                  disabled={b.doMemorial}
                  onChange={(v) => atualizarBocal(idx, { id: v })}
                />
                {b.doMemorial && <span className="modelador-badge">memorial</span>}
                {!b.doMemorial && (
                  <button
                    type="button"
                    className="btn-remover modelador-bocal-remover"
                    onClick={() => removerBocal(idx)}
                    title="Remover bocal"
                  >
                    <Icone nome="trash" tam={13} />
                  </button>
                )}
              </div>
              <div className="modelador-bocal-grid">
                <CampoTexto label="Serviço" value={b.servico} onChange={(v) => atualizarBocal(idx, { servico: v })} />
                <CampoTexto label="DN" value={b.dn} onChange={(v) => atualizarBocal(idx, { dn: v })} />
                <CampoNumero label="Ø (mm)" value={b.diametro} onChange={(v) => atualizarBocal(idx, { diametro: v })} />
                <CampoNumero label="Espessura (mm)" value={b.espessura} onChange={(v) => atualizarBocal(idx, { espessura: v })} />
                <CampoTexto label="Flange" value={b.flange} onChange={(v) => atualizarBocal(idx, { flange: v })} />
                <label className="modelador-campo">
                  <span>Local</span>
                  <select value={b.local} onChange={(e) => atualizarBocal(idx, { local: e.target.value as BocalModelo['local'] })}>
                    {OPCOES_LOCAL.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <CampoNumero
                  label="Posição Axial (mm)"
                  value={b.posicaoAxial}
                  disabled={b.local !== 'casco'}
                  onChange={(v) => atualizarBocal(idx, { posicaoAxial: v })}
                />
                <CampoNumero label="Ângulo (0-360°)" value={b.angulo} onChange={(v) => atualizarBocal(idx, { angulo: v })} />
                <CampoNumero label="Projeção (mm)" value={b.projecao} onChange={(v) => atualizarBocal(idx, { projecao: v })} />
              </div>
            </div>
          ))}
          <button type="button" className="btn-secundario modelador-bocal-add" onClick={adicionarBocal}>
            <Icone nome="plus" tam={14} /> Bocal
          </button>
        </div>
      </details>

      <details className="modelador-secao" open>
        <summary>
          Suporte
          <Icone nome="chevdown" tam={14} className="modelador-secao-seta" />
        </summary>
        <div className="modelador-secao-corpo">
          <label className="modelador-campo">
            <span>Tipo</span>
            <select
              value={modelo.suporte.tipo}
              onChange={(e) => onChange({ ...modelo, suporte: { ...modelo.suporte, tipo: e.target.value as SuporteModelo['tipo'] } })}
            >
              {OPCOES_SUPORTE.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <CampoNumero
            label="Altura (mm)"
            value={modelo.suporte.altura}
            disabled={modelo.suporte.tipo === 'nenhum'}
            onChange={(v) => onChange({ ...modelo, suporte: { ...modelo.suporte, altura: v } })}
          />
          <CampoNumero
            label="Quantidade"
            value={modelo.suporte.quantidade}
            disabled={modelo.suporte.tipo === 'nenhum'}
            onChange={(v) => onChange({ ...modelo, suporte: { ...modelo.suporte, quantidade: v } })}
          />
        </div>
      </details>

      <details className="modelador-secao" open>
        <summary>
          Pesos
          <Icone nome="chevdown" tam={14} className="modelador-secao-seta" />
        </summary>
        <div className="modelador-secao-corpo">
          <CampoSomenteLeitura label="Vazio" valor={pesos.vazioKg !== null ? `${fmt(pesos.vazioKg, 0)} kg` : '—'} />
          <CampoSomenteLeitura label="Cheio d'água" valor={pesos.cheioDaguaKg !== null ? `${fmt(pesos.cheioDaguaKg, 0)} kg` : '—'} />
          <CampoNumero
            label="Operação (kg)"
            value={modelo.pesoOperacao}
            onChange={(v) => onChange({ ...modelo, pesoOperacao: v })}
          />
        </div>
      </details>
    </div>
  );
}
