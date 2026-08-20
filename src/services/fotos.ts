/**
 * Fotos: arquivo no Supabase Storage, referência leve no banco.
 *
 * ANTES desta mudança, toda foto virava base64 e era gravada dentro do próprio
 * registro do `app_storage`. O custo apareceu em dois lugares, os dois medidos
 * em produção em 10/08/2026:
 *
 *   - `nr13_fotos_` sozinho ocupava 3.902 KB da conta `cmam.caldeiras`, e uma
 *     conta com UM equipamento cadastrado (`engyuricesar`) pesava 6,4 MB;
 *   - o egress da organização bateu 6,1 GB contra um limite de 5 GB, porque
 *     cada abertura do app baixava a conta inteira — fotos inclusas.
 *
 * Base64 ainda por cima INFLA o arquivo em ~33%, e o banco não sabe servir
 * imagem com cache. O lugar de arquivo é o bucket.
 *
 * O que vai para o `app_storage` agora é só isto:
 *
 *   { bucket: 'inspecao', path: '<org>/<tag>/<uuid>.jpg', mimeType, tamanho }
 *
 * URL assinada NÃO é persistida: ela expira, e um link morto gravado no banco
 * seria pior que nenhum link. Ela é pedida na hora de exibir e cacheada em
 * memória.
 *
 * COMPATIBILIDADE: nada de foto antiga é migrado ou apagado. Onde havia base64,
 * o base64 continua e continua sendo exibido — ver `resolverFoto`.
 */
import { supabase, escopoStorageAtual } from './supabase';
import * as cofre from './fotoStore';
import {
  comprimirParaBlob,
  gerarMiniatura,
  PRINCIPAL_ALTURA,
  PRINCIPAL_LARGURA,
  PRINCIPAL_QUALIDADE,
} from './imagem';
import { ehCliente } from './papelSessao';

export const BUCKET = 'inspecao';

/** O que fica gravado no banco no lugar da imagem. */
export interface RefFoto {
  bucket: string;
  path: string;
  mimeType: string;
  /** Bytes do arquivo enviado (não do base64). */
  tamanho: number;
  /**
   * MINIATURA (Fase 5) — 400 px, para card, lista e galeria. **Opcional**:
   * ausente em toda foto anterior a 20/08/2026 e em toda foto cuja miniatura
   * falhou, e nesses casos o consumidor cai na principal.
   *
   * É um OBJETO com a mesma forma da referência principal, e não um campo
   * `thumbPath: string`. O motivo é a Edge `portal_arquivo`: ela autoriza por
   * FORMA — `coletarPaths` varre o JSON e recolhe todo objeto que tenha `path`.
   * Uma string solta não seria recolhida, o conjunto autorizado não conteria a
   * miniatura, e o Portal responderia `nao_disponivel` para ela. Como objeto, a
   * miniatura herda exatamente a mesma autorização da principal, **sem deploy
   * de Edge e sem exceção de policy**.
   */
  thumb?: {
    bucket: string;
    path: string;
    mimeType: string;
    tamanho: number;
  };
}

/** Qual variante da foto o consumidor quer. `cheia` é sempre o padrão. */
export type VarianteFoto = 'cheia' | 'thumb';

/** Uma foto vinda do banco: nova (ref) ou legada (base64 na string). */
export interface FotoArmazenada {
  ref?: RefFoto;
  /** LEGADO: base64 das fotos gravadas antes desta mudança. Novas nascem ''. */
  base64?: string;
}

export function ehRef(v: unknown): v is RefFoto {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r.path === 'string' && r.path.length > 0 && typeof r.bucket === 'string';
}

/** Foto legada = string base64/dataURL não vazia. */
export function ehBase64(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('data:');
}

// ---------------------------------------------------------------------------
// Caminho no bucket
// ---------------------------------------------------------------------------
/**
 * `<org_id>/<escopo>/<uuid>.jpg`.
 *
 * A primeira pasta É a organização porque a policy do bucket compara
 * exatamente `storage.foldername(name)[1]` com `org_atual()`. Mudar essa
 * posição desliga o isolamento entre clientes.
 *
 * Nome UUID e imutável: sobrescrever um caminho existente deixaria a imagem
 * antiga em cache do navegador e do CDN, e a foto trocada continuaria
 * aparecendo como a anterior.
 */
