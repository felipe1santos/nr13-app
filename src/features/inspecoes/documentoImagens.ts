/**
 * O DOCUMENTO AVULSO do Relatório de Imagens (Fase 5, 24/09/2026).
 *
 * Junta três coisas e entrega ao gerador (`pdfVetorial/relatorioImagens.ts`):
 *
 * 1. **as fotos do container**, na ORDEM gravada, com a descrição de cada uma
 *    (`normalizarFotos`), prontas pela `prepararFotosDescritas` — a MESMA porta
 *    que a seção 8.4 do relatório completo usa (Fase 5.2). A imagem vem do
 *    cofre local primeiro e do bucket depois: offline, com a foto no cofre, o
 *    documento sai;
 * 2. **a identificação do equipamento**, lida da FICHA pelo mesmo
 *    `montarModeloRelatorio` do relatório NR-13 — nada foi copiado para o
 *    ensaio, então nada envelhece;
 * 3. **a empresa executante** (logo, razão, endereço), pelo mesmo modelo.
 *
 * Foto que não carrega PARA a geração nomeando a foto (`FotoIndisponivelErro`):
 * pular renumeraria as seguintes.
 *
 * ## O que ele NÃO faz
 *
 * Não arquiva, não grava `pdfRef`, não calcula SHA oficial — como os outros
 * documentos avulsos de ensaio. A regra de emissão (≥1 foto, todas descritas)
 * é cobrada na tela antes de Baixar/Imprimir (`pendenciasParaEmissao`). E não
 * grava chave viva nenhuma (Fase 5.1): as fontes vão entregues ao modelo.
 */
import { baixarFoto, blobParaDataUrl } from '../../services/fotos';
import { montarModeloRelatorio } from '../relatorios/pdfVetorial/modelo';
import {
  gerarRelatorioImagensPdf,
  prepararFotosDescritas,
  type ResultadoRelatorioImagens,
} from '../relatorios/pdfVetorial/relatorioImagens';
import { carregarContainer } from './inspecaoService';
import { normalizarFotos } from './fotosDescritas';

export { FotoIndisponivelErro } from '../relatorios/pdfVetorial/relatorioImagens';

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

  const desenho = await prepararFotosDescritas(fotos);

  // Fase 5.1 · LEITURA pura. As fontes do relatório em montagem vão ENTREGUES
  // e vazias: sem meta, a empresa sai do cadastro vivo (`nr13_minha_empresa`) e
  // não do snapshot do último relatório aberto — e nenhuma chave viva
  // (`nr13_relatorio_meta_atual`, `nr13_inspecao_atual`, `nr13_injecao_atual`)
  // é gravada. Antes a meta era zerada aqui, e isso apagava a de um relatório
  // sendo montado noutra aba.
  const m = montarModeloRelatorio(tag, { meta: null, inspecao: {}, injecao: {} });

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
    fotos: desenho,
    empresa: { razao: m.empresa.razao, endereco: m.empresa.endereco, contato: m.empresa.contato, logo },
  });
}
