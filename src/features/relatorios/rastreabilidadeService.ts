import { PDFDocument } from 'pdf-lib';
import { ler, salvar, excluirChave, listarChavesComPrefixo, lerRemoto } from '../../services/storage';
import { guardarPdf, lerPdf } from '../../services/pdfStore';
import { salvarArquivo, baixarFoto, blobParaDataUrl, type RefFoto } from '../../services/fotos';

/**
 * Certificados de calibração dos instrumentos PADRÃO: o usuário anexa UM PDF
 * por tipo de padrão (manômetro padrão, válvula padrão, bloco padrão...). O PDF
 * é anexado automaticamente ao FINAL do relatório sempre que o relatório contém
 * uma calibração daquele tipo (ou a folha de ultrassom, para o padrão de ME).
 * Chave: nr13_rastreab_<id> (sincroniza pela nuvem como qualquer outra).
 */
export type TipoInstrumento =
  | 'ultrassom'
  | 'manometro'
  | 'valvula'
  | 'bloco'
  | 'pressostato'
  | 'termostato'
  | 'manovacuometro'
  | 'termometro'
  | 'outro';

export interface Rastreabilidade {
  id: string;
  nome: string;               // identificação do instrumento/padrão
  certificadoPadrao: string;  // nº do certificado do padrão
  validade: string;           // data (dd/mm/aaaa ou aaaa-mm-dd)
  // data URL ou base64 puro do PDF. VEM VAZIO no cache local desde que os PDFs
  // passaram a morar no IndexedDB (cota do localStorage — ver storage.ts): use
  // `temPdfDe()` para saber se existe arquivo e `resolverPdf()` para obtê-lo.
  // Continua preenchido no Supabase e em registros recém-montados na tela.
  pdfBase64: string;
  temPdf?: boolean;           // marcador gravado ao separar o PDF do registro
  pdfBytes?: number;          // tamanho do base64, para mensagens de erro
  /**
   * O arquivo no bucket `inspecao`, caminho `<org>/certificados/<uuid>.pdf`.
   * Desde 11/08/2026 é ASSIM que um certificado novo é guardado: o registro do
   * `app_storage` carrega só esta referência leve. Ausente = registro legado,
   * com o PDF em base64 dentro do próprio registro no Supabase.
   */
  pdfRef?: RefFoto;
  // LEGADO: a injeção era manual por flag; hoje é automática por tipo presente no
  // relatório. Mantida só para registros antigos e para a preferência do autoPreencher.
  injetarNoRelatorio: boolean;
  criadoEm: string;
  // ── Campos opcionais (cadastro por instrumento — registros antigos não os têm) ──
  tipoInstrumento?: TipoInstrumento; // seleciona qual template de ensaio consome o registro
  aparelho?: string;                 // aparelho/modelo (ex.: "CYGNUS 6278")
  fabricante?: string;
  numeroSerie?: string;
  // Dados padrão do ensaio (só fazem sentido quando tipoInstrumento='ultrassom'):
  acoplante?: string;
  cabecote?: string;                 // ex.: "2.25 mhz"
  velocidadeSonica?: string;         // ex.: "5920"
  estadoSuperficie?: string;
  tempSuperficie?: string;           // ex.: "Ambiente"
  // LEGADO (vínculo por TAG removido — certificado padrão vale para todos os
  // equipamentos). Mantido só para leitura de registros antigos no autoPreencher.
  tags?: string[];
  // Soft-replace: editar/excluir NÃO apaga o registro — marca a data aqui. Registros
  // substituídos saem da lista/injeção de relatórios novos, mas relatórios salvos que
  // referenciam este id (meta.rastreabIds) continuam achando o PDF da época.
  substituidoEm?: string;
}

/** true se o padrão vale para a TAG (global quando não há vínculo). */
export function aplicaAoEquipamento(r: Rastreabilidade, tag?: string | null): boolean {
  if (!r.tags?.length) return true;
  return !!tag && r.tags.includes(tag);
}

