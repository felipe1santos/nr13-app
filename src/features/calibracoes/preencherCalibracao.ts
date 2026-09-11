import { ler } from '../../services/storage';
import { padraoDoEnsaio, tipoPadraoDoCertificado } from '../relatorios/rastreabilidadeService';
import type { ComponenteCal } from './componentesService';
import { PONTOS_NA_FOLHA } from './resultadosCalibracao';

/**
 * O que o sistema JÁ SABE quando o usuário abre uma calibração nova.
 *
 * ## O que este módulo conserta (10/09/2026)
 *
 * O formulário de calibração pedia trinta campos, e a maior parte deles já
 * existia em outro lugar do sistema. Três buracos, medidos em produção na conta
 * de teste, todos SILENCIOSOS — o certificado saía com `----` e ninguém via
 * erro nenhum:
 *
 * 1. **Cliente / solicitante em branco.** `empresaAutoFill()` lia
 *    `localStorage.getItem('nr13_minha_empresa')` **direto**. Numa organização
 *    v2 o `localStorage` é só o PALCO (§2-ter): a chave não está lá, a leitura
 *    devolvia `{}` e o bloco 1 do certificado saía vazio em toda calibração.
 *    De quebra, preenchia com a empresa EXECUTANTE um bloco cujo título é
 *    "DADOS DO CLIENTE / SOLICITANTE" — e o rodapé da folha já imprime a
 *    executante. Agora vem do dono do equipamento (`nr13_emp_<TAG>`).
 * 2. **Padrão utilizado em branco.** Os quatro campos do bloco 5
 *    ("PADRÕES UTILIZADOS E RASTREABILIDADE METROLÓGICA") eram digitados à mão
 *    a cada certificado, embora o cadastro de **Certificados** guarde
 *    exatamente esses quatro dados por tipo de instrumento. A mesma
 *    `padraoDoEnsaio()` que preenche o bloco do ULTRASSOM serve aqui — a regra
 *    de escolha do padrão passa a ser uma só no sistema.
 * 3. **Data da próxima calibração em branco.** Sem valor, o template mantém o
 *    próprio texto de exemplo e o certificado emitido imprime literalmente
 *    `DD/MM/AAAA` no lugar de uma data.
 *
 * ## A regra
 *
 * Tudo aqui é SUGESTÃO: preenche o campo e o usuário edita. Nada é gravado
 * fora do registro da calibração, e nenhuma dessas leituras altera cadastro.
 */

/** Intervalo legal usual entre calibrações de acessório, em meses. */
export const MESES_ATE_PROXIMA = 12;

export interface PadraoSugerido {
  padraoInst: string;
  padraoSerie: string;
  padraoCert: string;
  padraoVal: string;
  /** De onde veio — a tela diz isso ao usuário em vez de fingir que ele digitou. */
  origem: string | null;
}

function dataBr(v: string | undefined | null): string {
  const s = (v ?? '').trim();
  if (s === '') return '';
  // O cadastro de Certificados grava `aaaa-mm-dd` (input type=date); a folha
  // imprime dd/mm/aaaa. Converter aqui evita um `2026-09-27` no documento.
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : s;
}

/**
 * O padrão cadastrado em **Certificados** para o tipo daquele instrumento.
 *
 * Manômetro calibra-se contra um padrão de pressão (`manometro`); válvula de
 * segurança, contra o padrão de válvula (`valvula`). É a mesma correspondência
 * que `tipoPadraoDoCertificado` já usava para anexar o PDF do padrão ao
 * relatório — reusada para que o texto do bloco 5 e o PDF anexado nunca falem
 * de instrumentos diferentes.
 */
export function padraoSugerido(tipo: 'manometro' | 'psv', tag: string): PadraoSugerido {
  const r = padraoDoEnsaio(tipoPadraoDoCertificado(tipo), tag);
  if (!r) return { padraoInst: '', padraoSerie: '', padraoCert: '', padraoVal: '', origem: null };
  return {
    padraoInst: [r.nome, r.aparelho].filter((x) => (x ?? '').trim() !== '').join(' — '),
    padraoSerie: r.numeroSerie ?? '',
    padraoCert: r.certificadoPadrao ?? '',
    padraoVal: dataBr(r.validade),
    origem: r.nome || 'Certificado cadastrado',
  };
}

