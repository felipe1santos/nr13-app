/**
 * Fase 9 · 9F.2 — **O TESTE BLOQUEANTE DESTA ETAPA.**
 *
 * ## O risco que ele existe para impedir
 *
 * O prontuário abrir VAZIO.
 *
 * Tirar o `lerTudo()` de `/prontuarios` significa que o cache passa a ter
 * apenas o que alguém semeou. O visualizador monta o palco com
 * `palco.coletarItens(tag)`, que só enxerga o que `cacheLocal` tem indexado
 * para aquela TAG. Se `carregarEquipamento(tag)` não trouxer uma família que
 * alguma das seis folhas lê, o template cai no `|| '{}'` de sempre, imprime "-"
 * e **não reclama**: sem erro no console, sem teste vermelho, sem nada. O
 * defeito só aparece quando um engenheiro confere folha por folha — foi assim
 * três vezes na virada para a v2 (§2-ter do CLAUDE.md).
 *
 * ## O cruzamento
 *
 *   chaves que as folhas do prontuário LEEM   (varredura de `public/`)
 *                        ×
 *   chaves que `carregarEquipamento(tag)` COLOCA no cache
 *
 * Toda chave do primeiro conjunto precisa estar coberta pelo segundo — ou por
 * uma das duas rotas declaradas abaixo (essenciais do boot leve; escrita pelo
 * próprio app na montagem do documento). Chave nova numa folha, sem cobertura,
 * QUEBRA este teste.
 *
 * É o irmão do `palco.varreduraTemplates.test.ts`: aquele garante que o palco
 * MATERIALIZA o que os templates leem; este garante que a semeadura sob demanda
 * TEM o que materializar.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chavesDoEquipamento } from '../equipamento/equipamentoService';
import { CHAVES_ESSENCIAIS, PREFIXOS_ESSENCIAIS } from '../../services/essencial';
import { FORA_DO_PALCO } from '../../services/palco';
import { PAGINAS_PRONTUARIO } from './tipos';

const TAG = 'VP-TESTE/9F2';
const RAIZ = join(process.cwd(), 'public');

/**
 * Scripts que TODA folha do prontuário inclui. Entram na varredura porque as
 * chaves que eles leem são tão obrigatórias quanto as do HTML — foi
 * `pront-assinatura.js` que trouxe `nr13_assinantes_pront_` para a lista.
 */
const SCRIPTS_COMUNS = ['pront-assinatura.js', 'pront-footer.js', 'sb-storage.js'];

/**
 * Chaves que o PRÓPRIO APP escreve no `localStorage` ao montar o documento —
 * não vêm do cache e não são semeadas. `nr13_prontuario_atual` é gravada pelo
 * visualizador antes de montar os iframes; as outras duas são do fluxo do
 * relatório e ficam vazias aqui, o que é o comportamento correto.
 */
const ESCRITAS_NA_MONTAGEM = new Set([
  'nr13_prontuario_atual',
  'nr13_relatorio_meta_atual',
  'nr13_inspecao_atual',
  'nr13_injecao_atual',
]);

/** Tokens que aparecem em `public/` e não são chave de dado. */
const NAO_SAO_DADO = new Set([
  'nr13_salvar',
  'nr13_salvo',
  'nr13_erro_ponte',
  'nr13_fila_ponte',
  'nr13_papel',
  // Famílias mortas: nenhum arquivo de `src/` grava. Já declaradas assim no
  // `palco.varreduraTemplates.test.ts`.
  'nr13_caldeira_aqua_tubulaoSup_',
  'nr13_caldeira_aqua_fundoEliptico_',
]);

function texto(arquivo: string): string {
  return readFileSync(join(RAIZ, arquivo), 'utf8');
}