/** Tipo de padrão usado por um certificado de calibração ('manometro' | 'psv'). */
export function tipoPadraoDoCertificado(tipoCalibracao: string): TipoInstrumento {
  return tipoCalibracao === 'psv' ? 'valvula' : 'manometro';
}

/**
 * Tipos de padrão exigidos por um relatório, derivados da lista de documentos:
 * cada folha de certificado de calibração (`?calibId=`) pede o padrão do seu tipo
 * (manômetro/válvula) e a folha de ultrassom pede o padrão de ME.
 */
export function tiposPadraoDoRelatorio(documentos: string[]): TipoInstrumento[] {
  const tipos = new Set<TipoInstrumento>();
  for (const doc of documentos) {
    const m = /[?&]calibId=([^&]+)/.exec(doc);
    if (m) {
      const item = ler<{ tipo?: string }>(`nr13_calibracao_item_${m[1]}`);
      if (item?.tipo) tipos.add(tipoPadraoDoCertificado(item.tipo));
    } else if (doc.split('?')[0] === 'ULTRASSOM.html') {
      tipos.add('ultrassom');
    }
  }
  return [...tipos];
}

const tsCriadoEm = (r: Rastreabilidade): number => {
  const p = (r.criadoEm ?? '').split('/');
  return p.length === 3 ? new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0])).getTime() : 0;
};

/**
 * Certificados padrão a anexar no relatório: um por tipo presente nos documentos.
 * Duplicatas do mesmo tipo (registros antigos): vence quem tem PDF; empate, o mais recente.
 */
export function rastreabilidadesParaRelatorio(documentos: string[]): Rastreabilidade[] {
  const tipos = new Set(tiposPadraoDoRelatorio(documentos));
  if (tipos.size === 0) return [];
  const porTipo = new Map<TipoInstrumento, Rastreabilidade>();
  for (const r of listarRastreabilidadesAtivas()) {
    if (!r.tipoInstrumento || !tipos.has(r.tipoInstrumento)) continue;
    if (!injetaNoRelatorio(r)) continue; // caixinha desmarcada na tela Certificados
    const atual = porTipo.get(r.tipoInstrumento);
    if (
      !atual ||
      (!temPdfDe(atual) && temPdfDe(r)) ||
      (temPdfDe(atual) === temPdfDe(r) && tsCriadoEm(r) > tsCriadoEm(atual))
    ) {
      porTipo.set(r.tipoInstrumento, r);
    }
  }
  return [...porTipo.values()];
}

const PREFIXO = 'nr13_rastreab_';

/** Há PDF anexado? Checagem SÍNCRONA (para a interface), sem carregar o arquivo. */
export function temPdfDe(r: Rastreabilidade): boolean {
  return r.temPdf === true || !!r.pdfBase64 || !!r.pdfRef?.path;
}

/**
 * O usuário marcou este padrão para ser anexado ao fim do relatório?
 * Ausente = MARCADO: registros antigos (e os criados antes de a caixinha voltar
 * a existir) continuam sendo injetados exatamente como eram — a caixinha só dá
 * ao usuário o poder de DESmarcar, nunca tira anexo de quem já tinha.
 */
export function injetaNoRelatorio(r: Rastreabilidade): boolean {
  return r.injetarNoRelatorio !== false;
}

/**
 * Devolve o PDF do registro, venha ele de onde vier, na ordem que custa menos:
 * 1. do próprio objeto (registro recém-montado na tela ou legado ainda gordo);
 * 2. do BUCKET pela `pdfRef` — que na verdade tenta o cofre local primeiro
 *    (`baixarFoto`), então offline e egress zero no caso comum;
 * 3. do IndexedDB `nr13_pdfs` (registros separados pelo §2-bis, sem ref);
 * 4. do Supabase (aparelho novo/cache limpo), repovoando o IndexedDB de quebra.
 * null = não há arquivo recuperável.
 *
 * O passo 2 NÃO interrompe a cadeia quando falha: bucket fora do ar ou arquivo
 * removido caem nos passos seguintes, porque o socorro dos relatórios já
 * salvos vale mais do que a economia.
 */
