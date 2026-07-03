import { useRef, useState } from 'react';
import { Icone } from '../../components/Icone';
import {
  excluirRastreabilidade,
  listarRastreabilidades,
  salvarRastreabilidade,
} from '../relatorios/rastreabilidadeService';
import type { Rastreabilidade } from '../relatorios/rastreabilidadeService';

const VAZIA = (): Rastreabilidade => ({
  id: crypto.randomUUID?.() ?? String(Date.now()),
  nome: '',
  certificadoPadrao: '',
  validade: '',
  pdfBase64: '',
  injetarNoRelatorio: false,
  criadoEm: new Date().toLocaleDateString('pt-BR'),
});

/**
 * Aba "Rastreabilidade" do menu Calibrações: cadastro do certificado de
 * rastreabilidade de cada instrumento padrão + upload do PDF + opção de
 * injetar o PDF no final do relatório gerado (merge no pdfService).
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
      setErro('Anexe o PDF da rastreabilidade.');
      return;
    }
    setErro('');
    setSalvando(true);
    try {
      await salvarRastreabilidade(form);
      setForm(null);
      recarregar();
    } finally {
      setSalvando(false);
    }
  }

  async function alternarInjecao(r: Rastreabilidade) {
    await salvarRastreabilidade({ ...r, injetarNoRelatorio: !r.injetarNoRelatorio });
    recarregar();
  }

  async function excluir(id: string) {
    if (!window.confirm('Excluir esta rastreabilidade?')) return;
    await excluirRastreabilidade(id);
    recarregar();
  }

  return (
    <div className="bloco-dados">
      <div className="meta-card-header">
        <h3>Rastreabilidade dos padrões</h3>
        {!form && (
          <button type="button" className="btn-primario" onClick={() => setForm(VAZIA())}>
            + Adicionar rastreabilidade
          </button>
        )}
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: '6px 0 16px' }}>
        Cadastre o certificado de rastreabilidade de cada instrumento padrão e anexe o PDF.
        Itens marcados com <b>"Injetar no relatório"</b> são anexados automaticamente ao final
        do PDF de todo relatório gerado — facilita a impressão do pacote completo.
      </p>

      {form && (
        <div className="fj-panel" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
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
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.injetarNoRelatorio}
                onChange={(e) => set('injetarNoRelatorio', e.target.checked)}
                style={{ accentColor: 'var(--amber)' }}
              />
              Injetar no final do relatório
            </label>
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
          <div className="fj-empty-title">Nenhuma rastreabilidade cadastrada</div>
          Adicione o certificado de rastreabilidade dos seus instrumentos padrão.
        </div>
      ) : (
        itens.length > 0 && (
          <div className="fj-table-wrap">
            <table className="fj-table">
              <thead>
                <tr>
                  <th>Instrumento</th>
                  <th>Certificado</th>
                  <th>Validade</th>
                  <th>Injetar no relatório</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="fj-tag-cell">
                        <div className="fj-tag-ico" style={{ background: 'var(--crit-bg)', color: 'var(--crit)' }}>
                          <Icone nome="filetext" tam={15} />
                        </div>
                        <div className="fj-tag-code">{r.nome}</div>
                      </div>
                    </td>
                    <td className="mono">{r.certificadoPadrao || <span className="fj-dash">—</span>}</td>
                    <td className="mono">{r.validade || <span className="fj-dash">—</span>}</td>
                    <td>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
                        <input
                          type="checkbox"
                          checked={r.injetarNoRelatorio}
                          onChange={() => alternarInjecao(r)}
                          style={{ accentColor: 'var(--amber)' }}
                        />
                        {r.injetarNoRelatorio ? <span className="fj-badge ok">Injeta</span> : <span className="fj-badge neutro">Não injeta</span>}
                      </label>
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
