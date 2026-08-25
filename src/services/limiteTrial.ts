/**
 * Teto de equipamentos da conta de teste.
 *
 * O trial existe para a pessoa provar o sistema, não para operar a empresa nele
 * de graça. Sem teto, uma conta de 48 h cadastra dezenas de equipamentos com
 * fotos, e o custo fica: em 11/08/2026 as contas de trial já respondiam por
 * boa parte das linhas do `app_storage`, num projeto que estourou a cota de
 * egress do Supabase.
 *
 * TRÊS é o número: dá para cadastrar um vaso, uma caldeira e um autoclave e ver
 * o sistema inteiro funcionando — memorial, inspeção, relatório — sem virar
 * ambiente de produção clandestino.
 *
 * ONDE ESTE LIMITE VALE, E ONDE NÃO VALE: é um gate de PRODUTO, aplicado na
 * interface. Não é uma regra de segurança — quem abrir o console e chamar o
 * serviço direto passa por ele. A defesa real contra abuso de conta de teste é
 * o prazo de 48 h e a RLS de escrita (`acesso_vigente()`), que o servidor
 * impõe. Aqui o objetivo é o usuário entender o limite, não impedir um ataque.
 */
import { isTrial } from './auth';
import { listarChavesComPrefixo } from './storage';
import { bootV9Ativo } from './flag';
import { contar } from './buscaIndex';

export const LIMITE_EQUIPAMENTOS_TRIAL = 3;

export interface ResultadoLimite {
  permitido: boolean;
  /** Quantos já existem na conta. */
  atual: number;
  limite: number;
  /** Mensagem pronta para a interface. Vazia quando permitido. */
  motivo: string;
}

/**
 * Conta só o que existe AGORA. Equipamento excluído libera vaga de propósito:
 * o teto é de quantidade simultânea, não de cadastros ao longo da vida — punir
 * quem apagou um cadastro errado seria hostil sem ganhar nada.
 */
export function equipamentosCadastrados(): number {
  return listarChavesComPrefixo('nr13_info_').length;
}

/**
 * O teto, valendo também sob o BOOT LEVE (Fase 9 · `boot_v9`).
 *
 * `equipamentosCadastrados()` conta chaves do cache, e com o boot leve o cache
 * não tem a organização: a conta daria ZERO e o teto sumiria sem que nada na
 * tela mudasse. Um gate que desaparece em silêncio é pior que um gate que não
 * existe — ninguém vai procurar por ele.
 *
 * Só consulta o servidor quando há teto para valer (conta de teste): numa conta
 * paga o limite é infinito, e pagar uma ida à rede para concluir "pode" seria
 * desperdício em todo cadastro.
 */
export async function podeCriarEquipamentoAgora(): Promise<ResultadoLimite> {
  if (!isTrial()) return { permitido: true, atual: 0, limite: Infinity, motivo: '' };
  if (!bootV9Ativo()) return podeCriarEquipamento();

  const { total } = await contar();
  return avaliarTeto(total);
}

export function podeCriarEquipamento(): ResultadoLimite {
  const atual = equipamentosCadastrados();
  if (!isTrial()) return { permitido: true, atual, limite: Infinity, motivo: '' };
  return avaliarTeto(atual);
}

function avaliarTeto(atual: number): ResultadoLimite {

  if (atual >= LIMITE_EQUIPAMENTOS_TRIAL) {
    return {
      permitido: false,
      atual,
      limite: LIMITE_EQUIPAMENTOS_TRIAL,
      motivo:
        `O período de teste permite até ${LIMITE_EQUIPAMENTOS_TRIAL} equipamentos ` +
        `e você já cadastrou ${atual}. Assine para cadastrar quantos precisar.`,
    };
  }
  return { permitido: true, atual, limite: LIMITE_EQUIPAMENTOS_TRIAL, motivo: '' };
}