export async function resolverPdf(r: Rastreabilidade): Promise<string | null> {
  if (r.pdfBase64) return r.pdfBase64;
  if (!temPdfDe(r)) return null;

  if (r.pdfRef?.path) {
    try {
      const blob = await baixarFoto(r.pdfRef);
      if (blob) return await blobParaDataUrl(blob);
    } catch {
      // segue para os caminhos legados
    }
  }

  const chave = `${PREFIXO}${r.id}`;
  const local = await lerPdf(chave);
  if (local) return local;
  const bruto = await lerRemoto(chave);
  if (!bruto) return null;
  try {
    const completo = JSON.parse(bruto) as Rastreabilidade;
    if (!completo.pdfBase64) return null;
    void guardarPdf(chave, completo.pdfBase64); // próxima leitura sai do IndexedDB
    return completo.pdfBase64;
  } catch {
    return null;
  }
}

export function listarRastreabilidades(): Rastreabilidade[] {
  return listarChavesComPrefixo(PREFIXO)
    .map((chave) => {
      try {
        return ler<Rastreabilidade>(chave);
      } catch {
        return null;
      }
    })
    .filter((r): r is Rastreabilidade => !!r)
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

/** Registros vigentes (sem os soft-substituídos) — UI e injeção de relatórios NOVOS. */
export function listarRastreabilidadesAtivas(): Rastreabilidade[] {
  return listarRastreabilidades().filter((r) => !r.substituidoEm);
}

export async function salvarRastreabilidade(r: Rastreabilidade): Promise<void> {
  // ── Caminho novo: o arquivo vai para o bucket, o registro leva só a ref ────
  // O PDF NUNCA mais entra no `app_storage`. Um certificado escaneado tem
  // 200–800 KB e base64 ainda infla 33%; na conta `gabriel.dadona` dois
  // registros somavam 7.392 KB que o app rebaixava a cada hidratação.
  //
  // Se o upload falhar (campo sem sinal), `salvarArquivo` já deixou o arquivo
  // no cofre local marcado como pendente e a fila o retoma sozinha — o registro
  // pode ser gravado agora, com o caminho definitivo.
  if (r.pdfBase64 && !r.pdfRef?.path) {
    try {
      const bytes = base64ParaBytes(r.pdfBase64);
      const ref = await salvarArquivo(
        new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }),
        'certificados',
        'pdf',
        'application/pdf',
      );
      await salvar(`${PREFIXO}${r.id}`, {
        ...r,
        pdfBase64: '',
        pdfRef: ref,
        temPdf: true,
        pdfBytes: r.pdfBase64.length,
      });
      return;
    } catch {
      // Sem organização ativa ou cofre indisponível: cai no caminho legado
      // abaixo, que ainda grava o PDF no registro. Pesado, porém salvo — perder
      // o certificado do usuário seria muito pior que gastar bytes.
    }
  }

  // ── Registro que já tem ref: nada a recuperar, a ref é leve ───────────────
  // `pdfBase64` é ZERADO aqui de propósito. A tela de Certificados pré-preenche
  // esse campo com o arquivo resolvido (para poder mostrar "Trocar PDF"), e
  // deixá-lo viajar junto devolveria o peso ao `app_storage` pela porta dos
  // fundos. Quem troca de arquivo de verdade limpa a `pdfRef` junto — é o que
  // faz o input de PDF —, e aí o registro cai no ramo de upload acima.
  if (r.pdfRef?.path) {
    await salvar(`${PREFIXO}${r.id}`, { ...r, pdfBase64: '', temPdf: true });
    return;
  }

  // ── Caminho legado (registro sem ref, PDF em base64 no Supabase) ──────────
  // BLINDAGEM: registro lido do cache vem SEM o PDF (mora no IndexedDB — ver
  // storage.ts §CAMPOS_PESADOS). Regravá-lo desse jeito — como fazem o soft-delete
  // (`{...r, substituidoEm}`) e o toggle de injeção — sobrescreveria no Supabase o
  // registro completo por um sem arquivo. Como o Supabase é a fonte que sincroniza
  // entre aparelhos e que socorre relatórios salvos, o certificado sumiria de vez.
  // Recupera o PDF antes de gravar sempre que o marcador diz que ele existe.
  const completo =
    !r.pdfBase64 && temPdfDe(r) ? { ...r, pdfBase64: (await resolverPdf(r)) ?? '' } : r;
  await salvar(`${PREFIXO}${r.id}`, completo);
}

