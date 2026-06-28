import { useState } from 'react';
import { comprimirImagem } from '../../../services/imagem';
import { carregarDadosFormulario, salvarDadosFormulario } from '../inspecaoService';
import { useAutosaveFormulario } from '../useAutosaveFormulario';

const ITENS = [
  'Condição geral das paredes internas',
  'Presença de trincas ou fissuras',
  'Incrustações ou depósitos internos',
  'Erosão ou desgaste da superfície interna',
  'Integridade das soldas internas',
  'Estado das conexões e bocais internos',
  'Revestimento interno (quando aplicável)',
  'Corrosão sob tensão (SCC)',
  'Suportes e estruturas internas',
  'Limpeza interna',
  'Marcas de desgaste ou abrasão',
  'Pontos de corrosão localizada (pite)',
  'Integridade do fundo e tampos internos',
  'Bocas de inspeção e tampas de acesso',
  'Iluminação interna para inspeção',
];

interface DadosVisual {
  contratante: string;
  rastreabilidade: string;
  endereco: string;
  dataInspecao: string;
  serie: string;
  tipoEquipamento: string;
  fabricante: string;
  itens: Record<string, 'sim' | 'nao' | 'na' | ''>;
  itemObs: Record<string, string>;
  observacoes: string;
  conclusao: string;
  fotos: { base64: string; descricao: string }[];
}

function dadosPadrao(): DadosVisual {
  return {
    contratante: '',
    rastreabilidade: '',
    endereco: '',
    dataInspecao: new Date().toISOString().split('T')[0],
    serie: '',
    tipoEquipamento: '',
    fabricante: '',
    itens: {},
    itemObs: {},
    observacoes: '',
    conclusao: '',
    fotos: [],
  };
}

