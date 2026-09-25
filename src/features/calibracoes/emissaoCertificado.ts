import { ler } from '../../services/storage';
import { arquivoPendente, baixarFoto, blobParaDataUrl, salvarArquivo, type RefFoto } from '../../services/fotos';
import { baixarArtefato, sha256Hex } from '../relatorios/artefatoRelatorio';
import { calibIdDoDocumento } from '../relatorios/pdfVetorial/hostCertificado';
import {
  gerarCertificadoCalibracaoPdf,
  modeloCertificado,
  type EmpresaCertificado,
  type ImagensCertificado,
} from '../relatorios/pdfVetorial/certificadoCalibracao';
import { salvarCalibracao } from './calibracaoService';
import { artefatoDaCalibracao } from './artefatoCalibracao';
import { pendenciasEmissao } from './responsavelCalibracao';
import { ehInterna, type DadosCalibracao, type DadosCalibracaoInterna } from './tipos';

/**
 * Revisão do engenheiro, fase 2 (C.3) · o certificado de calibração EMITIDO é
 * um documento independente e imutável — a mesma regra do relatório
 * (§7-quater), aplicada à folha de calibração.
 *
 * ## O fluxo
 *
 *   rascunho → revisão (a folha na tela) → EMITIR:
 *     1. lê o registro que será carimbado (nada da meta de relatório nenhum);
 *     2. resolve a logo e a rubrica (cofre → bucket); cadastro que TEM a
 *        imagem e ela não veio = NÃO emite;
 *     3. desenha o certificado em VETOR (Fase 7, `certificadoCalibracao.ts`):
 *        texto real com Carlito, tabelas em linha; só logo, rubrica e selo
 *        são imagem. Até 25/09/2026 era a folha HTML fotografada pelo
 *        html2canvas numa página JPEG (~600 KB);
 *     4. SHA-256 dos bytes;
 *     5. grava no cofre local e sobe para `<org>/certificados-calibracao/<uuid>.pdf`
 *        (bucket privado `inspecao`, policy por organização — sem migration);
 *     6. só então grava o registro com `status: 'emitido'` e `emissao`.
 *
 * Falha em qualquer passo antes do 6 NÃO emite: o registro continua rascunho.
 *
 * ## Depois de emitido
 *
 * Visualizar, baixar, o Portal e o anexo ao relatório servem os BYTES
 * arquivados. Nada remonta o template. Trocar a logo da empresa ou a rubrica do
 * responsável depois não muda nada — a emissão guardou o arquivo, e
 * `emissao.logoRef`/`emissao.assinaturaRef` registram quais imagens ela usou.
 * `salvarCalibracao` recusa reescrever um emitido; corrigir é emitir uma
 * REVISÃO (registro novo com `substitui`).
 */
export const ESCOPO_CERTIFICADOS = 'certificados-calibracao';

export class EmissaoRecusada extends Error {
  motivos: string[];
  constructor(motivos: string[]) {
    super(motivos.join(' '));
    this.motivos = motivos;
    this.name = 'EmissaoRecusada';
  }
}

/** O selo do Inmetro da seção 5 (`/icon/imetro.webp`), convertido uma vez por sessão. */
let seloEmCache: Promise<string | null> | null = null;

/**
 * jsPDF só embute PNG e JPEG. Logo e rubrica podem ter chegado em WEBP (ou
 * outro formato do navegador): passam por um canvas, no tamanho natural, e
 * saem PNG — sem redimensionar (a proporção é lida dos bytes depois).
 *
 * `maxLado` só para o SELO (asset nosso): o arquivo tem 400 px de lado e é
 * desenhado com ~8 mm — metade do PDF inteiro era ele. Logo e rubrica do
 * cliente entram como foram enviadas.
 */
