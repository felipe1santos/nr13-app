# PONTO DE RETOMADA — 04/09/2026 (FASE 11 · PILOTO VETORIAL PROVADO)

> **O Livro deixou de ser escrito sozinho.** Finalizar um relatório não cria mais
> registro: agora é NOVO REGISTRO → SALVAR (rascunho, editável) → TRANCAR →
> cadeia → imutável → Portal. O relatório já tinha ganhado o mesmo ciclo na
> 10B.1 (rascunho → finalizar → PDF + SHA-256).
>
> **Bundle em produção:** `assets/index-CYGSnZwQ.js` · commit `a53a60e`
> **Suíte:** 1.680 testes / 142 arquivos · **Build:** verde

---

## ⚠️ AS DUAS COISAS PENDENTES

### 0 · DEPLOY DA EDGE `portal_cliente` PENDENTE (04/09/2026)

O commit `6225581` endurece a autorização sob demanda: a Edge passa a NEGAR
`nr13_livro_rascunho_*` por família, antes de permitir por TAG. **O código está
no repo e testado (`portalSobDemanda.test.ts`), mas a função NÃO foi deployada:**
o dashboard do Supabase não abre nesta máquina (corpo vazio, mesma falha do SQL
Editor) e a CLI não tem token.

Para concluir, no terminal do projeto:

```
npx supabase login
npx supabase functions deploy portal_cliente --project-ref qqsesrntfvmdxqxrfvmw
```

Enquanto não for deployada vale o que já valia: o cliente do Portal nunca pede
essa chave, e o rascunho não contém documento assinado.

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
| ~~10B.1~~ | **ENTREGUE em 04/09/2026** — `medicoes/2026-09-04-10b1-rascunho-e-finalizacao.md` |
| ~~10B.2~~ | **ENTREGUE em 04/09/2026** — `medicoes/2026-09-04-10b2-livro-manual.md`. O gatilho `livro_imutavel.sql` NÃO foi afrouxado, como a análise previa |
| **10C** | **ESPECIFICADA em 04/09/2026** — `FASE-10C-ESPECIFICACAO-LAYOUT.md`. A referência apareceu (`C:\projetos\vender\relatorio-nr13.html`). Faltam 3 decisões do dono: fonte, campos novos (recomendações / próximas inspeções por exame) e checklist em 2 ou 3 folhas |
| **Fase 11** | **PILOTO PROVADO em 04/09/2026** — `medicoes/2026-09-04-11-piloto-vetorial.md`. 5 folhas em vetor, −93% de peso e 29× mais rápido POR PÁGINA, Carlito embutida, SHA/pdfRef conferidos. Falta expandir às 21 folhas (paginação dentro de tabela é o item nº 1) |

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
