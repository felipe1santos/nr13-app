/**
 * A SEMÂNTICA DAS LEITURAS DE ESPESSURA — uma regra, dois desenhos.
 *
 * Estas funções moravam dentro de `folhas.ts`, usadas só pela tabela de
 * ultrassom. Com o croqui (folha 7.4.1) passou a haver um segundo desenho dos
 * MESMOS números, e um segundo desenho com regra própria é como a tabela e o
 * mapa passariam a discordar sobre qual ponto é o crítico — cada um com a sua
 * aritmética, ambos no mesmo documento assinado.
 *
 * Então a regra saiu para cá, inteira e sem alteração. Quem desenha importa; o
 * que ela significa não é decidido no desenho.
 */

/**
 * O número de uma leitura — aceita "6,32" e "6.32".
 *
 * **Só positivos.** `0` não é leitura de espessura: é o que sobra quando a
 * célula recebeu um traço, um texto ou um zero digitado por engano, e
 * considerá-lo faria o "menor valor" da região virar zero e apontar a parede
 * inteira como crítica. Esta é a regra que a tabela sempre teve.
 */
export function medidaNumero(v: string | null | undefined): number | null {
  const n = Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * A célula tem MEDIÇÃO, ou está em branco?
 *
 * Pergunta diferente de `medidaNumero`, e a diferença é a que o §28 do pedido
 * chama de obrigatória: `""` (não informado) e `"0"` (informado) são coisas
 * distintas. O modelo troca o vazio por travessão (`textoOu`), e é por isso que
 * o travessão entra na lista.
 *
 * O croqui usa isto para decidir se o ponto existe no desenho; o destaque
 * continua saindo de `medidaNumero`.
 */
export function temMedida(v: string | null | undefined): boolean {
  const t = String(v ?? '').trim();
  return t !== '' && t !== '—' && t !== '-' && t !== '--';
}

/**
 * A MAIOR e a MENOR leitura de uma região.
 *
 * A comparação é por região, e não pela folha inteira: é dentro do costado, do
 * tampo, que a diferença entre pontos significa desgaste. Só as leituras dos
 * ângulos entram — a coluna MENOR VALOR é derivada delas e repetiria o
 * destaque no lugar errado.
 */
export function extremosDaRegiao(
  linhas: { medidas: string[] }[],
): { maior: number | null; menor: number | null } {
  const valores = linhas.flatMap((l) => l.medidas.map(medidaNumero)).filter((n): n is number => n !== null);
  if (valores.length < 2) return { maior: null, menor: null };
  return { maior: Math.max(...valores), menor: Math.min(...valores) };
}

export type Destaque = 'maior' | 'menor';

export function destaqueDaMedida(
  valor: string | null | undefined,
  maior: number | null,
  menor: number | null,
): { destaque?: Destaque } {
  const n = medidaNumero(valor);
  if (n === null) return {};
  if (menor !== null && n === menor) return { destaque: 'menor' };
  if (maior !== null && n === maior) return { destaque: 'maior' };
  return {};
}

/**
 * A leitura está ABAIXO da espessura mínima requerida daquela região?
 *
 * Só responde quando os dois números existem. Sem requerida não há reprovação
 * possível — e pintar de vermelho por não saber seria inventar uma
 * classificação técnica, que é o que o §14 do pedido proíbe.
 */
export function abaixoDaRequerida(
  valor: string | null | undefined,
  requerida: string | null | undefined,
): boolean {
  const v = medidaNumero(valor);
  const r = medidaNumero(requerida);
  return v !== null && r !== null && v < r;
}
