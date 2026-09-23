import { ler, salvar } from '../../services/storage';
import { excluirPorId, visiveis } from '../../services/colecoes';
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

/**
 * A lista COMO ESTÁ, tombstones inclusive — é o que o ESCRITOR usa. Gravar de
 * volta a visão filtrada apagaria a marca de exclusão, e o item ressuscitaria
 * no próximo merge com um aparelho que ainda o tem.
 */
function clientesBrutos(): Cliente[] {
  return ler<Cliente[]>(KEY_CLIENTES) || [];
}

export function listarClientes(): Cliente[] {
  // `visiveis` é a porta ÚNICA do tombstone (services/colecoes.ts).
  return visiveis(clientesBrutos());
}

export function salvarCliente(cliente: Cliente): void {
  const lista = clientesBrutos();
  const idx = lista.findIndex((c) => c.id === cliente.id);
  if (idx >= 0) lista[idx] = cliente;
  else lista.push(cliente);
  salvar(KEY_CLIENTES, lista);
}

export function excluirCliente(id: string): void {
  salvar(KEY_CLIENTES, excluirPorId(clientesBrutos(), id));
}

/** Bruta, com tombstones — para o escritor. Ver `clientesBrutos`. */
function funcionariosBrutos(): Funcionario[] {
  return ler<Funcionario[]>(KEY_FUNCIONARIOS) || [];
}

export function listarFuncionarios(): Funcionario[] {
  return visiveis(funcionariosBrutos());
}

export function salvarFuncionario(funcionario: Funcionario): void {
  const lista = funcionariosBrutos();
  const idx = lista.findIndex((f) => f.id === funcionario.id);
  if (idx >= 0) lista[idx] = funcionario;
  else lista.push(funcionario);
  salvar(KEY_FUNCIONARIOS, lista);
}

export function excluirFuncionario(id: string): void {
  salvar(KEY_FUNCIONARIOS, excluirPorId(funcionariosBrutos(), id));
}