/**
 * Nome de pasta seguro para o bucket.
 *
 * Existe como função só para poder ser TESTADA: a mesma linha estava inline em
 * dois lugares e numa delas o `\w` perdeu a barra, virando `[^w.-]`. O efeito
 * foi silencioso e permanente — "assinaturas" virou "_", e as rubricas foram
 * parar numa pasta chamada `_`. Nada quebra, mas o bucket fica ilegível.
 */
export function pastaSegura(escopo: string): string {
  return (escopo || 'geral').replace(/[^\w.-]+/g, '_').slice(0, 60) || 'geral';
}

export function montarPath(orgId: string, escopo: string, ext = 'jpg'): string {
  const limpo = pastaSegura(escopo);
  return `${orgId}/${limpo}/${crypto.randomUUID()}.${ext}`;
}

/**
 * Caminho IRMÃO da miniatura: `<uuid>.jpg` → `<uuid>.thumb.jpg`.
 *
 * Irmão, e não uma subpasta `thumbs/`, porque a policy do bucket compara
 * `storage.foldername(name)[1]` com a organização. Manter as duas na MESMA
 * pasta faz a miniatura herdar a policy da principal sem alteração nenhuma de
 * SQL (I-22). Derivar da principal em vez de sortear um uuid novo também dá de
 * graça: dado o caminho de uma, sabe-se o da outra.
 */
export function caminhoDaMiniatura(path: string): string {
  return `${path.replace(/\.[^./]+$/, '')}.thumb.jpg`;
}

async function orgAtual(): Promise<string | null> {
  const escopo = await escopoStorageAtual();
  return escopo?.id ?? null;
}

// ---------------------------------------------------------------------------
// Gravação
// ---------------------------------------------------------------------------
/**
 * Recebe o arquivo do input, devolve a referência que deve ser gravada.
 *
 * O caminho é definido AQUI, antes de qualquer rede, e não muda depois. Assim o
 * registro pode ser salvo imediatamente — com o path definitivo — mesmo que o
 * upload só aconteça horas depois, quando o celular voltar a ter sinal.
 *
 * O blob vai para o cofre local ANTES da tentativa de upload. Se a rede cair no
 * meio, a foto está preservada e a pendência é retomada sozinha.
 */
export async function salvarFoto(
  file: File,
  escopo: string,
  opcoes: { larguraMax?: number; qualidade?: number } = {},
): Promise<RefFoto> {
  const blob = await comprimirParaBlob(
    file,
    opcoes.larguraMax ?? PRINCIPAL_LARGURA,
    opcoes.qualidade ?? PRINCIPAL_QUALIDADE,
    PRINCIPAL_ALTURA,
  );
  // A PRINCIPAL É SALVA E DEVOLVIDA ANTES DE QUALQUER COISA (D-18). Deste ponto
  // em diante nada pode desfazer a foto que o inspetor acabou de tirar.
  const ref = await salvarArquivo(blob, escopo, 'jpg', 'image/jpeg');
  return (await anexarMiniatura(ref, blob)) ?? ref;
}

/**
 * Acrescenta a miniatura à referência — **best-effort, nunca atômico** (D-18).
 *
 * A atomicidade aqui protegeria a coisa errada. O invariante I-01 (dado + fila
 * na mesma transação) existe porque dado sem fila nunca sobe e fila sem dado
 * sobe lixo: os dois lados são necessários para a correção. Aqui não: a
 * principal sozinha é um estado COMPLETO, indistinguível do de toda foto tirada
 * antes desta fase. A miniatura é acelerador.
 *
 * Exigir atomicidade inverteria a prioridade: um erro ao rasterizar — canvas sem
 * memória, imagem exótica, aba em segundo plano no celular — faria **perder a
 * foto de campo**, que é o único desfecho inaceitável do sistema inteiro.
 *
 * Devolve `null` em qualquer falha, e quem chamou fica com a referência
 * principal, que é válida e é o que as fotos antigas sempre foram.
 *
 * A miniatura sai da PRINCIPAL, não do arquivo original: 1200 px decodifica
 * muito mais barato que 4032 px num celular, a orientação já vem resolvida do
 * primeiro passo, e a 400 px a recompressão não é distinguível.
 */
