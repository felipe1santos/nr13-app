// Wrapper para api_storage.php — contrato preservado verbatim (ver api_storage.php na raiz).
// Toda gravação grava no localStorage e no servidor. Toda leitura cai pro cache local se offline.

const API_BASE = '';

function emailUsuario(): string {
  return localStorage.getItem('nr13_usuario_logado') || '';
}

export async function lerTudo(email = emailUsuario()): Promise<Record<string, string>> {
  if (!email) return {};
  try {
    const resp = await fetch(`${API_BASE}/api_storage.php?acao=ler_tudo&email=${encodeURIComponent(email)}`);
    const json = await resp.json();
    if (!json.sucesso) return {};
    const dados: Record<string, string> = json.dados ?? {};
    for (const [chave, valor] of Object.entries(dados)) {
      localStorage.setItem(chave, valor);
    }
    return dados;
  } catch {
    // offline: cai pro cache local já existente, não há lista de chaves a varrer aqui
    return {};
  }
}

export async function salvar(chave: string, objeto: unknown): Promise<void> {
  const valor = JSON.stringify(objeto);
  localStorage.setItem(chave, valor);
  const email = emailUsuario();
  if (!email) return;
  try {
    await fetch(`${API_BASE}/api_storage.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'salvar', email, chave, valor }),
    });
  } catch {
    // offline: já está no localStorage, sincroniza depois
  }
}

export function ler<T = unknown>(chave: string): T | null {
  const raw = localStorage.getItem(chave);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as unknown as T;
  }
}

// Varre o cache local (já sincronizado por lerTudo) por chaves com um prefixo, ex.: "nr13_info_".
export function listarChavesComPrefixo(prefixo: string): string[] {
  const chaves: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const chave = localStorage.key(i);
    if (chave && chave.startsWith(prefixo)) chaves.push(chave);
  }
  return chaves;
}

export async function excluirVaso(tag: string): Promise<void> {
  const email = emailUsuario();
  if (!email) return;
  await fetch(`${API_BASE}/api_storage.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acao: 'excluir_vaso', email, tag }),
  });
  // remove do cache local tudo que termina em "_<TAG>"
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const chave = localStorage.key(i);
    if (chave && chave.endsWith(`_${tag}`)) localStorage.removeItem(chave);
  }
}
