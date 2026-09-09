import type { CampoEditavel } from './pdfVetorial/documento';

/**
 * Fase 13D · a lista do que ainda falta preencher.
 *
 * ## O que ela é
 *
 * É **apoio** ao amarelo da prévia, não substituto: o amarelo mostra ONDE, no
 * documento, o campo está vazio; a lista mostra O QUÊ, sem o revisor precisar
 * rolar vinte folhas.
 *
 * ## 09/09/2026 · ELA PASSOU A SAIR DO GERADOR
 *
 * Até aqui esta função era uma **segunda lista, escrita à mão** sobre o modelo:
 * uma dúzia de campos escolhidos a dedo (`marcar('Cliente', m.cliente)`, e
 * assim por diante). O documento, enquanto isso, pintava de amarelo TODO campo
 * de valor vazio — dezenas deles. O revisor via a folha cheia de amarelo e a
 * barra dizendo "faltam 3".
 *
 * Agora a fonte é a MESMA que desenha: cada campo registrado pelo gerador traz
 * a sua `pendencia`, decidida no ponto exato que decide o amarelo
 * (`Documento.classificar`). Não há como uma dizer uma coisa e a outra dizer
 * outra — e `pendenciasSemAlerta.test.ts` quebra se alguém tentar.
 *
 * **Nada de varrer pixel.** O gerador já sabe id, rótulo, página, caixa, valor
 * e se ficou vazio; procurar amarelo no PDF renderizado seria adivinhar o que
 * já está declarado.
 *
 * ## O que ela NÃO faz
 *
 * **Não valida.** Quem barra a finalização continua sendo
 * `validacaoFinalizacao`: obrigatório faltando bloqueia, opcional faltando
 * avisa. Esta lista responde "o que está vazio", e vazio nem sempre impede a
 * emissão (nem toda inspeção tem teste hidrostático).
 */
import { DESTINO_POR_CAMPO, secaoDoCampo } from './destinoPendencia';

/** Onde o clique leva para preencher aquilo. */
export type DestinoEdicao = 'configuracoes' | 'medicoes' | 'laudo' | null;

export interface ItemFaltante {
  /** Nome humano, curto — o que a barra lateral escreve. */
  nome: string;
  /** O painel que abre para preencher. `null` = o campo se edita no documento. */
  onde: DestinoEdicao;
  /** O id semântico do campo no documento — é por ele que o clique navega. */
  id: string;
  /** Em que página do PDF ele foi desenhado (1-based). */
  pagina: number;
  /** A seção do documento, para o agrupamento discreto da barra. */
  secao: string;
  /** No modal de Configurações: qual campo focar. */
  campoConfig?: string;
}

/**
 * As pendências CRÍTICAS do documento, na ordem em que aparecem nas folhas.
 *
 * A ordem importa: quem revisa lê a lista com o documento do lado, e uma lista
 * fora de ordem obriga a procurar. Ela é a ordem de desenho, que é a ordem das
 * páginas.
 *
 * Campos repetidos por folha entram UMA vez — a logo do cabeçalho é registrada
 * em todas as páginas de propósito (para ser clicável em qualquer uma), e
 * listá-la vinte vezes transformaria a barra num muro.
 */
export function oQueFalta(campos: CampoEditavel[]): ItemFaltante[] {
  const vistos = new Set<string>();
  const itens: ItemFaltante[] = [];

  for (const c of campos) {
    if (c.pendencia !== 'critica') continue;
    if (vistos.has(c.id)) continue;
    vistos.add(c.id);
    const destino = DESTINO_POR_CAMPO[c.id];
    itens.push({
      nome: nomeCurto(c.rotulo),
      onde: destino?.onde ?? null,
      id: c.id,
      pagina: c.pagina,
      secao: secaoDoCampo(c.id),
      ...(destino?.campo ? { campoConfig: destino.campo } : {}),
    });
  }
  return itens;
}

/**
 * O rótulo do campo vira o nome da barra.
 *
 * Os rótulos do documento são em caixa alta e às vezes carregam o contexto
 * inteiro ("3. Válvula de segurança — observação"). A barra é estreita: fica o
 * essencial, com a primeira letra maiúscula.
 */
function nomeCurto(rotulo: string): string {
  const s = rotulo.trim();
  // Tudo em caixa alta vira caixa de frase; um rótulo já misto é mantido, porque
  // ele foi escrito assim de propósito.
  const base = s === s.toLocaleUpperCase('pt-BR') ? s.toLocaleLowerCase('pt-BR') : s;
  return base.charAt(0).toLocaleUpperCase('pt-BR') + base.slice(1);
}
