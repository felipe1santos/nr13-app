/**
 * FASE 5 · foto com descrição individual — o MODELO (24/09/2026).
 *
 * Letras = itens do pedido da Fase 5 (§33). As que dependem de navegador de
 * verdade (F5 real, nova aba, offline, reconexão) estão no E2E do laboratório;
 * aqui fica o que o modelo garante sozinho: a lista gravada e relida (JSON,
 * que é o que o storage faz) volta com os mesmos ids, descrições e ordem.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { RefFoto } from '../../services/fotos';
import {
  adicionarFotos,
  definirDescricao,
  moverFoto,
  normalizarFotos,
  pendenciasParaEmissao,
  removerDaLista,
  rotuloFoto,
  type FotoDescrita,
} from './fotosDescritas';

const ref = (n: number): RefFoto => ({
  bucket: 'inspecao',
  path: `org-a/ZZ_imagens/uuid-${n}.jpg`,
  mimeType: 'image/jpeg',
  tamanho: 100_000 + n,
  thumb: { bucket: 'inspecao', path: `org-a/ZZ_imagens/uuid-${n}.thumb.jpg`, mimeType: 'image/jpeg', tamanho: 16_000 },
});

/** O que o storage faz com a lista: serializa e desserializa. */
const gravarELer = (l: FotoDescrita[]) => normalizarFotos(JSON.parse(JSON.stringify(l)));

function tresFotos(): FotoDescrita[] {
  let l = adicionarFotos([], [ref(1), ref(2), ref(3)]);
  l = definirDescricao(l, l[0].id, 'Vista geral do equipamento.');
  l = definirDescricao(l, l[1].id, 'Válvula de segurança instalada no equipamento.');
  l = definirDescricao(l, l[2].id, 'Manômetro instalado na linha de vapor.');
  return l;
}

describe('D · ID estável', () => {
  it('toda foto nova nasce com id próprio, diferente das outras', () => {
    const l = adicionarFotos([], [ref(1), ref(2), ref(3)]);
    expect(new Set(l.map((f) => f.id)).size).toBe(3);
    for (const f of l) expect(f.id).toMatch(/^foto-[0-9a-f-]{36}$/);
  });

  it('reordenar muda a ordem e NÃO muda o id, a descrição nem o arquivo', () => {
    const l = tresFotos();
    const antes = new Map(l.map((f) => [f.id, { d: f.descricao, p: f.ref?.path }]));
    const movida = moverFoto(l, l[2].id, -1);
    for (const f of movida) {
      expect(antes.get(f.id)).toEqual({ d: f.descricao, p: f.ref?.path });
    }
  });

  it('foto ANTIGA sem id ganha id derivado do caminho — o mesmo em qualquer aparelho, sem regravar', () => {
    const antiga = [{ ref: ref(7), descricao: 'x' }];
    expect(normalizarFotos(antiga)[0].id).toBe(`ref:${ref(7).path}`);
    expect(normalizarFotos(antiga)[0].id).toBe(normalizarFotos(JSON.parse(JSON.stringify(antiga)))[0].id);
  });
});

describe('E · descrição presa ao ID', () => {
  it('editar a descrição de um id não toca nas outras', () => {
    const l = tresFotos();
    const e = definirDescricao(l, l[1].id, 'Nova descrição');
    expect(e.map((f) => f.descricao)).toEqual(['Vista geral do equipamento.', 'Nova descrição', 'Manômetro instalado na linha de vapor.']);
  });

  it('descrição editada DEPOIS de remover a anterior continua na foto certa (o defeito do índice)', () => {
    const l = tresFotos();
    const alvo = l[2].id;
    const semPrimeira = removerDaLista(l, l[0].id);
    const e = definirDescricao(semPrimeira, alvo, 'Pontos de corrosão observados no costado.');
    expect(e.find((f) => f.id === alvo)?.descricao).toBe('Pontos de corrosão observados no costado.');
    expect(e.find((f) => f.id === alvo)?.ref?.path).toBe(ref(3).path);
  });
});

