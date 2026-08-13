import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { escopoDaChave } from './familiasChave';
import {
  FORA_DO_PALCO,
  GLOBAIS,
  POR_ID_FILTRADO_POR_TAG,
  POR_ID_NO_PALCO,
} from './palco';

/**
 * Guarda contra a classe de bug mais cara deste projeto: um template lê uma
 * chave que o palco não materializa.
 *
 * Os 40+ arquivos de `public/` leem `localStorage` de forma síncrona e, quando a
 * chave não está lá, NÃO reclamam — caem no `|| '{}'` e imprimem "-" num
 * documento assinado por engenheiro. Não há erro no console, não há teste
 * quebrado, não há nada: o defeito só aparece quando alguém confere folha por
 * folha. Aconteceu três vezes seguidas com a virada para a v2, e em 13/08/2026
 * as três foram descobertas de uma vez, pelo usuário, em produção.
 *
 * Este teste faz a varredura que até aqui era feita à mão e anotada em
 * comentário. Cada chave que aparece em `public/` tem de estar coberta pelo
 * palco ou listada abaixo com o motivo de não estar.
 */

const RAIZ_PUBLIC = join(process.cwd(), 'public');

/** Tokens que aparecem em `public/` e NÃO são chave de dado a materializar. */
const NAO_SAO_DADO: Record<string, string> = {
  nr13_salvar: 'tipo de postMessage da ponte (sb-storage.js), não é chave',
  nr13_salvo: 'tipo de postMessage da confirmação, não é chave',
  nr13_erro_ponte: 'tipo de postMessage de erro, não é chave',
  nr13_fila_ponte: 'fila de fallback da própria ponte, escrita pelo template',
  nr13_papel: 'papel da sessão, gravado direto no localStorage por auth.ts (não passa pelo storage)',
  nr13_rastreabilidade:
    'chave legada que NENHUM código grava — ver o comentário em CERTIFICADO-CAL-MANOMETRO.html',
  nr13_caldeira_aqua_tubulaoSup_:
    'família morta: nenhum arquivo de src/ grava, resto de um memorial de aquatubular que não existe',
  nr13_caldeira_aqua_fundoEliptico_: 'família morta, mesmo caso da tubulaoSup_',
};

function arquivosDeTemplate(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) saida.push(...arquivosDeTemplate(caminho));
    else if (/\.(html|js)$/i.test(nome)) saida.push(caminho);
  }
  return saida;
}

/** Todo token `nr13_...` citado em `public/`, com os arquivos onde aparece. */
function tokensDosTemplates(): Map<string, string[]> {
  const achados = new Map<string, string[]>();
  for (const arquivo of arquivosDeTemplate(RAIZ_PUBLIC)) {
    const texto = readFileSync(arquivo, 'utf8');
    for (const [token] of texto.matchAll(/nr13_[A-Za-z0-9_]+/g)) {
      const curto = arquivo.slice(RAIZ_PUBLIC.length + 1);
      const lista = achados.get(token) ?? [];
      if (!lista.includes(curto)) lista.push(curto);
      achados.set(token, lista);
    }
  }
  return achados;
}

/**
 * O palco cobre este token? Um token terminado em `_` é prefixo de família
 * (`'nr13_info_' + tag`); os demais são chave inteira. `nr13_calc` e `nr13_cat`
 * aparecem sem o `_` final em comentários, daí a segunda tentativa.
 */
function cobertoPeloPalco(token: string): boolean {
  if (FORA_DO_PALCO.some((p) => token.startsWith(p))) return true; // exclusão deliberada
  if (GLOBAIS.includes(token)) return true;

  const familias = [...POR_ID_NO_PALCO, ...POR_ID_FILTRADO_POR_TAG];
  if (familias.some((p) => token === p || token.startsWith(p))) return true;

  // Chaves de TAG chegam por `chavesDaTag`: basta a família estar registrada.
  const comoPrefixo = token.endsWith('_') ? token : `${token}_`;
  return escopoDaChave(`${comoPrefixo}TAG-QUALQUER`) === 'tag';
}

describe('varredura de public/: toda chave lida por template está no palco', () => {
  it('acha os templates (a varredura não pode passar em silêncio por diretório vazio)', () => {
    expect(arquivosDeTemplate(RAIZ_PUBLIC).length).toBeGreaterThan(30);
  });

  it('nenhuma chave lida por template ficou de fora', () => {
    const descobertas: string[] = [];
    for (const [token, arquivos] of tokensDosTemplates()) {
      if (token in NAO_SAO_DADO) continue;
      if (cobertoPeloPalco(token)) continue;
      descobertas.push(`${token} (lida em ${arquivos.slice(0, 3).join(', ')})`);
    }
    // Se este teste quebrou: ou a chave nova entra no palco (GLOBAIS /
    // POR_ID_NO_PALCO / família de TAG em familiasChave.ts), ou entra em
    // FORA_DO_PALCO com o motivo, ou em NAO_SAO_DADO se não for chave.
    expect(descobertas).toEqual([]);
  });

  it('as três que faltavam em 13/08/2026 seguem cobertas', () => {
    expect(cobertoPeloPalco('nr13_relatorio_meta_atual')).toBe(true);
    expect(cobertoPeloPalco('nr13_prontuario_atual')).toBe(true);
    expect(cobertoPeloPalco('nr13_rastreab_')).toBe(true);
    expect(cobertoPeloPalco('nr13_calibracao_item_')).toBe(true);
    // E a folha PLACA lê o prontuário do equipamento, que nem família tinha.
    expect(cobertoPeloPalco('nr13_prontuario_')).toBe(true);
  });

  it('chave inventada continua sendo apontada', () => {
    // Prova que a cobertura não é vácua: sem isso, um `return true` no meio da
    // função faria o teste passar para sempre.
    expect(cobertoPeloPalco('nr13_chave_que_ninguem_registrou')).toBe(false);
  });
});
