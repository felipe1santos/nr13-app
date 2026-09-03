# PONTO DE RETOMADA — 03/09/2026 (FASE 9 CONCLUÍDA ✅)

> **A Fase 9 acabou.** As oito flags foram a 30/30, o gate global passou, e os
> caminhos legados foram REMOVIDOS do cliente e dos testes. O sistema tem hoje
> **um caminho só** em cada tela.
>
> **Bundle em produção:** `assets/index-sRCLN57V.js` · commit `c867894`
> **Suíte:** 1.608 testes / 135 arquivos · **Build:** verde

---

## ⚠️ A ÚNICA COISA PENDENTE DA FASE 9

**`supabase/fase9_remocao_flags.sql` NÃO foi aplicado.** O editor SQL do
dashboard do Supabase não carregou nas quatro tentativas do fim da sessão.

**Não é urgente e não quebra nada.** O cliente saiu primeiro: o bundle no ar já
não lê nenhuma das oito colunas (`sincronizarFlagDoServidor` seleciona apenas
`v2_ativa`). As colunas seguem em `org_sync` sem ninguém as consultar.

**Como concluir**, quando o dashboard voltar a abrir:

1. abrir o SQL Editor do projeto `qqsesrntfvmdxqxrfvmw`;
2. conferir o SHA-256 do texto no editor contra
   `8f3c95e5a429b887346e2897f9f2ca1d0562fefd613fa01dcb902de4036da207`
   (5.733 bytes, LF) — regra do §13 do `CLAUDE.md`;
3. rodar. O arquivo tem guarda própria: recusa se alguma organização ainda
   estiver com flag desligada;
4. conferir depois por estrutura (`information_schema.columns` de `org_sync`
   deve ficar só com `v2_ativa` entre as flags).

---

## Estado de produção

| | |
|---|---|
| projeto Supabase | `qqsesrntfvmdxqxrfvmw` (org **SAAS-NR13**) |
| organizações | 30 |
| auditoria de projeção | **30/30 convergindo** |
| `busca_pendencias` | **0** |
| flags | as 8 da Fase 9 em **30/30** no banco, e **não lidas** pelo cliente. `v2_ativa` em 30/30 |
| conta de teste | `teste@gmail.com` — org `99f642d3-6efd-446d-9e76-d234ad8d211c` |

### O que o sistema faz hoje, em uma linha por tela

Todas as listas vêm da **projeção**, com busca e paginação no servidor; o
equipamento chega por **semeadura sob demanda**; o boot baixa só o **essencial**;
o painel de vencimentos vem do **agregado**. Nenhuma tela hidrata a organização
inteira — medido: **hidratação integral = 0** nas sete.

---

## O que vem a seguir

**Fase 10A — UX / OPERAÇÃO. Autorizada pelo dono, NÃO iniciada.**

Cinco entregas, na ordem em que foram pedidas:

1. **Agenda** — sai do Dashboard e vira item próprio de menu; número do dia no
   canto superior esquerdo; dia selecionado só com contorno/círculo azul-escuro;
   resumo dos serviços dentro do dia; clique abre modal com empresa, endereço,
   responsável, telefone, tipo, horário, status e valor.
2. **Serviços / faturamento** — valor ao cadastrar inspeção/manutenção/serviço,
   com faturamento **previsto** separado do **realizado**.
3. **`/relatorios`** — listar relatórios direto, mais recentes primeiro, filtros
   por data, TAG, empresa e tipo. Ícone à esquerda: **usar o arquivo real de
   Downloads chamado `pdf-IMAGEM`**, não recriar um ícone genérico.
4. **`/prontuarios`** — listar prontuários direto, filtros equivalentes.
5. **`/calibracoes`** — segue por EQUIPAMENTO; ocultar por padrão quem tem 0
   calibrações; foto do equipamento à esquerda, com placeholder quando faltar.

> **Um achado da sessão que encurta o item 3:** `/relatorios` **já lista
> relatórios** por data, com filtro de período e tipo — é a tela da 9E
> (`RelatoriosV9` + `buscar_relatorios`). O que falta ali é o **ícone PDF**, o
> **filtro por empresa** e, mais tarde, os **badges rascunho/finalizado**.

**NÃO iniciar:** 10B.1 (rascunho/finalização), 10B.2 (Livro manual), 10C (layout
novo), Fase 11 (PDF vetorial). Desenho de todas em `FASE-10-DESENHO.md`.

---

## Endereços

| o quê | onde |
|---|---|
| sistema | https://app.nr13sistema.com.br |
| Supabase | https://supabase.com/dashboard/project/qqsesrntfvmdxqxrfvmw |
| Coolify (deploy) | `http://187.77.34.112:8000/project/ngg0g8oo0sw0wk8ggw8wso4o/environment/vwcgcgsogsswwck8w04c0c0w/application/ok40g4s8ko8wgssk8go00sg8` |
| repo | `felipe1santos/nr13-app`, branch `main` |

**Fluxo de deploy:** push → recarregar a página do Coolify → `Redeploy` →
esperar sair de *In Progress* → **conferir pelo bundle servido**, nunca pelo
clique.
