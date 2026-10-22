export type TipoEnsaio =
  | 'checklist'
  | 'ultrassom'
  | 'visual_interno'
  | 'visual_externo'
  | 'teste_hidrostatico'
  | 'relatorio_imagens'
  | 'acumulacao';

export const ENSAIOS_DISPONIVEIS: { value: TipoEnsaio; label: string }[] = [
  { value: 'checklist',         label: 'Checklist Completo de Inspeção (NR-13)' },
  { value: 'ultrassom',         label: 'Medição de Espessura (Ultrassom)' },
  { value: 'visual_externo',    label: 'Inspeção Visual Externa' },
  { value: 'visual_interno',    label: 'Inspeção Visual Interna' },
  { value: 'teste_hidrostatico',label: 'Teste Hidrostático / Estanqueidade' },
  { value: 'relatorio_imagens', label: 'Relatório de Imagens' },
];

/**
 * ENSAIO DE ACUMULAÇÃO (21/10/2026) — só para CALDEIRA (flamotubular).
 *
 * Fica FORA de `ENSAIOS_DISPONIVEIS` de propósito: aquela lista é a que vaso e
 * autoclave sempre viram, e é ela que quem oferece ensaios recebe para esses
 * tipos. Quem decide a lista por tipo é `perfilEquipamento.ensaiosDoTipo`.
 * Quem só TRADUZ um ensaio já gravado em rótulo usa `TODOS_ENSAIOS`.
 */
export const ENSAIO_ACUMULACAO = { value: 'acumulacao', label: 'Ensaio de Acumulação' } as const satisfies {
  value: TipoEnsaio;
  label: string;
};

/** Todos os ensaios que o sistema conhece — para rótulo e leitura, nunca para oferecer. */
export const TODOS_ENSAIOS: { value: TipoEnsaio; label: string }[] = [...ENSAIOS_DISPONIVEIS, ENSAIO_ACUMULACAO];

export type FormularioEnsaio =
  | 'ultrassom'
  | 'checklist'
  | 'visual_externo'
  | 'visual_interno'
  | 'th'
  | 'manometro'
  | 'psv'
  | 'imagens'
  | 'acumulacao';

export const FORM_POR_ENSAIO: Record<TipoEnsaio, FormularioEnsaio> = {
  checklist:          'checklist',
  ultrassom:          'ultrassom',
  visual_interno:     'visual_interno',
  visual_externo:     'visual_externo',
  teste_hidrostatico: 'th',
  relatorio_imagens:  'imagens',
  acumulacao:         'acumulacao',
};

export const ROTULO_FORMULARIO: Record<FormularioEnsaio, string> = {
  ultrassom:      'Medição de Espessura (Ultrassom)',
  checklist:      'Checklist de Inspeção Visual',
  visual_externo: 'Inspeção Visual Externa',
  visual_interno: 'Inspeção Visual Interna',
  th:             'Teste Hidrostático',
  manometro:      'Calibração de Manômetro',
  psv:            'Calibração de Válvula de Segurança (PSV)',
  imagens:        'Relatório de Imagens',
  acumulacao:     'Ensaio de Acumulação',
};

// Container de inspeção: agrupa os ensaios atribuídos a um equipamento numa rodada de inspeção.
// `dados` guarda o blob preenchido de cada formulário (chave = FormularioEnsaio), vazio até o
// técnico abrir e salvar o formulário em campo.
export interface ContainerInspecao {
  id: string;
  nome: string;
  criadoEm: string;
  ensaios: TipoEnsaio[];
  dados: Partial<Record<FormularioEnsaio, unknown>>;
}

// Folhas do relatório geradas a partir de cada formulário de campo — usado na pré-visualização
// "como o documento ficará" (renderiza os mesmos templates de public/arquivos-inspecao/).
export const DOCS_POR_FORMULARIO: Record<FormularioEnsaio, string[]> = {
  checklist:      ['VERIFICACAO-DOCUMENTACAO.html', 'checklist2.html', 'checklist3.html', 'FOTOS-DOCUMENTACAO.html', 'CHECKLIST-FOTOS.html'],
  visual_externo: ['VISUAL-EXTERNO.html', 'VISUAL-EXTERNO-FOTOS.html'],
  visual_interno: ['VISUAL-INTERNO.html', 'VISUAL-INTERNO-FOTOS.html'],
  ultrassom:      ['ULTRASSOM.html'],
  th:             ['TESTE-HIDROSTATICO.html', 'TESTE-HIDROSTATICO-FOTOS.html'],
  manometro:      ['CERTIFICADO-CAL-MANOMETRO.html'],
  psv:            ['CERTIIFCADO-CAL-PSV.html'],
  // Fase 5.2 · a seção 8.4 do relatório completo. Não tem template HTML (é só
  // vetorial, ver `FOLHAS_SO_VETORIAIS`); o documento AVULSO do ensaio tem
  // gerador próprio (`documentoImagens.ts`) e não passa por esta tabela.
  imagens:        ['RELATORIO-IMAGENS.html'],
  // 21/10/2026 · só vetorial, como a 8.4: não existe template HTML.
  acumulacao:     ['ENSAIO-ACUMULACAO.html'],
};
