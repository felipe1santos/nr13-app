# 9G.3 · REMOÇÃO DOS CAMINHOS LEGADOS — o novo vira a verdade operacional

**03/09/2026.** Autorizada pelo dono depois de 8/8 flags em 30/30, auditoria
30/30, zero pendências e gate global verde.

> **Ordem executada: cliente → testes → SQL.** O SQL é a única etapa que **não
> foi concluída** — ver §6.

---

## 1 · O que saiu do cliente

| tela | o que foi removido | o que provou a cobertura |
|---|---|---|
| `/equipamentos` | `EquipamentosLegado` inteiro (o arquivo virou repasse) | interruptor limpo: `flag ? V9 : Legado` |
| `/inspecoes` | `InspecoesLegado` inteiro | `InspecoesV9` cobre a tela de containers **e** a entrada por `?tag=` na URL — conferido no código antes de apagar |
| `/prontuarios` | lista antiga, guarda de flag, `equipamentos` e `carregarEquipamentos` | `abrirPorTag` já era o caminho do catálogo |
| `/calibracoes` | lista antiga, filtros locais, `abrirEquipamento` | `abrirPorTag` faz o mesmo, com semeadura |
| `/livro-registro` | `montarLinhas()` (varredura do cache), `lerTudo()`, `hidratando`, `comLivro` | `montarLinha(tag)` — singular — já era usado na abertura |
| `/relatorios` | lista de cartões antiga e as DUAS guardas de flag | `CatalogoRelatoriosV9` + `RelatoriosV9` |

### O que NÃO saiu, de propósito

**`RelatoriosLegado` ficou.** É o único caminho que remonta relatório anterior ao
§7-quater — o que não tem PDF arquivado. Ele continua alcançável por `legado=1`,
e agora há teste exigindo que essa saída exista. Apagá-lo junto com a flag
deixaria esses documentos inalcançáveis, que é exatamente o defeito registrado no
passo 11 da 9E.

**`tagJaExiste` (equipamentoService) ainda chama `lerTudo()`** ao checar TAG
duplicada no cadastro. Não é fallback substituído pela V9 — é uma verificação sem
equivalente no servidor. Fica anotado como candidato à Fase 10, não à remoção.

## 2 · O que saiu dos serviços

| arquivo | mudança |
|---|---|
| `modoHidratacao.ts` | perdeu a resposta `completa`. **O boot leve não foi removido — virou o único caminho.** `lerTudo()` deixou de ser a entrada do sistema; continua existindo para a chave de emergência e a importação de planilha |
| `vencimentosServidor.ts` | o painel vem **sempre** do agregado. O cálculo no cache saiu: sob boot leve ele contaria zero e diria "tudo em dia" |
| `limiteTrial.ts` | o teto conta **sempre** pela projeção. Pelo cache, liberaria o teto de quem já o estourou |
| `flag.ts` | de **NOVE** flags e uma escada de **oito degraus** para **UMA** |
| `storage.ts` | os três re-exports de flag |
| `storageV1.ts` | `nr13_busca_v9` saiu da lista de chaves preservadas |

### Por que `v2_ativa` fica

Ela **não é da Fase 9**. Separa dois modelos de ARMAZENAMENTO
(`localStorage`/upsert direto × `Map`+IndexedDB/RPC), e a RLS do servidor a
consulta. Desligá-la é rollback de infraestrutura, com consequência no banco —
nada a ver com trocar a fonte de uma lista.

## 3 · Os testes

**Oito arquivos apagados**: os sete `flag*V9.test.ts` e `vencimentosDisjuncao`.
Testavam flags e uma disjunção que não existem mais.

**Cinco arquivos INVERTIDOS.** Estes existiam para garantir que o legado
permanecesse durante o rollout — desligar a flag era o rollback, e apagar o
caminho antigo teria tirado a saída. Agora afirmam o contrário, com a mesma
disciplina, para que ele não volte por descuido:

