import { useState } from 'react';
import { Icone, type NomeIcone } from '../components/Icone';
import AjudaCertificados from '../features/calibracoes/AjudaCertificados';
import ModalCertificado from '../features/calibracoes/ModalCertificado';
import ModalVerCertificado from '../features/calibracoes/ModalVerCertificado';
import FeedbackSalvamento, { useSalvamento } from '../components/FeedbackSalvamento';
import '../features/calibracoes/ilustracoes.css';
import { erroCotaLocal, validarPdfCertificado } from '../features/relatorios/certificadoUpload';
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
  /** "Como funciona" — o texto que era faixa fixa no topo da tela. */
  const [ajudaAberta, setAjudaAberta] = useState(false);
  const [erro, setErro] = useState('');
  /** Qual certificado está aberto no visualizador de PDF. `null` = nenhum. */
  const [vendo, setVendo] = useState<Rastreabilidade | null>(null);
  // O aviso de salvar do sistema inteiro — centralizado, com o check só depois
  // do await. Ver `components/FeedbackSalvamento`.
  const salvamento = useSalvamento();

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
      // O input do arquivo vive dentro do modal e ele mesmo se limpa a cada
      // escolha (ver `ModalCertificado`), então reescolher o MESMO arquivo
      // continua disparando o `change`.
      return;
    }
    setErro('');
    const reader = new FileReader();
    reader.onerror = () => setErro('Não foi possível ler o arquivo. Tente selecioná-lo novamente.');
    reader.onload = (ev) =>
      // A `pdfRef` do arquivo ANTERIOR morre aqui, junto com o arquivo que ela
      // aponta. Mantê-la faria `salvarRastreabilidade` tomar o caminho "já tem
      // ref", gravar a referência velha e DESCARTAR em silêncio o PDF que o
      // usuário acabou de escolher.
      setForm((f) =>
        f ? { ...f, pdfBase64: String(ev.target?.result ?? ''), pdfRef: undefined } : f,
      );
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
    const pdfTamanho = form.pdfBase64.length;
    // O aviso "salvando → salvo" fica com o hook; o check só aparece depois do
    // await, e a falha de cota é LANÇADA para não virar um sucesso otimista.
    const ok = await salvamento.executar(async () => {
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
        throw new Error(erroCotaLocal(pdfTamanho));
      }
      // Só depois do novo estar seguro: aposenta a versão editada e os duplicados do tipo.
      if (editando) await salvarRastreabilidade({ ...editando, substituidoEm: agora });
      for (const d of duplicados) await salvarRastreabilidade({ ...d, substituidoEm: agora });
    });
    if (ok) {
      setForm(null);
      recarregar();
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
      {/* O BLOCO EXPLICATIVO VIROU AJUDA (06/09/2026).
          Eram três parágrafos fixos no topo, em toda visita, explicando algo
          que se lê uma vez — e que empurravam os três cartões (o trabalho)
          para baixo da dobra em telas curtas. O texto foi reaproveitado quase
          inteiro em `AjudaCertificados`: ele estava certo, estava no lugar
          errado. */}
      <div className="cert-intro cert-intro-compacta">
        <h2>Certificados de calibração dos padrões</h2>
        {/* [i] Informações — a explicação inteira vive no modal, com a
            ilustração do fluxo. */}
        <button
          type="button"
          className="fj-btn fj-btn-ghost cal-btn-info"
          aria-haspopup="dialog"
          onClick={() => setAjudaAberta(true)}
        >
          <Icone nome="alerttri" tam={13} /> Informações
        </button>
      </div>

      {ajudaAberta && <AjudaCertificados aoFechar={() => setAjudaAberta(false)} />}

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
                {/* "Cadastrado" ganha check e verde: é o estado que o usuário
                    procura ao bater o olho na tela, e um badge neutro fazia os
                    três cards parecerem iguais. Os outros dois estados seguem
                    neutros de propósito — cor é para o que está resolvido. */}
                <span className={`fj-badge ${completo && injeta ? 'cert-badge-ok' : 'neutro'}`}>
                  {completo && injeta && <Icone nome="check" tam={12} />}
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
                /* Estado vazio com ilustração: um card que só diz "nenhum
                   certificado" em texto some no meio dos outros dois. A imagem
                   é decorativa — `alt` vazio para o leitor de tela não anunciar
                   um desenho que não acrescenta informação ao texto ao lado. */
                <div className="cert-card-vazio">
                  <img src="/ilustracoes/certificado-vazio.jpg" alt="" loading="lazy" />
                  <p>Nenhum certificado cadastrado para este padrão.</p>
                </div>
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
                    {/* Ver o PDF é o gesto mais frequente depois de cadastrar —
                        conferir validade e se é mesmo o documento certo. Fica
                        primeiro, e só existe quando há arquivo para abrir. */}
                    {completo && (
                      <button
                        type="button"
                        className="fj-btn fj-btn-ghost cert-btn-ver"
                        onClick={() => setVendo(r)}
                        title="Visualizar certificado"
                      >
                        <Icone nome="eye" tam={14} /> Ver certificado
                      </button>
                    )}
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
        <ModalCertificado
          form={form}
          titulo={padraoDoForm.titulo}
          subtitulo={padraoDoForm.sub}
          ocupado={salvamento.salvando}
          erro={erro}
          onCampo={set}
          onArquivo={lerPdf}
          onSalvar={() => void salvar()}
          onFechar={() => { setForm(null); setErro(''); }}
        />
      )}

      {vendo && (
        <ModalVerCertificado
          registro={vendo}
          titulo={PADROES.find((p) => p.tipo === vendo.tipoInstrumento)?.titulo ?? 'Certificado'}
          onFechar={() => setVendo(null)}
        />
      )}

      {/* O aviso de salvar do sistema: centralizado, e o check só depois do
          await. Fica FORA do modal para sobreviver ao fechamento dele. */}
      <FeedbackSalvamento
        estado={salvamento.estado}
        erro={salvamento.erro}
        aoFechar={salvamento.limpar}
      />

      {/* Registros de tipos sem rota de injeção (cadastrados quando o formulário
          deixava escolher qualquer tipo) não são mais listados: nenhuma folha os
          consome, então não há o que o usuário decidir sobre eles. Continuam
          gravados e resolvíveis por id — relatório salvo que os referencie segue
          com o PDF congelado. */}
    </div>
  );
}
