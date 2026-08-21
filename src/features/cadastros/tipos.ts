import type { RefFoto } from '../../services/fotos';
export interface MinhaEmpresaDados {
  logo?: string;
  razao?: string;
  fantasia?: string;
  cnpj?: string;
  endereco?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  telefone?: string;
  email?: string;
}

// Par rótulo+valor livre exibido junto da assinatura (ex.: rotulo "Certificação", valor "SNQC 12345").
// Ambos são definidos pelo usuário no cadastro de Funcionários; alimenta o motor de assinatura.
export interface CampoExtraFuncionario {
  rotulo: string;
  valor: string;
}

// Profissionais habilitados (PH) / inspetores que assinam a documentação. Lido pelos templates
// (ULTRASSOM, TESTE-HIDROSTATICO) pela chave nr13_lista_phs: campos id, nome, crea, assinatura, tipo.
// tipo 'Inspetor' alimenta o seletor de técnico (filtro startsWith('Inspetor')); 'Engenheiro' assina.
// Os campos opcionais abaixo (funcao, camposExtras, folhasProntuario, folhasRelatorio) foram
// adicionados para o futuro motor de assinatura — todos opcionais para não quebrar dados salvos.
export interface Funcionario {
  id: string;
  nome: string;
  crea: string;
  tipo: 'Engenheiro' | 'Inspetor';
  assinatura?: string; // imagem dataURL (comprimida)
  /**
   * FASE 7A — o mesmo conteúdo no bucket, endereçado pelo SHA-256 dos bytes
   * (`<org>/{logos,assinaturas}/<sha256>.<ext>`).
   *
   * **Opcional e ainda não gravado.** A etapa 7A ensina o sistema a LER este
   * campo; os writers só passam a preenchê-lo na 7B, depois de a capacidade de
   * leitura estar em produção. Enquanto isso a dataURL acima continua sendo a
   * fonte, e ela permanece durante toda a convivência (D-11) para o rollback
   * não custar nada.
   */
  assinaturaRef?: RefFoto;
  /** Cargo exibido na assinatura (ex.: "Engenheiro Mecânico"). Vazio → as folhas usam fallback. */
  funcao?: string;
  /** Informações adicionais do assinante (rótulo e valor livres). Alimenta o motor de assinatura. */
  camposExtras?: CampoExtraFuncionario[];
  /**
   * Folhas do PRONTUÁRIO que este profissional assina — nomes .html de PAGINAS_PRONTUARIO
   * (src/features/prontuarios/tipos.ts). Alimenta o motor de assinatura.
   * undefined (dado antigo) = regra padrão: Engenheiro assina todas, Inspetor nenhuma.
   */
  folhasProntuario?: string[];
  /**
   * Documentos do RELATÓRIO que este profissional assina — nomes .html de DOCUMENTOS_DISPONIVEIS
   * (src/features/relatorios/tipos.ts). Só pré-definição para o motor de assinatura (fase futura);
   * nada consome ainda. undefined (dado antigo) = mesma regra padrão do prontuário.
   */
  folhasRelatorio?: string[];
}

export interface Cliente {
  id: string;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  atividade: string;
  endereco: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
  telefone: string;
  email: string;
  contato: string;
  // Enriquecimento via Google Places (todos opcionais — clientes antigos seguem válidos)
  website?: string;
  logoUrl?: string;   // favicon do site (google s2 favicons)
  placeId?: string;   // usado no mapa embed da tela de detalhe
  lat?: number;
  lng?: number;
  anotacoes?: string;
  /** E-mail do acesso ao portal do cliente (gravado ao criar o acesso). */
  portalEmail?: string;
}

