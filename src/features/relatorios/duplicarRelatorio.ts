/**
 * DUPLICAR UM RELATÓRIO — o original fica intacto, a cópia nasce RASCUNHO
 * (21/10/2026).
 *
 * ## Por que isto existe de novo
 *
 * O botão "Duplicar" existia desde junho/2026 no histórico por equipamento
 * (`pages/Relatorios.tsx`, função `duplicar`). Quando a lista nova (V9) virou
 * a ÚNICA entrada de `/relatorios` (9G.3), ela nunca recebeu a ação: a função
 * antiga continuou no código, alcançável só por `?legado=1`, e a Central Info
 * seguiu mandando o usuário "usar Duplicar". Um cliente reclamou com razão.
 *
 * A função antiga montava a cópia SÓ no estado da tela — nada era gravado até
 * o usuário clicar "Salvar rascunho". Aqui a cópia é gravada na hora, como
 * rascunho, para sobreviver a um F5 e aparecer na lista; a tela de edição
 * abre o rascunho pelo caminho de sempre (`?editor=1&rel=`).
 *
 * ## O que a cópia LEVA (conteúdo editável)
 *
 * Tipo de inspeção, composição (`documentos`), o container de inspeção
 * (`containerOrigemId`: checklist, ensaios, medições, fotos), os responsáveis
 * selecionados (`phNome`/`phCrea`/`tecnicoNome`) e as correções de texto do
 * documento (overrides) — menos as que carregam data, ART ou laudo.
 *
 * ## O que a cópia NÃO leva (identidade do documento emitido)
 *
 * `id`/`codigo` (novo), `status` (nasce Rascunho), `pdfRef`, `sha256`,
 * `geradoEm`, `paginas`, `pdfPendente`, `livroSnapshot`, `livroCorte`, o
 * `nome` (vira "Cópia de …"), os SNAPSHOTS congelados da emissão
 * (`empresa`, `assinantes` com rubrica, `certCalibracoes`, `rastreabIds` —
 * refeitos do cadastro ATUAL quando o rascunho abre, como num relatório novo)
 * e o mapa de rastreabilidade `meta.overrides`.
 *
 * ## Datas
 *
 * - IDENTIDADE: `data` (do registro) = hoje. A `emissao` nasce VAZIA
 *   (22/10/2026): emissão é ato da finalização, e a finalização já exige a
 *   data — a cópia não sai afirmando uma emissão que não aconteceu.
 * - DA INSPEÇÃO (vazias): `execucaoInspecao`, `validade`,
 *   `proximaInspecaoInterna/Externa`, `validadeValvula` e `art`. Copiá-las
 *   faria a cópia, meses depois, parecer a inspeção antiga emitida de novo.
 *   A finalização já avisa quando elas faltam.
 *
 * ## Fotos e anexos
 *
 * A cópia não copia arquivo nenhum: ganha um container PRÓPRIO, com os dados
 * do original copiados, e as fotos continuam sendo referências ao MESMO arquivo
 * no bucket. Nenhum caminho do sistema apaga arquivo do bucket
 * (§6-bis: remover foto tira só a referência), e o original finalizado é o seu
 * PDF arquivado — os bytes não dependem do container. Excluir a cópia apaga só
 * o registro e os overrides DELA.
 */
import { ler, semearEquipamentoDetalhado } from '../../services/storage';
import { copiarContainer } from '../inspecoes/inspecaoService';
import { chaveRelatorio, salvarRascunho } from './historicoRelatorios';
import { abrirRelatorio, type EstadoAbertura } from './aberturaRelatorio';
import { carregarOverrides, gravarOverrides, type MapaOverrides } from './overridesRelatorio';
import { limparNomeDocumento, nomeSugerido } from './nomeDocumento';
import { modeloDaEmpresa } from './modeloDocumento';
import type { RelatorioMeta, RelatorioSalvo } from './tipos';

/**
 * Overrides de texto que NÃO passam para a cópia: as datas da inspeção, a ART
 * (o contrato DAQUELE serviço) e o laudo (o veredito DAQUELA inspeção). Os
 * campos que eles corrigiam também nascem vazios na meta.
 */
export const OVERRIDES_DA_EMISSAO: readonly string[] = [
  'capa.validade',
  'capa.art',
  'datas.execucao',
  'datas.validade',
  'inspecao.art',
  'ultrassom.data',
  'th.data',
  'vida.proxima',
  'parecer.laudo',
  'capa.n-do-relatorio',
  'capa.data-da-inspecao',
  'inspecao.numero-relatorio',
  'th.validade-laudo',
  'th.resultado',
  'th.doc-numero',
  'ultrassom.resultado',
  'ri.laudo-final',
  'acumulacao.laudo',
];

/**
 * Famílias inteiras que também são DAQUELA emissão: datas e resultados da
 * inspeção, os prazos das próximas e as marcações do ensaio de acumulação.
 */
export const PREFIXOS_DA_EMISSAO: readonly string[] = [
  'inspecao.data-',
  'inspecao.resultado-',
  'proximas.',
  'ri.acumulacao.',
  // Folha 3 da caldeira: nº rastreável, laudo, calibração e marcações de cada exame.
  'ri.ensaio-',
  'ri.disp-',
  'ri.ve.',
  'ri.vi.',
  'ri.th.',
  'ri.prontuario-',
];

