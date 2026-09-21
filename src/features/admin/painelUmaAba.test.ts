/**
 * O PAINEL TEM DUAS ABAS (21/09/2026).
 *
 * "Faturamento", "Clientes pagantes", "Testes e expirados", "Leads" e
 * "Sub-logins" respondiam pedaços da mesma pergunta — quem são os clientes,
 * quanto pagam, o que estão fazendo — e obrigavam a trocar de tela para agir.
 * Ficaram duas: **Visão geral** (servidor, gráficos, capacidade) e
 * **Clientes** (a lista, com tag, mensalidade e ações).
 *
 * Este arquivo trava a estrutura: é fácil alguém reintroduzir uma aba e voltar
 * a espalhar a informação.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const TELA = readFileSync('src/pages/Admin.tsx', 'utf8');
const CLIENTES = readFileSync('src/features/admin/PainelClientes.tsx', 'utf8');
const MODAL = readFileSync('src/features/admin/ModalNovoCliente.tsx', 'utf8');

describe('duas abas, e só', () => {
  it('a barra tem Visão geral e Clientes', () => {
    // Duas, e só duas: cada botão de aba carrega a classe `admin-aba`.
    expect((TELA.match(/className=\{`admin-aba/g) ?? []).length).toBe(2);
    expect(TELA).toContain('Visão geral');
    expect(TELA).toContain("setAba('clientes')");
  });

  it('as abas que saíram não voltam', () => {
    for (const sumida of ['Testes e expirados', 'Sub-logins', 'Permitir cadastro automático']) {
      expect(TELA).not.toContain(sumida);
    }
    // "Leads" não pode voltar como aba; o texto solto em comentário não conta.
    expect(TELA).not.toMatch(/setAba\('leads'\)/);
    expect(TELA).not.toMatch(/setAba\('acessos'\)/);
    expect(TELA).not.toMatch(/setAba\('faturamento'\)/);
  });

  it('o corpo é Visão geral OU a aba de Clientes', () => {
    expect(TELA).toContain("{aba === 'visao' ? (");
    expect(TELA).toContain('<PainelVisaoGeral');
    expect(TELA).toContain('<PainelClientes');
  });
});

describe('a aba de Clientes concentra o que estava espalhado', () => {
  it('tem os KPIs de receita, a ocupação do servidor e a lista', () => {
    expect(CLIENTES).toContain('Receita mensal (MRR)');
    expect(CLIENTES).toContain('adm-ocupacao-quadros');
    expect(CLIENTES).toContain('<table className="admin-tabela">');
  });

  it('a lista é LEITURA: tag como etiqueta, valor como texto', () => {
    // 21/09/2026 · o seletor na linha saiu. Com 16 contas a tela virava um
    // formulário de 32 campos, e um clique errado trocava a classificação de
    // um cliente direto no banco, sem confirmação nenhuma.
    expect(CLIENTES).toContain('className={`adm-tag adm-tag-${c.tag}`}');
    expect(CLIENTES).not.toContain('admin-sel-tag');
    expect(CLIENTES).not.toContain('admin-inp-valor');
    expect(CLIENTES).toContain('adm-btn-editar');
    expect(CLIENTES).toContain('onEditar(c)');
  });

  it('cada tag tem a sua cor, e a classe carrega o nome dela', () => {
    const css = readFileSync('src/pages/admin.css', 'utf8');
    for (const tag of ['pagante', 'vitalicio', 'interna', 'suspenso']) {
      expect(css).toContain(`.adm-tag-${tag}`);
    }
  });

  it('a ocupação muda de cor pela COTA REAL, não por teto inventado', () => {
    expect(CLIENTES).toContain('nivelDeOcupacao(usado, cota)');
    expect(CLIENTES).toContain('infra?.dbCotaBytes');
    expect(CLIENTES).toContain('infra?.egressCotaBytes');
    const css = readFileSync('src/pages/admin.css', 'utf8');
    for (const nivel of ['nivel-ok', 'nivel-atencao', 'nivel-critico']) {
      expect(css).toContain(`.adm-quadro.${nivel}`);
    }
  });

  it('as ações de cada conta vivem no modal de edição', () => {
    const editar = readFileSync('src/features/admin/ModalEditarCliente.tsx', 'utf8');
    for (const acao of ['Suspender acesso', 'Liberar acesso', 'Definir validade', 'Excluir cliente']) {
      expect(editar).toContain(acao);
    }
    // E a página liga cada uma na função que já existia.
    expect(TELA).toContain('<ModalEditarCliente');
    expect(TELA).toContain('onAlternarAcesso=');
    expect(TELA).toContain('void excluir(p)');
  });

  it('tag e mensalidade são gravadas numa chamada só', () => {
    // Em dois `update`, uma falha na segunda deixaria a conta com a
    // classificação nova e o valor velho — e ninguém veria.
    expect(TELA).toContain('async function salvarClassificacao(');
    const i = TELA.indexOf('async function salvarClassificacao(');
    const bloco = TELA.slice(i, i + 1200);
    expect((bloco.match(/await atualizarPerfil\(/g) ?? []).length).toBe(1);
    expect(bloco).toContain('classificacao: tag');
    expect(bloco).toContain('valor_mensal');
  });

  it('o consumo por conta abre em MODAL, não em coluna', () => {
    expect(CLIENTES).toContain('setConsumoDe(c)');
    expect(CLIENTES).toContain('function ModalConsumo(');
    expect(CLIENTES).toContain('fj-modal-overlay');
  });

  it('o botão de novo cliente abre o modal de cadastro', () => {
    expect(CLIENTES).toContain('adm-btn-novo');
    expect(CLIENTES).toContain('+ Novo cliente');
    expect(TELA).toContain('<ModalNovoCliente');
    expect(TELA).toContain('setModalNovo(true)');
  });
});

describe('o cadastro já nasce classificado', () => {
  it('o modal pergunta tag e mensalidade junto com e-mail e senha', () => {
    for (const campo of ['E-mail de acesso', 'Senha provisória', 'Tag', 'Mensalidade', 'Dias de acesso']) {
      expect(MODAL).toContain(campo);
    }
  });

  it('mensalidade só vale para pagante', () => {
    expect(MODAL).toContain("disabled={tag !== 'pagante'}");
  });

  it('a página grava a classificação na criação', () => {
    expect(TELA).toContain('classificacao: d.tag');
    expect(TELA).toContain("if (d.tag === 'pagante' && Number.isFinite(valor) && valor > 0) patch.valor_mensal = valor;");
  });
});

describe('a lista mostra clientes, não leads', () => {
  it('quem nunca saiu do trial fica de fora', () => {
    expect(TELA).toContain("p.plano !== 'trial'");
  });

  it('sub-login não é cliente e não entra na lista', () => {
    expect(TELA).toContain("(!p.papel || p.papel === 'mestre')");
  });
});
