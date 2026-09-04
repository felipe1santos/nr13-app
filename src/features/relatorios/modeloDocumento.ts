import { ler, salvar } from '../../services/storage';
import type { MotorPdf } from './motorPdf';
import { motorConfigurado } from './motorPdf';

/**
 * Fase 12B · o MODELO do relatório — a escolha que a empresa faz.
 *
 * ## Duas camadas, e por que elas são separadas
 *
 * | camada | quem decide | vocabulário |
 * |---|---|---|
 * | **MODELO VISUAL** (aqui) | a EMPRESA, em "Minha Empresa" | `Clássico` / `Novo` |
 * | **MOTOR TÉCNICO** (`motorPdf.ts`) | o código | `raster` / `vetorial` |
 *
 * O modelo é a linguagem do usuário: ele escolhe entre o layout tradicional do
 * sistema e o padrão novo. O motor é o detalhe de implementação — que o
 * Clássico é desenhado por `html2canvas` e o Novo por jsPDF com fonte embutida
 * não é assunto de quem opera o sistema, e mostrar isso na tela transformaria
 * uma decisão visual numa pergunta técnica que ninguém tem por que responder.
 *
 * A tradução vive só aqui, e desde o gate de 04/09/2026 ela tem uma trava:
 * **nenhum modelo OFERECIDO ao usuário pode cair no motor raster** — ver
 * `MODELOS_OFERECIDOS` abaixo. Hoje a tela oferece um modelo, e ele é vetorial.
 *
 * Manter os dois nomes não é redundância: o motor continua existindo como
 * **rollback técnico** (`?motor=` na URL, `definirMotorPdf`) e é o que os
 * geradores entendem. Se um dia houver um terceiro desenho, ou se o Novo passar
 * a ter dois motores, esta função é o único lugar que muda.
 *
 * ## A configuração é da ORGANIZAÇÃO, não do navegador
 *
 * `nr13_modelo_relatorio` é chave GLOBAL, e no armazenamento v2 global já
 * significa "da organização": o IndexedDB é `nr13_dados_<org_id>` e o
 * `app_storage` é escopado por org pela RLS. Todo usuário daquela empresa lê a
 * mesma escolha, em qualquer aparelho — que é exatamente o pedido. Não existe
 * preferência por usuário nem por navegador, e não foi criado nenhum mecanismo
 * novo de configuração para isso.
 *
 * ## O padrão quando a chave não existe
 *
 * Cai no `nr13_motor_pdf` que a organização já tiver. Isso preserva o estado de
 * quem foi virado antes desta tela existir: a org que recebeu
 * `nr13_motor_pdf = vetorial` em 04/09/2026 continua no **Novo** sem precisar
 * reconfigurar, e as demais continuam no **Clássico**. Ler a chave nova sem
 * esse encadeamento rebaixaria silenciosamente uma organização já virada.
 */
export type ModeloDocumento = 'classico' | 'novo';

export const CHAVE_MODELO_RELATORIO = 'nr13_modelo_relatorio';

/** Rótulo e descrição de cada modelo — a tela não inventa texto próprio. */
export const MODELOS: { valor: ModeloDocumento; rotulo: string; descricao: string }[] = [
  { valor: 'classico', rotulo: 'Clássico', descricao: 'Layout tradicional do sistema.' },
  { valor: 'novo', rotulo: 'Novo', descricao: 'Novo padrão visual, mais leve e moderno.' },
];

/**
 * ## A REGRA QUE NÃO SE QUEBRA (12B, gate de 04/09/2026)
 *
 * **Nenhum modelo oferecido ao usuário pode sair pelo gerador raster.**
 *
 * O raster fotografa cada folha com `html2canvas` e cola a imagem no A4: o PDF
 * não tem texto, não tem fonte embutida e não se pesquisa. Oferecer isso como
 * "Clássico" faria o usuário escolher, sem saber, entre um documento e a
 * fotografia de um documento. Ele existe daqui em diante **só como rollback
 * técnico** — `?motor=raster` na URL e `definirMotorPdf('raster')` —, fora da
 * escolha normal da empresa.
 *
 * ## Por que o Clássico está FORA da lista oferecida
 *
 * O layout Clássico mora nos 27 templates de `public/arquivos-inspecao/`
 * (14.690 linhas de HTML/CSS). Desenhá-lo no motor vetorial significa um SEGUNDO
 * conjunto de folhas ao lado de `pdfVetorial/folhas.ts` — trabalho do tamanho da
 * própria Fase 11, com um portão de fidelidade folha a folha. A ponte de dados
 * (`modelo.ts`), a paginação e as primitivas JÁ são compartilhadas e continuam
 * prontas para receber esse segundo layout; o que falta é só o layout.
 *
 * Enquanto ele não existir, a tela oferece **um** modelo. Escolher entre dois
 * desenhos em que um deles é uma fotografia seria pior do que não escolher.
 */
export const MODELOS_OFERECIDOS: ModeloDocumento[] = ['novo'];

/** O modelo é oferecido ao usuário hoje? */
export function modeloOferecido(m: ModeloDocumento): boolean {
  return MODELOS_OFERECIDOS.includes(m);
}

/** Os modelos que a tela pode mostrar, com rótulo e descrição. */
export const MODELOS_VISIVEIS = MODELOS.filter((m) => modeloOferecido(m.valor));