function ehDaEmissao(id: string): boolean {
  return OVERRIDES_DA_EMISSAO.includes(id) || PREFIXOS_DA_EMISSAO.some((p) => id.startsWith(p));
}

export function overridesDaCopia(mapa: MapaOverrides): MapaOverrides {
  const saida: MapaOverrides = {};
  for (const [id, v] of Object.entries(mapa)) if (!ehDaEmissao(id)) saida[id] = v;
  return saida;
}

export function nomeDaCopia(original: RelatorioSalvo): string {
  const base = (original.nome ?? '').trim() || nomeSugerido(original.tipo, original.tagVaso);
  return limparNomeDocumento(`Cópia de ${base}`) ?? nomeSugerido(original.tipo, original.tagVaso);
}

export interface OpcoesDuplicata {
  /** O código/id do NOVO relatório. */
  codigo: string;
  /** Hoje, DD/MM/AAAA. */
  hojeBr: string;
  modeloDocumento: RelatorioMeta['modeloDocumento'];
}

/** Função PURA: monta o rascunho novo. Não lê nem grava nada. */
export function montarDuplicata(original: RelatorioSalvo, op: OpcoesDuplicata): RelatorioSalvo {
  const m = original.meta;
  const meta: RelatorioMeta = {
    codigo: op.codigo,
    emissao: '',
    validade: '',
    execucaoInspecao: '',
    proximaInspecaoInterna: '',
    proximaInspecaoExterna: '',
    validadeValvula: '',
    tipoInspecao: m.tipoInspecao,
    phNome: m.phNome ?? '',
    phCrea: m.phCrea ?? '',
    tecnicoNome: m.tecnicoNome ?? '',
    art: '',
    ...(m.containerOrigemId ? { containerOrigemId: m.containerOrigemId } : {}),
    documentos: [...(m.documentos ?? original.documentos ?? [])],
    ...(op.modeloDocumento ? { modeloDocumento: op.modeloDocumento } : {}),
    duplicadoDe: original.id,
  };
  return {
    id: op.codigo,
    tagVaso: original.tagVaso,
    nome: nomeDaCopia(original),
    tipo: original.tipo,
    data: op.hojeBr,
    documentos: [...(original.documentos ?? [])],
    meta,
    status: 'Rascunho',
  };
}

/** Um código `REL-<ms>` que não colide com nenhum registro desta TAG. */
export function codigoLivre(agora: number, existe: (codigo: string) => boolean): string {
  let t = agora;
  while (existe(`REL-${t}`)) t += 1;
  return `REL-${t}`;
}

export interface ResultadoDuplicacao {
  estado: EstadoAbertura;
  relatorio: RelatorioSalvo | null;
}

/**
 * Duplica o relatório `id` do equipamento `tag` e GRAVA a cópia como rascunho.
 *
 * O original só é LIDO (do cache ou, sob demanda, do servidor) — nenhuma chave
 * dele é escrita. Devolve o rascunho novo, ou o estado da abertura quando o
 * original não pôde ser lido.
 */
export async function duplicarRelatorio(
  id: string,
  tag: string,
  agora: number = Date.now(),
): Promise<ResultadoDuplicacao> {
  const abertura = await abrirRelatorio(id, tag);
  const original = abertura.relatorio;
  if (!original) return { estado: abertura.estado, relatorio: null };

  const codigo = codigoLivre(
    agora,
    (c) => c === original.id || c === original.meta?.codigo || ler(chaveRelatorio(c, tag)) != null,
  );
  const copia = montarDuplicata(original, {
    codigo,
    hojeBr: new Date(agora).toLocaleDateString('pt-BR'),
    modeloDocumento: modeloDaEmpresa(),
  });

  // CONTAINER PRÓPRIO (22/10/2026). Antes a cópia apontava para o MESMO
  // container do original: editar medição, acumulação ou foto na cópia mudava o
  // registro de campo da inspeção original (tela de Inspeções e o relatório
  // legado que se remonta dele). Agora a cópia ganha um container novo, com os
  // dados copiados; os arquivos de foto são os mesmos (referência imutável).
  const origemId = original.meta?.containerOrigemId;
  if (origemId) {
    let novo = await copiarContainer(tag, origemId);
    if (!novo) {
      // Cache sem a lista de containers (aparelho novo): busca só esta chave.
      try {
        await semearEquipamentoDetalhado([`nr13_docs_${tag}`]);
      } catch {
        /* a releitura abaixo decide */
      }
      novo = await copiarContainer(tag, origemId);
    }
    if (novo) copia.meta = { ...copia.meta, containerOrigemId: novo.id };
    else {
      // O container de origem não existe mais (excluído): a cópia nasce sem
      // dados de campo — nunca apontando para um container alheio.
      const { containerOrigemId: _sem, ...resto } = copia.meta;
      void _sem;
      copia.meta = resto;
    }
  }

  // As correções de texto vão para a chave da CÓPIA. A do original é só lida.
  const ovr = overridesDaCopia(carregarOverrides(original.meta?.codigo ?? original.id, tag));
  if (Object.keys(ovr).length > 0) await gravarOverrides(codigo, tag, ovr);

  await salvarRascunho(copia);
  return { estado: 'encontrado', relatorio: copia };
}
