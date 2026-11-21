/**
 * ABRIR O LIVRO A QUALQUER MOMENTO (21/11/2026).
 *
 * ## O defeito relatado
 *
 * "Apenas quando defini 'inicial' abre o registro de segurança… precisa abrir o
 * livro com equipamento em operação quando se perde o livro original."
 *
 * O Termo de Abertura só existia como folha AUTO-INJETADA: o relatório o
 * acrescenta (`montarListaComTermoAbertura`) quando o Livro de Registro entra
 * na composição e o livro da TAG está vazio. Fora desse caminho — equipamento
 * em operação cujo livro físico se perdeu, livro que esgotou as folhas — não
 * havia como lavrar a abertura: o livro só "começava" com uma inspeção.
 *
 * ## O desenho, e por que ele não toca no que é imutável
 *
 * Abrir o livro é um REGISTRO como os outros, do tipo `TIPO_ABERTURA`: nasce
 * rascunho (`nr13_livro_rascunho_<TAG>`), é revisado na mesma prévia, e só ao
 * ser TRANCADO entra em `nr13_livro_<TAG>` — ACRESCENTADO AO FIM, lacrado com o
 * hash do conteúdo e o elo do anterior (`livroLacre.ts`). Nada é apagado nem
 * reescrito: um livro reconstituído convive com as entradas antigas que
 * existirem, e é exatamente o que a trava do banco (`livro_imutavel.sql`)
 * aceita — a sequência lacrada nova começa pela antiga.
 *
 * O MOTIVO é obrigatório e vai escrito no próprio registro (na descrição e no
 * termo): "primeiro livro", "livro anterior extraviado" e "livro anterior
 * encerrado" são afirmações diferentes num documento que a fiscalização lê, e o
 * sistema não adivinha qual delas é a verdade.
 *
 * O que NÃO muda: `nr13_livro_config_<TAG>` (total de folhas) e a folha
 * `TERMO-ABERTURA.html`, que continua montada dos dados vivos do equipamento.
 */
import { ler } from '../../services/storage';
import type { EmpresaEquipamento, InfoEquipamento } from '../equipamento/tipos';
import { NR13_PORTARIA, itemRegistroSeguranca } from '../normas/nr13';
import { dataParaBR } from './termoRegistro';

/** O tipo do registro que abre um livro. Gravado em `entrada.tipo`. */
export const TIPO_ABERTURA = 'Abertura de livro';

export type MotivoAbertura = 'primeiro' | 'extravio' | 'encerrado';

export interface OpcaoMotivo {
  id: MotivoAbertura;
  /** O que o usuário lê na escolha. */
  rotulo: string;
  /** Uma linha de apoio sob o rótulo. */
  apoio: string;
  /** O "o que foi feito" que o motivo sugere — e que identifica o motivo de volta. */
  descricao: string;
}

export const MOTIVOS_ABERTURA: readonly OpcaoMotivo[] = [
  {
    id: 'primeiro',
    rotulo: 'Primeiro livro do equipamento',
    apoio: 'O equipamento nunca teve Livro de Registro de Segurança.',
    descricao: 'Abertura do Livro de Registro de Segurança',
  },
  {
    id: 'extravio',
    rotulo: 'Livro anterior perdido ou danificado',
    apoio: 'Equipamento em operação: o livro original foi extraviado, perdido ou inutilizado.',
    descricao: 'Abertura de novo Livro de Registro de Segurança — o livro anterior foi extraviado',
  },
  {
    id: 'encerrado',
    rotulo: 'Livro anterior encerrado',
    apoio: 'As folhas do livro anterior acabaram e ele foi encerrado.',
    descricao: 'Abertura de novo Livro de Registro de Segurança — continuação do livro anterior, encerrado',
  },
];

export function ehAbertura(tipo: string | null | undefined): boolean {
  return tipo === TIPO_ABERTURA;
}

