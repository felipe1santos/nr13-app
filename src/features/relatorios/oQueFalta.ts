import type { ModeloRelatorio } from './pdfVetorial/modelo';

/**
 * Fase 13D · a lista do que ainda falta preencher.
 *
 * ## O que ela é, e o que ela não é
 *
 * É **apoio** ao amarelo da prévia, não substituto: o amarelo mostra ONDE, no
 * documento, o campo está vazio; a lista mostra O QUÊ, sem o revisor precisar
 * rolar doze folhas. As duas saem da mesma fonte — o modelo que desenha o PDF —,
 * então não há como uma dizer uma coisa e a outra dizer outra.
 *
 * **Não valida nada.** Quem barra a finalização continua sendo
 * `validacaoFinalizacao`: obrigatório faltando bloqueia, opcional faltando
 * avisa. Esta lista não conhece essa diferença de propósito — ela responde
 * "o que está vazio", e vazio nem sempre é problema (nem toda inspeção tem
 * teste hidrostático).
 *
 * `onde` é o destino do clique: qual painel abre para preencher aquilo. `null`
 * quando o campo vem de uma tela fora do relatório (a ficha do equipamento, o
 * memorial), e nesse caso o item só informa.
 */
export type DestinoEdicao = 'configuracoes' | 'medicoes' | 'laudo' | null;

export interface ItemFaltante {
  nome: string;
  onde: DestinoEdicao;
}

function vazio(v: string | null | undefined): boolean {
  const t = (v ?? '').trim();
  return t === '' || t === '—' || t === '-';
}

/**
 * Os campos vazios do documento, na ordem em que aparecem nas folhas.
 *
 * A ordem importa: quem revisa lê a lista com o documento do lado, e uma lista
 * fora de ordem obriga a procurar. Cobre o que o documento imprime — não a ficha
 * inteira do equipamento.
 */
export function oQueFalta(m: ModeloRelatorio): ItemFaltante[] {
  const faltando: ItemFaltante[] = [];
  const marcar = (nome: string, valor: string | null | undefined, onde: DestinoEdicao = null) => {
    if (vazio(valor)) faltando.push({ nome, onde });
  };

  // Capa e cabeçalho
  marcar('Número do relatório', m.numeroRelatorio, 'configuracoes');
  marcar('Cliente', m.cliente);
  marcar('Data da inspeção', m.execucao, 'configuracoes');
  marcar('Validade da inspeção', m.validade, 'configuracoes');

  // Identificação — os campos da ficha do equipamento
  for (const [nome, valor] of Object.entries(m.equipamento)) {
    marcar(rotuloAmigavel(nome), valor);
  }

  // Pressões
  for (const p of m.pressoes) {
    marcar(p.rotulo.split('—')[0].trim(), p.mpa);
  }

  // Categorização
  marcar('Categoria NR-13', m.categoria.catFinal);
  marcar('Grupo de risco', m.categoria.grupo);
  marcar('Enquadramento na NR-13', m.categoria.enquadramento);

  // Ensaios
  if (m.ultrassom.pontos.length === 0) {
    faltando.push({ nome: 'Medições de espessura', onde: 'medicoes' });
  } else {
    const semMedida = m.ultrassom.pontos.filter((p) => p.medidas.every((v) => vazio(v)));
    for (const p of semMedida) faltando.push({ nome: `Medição · ${p.ponto}`, onde: 'medicoes' });
  }

  // Parecer
  marcar('Laudo (apto / inapto)', m.laudo.apto === null ? null : 'ok', 'laudo');
  marcar('Próxima inspeção interna', m.proximas.interna, 'configuracoes');
  marcar('Próxima inspeção externa', m.proximas.externa, 'configuracoes');

  // Assinatura
  if (m.assinantes.length === 0) faltando.push({ nome: 'Assinantes', onde: 'configuracoes' });

  return faltando;
}

/** Os rótulos do documento são em caixa alta; a lista fala como gente. */
function rotuloAmigavel(nome: string): string {
  const s = nome.toLocaleLowerCase('pt-BR');
  return s.charAt(0).toLocaleUpperCase('pt-BR') + s.slice(1);
}