/** Razão social e endereço do DONO do equipamento, para o bloco 1 da folha. */
export function clienteDoEquipamento(tag: string): { empresa: string; endereco: string } {
  const e = ler<Record<string, unknown>>(`nr13_emp_${tag}`) ?? {};
  const txt = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const empresa = txt(e.razaoSocial) || txt(e.nomeFantasia) || txt(e.nome);
  const endereco = [e.endereco, e.bairro, e.cidade ?? e.localidade, e.estado]
    .map(txt)
    .filter((p) => p !== '')
    .join(', ');
  return { empresa, endereco };
}

/**
 * `dd/mm/aaaa` + 12 meses. Data inválida devolve `''` — chutar uma validade
 * num certificado seria pior do que deixar o campo para o usuário.
 */
export function proximaCalibracao(dataCal: string, meses = MESES_ATE_PROXIMA): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((dataCal ?? '').trim());
  if (!m) return '';
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const ano = Number(m[3]);
  const d = new Date(ano, mes - 1 + meses, dia);
  // 31/03 + 12 meses continua 31/03; 29/02 de ano bissexto viraria 01/03 —
  // recuar para o último dia do mês é o que uma agenda faz.
  if (d.getDate() !== dia) d.setDate(0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * A frase da conclusão, quando o usuário não escreve motivo nenhum.
 *
 * O template monta a conclusão como UMA frase costurada:
 * *"…está \<status\>, pois durante o processo, o mesmo \<motivo\>"*. Com motivo
 * vazio, o certificado emitido termina em "o mesmo" e some o ponto final —
 * medido na folha de PSV-GATE-9F3. O texto abaixo é o MESMO que o
 * `atualizarConclusao()` do template escreve quando se usa o seletor dele.
 */
export function motivoPadrao(status: 'aprovado' | 'reprovado' | ''): string {
  if (status === 'aprovado') {
    return 'apresentou resultados dentro dos critérios de aceitação e parâmetros definidos neste documento.';
  }
  if (status === 'reprovado') {
    return 'apresentou resultados fora dos critérios de aceitação e parâmetros definidos neste documento.';
  }
  return '';
}

/**
 * Os pontos de calibração do componente, ou cinco linhas em branco.
 *
 * O corte em `PONTOS_NA_FOLHA` não é preferência de tela: é o número de linhas
 * que as tabelas do certificado imprimem. Cadastrar sete pontos e medir os sete
 * faria o sétimo sumir do documento emitido, em silêncio — a tela avisa no
 * cadastro, e aqui a sugestão já entra no tamanho que cabe.
 */
export function pontosDoComponente(comp?: ComponenteCal | null): string[] {
  const p = (comp?.pontos ?? []).map((x) => String(x ?? '').trim()).filter((x) => x !== '');
  return p.length > 0 ? p.slice(0, PONTOS_NA_FOLHA) : ['', '', '', '', ''];
}

/** Unidade do componente, com o padrão da NR-13 para pressão. */
export const UNIDADE_PADRAO = 'kgf/cm²';
export const UNIDADES = [UNIDADE_PADRAO, 'bar', 'MPa', 'psi'];

export function unidadeDoComponente(comp?: ComponenteCal | null): string {
  const u = (comp?.unidade ?? '').trim();
  return u !== '' ? u : UNIDADE_PADRAO;
}

/**
 * `"0, 2, 4, 6, 8, 10"` → `['0','2','4','6','8','10']`.
 *
 * Uma linha de texto em vez de N campinhos: os pontos de um manômetro são uma
 * sequência curta e regular, e digitá-la de uma vez é mais rápido do que
 * acertar cinco caixas. Ponto-e-vírgula e quebra de linha valem como vírgula
 * porque é o que sai de uma planilha colada.
 */
export function pontosDeTexto(texto: string): string[] {
  return (texto ?? '')
    .split(/[,;\n]/)
    .map((p) => p.trim())
    .filter((p) => p !== '');
}

export function textoDePontos(pontos: string[] | undefined): string {
  return (pontos ?? []).join(', ');
}
