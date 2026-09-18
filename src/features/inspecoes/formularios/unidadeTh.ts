import { ler } from '../../../services/storage';
import { ehSistemaUnidade, unidadeValida, type SistemaUnidade } from '../../../calc/unidades';

/**
 * Revisão do engenheiro (18/09/2026) · a UNIDADE das pressões do teste
 * hidrostático — e as regras de leitura do registro antigo.
 *
 * ## O dado do TH não é canônico em MPa
 *
 * As pressões do ensaio são o que o técnico LEU no manômetro, digitado como
 * texto. Não se convertem nem se regravam: o que foi digitado é o registro. O
 * que muda é que o registro passa a dizer EM QUE unidade foi digitado
 * (`th.unidade`), e o documento converte na apresentação.
 *
 * ## Registro sem `unidade` = kgf/cm²
 *
 * Até esta data o formulário tinha "(kgf/cm²)" escrito à mão nos quatro rótulos
 * de pressão, fosse qual fosse o equipamento. Um registro antigo foi digitado
 * olhando para esse rótulo — `TECNICO` é a leitura fiel do que a tela pediu, e
 * não um chute.
 */
export const UNIDADE_TH_LEGADA: SistemaUnidade = 'TECNICO';

/** A unidade FIXA do equipamento, escolhida na criação (§4). Ausente = SI. */
export function unidadeDoEquipamento(tag: string): SistemaUnidade {
  try {
    return unidadeValida(ler<string>(`nr13_pref_unidade_${tag}`));
  } catch {
    return 'SI';
  }
}

/**
 * Em que unidade ESTE registro de TH foi digitado.
 *
 * - registro com carimbo válido → o carimbo;
 * - registro que existe e não tem carimbo → kgf/cm² (ver acima);
 * - registro que ainda não existe → a unidade do equipamento (é a que o
 *   formulário novo vai carimbar).
 */
export function unidadeDoRegistroTh(salvo: unknown, unidadeEquipamento: SistemaUnidade): SistemaUnidade {
  if (!salvo || typeof salvo !== 'object') return unidadeEquipamento;
  const u = (salvo as { unidade?: unknown }).unidade;
  return ehSistemaUnidade(u) ? u : UNIDADE_TH_LEGADA;
}

/**
 * O fluido do teste é, na verdade, o fluido de OPERAÇÃO que o prefill antigo
 * copiou de `nr13_cat_.fluidoInput`?
 *
 * Até 18/09/2026 o formulário sobrescrevia o "Fluido Utilizado" com a opção da
 * categorização — `"A - Hidrogênio"`, `"C - Vapor de água…"`. É um texto que
 * nenhum técnico escreveria como fluido de ensaio: tem o prefixo de classe da
 * NR-13 e é igual, caractere por caractere, ao salvo na categoria. Nessas duas
 * condições ele não é informação do teste — é o defeito do prefill, e o
 * documento o trata como NÃO informado em vez de imprimi-lo como fluido de
 * teste.
 */
export function fluidoEhOperacional(fluidoTeste: unknown, fluidoCategoria: unknown): boolean {
  const t = typeof fluidoTeste === 'string' ? fluidoTeste.trim() : '';
  const c = typeof fluidoCategoria === 'string' ? fluidoCategoria.trim() : '';
  return t !== '' && t === c && /^[A-D]\s*-\s/.test(t);
}