async function anexarMiniatura(ref: RefFoto, principal: Blob): Promise<RefFoto | null> {
  try {
    const mini = await gerarMiniatura(principal);
    const refMini = await guardarEEnviar(caminhoDaMiniatura(ref.path), mini, 'image/jpeg');
    return { ...ref, thumb: refMini };
  } catch {
    // Registro sem miniatura é válido, esperado, e já exercitado por todas as
    // fotos anteriores a esta fase. Só não pode custar a foto.
    return null;
  }
}

/**
 * Sobe um arquivo QUALQUER pelo mesmo caminho da foto — mesma pasta por
 * organização, mesmo cofre local, mesma fila de reenvio.
 *
 * Existe porque o certificado PDF de rastreabilidade tinha exatamente o
 * problema que as fotos tinham: `pdfBase64` ia inteiro para o `app_storage` e
 * era rebaixado a cada hidratação (5.451 KB e 1.941 KB em dois registros da
 * conta `gabriel.dadona`, medidos em 11/08/2026). Reaproveitar esta fila, em vez
 * de escrever uma segunda, dá ao PDF de graça o que a foto já tem: gravação
 * offline, retomada automática ao voltar a rede e contagem na tela de
 * pendências.
 *
 * O blob vai para o cofre local ANTES da tentativa de upload: se a rede cair no
 * meio, o arquivo está preservado e a pendência é retomada sozinha.
 */
export async function salvarArquivo(
  blob: Blob,
  escopo: string,
  ext: string,
  mimeType: string,
): Promise<RefFoto> {
  const org = await orgAtual();
  if (!org) throw new Error('sem organização ativa: entre novamente para anexar arquivos');

  return guardarEEnviar(montarPath(org, escopo, ext), blob, mimeType);
}

/**
 * Cofre primeiro, upload depois — para um caminho JÁ DECIDIDO.
 *
 * Separada de `salvarArquivo` porque a miniatura não sorteia caminho: ela é
 * irmã da principal (`caminhoDaMiniatura`). O comportamento é o mesmo dos dois
 * lados, e é o que faz a foto sobreviver à rede.
 */
async function guardarEEnviar(path: string, blob: Blob, mimeType: string): Promise<RefFoto> {
  const ref: RefFoto = { bucket: BUCKET, path, mimeType, tamanho: blob.size };

  await cofre.guardar({
    path,
    blob,
    mimeType,
    pendente: true,
    criadoEm: new Date().toISOString(),
    tentativas: 0,
  });

  // Tenta subir na hora. Falhar aqui é normal (campo sem sinal) e não é erro
  // para o usuário: o arquivo já está salvo e a fila cuida do resto.
  await enviarPendente(path).catch(() => {});
  return ref;
}

/**
 * Sobe um arquivo cujo NOME é o hash do próprio conteúdo.
 *
 * É o que dá imutabilidade e deduplicação de uma vez só, e por isso a rubrica do
 * Livro de Registro usa este caminho (ver `livroAssinatura.ts`):
 *
 *  - conteúdo igual → path igual → UM arquivo no bucket, N referências. A mesma
 *    rubrica em 20 entradas do livro custa 20 referências de ~150 bytes, não 20
 *    cópias de 55 KB.
 *  - conteúdo diferente → path diferente. Trocar a assinatura no cadastro cria
 *    um arquivo NOVO; o antigo continua onde está, então a entrada de 2024 segue
 *    exibindo a rubrica de 2024. A imutabilidade histórica não depende de
 *    ninguém lembrar de preservá-la — ela é consequência do endereço.
 *
 * `upsert: true` é seguro justamente porque o conteúdo é o mesmo: reescrever
 * um arquivo por outro byte a byte idêntico não muda nada.
 */