/** Todo token `nr13_...` citado pelas folhas do prontuário e seus scripts. */
function tokensDoProntuario(): Map<string, string[]> {
  const achados = new Map<string, string[]>();
  const arquivos = [
    ...PAGINAS_PRONTUARIO.map((p) => join('arquivos-prontuario', p)),
    ...SCRIPTS_COMUNS,
  ];
  for (const arquivo of arquivos) {
    for (const [token] of texto(arquivo).matchAll(/nr13_[A-Za-z0-9_]+/g)) {
      const lista = achados.get(token) ?? [];
      if (!lista.includes(arquivo)) lista.push(arquivo);
      achados.set(token, lista);
    }
  }
  return achados;
}

/**
 * A semeadura cobre este token?
 *
 * Um token terminado em `_` é prefixo de família por TAG; os demais são chave
 * inteira (global). O `nr13_calibracao_item_` é o caso especial: a chave tem id
 * próprio e vem na SEGUNDA passada de `carregarEquipamento`, filtrada pela
 * lista `nr13_calibracoes_<TAG>` — por isso não sai de `chavesDoEquipamento`.
 */
function cobertoPelaSemeadura(token: string): boolean {
  const semeadas = chavesDoEquipamento(TAG);

  if (FORA_DO_PALCO.some((p) => token.startsWith(p))) return true; // exclusão deliberada
  if (ESCRITAS_NA_MONTAGEM.has(token)) return true;
  if (CHAVES_ESSENCIAIS.includes(token)) return true; // vêm no boot leve
  if (PREFIXOS_ESSENCIAIS.some((p) => token.startsWith(p))) return true;
  if (token === 'nr13_calibracao_item_') return true; // 2ª passada, por id

  if (token.endsWith('_')) return semeadas.includes(token + TAG);
  return false;
}

describe('9F.2 · o prontuário não pode abrir vazio', () => {
  it('TODA chave lida pelas folhas do prontuário é semeada por carregarEquipamento', () => {
    const descobertos: string[] = [];

    for (const [token, arquivos] of tokensDoProntuario()) {
      if (NAO_SAO_DADO.has(token)) continue;
      if (!cobertoPelaSemeadura(token)) descobertos.push(`${token}  (lida em: ${arquivos.join(', ')})`);
    }

    // Mensagem explícita: quem quebrar este teste precisa saber o que fazer —
    // acrescentar a família a `POR_TAG` (familiasChave.ts) ou declará-la aqui
    // com o motivo de não ser semeada.
    expect(descobertos, `Chaves que a folha lê e a semeadura NÃO traz:\n${descobertos.join('\n')}`).toEqual([]);
  });

  it('as famílias que sustentam o documento estão na semeadura, uma a uma', () => {
    const semeadas = chavesDoEquipamento(TAG);
    // Lista explícita e literal, de propósito: se alguém tirar uma família de
    // `POR_TAG`, o teste diz QUAL sumiu, em vez de falhar em um `every` opaco.
    for (const prefixo of [
      'nr13_info_',
      'nr13_calc_',
      'nr13_calc_gv_',
      'nr13_cat_',
      'nr13_emp_',
      'nr13_vaso_',
      'nr13_vaso_ac_corpo_',
      'nr13_vaso_gv_',
      'nr13_caldeira_dados_costado_',
      'nr13_caldeira_dados_espelho_',
      'nr13_caldeira_dados_tampo_',
      'nr13_croqui2d_',
      'nr13_croqui3d_',
      'nr13_modelo3d_',
      'nr13_folha_dados_',
      'nr13_med_esp_',
      'nr13_med_grid_',
      'nr13_prontuario_',
      'nr13_prontuario_meta_',
      'nr13_assinantes_pront_',
      'nr13_pref_unidade_',
    ]) {
      expect(semeadas, `família ausente da semeadura: ${prefixo}`).toContain(prefixo + TAG);
    }
  });

  it('a TAG com barra e hífen não quebra a montagem das chaves', () => {
    // `COMPRESSOR V8-15/200L` é uma TAG real da produção. Se a chave fosse
    // montada por regex em vez de concatenação, ela sairia truncada e a
    // semeadura pediria chave que não existe.
    expect(chavesDoEquipamento('COMPRESSOR V8-15/200L')).toContain(
      'nr13_info_COMPRESSOR V8-15/200L',
    );
  });
});
