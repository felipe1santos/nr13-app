import { ler, salvar } from '../../services/storage';

/**
 * Fase 13C · QUEM edita os campos que persistem: a folha ou o React.
 *
 * ## Por que existe uma chave para isso
 *
 * A 13C troca a superfície de edição de dois campos — a grade de espessuras e o
 * laudo. Trocar interface de edição sem porta de volta é apostar que a tela
 * nova cobre todos os casos de campo na primeira tentativa. A chave existe para
 * a volta custar um passo, como em todas as viradas deste projeto.
 *
 * | valor | quem edita | as folhas ULTRASSOM e CONCLUSAO |
 * |---|---|---|
 * | `react` | os painéis React | abrem com `ro=1` — não gravam nada |
 * | `iframe` (padrão) | as folhas, como sempre | editáveis |
 *
 * ## A regra que evita duas verdades
 *
 * Com `react` ligado, as duas folhas nascem **somente-leitura**. Deixar as duas
 * superfícies editáveis ao mesmo tempo criaria o pior caso possível: o inspetor
 * digita na folha, o painel não sabe, e o próximo save de qualquer um dos dois
 * apaga o outro. Uma superfície de cada vez.
 *
 * O resto do relatório continua como está: esta chave não decide prévia, nem
 * palco, nem geração — só quem grava esses dois campos.
 */
export type SuperficieEdicao = 'iframe' | 'react';

export const CHAVE_EDICAO = 'nr13_edicao_react';

/** As folhas cuja edição a 13C assume. */
export const FOLHAS_EDITADAS_NO_REACT = ['ULTRASSOM.html', 'CONCLUSAO.html'];

function normalizar(v: unknown): SuperficieEdicao {
  return String(v ?? '').trim().toLowerCase() === 'react' ? 'react' : 'iframe';
}

/** A configuração da organização (sem olhar a URL). */
export function edicaoConfigurada(): SuperficieEdicao {
  try {
    return normalizar(ler<{ superficie?: string }>(CHAVE_EDICAO)?.superficie);
  } catch {
    // Sem storage legível, o caminho seguro é o que sempre funcionou.
    return 'iframe';
  }
}

/** A superfície a usar agora: a URL (`?edicao=`), se disser algo; senão a chave. */
export function edicaoAtual(busca = ''): SuperficieEdicao {
  const daUrl = new URLSearchParams(busca).get('edicao');
  if (daUrl !== null && daUrl.trim() !== '') return normalizar(daUrl);
  return edicaoConfigurada();
}

/** Grava a decisão da organização. Caminho oficial de mutação. */
export async function definirEdicao(superficie: SuperficieEdicao): Promise<void> {
  await salvar(CHAVE_EDICAO, { superficie: normalizar(superficie), em: new Date().toISOString() });
}

/**
 * Esta folha deve abrir travada?
 *
 * Só as duas que o React passou a editar, e só quando ele está ligado. Nenhuma
 * outra folha muda de comportamento — e um relatório SALVO já vem travado
 * inteiro por outro caminho (§7-ter).
 */
export function folhaTravadaPelaEdicaoReact(documento: string, superficie: SuperficieEdicao): boolean {
  if (superficie !== 'react') return false;
  const arquivo = documento.split('?')[0].toUpperCase();
  return FOLHAS_EDITADAS_NO_REACT.some((f) => arquivo === f.toUpperCase());
}