/** O motivo pelo texto do "o que foi feito" — é como o rascunho reaberto o recupera. */
export function motivoPelaDescricao(descricao: string | null | undefined): MotivoAbertura | '' {
  const d = String(descricao ?? '').trim();
  // Do mais longo para o mais curto: a descrição do "primeiro" é prefixo das
  // outras duas, e um `startsWith` na ordem da lista acertaria sempre ela.
  const ordenados = [...MOTIVOS_ABERTURA].sort((a, b) => b.descricao.length - a.descricao.length);
  return ordenados.find((m) => d.startsWith(m.descricao))?.id ?? '';
}

/** O "o que foi feito" de um motivo. */
export function descricaoDoMotivo(motivo: MotivoAbertura | '' | undefined): string {
  return MOTIVOS_ABERTURA.find((m) => m.id === motivo)?.descricao ?? '';
}

/**
 * O texto do campo deve ser trocado ao escolher outro motivo?
 *
 * Só quando ele está vazio ou ainda é a frase de um motivo: o que o usuário
 * escreveu à mão não é reescrito por um clique.
 */
export function podeTrocarDescricao(atual: string): boolean {
  const t = atual.trim();
  return t === '' || MOTIVOS_ABERTURA.some((m) => m.descricao === t);
}

/** O que o termo de abertura cita do equipamento e do cliente. */
export interface DadosAberturaEquipamento {
  tag: string;
  tipo: string | null;
  descricao: string;
  fabricante: string;
  numeroSerie: string;
  cliente: string;
  cnpj: string;
  endereco: string;
  totalFolhas: number;
}

const ROTULO_TIPO: Record<string, string> = {
  vaso: 'Vaso de Pressão',
  caldeira: 'Caldeira',
  autoclave: 'Autoclave',
};

/**
 * Os dados do termo, do cache — as MESMAS chaves que `TERMO-ABERTURA.html` lê
 * (`nr13_info_`, `nr13_emp_`, `nr13_livro_config_`). Sem cadastro, cada campo
 * fica vazio e o texto escreve o mesmo marcador que a folha imprimiria.
 */
export function dadosAberturaDoCache(tag: string): DadosAberturaEquipamento {
  const info = ler<Partial<InfoEquipamento> & { serie?: string }>(`nr13_info_${tag}`) ?? {};
  const emp = ler<EmpresaEquipamento>(`nr13_emp_${tag}`) ?? {};
  const config = ler<{ totalFolhas?: number | string }>(`nr13_livro_config_${tag}`) ?? {};
  const endereco = [
    emp.endereco,
    emp.bairro,
    emp.cidade && emp.estado ? `${emp.cidade}/${emp.estado}` : emp.cidade,
    emp.cep ? `CEP: ${emp.cep}` : '',
  ]
    .map((p) => String(p ?? '').trim())
    .filter(Boolean)
    .join(', ');
  const folhas = Number(config.totalFolhas);
  return {
    tag,
    tipo: info.tipo ?? null,
    descricao: String(info.descricao ?? '').trim(),
    fabricante: String(info.fabricante ?? '').trim(),
    numeroSerie: String(info.numeroSerie ?? info.serie ?? '').trim(),
    cliente: String(emp.razaoSocial || emp.nomeFantasia || '').trim(),
    cnpj: String(emp.cnpj ?? '').trim(),
    endereco,
    // 50 é o padrão da folha `TERMO-ABERTURA.html`.
    totalFolhas: Number.isFinite(folhas) && folhas > 0 ? Math.trunc(folhas) : 50,
  };
}

/**
 * Número por extenso, como a folha `TERMO-ABERTURA.html` escreve o total de
 * folhas. Cópia da de `pdfVetorial/livroRegistro.ts` de propósito: importar
 * aquela traria o modelo inteiro do PDF para a tela do livro.
 */
