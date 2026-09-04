import { ler, salvar } from '../../services/storage';

/**
 * Fase 11 · QUAL MOTOR gera o PDF de uma finalização NOVA.
 *
 * ## Por que existe uma chave para isso
 *
 * O relatório vetorial está pronto, mas trocar o motor de produção num commit é
 * apostar que ele está certo em todos os parques ao mesmo tempo. A chave existe
 * para a virada ser **gradual e reversível em um passo**: se um relatório sair
 * errado numa conta, volta-se para `raster` e a próxima finalização já sai pelo
 * caminho antigo, sem deploy, sem rollback de bundle.
 *
 * ## O que ela NÃO faz — e isto é o mais importante
 *
 * **Ela não alcança nenhum documento já emitido.** Relatório finalizado é um
 * arquivo com hash (§7-quater): abrir, imprimir, baixar e servir no Portal
 * usam o `pdfRef` daquela emissão. Trocar o motor não regenera, não reabre e
 * não recalcula PDF histórico — o documento de 2024 continua sendo os bytes de
 * 2024, gerados pelo motor de 2024. A chave só decide o motor da PRÓXIMA
 * finalização.
 *
 * ## Padrão
 *
 * No CÓDIGO, `raster`: ausência de valor é ausência de decisão, e só a string
 * exata `'vetorial'` troca o motor. Em PRODUÇÃO a chave está gravada como
 * `vetorial` desde 04/09/2026 — o padrão do código é o piso do rollback, não o
 * que sai hoje na finalização. Apagar a chave já é rollback.
 *
 * ## Os dois níveis
 *
 * | onde | alcance | para quê |
 * |---|---|---|
 * | `?motor=vetorial` na URL | uma sessão do visualizador | testar numa conta sem mudar nada para ninguém |
 * | `nr13_motor_pdf` (chave global) | a organização | a virada de verdade, quando for autorizada |
 *
 * A URL vence a chave: quem está testando precisa poder testar sem desligar a
 * configuração da organização.
 */
export type MotorPdf = 'raster' | 'vetorial';

export const CHAVE_MOTOR_PDF = 'nr13_motor_pdf';

/** O único valor que troca o motor. Qualquer outra coisa é `raster`. */
function normalizar(v: unknown): MotorPdf {
  return String(v ?? '').trim().toLowerCase() === 'vetorial' ? 'vetorial' : 'raster';
}

/** O motor configurado para a organização (sem olhar a URL). */
export function motorConfigurado(): MotorPdf {
  try {
    return normalizar(ler<{ motor?: string }>(CHAVE_MOTOR_PDF)?.motor);
  } catch {
    // Sem storage legível o caminho seguro é o que está em produção.
    return 'raster';
  }
}

/**
 * O motor a usar agora: a URL, se disser algo; senão a configuração.
 *
 * `busca` é a query string (`window.location.search`). Recebe por parâmetro
 * para a regra ter teste — a mesma razão de `documentoSomenteLeitura` (§7-ter).
 */
export function motorPdfAtual(busca = ''): MotorPdf {
  const daUrl = new URLSearchParams(busca).get('motor');
  if (daUrl !== null && daUrl.trim() !== '') return normalizar(daUrl);
  return motorConfigurado();
}

/** Grava a decisão da organização. Passa pelo caminho oficial de mutação. */
export async function definirMotorPdf(motor: MotorPdf): Promise<void> {
  await salvar(CHAVE_MOTOR_PDF, { motor: normalizar(motor), em: new Date().toISOString() });
}

/**
 * Fase 12 · o motor do PRONTUÁRIO, em chave SEPARADA.
 *
 * Deliberadamente NÃO reusa `nr13_motor_pdf`. Relatório e prontuário viraram
 * em momentos diferentes e podem precisar de rollback independente: se o
 * prontuário vetorial apresentar problema, desligá-lo não pode arrastar junto
 * o relatório, que já está validado em produção desde 04/09/2026.
 *
 * Padrão: `atual` — o gerador de hoje (impressão rasterizada de
 * `.prontuario-preview`). Só a string exata `'vetorial'` troca.
 */
export const CHAVE_MOTOR_PRONTUARIO = 'nr13_motor_prontuario';

export type MotorProntuario = 'atual' | 'vetorial';

function normalizarProntuario(v: unknown): MotorProntuario {
  return String(v ?? '').trim().toLowerCase() === 'vetorial' ? 'vetorial' : 'atual';
}

/** O motor configurado para o prontuário (sem olhar a URL). */
export function motorProntuarioConfigurado(): MotorProntuario {
  try {
    return normalizarProntuario(ler<{ motor?: string }>(CHAVE_MOTOR_PRONTUARIO)?.motor);
  } catch {
    return 'atual';
  }
}

/** O motor a usar agora: a URL (`?motorPront=`), se disser algo; senão a chave. */
export function motorProntuarioAtual(busca = ''): MotorProntuario {
  const daUrl = new URLSearchParams(busca).get('motorPront');
  if (daUrl !== null && daUrl.trim() !== '') return normalizarProntuario(daUrl);
  return motorProntuarioConfigurado();
}

/** Grava a decisão da organização para o prontuário. */
export async function definirMotorProntuario(motor: MotorProntuario): Promise<void> {
  await salvar(CHAVE_MOTOR_PRONTUARIO, { motor: normalizarProntuario(motor), em: new Date().toISOString() });
}
