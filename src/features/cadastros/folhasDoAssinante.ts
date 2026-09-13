import type { Funcionario } from './tipos';

/**
 * QUAIS folhas um profissional assina de verdade, e de onde a lista veio.
 *
 * ## Por que é uma função, e por que mora fora do componente
 *
 * Esta é a regra que pode MENTIR numa tela de leitura — e mentir aqui é dizer
 * que alguém não assina uma folha que sai carimbada no documento.
 *
 * `folhasProntuario` / `folhasRelatorio` **ausentes** não significam "nenhuma
 * folha": significam que aquele cadastro nunca passou pela tela de folhas, e
 * vale a regra padrão do motor de assinatura — **Engenheiro assina todas,
 * Inspetor nenhuma** (a mesma `defaultFolhas*` de `Funcionarios.tsx`). Mostrar
 * "0 de 6" para um cadastro antigo seria desmentir o papel.
 *
 * Ausente é diferente de lista VAZIA: a lista vazia é escolha deliberada do
 * usuário ("este engenheiro não assina nada"), e precisa ser respeitada.
 *
 * `origem` existe para a tela poder declarar o caso `padrao` em vez de
 * apresentar a regra do sistema como se fosse escolha de alguém.
 *
 * A ordem devolvida é a de `todas` — a ordem das folhas no documento —, nunca a
 * ordem em que as caixas foram marcadas.
 */
export function folhasEfetivas(
  escolhidas: string[] | undefined,
  todas: readonly string[],
  tipo: Funcionario['tipo'],
): { lista: string[]; origem: 'cadastro' | 'padrao' } {
  if (escolhidas === undefined) {
    return { lista: tipo === 'Engenheiro' ? [...todas] : [], origem: 'padrao' };
  }
  // Filtrar por `todas` faz duas coisas: fixa a ordem do documento e descarta
  // folha que saiu do sistema e sobrou num cadastro antigo.
  return { lista: todas.filter((a) => escolhidas.includes(a)), origem: 'cadastro' };
}
