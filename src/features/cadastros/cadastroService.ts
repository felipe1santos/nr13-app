import { ler, salvar } from '../../services/storage';
import type { MinhaEmpresaDados, Cliente, Funcionario } from './tipos';

const KEY_MINHA_EMPRESA = 'nr13_minha_empresa';
const KEY_CLIENTES = 'nr13_clientes';
const KEY_FUNCIONARIOS = 'nr13_lista_phs';

export function carregarMinhaEmpresa(): MinhaEmpresaDados {
  return ler<MinhaEmpresaDados>(KEY_MINHA_EMPRESA) || {};
}

export function salvarMinhaEmpresa(dados: MinhaEmpresaDados): void {
  salvar(KEY_MINHA_EMPRESA, dados);
}

export function listarClientes(): Cliente[] {
  return ler<Cliente[]>(KEY_CLIENTES) || [];
}

export function salvarCliente(cliente: Cliente): void {
  const lista = listarClientes();
  const idx = lista.findIndex((c) => c.id === cliente.id);
  if (idx >= 0) lista[idx] = cliente;
  else lista.push(cliente);
  salvar(KEY_CLIENTES, lista);
}

export function excluirCliente(id: string): void {
  salvar(KEY_CLIENTES, listarClientes().filter((c) => c.id !== id));
}

export function listarFuncionarios(): Funcionario[] {
  return ler<Funcionario[]>(KEY_FUNCIONARIOS) || [];
}

export function salvarFuncionario(func: Funcionario): void {
  const lista = listarFuncionarios();
  const idx = lista.findIndex((f) => f.id === func.id);
  if (idx >= 0) lista[idx] = func;
  else lista.push(func);
  salvar(KEY_FUNCIONARIOS, lista);
}

export function excluirFuncionario(id: string): void {
  salvar(KEY_FUNCIONARIOS, listarFuncionarios().filter((f) => f.id !== id));
}
