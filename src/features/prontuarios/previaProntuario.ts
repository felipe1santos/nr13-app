/**
 * Qual PRÉVIA a tela do prontuário mostra.
 *
 * ## Por que existe uma chave só para isto
 *
 * A prévia do relatório virou vetorial na 13E, e a decisão tem chave própria
 * (`nr13_previa_documento`). O prontuário precisa da mesma coisa e de um
 * rollback INDEPENDENTE: se a prévia vetorial do prontuário apresentar
 * problema, desligá-la não pode arrastar junto o relatório, que está validado
 * em produção desde 04/09/2026.
 *
 * ## O padrão é `vetorial`
 *
 * Ele é o documento que vai ser emitido. Mostrar na tela os seis iframes dos
 * templates antigos e emitir um PDF com outro desenho é a pior combinação
 * possível: o usuário aprova uma coisa e assina outra. A prévia é o documento.
 *
 * O rollback custa um passo: `?previaPront=iframe` na URL para uma sessão, ou
 * `definirPreviaProntuario('iframe')` para a organização.
 */
import { ler, salvar } from '../../services/storage';

export const CHAVE_PREVIA_PRONTUARIO = 'nr13_previa_prontuario';

export type PreviaProntuario = 'vetorial' | 'iframe';

function normalizar(v: unknown): PreviaProntuario {
  // Só a string exata 'iframe' volta ao desenho antigo: qualquer outra coisa —
  // ausência, lixo, valor de uma versão futura — é o documento novo.
  return String(v ?? '').trim().toLowerCase() === 'iframe' ? 'iframe' : 'vetorial';
}

/** O que a organização escolheu (sem olhar a URL). */
export function previaProntuarioConfigurada(): PreviaProntuario {
  try {
    return normalizar(ler<{ previa?: string }>(CHAVE_PREVIA_PRONTUARIO)?.previa);
  } catch {
    // Storage indisponível não pode derrubar a tela: o documento novo é o
    // padrão, e é ele que a emissão usa.
    return 'vetorial';
  }
}

/** A prévia a usar agora: a URL manda; sem ela, a chave da organização. */
export function previaProntuarioAtual(busca = ''): PreviaProntuario {
  const daUrl = new URLSearchParams(busca).get('previaPront');
  if (daUrl !== null && daUrl.trim() !== '') return normalizar(daUrl);
  return previaProntuarioConfigurada();
}

export async function definirPreviaProntuario(previa: PreviaProntuario): Promise<void> {
  await salvar(CHAVE_PREVIA_PRONTUARIO, { previa: normalizar(previa), em: new Date().toISOString() });
}
