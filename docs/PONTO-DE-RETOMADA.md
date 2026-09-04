# PONTO DE RETOMADA — 04/09/2026 (FASE 12B CONCLUÍDA · FASE 13 SÓ ANALISADA)

> **RELATÓRIO e PRONTUÁRIO são vetoriais em produção.** O relatório virou em
> 04/09 (`nr13_motor_pdf`) e o prontuário no mesmo dia (`nr13_motor_prontuario`,
> chave SEPARADA — rollback de um não arrasta o outro).
>
> **O prontuário passou a ser EMITIDO**, e não só impresso: bytes → SHA-256 →
> Storage → `pdfRef`. Emitir de novo acrescenta REVISÃO; `pdfRef` gravado nunca
> é sobrescrito. Documento histórico nunca muda de motor.
>
> Raster/gerador antigo continuam no bundle: `definirMotorPdf('raster')` e
> `definirMotorProntuario('atual')`.
>
> **Bundle em produção:** `assets/index-Cb-GK4ZC.js`
> **Suíte:** 1.880 testes / 155 arquivos · **Build:** verde
>
> **Fase 13 NÃO iniciada** — só o plano, em `FASE-13-ANALISE.md`.

---

## ⚠️ AS DUAS COISAS PENDENTES

### 0 · ~~DEPLOY DAS EDGES~~ — RESOLVIDO em 04/09/2026 ✅

`portal_cliente` e `admin` (`f6e0629`) foram publicadas **pelo dashboard**, sem
CLI, e conferidas por SHA-256 contra o repo depois do deploy. `portal_cliente`
foi **republicada** no fim do dia (hardening da Fase 12) para levar a linha
`nr13_pront_emitido_` de `FORA_DO_PORTAL`: `prefixos.ts` no servidor volta com
`acf3b6f1…82a8f` e `index.ts` seguiu intocado.

Validado em produção com um acesso de portal descartável: Livro oficial
permitido, `nr13_livro_rascunho_*` **negado** (inclusive empacotado junto de uma
chave autorizada), TAG de outro cliente negada, relatório legado abrindo.

**Como publicar Edge sem CLI** (o dashboard só renderiza com a janela do Chrome
visível; `setValue` do Monaco NÃO publica — tem que ser colagem real, e há um
modal de confirmação): ver a memória `deploy-edge-pelo-dashboard`.

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
| ~~**Fase 11**~~ | **CONCLUÍDA em 04/09/2026** — vetorial é o padrão global do relatório (`nr13_motor_pdf`). Único gate manual restante: **impressão física** |
| ~~**Fase 12**~~ | **CONCLUÍDA em 04/09/2026** — prontuário vetorial e EMITIDO, `portal_cliente` republicada, e **IMPRIMIR passou a servir o arquivo arquivado** nos dois documentos. Detalhe em `medicoes/2026-09-04-fase12-hardening.md` |
| **Fase 13** | **analisada, não iniciada** — `FASE-13-ANALISE.md`. Tema: a PRÉVIA passa a ser o DOCUMENTO (hoje se edita o desenho Clássico e se assina o Novo), com aposentadoria do palco só para a tela do relatório. 6 blocos, 8–9 rodadas |

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