export async function excluirRastreabilidade(id: string): Promise<void> {
  await excluirChave(`${PREFIXO}${id}`);
}

function base64ParaBytes(b64: string): Uint8Array {
  const puro = b64.includes(',') ? b64.slice(b64.indexOf(',') + 1) : b64;
  const bin = atob(puro);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Certificados padrão do relatório ABERTO no visualizador: se a meta atual congelou os
 * ids na geração (meta.rastreabIds — imutabilidade §7-bis), resolve por id (inclusive
 * versões soft-substituídas — o PDF da época). Relatório antigo sem snapshot cai no
 * cálculo por tipo com os registros vigentes.
 */
export function rastreabilidadesDoRelatorioAberto(documentos: string[]): Rastreabilidade[] {
  try {
    const meta = ler<{ rastreabIds?: unknown }>('nr13_relatorio_meta_atual');
    if (meta && Array.isArray(meta.rastreabIds)) {
      const porId = new Map(listarRastreabilidades().map((r) => [r.id, r]));
      return (meta.rastreabIds as unknown[])
        .map((id) => porId.get(String(id)))
        .filter((r): r is Rastreabilidade => !!r);
    }
  } catch {
    /* meta ausente/corrompida: cálculo vivo abaixo */
  }
  return rastreabilidadesParaRelatorio(documentos);
}

/**
 * Anexa ao final do PDF do relatório os certificados dos padrões dos tipos
 * presentes nos documentos (automático — sem flag manual). PDF que falhar ao
 * carregar é pulado (o relatório sai sem ele) e o nome volta em `falhas`.
 */
export async function anexarRastreabilidades(
  pdfBytes: Uint8Array | ArrayBuffer,
  documentos: string[] = [],
): Promise<{ bytes: Uint8Array; anexados: number; falhas: string[] }> {
  const marcadas = rastreabilidadesDoRelatorioAberto(documentos);
  const base = new Uint8Array(pdfBytes instanceof ArrayBuffer ? new Uint8Array(pdfBytes) : pdfBytes);
  if (marcadas.length === 0) return { bytes: base, anexados: 0, falhas: [] };

  const doc = await PDFDocument.load(base);
  let anexados = 0;
  const falhas: string[] = [];

  for (const r of marcadas) {
    // PDF marcado mas irrecuperável (nem no IndexedDB nem no Supabase): entra em
    // `falhas` para o usuário ser avisado — nunca some em silêncio.
    const pdf = await resolverPdf(r);
    if (!pdf) {
      falhas.push(r.nome || r.id);
      continue;
    }
    try {
      // ignoreEncryption: certificados oficiais costumam vir "protegidos" (sem senha de
      // abertura); sem a flag o pdf-lib recusa o arquivo inteiro.
      const anexo = await PDFDocument.load(base64ParaBytes(pdf), { ignoreEncryption: true });
      const paginas = await doc.copyPages(anexo, anexo.getPageIndices());
      for (const p of paginas) doc.addPage(p);
      anexados++;
    } catch (e) {
      console.error(`Rastreabilidade "${r.nome || r.id}": falha ao anexar o PDF ao relatório.`, e);
      falhas.push(r.nome || r.id);
    }
  }

  return { bytes: await doc.save(), anexados, falhas };
}