describe('F · reordenar não troca descrição', () => {
  it('mover para cima e para baixo leva a descrição junto', () => {
    const l = tresFotos();
    const m = moverFoto(moverFoto(l, l[2].id, -1), l[2].id, -1);
    expect(m.map((f) => f.descricao)).toEqual([
      'Manômetro instalado na linha de vapor.',
      'Vista geral do equipamento.',
      'Válvula de segurança instalada no equipamento.',
    ]);
    expect(m.map((f) => f.ordem)).toEqual([0, 1, 2]);
  });

  it('mover além dos limites não faz nada', () => {
    const l = tresFotos();
    expect(moverFoto(l, l[0].id, -1).map((f) => f.id)).toEqual(l.map((f) => f.id));
    expect(moverFoto(l, l[2].id, 1).map((f) => f.id)).toEqual(l.map((f) => f.id));
  });
});

describe('G · remover no rascunho', () => {
  it('tira da lista, renumera a ordem e preserva as outras', () => {
    const l = tresFotos();
    const r = removerDaLista(l, l[1].id);
    expect(r).toHaveLength(2);
    expect(r.map((f) => f.ordem)).toEqual([0, 1]);
    expect(r.map((f) => f.descricao)).toEqual(['Vista geral do equipamento.', 'Manômetro instalado na linha de vapor.']);
  });

  it('não apaga arquivo: nem o editor nem o modelo chamam `services/fotos.removerFoto`', () => {
    for (const arq of [
      'src/features/inspecoes/fotosDescritas.ts',
      'src/features/inspecoes/EditorFotosDescritas.tsx',
      'src/features/inspecoes/formularios/FormularioRelatorioImagens.tsx',
    ]) {
      const s = readFileSync(arq, 'utf8');
      expect(s, arq).not.toMatch(/import[^;]*\bremoverFoto\b[^;]*from '[^']*services\/fotos'/);
      expect(s, arq).not.toMatch(/storage\.from\([^)]*\)\.remove\(/);
    }
  });
});

describe('H/I · F5 e nova aba = gravar e reler', () => {
  it('a lista relida do storage é idêntica: ids, ordem e descrições', () => {
    const l = moverFoto(tresFotos(), tresFotos()[0].id, 1);
    expect(gravarELer(l)).toEqual(l);
  });

  it('array embaralhado (merge) volta na ordem de `ordem`, não na posição', () => {
    const l = moverFoto(tresFotos(), tresFotos()[2].id, -1);
    const embaralhado = [l[2], l[0], l[1]];
    expect(normalizarFotos(embaralhado).map((f) => f.id)).toEqual(l.map((f) => f.id));
  });

  it('id repetido (duas cópias vindas de merge) aparece uma vez só', () => {
    const l = tresFotos();
    expect(normalizarFotos([...l, l[0]])).toHaveLength(3);
  });
});

describe('Q · numeração derivada da ordem', () => {
  it('"Foto 01…" com dois dígitos', () => {
    expect(rotuloFoto(0)).toBe('Foto 01');
    expect(rotuloFoto(9)).toBe('Foto 10');
    expect(rotuloFoto(30)).toBe('Foto 31');
  });

  it('o id abc era Foto 03; movido para o topo vira Foto 01 com o MESMO id', () => {
    const l = tresFotos();
    const abc = l[2].id;
    const m = moverFoto(moverFoto(l, abc, -1), abc, -1);
    const i = m.findIndex((f) => f.id === abc);
    expect(rotuloFoto(i)).toBe('Foto 01');
    expect(m[i].id).toBe(abc);
  });
});

