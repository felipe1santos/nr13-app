# 9D EM PRODUÇÃO — SQL aplicado, projeção refeita, front publicado

**25/08/2026.** Fecha o §4.1 e o §4.2 do ponto de retomada de 24/08.

---

## 1 · O que já estava aplicado quando esta sessão começou

Aplicado mais cedo no mesmo dia, sem registro escrito:

| passo | estado encontrado |
|---|---|
| `boot_v9_flag.sql` | **aplicado** — `org_sync.boot_v9` e `definir_boot_v9` existem |
| `vencimentos_agregado.sql` | **aplicado** — `vencimentos_org(p_limite)`, `f9_mais_meses`, `calibracoes_index` |
| `busca_manutencao.sql` | **NÃO aplicado** (ver §3) |
| `busca_index_rpc.sql` | **NÃO reaplicado** |
| reprojeção das 2 orgs | não feita |

### 1.1 · `revoke` de `public` vem antes de `anon` — medido ao aplicar

Toda função nova nasce com EXECUTE concedido a `public`, e `anon` **herda** de `public`.
A primeira versão de `vencimentos_agregado.sql` revogava só de `anon`, e o banco respondeu
`has_function_privilege('anon', 'public.vencimentos_org(integer)', 'execute') = true`.
Corrigido no arquivo (commit `aa984c9`) para o mesmo par de linhas de `busca_consulta.sql`:

```sql
revoke all on function public.vencimentos_org(integer)    from public, anon;
revoke all on function public.f9_mais_meses(date, integer) from public, anon;
```

Conferido depois em produção: `anon` = **false** nas duas funções.

---

## 2 · `origin/main` estava 3 commits atrás

A 9D inteira (`0819277`, `cd54457`, `941ebfb`) estava só no repositório local — o `git push`
nunca tinha sido feito. Consequências: o `raw.githubusercontent.com` servia o arquivo da 9C, e
o Coolify (que builda de `main`) não teria o que publicar. Push feito: `1414dc0..aa984c9`.

---

## 3 · O defeito que a auditoria NÃO acusava

Depois de reprojetar as duas organizações convergidas, `auditar_projecao` respondia
`convergiu: true, pendencias: 0` — e mesmo assim:

| | org `32512667…0f7e` |
|---|---|
| `nr13_vida_` vivas na verdade | 4 |
| `equipamentos_index` com `vida_base` | **0** |
| `nr13_calibracoes_` vivas na verdade | 4 |
| linhas em `calibracoes_index` | **0** |

Causa: `projetar_equipamento` em produção era a versão da **9C** — 8.177 bytes, sem
`vida_base` e sem chamar `projetar_calibracoes`. Só `projetar_calibracoes` tinha sido criada,
solta. O `busca_manutencao.sql` não havia sido reaplicado.

Provado direto no catálogo, e é a consulta para repetir:

```sql
select p.proname,
       (p.prosrc like '%vida_base%')            as tem_vida_base,
       (p.prosrc like '%projetar_calibracoes%') as chama_calib,
       length(p.prosrc)                         as tamanho
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'projetar_%';
```

> **A auditoria mede convergência entre a projeção e o que a FUNÇÃO ATUAL produz** — não entre
> a projeção e os campos que a 9D passou a exigir. Função velha projeta pouco e converge
> consigo mesma. Depois de reaplicar SQL de projeção, conferir o `prosrc`, não só o `convergiu`.

---

## 4 · Estado ao fim (medido)

Aplicados nesta sessão, nesta ordem: `projetar_chave` com `nr13_calibracoes_` no despachante
(hunk 9D de `busca_index_rpc.sql`) → `busca_manutencao.sql` inteiro (9D, 33.001 bytes) →
`reiniciar_rebuild_busca` + `reconstruir_indice_busca` nas duas orgs.

`projetar_equipamento` passou de 8.177 para **9.303 bytes**, com `vida_base` e a chamada de
`projetar_calibracoes`.

