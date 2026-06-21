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

export type TipoFuncionario = 'Engenheiro PH' | 'Inspetor Técnico';

export interface Funcionario {
  id: string;
  tipo: TipoFuncionario;
  nome: string;
  profissao: string;
  crea: string;
  registro: string;
  cpf: string;
  rg: string;
  endereco: string;
  bairro: string;
  cep: string;
  cidade: string;
  uf: string;
  telefone: string;
  email: string;
  foto?: string;
  assinatura?: string;
}
