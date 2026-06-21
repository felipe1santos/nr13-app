export type TipoEnsaio =
  | 'checklist'
  | 'ultrassom'
  | 'visual_interno'
  | 'visual_externo'
  | 'teste_hidrostatico';

export const ENSAIOS_DISPONIVEIS: { value: TipoEnsaio; label: string }[] = [
  { value: 'checklist',         label: 'Checklist Completo de Inspeção (NR-13)' },
  { value: 'ultrassom',         label: 'Medição de Espessura (Ultrassom)' },
  { value: 'visual_externo',    label: 'Inspeção Visual Externa' },
  { value: 'visual_interno',    label: 'Inspeção Visual Interna' },
  { value: 'teste_hidrostatico',label: 'Teste Hidrostático / Estanqueidade' },
];

export type FormularioEnsaio = 'ultrassom' | 'checklist' | 'visual_externo' | 'visual_interno' | 'th' | 'manometro' | 'psv';

export const FORM_POR_ENSAIO: Record<TipoEnsaio, FormularioEnsaio> = {
  checklist:          'checklist',
  ultrassom:          'ultrassom',
  visual_interno:     'visual_interno',
  visual_externo:     'visual_externo',
  teste_hidrostatico: 'th',
};

export const ROTULO_FORMULARIO: Record<FormularioEnsaio, string> = {
  ultrassom:      'Medição de Espessura (Ultrassom)',
  checklist:      'Checklist de Inspeção Visual',
  visual_externo: 'Inspeção Visual Externa',
  visual_interno: 'Inspeção Visual Interna',
  th:             'Teste Hidrostático',
  manometro:      'Calibração de Manômetro',
  psv:            'Calibração de Válvula de Segurança (PSV)',
};

// Container de inspeção: agrupa os ensaios atribuídos a um equipamento numa rodada de inspeção.
// `dados` guarda o blob preenchido de cada formulário (chave = FormularioEnsaio), vazio até o
// técnico abrir e salvar o formulário em campo.
export interface ContainerInspecao {
  id: string;
  criadoEm: string;
  ensaios: TipoEnsaio[];
  dados: Partial<Record<FormularioEnsaio, unknown>>;
}
