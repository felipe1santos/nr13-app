import { ler, salvar } from '../../services/storage';
import { FORM_POR_ENSAIO, type ContainerInspecao, type FormularioEnsaio, type TipoEnsaio } from './tipos';

function chave(tag: string): string {
  return `nr13_docs_${tag}`;
}

export function listarContainers(tag: string): ContainerInspecao[] {
  return ler<ContainerInspecao[]>(chave(tag)) || [];
}

export async function criarContainer(tag: string, ensaios: TipoEnsaio[], nome?: string): Promise<ContainerInspecao> {
  const criadoEm = new Date().toLocaleDateString('pt-BR');
  const novo: ContainerInspecao = {
    id: `cont${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
    nome: (nome ?? '').trim() || `Inspeção de ${criadoEm}`,
    criadoEm,
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

// Remove do container todos os ensaios cujo FORM_POR_ENSAIO aponta pro formulário indicado.
// (visual_externo e visual_interno têm formulários distintos; cada um é removido pelo seu próprio.)
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
  // Se o container alvo não está na lista carregada (ex.: cache ainda não hidratado / offline no
  // 1º load), NÃO grava: senão escreveríamos a lista sem ele (ou []) e apagaríamos os containers
  // reais no Supabase ao ressincronizar.
  if (!atuais.some((c) => c.id === containerId)) {
    throw new Error('Container de inspeção não encontrado no cache — recarregue antes de salvar.');
  }
  const atualizados = atuais.map((c) => (c.id === containerId ? { ...c, dados: { ...c.dados, [formulario]: dados } } : c));
  await salvar(chave(tag), atualizados);
}
