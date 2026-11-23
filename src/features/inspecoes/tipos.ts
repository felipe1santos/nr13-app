export type TipoEnsaio =
  | 'checklist'
  | 'ultrassom'
  | 'visual_interno'
  | 'visual_externo'
  | 'teste_hidrostatico'
  | 'relatorio_imagens'
  | 'acumulacao'
  | 'verificacao_caldeira';

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

/**
 * VERIFICAÇÃO NR-13 DA CALDEIRA (23/11/2026) — só para CALDEIRA, como a
 * acumulação. Os itens da NR-13 de caldeira (dispositivos, placa, documentação,
 * instalação, operação, válvulas); o "não atende" alimenta a lista do
 * 13.4.4.12 i) no relatório. Catálogo em `features/caldeira/verificacaoNr13.ts`.
 */
export const ENSAIO_VERIFICACAO_CALDEIRA = { value: 'verificacao_caldeira', label: 'Verificação NR-13 da Caldeira' } as const satisfies {
  value: TipoEnsaio;
  label: string;
};

/** Todos os ensaios que o sistema conhece — para rótulo e leitura, nunca para oferecer. */
export const TODOS_ENSAIOS: { value: TipoEnsaio; label: string }[] = [
  ...ENSAIOS_DISPONIVEIS,
  ENSAIO_ACUMULACAO,
  ENSAIO_VERIFICACAO_CALDEIRA,
];

export type FormularioEnsaio =
  | 'ultrassom'
  | 'checklist'
  | 'visual_externo'
  | 'visual_interno'
  | 'th'
  | 'manometro'
  | 'psv'
  | 'imagens'
  | 'acumulacao'
  | 'nr13_caldeira';

export const FORM_POR_ENSAIO: Record<TipoEnsaio, FormularioEnsaio> = {
  checklist:          'checklist',
  ultrassom:          'ultrassom',
  visual_interno:     'visual_interno',
  visual_externo:     'visual_externo',
  teste_hidrostatico: 'th',
  relatorio_imagens:  'imagens',
  acumulacao:         'acumulacao',
  verificacao_caldeira: 'nr13_caldeira',
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
  nr13_caldeira:  'Verificação NR-13 da Caldeira',
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
  // 23/11/2026 · só caldeira; sai dentro da folha 1.3 do relatório de caldeira
  // (Itens da NR-13 não atendidos — 13.4.4.12 i). Sem folha HTML própria.
  nr13_caldeira:  ['CALD-RELATORIO-INSPECAO.html'],
};