export async function salvarArquivoPorConteudo(
  blob: Blob,
  escopo: string,
  ext: string,
  mimeType: string,
): Promise<RefFoto> {
  const org = await orgAtual();
  if (!org) throw new Error('sem organização ativa: entre novamente para anexar arquivos');

  const hash = await sha256Hex(await blob.arrayBuffer());
  const limpo = pastaSegura(escopo);
  const path = `${org}/${limpo}/${hash}.${ext}`;
  const ref: RefFoto = { bucket: BUCKET, path, mimeType, tamanho: blob.size };

  await cofre.guardar({
    path, blob, mimeType, pendente: true,
    criadoEm: new Date().toISOString(), tentativas: 0,
  });
  await enviarPendente(path).catch(() => {});
  return ref;
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('crypto.subtle indisponível: exige contexto seguro (https)');
  const d = await subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Sobe UMA foto pendente. Só marca como enviada depois da confirmação. */
async function enviarPendente(path: string): Promise<boolean> {
  const local = await cofre.obter(path);
  if (!local) return false;
  if (!local.pendente) return true;

  try {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, local.blob, { contentType: local.mimeType, upsert: true });
    if (error) {
      await cofre.registrarFalha(path, error.message);
      return false;
    }
    await cofre.marcarEnviada(path);
    return true;
  } catch (erro) {
    await cofre.registrarFalha(path, erro instanceof Error ? erro.message : String(erro));
    return false;
  }
}

/**
 * Drena a fila de fotos. Chamada ao voltar a rede e quando a aba reaparece —
 * no celular a conexão volta com o app em segundo plano e nenhum evento
 * `online` chega à página.
 */
export async function drenarFotosPendentes(): Promise<{ enviadas: number; pendentes: number }> {
  let enviadas = 0;
  const pendentes = await cofre.listarPendentes();
  for (const foto of pendentes) {
    if (await enviarPendente(foto.path)) enviadas++;
  }
  return { enviadas, pendentes: pendentes.length - enviadas };
}

/**
 * O arquivo já foi CONFIRMADO no servidor?
 *
 * `salvarArquivo` engole a falha de upload de propósito — para foto tirada em
 * campo isso é certo: o arquivo está no cofre e a fila reenvia. Mas quem grava
 * um REGISTRO que aponta para o arquivo precisa saber a verdade, senão marca
 * como "salvo e sincronizado" um documento que nunca chegou ao bucket. Foi o que
 * aconteceu no teste de falha de upload em 11/08/2026: o relatório nasceu com
 * `pdfPendente: false` e `pdfRef` apontando para um arquivo inexistente.
 *
 * `true` = ainda pendente (ou desconhecido, que é o lado seguro para reportar).
 */
export async function arquivoPendente(path: string): Promise<boolean> {
  try {
    const local = await cofre.obter(path);
    return local ? local.pendente : true;
  } catch {
    return true;
  }
}

export async function contarFotosPendentes(): Promise<number> {
  try {
    return (await cofre.listarPendentes()).length;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------
/**
 * URLs assinadas vivem em memória, nunca no banco: elas expiram, e um link
 * morto gravado num registro seria pior que link nenhum. A margem de 5 min
 * evita entregar uma URL que vence no meio do carregamento da imagem.
 */
const URL_TTL_S = 3600;
const MARGEM_MS = 5 * 60 * 1000;
const assinadas = new Map<string, { url: string; expiraEm: number }>();
const objetos = new Map<string, string>();

export function limparCacheDeUrls(): void {
  for (const url of objetos.values()) URL.revokeObjectURL(url);
  objetos.clear();
  assinadas.clear();
}

/**
 * TTL da URL que a Edge do Portal emite. Menor que o do sistema interno de
 * propósito — ver o comentário em `supabase/functions/portal_arquivo/index.ts`.
 * Precisa acompanhar o `TTL_S` de lá; se divergirem, o cache local guardaria uma
 * URL já vencida e a imagem quebraria de forma intermitente.
 */
const URL_TTL_PORTAL_S = 300;
/** Margem menor, proporcional ao TTL: 5 min de margem num TTL de 5 min zeraria o cache. */
const MARGEM_PORTAL_MS = 30 * 1000;

/**
 * URL do arquivo para uma conta de CLIENTE, emitida pela Edge `portal_arquivo`.
 *
 * O cliente não fala com o Storage direto: desde a Fase 0-B a policy do bucket
 * recusa leitura para `papel='cliente'` (D-04), e a Edge é quem confere se o
 * caminho pedido está referenciado por algum recurso daquele cliente (D-05).
 *
 * NÃO existe fallback para o SDK aqui, e isso é deliberado: cair no SDK
 * mascararia a recusa enquanto a policy antiga ainda permitisse, e o defeito só
 * apareceria no dia em que o SQL fosse aplicado — que é exatamente o momento em
 * que menos se quer descobrir uma surpresa.
 */
async function urlAssinadaPortal(path: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('portal_arquivo', { body: { path } });
    if (error) return null;
    const url = (data as { url?: unknown } | null)?.url;
    return typeof url === 'string' && url ? url : null;
  } catch {
    return null;
  }
}

async function urlAssinada(path: string): Promise<string | null> {
  const cacheado = assinadas.get(path);
  if (cacheado && cacheado.expiraEm > Date.now()) return cacheado.url;

  if (ehCliente()) {
    const url = await urlAssinadaPortal(path);
    if (!url) return null;
    assinadas.set(path, { url, expiraEm: Date.now() + URL_TTL_PORTAL_S * 1000 - MARGEM_PORTAL_MS });
    return url;
  }

  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, URL_TTL_S);
    if (error || !data?.signedUrl) return null;
    assinadas.set(path, { url: data.signedUrl, expiraEm: Date.now() + URL_TTL_S * 1000 - MARGEM_MS });
    return data.signedUrl;
  } catch {
    return null;
  }
}