/**
 * O modelo que vale de fato.
 *
 * Modelo gravado (ou congelado num rascunho) que deixou de ser oferecido cai no
 * primeiro oferecido. É o degrau que garante a regra acima mesmo para quem já
 * tinha `classico` gravado — inclusive para um rascunho congelado nele.
 *
 * Isso ABRE MÃO, de propósito, de uma parte da promessa de congelamento: um
 * rascunho carimbado como Clássico passa a sair no modelo Novo. A alternativa
 * seria honrar o congelamento e emitir a fotografia — e a regra nova diz que
 * documento nenhum sai assim. Congelar serve para o desenho não mudar debaixo
 * do usuário; não serve para manter vivo um desenho que o sistema retirou.
 */
export function modeloEfetivo(m: ModeloDocumento): ModeloDocumento {
  return modeloOferecido(m) ? m : MODELOS_OFERECIDOS[0];
}

/** Só a string exata `'novo'` escolhe o modelo novo. Qualquer outra coisa é Clássico. */
export function normalizarModelo(v: unknown): ModeloDocumento {
  return String(v ?? '').trim().toLowerCase() === 'novo' ? 'novo' : 'classico';
}

/**
 * A tradução — o ÚNICO ponto onde modelo vira motor.
 *
 * Passa pelo `modeloEfetivo`, então **nenhum modelo oferecido devolve
 * `raster`**. O raster só é alcançável pela porta de rollback (`?motor=raster`
 * ou `definirMotorPdf`), que não é escolha de empresa.
 */
export function motorDoModelo(m: ModeloDocumento): MotorPdf {
  return modeloEfetivo(m) === 'novo' ? 'vetorial' : 'raster';
}

/** O caminho inverso, usado para herdar a configuração antiga da organização. */
export function modeloDoMotor(motor: MotorPdf): ModeloDocumento {
  return motor === 'vetorial' ? 'novo' : 'classico';
}

/**
 * O que está GRAVADO para a organização — sem filtrar pelo que é oferecido.
 *
 * Existe separado porque a auditoria precisa ver o valor cru: uma org com
 * `classico` gravado não perdeu a escolha, ela está esperando o layout Clássico
 * vetorial existir. Para decidir o que sai no PDF, use `modeloDaEmpresa`.
 *
 * Sem a chave nova, herda do motor já configurado (ver o cabeçalho). Storage
 * ilegível cai no Clássico, que é o comportamento histórico do sistema.
 */
export function modeloGravado(): ModeloDocumento {
  try {
    const salvo = ler<{ modelo?: string }>(CHAVE_MODELO_RELATORIO)?.modelo;
    if (salvo !== undefined && salvo !== null && String(salvo).trim() !== '') {
      return normalizarModelo(salvo);
    }
    return modeloDoMotor(motorConfigurado());
  } catch {
    return 'classico';
  }
}

/**
 * O modelo que a empresa usa DE FATO — o gravado, passado pelo filtro do que é
 * oferecido hoje. É este que carimba um rascunho novo, para que o carimbo não
 * prometa um desenho que o sistema não emite.
 */
export function modeloDaEmpresa(): ModeloDocumento {
  return modeloEfetivo(modeloGravado());
}

/** Grava a escolha da organização. Passa pelo caminho oficial de mutação. */
export async function definirModeloDaEmpresa(modelo: ModeloDocumento): Promise<void> {
  await salvar(CHAVE_MODELO_RELATORIO, { modelo: normalizarModelo(modelo), em: new Date().toISOString() });
}

/**
 * O motor que ESTE relatório deve usar ao ser finalizado.
 *
 * ## A ordem, e o motivo de cada degrau
 *
 * 1. **`?motor=` na URL** — porta de rollback/diagnóstico. Vale para uma sessão
 *    do visualizador e não muda nada para ninguém.
 * 2. **`meta.modeloDocumento`** — o modelo CONGELADO quando o rascunho nasceu.
 *    É o degrau que faz a promessa da Fase 12B: mudar a configuração da empresa
 *    depois não altera um rascunho que já estava em andamento. Sem ele, um
 *    relatório começado na segunda e finalizado na quinta sairia com o desenho
 *    de quinta — e o inspetor veria o documento mudar de cara sozinho.
 * 3. **a configuração atual da empresa** — para rascunho antigo, anterior a esta
 *    fase, que não tem o campo.
 *
 * O degrau 2 passa pelo `modeloEfetivo` (dentro de `motorDoModelo`): rascunho
 * congelado num modelo que foi RETIRADO sai no modelo oferecido, em vez de sair
 * pelo raster. É a única parte da promessa de congelamento que a regra nova
 * abre mão, e de propósito.
 *
 * Documento JÁ FINALIZADO não passa por aqui: ele tem `pdfRef` e é servido como
 * ARQUIVO (§7-quater). Nenhuma configuração de empresa alcança histórico.
 */
export function motorDoRelatorio(
  meta: { modeloDocumento?: string } | null | undefined,
  busca = '',
): MotorPdf {
  const daUrl = new URLSearchParams(busca).get('motor');
  if (daUrl !== null && daUrl.trim() !== '') {
    return daUrl.trim().toLowerCase() === 'vetorial' ? 'vetorial' : 'raster';
  }
  const congelado = meta?.modeloDocumento;
  if (congelado !== undefined && congelado !== null && String(congelado).trim() !== '') {
    return motorDoModelo(normalizarModelo(congelado));
  }
  return motorDoModelo(modeloDaEmpresa());
}
