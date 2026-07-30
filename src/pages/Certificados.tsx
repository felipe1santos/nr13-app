import { useEffect, useRef, useState } from 'react';
import { Icone, type NomeIcone } from '../components/Icone';
import {
  LIMITE_PDF_KB,
  erroCotaLocal,
  validarPdfCertificado,
} from '../features/relatorios/certificadoUpload';
import {
  injetaNoRelatorio,
  listarRastreabilidades,
  listarRastreabilidadesAtivas,
  resolverPdf,
  salvarRastreabilidade,
  temPdfDe,
} from '../features/relatorios/rastreabilidadeService';
import type { Rastreabilidade, TipoInstrumento } from '../features/relatorios/rastreabilidadeService';
import './certificados.css';

/**
 * Tela "Certificados": o certificado de calibração dos instrumentos PADRÃO de
 * medição — UM por tipo, válido para todos os equipamentos.
 *
 * Os padrões são FIXOS e definidos aqui, não pelo usuário: cada tipo só existe
 * porque algum documento sabe consumi-lo (ver `destino` de cada card). Um padrão
 * inventado pelo usuário — digamos, líquido penetrante — não teria folha nenhuma
 * para receber o PDF nem os dados de rastreabilidade, então ficaria órfão. Novo
 * padrão = nova rota de injeção implantada antes, aqui e no template.
 */
interface PadraoFixo {
  tipo: TipoInstrumento;
  titulo: string;
  sub: string;
  destino: string;
  icone: NomeIcone;
}

const PADROES: PadraoFixo[] = [
  {
    tipo: 'ultrassom',
    titulo: 'Bloco padrão de espessura',
    sub: 'Ultrassom / Medição de Espessura (ME)',
    destino: 'Folha de Ultrassom do relatório e do prontuário (rastreabilidade + PDF anexo)',
    icone: 'gauge',
  },
  {
    tipo: 'manometro',
    titulo: 'Manômetro padrão',
    sub: 'Aferição de manômetros e teste hidrostático',
    destino: 'Certificado de Calibração de Manômetro e folha de Teste Hidrostático',
    icone: 'manometro',
  },
  {
    tipo: 'valvula',
    titulo: 'Válvula PSV padrão',
    sub: 'Aferição de válvulas de segurança',
    destino: 'Certificado de Calibração de Válvula de Segurança (PSV)',
    icone: 'valvula-psv',
  },
];

const novoRegistro = (tipo: TipoInstrumento): Rastreabilidade => ({
  id: crypto.randomUUID?.() ?? String(Date.now()),
  nome: '',
  certificadoPadrao: '',
  validade: '',
  pdfBase64: '',
  // Injeção hoje é automática por tipo; a flag fica true para os consumidores legados
  // (autoPreencher/templates) que a usam como critério de preferência.
  injetarNoRelatorio: true,
  criadoEm: new Date().toLocaleDateString('pt-BR'),
  tipoInstrumento: tipo,
  aparelho: '',
  fabricante: '',
  numeroSerie: '',
  acoplante: '',
  cabecote: '',
  velocidadeSonica: '',
  estadoSuperficie: '',
  tempSuperficie: '',
});

/** dd/mm/aaaa a partir do valor do <input type="date"> (aaaa-mm-dd). */
function formatarValidade(valor: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : valor;
}

