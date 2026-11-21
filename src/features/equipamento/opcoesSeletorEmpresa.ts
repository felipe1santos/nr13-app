import type { Cliente } from '../cadastros/tipos';

/**
 * Regras do seletor "Selecionar empresa cadastrada" da ficha (21/11/2026),
 * separadas do componente para a suíte (`environment: 'node'`) alcançar.
 *
 * O seletor é só APRESENTAÇÃO: escolher continua chamando o mesmo
 * `aplicarCliente(id)` de `DadosEmpresa`, com o mesmo `''` para "preencher
 * manualmente". Nenhum campo novo é gravado em `nr13_emp_<TAG>`.
 */

/** O mesmo texto que o `<option>` nativo mostrava. */
export function rotuloCliente(c: Pick<Cliente, 'razaoSocial' | 'nomeFantasia'>): string {
  return `${c.razaoSocial}${c.nomeFantasia ? ` (${c.nomeFantasia})` : ''}`;
}

export const ROTULO_MANUAL = '— Preencher manualmente —';

/**
 * Próxima opção ativa para uma tecla de navegação da lista. `null` = a tecla
 * não é de navegação. Sem volta ao início: no fim, ArrowDown fica no último
 * (o padrão de listbox do WAI-ARIA para lista de seleção única).
 */
export function proximoIndice(atual: number, tecla: string, total: number): number | null {
  if (total <= 0) return null;
  switch (tecla) {
    case 'ArrowDown':
      return Math.min(total - 1, atual + 1);
    case 'ArrowUp':
      return Math.max(0, atual - 1);
    case 'Home':
    case 'PageUp':
      return 0;
    case 'End':
    case 'PageDown':
      return total - 1;
    default:
      return null;
  }
}

/**
 * Busca por letra (typeahead): a próxima opção, DEPOIS da ativa, cujo rótulo
 * começa com a letra digitada; dá a volta. `null` = nenhuma.
 */
export function indicePorLetra(rotulos: string[], atual: number, letra: string): number | null {
  const l = letra.toLocaleLowerCase('pt-BR');
  if (!l.trim()) return null;
  for (let passo = 1; passo <= rotulos.length; passo++) {
    const i = (atual + passo) % rotulos.length;
    if (rotulos[i].replace(/^[—\s-]+/, '').toLocaleLowerCase('pt-BR').startsWith(l)) return i;
  }
  return null;
}