| org | etapa | equip. | c/ `vida_base` | calibrações | c/ `prox_calibracao` | relatórios | convergiu | pendências |
|---|---|---|---|---|---|---|---|---|
| `32512667…0f7e` | concluido | 4 | **4** | **8** | 6 | 4 | true | 0 |
| `99f642d3…d211c` | concluido | 4 | 0¹ | 0¹ | — | 15 | true | 0 |

¹ Essa organização não tem nenhuma chave `nr13_vida_` nem `nr13_calibracoes_` viva — o nulo é
a verdade dela, não falha de projeção. Conferido contra o `app_storage`.

> **`deletado_em is null` muda a conta.** Sem o filtro, a mesma organização mostra 10 chaves
> `nr13_info_` e a projeção com 4 linhas parece defeito. As outras 6 são tombstones — a
> projeção estava certa. Toda contagem de conferência precisa do filtro.

---

## 5 · Front

Publicado no Coolify a partir de `main`, commit `aa984c9`. Nenhuma flag foi ligada: `boot_v9` e
`busca_v9` seguem **false** em todas as organizações, então nada muda para nenhum usuário.

---

## 6 · Fora do escopo, visto no caminho

O painel do Supabase exibe **"Grace period is over · Your projects will not be able to serve
requests when you use up your quota"** — a cota do projeto. Não é efeito desta sessão; entra
como decisão sua, não como pendência da Fase 9.

---

## 7 · Roteiro de tela com `boot_v9` LIGADA (org `99f642d3…d211c`)

`select public.definir_boot_v9('99f642d3-6efd-446d-9e76-d234ad8d211c', true);` — **uma** org;
`busca_v9` seguiu `false`. Pré-condição conferida no servidor antes de ligar: o histórico dessa
organização já está no modelo do §7-sexies (16 chaves `nr13_rel_`, 5 índices por TAG).

| tela | resultado |
|---|---|
| Dashboard | selo **"Dados de 10:16"**, 4 equipamentos, 0 a vencer, 0 vencidos, 100 % |
| `/vencimentos` | os 4 equipamentos, todos "Sem prazo cadastrado" — bate com `com_vida = 0` da projeção |
| `/equipamentos` | 4 cartões com foto, categoria e volume |
| ficha `ZZ-FASE3` | abre completa (`carregarEquipamento` sob demanda): foto, categoria III, volume 1 m³ |
| Relatórios → `ZZ-FASE3` | histórico com os **2** relatórios de 21/08 — é a passada 9D.2 (`nr13_rel_<id>_<TAG>`) |
| relatório salvo | abre o **arquivo** (13 páginas, "Documento arquivado"), §7-quater intacto |
| `/livro-registro` | 2 livros, hidratados sob demanda |
| **rollback** | `definir_boot_v9(org, false)` + recarga: mesmos 4 / 0 / 0 / 100 %, **sem** o selo "Dados de…" |

O rollback é a medida de paridade que interessa: os dois caminhos mostram o mesmo número, e a
única diferença visível é o selo — que só o caminho do agregado tem.

Boot medido nesta org: **11 requisições** ao Supabase (`app_storage` ×3, `vencimentos_org` ×2,
`profiles` ×3, `org_sync`, `assinatura_org`, `config_global`), `domContentLoaded` em 192 ms.
O tamanho em bytes não é legível do lado do cliente (as respostas do Supabase vêm sem
`Timing-Allow-Origin`, então `transferSize` é 0) — o teto em bytes é o de `2026-08-24-9d1`.

**Não exercitado:** o modo offline. Exige o `Network → Offline` do DevTools, que a extensão do
navegador não controla. Continua sendo verificação manual.

### 7.1 · O marcador de bundle do §4.4 estava errado

O script conferia `t.includes('hidratarEssencial')` — nome de função, que a minificação renomeia.
Em produção ele diz "bundle ANTIGO" mesmo com a 9D no ar. O que sobrevive à minificação é a
**string literal**: `boot_v9` (nasce na 9D) e `vencimentos_org`. Marcador corrigido no ponto de
retomada.

**Estado ao fim do dia:** `boot_v9` LIGADA em `99f642d3…d211c` (uma organização, a de teste),
`busca_v9` desligada em todas, front no ar com o commit `aa984c9`.