async function paraImagemPdf(dataUrl: string | null | undefined, maxLado?: number): Promise<string | null> {
  if (!dataUrl || !dataUrl.startsWith('data:image')) return null;
  if (!maxLado && /^data:image\/(png|jpe?g)[;,]/i.test(dataUrl)) return dataUrl;
  if (typeof document === 'undefined') return null;
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('imagem ilegível'));
      i.src = dataUrl;
    });
    const c = document.createElement('canvas');
    const escala = maxLado ? Math.min(1, maxLado / Math.max(img.naturalWidth, img.naturalHeight, 1)) : 1;
    c.width = Math.max(1, Math.round(img.naturalWidth * escala));
    c.height = Math.max(1, Math.round(img.naturalHeight * escala));
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  } catch {
    return null;
  }
}

async function imagemDaRef(ref: RefFoto | null | undefined): Promise<string | null> {
  if (!ref?.path) return null;
  try {
    const blob = await baixarFoto(ref);
    return blob ? await paraImagemPdf(await blobParaDataUrl(blob)) : null;
  } catch {
    return null;
  }
}

function seloInmetro(): Promise<string | null> {
  if (!seloEmCache) {
    seloEmCache = (async () => {
      try {
        const resp = await fetch('/icon/imetro.webp');
        if (!resp.ok) return null;
        // 160 px em ~8 mm ≈ 500 dpi: nítido no zoom e na impressão.
        return await paraImagemPdf(await blobParaDataUrl(await resp.blob()), 160);
      } catch {
        return null;
      }
    })();
    void seloEmCache.then((s) => {
      if (!s) seloEmCache = null;
    });
  }
  return seloEmCache;
}

type EmpresaComLogo = EmpresaCertificado & { logo?: string; logoRef?: RefFoto };

/**
 * As imagens do certificado e o que o cadastro PROMETE. Só lê: a empresa de
 * `nr13_minha_empresa` (a mesma fonte da folha avulsa — nunca a meta de um
 * relatório) e a rubrica congelada no `responsavel` do registro.
 */
export async function imagensDoCertificado(registro: DadosCalibracaoInterna): Promise<{
  empresa: EmpresaComLogo | null;
  imagens: ImagensCertificado;
  esperaLogo: boolean;
  esperaRubrica: boolean;
}> {
  const empresa = ler<EmpresaComLogo>('nr13_minha_empresa');
  const esperaLogo = !!(empresa?.logo || empresa?.logoRef?.path);
  const r = registro.responsavel;
  const esperaRubrica = !!(r?.assinaturaRef?.path || (r?.assinatura ?? '').startsWith('data:'));
  const [logo, rubrica, selo] = await Promise.all([
    empresa?.logo ? paraImagemPdf(empresa.logo) : imagemDaRef(empresa?.logoRef),
    r?.assinatura?.startsWith('data:') ? paraImagemPdf(r.assinatura) : imagemDaRef(r?.assinaturaRef),
    seloInmetro(),
  ]);
  return { empresa, imagens: { logo, rubrica, selo }, esperaLogo, esperaRubrica };
}

/**
 * Os bytes do certificado, montados do REGISTRO dado. Não grava nada.
 *
 * `registro` já vem com `status: 'emitido'`: o documento não leva a marca de
 * rascunho, e o que ele imprime é exatamente o que vai ser gravado.
 */
export async function gerarPdfCertificado(
  registro: DadosCalibracaoInterna,
): Promise<{ bytes: Uint8Array; paginas: number }> {
  if (!ehInterna(registro)) throw new EmissaoRecusada(['Este instrumento não tem modelo de certificado interno.']);
  const { empresa, imagens, esperaLogo, esperaRubrica } = await imagensDoCertificado(registro);
  const faltas: string[] = [];
  if (esperaLogo && !imagens.logo) faltas.push('A logo da empresa não carregou.');
  if (esperaRubrica && !imagens.rubrica) faltas.push('A assinatura do responsável não carregou.');
  if (faltas.length) throw new EmissaoRecusada([...faltas, 'Nada foi emitido — tente de novo com conexão.']);
  const r = await gerarCertificadoCalibracaoPdf(modeloCertificado(registro, empresa), imagens);
  return { bytes: r.bytes, paginas: r.paginas };
}

