/**
 * O que o registro vai dizer — antes de ele existir.
 *
 * ## Por que este módulo existe
 *
 * O texto do Termo mora em `public/arquivos-inspecao/LIVRO-REGISTRO.html`, que é
 * a folha legal: ela monta a frase no `DOMContentLoaded`, a partir do que já
 * está gravado. Quem preenche o modal não vê nada disso — salvava um rascunho e
 * só descobria a redação final quando o registro já estava trancado.
 *
 * Aqui a MESMA regra roda no app, para a prévia e para sugerir o texto inicial
 * do campo editável. As duas frases (inspeção e ocorrência) são cópia fiel da
 * folha, incluindo a troca de "apto"/"INAPTO" — divergir aqui seria mostrar uma
 * prévia que não é o documento.
 *
 * ## O texto sugerido é um PONTO DE PARTIDA
 *
 * Assim que o usuário escreve o dele, `termoTexto` passa a valer e nada mais o
 * sobrescreve — é o mesmo contrato que a folha já respeita para o termo
 * congelado das entradas automáticas (`aplicarTermoSomenteLeitura`).
 */

/** `aaaa-mm-dd` → `dd/mm/aaaa`; qualquer outro formato passa intacto. */
export function dataParaBR(data: string | undefined): string {
  const bruta = String(data ?? '').trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bruta);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : bruta;
}

/** Os três tipos que a folha trata como INSPEÇÃO (o resto é ocorrência). */
const TIPOS_INSPECAO: Record<string, string> = {
  'Inspeção Inicial': 'inicial',
  'Inspeção Periódica': 'periódica',
  'Inspeção Extraordinária': 'extraordinária',
};

export function ehInspecao(tipo: string): boolean {
  return Object.prototype.hasOwnProperty.call(TIPOS_INSPECAO, tipo);
}

export interface DadosTermo {
  tipo: string;
  /** Data da ocorrência, em ISO ou já em `dd/mm/aaaa`. */
  data: string;
  /** Razão social da empresa executante (`nr13_minha_empresa`). */
  empresa: string;
  /** Código do relatório, quando o registro nasce de um. */
  relatorioCodigo?: string;
  /** Laudo APTO/INAPTO; `null`/ausente = não marcado. */
  apto?: boolean | null;
  /** O que foi feito + detalhe — usado no termo de OCORRÊNCIA. */
  descricao?: string;
}

/**
 * O termo sugerido, na redação da folha.
 *
 * Vazio nunca: sem data ou sem empresa a frase sai com os mesmos marcadores que
 * a folha usaria (`--`, "NOME DA EMPRESA NÃO INFORMADO"), porque é isso que
 * sairia impresso — inventar um texto bonito aqui esconderia um cadastro
 * faltando.
 */
export function termoSugerido(d: DadosTermo): string {
  const dataBR = dataParaBR(d.data) || '--';
  const empresa = d.empresa.trim() || 'NOME DA EMPRESA NÃO INFORMADO';

  if (!ehInspecao(d.tipo)) {
    const desc = (d.descricao ?? '').trim() || '--';
    return `Em ${dataBR}, registrou-se a seguinte ocorrência relevante para a segurança do equipamento: ${desc}.`;
  }

  const situacao =
    d.apto === false
      ? 'foi considerado INAPTO a operar nas condições atuais, conforme conclusão do referido relatório'
      : 'está apto a operar dentro da PMTA estipulada';
  return (
    `Em ${dataBR}, executou-se inspeção de segurança ${TIPOS_INSPECAO[d.tipo]}, conforme item 13.5.4 ` +
    `da NR-13, pela empresa habilitada ${empresa}, em obediência à Portaria Mtb nº 3.214, onde o ` +
    `equipamento a que se refere o relatório de inspeção n° ${d.relatorioCodigo || '--'} ${situacao}.`
  );
}

export interface DadosPrevia {
  tag: string;
  equipamento: string;
  empresa: string;
  data: string;
  tipo: string;
  oQueFoiFeito: string;
  descricao: string;
  quemRealizou: string;
  assinante: string;
  /** Texto do termo — o do usuário quando existe, senão o sugerido. */
  termo: string;
  relatorioCodigo?: string;
}

/**
 * O título do bloco do termo, igual ao da folha: inspeção e ocorrência não são
 * a mesma coisa no livro, e o rótulo é o que diz qual delas está sendo lavrada.
 */
export function tituloTermo(tipo: string): string {
  return ehInspecao(tipo) ? 'Termo de Inspeção:' : 'Termo de Ocorrência:';
}

/** A descrição como ela é gravada: "o que foi feito — detalhe". */
export function descricaoCombinada(oQueFoiFeito: string, descricao: string): string {
  return [oQueFoiFeito.trim(), descricao.trim()].filter(Boolean).join(' — ');
}
