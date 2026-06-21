import { ler, salvar } from '../../services/storage';
import { FORM_POR_ENSAIO, type ContainerInspecao, type FormularioEnsaio, type TipoEnsaio } from './tipos';

function chave(tag: string): string {
  return `nr13_docs_${tag}`;
}

export function listarContainers(tag: string): ContainerInspecao[] {
  return ler<ContainerInspecao[]>(chave(tag)) || [];
}

export async function criarContainer(tag: string, ensaios: TipoEnsaio[]): Promise<ContainerInspecao> {
  const novo: ContainerInspecao = {
    id: `cont${Date.now()}`,
    criadoEm: new Date().toLocaleDateString('pt-BR'),
    ensaios,
    dados: {},
  };
  const atuais = listarContainers(tag);
  await salvar(chave(tag), [...atuais, novo]);
  return novo;
}

export async function removerContainer(tag: string, id: string): Promise<void> {
  const atuais = listarContainers(tag);
  await salvar(chave(tag), atuais.filter((c) => c.id !== id));
}

export async function adicionarEnsaiosContainer(tag: string, containerId: string, novosEnsaios: TipoEnsaio[]): Promise<void> {
  const atuais = listarContainers(tag);
  const atualizados = atuais.map((c) => {
    if (c.id !== containerId) return c;
    const ensaios = [...c.ensaios];
    for (const e of novosEnsaios) if (!ensaios.includes(e)) ensaios.push(e);
    return { ...c, ensaios };
  });
  await salvar(chave(tag), atualizados);
}

// Remove do container todos os ensaios que apontam pro formulário indicado (ex.: remover o
// "item" Checklist remove visual_interno E visual_externo, já que os dois compartilham o mesmo
// formulário — ver FORM_POR_ENSAIO).
export async function removerFormularioContainer(tag: string, containerId: string, formulario: FormularioEnsaio): Promise<void> {
  const atuais = listarContainers(tag);
  const atualizados = atuais.map((c) =>
    c.id === containerId ? { ...c, ensaios: c.ensaios.filter((e) => FORM_POR_ENSAIO[e] !== formulario) } : c,
  );
  await salvar(chave(tag), atualizados);
}

export function carregarContainer(tag: string, id: string): ContainerInspecao | null {
  return listarContainers(tag).find((c) => c.id === id) ?? null;
}

// Lista os formulários distintos atribuídos a um container, sem duplicar quando vários ensaios
// apontam pro mesmo formulário (ex.: visual_interno/visual_externo => checklist único).
export function formulariosDoContainer(container: ContainerInspecao): FormularioEnsaio[] {
  const formularios: FormularioEnsaio[] = [];
  for (const ensaio of container.ensaios) {
    const f = FORM_POR_ENSAIO[ensaio];
    if (!formularios.includes(f)) formularios.push(f);
  }
  return formularios;
}

export function carregarDadosFormulario<T = unknown>(tag: string, containerId: string, formulario: FormularioEnsaio): T | null {
  const container = carregarContainer(tag, containerId);
  return (container?.dados[formulario] as T) ?? null;
}

export async function salvarDadosFormulario(
  tag: string,
  containerId: string,
  formulario: FormularioEnsaio,
  dados: unknown,
): Promise<void> {
  const atuais = listarContainers(tag);
  const atualizados = atuais.map((c) => (c.id === containerId ? { ...c, dados: { ...c.dados, [formulario]: dados } } : c));
  await salvar(chave(tag), atualizados);
}
