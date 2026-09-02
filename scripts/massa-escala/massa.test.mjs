/**
 * Testes do gerador de massa da Fase 8.
 *
 * Rodam no runner embutido do Node (`node --test scripts/massa-escala/`), e não
 * no Vitest, de propósito: a suíte do app está travada em `src/**\/*.test.ts` e
 * mexer nesse include para acomodar uma ferramenta seria alterar configuração
 * de build por causa de um script. Custo zero, isolamento total.
 *
 *   npm test              → suíte do app (1186)
 *   node --test scripts/  → estes
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { prng, inteiro, dataBR, uuid, MARCO } from './prng.mjs';
import {
  PREFIXO, ORGS_DE_TESTE, tagDaSeed, ehTagDaSeed, tagDaChave,
  podeApagar, podeEscrever, validarAlvo, FAMILIAS_PROIBIDAS,
  REF_PRODUCAO_NR13, refDoProjeto, ehProducaoProibida,
} from './seguranca.mjs';
import { chavesDoEquipamento } from './conteudo.mjs';
import { jpegSintetico, pdfSintetico, pngSintetico, desvio, MARCA } from './arquivos.mjs';
import { gzipSync } from 'node:zlib';

const ORG = ORGS_DE_TESTE[0];

const caminhos = (seed, n) => ({
  foto: `${ORG}/${tagDaSeed(seed, n)}/f8-${seed}-${n}.jpg`,
  bytesFoto: 5120, bytesThumb: 2048, bytesPdf: 20480,
  pdf: (i) => `${ORG}/relatorios/f8-${seed}-${n}-${i}.pdf`,
  logo: `${ORG}/logos/f8-${seed}-logo.jpg`,
  assinatura: `${ORG}/assinaturas/f8-${seed}-rubrica.png`,
});

const gerar = (seed, equipamentos = 5, rels = 2) => {
  const rnd = prng(seed);
  const saida = [];
  for (let n = 0; n < equipamentos; n++) {
    saida.push(...chavesDoEquipamento(rnd, {
      org: ORG, tag: tagDaSeed(seed, n), n, perfil: 'estrutural',
      relatoriosPorEquipamento: rels, caminhos: caminhos(seed, n),
    }));
  }
  return saida;
};

// ── determinismo ────────────────────────────────────────────────────────────
test('mesma seed produz exatamente o mesmo dataset', () => {
  assert.deepEqual(gerar(7), gerar(7));
});

test('seeds diferentes produzem datasets diferentes', () => {
  const a = JSON.stringify(gerar(7));
  const b = JSON.stringify(gerar(8));
  assert.notEqual(a, b);
});

test('o PRNG não usa Math.random e não depende do relógio', () => {
  const r1 = prng(42), r2 = prng(42);
  assert.deepEqual([r1(), r1(), r1()], [r2(), r2(), r2()]);
  // O marco das datas é fixo: sem isso a mesma seed daria datas diferentes a cada dia.
  assert.equal(MARCO, Date.UTC(2026, 0, 1));
  assert.equal(dataBR(0), '01/01/2026');
});

test('uuid derivado da seed é determinístico e bem formado', () => {
  const u = uuid(prng(3));
  assert.match(u, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(u, uuid(prng(3)));
});

test('inteiro respeita os limites', () => {
  const r = prng(1);
  for (let i = 0; i < 500; i++) {
    const v = inteiro(r, 3, 9);
    assert.ok(v >= 3 && v <= 9);
  }
});

// ── prefixo e pertencimento ─────────────────────────────────────────────────
test('toda TAG gerada carrega o prefixo da fase e da seed', () => {
  for (const [chave] of gerar(11, 4)) {
    const tag = tagDaChave(chave);
    assert.ok(tag, `sem TAG reconhecível: ${chave}`);
    assert.ok(tag.startsWith(`${PREFIXO}11-`), chave);
  }
});

test('seed 1 e seed 12 não se confundem — o sufixo tem de ser só dígitos', () => {
  assert.ok(ehTagDaSeed('ZZ-SCALE-F8-1-5', 1));
  assert.ok(!ehTagDaSeed('ZZ-SCALE-F8-12-5', 1));
  assert.ok(ehTagDaSeed('ZZ-SCALE-F8-12-5', 12));
  assert.ok(!ehTagDaSeed('ZZ-SCALE-F8-1x-5', 1));
});

// ── a proibição que não pode falhar ─────────────────────────────────────────
test('o gerador NUNCA produz chave de livro', () => {
  const chaves = gerar(5, 20).map(([c]) => c);
  for (const familia of FAMILIAS_PROIBIDAS) {
    assert.ok(!chaves.some((c) => c.startsWith(familia)), `produziu ${familia}`);
  }
  assert.ok(!chaves.some((c) => c.includes('livro')));
});

test('toda chave produzida passa por podeEscrever', () => {
  for (const [chave] of gerar(9, 10)) assert.ok(podeEscrever(chave, 9), chave);
});

test('podeEscrever recusa chave global e chave de outra seed', () => {
  assert.ok(!podeEscrever('nr13_lista_phs', 9));
  assert.ok(!podeEscrever('nr13_minha_empresa', 9));
  assert.ok(!podeEscrever('nr13_info_ZZ-SCALE-F8-8-1', 9));
  assert.ok(!podeEscrever('nr13_livro_ZZ-SCALE-F8-9-1', 9));
});

// ── limpeza cirúrgica ───────────────────────────────────────────────────────
test('duas seeds coexistindo: limpar uma não toca a outra', () => {
  const daSeed1 = gerar(1, 3).map(([c]) => c);
  const daSeed2 = gerar(2, 3).map(([c]) => c);
  for (const c of daSeed1) { assert.ok(podeApagar(c, 1), c); assert.ok(!podeApagar(c, 2), c); }
  for (const c of daSeed2) { assert.ok(podeApagar(c, 2), c); assert.ok(!podeApagar(c, 1), c); }
});

test('a limpeza NUNCA apaga chave global', () => {
  for (const c of ['nr13_lista_phs', 'nr13_minha_empresa', 'nr13_clientes', 'nr13_historico_relatorios']) {
    assert.ok(!podeApagar(c, 1), c);
  }
});

test('a limpeza NUNCA apaga as TAGs reais nem as da Fase 7', () => {
  for (const c of [
    'nr13_info_ZZ-FASE3',
    'nr13_rel_REL-1787282142486_ZZ-FASE3',
    'nr13_rel_REL-1786567122300_EQUIPE TESTE',
    'nr13_info_VASO A23',
    'nr13_historico_indice_COMPRESSOR V8-15/200L',
  ]) assert.ok(!podeApagar(c, 1), c);
});

test('a limpeza recusa chave sem TAG reconhecível', () => {
  assert.ok(!podeApagar('nr13_uso_contadores', 1));
  assert.ok(!podeApagar('', 1));
  assert.ok(!podeApagar(null, 1));
});

// ── varredura de pastas órfãs no bucket (defeito D2, 22/08/2026) ────────────
//
// O gerador sobe o arquivo ANTES da RPC. Quando a RPC recusa, sobram arquivos
// sem chave nenhuma apontando para eles — e a limpeza, que deriva as TAGs das
// CHAVES, ficava cega para eles. Medido no laboratório: 402 arquivos órfãos.
// A limpeza passou a varrer a raiz da org pelo NOME DA PASTA, usando a mesma
// regra de pertencimento. Estes testes travam essa regra.
test('pasta órfã no bucket é reconhecida como sendo da seed', () => {
  assert.ok(ehTagDaSeed('ZZ-SCALE-F8-1-0', 1));
  assert.ok(ehTagDaSeed('ZZ-SCALE-F8-1-999', 1));
});

test('a varredura de pastas órfãs não invade outra seed nem pasta do sistema', () => {
  // O erro que a regra existe para impedir: `-12-` casar com a seed 1.
  assert.ok(!ehTagDaSeed('ZZ-SCALE-F8-12-3', 1));
  assert.ok(!ehTagDaSeed('ZZ-SCALE-F8-1-3-extra', 1));
  // Pastas compartilhadas da org, que são limpas por CARIMBO e não por TAG.
  for (const p of ['relatorios', 'logos', 'assinaturas']) assert.ok(!ehTagDaSeed(p, 1));
  // TAGs reais nunca podem ser confundidas com pasta de massa.
  for (const p of ['ZZ-FASE3', 'EQUIPE TESTE', 'VASO A23']) assert.ok(!ehTagDaSeed(p, 1));
});

// ── recusas de segurança ────────────────────────────────────────────────────
test('recusa sem --org', () => {
  const r = validarAlvo({ org: null, perfil: 'estrutural', url: 'http://localhost:54321', confirmou: true });
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes('--org')));
});

test('recusa org fora da lista branca', () => {
  const r = validarAlvo({ org: '00000000-0000-0000-0000-000000000000', perfil: 'estrutural', url: 'http://localhost:54321', confirmou: true });
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes('lista de organizações de teste')));
});

test('recusa sem --perfil e com perfil inválido', () => {
  assert.equal(validarAlvo({ org: ORG, perfil: null, url: 'http://localhost:54321', confirmou: true }).ok, false);
  assert.equal(validarAlvo({ org: ORG, perfil: 'gigante', url: 'http://localhost:54321', confirmou: true }).ok, false);
});

test('recusa sem --confirmar-org-de-teste', () => {
  const r = validarAlvo({ org: ORG, perfil: 'estrutural', url: 'http://localhost:54321', confirmou: false });
  assert.equal(r.ok, false);
});

test('recusa qualquer URL de produção sem a variável de ambiente extra', () => {
  // Projeto Supabase qualquer (não o do NR-13): continua valendo a 6ª trava.
  const url = 'https://outroprojetoqualquer.supabase.co';
  const sem = validarAlvo({ org: ORG, perfil: 'estrutural', url, confirmou: true, producaoPermitida: false });
  assert.equal(sem.ok, false);
  assert.equal(sem.ehProducao, true);
  const com = validarAlvo({ org: ORG, perfil: 'estrutural', url, confirmou: true, producaoPermitida: true });
  assert.equal(com.ok, true);
});

// ── a trava que NÃO tem override (regra de 01/09/2026) ──────────────────────
//
// O ciclo de 20/ago–20/set fechou com 8,32 GB de Cached Egress contra 5 GB de
// cota, e os picos batem dia a dia com os gates de 1k/10k/50k da Fase 9 rodados
// contra o banco de produção. A regra passou a ser: massa NUNCA toca o projeto
// de produção do NR-13. Não é preferência, é trava.

test('BLOQUEIO ABSOLUTO: o ref de produção do NR-13 é recusado', () => {
  const url = `https://${REF_PRODUCAO_NR13}.supabase.co`;
  const r = validarAlvo({ org: ORG, perfil: 'estrutural', url, confirmou: true });
  assert.equal(r.ok, false);
  assert.equal(r.producaoProibida, true);
  assert.ok(r.erros.some((e) => e.includes(REF_PRODUCAO_NR13)));
});

test('NR13_PERMITIR_PRODUCAO NÃO destrava o ref de produção — é o ponto da regra', () => {
  // Este é o teste que impede a trava de virar decorativa: se algum dia alguém
  // "consertar" a variável de ambiente para voltar a funcionar, isto quebra.
  const url = `https://${REF_PRODUCAO_NR13}.supabase.co`;
  const r = validarAlvo({ org: ORG, perfil: 'estrutural', url, confirmou: true, producaoPermitida: true });
  assert.equal(r.ok, false);
  assert.equal(r.producaoProibida, true);
});

test('o bloqueio ignora maiúsculas, porta e caminho na URL', () => {
  for (const url of [
    `https://${REF_PRODUCAO_NR13.toUpperCase()}.supabase.co`,
    `https://${REF_PRODUCAO_NR13}.supabase.co/`,
    `https://${REF_PRODUCAO_NR13}.supabase.co:443/rest/v1/`,
  ]) {
    const r = validarAlvo({ org: ORG, perfil: 'estrutural', url, confirmou: true, producaoPermitida: true });
    assert.equal(r.ok, false, url);
    assert.equal(r.producaoProibida, true, url);
  }
});

test('FAIL-CLOSED: sem URL o alvo é recusado, não assumido como local', () => {
  // O modo antigo tratava URL ausente como "não é produção" e seguia. Se a
  // variável de ambiente sumir do .env, o gerador não pode adivinhar o alvo.
  for (const url of [undefined, null, '', '   ']) {
    const r = validarAlvo({ org: ORG, perfil: 'estrutural', url, confirmou: true });
    assert.equal(r.ok, false, String(url));
    assert.ok(r.erros.some((e) => e.includes('--url')));
  }
});

test('refDoProjeto extrai o ref só de host supabase.co', () => {
  assert.equal(refDoProjeto('https://abc123.supabase.co'), 'abc123');
  assert.equal(refDoProjeto('https://abc123.supabase.co/rest/v1/'), 'abc123');
  assert.equal(refDoProjeto('http://localhost:54321'), null);
  assert.equal(refDoProjeto('http://127.0.0.1:54321'), null);
  assert.equal(refDoProjeto('nao-e-url'), null);
  assert.equal(refDoProjeto(null), null);
});

test('ehProducaoProibida é a trava usada também pela limpeza', () => {
  assert.equal(ehProducaoProibida(`https://${REF_PRODUCAO_NR13}.supabase.co`), true);
  assert.equal(ehProducaoProibida('https://outroprojeto.supabase.co'), false);
  assert.equal(ehProducaoProibida('http://localhost:54321'), false);
  // Fail-closed também aqui: URL ilegível conta como proibida.
  assert.equal(ehProducaoProibida(''), true);
  assert.equal(ehProducaoProibida(null), true);
});

test('aceita o alvo local completo', () => {
  const r = validarAlvo({ org: ORG, perfil: 'estrutural', url: 'http://127.0.0.1:54321', confirmou: true });
  assert.equal(r.ok, true);
  assert.equal(r.ehProducao, false);
  assert.equal(r.producaoProibida, false);
});

// ── arquivos sintéticos ─────────────────────────────────────────────────────
test('os arquivos saem no tamanho pedido, dentro de ±10 %', () => {
  for (const alvo of [2048, 5120, 20480, 90112]) {
    assert.ok(desvio(jpegSintetico(1, alvo).length, alvo) <= 0.10, `jpeg ${alvo}`);
    assert.ok(desvio(pdfSintetico(1, alvo).length, alvo) <= 0.10, `pdf ${alvo}`);
    assert.ok(desvio(pngSintetico(1, alvo).length, alvo) <= 0.10, `png ${alvo}`);
  }
});

test('o preenchimento é INCOMPRESSÍVEL — senão a medição de Storage mentiria', () => {
  const alvo = 200 * 1024;
  const pdf = pdfSintetico(3, alvo);
  const comprimido = gzipSync(Buffer.from(pdf)).length;
  // Ruído não comprime: aceitar no máximo 5 % de ganho.
  assert.ok(comprimido > pdf.length * 0.95, `comprimiu demais: ${pdf.length} → ${comprimido}`);
});

test('os arquivos são identificáveis como sintéticos', () => {
  for (const bytes of [jpegSintetico(1, 4096), pdfSintetico(1, 4096), pngSintetico(1, 4096)]) {
    assert.ok(Buffer.from(bytes.slice(0, 80)).toString('latin1').includes(MARCA));
  }
});

test('mesmo seed e mesmo tamanho geram bytes idênticos', () => {
  assert.deepEqual(jpegSintetico(5, 4096), jpegSintetico(5, 4096));
  assert.notDeepEqual(jpegSintetico(5, 4096), jpegSintetico(6, 4096));
});

// ── formato do conteúdo ─────────────────────────────────────────────────────
test('o relatório sintético usa REFERÊNCIA, nunca base64', () => {
  const pares = gerar(4, 1, 1);
  const rel = pares.find(([c]) => c.startsWith('nr13_rel_'));
  assert.ok(rel);
  const v = JSON.parse(rel[1]);
  assert.ok(v.meta.empresa.logoRef?.path);
  assert.ok(v.meta.assinantes.engenheiro.assinaturaRef?.path);
  assert.equal(v.meta.empresa.logo, undefined);
  assert.equal(v.meta.assinantes.engenheiro.assinatura, undefined);
  assert.ok(!rel[1].includes('data:image'));
});

test('as 8 chaves por equipamento estão presentes, mais índice e relatórios', () => {
  const pares = gerar(6, 1, 2).map(([c]) => c.replace(/ZZ-SCALE-F8-6-0$/, '<TAG>'));
  for (const fam of ['nr13_info_', 'nr13_emp_', 'nr13_cat_', 'nr13_calc_', 'nr13_fotos_', 'nr13_vida_', 'nr13_pref_unidade_', 'nr13_docs_']) {
    assert.ok(pares.some((c) => c.startsWith(fam)), `faltou ${fam}`);
  }
  assert.equal(pares.filter((c) => c.startsWith('nr13_rel_')).length, 2);
  assert.equal(pares.filter((c) => c.startsWith('nr13_historico_indice_')).length, 1);
});

test('nenhum valor gerado contém base64 de imagem', () => {
  for (const [, valor] of gerar(2, 10)) assert.ok(!valor.includes('data:image'));
});