export default function Certificados() {
  const [itens, setItens] = useState<Rastreabilidade[]>(() => listarRastreabilidadesAtivas());
  const [form, setForm] = useState<Rastreabilidade | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);

  // Abrir o formulário no fim da página deixaria o usuário sem ver o que abriu.
  useEffect(() => {
    if (form) painelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [form]);

  function recarregar() {
    setItens(listarRastreabilidadesAtivas());
  }

  function set<K extends keyof Rastreabilidade>(chave: K, valor: Rastreabilidade[K]) {
    setForm((f) => (f ? { ...f, [chave]: valor } : f));
  }

  const registroDoTipo = (tipo: TipoInstrumento) =>
    itens.find((r) => r.tipoInstrumento === tipo && temPdfDe(r)) ??
    itens.find((r) => r.tipoInstrumento === tipo);

  async function abrir(tipo: TipoInstrumento) {
    setErro('');
    const existente = registroDoTipo(tipo);
    if (!existente) {
      setForm(novoRegistro(tipo));
      return;
    }
    setForm({ ...existente });
    // O registro no cache vem SEM o PDF (mora no IndexedDB — ver storage.ts).
    // Traz o arquivo de volta para o formulário: salvar sem trocar o PDF precisa
    // regravar o registro completo, senão a nova versão nasceria sem certificado.
    const pdf = await resolverPdf(existente);
    if (pdf) setForm((f) => (f && f.id === existente.id ? { ...f, pdfBase64: pdf } : f));
  }

  function lerPdf(file: File) {
    const validacao = validarPdfCertificado(file);
    if (!validacao.ok) {
      setErro(validacao.erro);
      if (fileRef.current) fileRef.current.value = ''; // permite reescolher o MESMO arquivo
      return;
    }
    setErro('');
    const reader = new FileReader();
    reader.onerror = () => setErro('Não foi possível ler o arquivo. Tente selecioná-lo novamente.');
    reader.onload = (ev) => set('pdfBase64', String(ev.target?.result ?? ''));
    reader.readAsDataURL(file);
  }

  async function salvar() {
    if (!form) return;
    if (!form.nome.trim()) {
      setErro('Informe a identificação do instrumento padrão.');
      return;
    }
    if (!form.pdfBase64) {
      setErro('Anexe o PDF do certificado.');
      return;
    }
    setErro('');
    setSalvando(true);
    try {
      // IMUTABILIDADE: editar não sobrescreve — grava uma VERSÃO NOVA (id novo) e marca a
      // antiga como substituída. Relatórios salvos referenciam a versão pelo id
      // (meta.rastreabIds) e continuam com o PDF congelado da época.
      const agora = new Date().toLocaleDateString('pt-BR');
      const editando = listarRastreabilidades().find((r) => r.id === form.id);
      const duplicados = itens.filter(
        (r) => r.id !== form.id && r.tipoInstrumento === form.tipoInstrumento,
      );
      const registro: Rastreabilidade = {
        ...form,
        id: editando ? (crypto.randomUUID?.() ?? String(Date.now())) : form.id,
        criadoEm: agora,
        injetarNoRelatorio: true,
        tags: undefined,
        substituidoEm: undefined,
      };
      await salvarRastreabilidade(registro);
      // Round-trip: confirma que o registro entrou no cache E que o PDF é recuperável
      // (IndexedDB, ou Supabase como fallback). Sem essa checagem, uma gravação que
      // falhasse em silêncio só apareceria na hora de imprimir o relatório.
      const persistido = listarRastreabilidades().find((r) => r.id === registro.id);
      if (!persistido || !(await resolverPdf(persistido))) {
        setErro(erroCotaLocal(form.pdfBase64.length));
        return;
      }
      // Só depois do novo estar seguro: aposenta a versão editada e os duplicados do tipo.
      if (editando) await salvarRastreabilidade({ ...editando, substituidoEm: agora });
      for (const d of duplicados) await salvarRastreabilidade({ ...d, substituidoEm: agora });
      setForm(null);
      recarregar();
    } finally {
      setSalvando(false);
    }
  }

  /**
   * Liga/desliga a injeção do certificado no fim do relatório. Grava NO MESMO
   * registro (id preservado) — ao contrário de editar, isto não é uma versão
   * nova do certificado: é só uma preferência, e criar versão duplicaria o PDF.
   */
  async function alternarInjecao(r: Rastreabilidade) {
    await salvarRastreabilidade({ ...r, injetarNoRelatorio: !injetaNoRelatorio(r) });
    recarregar();
  }

  async function excluir(r: Rastreabilidade) {
    if (
      !window.confirm(
        'Remover este certificado padrão? Relatórios já salvos que o utilizam continuam com o PDF congelado.',
      )
    ) {
      return;
    }
    // Soft-delete: sai da lista/injeção, mas o PDF fica retido para os relatórios salvos.
    await salvarRastreabilidade({ ...r, substituidoEm: new Date().toLocaleDateString('pt-BR') });
    if (form?.id === r.id) setForm(null);
    recarregar();
  }

  const padraoDoForm = PADROES.find((p) => p.tipo === form?.tipoInstrumento);

  return (
    <div className="certificados-page">
      <div className="cert-intro">
        <h2>Certificados de calibração dos padrões</h2>
        <p>
          Aqui você injeta o <b>certificado de calibração de cada equipamento padrão</b> de medição e
          preenche as respectivas <b>rastreabilidades</b>. É um certificado por padrão, válido para
          todos os equipamentos: ao gerar um relatório, o sistema anexa sozinho o PDF do padrão
          usado no ensaio e leva os dados de rastreabilidade para dentro da folha correspondente.
        </p>
        <p className="cert-intro-nota">
          <Icone nome="alerttri" tam={14} /> Faça isso uma vez e mantenha atualizado quando o
          certificado vencer.
        </p>
      </div>

      <div className="cert-cards">
        {PADROES.map((p) => {
          const r = registroDoTipo(p.tipo);
          const completo = !!r && temPdfDe(r);
          const injeta = !!r && injetaNoRelatorio(r);
          return (
            <div key={p.tipo} className={`cert-card${completo && injeta ? ' ok' : ''}`}>
              <div className="cert-card-topo">
                <div className="cert-card-ic">
                  <Icone nome={p.icone} tam={20} />
                </div>
                <div className="cert-card-tit">
                  <strong>{p.titulo}</strong>
                  <span>{p.sub}</span>
                </div>
                <span className={`fj-badge ${completo && injeta ? 'cert-badge-ok' : 'neutro'}`}>
                  {!completo ? 'Pendente' : injeta ? 'Cadastrado' : 'Fora do relatório'}
                </span>
              </div>

              <div className="cert-card-destino">
                <Icone nome="arrowright" tam={12} /> {p.destino}
              </div>

              {r ? (
                <dl className="cert-card-dados">
                  <div>
                    <dt>Instrumento</dt>
                    <dd>{r.nome || <span className="fj-dash">—</span>}</dd>
                  </div>
                  <div>
                    <dt>Nº do certificado</dt>
                    <dd className="mono">{r.certificadoPadrao || <span className="fj-dash">—</span>}</dd>
                  </div>
                  <div>
                    <dt>Validade</dt>
                    <dd className="mono">
                      {r.validade ? formatarValidade(r.validade) : <span className="fj-dash">—</span>}
                    </dd>
                  </div>
                  <div>
                    <dt>PDF</dt>
                    <dd>
                      {completo ? (
                        <span className="cert-ok">
                          <Icone nome="check" tam={12} /> Anexado
                        </span>
                      ) : (
                        <span className="cert-falta">Falta anexar</span>
                      )}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="cert-card-vazio">
                  Nenhum certificado cadastrado para este padrão.
                </p>
              )}

              {r && (
                <label className="cert-injetar" title="Anexa o PDF deste certificado ao final do relatório">
                  <input
                    type="checkbox"
                    checked={injetaNoRelatorio(r)}
                    onChange={() => void alternarInjecao(r)}
                  />
                  <span>Injetar no final do relatório</span>
                </label>
              )}

              <div className="cert-card-acoes">
                {r ? (
                  <>
                    <button
                      type="button"
                      className="fj-btn cert-btn-icone"
                      onClick={() => void abrir(p.tipo)}
                      title="Editar certificado"
                      aria-label="Editar certificado"
                    >
                      <Icone nome="pencil" tam={14} />
                    </button>
                    <button
                      type="button"
                      className="fj-btn fj-btn-danger"
                      onClick={() => excluir(r)}
                      title="Excluir certificado"
                      aria-label="Excluir certificado"
                    >
                      <Icone nome="trash" tam={14} />
                    </button>
                  </>
                ) : (
                  <button type="button" className="cert-btn-add" onClick={() => void abrir(p.tipo)}>
                    <Icone nome="plus" tam={14} /> Adicionar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {form && padraoDoForm && (
        <div className="cert-form" ref={painelRef}>
          <div className="cert-form-cab">
            <div>
              <strong>{padraoDoForm.titulo}</strong>
              <span>{padraoDoForm.sub}</span>
            </div>
            <button type="button" className="fj-btn fj-btn-ghost" onClick={() => { setForm(null); setErro(''); }}>
              <Icone nome="x" tam={14} /> Fechar
            </button>
          </div>

          <div className="cert-form-grid">
            <div className="fj-field">
              <label>Instrumento / padrão *</label>
              <input
                value={form.nome}
                onChange={(e) => set('nome', e.target.value)}
                placeholder={
                  form.tipoInstrumento === 'ultrassom'
                    ? 'Ex: Bloco padrão BP-01'
                    : form.tipoInstrumento === 'valvula'
                      ? 'Ex: Bancada de teste PSV-01'
                      : 'Ex: Manômetro padrão MP-01'
                }
              />
            </div>
            <div className="fj-field">
              <label>Nº do certificado</label>
              <input value={form.certificadoPadrao} onChange={(e) => set('certificadoPadrao', e.target.value)} />
            </div>
            <div className="fj-field">
              <label>Validade</label>
              <input type="date" value={form.validade} onChange={(e) => set('validade', e.target.value)} />
            </div>
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
            <>
              <div className="cert-form-secao">Dados padrão do ensaio (injetados na folha de ultrassom)</div>
              <div className="cert-form-grid">
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
            </>
          )}

          <div className="cert-form-secao">PDF do certificado</div>
          <div className="cert-upload">
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              style={{ display: 'none' }}
              onChange={(e) => e.target.files?.[0] && lerPdf(e.target.files[0])}
            />
            <button type="button" className="fj-btn fj-btn-ghost" onClick={() => fileRef.current?.click()}>
              <Icone nome="upload" tam={14} /> {form.pdfBase64 ? 'Trocar PDF' : 'Anexar PDF *'}
            </button>
            {form.pdfBase64 && (
              <span className="cert-ok">
                <Icone nome="check" tam={13} /> PDF anexado
              </span>
            )}
            <span className="cert-limite">
              Arquivo PDF de até <b>{LIMITE_PDF_KB} KB</b> (2 MB). Certificados escaneados costumam
              ter 200–800 KB; se o seu passar do limite, comprima em ilovepdf.com/compress_pdf.
            </span>
          </div>

          {erro && <p className="cert-erro">{erro}</p>}

          <div className="cert-form-acoes">
            <button type="button" className="btn-primario" onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar certificado'}
            </button>
            <button type="button" className="btn-secundario" onClick={() => { setForm(null); setErro(''); }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Registros de tipos sem rota de injeção (cadastrados quando o formulário
          deixava escolher qualquer tipo) não são mais listados: nenhuma folha os
          consome, então não há o que o usuário decidir sobre eles. Continuam
          gravados e resolvíveis por id — relatório salvo que os referencie segue
          com o PDF congelado. */}
    </div>
  );
}