export function porExtenso(valor: number): string {
  const n = Math.trunc(valor);
  if (!Number.isFinite(n)) return String(valor);
  if (n === 0) return 'zero';
  const un = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
  const dez = ['dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const dz = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const ct = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  const tres = (x: number): string => {
    if (x === 0) return '';
    if (x === 100) return 'cem';
    const partes: string[] = [];
    if (x >= 100) partes.push(ct[Math.floor(x / 100)]);
    const r = x % 100;
    if (r > 0 && r < 10) partes.push(un[r]);
    else if (r >= 10 && r < 20) partes.push(dez[r - 10]);
    else if (r >= 20) partes.push(r % 10 ? `${dz[Math.floor(r / 10)]} e ${un[r % 10]}` : dz[Math.floor(r / 10)]);
    return partes.join(' e ');
  };
  if (n < 1000) return tres(n);
  const mil = Math.floor(n / 1000);
  const resto = n % 1000;
  return `${mil === 1 ? 'mil' : `${tres(mil)} mil`}${resto ? ` e ${tres(resto)}` : ''}`;
}

const FRASE_MOTIVO: Record<MotivoAbertura, string> = {
  primeiro: '',
  extravio:
    ' Este livro substitui o Livro de Registro de Segurança anterior, que foi extraviado, perdido ou ' +
    'inutilizado com o equipamento em operação; os registros anteriores a esta data que não constarem ' +
    'deste sistema não fazem parte deste livro.',
  encerrado:
    ' Este livro dá continuidade ao Livro de Registro de Segurança anterior, encerrado por esgotamento ' +
    'de suas folhas.',
};

/**
 * O Termo de Abertura sugerido — a redação de `TERMO-ABERTURA.html`, com a
 * data e o motivo da abertura. É ponto de partida: o campo é editável e o texto
 * do usuário vence, como em todo registro.
 */
export function termoDeAbertura(d: {
  data: string;
  motivo: MotivoAbertura | '' | undefined;
  equipamento: DadosAberturaEquipamento;
}): string {
  const e = d.equipamento;
  const dataBR = dataParaBR(d.data) || '--';
  const tipo = (e.tipo && ROTULO_TIPO[e.tipo]) || 'Vaso de Pressão';
  // A descrição só entra quando acrescenta informação — a mesma regra da folha
  // ("Vaso de Pressão vaso" era o defeito).
  const primeira = tipo.toLowerCase().split(' ')[0];
  const complemento = e.descricao && !e.descricao.toLowerCase().includes(primeira) ? ` ${e.descricao}` : '';
  const folhas = e.totalFolhas;
  const corpo =
    `Em ${dataBR}, lavra-se o presente Termo de Abertura. Este livro contém ${folhas} ` +
    `(${porExtenso(folhas)}) folhas numeradas ` +
    `tipograficamente de 01 a ${String(folhas).padStart(2, '0')} e servirá como Livro de Registro de ` +
    `Segurança do ${tipo}${complemento}${e.fabricante ? `, fabricado por ${e.fabricante}` : ''}, TAG ${e.tag}, ` +
    `Número de Série: ${e.numeroSerie || '--'}, da Empresa ${e.cliente || 'EMPRESA NÃO INFORMADA'}, sob o CNPJ: ` +
    `${e.cnpj || 'CNPJ não informado'}, ${e.endereco || 'Endereço não informado'}. Em atendimento ao subitem ` +
    `${itemRegistroSeguranca(e.tipo)} da Norma Regulamentadora nº 13 (${NR13_PORTARIA}).`;
  return corpo + (d.motivo ? FRASE_MOTIVO[d.motivo] : '');
}

/**
 * Por que este motivo NÃO pode ser usado neste livro — ou `''` quando pode.
 *
 * "Primeiro livro" num equipamento que já tem registro lacrado afirmaria, num
 * documento legal, que o histórico anterior não existe. Os outros dois motivos
 * servem a qualquer livro, vazio ou não: o livro perdido pode nunca ter sido
 * lançado no sistema.
 */
export function impedimentoDoMotivo(
  motivo: MotivoAbertura | '' | undefined,
  registrosLacrados: number,
): string {
  if (!motivo) return 'Escolha o motivo da abertura do livro.';
  if (motivo === 'primeiro' && registrosLacrados > 0) {
    return 'Este equipamento já tem registros lacrados no livro. Para abrir um livro novo, escolha "Livro anterior perdido ou danificado" ou "Livro anterior encerrado".';
  }
  return '';
}
