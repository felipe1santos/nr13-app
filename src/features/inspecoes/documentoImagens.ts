/**
 * O DOCUMENTO AVULSO do Relatório de Imagens (Fase 5, 24/09/2026).
 *
 * Junta três coisas e entrega ao gerador (`pdfVetorial/relatorioImagens.ts`):
 *
 * 1. **as fotos do container**, na ORDEM gravada, com a descrição de cada uma
 *    (`normalizarFotos`). A imagem vem do cofre local primeiro e do bucket
 *    depois (`baixarFoto`) — offline, com a foto no cofre, o documento sai;
 * 2. **a identificação do equipamento**, lida da FICHA pelo mesmo
 *    `montarModeloRelatorio` do relatório NR-13 — nada foi copiado para o
 *    ensaio, então nada envelhece;
 * 3. **a empresa executante** (logo, razão, endereço), pelo mesmo modelo.
 *
 * ## Foto que não carrega PARA a geração
 *
 * O relatório NR-13 descarta a foto que não resolve e segue. Aqui não dá: a
 * numeração "Foto 01…" é derivada da ordem, e pular uma foto renumeraria as
 * seguintes — a descrição "Foto 04" do técnico viraria a "Foto 03" do papel.
 * Então a geração recusa, dizendo QUAL foto faltou.
 *
 * ## O que ele NÃO faz
 *
 * Não arquiva, não grava `pdfRef`, não calcula SHA oficial — como os outros
 * documentos avulsos de ensaio. A regra de emissão (≥1 foto, todas descritas)
 * é cobrada na tela antes de Baixar/Imprimir (`pendenciasParaEmissao`).
 */
import { baixarFoto, blobParaDataUrl } from '../../services/fotos';
import { gravarMetaAtual } from '../relatorios/relatoriosService';
import type { RelatorioMeta } from '../relatorios/tipos';
import { montarModeloRelatorio, medirFotos, type FotoModelo } from '../relatorios/pdfVetorial/modelo';
import {
  gerarRelatorioImagensPdf,
  type ResultadoRelatorioImagens,
} from '../relatorios/pdfVetorial/relatorioImagens';
import { carregarContainer } from './inspecaoService';
import { normalizarFotos, rotuloFoto, type FotoDescrita } from './fotosDescritas';

export class FotoIndisponivelErro extends Error {
  readonly rotulos: string[];
  constructor(rotulos: string[]) {
    super(
      `${rotulos.join(', ')} não ${rotulos.length === 1 ? 'pôde' : 'puderam'} ser carregada${rotulos.length === 1 ? '' : 's'} ` +
        '(sem cópia neste aparelho e sem conexão com o servidor). O documento não foi gerado para não renumerar as fotos.',
    );
    this.name = 'FotoIndisponivelErro';
    this.rotulos = rotulos;
  }
}

async function imagemDaFoto(f: FotoDescrita): Promise<string | null> {
  if (f.base64 && f.base64.startsWith('data:image')) return f.base64;
  if (!f.ref) return null;
  try {
    const blob = await baixarFoto(f.ref);
    return blob ? await blobParaDataUrl(blob) : null;
  } catch {
    return null;
  }
}

function dataBrDoIso(v: unknown): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v)) return null;
  const [a, m, d] = v.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export async function gerarDocumentoImagens(tag: string, containerId: string): Promise<ResultadoRelatorioImagens> {
  const container = carregarContainer(tag, containerId);
  const dados = (container?.dados.imagens ?? {}) as { dataRegistro?: string; observacoes?: string; fotos?: unknown };
  const fotos = normalizarFotos(dados.fotos);
  // Documento de imagens sem imagem não existe — nem como prévia. Capa sozinha
  // passaria por documento pronto num olhar rápido.
  if (fotos.length === 0) {
    throw new Error('Nenhuma imagem adicionada. Adicione ao menos uma imagem para gerar o documento.');
  }

  const imagens = await Promise.all(fotos.map(imagemDaFoto));
  const faltando = imagens.flatMap((img, i) => (img ? [] : [rotuloFoto(i)]));
  if (faltando.length > 0) throw new FotoIndisponivelErro(faltando);

  // Proporção medida dos bytes (contain sem esticar). `medirFotos` descarta a
  // que o navegador não decodifica — o que também renumeraria, então confere.
  const medidas = await medirFotos(
    fotos.map((f, i): FotoModelo => ({ dataUrl: imagens[i] as string, descricao: f.descricao })),
  );
  if (medidas.length !== fotos.length) {
    const ok = new Set(medidas.map((m) => m.dataUrl));
    throw new FotoIndisponivelErro(fotos.flatMap((_, i) => (ok.has(imagens[i] as string) ? [] : [rotuloFoto(i)])));
  }

  // A meta vai VAZIA (só a origem): `nr13_relatorio_meta_atual` é chave viva, e
  // sem isso a empresa sairia do snapshot do último relatório aberto. Mesmo
  // cuidado de `documentoVetorial.ts`.
  await gravarMetaAtual({ containerOrigemId: containerId } as RelatorioMeta);
  const m = montarModeloRelatorio(tag);

  let logo = m.empresa.logo;
  if (!logo && m.empresa.logoRef) {
    try {
      const blob = await baixarFoto(m.empresa.logoRef);
      logo = blob ? await blobParaDataUrl(blob) : null;
    } catch {
      logo = null;
    }
  }

  const eq = m.equipamento;
  return gerarRelatorioImagensPdf({
    tag,
    identificacao: [
      { rotulo: 'IDENTIFICAÇÃO / T.A.G.', valor: tag },
      { rotulo: 'TIPO DE EQUIPAMENTO', valor: eq['TIPO DE EQUIPAMENTO'] },
      { rotulo: 'FABRICANTE', valor: eq.FABRICANTE },
      { rotulo: 'NÚMERO DE SÉRIE', valor: eq['NÚMERO DE SÉRIE'] },
      { rotulo: 'LOCAL DA INSTALAÇÃO', valor: eq['LOCAL DA INSTALAÇÃO'] },
      { rotulo: 'CLIENTE', valor: m.cliente },
      { rotulo: 'INSPEÇÃO', valor: container?.nome ?? null },
      { rotulo: 'DATA DO REGISTRO', valor: dataBrDoIso(dados.dataRegistro) },
      { rotulo: 'QUANTIDADE DE IMAGENS', valor: String(fotos.length) },
    ],
    observacoes: typeof dados.observacoes === 'string' ? dados.observacoes : '',
    fotos: medidas.map((f) => ({ dataUrl: f.dataUrl, descricao: f.descricao, proporcao: f.proporcao })),
    empresa: { razao: m.empresa.razao, endereco: m.empresa.endereco, contato: m.empresa.contato, logo },
  });
}
