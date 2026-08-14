/**
 * Campos que NÃO cabem no `localStorage` — a tabela única do sistema.
 *
 * POR QUE EXISTE ESTE MÓDULO (14/08/2026): a regra nasceu dentro do
 * `storageV1.ts` (§2-bis do CLAUDE.md) e ficou presa lá. A v2 grava no `Map` o
 * `valor` cru que vem do Supabase — com o `pdfBase64` inteiro — e o palco
 * materializa esse mesmo valor no `localStorage`. Resultado medido em produção
 * na conta `engyuricesar` em 14/08/2026: dois registros `nr13_rastreab_` de
 * 794 KB e 614 KB dentro de um documento de 3.969 KB, contra um orçamento de
 * 3.368 KB. O relatório inteiro era recusado por causa de um PDF que NENHUMA
 * folha imprime.
 *
 * O comentário do `palco.ts` afirmava o contrário ("registros ENXUTOS ... ~1 KB
 * por instrumento"): era verdade na v1, onde a poda acontecia na gravação.
 *
 * Agora a tabela é uma só e os dois caminhos a consultam:
 *  - `storageV1.gravarNoCache` — poda ao gravar (v1);
 *  - `palco.coletarItens` — poda ao materializar (v2).
 *
 * ONDE O DADO REALMENTE MORA: o valor COMPLETO vai para o Supabase (é ele que
 * sincroniza entre aparelhos) e para o IndexedDB (`pdfStore.ts`). Quem precisa
 * do arquivo usa `resolverPdf()`; quem só precisa saber que ele existe usa
 * `temPdfDe()`.
 *
 * SÓ PODE ENTRAR AQUI CAMPO QUE NENHUM TEMPLATE DE `public/` LÊ. Conferido por
 * varredura para `pdfBase64`: as folhas que leem `nr13_rastreab_`
 * (`ULTRASSOM.html`, `TESTE-HIDROSTATICO.html`, `PRONT-ULTRASSOM.html`) usam
 * apenas `nome`/`aparelho`/`numeroSerie`/`certificadoPadrao`/`validade`. E
 * nenhum template GRAVA `nr13_rastreab_` (`sbSalvar` só toca `nr13_med_esp_`,
 * `nr13_med_grid_` e `nr13_prontuario_atual`), então a ponte não tem como
 * devolver ao cache um registro podado.
 */
export interface CampoPesado {
  prefixo: string;
  campo: string;
}

export const CAMPOS_PESADOS: readonly CampoPesado[] = [
  { prefixo: 'nr13_rastreab_', campo: 'pdfBase64' },
];

export function campoPesadoDe(chave: string): CampoPesado | undefined {
  return CAMPOS_PESADOS.find((c) => chave.startsWith(c.prefixo));
}

/**
 * Divide o JSON em (versão enxuta, conteúdo pesado).
 *
 * A versão enxuta mantém `temPdf`/`pdfBytes` para a interface saber que o
 * arquivo existe sem carregá-lo. `pdfBytes` é o tamanho da STRING base64 — é o
 * que a v1 sempre gravou e o que `temPdfDe()` compara; mudar a unidade aqui
 * mexeria em registro já gravado sem ganho nenhum.
 */
export function dividirPesado(chave: string, valor: string): { leve: string; pesado: string | null } {
  const alvo = campoPesadoDe(chave);
  if (!alvo) return { leve: valor, pesado: null };
  try {
    const obj = JSON.parse(valor) as Record<string, unknown>;
    const pesado = typeof obj[alvo.campo] === 'string' ? (obj[alvo.campo] as string) : '';
    if (!pesado) return { leve: valor, pesado: null };
    return {
      leve: JSON.stringify({ ...obj, [alvo.campo]: '', temPdf: true, pdfBytes: pesado.length }),
      pesado,
    };
  } catch {
    return { leve: valor, pesado: null }; // valor não-JSON: não há o que dividir
  }
}

/**
 * Só a versão enxuta. Idempotente: registro já podado sai igual, sem custo de
 * reserialização.
 */
export function podar(chave: string, valor: string): string {
  return dividirPesado(chave, valor).leve;
}
