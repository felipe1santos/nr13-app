# PONTO DE RETOMADA — 03/09/2026 (FASE 10A ENTREGUE ✅)

> **A Agenda tem tela própria, com faturamento previsto × realizado, e as três
> listas passaram a mostrar o que interessa.** A Fase 9 foi concluída na mesma
> data — o sistema tem um caminho só em cada tela.
>
> **Bundle em produção:** `assets/index-BCZItTcM.js` · commit `65dd961`
> **Suíte:** 1.633 testes / 138 arquivos · **Build:** verde

---

## ⚠️ AS DUAS COISAS PENDENTES

### 1 · `supabase/fase9_remocao_flags.sql` NÃO foi aplicado

O editor SQL do dashboard do Supabase não carrega (seis tentativas em duas
sessões). **Não é urgente e não quebra nada:** o bundle no ar já não lê nenhuma
das oito colunas (`sincronizarFlagDoServidor` seleciona apenas `v2_ativa`).

Quando o dashboard voltar a abrir: conferir o SHA-256 do texto no editor contra
`8f3c95e5a429b887346e2897f9f2ca1d0562fefd613fa01dcb902de4036da207`
(5.733 bytes, LF) — regra do §13 do `CLAUDE.md` — e rodar. O arquivo tem guarda
própria e não toca em dado nenhum.

### 2 · O SQL que tornaria os filtros da 10A server-side

Os filtros por empresa (em `/relatorios`) e o recorte "só com prontuário / só
com calibração" são feitos NO CLIENTE, porque a projeção não tem as colunas. Em
produção isso custa **uma requisição** (a maior organização tem 39
equipamentos); acima de 1.000 a varredura para no teto e a tela avisa.

O que resolve, quando houver SQL:
- `cliente_nome` em `relatorios_index` + filtro na RPC `buscar_relatorios`;
- `p_com_prontuario` / `p_com_calibracao` em `buscar_equipamentos`;
- uma coluna de **data de atualização do prontuário** — sem ela o filtro por
  data pedido na 10A.3 não existe, e foi declarado como não entregue.

---

## Estado de produção

| | |
|---|---|
| projeto Supabase | `qqsesrntfvmdxqxrfvmw` (org **SAAS-NR13**) |
| organizações | 30 |
| auditoria de projeção | **30/30 convergindo** · `busca_pendencias` **0** |
| flags | as 8 da Fase 9 em 30/30 no banco e **não lidas** pelo cliente. `v2_ativa` em 30/30 |
| conta de teste | `teste@gmail.com` — org `99f642d3-6efd-446d-9e76-d234ad8d211c` |

Todas as listas vêm da **projeção**, com busca e paginação no servidor; o
equipamento chega por **semeadura sob demanda**; o boot baixa só o **essencial**;
o painel de vencimentos vem do **agregado**. Hidratação integral = **0**.

---

## O que vem a seguir — nada iniciado

| bloco | o que é |
|---|---|
| **10B.1** | relatório RASCUNHO → FINALIZAR → PDF imutável |
| **10B.2** | Livro/Registro: criação MANUAL do registro + TRANCAR (achado da análise: `livro_imutavel.sql` já tolera entrada sem lacre, então o gatilho NÃO precisa ser afrouxado) |
| **10C** | novo layout documental — **bloqueado**: o `relatorio-nr13.html` nunca foi entregue |
| **Fase 11** | PDF vetorial/híbrido |

Desenho de todos em [`FASE-10-DESENHO.md`](FASE-10-DESENHO.md).

---

## Endereços

| o quê | onde |
|---|---|
| sistema | https://app.nr13sistema.com.br |
| Supabase | https://supabase.com/dashboard/project/qqsesrntfvmdxqxrfvmw |
| Coolify (deploy) | `http://187.77.34.112:8000/project/ngg0g8oo0sw0wk8ggw8wso4o/environment/vwcgcgsogsswwck8w04c0c0w/application/ok40g4s8ko8wgssk8go00sg8` |
| repo | `felipe1santos/nr13-app`, branch `main` |

**Fluxo de deploy:** push → recarregar a página do Coolify → `Redeploy` →
esperar → **conferir pelo bundle servido**, nunca pelo clique.