| teste | antes | agora |
|---|---|---|
| `livro/listaSemParse` | "a tela AINDA tem `lerTudo`" | "a tela NÃO chama mais `lerTudo`" |
| `relatorios/listaSemParse` | "ainda tem `listarEquipamentos`" | "não chama mais `listarEquipamentos`" — e um caso NOVO: a saída `legado=1` não pode sair junto |
| `bootArmazenamento` | "sem a flag, espera a organização inteira" | "o boot leve é o ÚNICO caminho: nunca `lerTudo`" |
| `vencimentosServidor` / `Deduplicacao` | "sem a flag, vem do cache local" | "vem SEMPRE do agregado" |
| `limiteTrial` | "sem a flag, conta do cache" | "conta SEMPRE pela projeção" — com o cache mentindo de propósito |
| `migracaoV1.flagsPreservadas` | "a lista tem as NOVE" | "sobrou UMA" + nenhuma da Fase 9 restou |

## 4 · Números

| | |
|---|---|
| arquivos tocados | 30 |
| linhas | **+302 / −2.966** |
| suíte | **1.608 testes, 135 arquivos, 0 falhas** |
| build | verde |
| commit | `c867894` |

## 5 · Deploy e gate pós-remoção

Bundle publicado: **`assets/index-sRCLN57V.js`** (3.164.437 B, contra 3.194.404 —
**30 KB a menos**).

Conferido pelo bundle servido: `nr13_boot_v9`, `nr13_inspecoes_v9`,
`nr13_prontuarios_v9`, `nr13_calibracoes_v9`, `nr13_livro_v9`,
`nr13_vencimentos_v9`, `nr13_relatorios_v9` → **0 ocorrências cada**.
`nr13_armazenamento_v2` → 1 (fica). As RPCs da projeção → presentes.

> **Uma sobra pega pelo próprio método:** `nr13_busca_v9` ainda aparecia 1 vez —
> era uma STRING na lista de chaves preservadas de `storageV1.ts`, não uma flag
> viva. Conferir pelo bundle é o que achou; conferir pelo clique não acharia.

### Gate na organização de teste, com o bundle novo

| tela | hidratação integral | `app_storage` | erro |
|---|---|---|---|
| dashboard · equipamentos · inspeções · relatórios · prontuários · calibrações · livro | **0 em todas** | 3 (conjunto fixo do boot leve) | nenhum |

Livro real aberto: **2 REGISTRO(S)**, "Cadeia de registros íntegra", as duas
entradas **Íntegro**. O lacre sobreviveu à remoção — como tinha de sobreviver.

## 6 · A etapa que NÃO foi concluída

**`supabase/fase9_remocao_flags.sql` foi escrito e NÃO foi aplicado.** O editor
SQL do dashboard do Supabase não carregou o Monaco em nenhuma das quatro
tentativas (duas abas novas, esperas de 30 a 40 s cada). Não é falha do SQL nem
do banco — é a mesma instabilidade do dashboard que já apareceu antes nesta
sessão.

**Isso não deixa o sistema num estado inconsistente**, e a razão é a ordem: o
cliente foi o PRIMEIRO a sair. O bundle no ar já não lê nenhuma das oito
colunas — `sincronizarFlagDoServidor` seleciona apenas `v2_ativa`. As colunas
continuam em `org_sync` sem ninguém as consultar.

O arquivo tem uma **guarda** que recusa rodar se qualquer organização ainda
estiver com alguma flag desligada, derruba as oito funções **antes** das oito
colunas, e não toca em nenhum dado.

| | |
|---|---|
| SHA-256 (LF) | `8f3c95e5a429b887346e2897f9f2ca1d0562fefd613fa01dcb902de4036da207` |
| bytes | 5.733 |

## 7 · O que foi preservado — conferido, não presumido

- **boot leve** — virou o único caminho, não foi removido;
- **fila durável** e **offline** — intactos; nenhum arquivo da fila foi tocado;
- **RLS** — nenhuma policy alterada;
- **PDFs e relatórios históricos** — nenhum regenerado, nenhum `pdfRef` tocado;
- **Livro/Registro de Segurança histórico** — cadeia íntegra, conferida na tela;
- **certificados de calibração** — não tocados;
- **a saída `legado=1`** — preservada e agora com teste próprio.

**Nenhum `delete` de dado foi executado em nenhum momento.**