/**
 * Devolve algo que um `<img src>` consegue exibir, na ordem que custa menos:
 *
 *   1. blob local (instantâneo, funciona offline, egress zero);
 *   2. URL assinada do bucket;
 *   3. base64 legado, para as fotos gravadas antes desta mudança.
 *
 * `null` quando não há nada — a UI decide o que mostrar no lugar, e nunca uma
 * imagem quebrada.
 */
export async function resolverFoto(
  foto: FotoArmazenada | string | null | undefined,
  opcoes: { variante?: VarianteFoto } = {},
): Promise<string | null> {
  if (!foto) return null;
  if (typeof foto === 'string') return ehBase64(foto) ? foto : null;

  if (foto.ref?.path) {
    // Miniatura quando ela existe E foi pedida. Sem miniatura — foto antiga, ou
    // foto cuja miniatura falhou — cai na principal, que é o comportamento de
    // sempre. Nenhuma tela precisa saber a diferença.
    if (opcoes.variante === 'thumb' && foto.ref.thumb?.path) {
      const url = await resolverMiniatura(foto.ref.thumb.path);
      // Miniatura ainda não enviada por este aparelho e ausente no bucket: cai
      // na principal em vez de mostrar moldura vazia.
      if (url) return url;
    }
    const url = await resolverCaminho(foto.ref.path);
    if (url) return url;
  }

  return ehBase64(foto.base64) ? (foto.base64 as string) : null;
}

/**
 * Como `resolverCaminho`, mas GUARDA NO COFRE o que baixou (achado N-01).
 *
 * O defeito medido em 20/08/2026: `resolverFoto` e `baixarFoto` leem o cofre e,
 * quando não acham, usam a URL assinada — sem nunca gravar o blob de volta. O
 * cofre só era preenchido por quem CAPTUROU a foto. E o cache HTTP não cobria a
 * falta, porque cada assinatura gera um `?token=` novo e a URL nunca casa com a
 * entrada anterior. Resultado medido: duas recargas seguidas da mesma galeria
 * baixaram as mesmas 1.152,3 KB. Quem pagava era o computador do escritório —
 * que nunca tirou foto nenhuma e é onde a documentação é montada.
 *
 * **Só a miniatura entra aqui.** Cachear a principal por download encheria o
 * disco do escritório com o parque inteiro a 115 KB por foto, para servir uma
 * tela que já resolve com 16 KB. A principal continua sob demanda.
 *
 * `pendente: false` porque o arquivo JÁ ESTÁ no servidor — foi de lá que ele
 * veio. Marcar como pendente colocaria na fila um upload do que já existe.
 *
 * Falhar aqui não pode custar a exibição: qualquer erro devolve a URL assinada,
 * que é exatamente o comportamento de antes desta mudança.
 */
