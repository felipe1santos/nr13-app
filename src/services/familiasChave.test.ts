import { describe, it, expect } from 'vitest';
import { tagDaChave, escopoDaChave } from './familiasChave';

// A dedução por regex genérica errava em chaves REAIS do projeto:
// `nr13_med_esp_ACA 2040` produzia a TAG "esp_ACA 2040" e `nr13_minha_empresa`
// produzia a TAG "empresa". Índice errado = excluirVaso apagando o equipamento
// errado e palco montando o documento errado.
describe('tagDaChave — famílias por TAG (levantadas de src/ e public/)', () => {
  const porTag: Array<[string, string]> = [
    ['nr13_info_ACA 2040', 'ACA 2040'],
    ['nr13_calc_ACA 2040', 'ACA 2040'],
    ['nr13_calc_gv_ACA 2040', 'ACA 2040'],
    ['nr13_cat_ACA 2040', 'ACA 2040'],
    ['nr13_emp_ACA 2040', 'ACA 2040'],
    ['nr13_fotos_ACA 2040', 'ACA 2040'],
    ['nr13_docs_ACA 2040', 'ACA 2040'],
    ['nr13_med_esp_ACA 2040', 'ACA 2040'],
    ['nr13_med_grid_ACA 2040', 'ACA 2040'],
    ['nr13_livro_ACA 2040', 'ACA 2040'],
    ['nr13_livro_config_ACA 2040', 'ACA 2040'],
    ['nr13_vaso_ACA 2040', 'ACA 2040'],
    ['nr13_vaso_ac_corpo_ACA 2040', 'ACA 2040'],
    ['nr13_vaso_cald_ACA 2040', 'ACA 2040'],
    ['nr13_vaso_gv_ACA 2040', 'ACA 2040'],
    ['nr13_vida_ACA 2040', 'ACA 2040'],
    ['nr13_assinantes_pront_ACA 2040', 'ACA 2040'],
    ['nr13_assinantes_rel_ACA 2040', 'ACA 2040'],
    ['nr13_pref_unidade_ACA 2040', 'ACA 2040'],
    ['nr13_prontuario_meta_ACA 2040', 'ACA 2040'],
    ['nr13_folha_dados_ACA 2040', 'ACA 2040'],
    ['nr13_componentes_cal_ACA 2040', 'ACA 2040'],
    ['nr13_lotes_cal_ACA 2040', 'ACA 2040'],
    ['nr13_calibracoes_ACA 2040', 'ACA 2040'],
    ['nr13_caldeira_dados_costado_ACA 2040', 'ACA 2040'],
    ['nr13_caldeira_dados_espelho_ACA 2040', 'ACA 2040'],
    ['nr13_caldeira_dados_tampo_ACA 2040', 'ACA 2040'],
    ['nr13_autoclave_dados_ACA 2040', 'ACA 2040'],
    ['nr13_croqui2d_ACA 2040', 'ACA 2040'],
    ['nr13_croqui3d_ACA 2040', 'ACA 2040'],
    ['nr13_modelo3d_ACA 2040', 'ACA 2040'],
    ['nr13_laudo_ACA 2040', 'ACA 2040'],
    ['nr13_termo_livro_ACA 2040', 'ACA 2040'],
    ['nr13_pront_fab_ACA 2040', 'ACA 2040'],
  ];

  for (const [chave, esperado] of porTag) {
    it(`${chave} -> "${esperado}"`, () => {
      expect(tagDaChave(chave)).toBe(esperado);
      expect(escopoDaChave(chave)).toBe('tag');
    });
  }

  it('prefixo mais LONGO vence quando duas famílias se sobrepõem', () => {
    // Sem essa regra, nr13_livro_config_X viraria TAG "config_X".
    expect(tagDaChave('nr13_livro_config_X')).toBe('X');
    expect(tagDaChave('nr13_calc_gv_X')).toBe('X');
    expect(tagDaChave('nr13_vaso_ac_corpo_X')).toBe('X');
  });

  it('TAG que é sufixo de outra não se confunde', () => {
    expect(tagDaChave('nr13_info_B')).toBe('B');
    expect(tagDaChave('nr13_info_A_B')).toBe('A_B');
  });

  it('TAG com espaço e caractere especial é preservada inteira', () => {
    expect(tagDaChave('nr13_info_VP-01 / A')).toBe('VP-01 / A');
  });
});

describe('tagDaChave — chaves GLOBAIS não têm TAG', () => {
  const globais = [
    'nr13_minha_empresa',
    'nr13_lista_phs',
    'nr13_clientes',
    'nr13_demo_seed',
    'nr13_historico_relatorios',
    'nr13_uso_contadores',
    'nr13_termos_aceite',
    'nr13_relatorio_meta_atual',
    'nr13_inspecao_atual',
    'nr13_injecao_atual',
    'nr13_prontuario_atual',
  ];

  for (const chave of globais) {
    it(`${chave} -> null`, () => {
      expect(tagDaChave(chave)).toBeNull();
      expect(escopoDaChave(chave)).toBe('global');
    });
  }
});

describe('tagDaChave — chaves por ID próprio não são TAG de equipamento', () => {
  const porId = [
    'nr13_rastreab_abc-123',
    'nr13_calibracao_item_99',
    'nr13_permissoes_uuid-do-usuario',
  ];

  for (const chave of porId) {
    it(`${chave} -> null`, () => {
      expect(tagDaChave(chave)).toBeNull();
      expect(escopoDaChave(chave)).toBe('id');
    });
  }
});

describe('tagDaChave — desconhecida nunca vira TAG inventada', () => {
  it('família nova cai em global', () => {
    expect(escopoDaChave('nr13_coisa_nova')).toBe('global');
    expect(tagDaChave('nr13_coisa_nova')).toBeNull();
  });

  it('prefixo sem sufixo não vira TAG vazia', () => {
    // "nr13_info_" sem nada depois não identifica equipamento nenhum.
    expect(tagDaChave('nr13_info_')).toBeNull();
  });

  it('chave fora do domínio nr13 não tem TAG', () => {
    expect(tagDaChave('outra_coisa')).toBeNull();
    expect(escopoDaChave('outra_coisa')).toBe('global');
  });
});
