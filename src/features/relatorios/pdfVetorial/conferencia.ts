import type { ModeloRelatorio } from './modelo';

/**
 * Fase 11 · a conferência CAMPO A CAMPO entre o que o sistema tem e o que o
 * documento imprime.
 *
 * ## Por que ela existe
 *
 * A comparação visual entre dois PDFs responde "estão parecidos?". A pergunta
 * que importa é outra: **algum dado que o sistema tem deixou de chegar ao
 * papel?** Esse é o defeito silencioso das 27 folhas atuais — a folha cai no
 * `|| '{}'`, imprime "-" e ninguém sabe que faltou.
 *
 * Aqui cada campo do documento é listado com o valor que o modelo entregou. O
 * que estiver vazio aparece POR NOME. Vazio não é necessariamente erro (nem
 * toda inspeção tem teste hidrostático), mas passa a ser uma informação, e não
 * um silêncio.
 */
export interface Conferencia {
  total: number;
  preenchidos: number;
  /** Nomes dos campos sem dado — os que sairão com travessão. */
  vazios: string[];
  /** Tudo, para o relatório da rodada. */
  campos: { nome: string; valor: string | null }[];
}

function vazio(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === '';
}

export function conferirCampos(m: ModeloRelatorio): Conferencia {
  const campos: { nome: string; valor: string | null }[] = [
    { nome: 'nº do relatório', valor: m.numeroRelatorio || null },
    { nome: 'cliente', valor: m.cliente },
    { nome: 'endereço do cliente', valor: m.clienteEndereco },
    { nome: 'tipo de inspeção', valor: m.tipoInspecao },
    { nome: 'emissão', valor: m.emissao },
    { nome: 'validade', valor: m.validade },
    { nome: 'execução', valor: m.execucao },
    { nome: 'foto da capa', valor: m.fotoCapa ? 'sim' : null },
    { nome: 'logo da executante', valor: m.empresa.logo ? 'sim' : null },
    { nome: 'razão social', valor: m.empresa.razao || null },
    ...Object.entries(m.equipamento).map(([nome, valor]) => ({ nome: nome.toLowerCase(), valor })),
    { nome: 'PMTA', valor: m.pressoes[0]?.mpa ?? null },
    { nome: 'PTH', valor: m.pressoes[1]?.mpa ?? null },
    { nome: 'enquadramento', valor: m.categoria.enquadramento },
    { nome: 'componentes do memorial', valor: m.componentes.length ? String(m.componentes.length) : null },
    { nome: 'linhas da memória de cálculo', valor: m.memorial.length ? String(m.memorial.length) : null },
    { nome: 'seções de checklist', valor: m.checklist.length ? String(m.checklist.length) : null },
    { nome: 'comentários da documentação', valor: m.comentariosDocumentacao },
    { nome: 'fotos da documentação', valor: m.fotosDocumentacao.length ? String(m.fotosDocumentacao.length) : null },
    { nome: 'fotos do checklist', valor: m.fotosChecklist.length ? String(m.fotosChecklist.length) : null },
    { nome: 'itens do exame externo', valor: m.visualExterno.itens.length ? String(m.visualExterno.itens.length) : null },
    { nome: 'observações do exame externo', valor: m.visualExterno.observacoes },
    { nome: 'fotos do exame externo', valor: m.visualExterno.fotos.length ? String(m.visualExterno.fotos.length) : null },
    { nome: 'itens do exame interno', valor: m.visualInterno.itens.length ? String(m.visualInterno.itens.length) : null },
    { nome: 'observações do exame interno', valor: m.visualInterno.observacoes },
    { nome: 'fotos do exame interno', valor: m.visualInterno.fotos.length ? String(m.visualInterno.fotos.length) : null },
    { nome: 'aparelho de ultrassom', valor: m.ultrassom.aparelho },
    { nome: 'pontos de medição', valor: m.ultrassom.pontos.length ? String(m.ultrassom.pontos.length) : null },
    { nome: 'instrumento padrão', valor: m.ultrassom.instrumento.padrao },
    { nome: 'pressão do teste hidrostático', valor: m.th.pressaoTeste },
    { nome: 'curva do teste hidrostático', valor: m.th.curva.length ? String(m.th.curva.length) : null },
    { nome: 'fotos do teste hidrostático', valor: m.th.fotos.length ? String(m.th.fotos.length) : null },
    { nome: 'laudo APTO/INAPTO', valor: m.laudo.apto === null ? null : String(m.laudo.apto) },
    { nome: 'próxima inspeção interna', valor: m.proximas.interna },
    { nome: 'próxima inspeção externa', valor: m.proximas.externa },
    { nome: 'assinantes', valor: m.assinantes.length ? String(m.assinantes.length) : null },
    { nome: 'rubrica do engenheiro', valor: m.assinantes[0]?.rubrica ? 'sim' : null },
  ];

  const vazios = campos.filter((c) => vazio(c.valor)).map((c) => c.nome);
  return {
    total: campos.length,
    preenchidos: campos.length - vazios.length,
    vazios,
    campos,
  };
}