async function resolverMiniatura(path: string): Promise<string | null> {
  const jaCriado = objetos.get(path);
  if (jaCriado) return jaCriado;
  try {
    const local = await cofre.obter(path);
    if (local) {
      const url = URL.createObjectURL(local.blob);
      objetos.set(path, url);
      return url;
    }
  } catch {
    // cofre indisponível: segue para o bucket
  }

  const assinada = await urlAssinada(path);
  if (!assinada) return null;
  try {
    const resp = await fetch(assinada);
    if (!resp.ok) return assinada;
    const blob = await resp.blob();
    try {
      await cofre.guardar({
        path,
        blob,
        mimeType: blob.type || 'image/jpeg',
        pendente: false,
        criadoEm: new Date().toISOString(),
        tentativas: 0,
      });
    } catch {
      // sem espaço ou cofre indisponível: a imagem aparece do mesmo jeito
    }
    const url = URL.createObjectURL(blob);
    objetos.set(path, url);
    return url;
  } catch {
    return assinada;
  }
}

/** Blob local (instantâneo, offline, egress zero) → URL assinada → `null`. */
async function resolverCaminho(path: string): Promise<string | null> {
  const jaCriado = objetos.get(path);
  if (jaCriado) return jaCriado;
  try {
    const local = await cofre.obter(path);
    if (local) {
      const url = URL.createObjectURL(local.blob);
      objetos.set(path, url);
      return url;
    }
  } catch {
    // cofre indisponível: segue para o bucket
  }
  return urlAssinada(path);
}

/**
 * Bytes da imagem para quem precisa do arquivo em si (geração de PDF, palco dos
 * templates). Prefere o cofre local; sem ele, baixa do bucket.
 */
export async function baixarFoto(ref: RefFoto): Promise<Blob | null> {
  try {
    const local = await cofre.obter(ref.path);
    if (local) return local.blob;
  } catch {
    // segue para o bucket
  }

  // Cliente do Portal: pela URL que a Edge emite, nunca por `storage.download`
  // — que a policy da Fase 0-B recusa para este papel. O cofre acima continua
  // valendo e é tentado primeiro, como para todo mundo.
  if (ehCliente()) {
    const url = await urlAssinada(ref.path);
    if (!url) return null;
    try {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      return await resp.blob();
    } catch {
      return null;
    }
  }

  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(ref.path);
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

/** Blob → dataURL. Só para os templates HTML, que exigem `src` embutido. */
export function blobParaDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('falha ao ler a imagem'));
    r.readAsDataURL(blob);
  });
}

// ---------------------------------------------------------------------------
// Remoção
// ---------------------------------------------------------------------------
/**
 * Apaga o arquivo do bucket e a cópia local.
 *
 * Erro no bucket NÃO impede a remoção local nem deve travar a tela: o registro
 * que apontava para a foto já saiu, e um arquivo órfão custa bytes, não
 * correção. O contrário — manter a foto na tela porque a rede falhou — seria
 * mentir para o usuário.
 */
export async function removerFoto(ref: RefFoto | undefined | null): Promise<void> {
  if (!ref?.path) return;
  // A miniatura vai junto: ela não tem existência própria, é uma projeção da
  // principal. Deixá-la para trás criaria órfão a cada exclusão.
  const caminhos = [ref.path, ...(ref.thumb?.path ? [ref.thumb.path] : [])];

  for (const path of caminhos) {
    assinadas.delete(path);
    const objeto = objetos.get(path);
    if (objeto) {
      URL.revokeObjectURL(objeto);
      objetos.delete(path);
    }
  }
  try {
    await supabase.storage.from(BUCKET).remove(caminhos);
  } catch {
    // arquivo órfão no bucket é aceitável; perder a ação do usuário não é
  }
  for (const path of caminhos) {
    try {
      await cofre.remover(path);
    } catch {
      // idem
    }
  }
}

// ---------------------------------------------------------------------------
// Drenagem automática
// ---------------------------------------------------------------------------
let listenersRegistrados = false;
export function registrarDrenagemDeFotos(): void {
  if (listenersRegistrados || typeof window === 'undefined') return;
  listenersRegistrados = true;
  const tentar = () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    void drenarFotosPendentes();
  };
  window.addEventListener('online', tentar);
  document.addEventListener?.('visibilitychange', () => {
    if (document.visibilityState === 'visible') tentar();
  });
}
registrarDrenagemDeFotos();
