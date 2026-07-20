import { useRef, useState } from 'react';
import { Icone } from '../../components/Icone';
import {
  excluirRastreabilidade,
  listarRastreabilidades,
  salvarRastreabilidade,
} from '../relatorios/rastreabilidadeService';
import type { Rastreabilidade, TipoInstrumento } from '../relatorios/rastreabilidadeService';

const VAZIA = (): Rastreabilidade => ({
  id: crypto.randomUUID?.() ?? String(Date.now()),
  nome: '',
  certificadoPadrao: '',
  validade: '',
  pdfBase64: '',
  // Injeção hoje é automática por tipo; a flag fica true para os consumidores legados
  // (autoPreencher/templates) que a usam como critério de preferência.
  injetarNoRelatorio: true,
  criadoEm: new Date().toLocaleDateString('pt-BR'),
  tipoInstrumento: 'manometro',
  aparelho: '',
  fabricante: '',
  numeroSerie: '',
  acoplante: '',
  cabecote: '',
  velocidadeSonica: '',
  estadoSuperficie: '',
  tempSuperficie: '',
});

const ROTULO_TIPO: Record<TipoInstrumento, string> = {
  manometro: 'Manômetro padrão',
  valvula: 'Válvula padrão (PSV)',
  ultrassom: 'Ultrassom (ME) padrão',
  bloco: 'Bloco padrão',
  pressostato: 'Pressostato padrão',
  termostato: 'Termostato padrão',
  manovacuometro: 'Manovacuômetro padrão',
  termometro: 'Termômetro padrão',
  outro: 'Outro',
};

/**
 * Aba "Certificados Calibração" do menu Calibrações: o certificado do instrumento
 * PADRÃO (PDF que não muda) — UM por tipo. O PDF é anexado automaticamente ao final
 * do relatório sempre que uma calibração daquele tipo é injetada (e o padrão de
 * ultrassom acompanha a folha de ultrassom). Sem flag manual e sem vínculo por TAG.
 */
