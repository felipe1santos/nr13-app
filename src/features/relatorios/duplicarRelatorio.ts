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
 * - IDENTIDADE (novas): `emissao` e `data` = hoje, como num relatório novo.
 * - DA INSPEÇÃO (vazias): `execucaoInspecao`, `validade`,
 *   `proximaInspecaoInterna/Externa`, `validadeValvula` e `art`. Copiá-las
 *   faria a cópia, meses depois, parecer a inspeção antiga emitida de novo.
 *   A finalização já avisa quando elas faltam.
 *
 * ## Fotos e anexos
 *
 * A cópia não copia arquivo nenhum: aponta para o MESMO container, cujas fotos
 * são referências ao bucket. Nenhum caminho do sistema apaga arquivo do bucket
 * (§6-bis: remover foto tira só a referência), e o original finalizado é o seu
 * PDF arquivado — os bytes não dependem do container. Excluir a cópia apaga só
 * o registro e os overrides DELA.
 */
import { ler } from '../../services/storage';
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
];

export function overridesDaCopia(mapa: MapaOverrides): MapaOverrides {
  const saida: MapaOverrides = {};
  for (const [id, v] of Object.entries(mapa)) if (!OVERRIDES_DA_EMISSAO.includes(id)) saida[id] = v;
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
    emissao: op.hojeBr,
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

  // As correções de texto vão para a chave da CÓPIA. A do original é só lida.
  const ovr = overridesDaCopia(carregarOverrides(original.meta?.codigo ?? original.id, tag));
  if (Object.keys(ovr).length > 0) await gravarOverrides(codigo, tag, ovr);

  await salvarRascunho(copia);
  return { estado: 'encontrado', relatorio: copia };
}
