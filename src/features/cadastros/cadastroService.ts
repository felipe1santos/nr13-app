import { ler, salvar } from '../../services/storage';
import type { MinhaEmpresaDados, Cliente } from './tipos';

const KEY_MINHA_EMPRESA = 'nr13_minha_empresa';
const KEY_CLIENTES = 'nr13_clientes';

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