export default function AbaRastreabilidade() {
  const [itens, setItens] = useState<Rastreabilidade[]>(() => listarRastreabilidades());
  const [form, setForm] = useState<Rastreabilidade | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function recarregar() {
    setItens(listarRastreabilidades());
  }

  function set<K extends keyof Rastreabilidade>(chave: K, valor: Rastreabilidade[K]) {
    setForm((f) => (f ? { ...f, [chave]: valor } : f));
  }

  function lerPdf(file: File) {
    if (file.type !== 'application/pdf') {
      setErro('Anexe um arquivo PDF.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setErro('PDF muito grande (máx. 8 MB). Comprima o arquivo antes de anexar.');
      return;
    }
    setErro('');
    const reader = new FileReader();
    reader.onload = (ev) => set('pdfBase64', String(ev.target?.result ?? ''));
    reader.readAsDataURL(file);
  }

  async function salvar() {
    if (!form) return;
    if (!form.nome.trim()) {
      setErro('Informe a identificação do instrumento/padrão.');
      return;
    }
    if (!form.pdfBase64) {
      setErro('Anexe o PDF do certificado.');
      return;
    }
    // Um certificado por tipo: salvar um tipo já cadastrado substitui o registro antigo.
    const duplicados = itens.filter(
      (r) => r.id !== form.id && r.tipoInstrumento === form.tipoInstrumento,
    );
    if (duplicados.length > 0) {
      const rotulo = ROTULO_TIPO[form.tipoInstrumento ?? 'outro'] ?? form.tipoInstrumento;
      if (!window.confirm(`Já existe um certificado de ${rotulo}. Substituir pelo novo?`)) return;
    }
    setErro('');
    setSalvando(true);
    try {
      await salvarRastreabilidade({ ...form, injetarNoRelatorio: true, tags: undefined });
      // Round-trip no cache local: a cota do localStorage pode estourar em silêncio na gravação
      // (storage.salvar não derruba a escrita) — sem o PDF no cache, o certificado nunca seria
      // injetado no relatório e o usuário só descobriria na impressão.
      const persistido = listarRastreabilidades().find((r) => r.id === form.id);
      if (!persistido?.pdfBase64) {
        setErro('O PDF é grande demais para o armazenamento local do navegador e não foi salvo. Comprima o arquivo (ideal até ~3 MB) e anexe novamente.');
        return;
      }
      for (const d of duplicados) await excluirRastreabilidade(d.id);
      setForm(null);
      recarregar();
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(id: string) {
    if (!window.confirm('Excluir este certificado padrão?')) return;
    await excluirRastreabilidade(id);
    recarregar();
  }

  return (
    <div className="bloco-dados">
      <div className="meta-card-header">
        <h3>Certificados de Calibração dos padrões</h3>
        {!form && (
          <button type="button" className="btn-primario" onClick={() => setForm(VAZIA())}>
            + Adicionar certificado
          </button>
        )}
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: '6px 0 16px' }}>
        Cadastre o certificado de calibração de cada instrumento <b>padrão</b> e anexe o PDF —
        é <b>um certificado por tipo</b> (manômetro padrão, válvula padrão, bloco padrão...), válido
        para todos os equipamentos. Ao injetar um lote de calibração no relatório, os PDFs dos
        padrões dos tipos presentes no lote são anexados <b>automaticamente</b> ao final.
      </p>

      {form && (
        <div className="fj-panel" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div className="fj-field">
              <label>Tipo de padrão</label>
              <select
                value={form.tipoInstrumento ?? 'outro'}
                onChange={(e) => set('tipoInstrumento', e.target.value as TipoInstrumento)}
              >
                {(Object.keys(ROTULO_TIPO) as TipoInstrumento[]).map((t) => (
                  <option key={t} value={t}>{ROTULO_TIPO[t]}</option>
                ))}
              </select>
            </div>
            <div className="fj-field">
              <label>Instrumento / padrão *</label>
              <input value={form.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Ex: Manômetro padrão MP-01" />
            </div>
            <div className="fj-field">
              <label>Nº certificado do padrão</label>
              <input value={form.certificadoPadrao} onChange={(e) => set('certificadoPadrao', e.target.value)} />
            </div>
            <div className="fj-field">
              <label>Validade</label>
              <input type="date" value={form.validade} onChange={(e) => set('validade', e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 12 }}>
            <div className="fj-field">
              <label>Aparelho / modelo</label>
              <input value={form.aparelho ?? ''} onChange={(e) => set('aparelho', e.target.value)} placeholder="Ex: CYGNUS 6278" />
            </div>
            <div className="fj-field">
              <label>Fabricante</label>
              <input value={form.fabricante ?? ''} onChange={(e) => set('fabricante', e.target.value)} />
            </div>
            <div className="fj-field">
              <label>Nº de série</label>
              <input value={form.numeroSerie ?? ''} onChange={(e) => set('numeroSerie', e.target.value)} />
            </div>
          </div>

          {form.tipoInstrumento === 'ultrassom' && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', marginBottom: 8 }}>
                Dados padrão do ensaio (injetados no relatório de ultrassom)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                <div className="fj-field">
                  <label>Acoplante</label>
                  <input value={form.acoplante ?? ''} onChange={(e) => set('acoplante', e.target.value)} placeholder="Ex: Gel" />
                </div>
                <div className="fj-field">
                  <label>Cabeçote</label>
                  <input value={form.cabecote ?? ''} onChange={(e) => set('cabecote', e.target.value)} placeholder="Ex: 2.25 mhz" />
                </div>
                <div className="fj-field">
                  <label>Velocidade sônica</label>
                  <input value={form.velocidadeSonica ?? ''} onChange={(e) => set('velocidadeSonica', e.target.value)} placeholder="Ex: 5920" />
                </div>
                <div className="fj-field">
                  <label>Estado da superfície</label>
                  <input value={form.estadoSuperficie ?? ''} onChange={(e) => set('estadoSuperficie', e.target.value)} placeholder="Ex: Pintada" />
                </div>
                <div className="fj-field">
                  <label>Temp. da superfície</label>
                  <input value={form.tempSuperficie ?? ''} onChange={(e) => set('tempSuperficie', e.target.value)} placeholder="Ex: Ambiente" />
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              style={{ display: 'none' }}
              onChange={(e) => e.target.files?.[0] && lerPdf(e.target.files[0])}
            />
            <button type="button" className="fj-btn fj-btn-ghost" onClick={() => fileRef.current?.click()}>
              <Icone nome="upload" tam={14} /> {form.pdfBase64 ? 'Trocar PDF' : 'Anexar PDF *'}
            </button>
            {form.pdfBase64 && (
              <span style={{ color: 'var(--ok)', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Icone nome="check" tam={13} /> PDF anexado
              </span>
            )}
          </div>

          {erro && <p style={{ color: 'var(--crit)', fontWeight: 600, fontSize: 12.5, marginTop: 10 }}>{erro}</p>}

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button type="button" className="btn-primario" onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
            <button type="button" className="btn-secundario" onClick={() => { setForm(null); setErro(''); }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {itens.length === 0 && !form ? (
        <div className="fj-empty">
          <div className="fj-empty-ic"><Icone nome="filetext" tam={22} /></div>
          <div className="fj-empty-title">Nenhum certificado padrão cadastrado</div>
          Adicione o certificado de calibração dos seus instrumentos padrão (um por tipo).
        </div>
      ) : (
        itens.length > 0 && (
          <div className="fj-table-wrap">
            <table className="fj-table">
              <thead>
                <tr>
                  <th>Tipo de padrão</th>
                  <th>Instrumento</th>
                  <th>Aparelho / Nº série</th>
                  <th>Certificado</th>
                  <th>Validade</th>
                  <th>PDF</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.tipoInstrumento
                        ? <span className="fj-badge neutro">{ROTULO_TIPO[r.tipoInstrumento] ?? r.tipoInstrumento}</span>
                        : <span className="fj-dash">—</span>}
                    </td>
                    <td>
                      <div className="fj-tag-cell">
                        <div className="fj-tag-ico" style={{ background: 'var(--crit-bg)', color: 'var(--crit)' }}>
                          <Icone nome="filetext" tam={15} />
                        </div>
                        <div className="fj-tag-code">{r.nome}</div>
                      </div>
                    </td>
                    <td className="mono">
                      {r.aparelho || r.numeroSerie
                        ? [r.aparelho, r.numeroSerie].filter(Boolean).join(' / ')
                        : <span className="fj-dash">—</span>}
                    </td>
                    <td className="mono">{r.certificadoPadrao || <span className="fj-dash">—</span>}</td>
                    <td className="mono">{r.validade || <span className="fj-dash">—</span>}</td>
                    <td>
                      {r.pdfBase64
                        ? <span className="fj-badge ok">Anexado</span>
                        : <span className="fj-badge neutro">Sem PDF</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          className="fj-btn fj-btn-ghost"
                          onClick={() => setForm({ ...r })}
                          title="Editar"
                        >
                          <Icone nome="pencil" tam={13} />
                        </button>
                        <button
                          type="button"
                          className="fj-btn fj-btn-danger"
                          onClick={() => excluir(r.id)}
                          title="Excluir"
                        >
                          <Icone nome="trash" tam={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