describe('T/U · validação: rascunho livre, emissão exige', () => {
  it('T · nada no modelo impede salvar incompleto (lista sem descrição é uma lista válida)', () => {
    const l = adicionarFotos([], [ref(1)]);
    expect(gravarELer(l)).toEqual(l);
  });

  it('U · sem foto não emite', () => {
    expect(pendenciasParaEmissao([])).toEqual([{ id: null, mensagem: 'Adicione ao menos uma imagem.' }]);
    expect(pendenciasParaEmissao(undefined)).toHaveLength(1);
  });

  it('U · foto sem descrição (ou só espaços) bloqueia, nomeando a foto pela ORDEM', () => {
    let l = tresFotos();
    l = definirDescricao(l, l[1].id, '   ');
    expect(pendenciasParaEmissao(l)).toEqual([{ id: l[1].id, mensagem: 'Foto 02 está sem descrição.' }]);
  });

  it('U · tudo descrito libera', () => {
    expect(pendenciasParaEmissao(tresFotos())).toEqual([]);
  });
});

describe('V · histórico sem descrição continua válido', () => {
  it('foto antiga sem descrição e em base64 normaliza sem inventar legenda', () => {
    const n = normalizarFotos([{ base64: 'data:image/jpeg;base64,AAAA' }, { ref: ref(2) }]);
    expect(n.map((f) => f.descricao)).toEqual(['', '']);
    expect(n[0].base64).toBe('data:image/jpeg;base64,AAAA');
  });

  it('a exigência de descrição NÃO está nos ensaios antigos: só o Relatório de Imagens chama `pendenciasParaEmissao`', () => {
    const chamadores = [
      'src/features/inspecoes/formularios/FormularioChecklist.tsx',
      'src/features/inspecoes/formularios/FormularioVisualExterno.tsx',
      'src/features/inspecoes/formularios/FormularioVisualInterno.tsx',
      'src/features/inspecoes/formularios/FormularioTH.tsx',
    ];
    for (const arq of chamadores) expect(readFileSync(arq, 'utf8'), arq).not.toContain('pendenciasParaEmissao');
  });
});

describe('X · nenhum Base64 pesado no registro', () => {
  it('foto nova grava só a referência — nada começa com "data:"', () => {
    const l = tresFotos();
    const json = JSON.stringify({ dataRegistro: '2026-09-24', observacoes: '', fotos: l });
    expect(json).not.toContain('data:');
    // ~3 fotos com miniatura: centenas de bytes, não centenas de KB.
    expect(json.length).toBeLessThan(2_000);
  });
});

describe('W · isolamento entre organizações', () => {
  it('a pasta do Relatório de Imagens fica DENTRO da pasta da organização (policy do bucket)', async () => {
    const { montarPath } = await import('../../services/fotos');
    const p = montarPath('org-a', 'ZZ-TAG/imagens');
    expect(p.split('/')[0]).toBe('org-a');
    expect(p).toMatch(/^org-a\/ZZ-TAG_imagens\/[0-9a-f-]{36}\.jpg$/);
  });

  it('o formulário grava as fotos com o escopo `${tag}/imagens` pelo `salvarFoto` de sempre', () => {
    const s = readFileSync('src/features/inspecoes/formularios/FormularioRelatorioImagens.tsx', 'utf8');
    expect(s).toContain('escopo={`${tag}/imagens`}');
    const editor = readFileSync('src/features/inspecoes/EditorFotosDescritas.tsx', 'utf8');
    expect(editor).toContain("import { salvarFoto, type RefFoto } from '../../services/fotos';");
  });
});

describe('outros ensaios usam o MESMO editor (sem cópia do bloco antigo)', () => {
  for (const arq of [
    'src/features/inspecoes/formularios/FormularioChecklist.tsx',
    'src/features/inspecoes/formularios/FormularioVisualExterno.tsx',
    'src/features/inspecoes/formularios/FormularioVisualInterno.tsx',
    'src/features/inspecoes/formularios/FormularioTH.tsx',
    'src/features/inspecoes/formularios/FormularioRelatorioImagens.tsx',
  ]) {
    it(arq.split('/').pop()!, () => {
      const s = readFileSync(arq, 'utf8');
      expect(s).toContain('<EditorFotosDescritas');
      // O bloco antigo identificava a foto pela posição.
      expect(s).not.toMatch(/key=\{(i|idx)\}\s+className="foto-formulario-item"/);
      expect(s).not.toContain('setDescricaoFoto(');
    });
  }
});
