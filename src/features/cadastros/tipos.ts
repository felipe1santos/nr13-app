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

// Profissionais habilitados (PH) / inspetores que assinam a documentação. Lido pelos templates
// (ULTRASSOM, TESTE-HIDROSTATICO) pela chave nr13_lista_phs: campos id, nome, crea, assinatura, tipo.
// tipo 'Inspetor' alimenta o seletor de técnico (filtro startsWith('Inspetor')); 'Engenheiro' assina.
export interface Funcionario {
  id: string;
  nome: string;
  crea: string;
  tipo: 'Engenheiro' | 'Inspetor';
  assinatura?: string; // imagem dataURL (comprimida)
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
}

