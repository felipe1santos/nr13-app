/**
 * Busca de empresas via Google Places API (New) — REST, sem carregar o Maps JS SDK.
 * Usada no cadastro de clientes para preencher endereço/telefone/site automaticamente.
 * A chave (VITE_GOOGLE_MAPS_KEY) fica no bundle; a proteção é a restrição por HTTP
 * referrer + restrição de APIs no Google Cloud Console.
 */

export const GOOGLE_MAPS_KEY: string = import.meta.env.VITE_GOOGLE_MAPS_KEY ?? '';

export interface ResultadoPlace {
  placeId: string;
  nome: string;
  enderecoCompleto: string;
  endereco: string;   // rua, número
  bairro: string;
  cidade: string;
  estado: string;     // UF
  cep: string;
  telefone: string;
  website: string;
  logoUrl: string;    // favicon do site (vazio se sem website)
  lat?: number;
  lng?: number;
}

interface ComponenteEndereco {
  longText?: string;
  shortText?: string;
  types?: string[];
}

interface PlaceApi {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: ComponenteEndereco[];
  location?: { latitude?: number; longitude?: number };
  websiteUri?: string;
  nationalPhoneNumber?: string;
}

function componente(comps: ComponenteEndereco[], tipo: string, curto = false): string {
  const c = comps.find((x) => x.types?.includes(tipo));
  return (curto ? c?.shortText : c?.longText) ?? '';
}

export function faviconDe(website: string): string {
  try {
    const host = new URL(website).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  } catch {
    return '';
  }
}

/*
 * TRAVAS DE CUSTO. A busca é cobrada por requisição (SKU Text Search Enterprise, por causa de
 * telefone/site no FieldMask), e o handler de tela é disparado por Enter — que, segurado,
 * repete o evento dezenas de vezes por segundo. As travas vivem AQUI, e não na tela, para
 * valerem para qualquer chamador:
 *  - texto curto (< 3) não consulta;
 *  - a mesma consulta (normalizada) é servida do cache da sessão;
 *  - consulta idêntica em andamento é reaproveitada, nunca duplicada;
 *  - intervalo mínimo entre requisições reais e teto por sessão da página.
 */
const MIN_CARACTERES = 3;
const INTERVALO_MIN_MS = 1500;
export const TETO_REQUISICOES_SESSAO = 40;

const cacheBusca = new Map<string, ResultadoPlace[]>();
const emAndamento = new Map<string, Promise<ResultadoPlace[]>>();
let ultimaRequisicao = 0;
let requisicoesNaSessao = 0;

/** Só para testes. */
export function __reiniciarTravasBusca(): void {
  cacheBusca.clear();
  emAndamento.clear();
  ultimaRequisicao = 0;
  requisicoesNaSessao = 0;
}

export async function buscarEmpresas(texto: string): Promise<ResultadoPlace[]> {
  if (!GOOGLE_MAPS_KEY) throw new Error('Chave do Google Maps não configurada (VITE_GOOGLE_MAPS_KEY).');
  const chave = texto.trim().replace(/\s+/g, ' ').toLowerCase();
  if (chave.length < MIN_CARACTERES) throw new Error(`Digite pelo menos ${MIN_CARACTERES} caracteres para buscar.`);
  const emCache = cacheBusca.get(chave);
  if (emCache) return emCache;
  const pendente = emAndamento.get(chave);
  if (pendente) return pendente;
  if (emAndamento.size > 0) throw new Error('Aguarde a busca anterior terminar.');
  if (requisicoesNaSessao >= TETO_REQUISICOES_SESSAO) {
    throw new Error('Limite de buscas desta sessão atingido. Recarregue a página para buscar novamente.');
  }
  const agora = Date.now();
  if (agora - ultimaRequisicao < INTERVALO_MIN_MS) throw new Error('Aguarde um instante antes de buscar de novo.');
  ultimaRequisicao = agora;
  requisicoesNaSessao++;
  const promessa = consultarPlaces(chave).then((r) => {
    cacheBusca.set(chave, r);
    return r;
  });
  emAndamento.set(chave, promessa);
  try {
    return await promessa;
  } finally {
    emAndamento.delete(chave);
  }
}

async function consultarPlaces(texto: string): Promise<ResultadoPlace[]> {
  const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_KEY,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.addressComponents,' +
        'places.location,places.websiteUri,places.nationalPhoneNumber',
    },
    body: JSON.stringify({ textQuery: texto, languageCode: 'pt-BR', regionCode: 'BR', maxResultCount: 5 }),
  });
  if (!resp.ok) {
    const corpo = await resp.text();
    throw new Error(`Busca no Google falhou (${resp.status}): ${corpo.slice(0, 200)}`);
  }
  const dados = (await resp.json()) as { places?: PlaceApi[] };
  return (dados.places ?? []).map((p) => {
    const comps = p.addressComponents ?? [];
    const rua = componente(comps, 'route');
    const numero = componente(comps, 'street_number');
    const website = p.websiteUri ?? '';
    return {
      placeId: p.id ?? '',
      nome: p.displayName?.text ?? '',
      enderecoCompleto: p.formattedAddress ?? '',
      endereco: [rua, numero].filter(Boolean).join(', '),
      bairro: componente(comps, 'sublocality') || componente(comps, 'sublocality_level_1'),
      cidade: componente(comps, 'administrative_area_level_2') || componente(comps, 'locality'),
      estado: componente(comps, 'administrative_area_level_1', true),
      cep: componente(comps, 'postal_code'),
      telefone: p.nationalPhoneNumber ?? '',
      website,
      logoUrl: website ? faviconDe(website) : '',
      lat: p.location?.latitude,
      lng: p.location?.longitude,
    };
  });
}

/** URL do iframe do Maps Embed API (gratuito) para a tela de detalhe do cliente. */
export function urlMapaEmbed(cliente: { placeId?: string; endereco?: string; cidade?: string; estado?: string; cep?: string }): string {
  if (!GOOGLE_MAPS_KEY) return '';
  const q = cliente.placeId
    ? `place_id:${cliente.placeId}`
    : [cliente.endereco, cliente.cidade, cliente.estado, cliente.cep].filter(Boolean).join(', ');
  if (!q) return '';
  return `https://www.google.com/maps/embed/v1/place?key=${GOOGLE_MAPS_KEY}&q=${encodeURIComponent(q)}&language=pt-BR`;
}
