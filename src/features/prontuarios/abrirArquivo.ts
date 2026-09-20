/**
 * ABRIR UM DOCUMENTO ARQUIVADO SEM PERDER A ABA (19/09/2026).
 *
 * ## O defeito, medido no laboratório
 *
 * Abrir um prontuário faz duas coisas: BUSCAR os bytes (cofre local, e se não
 * houver, o bucket) e ABRIR a aba. Escrito do jeito natural —
 * `const blob = await bytes(); window.open(URL.createObjectURL(blob))` — o
 * `window.open` acontece DEPOIS do await, fora da ativação do clique, e o
 * navegador o trata como popup.
 *
 * Num aparelho que já tinha o arquivo no cofre isso passa despercebido: a
 * espera é de milissegundos e a aba abre. Num aparelho NOVO — o caso real de
 * quem troca de computador, ou de quem abre um documento anexado por um colega
 * — o arquivo vem do bucket, e a aba é BARRADA EM SILÊNCIO: nada abre, nenhum
 * erro aparece, o botão volta ao normal. Foi exatamente o que o E2E reproduziu
 * (40 s de espera, zero abas, zero mensagens) enquanto a mesma busca, chamada
 * direto, resolvia em 106 ms.
 *
 * ## A regra
 *
 * A aba é RESERVADA na mesma pilha do clique, vazia, e só depois recebe o
 * arquivo. É o mesmo princípio que `trial.ts` já registra para o checkout:
 * "clique tem que virar `window.open` na mesma pilha".
 *
 * `noopener` não pode ser passado na reserva — com ele `window.open` devolve
 * `null` e não há aba para entregar nada. O vínculo é cortado no lugar certo:
 * `janela.opener = null` logo depois de abrir.
 *
 * ## Quando a aba é barrada mesmo assim
 *
 * Bloqueador estrito recusa até a reserva. Aí o recuo é BAIXAR o arquivo por
 * uma âncora `download` — que não é uma janela nova e não passa pelo
 * bloqueador. O usuário recebe o documento de um jeito ou de outro; o que não
 * pode é o clique não fazer nada.
 */

/** A aba reservada no clique, esperando o arquivo. */
export interface AbaReservada {
  /** Entrega os bytes: manda a aba para o blob, ou baixa se ela não existe. */
  entregar(blob: Blob, nomeArquivo: string): void;
  /** Deu erro na busca: fecha a aba vazia para não deixar `about:blank` aberto. */
  descartar(): void;
}

/** O aviso que a aba mostra enquanto o arquivo não chega. */
const AGUARDE =
  '<!doctype html><meta charset="utf-8"><title>Abrindo o documento…</title>' +
  '<body style="font:15px/1.5 system-ui,sans-serif;color:#44403c;padding:40px">' +
  'Abrindo o documento…</body>';

function baixarPorAncora(url: string, nome: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Reserva a aba AGORA. Chamar no manipulador do clique, antes de qualquer
 * `await` — é a chamada síncrona que faz a aba contar como ação do usuário.
 */
export function reservarAba(
  abrir: (alvo: string, destino: string) => Window | null = (a, d) => window.open(a, d),
): AbaReservada {
  let janela: Window | null = null;
  try {
    janela = abrir('', '_blank');
    if (janela) {
      // Cortar o vínculo aqui, e não por `noopener` no open: com a opção, o
      // retorno é `null` e a aba fica inalcançável.
      try {
        janela.opener = null;
      } catch {
        /* navegador que não deixa escrever em `opener` — a aba segue válida */
      }
      janela.document.write(AGUARDE);
      janela.document.close();
    }
  } catch {
    janela = null;
  }

  return {
    entregar(blob, nomeArquivo) {
      const url = URL.createObjectURL(blob);
      if (janela && !janela.closed) janela.location.replace(url);
      else baixarPorAncora(url, nomeArquivo);
      // Revogar na hora mataria a aba que acabou de receber o endereço.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    descartar() {
      if (janela && !janela.closed) janela.close();
    },
  };
}