export default function FormularioVisualInterno({ tag, containerId }: { tag: string; containerId: string }) {
  const [dados, setDados] = useState<DadosVisual>(
    () => carregarDadosFormulario<DadosVisual>(tag, containerId, 'visual_interno') ?? dadosPadrao(),
  );
  useAutosaveFormulario(tag, containerId, 'visual_interno', dados);
  const [salvando, setSalvando] = useState(false);
  const [salvoOk, setSalvoOk] = useState(false);
  const [erroSalvar, setErroSalvar] = useState('');

  function set<K extends keyof DadosVisual>(k: K, v: DadosVisual[K]) {
    setDados((d) => ({ ...d, [k]: v }));
  }

  function setItem(n: number, val: 'sim' | 'nao' | 'na' | '') {
    setDados((d) => ({ ...d, itens: { ...d.itens, [String(n)]: val } }));
  }

  function setItemObs(n: number, val: string) {
    setDados((d) => ({ ...d, itemObs: { ...d.itemObs, [String(n)]: val } }));
  }

  async function adicionarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    const base64 = await comprimirImagem(arquivo, 800);
    setDados((d) => ({ ...d, fotos: [...d.fotos, { base64, descricao: '' }] }));
  }

  function setDescricaoFoto(i: number, desc: string) {
    setDados((d) => {
      const fotos = [...d.fotos];
      fotos[i] = { ...fotos[i], descricao: desc };
      return { ...d, fotos };
    });
  }

  function removerFoto(i: number) {
    setDados((d) => ({ ...d, fotos: d.fotos.filter((_, idx) => idx !== i) }));
  }

  async function salvar() {
    setSalvando(true); setSalvoOk(false); setErroSalvar('');
    const inicio = Date.now();
    try {
      await salvarDadosFormulario(tag, containerId, 'visual_interno', dados);
      const restante = 600 - (Date.now() - inicio);
      if (restante > 0) await new Promise((r) => setTimeout(r, restante));
      setSalvoOk(true);
      setTimeout(() => setSalvoOk(false), 3000);
    } catch (err) {
      setErroSalvar('Erro ao salvar: ' + String(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <div className="formulario-secao">
        <h3>Dados Gerais</h3>
        <div className="form-grid">
          <label>T.A.G. do Equipamento<input type="text" value={tag} disabled /></label>
          <label>Data da Inspeção<input type="date" value={dados.dataInspecao} onChange={(e) => set('dataInspecao', e.target.value)} /></label>
          <label>Contratante<input type="text" value={dados.contratante} onChange={(e) => set('contratante', e.target.value)} /></label>
          <label>Endereço<input type="text" value={dados.endereco} onChange={(e) => set('endereco', e.target.value)} /></label>
          <label>Rastreabilidade<input type="text" value={dados.rastreabilidade} onChange={(e) => set('rastreabilidade', e.target.value)} /></label>
        </div>
      </div>

      <div className="formulario-secao">
        <h3>Aspectos Gerais do Equipamento</h3>
        <div className="form-grid">
          <label>Nº de Série<input type="text" value={dados.serie} onChange={(e) => set('serie', e.target.value)} /></label>
          <label>Tipo de Equipamento<input type="text" value={dados.tipoEquipamento} onChange={(e) => set('tipoEquipamento', e.target.value)} /></label>
          <label>Fabricante<input type="text" value={dados.fabricante} onChange={(e) => set('fabricante', e.target.value)} /></label>
        </div>
      </div>

      <div className="formulario-secao">
        <h3>Itens de Verificação — Inspeção Visual Interna</h3>
        {ITENS.map((item, idx) => {
          const n = idx + 1;
          const val = dados.itens[String(n)] ?? '';
          return (
            <div
              key={n}
              style={{ borderBottom: '1px solid var(--border-solid)', padding: '10px 0', marginBottom: 2 }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 22, paddingTop: 4, fontWeight: 700 }}>{n}.</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500, lineHeight: 1.4 }}>{item}</span>
                <select
                  value={val}
                  onChange={(e) => setItem(n, e.target.value as 'sim' | 'nao' | 'na' | '')}
                  style={{ minWidth: 85, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-solid)', fontSize: 13, fontWeight: 600 }}
                >
                  <option value="">—</option>
                  <option value="sim">SIM</option>
                  <option value="nao">NÃO</option>
                  <option value="na">N.A.</option>
                </select>
              </div>
              <input
                type="text"
                placeholder="Observação (opcional)"
                value={dados.itemObs[String(n)] ?? ''}
                onChange={(e) => setItemObs(n, e.target.value)}
                style={{ marginTop: 6, marginLeft: 30, width: 'calc(100% - 34px)', padding: '6px 10px', fontSize: 12, border: '1px solid var(--border-solid)', borderRadius: 6 }}
              />
            </div>
          );
        })}
      </div>

      <div className="formulario-secao">
        <h3>Observações Gerais</h3>
        <textarea
          rows={4}
          style={{ width: '100%', padding: 12, border: '1px solid var(--border-solid)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
          placeholder="Observações gerais sobre a inspeção visual interna..."
          value={dados.observacoes}
          onChange={(e) => set('observacoes', e.target.value)}
        />
      </div>

      <div className="formulario-secao">
        <h3>Conclusão Técnica</h3>
        <textarea
          rows={3}
          style={{ width: '100%', padding: 12, border: '1px solid var(--border-solid)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
          placeholder="Conclusão técnica sobre as condições internas do equipamento..."
          value={dados.conclusao}
          onChange={(e) => set('conclusao', e.target.value)}
        />
      </div>

      <div className="formulario-secao">
        <h3>Registro Fotográfico ({dados.fotos.length} {dados.fotos.length === 1 ? 'foto' : 'fotos'})</h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
          Fotos salvas aqui serão injetadas automaticamente no documento de Inspeção Visual Interna.
        </p>
        <div className="fotos-formulario-grid">
          {dados.fotos.map((f, i) => (
            <div key={i} className="foto-formulario-item">
              <img src={f.base64} alt={`Foto ${i + 1}`} />
              <input
                type="text"
                placeholder={`Legenda — Foto ${i + 1}`}
                value={f.descricao}
                onChange={(e) => setDescricaoFoto(i, e.target.value)}
              />
              <button
                type="button"
                onClick={() => removerFoto(i)}
                style={{ width: '100%', background: '#fee2e2', color: '#dc2626', border: 'none', padding: '6px', fontSize: 11, cursor: 'pointer' }}
              >
                Remover
              </button>
            </div>
          ))}
          <label
            className="btn-add-foto"
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 80 }}
          >
            + Adicionar Foto
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={adicionarFoto} />
          </label>
        </div>
      </div>

      {erroSalvar && (
        <div style={{ color: '#dc2626', padding: 12, background: '#fee2e2', borderRadius: 8 }}>{erroSalvar}</div>
      )}

      <div className="formulario-acoes-fixas">
        <button
          type="button"
          className="btn-primario"
          onClick={salvar}
          disabled={salvando}
          style={salvoOk ? { background: '#16a34a' } : undefined}
        >
          {salvando ? 'Salvando...' : salvoOk ? '✓ Salvo com sucesso!' : 'Salvar Checklist Visual'}
        </button>
      </div>
    </>
  );
}