/**
 * A PRÉVIA do rascunho: o MESMO desenho da emissão, com a marca "RASCUNHO —
 * NÃO EMITIDO". Leitura pura — não grava registro, não publica arquivo e não
 * toca `nr13_relatorio_meta_atual`, `nr13_inspecao_atual` nem
 * `nr13_injecao_atual` (é o que a folha HTML no palco fazia). Imagem que não
 * veio sai em branco: é prévia, e o aviso de falta fica para a emissão.
 */
export async function gerarPreviaCertificado(cal: DadosCalibracaoInterna): Promise<{ bytes: Uint8Array; paginas: number }> {
  const { empresa, imagens } = await imagensDoCertificado(cal);
  const r = await gerarCertificadoCalibracaoPdf(modeloCertificado(cal, empresa), imagens);
  return { bytes: r.bytes, paginas: r.paginas };
}

/**
 * EMITE: gera, arquiva e só então carimba. Devolve o registro emitido.
 * Recusa (sem gravar nada) com `EmissaoRecusada` e os motivos.
 */
export async function emitirCertificado(tag: string, cal: DadosCalibracao): Promise<DadosCalibracaoInterna> {
  if (!ehInterna(cal)) throw new EmissaoRecusada(pendenciasEmissao(cal));
  const motivos = pendenciasEmissao(cal);
  if (motivos.length) throw new EmissaoRecusada(motivos);

  // A data de emissão É a da emissão — não se digita (reestruturação 19/09/2026).
  const aEmitir: DadosCalibracaoInterna = {
    ...cal,
    origem: 'interna',
    status: 'emitido',
    dataEmissao: new Date().toLocaleDateString('pt-BR'),
  };
  delete (aEmitir as { emissao?: unknown }).emissao;
  const { bytes, paginas } = await gerarPdfCertificado(aEmitir);
  const sha256 = await sha256Hex(bytes);
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' });
  const pdfRef = await salvarArquivo(blob, ESCOPO_CERTIFICADOS, 'pdf', 'application/pdf');
  const pendente = await arquivoPendente(pdfRef.path);
  const empresa = ler<{ logoRef?: RefFoto }>('nr13_minha_empresa');

  const emitido: DadosCalibracaoInterna = {
    ...aEmitir,
    emissao: {
      pdfRef,
      sha256,
      emitidoEm: new Date().toISOString(),
      paginas,
      pendente,
      logoRef: empresa?.logoRef?.path ? empresa.logoRef : null,
      assinaturaRef: cal.responsavel?.assinaturaRef?.path ? cal.responsavel.assinaturaRef : null,
    },
  };
  await salvarCalibracao(tag, emitido, { permitirEmissao: true });
  return emitido;
}

/**
 * Os bytes ARQUIVADOS de uma folha `?calibId=` do relatório, quando aquela
 * calibração foi emitida. `null` = não emitida (legado): o chamador monta a
 * folha como sempre montou.
 *
 * Lê o snapshot congelado na meta do relatório antes do registro vivo (§7-bis).
 * Arquivo indisponível ou com hash diferente do gravado LANÇA — o chamador põe
 * a folha em `falhas`. Cair no template seria regenerar um documento emitido.
 */
export async function bytesArquivadosDaFolha(documento: string): Promise<Uint8Array | null> {
  const id = calibIdDoDocumento(documento);
  if (!id) return null;
  const meta = ler<{ certCalibracoes?: Record<string, DadosCalibracao> }>('nr13_relatorio_meta_atual');
  const cal = meta?.certCalibracoes?.[id] ?? ler<DadosCalibracao>(`nr13_calibracao_item_${id}`);
  const arte = artefatoDaCalibracao(cal);
  if (!arte) return null;
  const blob = await baixarArtefato(arte);
  if (!blob) throw new Error(`o certificado emitido ${id} não está disponível (offline e sem cópia local?)`);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (arte.sha256 && (await sha256Hex(bytes)) !== arte.sha256) {
    throw new Error(`o arquivo do certificado ${id} não confere com o SHA-256 da emissão`);
  }
  return bytes;
}
