/**
 * O MEMORIAL ABRE SEM DEPENDER DO CACHE — 16/09/2026.
 *
 * Irmão do `fichaSobDemanda.test.ts`. `/equipamento/:tag/memorial` tinha o
 * padrão antigo da ficha — `carregarInfo(tag)` do cache e, não achando,
 * `navigate('/equipamentos')`. Chegando pela ficha funcionava (a ficha já havia
 * semeado a TAG), e por isso o defeito passava despercebido: quem abre a URL
 * direta, cola o link numa aba nova ou dá F5 DENTRO do memorial cai numa tela
 * que se fecha sozinha.
 *
 * A prova de DADOS (cache vazio → busca pontual → abre; ausente; indisponível;
 * TAG; catálogo não carregado) é a mesma de `abrirFicha`, e está lá: as duas
 * telas usam a MESMA função. O que este arquivo trava é que o memorial
 * realmente a usa — e que ninguém recoloque o redirecionamento.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const memorial = readFileSync(join(process.cwd(), 'src/pages/Memorial.tsx'), 'utf8');
const porta = readFileSync(join(process.cwd(), 'src/features/equipamento/PortaEquipamento.tsx'), 'utf8');
const ficha = readFileSync(join(process.cwd(), 'src/pages/Equipamento.tsx'), 'utf8');

/** O fonte sem as linhas de comentário: citar o padrão antigo não é executá-lo. */
function semComentarios(fonte: string): string {
  return fonte
    .split(String.fromCharCode(10))
    .filter((l) => !/^[ ]*([/][*]|[*]|[/][/])/.test(l))
    .join(String.fromCharCode(10));
}

describe('o Memorial não devolve ninguém para a lista', () => {
  const codigo = semComentarios(memorial);

  it('não sobrou o "sem info → redireciona"', () => {
    expect(codigo).not.toMatch(/if \(!info\) navigate/);
  });

  it('não navega para /equipamentos em lugar nenhum', () => {
    // O único caminho de volta é um LINK que o usuário clica — não um efeito.
    expect(codigo).not.toContain("navigate('/equipamentos')");
    expect(codigo.includes('useNavigate')).toBe(false);
  });

  it('nem a porta que ele usa navega', () => {
    expect(semComentarios(porta).includes('navigate(')).toBe(false);
  });
});

describe('uma implementação só, compartilhada com a ficha', () => {
  it('o Memorial usa a MESMA porta da ficha', () => {
    expect(memorial).toContain('useAberturaEquipamento');
    expect(memorial).toContain('TelaAbertura');
    expect(memorial).toContain("from '../features/equipamento/PortaEquipamento'");
  });

  it('a ficha usa a mesma coisa — nenhuma das duas tem cópia própria', () => {
    expect(ficha).toContain('useAberturaEquipamento');
    expect(ficha).toContain('TelaAbertura');
  });

  it('os quatro estados existem uma vez, na porta', () => {
    for (const estado of [
      'Carregando equipamento',
      'Equipamento não encontrado',
      'Sem conexão com o servidor',
      'Tentar de novo',
    ]) {
      expect(porta).toContain(estado);
      // Não duplicado nas telas.
      expect(memorial).not.toContain(estado);
      expect(ficha).not.toContain(estado);
    }
  });

  it('o estado da busca vive num módulo só', () => {
    // O hook mora fora do .tsx por causa do fast refresh; o que importa é que
    // seja UM, e que nenhuma das duas telas tenha o seu.
    const hook = readFileSync(
      join(process.cwd(), 'src/features/equipamento/usarAberturaEquipamento.ts'),
      'utf8',
    );
    expect(hook).toContain('abrirFicha');
    expect(semComentarios(memorial)).not.toContain('abrirFicha');
    expect(semComentarios(ficha)).not.toContain('abrirFicha');
  });
});

describe('o boot leve continua inteiro', () => {
  it('o Memorial não hidrata nada nem consulta o catálogo', () => {
    const codigo = semComentarios(memorial);
    expect(codigo).not.toContain('lerTudo');
    expect(codigo).not.toContain('listarPagina');
    expect(codigo).not.toContain('buscar_equipamentos');
    // Nem lê o cache direto: quem resolve a TAG é a porta.
    expect(codigo).not.toContain('carregarInfo');
  });

  it('a porta também não tem caminho de hidratação integral', () => {
    expect(semComentarios(porta)).not.toContain('lerTudo');
    expect(semComentarios(porta)).not.toContain('listarPagina');
  });
});

describe('o CÁLCULO do memorial não foi tocado', () => {
  it('as três calculadoras continuam montadas por tipo, com a mesma TAG', () => {
    expect(memorial).toContain('<MemorialVaso tag={tag} />');
    expect(memorial).toContain('<MemorialCaldeira tag={tag} />');
    expect(memorial).toContain('MemorialAutoclave');
    expect(memorial).toContain('subtipo as');
  });

  it('a TAG usada é a RESOLVIDA, não o texto da URL', () => {
    // `abrirFicha` pode casar pela forma normalizada; montar as chaves com o
    // texto da URL gravaria o memorial numa TAG que não existe.
    expect(memorial).toContain('tag={abertura.tag}');
  });
});
