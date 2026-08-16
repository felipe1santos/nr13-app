# Plano de Evolução da Arquitetura — Sistema NR-13

> **Para executores (humanos ou agentes):** este é um **roteiro de fases**, não um plano
> de tarefas. Cada fase aprovada ganha, no momento da aprovação, seu próprio plano
> task-level em `docs/superpowers/plans/` com passos TDD bite-sized (escrever teste →
> ver falhar → implementar → ver passar → commit), seguindo `superpowers:writing-plans`.
> Este documento decide **o quê, em que ordem, por quê, e como provar**.

**Objetivo:** transformar os achados A-01…A-18 da auditoria de 15/08/2026 num roteiro
incremental, mensurável e reversível, que prepare o sistema para centenas de clientes e
anos de histórico **sem enfraquecer nenhuma garantia de integridade já conquistada**.

**Arquitetura geral do roteiro:** cada fase é um deploy independente, atrás de um portão
de aceite objetivo. Segurança primeiro e isolada. Depois a fundação barata que torna tudo
o mais mensurável (índice + observabilidade). Depois as correções de arquitetura de
leitura. As mudanças caras e arriscadas (PDF vetorial) ficam por último, atrás de um
piloto, com o gerador atual intacto durante todo o experimento.

**Spec:** `docs/auditoria-arquitetura-2026-08-15.md`

**Revisão 2 (16/08/2026):** endurecimento antes do início da Fase 0. Mudanças em
D-04 (policy passa a ser fail-closed), D-05 (autorização de arquivo por vínculo, não por
pasta), D-11 (convivência da Fase 7 com critério de encerramento), Fase 10 dividida em
10A/10B, critério de tamanho de PDF substituído por relatório de referência, seleção
tecnológica acrescentada ao piloto, thumbnail explicitamente não-atômica, massa de escala
com dois perfis, SLOs definidos antes do teste de carga.

**Revisão 3 (16/08/2026) — PLANO MACRO FECHADO.** Seis correções pontuais, sem
reestruturação e sem mudança de ordem: D-24 (origem fail-open bloqueia a Fase 0),
pré-condição do `mutationId` na Fase 3, D-25 (`ultima_sync` é por usuário — C4 reescrita),
D-19 ampliada (fidelidade fotográfica não se mede em bytes), D-26 (não-enumeração é do
código, não do cronômetro), D-22 revisada (SLO relativo **e** absoluto).

Registro completo em "Histórico de revisões" no fim do documento.

---

## Portões de parada obrigatórios

`PARAR` aparece no fim de toda fase. Nos oito pontos abaixo a parada é **absoluta**:
nenhuma linha da fase seguinte é escrita sem aprovação explícita, por escrito, do dono do
projeto.

| Portão | Depois de | Por que este é crítico |
|---|---|---|
| **P1** | Fase 0 | Mudança de policy de segurança. Uma regressão aqui derruba o Portal ou reabre o vazamento |
| **P2** | Fase 3 | Único upgrade de schema do IndexedDB do roteiro; mexe no motor de sincronização |
| **P3** | Fase 4 | Reescreve o caminho de leitura do Portal; risco de chave sumir em silêncio |
| **P4** | Fase 7 | Mexe no que documento assinado imprime |
| **P5** | Fase 10A | Fim da observação. A 10B remove dados e **não** começa sem os números da 10A na mão |
| **P6** | Piloto da Fase 11 | Decisão GO/NO-GO. Reprovado, a Fase 12 não existe na forma planejada |
| **P7** | Cada lote da Fase 12 | Folhas de documento técnico; cada lote é aceite independente |
| **P8** | Antes de executar a carga (Fase 13) | Carga alta pode afetar clientes reais se o ambiente não for separado |

Sequência obrigatória em cada portão, sem atalho:

```
validado local  →  commit  →  push main  →  PARAR
                →  [dono faz o redeploy]
                →  produção validada (sem cache/SW antigo, bundle novo confirmado)
                →  relatório de resultado com números
                →  aprovação explícita do dono
                →  próxima fase
```

---

## Constraints globais

Valem para **todas** as fases. Uma fase que colidir com qualquer item abaixo deve ser
replanejada, não negociada.

### Invariantes arquiteturais (os 18 "já corretos" da auditoria)

| # | Invariante | Onde vive hoje |
|---|---|---|
| I-01 | Dado e item de fila na **mesma transação** do IndexedDB | `cacheLocal.gravarAtomico` |
| I-02 | Escrita resolve em `tx.oncomplete`, nunca em `request.onsuccess` | `db.aplicarAtomico` |
| I-03 | Idempotência por `mutationId`; retentar **reusa** o id | `sync.montarItem`, `tentarNovamente` |
| I-04 | Conflito detectado por versão sob `FOR UPDATE` | `aplicar_mutacao_storage` |
| I-05 | Em conflito, **as duas versões sobrevivem** | `sync.guardarConflito` |
| I-06 | Tombstones locais impedem ressurreição | `sync.tombstoneMaisNovoQue` |
| I-07 | **Nunca apagar por ausência** no servidor | `storageV2.lerTudo` (sem varredura de remoção) |
| I-08 | Hidratação incremental por marca d'água | `storageV2.lerTudo` + `marcaSync` |
| I-09 | Paginação determinística `(atualizado_em, chave)` | `storageV2.lerTudo` |
| I-10 | Marca só avança **após** todas as páginas aplicadas | `storageV2.lerTudo` |
| I-11 | Offline devolve snapshot local, nunca `{}` | `cacheLocal.snapshot` |
| I-12 | Cofre de arquivos em IndexedDB, upload retomável | `fotoStore`, `fotos.enviarPendente` |
| I-13 | Caminho do arquivo definido **antes** da rede, UUID imutável | `fotos.montarPath` |
| I-14 | "Pendente" vem do cofre, nunca de `navigator.onLine` | `fotos.arquivoPendente` |
| I-15 | Drenagem em `online` **e** `visibilitychange` | `storageV2`, `fotos` |
| I-16 | PDF finalizado é artefato imutável no bucket + SHA-256 | `artefatoRelatorio` |
| I-17 | Livro lacrado em cadeia + trava no banco | `livroLacre`, `livro_imutavel.sql` |
| I-18 | Assinatura histórica endereçada por conteúdo | `fotos.salvarArquivoPorConteudo` |
| I-19 | Índice de histórico é derivado e **reparável** | `historicoRelatorios.listarIndice` |
| I-20 | Relatório emitido é somente leitura em 3 camadas | `somenteLeituraDoc`, `sb-storage.js ro=1`, `usePalcoDocumento` |
| I-21 | Lazy loading de imagem por `IntersectionObserver` | `FotoImg` |
| I-22 | Isolamento entre organizações | policies, `nr13_dados_<org>`, path do bucket |
| I-23 | Palco com orçamento, trava e rollback tudo-ou-nada | `palco`, `palcoTrava` |
| I-24 | Teste que varre `public/` e quebra com chave descoberta | `palco.varreduraTemplates.test.ts` |
| I-25 | Migrações aditivas e idempotentes; legado nunca apagado antes de validar | `migrarHistoricoRelatorios` |
| I-26 | Compatibilidade permanente com dados antigos (base64 legado etc.) | `resolverFoto`, `resolverPdf`, `legadoDaTag` |

**Toda fase deve declarar, no seu plano task-level, quais invariantes toca e como o teste
prova que continuam valendo.** Nenhuma fase deste roteiro remove um invariante.

### Portão de qualidade (idêntico em todas as fases)

- `npm test` → **909+ testes passando, 0 falhas**. Baseline medido em 15/08/2026: 69 arquivos, 909 testes, 16,35 s.
- `npm run build` → `tsc -b && vite build` sem erro. O `tsc -b` do build é mais estrito que `tsc --noEmit`; validar o build real, nunca só o typecheck.
- `npm run lint` sem erro novo.
- Nenhum teste existente pode ser **afrouxado** para a fase passar. Teste que precise mudar exige justificativa escrita no commit.

### Regras de produção (não negociáveis)

- Nenhum experimento em equipamento real. Toda operação que **gere histórico** (relatório, entrada de livro, calibração) usa organização/equipamento de teste. Já houve caso de relatório de teste gerando entrada imutável em livro real — e o livro tem trava no banco, então o estrago não se desfaz.
- Produção real só se inspeciona **read-only**.
- Nenhum `DELETE`/`UPDATE` em SQL sem `org_id` **e** `chave` (ou lista de chaves) explicitamente delimitados no `WHERE`.
- Nenhuma migração destrutiva em massa. Migração é aditiva; o legado só sai depois de provado convertido.
- Backup antes de tocar em legado.
- `service_role` **nunca** no frontend. Só em Edge Function.
- Todo SQL novo é idempotente (`create ... if not exists`, `create or replace`, `drop policy if exists` antes de `create policy`).

### Fluxo obrigatório por fase

**Local:** baseline → backup se necessário → implementar só a fase → `npm test` →
`npm run build` → validar local → validar em `npm run preview` (sem HMR) → comparar
antes/depois → conferir banco/bucket/IndexedDB/fila/offline/compatibilidade → commit →
push `main` → **PARAR**.

**Produção (após o usuário confirmar redeploy):** limpar service worker e cache →
confirmar bundle novo → validar em produção com organização de teste → inspecionar dados
reais só read-only → conferir banco, Storage, sincronização, regressões → apresentar
resultado → **PARAR**.

> **Nota sobre service worker:** `sw.js` está em `nr13-cache-v8` com network-first para
> navegação e templates, cache-first só para `/assets/` (com hash). Fase que **mexa em
> template de `public/`** deve subir o número do cache (`v9`, `v10`…), senão quem já tem o
> app instalado continua com a folha antiga. Fase que só mexa em `src/` não precisa.

---

# Ordem final das fases

| Fase | Tema | Achados | Risco | Ganho | Complexidade | Depende de |
|---|---|---|---|---|---|---|
| **0** | Isolamento do Portal (segurança) | A-01 | Médio | Crítico — para vazamento entre clientes | M | — |
| **1** | Índice da hidratação | A-03 | Baixo | Alto em CPU de banco | P | — |
| **2** | Observabilidade | A-11 | Baixo | Habilita medir todo o resto | M | 1 (para medir com índice já ativo) |
| **3** | Conflitos: fechar o ciclo | A-14 | Médio | Para poluição do cache e fila eterna | M | — |
| **4** | Portal: arquitetura de leitura | A-02 | Baixo | Maior ganho isolado de egress | M | 0, 2 |
| **5** | Fotos: thumbnail + EXIF + teto de altura | A-08 | Baixo | Alto em egress de listagem | M | 2 |
| **6** | Recuperação do fallback base64 | A-10 | Baixo | Elimina registro gordo permanente | P–M | 2 |
| **7** | Logo e rubrica por conteúdo | A-05 | Médio | Corta duplicação por relatório | M–G | 6 |
| **8** | Massa de escala + baseline automático | A-17 | Baixo | Habilita 9 e 13 | M | 2 |
| **9** | Listas grandes | A-07 | Baixo | Alto em navegador | M | 8 |
| **10A** | Higiene: auditoria **read-only** | A-15, A-06, A-13 | Baixo | Produz os números que decidem a 10B | M | 2, 8 |
| **10B** | Higiene: retenção e retirada de legado | A-15, A-06, A-13 | Médio | Contém crescimento estrutural | M | 10A + aprovação |
| **11** | Piloto PDF vetorial/híbrido | A-04, A-12 | Alto | Maior ganho de Storage/egress/qualidade | G | 5, 7, 8 |
| **12** | Expansão do PDF + chave única de campo | A-04, A-12, A-09 | Alto | Conclui o ganho da 11 | G | 11 |
| **13** | Teste de carga | A-18 | Baixo | Capacidade observada | M | 1, 4, 9, 12 |

**A-16 não tem fase, de propósito.** Livro de equipamento excluído fica órfão no cache
(~1 KB) porque `nr13_livro_` é protegido contra exclusão — a trava de imutabilidade do banco
recusa apagar entrada emitida (I-17), e retentar eternamente deixava "⚠ 1 falha" fixo na
topbar. **É o comportamento correto e nenhuma fase deste roteiro o altera.** Registrado aqui
para que ninguém o "conserte" no futuro sem entender o motivo. A Fase 10A (inventário) vai
listar esses livros como referenciados-mas-sem-dono; a classificação certa para eles é
**preservar**, nunca remover.

## Dependências

```
Fase 0 ──┬───────────────────────────► (independente; vai primeiro por ser segurança)
         │                             D-05 também habilita a Fase 7
Fase 1 ──┤
         ├──► Fase 2 ──┬──► Fase 4  (precisa de 0 também)
Fase 3 ──┘             ├──► Fase 5 ─────────┐
                       ├──► Fase 6 ──► Fase 7 ──┐   (Fase 7 exige 0 + 6)
                       ├──► Fase 8 ──┬──► Fase 9   ├──► Fase 11 ──► Fase 12 ──┐
                       │             └──► Fase 10A ──► Fase 10B               │
                       └───────────────────────────────────────────────────────┴──► Fase 13
                                                     (13 exige 1, 4, 9, 12 +
                                                      calibração 2 da massa, que vem da 12)
```

**Podem ser feitas de forma independente (sem depender de nenhuma outra):** 0, 1, 3.

**Obrigatoriamente antes de outras:**
- **0 antes de 4** — não faz sentido otimizar a leitura do Portal com o furo de isolamento aberto; a Fase 4 mexe exatamente no mesmo caminho e a policy nova é a rede de segurança de qualquer regressão na Edge.
- **0 antes de 7** — pela D-05, `portal_arquivo` precisa resolver `assinaturaRef`/`logoRef` **antes** de o snapshot novo existir. Sem isso o relatório abre no Portal sem a rubrica do engenheiro.
- **1 antes de 2** — a observabilidade vai medir o custo da hidratação; medir antes do índice registra um baseline que não vai voltar a existir.
- **2 antes de 5, 6, 8, 10A** — sem métrica não há "antes/depois", e a Fase 2 é quem informa **quantos** registros estão em fallback base64 (dimensiona a 6) e **quanto** o legado ocupa (dimensiona a 10A).
- **10A antes de 10B** — observação antes de remoção, com portão de aprovação entre elas. A 10B não tem como decidir a janela de retenção sem a distribuição por idade que a 10A mede.
- **12 antes da calibração 2 da massa realista** — o tamanho do PDF novo só existe depois da Fase 12, e é ele que torna o teste de carga honesto.
- **6 antes de 7** — as duas convertem "registro gordo → referência". A 6 cria a varredura de recuperação idempotente em background; a 7 a reusa. Ordem inversa escreveria o mesmo mecanismo duas vezes.
- **8 antes de 9** — virtualizar lista sem massa é otimizar no escuro; não há como provar ganho nem detectar regressão.
- **8 antes de 11** — o piloto de PDF precisa de relatório sintético grande para medir tempo e memória sem tocar em documento real.
- **5 e 7 antes de 11** — o piloto vetorial precisa saber a forma final de foto (principal/thumb) e de rubrica/logo (referência), senão ele é construído contra um formato que vai mudar.
- **11 antes de 12** — sem aprovação do piloto não se toca nos 40 templates.
- **1, 4, 9, 12 antes de 13** — teste de carga em arquitetura instável não produz número útil.

## Mudanças em relação à ordem que você sugeriu, e por quê

**1. A-14 (conflitos) subiu para Fase 3, antes do Portal.**
A auditoria classificou como 🟡 assumindo que o custo era só de UI. A verificação de hoje
mostrou que é maior: `guardarConflito` grava `nr13_conflito_<chave>__<Date.now()>` na
store **`dados`** do IndexedDB, e `cacheLocal.hidratarDoDisco()` carrega a store `dados`
**inteira** para o `Map` em todo boot. Consequências: (a) cópias de conflito entram no
cache de leitura e aparecem em `chavesComPrefixo`; (b) `escopoDaChave` não conhece o
prefixo, então elas caem em `'global'` e nunca são indexadas nem limpas; (c) o botão
"Tentar todas" da tela `/pendencias` reenvia itens em estado `conflito`, e **cada
reenvio grava mais uma cópia**, sem teto. Além disso `drenar()` pula `conflito` para
sempre, então o selo da topbar fica permanentemente em pendência. Isso precisa estar
fechado antes das fases que exercitam multi-dispositivo, senão cada teste de conflito
deixa lixo permanente no cache.

**2. A-17 (massa de escala) subiu para antes de A-07 (listas grandes).**
No seu esboço a massa aparecia na Fase 8 e as listas na Fase 6. Inverti: A-07 exige medir
DOM, memória e tempo de render com 100/500/1.000/5.000 itens. Sem a massa, a fase não tem
critério de aceite mensurável — viraria "parece mais rápido", que é exatamente o que você
recusou em A-03.

**3. A-09 (chave duplicada de campo) fundiu com a Fase 12, em vez de fase própria.**
A-09 exige varrer e alterar os 40+ templates para uniformizar qual chave cada folha lê. A
expansão do PDF vetorial (Fase 12) já vai passar folha por folha. Fazer as duas coisas em
passadas separadas custa duas varreduras completas e dois ciclos de risco sobre os mesmos
arquivos. Na Fase 12, cada template migrado sai já lendo a chave única. Se o piloto da
Fase 11 for **reprovado**, A-09 volta a ser fase autônoma (ver plano de contingência no
fim deste documento).

---

# FASE 0 — Isolamento do Portal do Cliente

### Objetivo
Fazer com que uma conta `papel='cliente'` só consiga ler dados e arquivos dos ativos
vinculados a ela, **no servidor**, independentemente do que o frontend faça. Hoje o
isolamento entre clientes da mesma organização depende da Edge Function, que é um caminho
opcional para quem tem o JWT.

### Achados envolvidos
A-01.

### Por que esta fase vem agora
É a única falha de confidencialidade do sistema. Não é otimização, não compartilha código
com nenhuma outra fase, e o risco de mantê-la aberta cresce a cada cliente novo do Portal.
Vai isolada para que qualquer regressão tenha causa única e rollback trivial.

### Escopo exato
- **SQL (novo arquivo):** `supabase/portal_isolamento.sql` — policies de `SELECT` em `public.app_storage` e em `storage.objects`.
- **Edge:** `supabase/functions/portal_cliente/index.ts` — passa a ser o **único** caminho de leitura do cliente e ganha emissão de URL assinada por arquivo.
- **Frontend:** `src/features/portal/portalService.ts`, `src/pages/portal/PortalAtivo.tsx`, `src/pages/portal/PortalAtivos.tsx` — leitura de arquivo passa a pedir URL à Edge em vez de assinar direto pelo SDK.
- **Testes novos:** `src/features/portal/__tests__/isolamentoPortal.test.ts` (contrato) + roteiro manual de penetração.

### O que NÃO será mexido
- Nada do sistema interno (`mestre`/`gerente`/`funcionario`): policies de escrita, RPC, fila, palco, templates, geração de PDF.
- A forma como a Edge monta a lista de chaves (varredura da org) — isso é a **Fase 4**. Esta fase só fecha o acesso; a eficiência vem depois. Misturar as duas tiraria a causa única do rollback.
- O isolamento entre organizações, que já está correto (I-22).

### Arquitetura antes
```
Policy SELECT app_storage : org_id = org_atual()          ← sem filtro de papel
Policy SELECT storage     : foldername(name)[1] = org     ← sem filtro de papel
org_atual()               : profiles.org_id do auth.uid()
Cliente                   : profiles.org_id = org do INSPETOR

⇒ cliente com JWT: supabase.from('app_storage').select('*')  →  org inteira
⇒ cliente com JWT: storage.createSignedUrl(qualquer path)    →  qualquer arquivo
```

### Arquitetura depois
```
Policy SELECT app_storage : org_id = org_atual()
                            AND papel_atual() IN ('mestre','gerente','funcionario')
Policy SELECT storage     : foldername(name)[1] = org
                            AND papel_atual() IN ('mestre','gerente','funcionario')
Edge portal_cliente       : service_role, resolve TAGs do cliente,
                            devolve só as chaves dele
Edge portal_arquivo (novo): recebe {path}, valida o VÍNCULO do path com um recurso
                            que aquele cliente pode ver, e só então emite signed URL
```

### D-04 (revisada em 16/08/2026) — lista branca, fail closed

A revisão 1 propunha lista negra (`papel_atual() <> 'cliente'`), argumentando que um papel
novo esquecido quebraria o sistema interno de forma visível. **Esse argumento está errado
e a decisão foi revertida.** Três motivos:

1. **Fail open é inaceitável em regra de confidencialidade.** O modo de falha da lista negra é conceder acesso indevido em silêncio — exatamente a classe do defeito A-01. O modo de falha da lista branca é negar acesso legítimo: ruidoso, imediato, corrigível por uma linha. Entre falhar concedendo e falhar negando, regra de segurança falha negando.
2. **É o padrão que o próprio projeto já usa.** Verificado em 16/08/2026: **todas** as policies de escrita de `app_storage` (`acesso_setup.sql`, `assinatura_setup.sql`, `trial_setup.sql`), as do bucket (`fotos_storage.sql`, `armazenamento_v2.sql`) e a própria RPC `aplicar_mutacao_storage` já usam `papel_atual() in ('mestre','gerente','funcionario')`. Lista negra só na leitura criaria duas gramáticas de autorização no mesmo sistema.
3. **Os papéis são conhecidos e são quatro.** `mestre`, `gerente`, `funcionario`, `cliente` — confirmado por varredura em `supabase/*.sql` e `src/`. Não há papel oculto que a lista branca deixaria de fora hoje.

**Vale também para papel futuro:** papel novo nasce **sem** acesso direto de leitura. Quem
criar um papel precisa autorizá-lo explicitamente. O teste do papel desconhecido (seção de
testes) existe para provar isso e para quebrar se alguém voltar à lista negra.

### Matriz de acesso — estado final desta fase

| Papel | `SELECT app_storage` | `INSERT/UPDATE/DELETE` | `SELECT` bucket | Escrita no bucket | Leitura via Edge |
|---|---|---|---|---|---|
| `mestre` | ✅ direto | ✅ | ✅ direto | ✅ | n/a |
| `gerente` | ✅ direto | ✅ | ✅ direto | ✅ | n/a |
| `funcionario` | ✅ direto | ✅ | ✅ direto | ✅ | n/a |
| `cliente` | ❌ | ❌ (já era) | ❌ | ❌ (já era) | ✅ só o vinculado a ele |
| **papel futuro / desconhecido** | ❌ | ❌ (já era) | ❌ | ❌ (já era) | ❌ |
| **papel implícito (omitido no insert)** | ❌ **após a D-24** — hoje viraria `mestre` | idem | idem | idem | ❌ |
| `admin` da plataforma | via RPC `security definer` | — | — | — | — |

**Nota sobre `admin`:** administrador da plataforma é a coluna `profiles.role`, **separada**
de `profiles.papel`. Ele não lê `app_storage` direto — as telas do Admin passam por
`admin_usage_stats()`, que é `security definer` com guarda própria. **Verificação
obrigatória antes de aplicar o SQL:** se algum caminho do Admin fizer `select` direto em
`app_storage`, ele quebra com a policy nova e precisa migrar para RPC na mesma fase.

### Dependência descoberta na revisão — `papel` tem default `'mestre'`

`supabase/acesso_setup.sql:14`:

```sql
alter table public.profiles add column if not exists papel text not null default 'mestre';
```

Perfil criado sem `papel` explícito **nasce `mestre`** — com acesso total à organização.
Isso é fail open na origem, e nenhuma policy corrige: para a policy, o perfil é
legitimamente `mestre`.

A criação de sub-login passa pela Edge `org_admin`, que define o papel, e o próprio
`acesso_setup.sql` já alerta que o trigger `handle_new_user` não pode sobrescrever
`org_id`/`papel`/`cliente_id`. Ainda assim o default é uma rede de segurança invertida.

### D-24 — origem fail-open bloqueia a Fase 0

**A revisão 2 mandava auditar e deixava a correção do default para outra fase. Endurecido
em 16/08/2026:** não faz sentido entregar RLS fail-closed sobre uma origem fail-open. Um
perfil que nasce `mestre` por omissão derrota a policy sem precisar burlá-la — para o
Postgres aquele perfil é legitimamente mestre.

**Auditoria obrigatória de TODOS os caminhos capazes de criar linha em `profiles`:**

| Caminho | Onde procurar |
|---|---|
| Trigger `handle_new_user` | painel do Supabase (não está versionado no repo — **conferir no banco**) |
| Edge `org_admin` | `supabase/functions/org_admin/` — criação de sub-login |
| Edge `trial` | `supabase/functions/trial/` — ativação do cadastro automático |
| Cadastro inicial / signup | `src/services/auth.ts`, `src/pages/Login.tsx` |
| Admin da plataforma | `src/pages/Admin.tsx`, `supabase/admin_setup.sql` |
| `insert`/`upsert` direto em `profiles` | busca global `from('profiles')` com `insert\|upsert` em `src/` e `supabase/functions/` |
| Scripts e migrações | `supabase/*.sql` — todo `insert into public.profiles` |
| Backfill do `acesso_setup.sql` | `update ... set org_id = id where org_id is null` e vizinhos |
| Qualquer outro | busca global — a lista acima é ponto de partida, não exaustiva |

Para cada caminho, responder **por escrito**: grava `papel` explicitamente? Antes de o
perfil poder ser usado? Com qual valor?

#### Bifurcação de aceite

**Resultado A — todos os caminhos gravam `papel` explicitamente, sempre, antes do primeiro
uso.** Registrar a prova caminho por caminho. Trocar o default vira hardening posterior,
anotado em `PENDENCIAS.md` com a justificativa de por que não é urgente.

**Resultado B — existe QUALQUER caminho capaz de criar perfil com `papel` implícito.**

> **A Fase 0 NÃO pode ser aprovada.** Corrigir a origem entra na própria Fase 0, como
> subetapa **bloqueante executada ANTES das policies**.

Correção da origem, na ordem: (1) fazer o caminho gravar o papel explicitamente; (2) só
então avaliar trocar o default para um valor sem privilégio. O passo 1 é o que fecha o
buraco; o passo 2 é cinto e suspensório.

**Cuidado ao trocar o default, e por isso ele é o passo 2 e não o 1:** `papel` é
`not null`, então qualquer `insert` existente que hoje omita a coluna passaria a gravar o
valor novo — e se algum desses inserts for de conta legítima de mestre, a conta nasce sem
acesso. É por isso que a auditoria vem antes: sem saber quem omite a coluna, trocar o
default é troca de um modo de falha por outro.

**Onde o papel sem privilégio deve cair:** pela D-04 (lista branca), qualquer valor fora de
`('mestre','gerente','funcionario')` já é negado. Um default como `'sem_papel'` é
automaticamente fail-closed, sem precisar de nova policy.

**Ordem dentro da Fase 0, se o Resultado B ocorrer:**

```
0.a  auditoria dos caminhos de criação de profiles       ← pré-condição
0.b  corrigir os caminhos fail-open (Resultado B)        ← BLOQUEANTE
0.c  deploy e validação de 0.b em produção
0.d  investigação de acesso direto do Portal             ← pré-condição
0.e  Edge portal_arquivo + frontend
0.f  policies fail-closed
```

`0.c` não é zelo excessivo: aplicar a policy fail-closed enquanto ainda existe caminho que
cria mestre por omissão deixaria o sistema com a aparência de seguro e o comportamento de
inseguro — o pior dos dois mundos, porque ninguém volta a olhar.

### PRÉ-CONDIÇÃO BLOQUEANTE — investigar antes de escrever qualquer policy

**A Fase 0 não começa pela policy. Começa por esta investigação.** Se ela encontrar acesso
direto escondido, o task-level é reescrito antes de qualquer implementação.

Ler linha a linha, e depois fazer busca global:
`RotaPortal` (confirmar o nome real no `router.tsx`), `PortalLayout.tsx`,
`PortalAtivos.tsx`, `PortalAtivo.tsx`, `portalService.ts` e toda dependência transitiva.

| Busca global | Procura |
|---|---|
| `lerTudo\|iniciarArmazenamento\|aguardarArmazenamento` no escopo do Portal | hidratação do sistema interno vazando para o Portal |
| `from\('app_storage'\)` em `src/` | `select` direto pelo SDK |
| `supabase.storage` em `src/` | download ou assinatura de URL direto |
| `services/storage` importado nos arquivos do Portal | uso do despachante v1/v2 |
| `resolverFoto\|baixarFoto\|resolverPdf` no Portal | resolução de arquivo que hoje passa pelo SDK |
| `createSignedUrl` em `src/` | pontos que precisam migrar para a Edge |

**Achado já conhecido, que sozinho justifica a pré-condição:** `portalService.montarAtivos`
monta `fotoCapa` e a UI usa `FotoImg`, que chama `resolverFoto` → `urlAssinada` →
`supabase.storage.createSignedUrl`. **Esse caminho quebra no instante em que a policy de
leitura do bucket for aplicada.** Portanto migrar o `FotoImg` do Portal para a Edge não é
opcional nem posterior: é parte da Fase 0, e a policy do bucket **não pode** ser aplicada
antes dela.

**Entregável da pré-condição:** mapa escrito de todo acesso direto do Portal ao Supabase,
com destino de cada um (migra para Edge / já passa por `portalService` / é inofensivo). Só
depois dele o task-level é escrito.

### D-05 (revisada em 16/08/2026) — autorização de arquivo por VÍNCULO, não por pasta

A revisão 1 descrevia `portal_arquivo` como "confere que o path pertence a um ativo do
cliente". Isso é insuficiente e envelhece mal, porque nem todo arquivo que o cliente
legitimamente vê mora dentro da pasta da TAG dele:

| Arquivo | Path | Ligado à TAG? |
|---|---|---|
| Foto de inspeção | `<org>/<TAG>/<uuid>.jpg` | sim |
| Foto de equipamento | `<org>/<TAG>/<uuid>.jpg` | sim |
| PDF do relatório | `<org>/relatorios/<uuid>.pdf` | **não** — pasta comum da org |
| Certificado padrão | `<org>/certificados/<uuid>.pdf` | **não** |
| Rubrica (livro e, após a Fase 7, cadastro) | `<org>/assinaturas/<sha>.png` | **não** |
| Logo (após a Fase 7) | `<org>/assinaturas/<sha>.jpg` ou pasta própria | **não** |
| Prontuário do fabricante | `<org>/prontuario-fabricante/<uuid>.pdf` | **não** |
| Foto de componente | `<org>/componentes/<uuid>.jpg` | **não** |

Autorizar por pasta significaria "cliente pertence à organização, logo pode pedir qualquer
arquivo de `assinaturas/`" — que é o mesmo defeito do A-01 em escala menor: um path
descoberto ou adivinhado vira acesso.

**A regra passa a ser: o path só é servido se estiver REFERENCIADO por um recurso que
aquele cliente está autorizado a ver.** Vínculo, não localização.

#### Como a Edge decide

```
portal_arquivo(path) com JWT de cliente:

  1. perfil → papel == 'cliente', org_id, cliente_id     (senão 403)

  2. TAGS = { tag : nr13_emp_<tag>.clienteId == cliente_id }      ← o vínculo raiz

  3. Monta o CONJUNTO DE PATHS AUTORIZADOS, resolvendo referências a partir
     das TAGS — nunca a partir da pasta:

       para cada tag em TAGS:
         nr13_fotos_<tag>[].ref.path            → fotos do equipamento
         nr13_docs_<tag> → refs das fotos de campo
         nr13_pront_fab_<tag>.pdfRef.path       → prontuário do fabricante
         nr13_componentes_cal_<tag>[].fotoRef.path
         nr13_rel_<id>_<tag>.pdfRef.path        → PDF do relatório
         nr13_rel_<id>_<tag>.meta.assinantes[].assinaturaRef.path   ← Fase 7
         nr13_rel_<id>_<tag>.meta.empresa.logoRef.path              ← Fase 7
         nr13_rel_<id>_<tag>.meta.rastreabIds → nr13_rastreab_<id>.pdfRef.path
         nr13_livro_<tag>[].assinaturaRef.path

  4. path ∈ conjunto ?  emite signed URL de TTL curto
                     :  404 genérico

  5. Nunca distinguir "não existe" de "existe mas não é seu" — ver D-26.
```

### D-26 — não-enumeração é sobre o CÓDIGO, não sobre cronômetro

A revisão 2 exigia "o MESMO tempo de resposta". **Requisito irreal e removido:** Edge,
Postgres, cache e Storage introduzem variação de latência por conta própria, e um teste que
cronometre vai falhar de forma intermitente por motivos que não têm relação com segurança —
virando ruído que treina o time a ignorá-lo.

**A regra correta:**

> O código não pode introduzir **deliberadamente** caminhos distinguíveis que funcionem como
> oráculo de existência.

Na prática, o que é exigido:

| Exigido | Proibido |
|---|---|
| Mesmo status HTTP nos dois casos | 404 para inexistente e 403 para não-autorizado |
| Mesmo formato e corpo de resposta | mensagens diferentes ("arquivo não encontrado" vs. "acesso negado") |
| Mesma mensagem, genérica | qualquer campo revelando existência (tamanho, data, tipo) |
| Uma decisão única: `path ∈ conjunto autorizado ?` | ramificar antes por "o arquivo existe?" |
| Nenhum log com nível diferente por caso | `warn` para um, `info` para o outro — vaza por observabilidade |

**O ponto central de desenho:** a Edge decide **sem nunca consultar a existência do
arquivo**. Ela monta o conjunto autorizado a partir das referências do cliente e verifica
pertinência. Path não pertencente é recusado sem que o bucket seja tocado — então não há o
que cronometrar, porque o caminho de código é literalmente o mesmo.

**O que NÃO é exigido:** igualdade cronométrica. Diferenças de latência vindas de cache,
rede ou carga do banco são aceitáveis e não constituem falha.

**Como testar:** inspeção do código (existe ramificação por existência?) e comparação de
status, corpo e cabeçalhos entre os dois casos. **Não** medir tempo.

**Consequência de desenho que precisa ficar clara:** a rubrica só é servida ao cliente
**porque um relatório que ele pode ver a referencia**. Se a rubrica for trocada no cadastro
e nenhum relatório do cliente apontar para a versão nova, ele não consegue pedi-la — e está
certo. É exatamente o exemplo que você deu: `cliente pode ver relatório X → X referencia
assinatura Y → Y é servível naquele contexto`.

**Custo e mitigação:** montar o conjunto a cada pedido de arquivo é caro. Cachear o
conjunto por sessão dentro da Edge é aceitável **desde que** o TTL seja curto (sugestão:
60 s) — revogar acesso não pode depender de o cache expirar em minutos. Alternativa mais
barata e igualmente segura: derivar o conjunto **uma vez** na chamada de `portal_cliente` e
devolvê-lo assinado (HMAC com segredo da Edge, com expiração), para que `portal_arquivo`
valide sem reconsultar. Decidir na fase, medindo; a segurança das duas é equivalente, o
custo não.

**TTL da URL assinada:** curto (sugestão 5 min, contra os 3.600 s de hoje em `fotos.ts`).
URL assinada é um bearer token: quem a tiver, acessa, independentemente de papel. TTL longo
transforma um link vazado num acesso de uma hora.

**Interação com a Fase 7 — dependência explícita:** quando rubrica e logo virarem referência
no snapshot do relatório, o conjunto autorizado passa a incluí-las por esse caminho. A
Fase 7 **não pode** ser deployada sem que `portal_arquivo` já resolva
`meta.assinantes[].assinaturaRef` e `meta.empresa.logoRef` — senão o relatório abre no
Portal sem a rubrica do engenheiro. Registrado também na Fase 7.

### Migração
Nenhuma. É mudança de policy e de caminho de leitura, aditiva e reversível. Nenhum dado é
lido, escrito ou movido.

### Compatibilidade
Contas `mestre`, `gerente`, `funcionario`, `admin`: comportamento idêntico, byte a byte.
Contas `cliente`: mesma UI, mesmos dados visíveis; muda apenas o caminho pelo qual os
dados chegam.

### Offline
Sem impacto. O Portal não trabalha offline, não grava nada e não tem fila.

### Segurança
É o objeto da fase. Cobrir explicitamente:
- leitura direta de `app_storage` pelo SDK com JWT de cliente → deve retornar `[]`;
- `createSignedUrl` direto pelo SDK com JWT de cliente → deve falhar;
- Edge `portal_cliente` sem token / com token de outro papel → 401/403;
- Edge `portal_arquivo` com path de outro cliente → 403, e a resposta **não** pode diferenciar "não existe" de "não é seu" (evita enumeração);
- escrita pelo cliente → continua bloqueada (já está, I-22);
- `service_role` só na Edge, nunca no bundle.

### Integridade
Sem impacto em hash, lacre ou imutabilidade. O PDF servido ao cliente continua sendo o
artefato do bucket (I-16) — apenas a URL passa a ser emitida pela Edge.

### Métricas de baseline
1. Com JWT de cliente A1: `select count(*) from app_storage` via REST → registrar o número (hoje: todas as chaves da org).
2. Com JWT de A1: `createSignedUrl` num path de A2 → registrar que hoje **funciona**.
3. Tempo de abertura de `/portal` e de `/portal/ativo/:tag` (hoje).
4. Número de requests da abertura do Portal.

### Métricas esperadas
| Medida | Antes | Depois |
|---|---|---|
| `select` direto em `app_storage` com JWT de cliente | N chaves da org | **0** |
| `createSignedUrl` direto no path de outro cliente | sucesso | **erro** |
| Chaves entregues pela Edge a A1 | só as de A1 | só as de A1 (inalterado) |
| Tempo de abertura do Portal | X | ≤ X + 15% (a Fase 4 é que melhora isto) |

### Testes automatizados
- `isolamentoPortal.test.ts` — dado um conjunto de `nr13_emp_<TAG>` com `clienteId` de A1 e A2, a resolução devolve **apenas** as TAGs de A1. Lógica pura, sem rede.
- A lista de chaves entregues nunca contém chave cuja TAG não esteja no conjunto do cliente.
- **Conjunto de paths autorizados (D-05):** dado um estado com relatório de A1 referenciando a rubrica R e a logo L, o conjunto contém R e L. Dado um relatório de A2 referenciando a rubrica R2, o conjunto de A1 **não** contém R2 — mesmo estando as duas na pasta `assinaturas/`.
- Path de pasta autorizada mas **não referenciado** por nenhum recurso de A1 → recusado. É o teste que prova que a regra é vínculo, não pasta.
- Path de outra organização → recusado.
- Path malformado, com `../`, com barra inicial, com codificação de URL → recusado.
- **Resposta indistinguível (D-26):** path inexistente e path existente-mas-não-autorizado produzem o **mesmo status, o mesmo corpo e os mesmos cabeçalhos**. Teste de código: não existe ramificação por existência do arquivo. **Não** se mede tempo.
- Manter `permissoes`, `auth` e `acesso` verdes.

#### Teste do papel desconhecido (exigido pela D-04 revisada)
Prova que a policy é fail closed e quebra se alguém voltar à lista negra:

- Perfil com `papel = 'auditor_externo'` (papel que **não existe** no sistema): `select` em `app_storage` → **0 linhas**; `select` no bucket → **negado**.
- Perfil com `papel = ''` → negado.
- Perfil com `papel = null` → negado (a coluna é `not null`, mas o teste cobre o caso de a constraint mudar).
- Perfil com `papel = 'MESTRE'` (caixa diferente) → **negado**. Comparação é sensível a caixa; um papel gravado com caixa errada não pode virar acesso acidental.
- Os três papéis internos → acesso mantido.

#### Teste da origem (exigido pela D-24)
- **`insert into profiles` omitindo `papel`** → o perfil resultante **não** pode ter acesso. Hoje esse teste **falha** (vira `mestre`); ele é o critério que prova a correção da origem.
- Cada caminho de criação auditado ganha um teste ou uma prova documentada de que grava `papel` explicitamente.
- Após a correção: criar sub-login pela Edge `org_admin` → papel correto e explícito; criar conta de trial → idem; signup normal → idem.

Como esses testes precisam de banco real, vão num arquivo separado
(`supabase/testes/isolamento.sql` ou script de integração), executado manualmente contra a
organização de teste, com o resultado registrado. Não entram no `npm test`, que roda sem
banco — mas o **roteiro** é versionado e obrigatório em toda alteração de policy.

### Testes manuais (obrigatórios — cenário de 5 contas)
Montar em **organização de teste**:

| Conta | Papel | Vínculo |
|---|---|---|
| `org-teste-mestre` | mestre | dono da org |
| `org-teste-func` | funcionario | interno |
| `cliente-A1` | cliente | cliente_id = A1 |
| `cliente-A2` | cliente | cliente_id = A2 |
| `org-teste-futuro` | `auditor_externo` | papel que não existe no sistema |
| — | — | equipamentos `TESTE-A1-01/02` (de A1) e `TESTE-A2-01/02` (de A2), cada um com foto, relatório emitido e rubrica |

Roteiro, com A1 logado e o DevTools aberto:
1. `supabase.from('app_storage').select('chave').limit(1000)` → esperado `[]`.
2. `supabase.from('app_storage').select('*').eq('chave','nr13_info_TESTE-A2-01')` → `[]`.
3. `supabase.storage.from('inspecao').createSignedUrl('<org>/TESTE-A2-01/<uuid>.jpg', 60)` → erro.
4. `supabase.storage.from('inspecao').list('<org>')` → vazio ou erro.
5. `portal_cliente` com o token de A1 → só TAGs de A1.
6. `portal_arquivo` com o path de uma **foto** de A2 → recusado, resposta genérica.
7. `portal_arquivo` com o path do **PDF do relatório** de A2 (pasta `relatorios/`, comum à org) → recusado.
8. `portal_arquivo` com o path da **rubrica** usada num relatório de A2, mas **não** em nenhum de A1 → recusado. *(É o teste central da D-05: pasta autorizada, vínculo ausente.)*
9. `portal_arquivo` com um path da pasta `assinaturas/` **inventado** → recusado, com resposta **idêntica** à do passo 8: mesmo status, mesmo corpo, mesmos cabeçalhos. Latência não é critério (D-26).
10. `portal_arquivo` com path de **outra organização** → recusado.
11. `portal_arquivo` com path adulterado: `../`, barra inicial, `%2e%2e`, path de A1 com o uuid trocado → todos recusados.
12. UI do Portal de A1: lista de ativos, abrir ativo, ver foto, abrir e baixar PDF do relatório, ver a rubrica no documento → tudo funciona.
13. Repetir 1–12 com A2 invertido.
14. Logar como `org-teste-futuro` (`auditor_externo`): `select` em `app_storage` → `[]`; bucket → negado. **Prova do fail closed.**
15. Logar como `org-teste-func`: dashboard, equipamentos, gerar relatório em equipamento de teste, sincronizar → idêntico ao anterior.
16. Logar como `org-teste-mestre`: Acessos, Admin → idêntico. Conferir que nenhuma tela do Admin quebrou por `select` direto em `app_storage`.

### Teste de falha
- Edge fora do ar → o Portal exibe erro claro ("não foi possível carregar"), nunca tela vazia silenciosa.
- Token expirado no meio da sessão → mensagem de sessão expirada.
- Path malformado em `portal_arquivo` → recusa genérica, sem stack trace e sem revelar existência.
- Cliente sem nenhum ativo vinculado → lista vazia com mensagem, não erro.
- URL assinada expirada → o Portal pede outra, sem quebrar a tela.
- URL assinada de A1 **copiada e usada por A2** dentro da validade → funciona (é bearer token, é assim que funciona) — e é por isso que o TTL é curto. Registrar essa propriedade explicitamente no resultado da fase, para que ela seja uma decisão conhecida e não uma surpresa futura.

### Critério de aceite
- [ ] Os 16 passos do roteiro manual passam, nas duas direções (A1↔A2).
- [ ] Passos 1–4, 6–11: nenhum dado ou arquivo de A2 alcançável por A1, **por nenhum caminho**.
- [ ] Passo 8 (pasta autorizada, vínculo ausente) recusado — a D-05 está de fato implementada.
- [ ] Passo 9: resposta indistinguível entre "não existe" e "não é seu" — status, corpo e cabeçalhos iguais, e nenhuma ramificação por existência no código (D-26). Tempo não é critério.
- [ ] Passo 14: papel desconhecido sem acesso — **fail closed provado**.
- [ ] Passos 12, 15, 16 sem nenhuma regressão funcional.
- [ ] **D-24:** relatório de auditoria dos caminhos de criação de `profiles` entregue, com veredito por caminho.
- [ ] **D-24:** se Resultado B, os caminhos fail-open corrigidos, deployados e validados em produção **antes** das policies. Sem isso a fase **não é aprovada**.
- [ ] **D-24:** teste de `insert` omitindo `papel` prova que o perfil resultante não tem acesso.
- [ ] Mapa de acesso direto do Portal ao Supabase (pré-condição) entregue e integralmente endereçado.
- [ ] `npm test` verde; `npm run build` sem erro.
- [ ] SQL idempotente: rodar duas vezes seguidas não gera erro nem policy duplicada.

### Rollback
Arquivo `supabase/portal_isolamento_rollback.sql`, escrito **junto** com o de ida e testado
antes do deploy, restaurando as policies exatamente como estão hoje:

```sql
drop policy if exists app_storage_select_org on public.app_storage;
create policy app_storage_select_org on public.app_storage
  for select using (org_id = public.org_atual());

drop policy if exists inspecao_leitura on storage.objects;
create policy inspecao_leitura on storage.objects for select
  using (bucket_id = 'inspecao'
         and (storage.foldername(name))[1] = public.org_atual()::text);
```

Rollback é instantâneo (segundos), não perde dado nenhum e devolve o Portal ao
comportamento atual. O frontend novo continua funcionando com as policies antigas, porque
ele só passa a **preferir** a Edge — não depende da policy para funcionar.

**Rollback parcial, que é o caso mais provável.** As duas policies são independentes e
devem poder voltar separadamente:

| Sintoma | Rollback |
|---|---|
| Portal carrega a lista mas **fotos e PDFs não abrem** | reverter só `inspecao_leitura` |
| Portal **não carrega nada** | reverter só `app_storage_select_org` |
| Tela do Admin quebrada | reverter `app_storage_select_org` e migrar a tela para RPC antes de tentar de novo |
| Sistema interno afetado | reverter as duas imediatamente — não deveria acontecer, e se acontecer há erro na lista branca |
| **Conta nova nasce sem acesso** após a correção da origem (D-24) | reverter a subetapa 0.b. **Não** reverter tocando em perfis existentes: corrigir o caminho de criação e, se algum perfil já nasceu sem papel, corrigi-lo individualmente com `WHERE id = <uuid>` explícito |

**Rollback da D-24, e ele tem uma assimetria que precisa ficar clara:** reverter a
correção da origem é seguro (volta ao comportamento atual). Reverter uma **troca de
default** exige `alter table ... alter column papel set default 'mestre'` — e perfis
criados no intervalo mantêm o valor com que nasceram. Por isso a troca de default é o
passo 2 e opcional: o passo 1 (gravar explicitamente) não tem esse efeito residual.

**Ordem de deploy, e ela não é negociável:**

```
1. bundle novo em produção (frontend + Edges)   ← Portal já usa a Edge para tudo
2. conferir que o Portal funciona com as policies AINDA ANTIGAS
3. só então aplicar o SQL das policies
4. reconferir o Portal
```

Aplicar o SQL antes do bundle derruba o Portal no intervalo entre as duas coisas — e esse
intervalo depende de o usuário fazer o redeploy, ou seja, pode ser longo. O passo 2 é o que
garante que o rollback do passo 3 é suficiente: se o Portal já funcionava pela Edge com as
policies antigas, voltar as policies devolve exatamente o estado testado.

### Risco
**Médio.** A mudança em si é pequena e reversível, mas uma policy errada tira o Portal do
ar para todos os clientes. Mitigação: rollback pronto antes do deploy, roteiro manual
completo em organização de teste, e deploy em horário de baixo uso.

### Commit
Um commit por peça, nesta ordem, para que o rollback seja granular:
1. `feat(portal): edge portal_arquivo emite URL assinada com validação de vínculo`
2. `feat(portal): frontend pede arquivo à edge em vez de assinar direto`
3. `feat(seguranca): SQL de isolamento + rollback (NÃO aplicado ainda)`

Push em `main`. **PARAR — PORTÃO P1.** O SQL é aplicado manualmente pelo dono do projeto **depois** de
o bundle novo estar em produção — nessa ordem, e não o contrário: policy antes do bundle
derruba o Portal no intervalo entre as duas coisas.

---

# FASE 1 — Índice da hidratação incremental

### Objetivo
Fazer a consulta de hidratação usar índice em vez de varrer todas as linhas da organização
e ordenar em memória.

### Achados envolvidos
A-03.

### Por que esta fase vem agora
Aditiva, sem downtime, sem mudança de código de aplicação, rollback de uma linha. E precisa
vir **antes** da Fase 2 para que a observabilidade nasça medindo a arquitetura corrigida —
e antes da Fase 8, para que a massa de escala não registre um baseline de um gargalo que
já sabemos consertar.

### Escopo exato
- **SQL (novo):** `supabase/indice_hidratacao.sql`.
- Nada de frontend.

### O que NÃO será mexido
Query da hidratação (`storageV2.lerTudo`), ordenação, tamanho de página, marca d'água.
O índice existe justamente para servir a query **como ela é** (I-08, I-09, I-10).

### Arquitetura antes
```sql
-- Índices existentes em app_storage:
app_storage_org_idx        (org_id, chave)
app_storage_org_chave_uidx (org_id, chave) unique
app_storage_deletado_idx   (org_id, deletado_em)

-- Query de todo boot:
select chave, valor, versao, atualizado_em, dispositivo, deletado_em
  from app_storage
 where org_id = $1 and atualizado_em > $2
 order by atualizado_em asc, chave asc
 limit 1000 offset $3;
```
Nenhum índice cobre `(org_id, atualizado_em)`. O planner varre todas as linhas da org e
ordena — mesmo quando o resultado é zero linha.

### Arquitetura depois
```sql
create index concurrently if not exists app_storage_org_atualizado_idx
  on public.app_storage (org_id, atualizado_em, chave);
```
A ordem das colunas importa: `org_id` primeiro (igualdade), `atualizado_em` segundo
(faixa + ordenação), `chave` terceiro (desempate da ordenação). Assim o índice serve o
`where`, o `order by` e o `limit` sem sort adicional.

**`concurrently`** para não travar escrita durante a criação. Consequência: não pode rodar
dentro de bloco de transação; o script tem que ser executado direto no SQL Editor, e uma
falha deixa índice `INVALID` que precisa ser derrubado e recriado. O script deve conter a
verificação de validade ao final.

**Avaliar durante a fase:** se `app_storage_org_idx (org_id, chave)` fica redundante frente
ao `unique (org_id, chave)`. Se ficar, **não** derrubar nesta fase — remoção de índice é
mudança separada, e um índice redundante custa espaço, não correção.

### Migração
Nenhuma. Índice é estrutura, não dado.

### Compatibilidade
Total. Nenhum comportamento observável muda.

### Offline
Nenhum impacto.

### Segurança
Nenhum. Índice não altera RLS.

### Integridade
Nenhum.

### Métricas de baseline
Rodar **antes**, em duas organizações — uma pequena real (read-only, só `EXPLAIN`) e a
sintética grande quando existir:

```sql
explain (analyze, buffers, format text)
select chave, valor, versao, atualizado_em, dispositivo, deletado_em
  from app_storage
 where org_id = '<org>' and atualizado_em > '<marca>'
 order by atualizado_em asc, chave asc
 limit 1000;
```

Registrar em tabela:

| Medida | Como obter |
|---|---|
| Tipo de scan | linha `Seq Scan` / `Index Scan` do plano |
| Presença de `Sort` | nó `Sort` + `Sort Method` |
| `actual time` total | rodapé `Execution Time` |
| Buffers lidos | `shared hit` / `shared read` |
| Linhas varridas vs. devolvidas | `rows` do scan vs. `rows` do limit |
| Tamanho da tabela e dos índices | `pg_total_relation_size`, `pg_indexes_size` |
| Tempo de `INSERT`/`UPDATE` de 1 chave | `EXPLAIN ANALYZE` de um upsert em org de teste |

Medir **três cenários** de marca d'água, porque o ganho é diferente em cada um:
1. marca nula (primeiro boot — traz tudo);
2. marca atual, **nada mudou** (o caso mais comum — hoje varre tudo para devolver zero);
3. marca atual, **poucas linhas mudaram** (o segundo mais comum).

### Métricas esperadas
| Cenário | Antes (esperado) | Depois (critério) |
|---|---|---|
| Nada mudou | Seq Scan + Sort, `rows` varridas = todas da org | `Index Scan`/`Index Only Scan`, **sem nó `Sort`**, `rows` varridas ≈ 0 |
| Poucas mudanças | Seq Scan + Sort | Index Scan, `rows` varridas ≈ linhas mudadas |
| Primeiro boot | Seq Scan + Sort | Index Scan (ganho menor — traz tudo mesmo) |
| `INSERT`/`UPDATE` | X ms | ≤ X + 10% (um índice a mais tem custo de escrita; se passar disso, reavaliar) |

**Não aceitar "ficou mais rápido".** O aceite é o plano de execução mostrar `Index Scan`
sem `Sort` nos cenários 1 e 2, com número de linhas varridas registrado antes e depois.

### Testes automatizados
Nenhum teste de unidade se aplica (é estrutura de banco). Manter a suíte verde.

### Testes manuais
1. Rodar o `EXPLAIN ANALYZE` dos três cenários antes e depois; salvar a saída bruta em `docs/medicoes/2026-XX-fase1-explain.md`.
2. Conferir `pg_stat_user_indexes` depois de alguns boots reais: `idx_scan` do índice novo deve estar subindo.
3. Abrir o app numa org de teste e conferir que a hidratação funciona igual — mesma contagem de equipamentos.
4. Verificar que o índice ficou `valid`:
```sql
select indexrelid::regclass, indisvalid
  from pg_index
 where indexrelid = 'app_storage_org_atualizado_idx'::regclass;
```

### Teste de falha
- Interromper a criação `concurrently` no meio → confirmar que o índice fica `INVALID`, que o app **continua funcionando normalmente** (planner ignora índice inválido), e que o rollback o remove sem efeito colateral.

### Critério de aceite
- [ ] `EXPLAIN ANALYZE` mostra `Index Scan` e **nenhum nó `Sort`** nos cenários "nada mudou" e "poucas mudanças".
- [ ] Linhas varridas no cenário "nada mudou" cai de "todas da org" para ~0, com número registrado.
- [ ] Custo de escrita não sobe mais de 10%.
- [ ] `indisvalid = true`.
- [ ] Suíte verde, build limpo.

### Rollback
```sql
drop index concurrently if exists public.app_storage_org_atualizado_idx;
```
Segundos, sem downtime, sem perda de dado. O sistema volta exatamente ao comportamento
atual.

### Risco
**Baixo.** Índice aditivo. Único risco real é o tempo de criação numa tabela grande, que
`concurrently` mitiga.

### Commit
`perf(banco): índice (org_id, atualizado_em, chave) para a hidratação incremental`
— o `.sql` vai versionado no repo; a aplicação em produção é manual, pelo dono. **PARAR.**

---

# FASE 2 — Observabilidade

### Objetivo
Passar a enxergar o sistema por número em vez de por comentário de código. Corrigir a
contagem de relatórios do Admin (que passou a mentir depois da migração de 14/08) e
instalar as métricas mínimas para justificar e validar todas as fases seguintes.

### Achados envolvidos
A-11. Habilita a medição de A-10 (quantos registros em fallback), A-13 (quanto o legado
ocupa), A-06 (quanto o bucket ocupa) e todas as fases com "antes/depois".

### Por que esta fase vem agora
Sem ela, "métricas de baseline" das fases seguintes viram estimativa. E o defeito de
contagem já está ativo: toda organização migrada reporta número congelado, toda conta nova
reporta zero — o painel mente hoje.

### Escopo exato
- **SQL:** `supabase/admin_stats.sql` (substituir `admin_usage_stats()` por versão corrigida e ampliada) + função nova `admin_storage_stats()`.
- **Frontend:** `src/pages/Admin.tsx` — colunas novas e a seção de crescimento.
- Opcional, avaliar na fase: tabela `metricas_diarias` para série temporal (crescimento ao longo do tempo exige snapshot; calcular na hora só dá foto do presente).

### O que NÃO será mexido
Nenhum caminho de dado do usuário. Nenhuma policy de `app_storage` ou do bucket. A função
continua `security definer` com guarda `role='admin'` — e a guarda é reverificada nesta
fase, não relaxada.

### Arquitetura antes
```sql
-- admin_usage_stats(): conta relatórios assim
coalesce(sum(case when b.chave = 'nr13_historico_relatorios'
                  and jsonb_typeof(b.valor::jsonb) = 'array'
             then jsonb_array_length(b.valor::jsonb) end), 0)
```
Chave legada, que desde 14/08 só encolhe. Nada de Storage, tamanho, egress ou pendências.

### Arquitetura depois
Duas funções `security definer`, ambas com a guarda `role='admin'`:

**`admin_usage_stats()`** — por organização:
- equipamentos por tipo (mantém, já correto: conta `nr13_info_%` por `tipo`);
- **relatórios: `count(*) filter (where chave like 'nr13\_rel\_%')`** ← a correção;
- relatórios ainda só no legado (para acompanhar a migração da Fase 10B);
- inspeções (containers), sub-logins, contadores de PDF/impressão (mantém);
- **bytes de `app_storage` por org**: `sum(pg_column_size(valor))`;
- **registros em fallback base64**: contagem de chaves cujo JSON tem campo pesado sem `ref` — alimenta a Fase 6;
- **maiores chaves da org**: top 10 por `pg_column_size`.

**`admin_storage_stats()`** — por organização, lendo `storage.objects`:
- nº de arquivos, bytes totais;
- por pasta (`relatorios`, `assinaturas`, `certificados`, `componentes`, `prontuario-fabricante`, fotos por TAG);
- nº de PDFs e tamanho médio; nº de fotos e tamanho médio;
- maiores arquivos;
- ranking de organizações por consumo.

**Métricas de cliente (fila/pendências)** não vêm do banco — vivem no aparelho. Duas
opções, decidir na fase:
- (a) publicar um resumo anônimo por dispositivo numa tabela `telemetria_sync` (nº de pendências, nº de falhas, idade da mais antiga) — dá visão de frota, mas é escrita nova;
- (b) exibir só localmente, na tela `/pendencias`, e no Admin mostrar `profiles.ultima_sync`, que já existe.

**Recomendação: (b) nesta fase.** É leitura pura, não cria escrita nova no caminho crítico,
e `ultima_sync` já responde "**este usuário** está sincronizando?" — não "este aparelho"
(ver D-25: a coluna é por perfil, sobrescrita por qualquer aparelho do usuário). A tela do
Admin deve rotulá-la assim, sem prometer visão por dispositivo. A opção (a) fica registrada
como possível Fase 2.1 se a frota crescer.

### Migração
Nenhuma para dados. Se a tabela de série temporal for adotada, ela nasce vazia e é
preenchida por snapshot diário — nunca retroativamente (não há como inventar histórico).

### Compatibilidade
`admin_usage_stats()` mantém a assinatura de colunas existentes e **acrescenta** colunas
novas ao final, para o Admin atual não quebrar durante o deploy.

### Offline
Nenhum impacto — é tela de admin, online por natureza.

### Segurança
- Guarda `role='admin'` reverificada em **ambas** as funções, com teste explícito de que um `mestre` comum recebe exceção.
- As funções agregam **por organização**; nenhuma delas devolve `valor` de chave, conteúdo de relatório, nome de equipamento ou qualquer dado de negócio. Só contagens e tamanhos.
- `admin_storage_stats()` lê `storage.objects`, que contém apenas metadados de arquivo (nome, tamanho, data) — nunca conteúdo.
- Nenhuma policy é afrouxada. A visão cruzada de organizações é privilégio de `admin` da plataforma, que já existe.

### Integridade
Nenhum impacto. Leitura pura.

### Métricas de baseline
Esta fase **cria** o baseline. Registrar, no dia do deploy, o snapshot inicial de tudo
acima em `docs/medicoes/2026-XX-baseline-inicial.md` — é o marco zero contra o qual todas
as fases seguintes serão comparadas.

### Métricas esperadas
| Medida | Antes | Depois |
|---|---|---|
| Contagem de relatórios no Admin | congelada/zero para org migrada | igual à contagem real de `nr13_rel_%` |
| Bytes de `app_storage` por org | invisível | visível |
| Bytes de Storage por org | invisível | visível |
| Nº e tamanho médio de PDFs | invisível | visível |
| Nº e tamanho médio de fotos | invisível | visível |
| Registros em fallback base64 | invisível | número exato (dimensiona a Fase 6) |
| Peso do legado `nr13_historico_relatorios` | invisível | número exato (dimensiona a Fase 10A/10B) |

### Testes automatizados
- Teste da guarda: chamador sem `role='admin'` → exceção. Um teste por função.
- Teste do contrato de colunas: o Admin espera N colunas com estes nomes/tipos.
- Se a contagem for extraída para função pura de TS, teste dela; se for SQL puro, o aceite é manual (item abaixo).

### Testes manuais
1. Em organização de teste com **contagem conhecida** (ex.: exatamente 7 relatórios criados à mão), conferir que o Admin mostra 7.
2. Conferir que uma org que ainda não migrou mostra o total certo somando legado + novos, sem contar em dobro.
3. Logar como `mestre` (não-admin) e confirmar que a chamada é recusada.
4. Conferir que os números de Storage batem com o painel do Supabase (tolerância de arredondamento).

### Teste de falha
- Organização sem nenhum dado → todas as métricas em zero, sem erro de divisão.
- `valor` não-JSON numa chave → a função não pode explodir; usar `jsonb_typeof` defensivo como o código atual já faz.
- Bucket vazio → zero, sem erro.

### Critério de aceite
- [ ] Contagem de relatórios bate exatamente com a contagem manual em org de teste (7 = 7).
- [ ] Nenhuma organização é contada em dobro na convivência legado + novo.
- [ ] Não-admin é recusado nas duas funções.
- [ ] Snapshot inicial salvo em `docs/medicoes/`.
- [ ] Suíte verde, build limpo.

### Rollback
`admin_stats_rollback.sql` restaurando a versão atual de `admin_usage_stats()` e removendo
`admin_storage_stats()`. Como são `create or replace` de funções de leitura, o rollback é
imediato e não toca em dado. O Admin volta a mostrar as colunas antigas.

### Risco
**Baixo.** Leitura pura, atrás de guarda de admin, sem alteração de policy nem de dado.

### Commit
1. `fix(admin): contar relatórios por nr13_rel_ em vez da chave legada`
2. `feat(admin): métricas de storage, tamanho por organização e maiores consumidores`
**PARAR.**

---

# FASE 3 — Conflitos: fechar o ciclo

### Objetivo
Fazer o conflito ter fim: o usuário vê as duas versões, escolhe, a escolha sai da fila e
sincroniza. E parar a poluição do cache por cópias de conflito acumuladas.

### Achados envolvidos
A-14 (reclassificado de 🟡 para prioridade alta — ver justificativa abaixo).

### Por que esta fase vem agora
A verificação de 15/08/2026 mostrou três problemas encadeados que a auditoria inicial não
tinha aberto:

1. **Cópia de conflito polui o cache.** `guardarConflito` grava em `store: 'dados'`, e `cacheLocal.hidratarDoDisco()` carrega a store `dados` inteira no `Map`. As chaves `nr13_conflito_*` entram no cache de leitura, aparecem em `chavesComPrefixo`, e como `familiasChave` não conhece o prefixo, caem em `'global'` — nunca indexadas, nunca limpas.
2. **Cada retentativa cria outra cópia.** O botão "Tentar todas" de `/pendencias` percorre **todos** os itens, inclusive os em estado `conflito`. Cada reenvio bate no mesmo conflito e grava mais um `nr13_conflito_<chave>__<Date.now()>`. Sem teto.
3. **Conflito nunca sai da fila.** `drenar()` pula `estado === 'conflito'` aguardando decisão do usuário — decisão que a tela não oferece. O selo da topbar fica permanentemente em pendência, o que treina o usuário a ignorar o selo.

Precisa vir antes das fases que exercitam multi-dispositivo (4, 8, 9, 13), senão cada
conflito gerado em teste deixa lixo permanente.

### Escopo exato
- `src/services/sync.ts` — `guardarConflito` (store de destino), leitura dos conflitos, resolução.
- `src/services/cacheLocal.ts` — garantir que a store de conflitos não é hidratada no `Map`.
- `src/pages/Pendencias.tsx` — UI de comparação e escolha; `retentarTodas` passa a **pular** itens em conflito.
- `src/services/familiasChave.ts` — registrar o prefixo `nr13_conflito_` explicitamente (mesmo que só para excluí-lo), respeitando a regra do próprio arquivo: chave nova se registra na tabela.
- Testes: `sync.conflito.test.ts` (novo).

### O que NÃO será mexido
- A detecção de conflito na RPC (I-04) — está correta.
- A regra de preservar as duas versões (I-05) — é justamente o que a fase completa.
- Idempotência (I-03): a resolução **reusa** o `mutationId` quando o usuário escolhe a versão local; nunca cria mutação nova para a mesma alteração.

### Arquitetura antes
```
conflito detectado
  → guardarConflito()  →  store 'dados', chave nr13_conflito_<chave>__<ts>
  → item fica na fila com estado 'conflito'
  → drenar() pula para sempre
  → /pendencias mostra o item, oferece só "Tentar de novo"
  → "Tentar todas" reenvia  →  novo conflito  →  MAIS UMA CÓPIA
  → hidratarDoDisco() carrega tudo de 'dados' no Map, cópias incluídas
```

### Arquitetura depois
```
conflito detectado
  → guardarConflito()  →  store 'conflitos' (nova, fora de 'dados')
                          chave = <chave original>  (uma cópia por chave, não por tentativa)
  → item na fila, estado 'conflito'
  → drenar() continua pulando (correto)
  → "Tentar todas" PULA itens em conflito (não gera cópia nova)
  → /pendencias mostra lado a lado:
       "Como está neste aparelho"  (valor local, data, dispositivo)
       "Como está no servidor"     (valor do conflito, data, dispositivo)
    e três ações:
       [Manter a minha]   → reenvia com versaoBase = versão do servidor, MESMO mutationId
       [Usar a do servidor] → aplica o remoto no cache, remove o item da fila, apaga o conflito
       [Decidir depois]   → não faz nada (estado atual)
  → resolvido: item sai da fila, cópia de conflito é apagada, selo zera
```

### PRÉ-CONDIÇÃO BLOQUEANTE — semântica real do `mutationId` após conflito

**A revisão 2 afirmava que "Manter a minha" deve reusar o `mutationId` e trocar a
`versaoBase`. Essa afirmação NÃO pode ser tratada como decisão até ser verificada contra a
RPC.** O que segue é o resultado da leitura de 16/08/2026 — **hipótese forte, a confirmar
com teste executado contra o banco antes de escrever qualquer código.**

#### O que a leitura do código indica

`supabase/armazenamento_v2.sql`, caminho de conflito:

```sql
if v_atual.versao <> p_versao_esperada then
  v_res := jsonb_build_object('status','conflito', 'versao', v_atual.versao, ...);
  update public.app_storage_mutacoes m set resultado = v_res      -- ← PERSISTE
   where m.org_id = v_org and m.mutation_id = p_mutation_id;
  return v_res;
end if;
```

E o caminho rápido de idempotência, no topo da mesma função:

```sql
select m.resultado into v_res from public.app_storage_mutacoes m
 where m.org_id = v_org and m.mutation_id = p_mutation_id;
if found and v_res->>'status' is distinct from 'processando' then
  return v_res || jsonb_build_object('status','repetido');       -- ← sobrescreve o status
end if;
```

Conclusão indicada: **Caso B.** A tentativa que terminou em conflito **fica registrada** com
`resultado.status = 'conflito'`, que é distinto de `'processando'`. Uma segunda chamada com
o mesmo `mutation_id` cai no caminho rápido e devolve `{status:'repetido', versao:<a do
SERVIDOR>, ...}`.

#### Por que isso não é detalhe — o efeito no cliente

`contratoRpc.interpretarResposta` mapeia `'repetido'` para `{status:'repetido', versao}`.
E `sync.enviarItem` trata assim:

```ts
if (r.status === 'aplicado' || r.status === 'repetido') {
  const local = obterRegistro(item.chave);
  if (local) await gravarAtomico([{ chave, registro: { ...local, versao: r.versao } }]);
  await removerDaFila(item.mutationId);
  return true;                                  // ← reporta SUCESSO
}
```

Reusar o `mutationId` faria o cliente **remover o item da fila e reportar sucesso sem que
nada tivesse sido gravado no servidor**. A edição do usuário ficaria só no cache local, já
carimbada com a versão do servidor — e por isso `cacheLocal.aplicarRemoto` (`local.versao >=
remoto.versao`) nunca mais a sobrescreveria nem a corrigiria. Divergência permanente,
silenciosa, sem pendência. É perda de dado, e viola I-05 e I-03.

> **⚠ ISTO PARECE SER UM DEFEITO ATIVO, NÃO HIPOTÉTICO.** A tela `/pendencias` já hoje
> percorre **todos** os itens em `retentarTodas()` — inclusive os em estado `conflito` — e
> chama `tentarNovamente(mutationId)`, que reenvia com o **mesmo** id. Pelo raciocínio
> acima, um usuário com um conflito que clique "Tentar todas" (ou "Tentar de novo" no item
> em conflito) já perde a própria edição, em silêncio.
>
> **Confirmar isto é o primeiro item da Fase 3.** Se confirmado, a correção mínima — fazer
> `retentarTodas` e `tentarNovamente` recusarem item em estado `conflito` — é de uma linha
> e pode ser antecipada como hotfix, a critério do dono. Ela já está prevista no escopo
> desta fase.

#### O que a pré-condição precisa produzir

Verificar **executando contra a organização de teste**, não por leitura:

1. Provocar um conflito real (dois aparelhos, ou duas chamadas com versões divergentes).
2. Conferir a linha em `app_storage_mutacoes`: existe? qual `resultado`?
3. Reenviar o **mesmo** `mutation_id`. Qual o `status` devolvido?
4. Observar o que o cliente faz com essa resposta: o item sai da fila? o valor local é alterado?
5. Registrar a saída bruta dos quatro passos em `docs/medicoes/AAAA-MM-DD-fase3-mutationid.md`.

#### Desenho conforme o resultado

**Se Caso A** (conflito **não** registra resultado final; reenvio reprocessa):
reusar o `mutationId` com `versaoBase` atualizada é correto, e o desenho da revisão 2 vale.

**Se Caso B** (o indicado pela leitura — conflito registra resultado final):
a resolução **precisa de um `mutationId` novo**, com vínculo explícito ao original para não
perder auditabilidade:

```ts
{
  mutationId:  <novo uuid>,
  resolveDe:   <mutationId original>,   // vínculo — auditoria e diagnóstico
  op, chave, valor: <o valor LOCAL que o usuário escolheu manter>,
  versaoBase:  <versão do SERVIDOR, vinda do payload do conflito>,
  criadoEm:    <agora>,
  tentativas:  0,
  estado:      'aguardando',
}
```

O item original sai da fila **somente depois** de o novo ser gravado — mesma disciplina de
I-01: a substituição acontece numa transação só (`cacheLocal.gravarAtomico` já aceita dado
e fila juntos), nunca "remove o velho, depois cria o novo".

**Não é violação de I-03.** A idempotência protege contra reenviar **a mesma** mutação duas
vezes. A resolução de conflito é uma mutação **diferente**: valor possivelmente igual, mas
`versaoBase` diferente e intenção diferente ("aplicar sobre a versão do servidor"). Dar id
novo a intenção nova é o uso correto do mecanismo; reusar o id seria justamente o abuso.

#### Regra

> O plano **não escolhe** entre A e B. A Fase 3 começa pela verificação; o desenho é
> definido pelo resultado, e o resultado fica registrado. Escrever código antes disso é
> escrever contra uma suposição sobre o comportamento do banco.

**Decisões de desenho:**
- **Store nova `conflitos`** (não `dados`): exige bump de `VERSAO_SCHEMA` do IndexedDB de 1 para 2, com `onupgradeneeded` criando a store. O upgrade **não pode apagar** as stores existentes — só acrescentar.
- **Chave = chave original, não `<chave>__<ts>`:** uma cópia por chave em conflito. A cópia mais recente do servidor é a única relevante; guardar N tentativas do mesmo conflito não ajuda ninguém e é o vazamento atual.
- **Migração das cópias já existentes:** varrer `dados` por `nr13_conflito_` na primeira execução, mover para a store nova (a mais recente por chave) e remover as demais. Idempotente, roda uma vez por sessão, e **nunca apaga sem ter gravado** o destino antes.
- **Nunca resolver automaticamente.** Nenhum caminho do código escolhe uma versão sozinho. Se o usuário não decide, o item fica — visível, contado, mas sem descartar nada.

**Exibição do valor:** os valores são JSON de dado técnico. Mostrar o JSON cru é ilegível
para o usuário-alvo. A tela deve exibir um resumo humano — nome da chave traduzido
("Ficha do equipamento TESTE-01"), data e aparelho de cada lado — com o JSON completo atrás
de um `<details>` "Detalhes técnicos", exatamente como a tela já faz com erros hoje.

### Migração
Cópias `nr13_conflito_*` já existentes em `dados` → store `conflitos`, deduplicadas por
chave (fica a mais recente). Aditiva: grava o destino, confere, só então remove a origem.

### Compatibilidade
Aparelho que ainda não rodou o código novo continua funcionando: as cópias antigas
permanecem em `dados` até ele atualizar. Nenhuma perda.

### Offline
Central nesta fase. Conflito **nasce** de trabalho offline em mais de um aparelho.
- A tela de resolução deve funcionar 100% offline (os dois valores já estão no aparelho).
- "Manter a minha" offline → volta para a fila e sobe quando a rede voltar (I-12, I-15).
- "Usar a do servidor" offline → aplica no cache local imediatamente e remove da fila; não precisa de rede.

### Segurança
Nenhum impacto em RLS. A resolução usa a mesma RPC e as mesmas policies.

### Integridade
- Nenhuma versão é descartada sem escolha explícita (I-05 preservado e **completado**).
- "Manter a minha" reusa o `mutationId` (I-03) e atualiza a `versaoBase` para a versão do servidor — sem isso a RPC recusaria para sempre.
- Chaves de livro (`nr13_livro_`) em conflito merecem atenção: a trava do banco (I-17) pode recusar a escolha "manter a minha" se ela violar a cadeia de lacres. A tela deve tratar essa recusa com mensagem específica ("esta entrada do livro já foi emitida e não pode ser substituída"), não com erro genérico.

### Métricas de baseline
- Nº de chaves `nr13_conflito_*` presentes no `Map` após o boot, por aparelho de teste.
- Tamanho da store `dados` no IndexedDB.
- Nº de itens em estado `conflito` na fila.

### Métricas esperadas
| Medida | Antes | Depois |
|---|---|---|
| `nr13_conflito_*` no `Map` | N (cresce a cada retentativa) | **0** |
| Cópias por conflito | 1 por tentativa, sem teto | 1 por chave |
| Conflito resolvível pelo usuário | não | sim |
| Selo da topbar após resolver tudo | permanece em pendência | zera |

### Testes automatizados
- `guardarConflito` grava na store `conflitos`, não em `dados`.
- `hidratarDoDisco` não traz `nr13_conflito_*` para o `Map`.
- Duas detecções do mesmo conflito produzem **uma** cópia, não duas.
- **"Manter a minha" realmente sai do conflito:** após a resolução, o valor local está no servidor e o item não está mais na fila. Este é o teste que prova que o desenho escolhido (A ou B) funciona de verdade.
- **Sem loop de idempotência:** resolver um conflito nunca devolve `repetido` carregando o payload antigo. Teste explícito contra o cenário descrito na pré-condição.
- **Sem mutação duplicada:** a resolução produz exatamente UM item na fila; o original não coexiste com o novo.
- **Nenhuma versão perdida:** após "manter a minha", a versão do servidor continua recuperável na store `conflitos` até o usuário decidir descartá-la.
- **Retry após falha continua correto:** falhar a resolução (rede) e tentar de novo não cria um terceiro item nem reintroduz o original.
- **No Caso B:** o vínculo `resolveDe` é gravado e a troca (remover o original + criar o novo) acontece numa transação só.
- "Usar a do servidor" remove o item da fila, aplica o valor no cache e apaga a cópia.
- `tentarNovamente` e `retentarTodas` **recusam** item em estado `conflito` — o defeito ativo descrito na pré-condição.
- `retentarTodas` pula itens em estado `conflito`.
- Migração das cópias antigas é idempotente: rodar duas vezes dá o mesmo resultado.
- Upgrade do schema do IndexedDB de v1 para v2 preserva `dados`, `fila`, `tombstones`, `meta`.

### Testes manuais
Cenário de dois aparelhos, em organização de teste:
1. Aparelho A e B abrem o mesmo equipamento de teste.
2. Colocar B offline (DevTools → Network → Offline).
3. Editar a ficha em A (online) e deixar sincronizar.
4. Editar a mesma ficha em B (offline).
5. Reconectar B → conflito detectado.
6. Em B, abrir `/pendencias`: as duas versões aparecem, com data e aparelho identificados.
7. Escolher "Usar a do servidor" → item sai da fila, ficha exibe o valor de A, selo zera.
8. Repetir 1–5 e escolher "Manter a minha" → sobe, A recebe o valor de B na hidratação seguinte.
9. Repetir 1–5 e clicar "Tentar todas" → **nenhuma cópia nova** é criada.
10. Conferir no DevTools → Application → IndexedDB que a store `conflitos` tem 1 entrada por chave e que `dados` não tem `nr13_conflito_*`.

### Teste de falha
- Sem internet durante a resolução → as duas opções funcionam (ver seção Offline).
- Navegador fechado no meio da resolução → nada é perdido; o item continua na fila no próximo boot.
- Reload durante a tela de comparação → estado se recompõe do IndexedDB.
- Servidor recusa "manter a minha" por trava de livro → mensagem específica, item permanece.
- Upgrade do IndexedDB interrompido → o app deve continuar abrindo; a store nova é criada na próxima tentativa.

### Critério de aceite
- [ ] **Pré-condição concluída:** semântica do `mutationId` após conflito verificada **executando** contra o banco, com a saída bruta registrada em `docs/medicoes/`.
- [ ] Desenho (Caso A ou B) escolhido **pelo resultado medido**, não por suposição, e registrado.
- [ ] "Manter a minha" sai do conflito de fato: valor no servidor, item fora da fila.
- [ ] Nenhum caminho devolve `repetido` tratado como sucesso sem gravação.
- [ ] `tentarNovamente`/`retentarTodas` recusam item em conflito.
- [ ] Os 10 passos do roteiro de dois aparelhos passam.
- [ ] Zero chaves `nr13_conflito_*` no `Map` após boot.
- [ ] "Tentar todas" não cria cópia nova (passo 9).
- [ ] Nenhuma versão descartada sem escolha explícita.
- [ ] Upgrade v1→v2 do IndexedDB preserva todas as stores, provado por teste.
- [ ] Suíte verde, build limpo.

### Rollback
Reverter o commit do frontend. **Atenção:** o schema do IndexedDB não volta de v2 para v1
— `indexedDB.open` com versão menor falha. Por isso o código antigo precisa continuar
funcionando com o schema v2, o que ele faz naturalmente (ele só não conhece a store nova,
e ignorá-la é inofensivo). Registrar isso no plano task-level como restrição: **o upgrade
de schema é o único passo não reversível desta fase, e é seguro justamente porque é
puramente aditivo.**

### Risco
**Médio.** Mexe no motor de sincronização, que é o coração das garantias I-01…I-11. Mitigado
por: nenhuma mudança na detecção de conflito, nenhuma resolução automática, e cobertura de
teste específica para cada invariante tocado.

### Commit
1. `fix(sync): conflito vai para store própria, uma cópia por chave`
2. `fix(sync): retentar todas não reenvia item em conflito`
3. `feat(pendencias): comparar as duas versões e escolher`
**PARAR.**

---

# FASE 4 — Portal: arquitetura de leitura

### Objetivo
Fazer o Portal consultar **só** os dados dos ativos do cliente, entregar índice em vez de
documento completo, carregar arquivo sob demanda, e nunca mais falhar em silêncio por cota.

### Achados envolvidos
A-02.

### Por que esta fase vem agora
Depois da Fase 0 (o furo de segurança já fechado, e a policy nova é a rede de proteção de
qualquer erro na Edge) e da Fase 2 (para medir bytes antes/depois). É o maior ganho isolado
de egress do roteiro.

### Escopo exato
- **Edge:** `supabase/functions/portal_cliente/index.ts` — reescrita da estratégia de consulta.
- **Frontend:** `src/features/portal/portalService.ts` (hidratação), `src/pages/portal/PortalAtivos.tsx` (lista), `src/pages/portal/PortalAtivo.tsx` (detalhe).
- **Reuso:** `src/services/familiasChave.ts` (tabela de prefixos), `src/services/palco.ts` (montagem temporária).
- Testes: `portalService.test.ts` (novo).

### O que NÃO será mexido
- Policies (Fase 0 já as definiu).
- Templates HTML — o Portal usa os mesmos do sistema, com `ro=1`.
- Trava de somente leitura do Portal (I-20).

### Arquitetura antes
```
1. select chave, valor  where org_id = X and chave like 'nr13\_emp\_%'   (varredura 1)
2. select chave, valor  where org_id = X                                  (varredura 2, TUDO)
3. filtra em memória por chave.endsWith('_' + tag)
4. devolve tudo ao navegador, RelatorioSalvo completo incluído
5. navegador: localStorage.setItem() em laço, catch {} vazio
```

### Arquitetura depois
```
1. select chave, valor  where org_id = X and chave like 'nr13\_emp\_%'   (mantém — é o vínculo)
   → resolve o conjunto de TAGs do cliente

2. Monta a lista EXATA de chaves a buscar, a partir de familiasChave.POR_TAG:
     para cada TAG do cliente, para cada prefixo relevante → '<prefixo><TAG>'
   Consulta com  where org_id = X and chave = any($lista)
   → índice (org_id, chave) serve isso perfeitamente

3. Chaves de escopo de ID (nr13_rastreab_) e globais liberadas: lista fixa e curta.

4. Relatórios: devolve o ÍNDICE (nr13_historico_indice_<TAG>), nunca o registro completo.
   O registro só é buscado quando o cliente abre um relatório específico.

5. Arquivo (PDF, foto): nunca vai no payload. URL assinada emitida pela Edge da Fase 0,
   sob demanda, quando o cliente clica.

6. Navegador: palco temporário quando um template precisa; QuotaExceeded vira ERRO VISÍVEL.
```

**Decisão-chave:** a lista de prefixos vem de `familiasChave.POR_TAG`, que já é a tabela
explícita mantida pelo projeto e coberta por teste. Isso resolve o dilema que o comentário
atual da Edge registra ("padrões de sufixo com LIKE por TAG explodiriam em N queries"): não
são N queries nem N `LIKE` — é **uma** query com `chave = any(array)`, servida pelo índice
`(org_id, chave)` que já existe.

**Risco a mitigar:** a lista de prefixos é duplicada entre `src/` (TypeScript) e a Edge
(Deno). Duplicação de tabela é fonte clássica de dessincronização — chave nova entra em
`familiasChave.ts` e ninguém lembra da Edge, e a chave some do Portal em silêncio. Mitigação
obrigatória: **teste que compara as duas listas** e quebra se divergirem, no mesmo espírito
de `palco.varreduraTemplates.test.ts` (I-24).

**Falha de cota:** trocar o `catch {}` por erro visível. Regra: se qualquer chave necessária
não puder ser materializada, o Portal exibe "não foi possível carregar este documento" —
nunca uma folha pela metade. É o mesmo princípio do palco (I-23): documento recusado é
melhor que documento incompleto.

### Migração
Nenhuma. Só muda como os dados são consultados.

### Compatibilidade
Cliente vê exatamente os mesmos ativos, relatórios e documentos. Nenhuma chave que ele via
antes pode sumir — é o que o teste de paridade abaixo prova.

### Offline
O Portal não trabalha offline hoje e continua não trabalhando. Sem regressão. (Se um dia
for desejado, o desenho novo — índice leve + arquivo sob demanda — é pré-requisito para
isso ser viável.)

### Segurança
- A Fase 0 já garante o isolamento no servidor. Esta fase **não pode afrouxar** nada disso.
- A lista de chaves montada por TAG deve ser validada contra o conjunto de TAGs do cliente **antes** da consulta, nunca depois — construir a lista a partir das TAGs já é a validação.
- Nenhuma chave global nova entra na lista liberada sem análise: hoje são `nr13_minha_empresa` e `nr13_lista_phs` (dados da executante, que o cliente legitimamente vê no documento) e `nr13_rastreab_` (certificados dos padrões, anexados aos relatórios).

### Integridade
O PDF servido continua sendo o artefato do bucket com SHA-256 (I-16). Esta fase, na
verdade, **reforça** a integridade: o cliente deixa de receber o `RelatorioSalvo` completo,
então não há nem o que adulterar no DevTools.

### Métricas de baseline
Com a Fase 2 já instalada, medir na abertura do Portal (DevTools → Network, e log da Edge):
- bytes transferidos Edge→navegador;
- bytes lidos Postgres→Edge;
- nº de queries;
- nº de registros retornados;
- tempo até a lista de ativos aparecer;
- tempo até um ativo abrir;
- pico de `localStorage` usado.

Medir em **quatro tamanhos de organização**, com o cliente tendo sempre **3 ativos**:

| Org tem | Cliente tem | Por quê |
|---|---|---|
| 3 equipamentos | 3 | caso mínimo |
| 50 | 3 | caso real hoje |
| 500 | 3 | prova que o custo deixou de depender do tamanho da org |
| 1.000 | 3 | idem, limite do teste |

### Métricas esperadas
| Medida | Antes | Depois (critério) |
|---|---|---|
| Bytes Postgres→Edge, org de 1.000 | proporcional à org inteira | proporcional aos 3 ativos |
| Bytes Edge→navegador | inclui `RelatorioSalvo` completo | índice leve, sem snapshot |
| Nº de registros lidos | todos da org | ~(3 ativos × prefixos) + globais |
| Tempo de abertura, org de 500 | cresce com a org | **constante** em relação ao tamanho da org |
| `QuotaExceeded` silencioso | possível | impossível — vira erro visível |

**O aceite central:** o tempo e os bytes de abertura do Portal para um cliente de 3 ativos
devem ficar **praticamente iguais** numa org de 3 e numa org de 1.000. Se crescerem com o
tamanho da organização, a fase não atingiu o objetivo.

### Testes automatizados
- Resolução de TAGs: dado um conjunto de `nr13_emp_*`, devolve só as do cliente.
- Montagem da lista de chaves: para uma TAG, produz exatamente os prefixos esperados.
- **Paridade de prefixos entre `familiasChave.ts` e a lista da Edge** — quebra se divergirem.
- **Paridade de resultado:** dado um conjunto fixo de chaves, o conjunto devolvido pelo caminho novo é **superconjunto ou igual** ao do caminho antigo para as TAGs do cliente. Nenhuma chave pode sumir.
- Índice de relatório é devolvido; registro completo não é.
- `QuotaExceeded` propaga erro, não é engolido.

### Testes manuais
1. Cliente A1 (org de teste, 3 ativos): abrir lista, abrir cada ativo, abrir relatório, baixar PDF, ver fotos, abrir prontuário. Tudo igual ao anterior.
2. Comparar visualmente, lado a lado, uma folha renderizada antes e depois — nenhum campo pode ficar "-".
3. Criar organização de teste com 500 equipamentos (Fase 8 gera; até lá, script pontual em org de teste) e um cliente com 3 → medir tempo de abertura.
4. Simular cota estourada (preencher `localStorage` artificialmente) → confirmar mensagem de erro visível.

### Teste de falha
- Edge indisponível → erro claro.
- Uma chave necessária faltando no banco → a folha correspondente indica falta, sem quebrar o resto.
- Cota estourada → erro visível, nunca folha incompleta.
- Cliente sem ativos → lista vazia com mensagem.
- Rede caindo no meio do carregamento → estado de erro recuperável com botão de tentar de novo.

### Critério de aceite
- [ ] Tempo e bytes de abertura do Portal **não crescem** com o tamanho da organização (medido em 3/50/500/1.000).
- [ ] Teste de paridade prova que nenhuma chave que o cliente via antes sumiu.
- [ ] Teste de paridade de prefixos entre `familiasChave.ts` e a Edge está verde.
- [ ] Nenhum `RelatorioSalvo` completo no payload da listagem.
- [ ] `QuotaExceeded` produz erro visível.
- [ ] Todas as folhas renderizam idênticas ao antes (comparação visual).
- [ ] Suíte verde, build limpo.

### Rollback
Reverter os commits de frontend **e** redeployar a versão anterior da Edge (guardar o
arquivo atual em `supabase/functions/portal_cliente/index.anterior.ts` antes de mexer).
Nenhum dado é migrado, então o rollback é imediato e sem perda. As policies da Fase 0
permanecem — e continuam corretas com a Edge antiga, porque ela já usa `service_role`.

### Risco
**Baixo.** Área isolada, sem escrita, sem dado do inspetor em jogo, com a segurança já
garantida pela fase anterior. O maior risco é funcional (chave esquecida → folha com "-"),
e é exatamente o que o teste de paridade cobre.

### Commit
1. `perf(portal): edge consulta só as chaves das TAGs do cliente`
2. `perf(portal): listagem usa índice de relatórios, sem snapshots`
3. `fix(portal): falha de cota vira erro visível`
**PARAR — PORTÃO P2.**

---

# FASE 5 — Fotos: thumbnail, EXIF e teto de altura

### Objetivo
Parar de baixar 100–150 KB para desenhar uma miniatura de 40 px, **sem tocar na qualidade
da foto que vai impressa**.

### Achados envolvidos
A-08.

### Por que esta fase vem agora
Ganho grande e independente, risco baixo, e precisa estar decidido antes da Fase 11 — o
piloto de PDF precisa saber a forma final da foto.

### Escopo exato
- `src/services/imagem.ts` — `comprimirParaBlob` ganha teto de altura e orientação explícita; função nova para a variante miniatura.
- `src/services/fotos.ts` — `salvarFoto` passa a produzir duas variantes; `RefFoto` ganha campo opcional de miniatura; `resolverFoto` ganha modo.
- `src/components/FotoImg.tsx` — prop de variante.
- Consumidores de miniatura: `Equipamentos.tsx`, `CardEquipamento`, `Calibracoes.tsx` (componentes), `Galeria.tsx`, `PortalAtivos.tsx`, Dashboard.
- Testes: `imagem.test.ts` (novo), `fotos.test.ts` (estender).

### O que NÃO será mexido
- **A variante principal permanece 1200 px / q0.7.** A auditoria confirmou que é o valor certo para impressão: área útil de ~90 mm a 300 dpi pede ~1.060 px. Reduzir custaria leitura de placa, trinca e corrosão.
- O caminho de upload, o cofre, a fila (I-12, I-13, I-14).
- Fotos já existentes — nenhuma é reprocessada.

### Arquitetura antes
```
File  →  comprimirParaBlob(1200px, q0.7)  →  Blob  →  cofre  →  bucket
                                                    →  RefFoto { bucket, path, mimeType, tamanho }

Mesma variante serve: card 40px, galeria, lista, relatório A4.
Escala só por largura → retrato vira 1200×1600.
Orientação EXIF: herdada do navegador, não explícita.
```

### Arquitetura depois
```
File  →  normalizar orientação (explícito)
      →  principal: 1200px de LARGURA e teto de ALTURA (ex.: 1600), q0.7   ← inalterado na prática
      →  thumb:     320px, q0.6                                            ← novo, ~15 KB
      →  os dois vão ao cofre e ao bucket, com paths irmãos
      →  RefFoto { bucket, path, mimeType, tamanho, thumbPath?, thumbTamanho? }

FotoImg variante="thumb"  →  usa thumbPath quando existe
                          →  CAI NA PRINCIPAL quando não existe (foto antiga)
FotoImg variante="cheia"  →  sempre a principal
Relatório / palco / PDF   →  SEMPRE a principal, nunca o thumb
```

**Decisões de desenho:**
- **Path irmão, não pasta separada:** `<org>/<escopo>/<uuid>.jpg` e `<org>/<escopo>/<uuid>.thumb.jpg`. Assim a policy do bucket (que compara a primeira pasta com a org) vale igual para os dois sem alteração nenhuma (I-22).
- **Teto de altura:** hoje só a largura limita. Definir teto de altura (sugestão: 1600 px, a ser confirmado medindo fotos reais em retrato) e escalar pelo fator mais restritivo dos dois.
- **Orientação EXIF explícita:** hoje funciona por padrão do navegador (`image-orientation: from-image`). Passar a tratar explicitamente via `createImageBitmap(file, { imageOrientation: 'from-image' })` com fallback para o caminho atual. Comportamento herdado que funciona não é o mesmo que garantia.
- **A principal e o thumb NÃO são atômicos, de propósito.** Ver a decisão D-18 abaixo.

### D-18 — a thumbnail nunca pode custar a foto principal

**A pergunta:** as duas variantes devem ser gravadas numa transação só no cofre?

**Resposta: não.** A atomicidade aqui protegeria a coisa errada. O invariante I-01
(dado + fila na mesma transação) existe porque **dado sem fila nunca sobe e fila sem dado
sobe lixo** — os dois lados são necessários para a correção. Aqui não é assim: a principal
sozinha é um estado **completo e correto**, indistinguível do estado de toda foto tirada
antes desta fase. O thumb é acelerador.

Exigir atomicidade inverteria a prioridade: um erro ao rasterizar o thumb — canvas sem
memória, imagem exótica, aba em segundo plano — faria **perder a foto que o usuário acabou
de tirar em campo**. É o único desfecho inaceitável do sistema inteiro, e o mesmo raciocínio
que mantém o fallback base64 vivo na Fase 6.

**A ordem, que é a regra da fase:**

```
1. normalizar orientação
2. gerar a PRINCIPAL
3. gravar a principal no cofre e devolver a RefFoto      ← a partir daqui a foto está salva
4. gerar o thumb            — se falhar: segue, sem thumbPath
5. gravar o thumb no cofre  — se falhar: segue, sem thumbPath
6. atualizar o registro com thumbPath                     — se falhar: segue
```

Do passo 3 em diante, **nada pode desfazer a foto**. Os passos 4–6 são best-effort, cada um
com seu próprio `catch` que apenas registra. O registro sem `thumbPath` é válido, esperado e
já exercitado por todas as fotos anteriores a esta fase.

**Sem estado inconsistente possível:** o thumb é descoberto por `thumbPath` presente no
registro, e o `thumbPath` só é gravado no passo 6, depois de o arquivo existir. Um thumb no
cofre sem `thumbPath` no registro é um arquivo órfão de poucos KB — que o inventário da
Fase 10A encontra. Um `thumbPath` sem arquivo não acontece.

**Upload:** os dois sobem pela mesma fila do cofre, **independentemente**. O thumb pode
subir antes, depois, ou nunca. `FotoImg` cai na principal enquanto o thumb não estiver
disponível.

### Migração
**Nenhuma obrigatória**, por decisão explícita. Foto antiga sem thumb funciona normalmente
(cai na principal). Opcionalmente, em fase futura própria, uma rotina de background pode gerar thumbs
para fotos antigas — mas isso baixa e reprocessa cada foto, custa egress, e só se justifica
se a Fase 2 mostrar que o volume compensa. **Fica fora do escopo desta fase.**

### Compatibilidade
- `RefFoto` ganha campos **opcionais**. Registro antigo continua válido sem mudança.
- Base64 legado continua sendo exibido (I-26).
- Nenhum template HTML muda: eles recebem a imagem pelo palco, que sempre usa a principal.

### Offline
- As duas variantes são geradas **no aparelho**, antes de qualquer rede — mesmo caminho online e offline, como você pediu.
- Os dois blobs vão ao cofre antes da tentativa de upload (I-12).
- A fila retoma os dois independentemente. O thumb pode subir depois da principal sem problema.
- Teste específico: tirar foto offline → thumb e principal no cofre → reconectar → ambos sobem.

### Segurança
Nenhum impacto. Mesmo bucket, mesma pasta por organização, mesmas policies.

### Integridade
Nenhum. Thumb não entra em relatório, não entra em hash, não entra em documento assinado.

### Métricas de baseline
- Bytes transferidos ao abrir `/equipamentos` com 20, 50 e 100 equipamentos com foto.
- Bytes ao abrir `/calibracoes` com 8 componentes com foto.
- Tempo até a lista estar com todas as fotos visíveis.
- Tamanho médio da foto principal no bucket (vem da Fase 2).

### Métricas esperadas
| Medida | Antes | Depois (critério) |
|---|---|---|
| Bytes por card de lista | 100–150 KB | ~15 KB (**≥ 85% de redução**) |
| Bytes ao abrir `/equipamentos` com 100 fotos | ~12 MB | ~1,5 MB |
| Qualidade da foto no relatório A4 | referência | **idêntica, byte a byte** |
| Foto antiga sem thumb | funciona | funciona (sem regressão) |

### Testes automatizados
- `comprimirParaBlob` respeita teto de largura **e** de altura; retrato e paisagem.
- Orientação: imagem com EXIF rotacionado sai na orientação certa.
- `salvarFoto` produz a principal e, quando possível, o thumb.
- **Um teste por ponto de falha da D-18**, todos com a mesma asserção — a principal existe e a `RefFoto` devolvida é válida: geração do thumb lança; gravação do thumb no cofre lança; atualização do registro com `thumbPath` lança.
- Registro sem `thumbPath` é considerado válido por todo consumidor.
- `resolverFoto(variante='thumb')` usa `thumbPath`; sem `thumbPath`, cai na principal.
- O palco **nunca** usa o thumb — teste explícito, porque essa é a regressão que degradaria documento assinado.
- Registro antigo (sem `thumbPath`) continua resolvendo.

### Testes manuais (com comparação visual obrigatória)
1. Fotografar/subir 6 imagens reais de inspeção: uma placa de identificação com texto pequeno, uma solda, uma região com corrosão, uma trinca, um instrumento com mostrador, e uma foto geral.
2. Gerar relatório com essas fotos **antes** da mudança; salvar o PDF.
3. Aplicar a mudança; gerar o mesmo relatório; salvar o PDF.
4. **Comparar os dois PDFs lado a lado, com zoom**, folha de registro fotográfico. Critério: nenhuma perda perceptível — em especial, o texto da placa deve continuar legível no mesmo nível.
5. Conferir que as miniaturas nas listas estão nítidas o suficiente para reconhecer o equipamento.
6. Foto em retrato: conferir que não fica desproporcional nem estourada.
7. Foto tirada com o celular deitado: conferir orientação correta em card, galeria e folha.

### Teste de falha
Todos com o mesmo critério: **a foto principal sobrevive**.

- Sem internet ao fotografar → as duas variantes no cofre; sobem depois, independentemente.
- **Geração do thumb lança exceção** (canvas sem memória, imagem exótica) → principal salva, registro sem `thumbPath`, UI cai na principal, **nenhum erro exibido ao usuário**. Só log.
- **Gravação do thumb no cofre falha** → idem.
- **Atualização do registro com `thumbPath` falha** → idem; o thumb fica órfão no cofre e o inventário da Fase 10A o encontra.
- Upload do thumb falha, principal sobe → card cai na principal, sem erro visível.
- Upload da principal falha → comportamento atual mantido (pendente, retomado).
- **Navegador fechado entre as duas gravações** → a principal está salva e é um estado completo. O thumb não existe, e isso é aceitável. Ao reabrir, a foto aparece normalmente.
- **Aba em segundo plano durante a geração do thumb** (celular, cenário real de campo) → principal salva; thumb pode não existir.
- Arquivo que não é imagem → erro claro, como hoje, antes de qualquer gravação.

### Critério de aceite
- [ ] Redução de **≥ 85%** nos bytes de listagem, medida.
- [ ] PDF de comparação: **nenhuma perda perceptível** nas 6 fotos de referência, com zoom.
- [ ] Foto antiga sem thumb funciona em todas as telas.
- [ ] Teste provando que o palco nunca usa o thumb.
- [ ] Orientação correta nas 3 telas para foto rotacionada.
- [ ] Suíte verde, build limpo.

### Rollback
Reverter os commits. Fotos novas ficam com um `.thumb.jpg` órfão no bucket — inofensivo,
pequeno, e a Fase 10A (inventário de órfãos) o encontra. Nenhuma foto principal é afetada,
nenhum dado se perde.

### Risco
**Baixo.** A variante principal não muda. O pior caso é o thumb não existir, que é
exatamente o caminho já exercitado pelas fotos antigas.

### Commit
1. `feat(imagem): orientação explícita e teto de altura`
2. `feat(fotos): variante miniatura com fallback para a principal`
3. `perf(ui): listas e cards usam a miniatura`
**PARAR — PORTÃO P3.**

---

# FASE 6 — Recuperação do fallback base64

### Objetivo
Fazer o registro que caiu no fallback base64 (porque o upload falhou) ser recuperado
automaticamente quando as condições melhorarem — sem nunca arriscar o arquivo do usuário.

### Achados envolvidos
A-10.

### Por que esta fase vem agora
Depois da Fase 2, que informa **quantos** registros estão nessa condição. Antes da Fase 7,
que reusa o mecanismo de recuperação criado aqui.

### Escopo exato
- **Novo:** `src/services/recuperacaoArquivos.ts` — a varredura idempotente.
- Consumidores: `rastreabilidadeService.ts`, `componentesService.ts`, `ProntuarioFabricante.tsx`.
- Gatilho: `RotaProtegida` (mesmo lugar de `migrarHistoricoEmSegundoPlano`).
- Testes: `recuperacaoArquivos.test.ts`.

### O que NÃO será mexido
**O fallback continua existindo, exatamente como está.** Falha de upload continua gravando
o base64 no registro. Perder o certificado que o usuário acabou de anexar segue sendo o
único desfecho inaceitável. Esta fase só acrescenta a **segunda chance**.

### Arquitetura antes
```
upload falha  →  catch  →  grava base64 no app_storage  →  fica assim PARA SEMPRE
```

### Arquitetura depois
```
upload falha  →  catch  →  grava base64 (inalterado)

Em background, uma vez por sessão, com throttle:
  para cada registro com base64 e SEM ref:
    1. converter base64 → Blob
    2. salvarArquivo() → cofre local + tentativa de upload   (reusa I-12, I-13)
    3. CONFIRMAR que o arquivo existe no servidor (arquivoPendente() == false)  (I-14)
    4. validar tamanho; validar hash quando houver hash de referência
    5. gravar o registro com { ...registro, base64: '', ref }
    6. SÓ ENTÃO o base64 deixa de existir — porque o passo 5 é uma única
       escrita atômica que já contém a ref
```

**A ordem é a regra da fase.** Nunca "apagar base64 → tentar upload". O passo 5 é uma
escrita só: ou o registro passa a ter a ref **e** perde o base64 ao mesmo tempo, ou nada
muda. Se qualquer passo anterior falhar, o registro fica **exatamente como estava**.

**Controles:**
- **Throttle:** no máximo N registros por sessão (sugestão: 3), com pausa entre eles. Recuperar 50 certificados de 800 KB num boot consumiria a banda do usuário sem ele pedir.
- **Retry:** registro que falhou não é reprocessado na mesma sessão; volta na próxima.
- **Interrupção segura:** a varredura é uma sequência de operações independentes. Fechar a aba no meio deixa os já convertidos convertidos e os demais intocados.
- **Nunca em conta somente leitura:** mesma guarda de `migrarHistoricoEmSegundoPlano` — `if (bloqueadoParaEscrita()) return`. Portal e assinatura vencida não convertem nada.
- **Nunca offline:** sem rede, o passo 3 nunca confirma; a varredura deve nem começar.

### Migração
É a própria fase. Idempotente por construção: registro que já tem ref é pulado.

### Compatibilidade
- Registro legado com base64 continua **legível** o tempo todo (I-26). `resolverPdf` e `resolverFoto` já tentam objeto → ref → IndexedDB → Supabase, nessa ordem.
- Aparelho que não rodou o código novo continua lendo os registros convertidos, porque a ref é o caminho preferencial que já existe.

### Offline
- A varredura **não roda** offline (o passo 3 exige confirmação do servidor).
- Testar: iniciar recuperação, cair a rede no meio → o registro em andamento fica intacto com base64 e o arquivo no cofre; a próxima sessão retoma. Nenhum estado intermediário perdido.

### Segurança
Nenhum impacto. Usa o mesmo bucket, mesmas policies, mesma organização.

### Integridade
- Validação de tamanho obrigatória. Validação de hash onde houver hash de referência.
- O arquivo só é considerado recuperado quando o **servidor** confirmou (I-14), nunca por `navigator.onLine`.
- Registros de rastreabilidade têm imutabilidade por soft-replace: a recuperação **não pode** criar versão nova nem marcar `substituidoEm`. É a mesma versão, com o arquivo mudando de lugar.

### Métricas de baseline
Da Fase 2: nº de registros em fallback por organização, e bytes que eles ocupam, por tipo
(`nr13_rastreab_`, `nr13_componentes_cal_`, `nr13_pront_fab_`).

### Métricas esperadas
| Medida | Antes | Depois (critério) |
|---|---|---|
| Registros em fallback | N | tende a 0 ao longo das sessões |
| Bytes de base64 em `app_storage` | M KB | reduzidos proporcionalmente |
| Documentos perdidos | 0 | **0** (invariante — nenhum pode se perder) |
| Bytes hidratados por boot | inclui os gordos | reduzido |

### Testes automatizados
- Registro com base64 e sem ref → convertido; o resultado tem ref e base64 vazio.
- Registro com ref → **pulado** (idempotência).
- Upload falha no passo 2 → registro **inalterado**, base64 intacto.
- Confirmação falha no passo 3 → registro **inalterado**.
- Validação de tamanho falha → registro **inalterado**.
- Throttle respeitado: no máximo N por sessão.
- Conta somente leitura → varredura não roda.
- Offline → varredura não roda.
- Rastreabilidade: a recuperação não cria versão nova nem marca `substituidoEm`.

### Testes manuais
1. Em org de teste, forçar o fallback: anexar um certificado com a rede bloqueada no momento do upload → confirmar que o registro nasceu com base64.
2. Restaurar a rede, recarregar → confirmar que o registro foi convertido (ref presente, base64 vazio) e que o PDF continua abrindo e sendo anexado ao relatório.
3. Conferir o arquivo no bucket.
4. Repetir com foto de componente e com prontuário do fabricante.
5. Conferir no Admin (Fase 2) que o contador de registros em fallback caiu.

### Teste de falha
- Sem internet → não roda.
- Upload quebrando (forçar 500) → registro intacto, tenta na próxima sessão.
- Navegador fechado no meio → parcial seguro, retomado.
- Reload no meio → idem.
- Dois aparelhos convertendo o mesmo registro ao mesmo tempo → o segundo encontra a ref já gravada e pula; se houver corrida, a RPC detecta conflito (I-04) e nada é perdido.

### Critério de aceite
- [ ] Registro em fallback é convertido em condições normais.
- [ ] Em **toda** falha simulada, o registro fica byte a byte como estava.
- [ ] Nenhum documento se perde em nenhum cenário testado.
- [ ] Contador do Admin reflete a queda.
- [ ] Suíte verde, build limpo.

### Rollback
Reverter o commit. Registros já convertidos permanecem convertidos — e isso é **seguro**,
porque a leitura por ref já existe no código atual (`resolverPdf`, `resolverFoto`,
`resolverPdfFabricante` já preferem a ref). Nenhum passo é destrutivo.

### Risco
**Baixo.** Nenhuma escrita destrutiva; o pior caso é a conversão não acontecer.

### Commit
1. `feat(arquivos): varredura idempotente de recuperação do fallback base64`
2. `feat(arquivos): gatilho em background com throttle e guarda de somente leitura`
**PARAR.**

---

# FASE 7 — Logo e rubrica endereçadas por conteúdo

### Objetivo
Estender o padrão já usado no Livro de Registro (arquivo nomeado pelo SHA-256 do próprio
conteúdo) para a rubrica dos funcionários, a logo da empresa e os snapshots de relatórios
**futuros** — cortando N cópias da mesma imagem por N cópias de uma referência de ~150 bytes.

### Achados envolvidos
A-05.

### Por que esta fase vem agora
Depois da Fase 6, que já criou a varredura de recuperação idempotente e o padrão de
"registro gordo → referência com confirmação antes de zerar". Esta fase reusa esse
mecanismo em vez de reescrevê-lo.

### Escopo exato
- `src/services/imagem.ts` — `processarAssinatura` e `comprimirImagem` passam a devolver blob além do dataURL.
- `src/pages/Funcionarios.tsx`, `src/pages/MinhaEmpresa.tsx` — gravam ref.
- `src/features/cadastros/tipos.ts` — `Funcionario` ganha `assinaturaRef?`.
- `src/features/relatorios/tipos.ts` — `AssinanteSnapshot` ganha `assinaturaRef?`; `meta.empresa` ganha `logoRef?`.
- `src/services/palco.ts` — estender `CAMPO_REF_NOMEADO` (já existe para `nr13_livro_.assinaturaRef`).
- `public/rel-assinatura.js`, `public/rel-empresa.js`, `public/pront-assinatura.js` — leitura com fallback.
- Testes: estender `palco.camposFoto.test.ts` e `palco.varreduraTemplates.test.ts`.

### O que NÃO será mexido
- **Nenhum relatório já emitido.** Snapshots antigos não são reescritos. Isso não é preguiça: reescrever snapshot de documento assinado é a fraude que a arquitetura inteira existe para impedir.
- **Nenhum PDF já emitido** — são artefatos com hash (I-16).
- Entradas de livro já lacradas (I-17) — o próprio `livroAssinatura.ts` documenta por que não se toca nelas: mudar `assinaturaImg` mudaria o hash do lacre e a entrada passaria a se acusar de adulterada.
- O congelamento em si (I-18 estendido): continua havendo snapshot. Muda só **o que** o snapshot guarda.

### Pré-requisito obrigatório: inventário de consumidores
**Antes de escrever qualquer linha**, levantar por varredura em `public/` e `src/` todos os
pontos que consomem rubrica e logo. Levantamento inicial da auditoria, a ser confirmado:

| Consumidor | Lê o quê | Origem |
|---|---|---|
| `rel-assinatura.js` | rubrica do engenheiro e do técnico | `meta.assinantes` (com `ctx=rel`) ou `nr13_lista_phs` |
| `rel-empresa.js` | logo | `meta.empresa` (com `ctx=rel`) ou `nr13_minha_empresa` |
| `pront-assinatura.js` | rubrica nas 6 folhas do prontuário | `nr13_assinantes_pront_<TAG>` + `nr13_lista_phs` |
| `LIVRO-REGISTRO.html` | rubrica da entrada | `assinaturaImg` (já via ref + mapa do palco) |
| `CAPA.html` e cabeçalhos | logo | `nr13_minha_empresa` |
| `CERTIFICADO-CAL-*.html` | assinatura própria | fluxo antigo — confirmar |
| Telas React | preview no cadastro | `Funcionarios.tsx`, `MinhaEmpresa.tsx` |

Esse inventário vira teste (I-24): a varredura de templates deve provar que todo consumidor
foi coberto. **Um consumidor esquecido imprime documento assinado sem a rubrica — falha
silenciosa, o modo mais caro deste projeto.**

### Arquitetura antes
```
nr13_lista_phs      : [{ ..., assinatura: "data:image/png;base64,..." }]   ~20 KB por rubrica
nr13_minha_empresa  : { ..., logo: "data:image/jpeg;base64,..." }          ~15 KB

Relatório salvo:
  meta.assinantes.engenheiro.assinatura = <cópia da dataURL>
  meta.assinantes.tecnico.assinatura    = <cópia da dataURL>
  meta.empresa.logo                     = <cópia da dataURL>

⇒ 100 relatórios = 100 logos + 200 rubricas duplicadas
```

### Arquitetura depois
```
Cadastro de rubrica (DADO VIVO — gravação dupla durante a convivência):
  processarAssinatura()  →  blob  →  salvarArquivoPorConteudo(blob, 'assinaturas', 'png')
                                     path = <org>/assinaturas/<sha256>.png
  nr13_lista_phs : [{ ...,
                      assinatura:    "data:image/png;base64,...",   ← MANTIDA (rollback)
                      assinaturaRef: { path, ... } }]                ← NOVA (fonte preferida)

Relatório NOVO (SNAPSHOT — só a referência, desde o primeiro dia):
  meta.assinantes.engenheiro.assinaturaRef = <ref>     ← ~150 bytes
  meta.empresa.logoRef                     = <ref>
  meta.assinantes.engenheiro.assinatura    = AUSENTE   ← o ganho vem daqui

Montagem do documento (palco):
  CAMPO_REF_NOMEADO resolve assinaturaRef → assinaturaImg,  UMA cópia por rubrica distinta
  (mapa caminho→dataURL, como CHAVE_RUBRICAS_PALCO já faz para o livro)

Leitura nos templates:
  ref presente  → usa a resolvida pelo palco
  ref ausente   → usa a dataURL legada        ← fallback permanente (I-26)
```

### D-11 (revisada em 16/08/2026) — gravação dupla SÓ no dado vivo, com prazo e critério de saída

A revisão 1 se contradizia: a arquitetura mostrava `assinatura: ''` e o rollback exigia
manter a dataURL. **A regra definitiva, sem ambiguidade:**

| Onde | Durante a convivência | Motivo |
|---|---|---|
| `nr13_lista_phs[].assinatura` (dataURL) | **MANTIDA** | permite rollback não-destrutivo |
| `nr13_lista_phs[].assinaturaRef` | **GRAVADA** | fonte preferida de leitura |
| `nr13_minha_empresa.logo` (dataURL) | **MANTIDA** | idem |
| `nr13_minha_empresa.logoRef` | **GRAVADA** | idem |
| `meta.assinantes[].assinaturaRef` (snapshot NOVO) | **GRAVADA** | — |
| `meta.assinantes[].assinatura` (snapshot NOVO) | **AUSENTE** | é daqui que vem o ganho de 50% |
| Snapshot de relatório ANTIGO | **INTOCADO** | I-16, I-25 |
| PDF já emitido | **INTOCADO** | I-16 |
| Entrada de livro lacrada | **INTOCADA** | I-17 |

**Onde o ganho aparece imediatamente:** no snapshot do relatório novo (~110 KB → ~55 KB),
que é o que cresce com o uso. A chave viva (`nr13_lista_phs`, `nr13_minha_empresa`) é **uma
por organização** — mantê-la duplicada por algumas semanas custa dezenas de KB, uma vez.
Trocar isso pela garantia de rollback é barganha óbvia.

**Ordem de leitura durante a convivência,** em todo consumidor:
`ref` (se presente e resolvível) → `dataURL` → vazio. Nunca o inverso.

#### Encerramento da convivência — condições, prazo e bloqueios

O encerramento (zerar a dataURL viva) **não acontece nesta fase**. É um item da **Fase 10B**,
e só entra se **todas** as condições abaixo forem verdadeiras. Uma só que falhe bloqueia.

| # | Condição | Como verificar |
|---|---|---|
| C1 | **≥ 45 dias corridos** desde o deploy da Fase 7 em produção | data do deploy registrada no relatório da fase |
| C2 | Zero regressão de rubrica/logo relatada no período | canal de suporte + verificação nas contas de maior uso |
| C3 | **Todas** as organizações ativas com ao menos um relatório novo emitido e conferido | métrica da Fase 2: relatórios com `assinaturaRef` no snapshot |
| C4 | **REESCRITA — ver D-25.** `ultima_sync` é por USUÁRIO, não por aparelho, e não prova o que a versão anterior afirmava | ver D-25 |
| C5 | Zero registros de rubrica/logo com `ref` presente mas arquivo **ausente** no bucket | inventário da Fase 10A |
| C6 | Zero registros ainda **sem** `ref` (todos os cadastros já passaram por uma gravação) | métrica da Fase 2 |
| C7 | Backup de `nr13_lista_phs` e `nr13_minha_empresa` de todas as organizações, verificado | backup antes de tocar em legado (constraint global) |
| C8 | Portal do Cliente servindo rubrica corretamente via `portal_arquivo` | teste manual da Fase 0/4 reexecutado |

**Por que 45 dias:** menor que os 90 da retenção de mutações, porque o risco aqui é
diferente — não depende de aparelho voltar do offline com mutação antiga, e sim de todo
consumidor já estar lendo pela `ref`. 45 dias cobrem férias curtas e uso esporádico.

### D-25 — `ultima_sync` é por USUÁRIO; C4 não podia se apoiar nela

**Verificado em 16/08/2026.** `profiles.ultima_sync` é uma coluna única na linha do perfil,
gravada por `sync.registrarSync()` com:

```ts
await supabase.from('profiles').update({ ultima_sync: new Date().toISOString() }).eq('id', uid);
```

`.eq('id', uid)` — **um carimbo por usuário**, sobrescrito por qualquer aparelho daquele
usuário. O cenário que você levantou se confirma: um inspetor com PC no escritório e
notebook em campo tem `ultima_sync` de hoje assim que o PC sincroniza, e o notebook pode
estar há semanas sem abrir. A C4 original concluiria "todos os aparelhos já rodaram o
código novo" com base numa data que **um único** aparelho produziu.

Há `dispositivo` na fila e em `app_storage.dispositivo` (de `sync.idDispositivo()`, um UUID
no `localStorage`), mas ele registra **quem escreveu uma linha**, não **quais aparelhos
existem nem quando cada um abriu o app pela última vez**. Um aparelho que só lê nunca
aparece; um que escreveu há dois meses aparece com a data de dois meses, sem indicar se
voltou desde então.

> **Conclusão: o sistema hoje NÃO consegue provar "todo aparelho ativo já rodou o código
> novo".** Nenhuma condição do plano pode afirmar isso.

#### C4 reescrita

**C4 (nova) — o prazo de convivência é a única garantia disponível, e é assumido como tal:**

| Sub-condição | Verificação |
|---|---|
| C4.1 | ≥ 45 dias corridos desde o deploy da Fase 7 (reforça C1) |
| C4.2 | Nenhuma organização com `profiles.ultima_sync` anterior ao deploy da Fase 7 — **necessária, não suficiente**: prova que a organização está ativa e atualizada, não que todo aparelho dela está |
| C4.3 | Nenhum registro gravado após o deploy vindo de aparelho que **não** conhece `assinaturaRef` — detectável porque um bundle antigo que regrave `nr13_lista_phs` apagaria o campo. **Zero ocorrências** é a evidência mais forte disponível hoje |
| C4.4 | Verificação manual com o dono do projeto: existe aparelho conhecido em uso esporádico (tablet de campo, notebook reserva) que não foi aberto no período? Se sim, **abrir e sincronizar antes**, ou estender o prazo |

**C4.3 é a única evidência técnica real**, e é indireta: ela detecta o dano em vez de
prevê-lo. Aceitável **porque o dano é reversível** — a dataURL ainda está lá durante toda a
convivência, e um registro regravado por bundle antigo é recuperável do backup C7.

**O que NÃO fazer:** criar telemetria por dispositivo só para atender à C4. Seria uma
escrita nova no caminho crítico, para uma decisão que acontece uma vez. O prazo mais o
C4.3 custam nada e entregam garantia suficiente para uma mudança cujo pior caso é
recuperável.

**Se no futuro houver necessidade real de saber o estado por aparelho** — e a Fase 13 pode
criá-la —, o desenho correto é uma tabela `dispositivos (org_id, device_id, ultimo_boot,
versao_bundle)` alimentada no boot. Fica **registrado como possível fase futura**, fora
deste roteiro, e não é pré-requisito de nada aqui.

**Regra que fica valendo:** nenhuma condição deste plano pode declarar uma garantia que os
dados atuais não conseguem provar. Onde a prova não existe, o plano diz que não existe e
usa prazo + reversibilidade no lugar — nunca uma métrica que parece provar e não prova.

**O que bloqueia o encerramento, mesmo com prazo cumprido:**
- qualquer aparelho ativo com bundle anterior à Fase 7 (C4 falha);
- qualquer registro com `ref` órfã (C5) — indicaria arquivo perdido, e zerar a dataURL nesse estado **destruiria** a rubrica;
- qualquer organização sem relatório novo conferido (C3);
- ausência de backup verificado (C7).

**Trava contra o esquecimento** — porque gravação dupla permanente por inércia é o desfecho
provável se ninguém for lembrado:

1. Um item explícito e nomeado na Fase 10B: *"encerrar a gravação dupla da Fase 7"*.
2. Uma linha em `PENDENCIAS.md` na raiz do repo, criada **no mesmo commit** da Fase 7, com a data-alvo (deploy + 45 dias). O CLAUDE.md já estabelece que `PENDENCIAS.md` é a lista viva e que o item é removido ao ser concluído.
3. Um comentário no código, no ponto exato da gravação dupla, apontando para esta seção e para a data-alvo.

**Rollback, nos dois momentos:**

| Momento | Rollback | Perda |
|---|---|---|
| **Antes** do encerramento (durante a convivência) | reverter os commits da Fase 7. O código antigo lê a dataURL, que continua lá | **nenhuma** |
| **Depois** do encerramento (Fase 10B) | restaurar `nr13_lista_phs` e `nr13_minha_empresa` do backup C7. Os arquivos no bucket permanecem — endereçados por conteúdo, nunca sobrescritos | **nenhuma**, se C7 foi cumprido |

O segundo caso é a razão de C7 ser condição bloqueante e não recomendação.

**Por que a imutabilidade continua garantida:** o path **é** o hash do conteúdo. Trocar a
rubrica no cadastro gera um path novo; o arquivo antigo continua existindo, e o relatório
de 2024 continua apontando para o hash de 2024. A imutabilidade deixa de depender de
alguém lembrar de copiar — vira consequência do endereço. É exatamente o argumento que
`livroAssinatura.ts` já registra.

**Risco específico a tratar:** o palco hoje resolve refs de foto e a rubrica do livro. Ao
acrescentar rubrica de funcionário e logo, o orçamento do palco (I-23) muda pouco — as
imagens já estavam lá, agora vêm por outro caminho e **deduplicadas**. O efeito líquido no
palco deve ser **neutro ou positivo**. Medir para confirmar, não assumir.

### Migração
- **Cadastro (dado vivo):** na primeira gravação de funcionário/empresa depois do deploy, a rubrica/logo migra para ref. Opcionalmente, varredura em background reusando o mecanismo da Fase 6.
- **Relatórios já salvos:** **nenhuma migração.** Ficam com a dataURL congelada, para sempre, e o fallback os atende.

### Compatibilidade
Três formatos coexistem permanentemente, e o código lê os três:
1. dataURL na chave viva (legado antes desta fase);
2. dataURL congelada no snapshot de relatório antigo;
3. ref (novo).

### Offline
- Cadastrar rubrica offline → blob no cofre, ref gravada, upload retomado (I-12…I-15).
- Gerar relatório offline com rubrica ainda pendente de upload → o palco resolve pelo **cofre local**, então a folha imprime normalmente. Testar explicitamente.
- Aparelho novo, offline, sem o arquivo no cofre → a folha não tem como mostrar a rubrica. Comportamento: deixar o espaço da assinatura em branco (nunca imagem quebrada) e registrar. Aceitável porque relatório se gera no escritório, online — mas precisa ser **testado e conhecido**, não descoberto em produção.

### Segurança
Pasta `assinaturas` fica fora de `<tag>/` porque a rubrica é da organização, não do ativo —
já é assim para o livro. Mesma policy por organização (I-22).

**DEPENDÊNCIA BLOQUEANTE com a Fase 0 (D-05).** O cliente precisa ver a rubrica do
engenheiro: ela aparece no documento que ele legitimamente recebe. Mas pela D-05 a
autorização é por **vínculo**, não por pasta — logo `portal_arquivo` precisa saber resolver
`meta.assinantes[].assinaturaRef` e `meta.empresa.logoRef` **a partir do relatório** que o
cliente pode ver.

Consequência operacional, e ela é dura: **a Fase 7 não pode ir para produção antes de
`portal_arquivo` resolver esses dois caminhos.** Se for, o relatório abre no Portal sem a
rubrica do engenheiro — documento técnico incompleto na mão do cliente.

Duas formas de garantir, decidir na Fase 0:
- (a) `portal_arquivo` já nasce resolvendo os dois campos, mesmo que eles ainda não existam em nenhum snapshot (código inerte até a Fase 7) — **preferida**, custa pouco e elimina o acoplamento de cronograma;
- (b) atualizar `portal_arquivo` junto com o deploy da Fase 7, o que exige que os dois deploys sejam coordenados.

Registrar a escolha na Fase 0 e a verificação no aceite da Fase 7 (teste manual passo 7:
"Portal do cliente: abrir relatório → rubrica visível").

### Integridade
- Documento já emitido: **intocado** (PDF com hash, I-16).
- Snapshot antigo: **intocado**.
- Entrada de livro lacrada: **intocada** (I-17).
- Rubrica nova: endereçada por conteúdo, imutável por construção (I-18).

### Métricas de baseline
- Tamanho de `nr13_lista_phs` e `nr13_minha_empresa`.
- Tamanho médio de um `nr13_rel_<id>_<TAG>` (hoje ~110 KB).
- Bytes do palco ao montar um relatório.
- Bytes hidratados por boot.

### Métricas esperadas
| Medida | Antes | Depois (critério) |
|---|---|---|
| `nr13_lista_phs` com 3 funcionários | ~60 KB | ~2 KB |
| `nr13_minha_empresa` | ~15 KB | ~1 KB |
| Registro de relatório **novo** | ~110 KB | ~55 KB (**≈ 50% menor**) |
| Bytes do palco por documento | X | ≤ X (neutro ou melhor) |
| Relatórios antigos | — | **inalterados, byte a byte** |

### Testes automatizados
- Mesmo conteúdo → mesmo path (dedupe).
- Conteúdo diferente → path diferente; o antigo continua resolvível.
- Snapshot de relatório novo guarda ref, não dataURL.
- Snapshot antigo (dataURL) continua renderizando — teste com fixture de relatório legado.
- Palco resolve `assinaturaRef` e `logoRef` para os campos que os templates leem.
- **Palco materializa UMA cópia por rubrica distinta**, não uma por uso.
- `palco.varreduraTemplates.test.ts` estendido: todo consumidor de rubrica/logo coberto.
- Relatório emitido antes da fase permanece byte a byte igual.

### Testes manuais
1. Cadastrar rubrica nova → conferir arquivo no bucket com nome de hash.
2. Cadastrar a **mesma** imagem para outro funcionário → conferir que **não** criou arquivo novo.
3. Gerar relatório novo → conferir rubrica e logo nas folhas: capa, prontuário, memorial, conclusão, livro, certificados.
4. Trocar a rubrica no cadastro → gerar relatório novo (rubrica nova) e **reabrir o relatório anterior** (rubrica antiga). As duas corretas.
5. Reabrir relatório emitido antes desta fase → idêntico ao que era.
6. Prontuário: as 6 folhas com a rubrica certa.
7. Portal do cliente: abrir relatório → rubrica visível (valida a integração com a Fase 0).

### Teste de falha
- Sem internet ao cadastrar rubrica → ref gravada, upload pendente, folha imprime pelo cofre.
- Upload da rubrica falha → registro mantém a dataURL (mesmo fallback da Fase 6), e a Fase 6 a recupera depois.
- Arquivo de rubrica removido do bucket por engano → folha em branco, sem imagem quebrada, com log.
- Aparelho novo offline sem o arquivo no cofre → comportamento conhecido e testado (acima).

### Critério de aceite
- [ ] Registro de relatório novo **≈ 50% menor**, medido.
- [ ] Relatório emitido antes da fase permanece byte a byte igual.
- [ ] Mesma rubrica em dois funcionários → um arquivo só.
- [ ] Trocar rubrica não altera nenhum documento anterior (passo 4).
- [ ] Todas as folhas do inventário renderizam a rubrica/logo.
- [ ] Portal do cliente exibe a rubrica.
- [ ] Bytes do palco não pioram.
- [ ] Suíte verde, build limpo.

### Rollback
Reverter os commits. **Não há perda**, porque a gravação dupla da D-11 mantém a dataURL viva
intacta durante toda a convivência: o código antigo volta a lê-la e as folhas imprimem
normalmente.

Relatórios emitidos durante a vigência da Fase 7 ficam com snapshot contendo `assinaturaRef`
e sem dataURL. Após o rollback, o código antigo não conhece `assinaturaRef` — mas ele já tem
fallback para o dado vivo (`nr13_assinantes_rel_<TAG>` + `nr13_lista_phs`), que continua com
a dataURL. Consequência a registrar e testar: **um relatório emitido durante a Fase 7 e
reaberto após o rollback exibiria a rubrica ATUAL, não a congelada.** Isso é uma regressão
temporária de imutabilidade, não perda de dado, e desaparece quando a fase for reaplicada —
o `assinaturaRef` continua gravado no snapshot.

Esse é o custo real do rollback desta fase, e ele precisa estar escrito antes de alguém
descobri-lo sob pressão. Mitigação: a janela de exposição é curta (o rollback aconteceria
dias após o deploy, não meses) e o `assinaturaRef` nunca é apagado, então a imutabilidade é
recuperada integralmente ao reaplicar.

Rollback **depois** do encerramento da gravação dupla: ver a tabela da D-11 — depende do
backup C7, que é condição bloqueante justamente por isso.

### Risco
**Médio.** Mexe no que documento assinado imprime. Mitigado por: inventário de consumidores
virando teste, fallback permanente, nenhuma migração de documento emitido, e gravação dupla
durante a convivência.

### Commit
1. `feat(assinatura): rubrica e logo endereçadas por conteúdo (gravação dupla)`
2. `feat(palco): resolver assinaturaRef e logoRef com dedupe por caminho`
3. `feat(relatorio): snapshot novo congela referência em vez de imagem`
**PARAR — PORTÃO P4.**

---

# FASE 8 — Massa de escala e baseline automático

### Objetivo
Poder medir. Criar organização sintética, isolada, determinística e limpável, com massa em
quatro tamanhos, e um roteiro de baseline repetível.

### Achados envolvidos
A-17. Habilita as Fases 9, 11 e 13.

### Por que esta fase vem agora
Depois da Fase 2 (para as métricas terem onde aparecer) e **antes** da Fase 9 — porque
virtualizar lista sem massa é otimizar no escuro. Também antes da 11, porque o piloto de
PDF precisa de relatório grande sem tocar em documento real.

### Escopo exato
- **Novo:** `scripts/massa-escala/` — gerador em Node, fora do bundle do app.
- Referência de formato: `src/services/demoSeed.ts` (já cria TAGs `DEMO-*`).
- **Novo:** `docs/medicoes/roteiro-baseline.md` — o protocolo de medição.
- Opcional: `scripts/baseline/` — coleta automatizada onde for possível.

### O que NÃO será mexido
Nenhum código de produção. Esta fase **acrescenta ferramenta**, não altera o sistema. É a
fase de menor risco do roteiro.

### D-20 — dois perfis de massa, e o segundo é calibrado com dado real

Um único perfil com PDF sintético pequeno testaria estrutura e **mentiria** sobre Storage,
egress e teste de carga: 1.000 relatórios de 50 KB dizem que a organização ocupa 50 MB
quando na realidade ocupa vários GB. Capacidade medida sobre arquivo artificialmente pequeno
é capacidade falsa.

| | **Perfil ESTRUTURAL** | **Perfil REALISTA** |
|---|---|---|
| Arquivos | sintéticos, mínimos (PDF de ~20 KB, JPEG de ~5 KB) | tamanhos reais, medidos |
| Serve para | DOM, IndexedDB, hidratação, filtros, busca, histórico, vencimentos, CPU, listas | Storage, egress, abertura de PDF, teste de carga, projeção de custo |
| Escalas | 100 / 500 / 1.000 / 5.000 equipamentos | menor em contagem, realista em bytes |
| Calibração | fixa | **derivada das Fases 2, 5 e 12** |
| Fases que o usam | 9 (listas), 11 (tempo/memória de geração) | 11 (fixture da D-19), 13 (carga) |

**Por que o estrutural também é necessário:** gerar 5.000 equipamentos com fotos reais
custaria dezenas de GB de bucket e horas de upload, para medir uma coisa — tempo de render
de lista — que não depende do tamanho do arquivo. Cada perfil mede o que o outro não mede.

#### Calibração do perfil realista

Os valores **não são inventados**. Cada um vem de uma medição já feita:

| Parâmetro | Origem | Quando fica disponível |
|---|---|---|
| Tamanho médio da foto principal | Fase 2 (`admin_storage_stats`) | já disponível quando a Fase 8 rodar |
| Tamanho médio da thumbnail | Fase 5, medido após o deploy | idem |
| Fotos por inspeção (típico e p95) | Fase 2, contagem em contas reais | idem |
| Relatórios por equipamento (típico e p95) | Fase 2 | idem |
| **Tamanho médio do PDF — geração ATUAL** | Fase 2 | disponível já |
| **Tamanho médio do PDF — geração NOVA** | **Fase 12** | **só depois da Fase 12** |

**Consequência de cronograma, e ela é importante:** o perfil realista roda em **duas
calibrações**.

- **Calibração 1 (na Fase 8):** usa o tamanho de PDF da geração atual. É o que alimenta a fixture do relatório de referência da D-19 e a comparação do piloto.
- **Calibração 2 (após a Fase 12):** recalibrada com o tamanho da geração nova. É esta que alimenta o teste de carga da Fase 13.

O gerador precisa aceitar os tamanhos como **parâmetro**, não embuti-los. Registrar a
calibração usada em toda rodada — sem isso, dois resultados de carga não são comparáveis.

### Arquitetura
```
scripts/massa-escala/gerar.ts
  --org <uuid-da-org-de-teste>     ← OBRIGATÓRIO, sem default
  --perfil estrutural|realista     ← OBRIGATÓRIO, sem default (D-20)
  --equipamentos 100|500|1000|5000
  --inspecoes-por-equipamento N
  --relatorios-por-equipamento N
  --fotos-por-inspecao N
  --kb-foto N                      ← perfil realista: vem da medição da Fase 2/5
  --kb-thumb N                     ← idem
  --kb-pdf N                       ← idem; recalibrado após a Fase 12
  --calibracao <rotulo>            ← ex.: "2026-09-atual" / "2026-12-vetorial"
  --seed <int>                     ← determinismo
  --confirmar-org-de-teste         ← trava dupla

Gera TAGs com prefixo fixo: ESCALA-<seed>-<n>
Gera fotos sintéticas (canvas/sharp) no tamanho pedido, nunca copia foto real
Gera PDFs sintéticos no tamanho pedido (preenchimento incompressível, para que
  o tamanho no bucket seja o pedido e não o de um PDF vazio comprimido)
Grava a calibração usada junto com a massa, para o resultado ser rastreável

scripts/massa-escala/limpar.ts
  --org <uuid>  --seed <int>  --confirmar
  Remove SOMENTE chaves com o prefixo ESCALA-<seed>- e os arquivos do bucket dessas TAGs
```

**Travas de segurança — a parte mais importante desta fase.** Já houve caso de relatório de
teste gerando entrada imutável em livro real. As travas:
1. `--org` obrigatório, sem valor padrão. Nunca "a org logada".
2. Verificação de que a org tem marca de teste (ex.: campo em `profiles` ou nome com prefixo acordado). Se não tiver, **aborta**.
3. Prefixo `ESCALA-` em toda TAG, para que qualquer varredura reconheça.
4. `--confirmar-org-de-teste` explícito.
5. **Recusar rodar contra a URL de produção sem uma variável de ambiente adicional** — e, mesmo assim, só em org marcada como teste.
6. O gerador **nunca** grava entrada de livro. Livro tem trava de imutabilidade no banco (I-17); massa sintética em livro real seria irreversível. Se o teste precisar de livro, usar org de teste dedicada e assumir que ela é descartável.

**Determinismo:** seed fixa → mesma massa. Repetir a medição depois de uma mudança compara
maçã com maçã.

### Migração
Nenhuma.

### Compatibilidade
Nenhum impacto no sistema.

### Offline
Não se aplica ao gerador. Mas o **roteiro de baseline** inclui cenários offline (boot sem
rede com massa grande).

### Segurança
- Roda com credencial de usuário normal da org de teste, **não** com `service_role`.
- Nunca toca em org que não seja explicitamente informada e marcada.
- Massa é claramente identificável para poder ser removida por inteiro.

### Integridade
O gerador não cria entrada de livro nem PDF com hash real de documento válido — os PDFs
sintéticos são identificáveis como tal.

### Métricas de baseline (é a fase que as define)
Roteiro `docs/medicoes/roteiro-baseline.md`, com procedimento exato para cada medida:

| Medida | Como | Cenários |
|---|---|---|
| Primeiro boot (hidratação completa) | Performance panel, do login à lista pronta | 100/500/1.000 |
| Boot incremental, nada mudou | idem, 2ª abertura | 100/500/1.000 |
| Boot incremental, poucas mudanças | idem, após alterar 5 chaves | 100/500/1.000 |
| Bytes transferidos por boot | Network, filtro Supabase | idem |
| Nº de requests por boot | Network | idem |
| Memória do navegador | Memory → heap snapshot | idem |
| Tamanho do IndexedDB | Application → Storage | idem |
| Tempo de render de `/equipamentos` | Performance | 100/500/1.000/5.000 |
| Tempo de render do Dashboard | idem | idem |
| Tempo de `listarVencimentos()` | `performance.mark` | idem |
| Tempo de abertura do histórico | Performance | 10/50/200 relatórios |
| Montagem do palco | `performance.mark` no `usePalcoDocumento` | doc pequeno/grande |
| Geração de PDF | tempo total + pico de memória | 5/15/30 folhas |
| Consultas do banco | `EXPLAIN ANALYZE` (Fase 1) | pequena/grande |

Registrar toda rodada em `docs/medicoes/AAAA-MM-DD-<fase>.md`. **Sem isso, "antes/depois"
das fases seguintes é opinião.**

### Métricas esperadas
Esta fase não melhora número nenhum. O aceite é a **existência e repetibilidade** da
ferramenta.

### Testes automatizados
- Determinismo: mesma seed → mesmas TAGs e mesmos conteúdos.
- Todas as TAGs geradas têm o prefixo `ESCALA-<seed>-`.
- `limpar.ts` remove **exatamente** as chaves da seed e nada mais — teste com massa de duas seeds coexistindo.
- Gerador aborta sem `--org`.
- Gerador aborta se a org não estiver marcada como teste.
- Gerador nunca produz chave `nr13_livro_`.

### Testes manuais
1. Gerar 100 equipamentos em org de teste → conferir no app.
2. Rodar o roteiro de baseline inteiro e salvar o resultado.
3. Limpar → conferir que a org voltou a zero e o bucket não tem sobra da seed.
4. Gerar 500, medir, limpar. Depois 1.000, medir, limpar.
5. Tentar rodar sem `--org` → deve recusar.
6. Tentar rodar contra org **não** marcada como teste → deve recusar.

### Teste de falha
- Interromper o gerador no meio → massa parcial, e `limpar.ts` remove o parcial completamente.
- Rede caindo durante a geração → itens pendentes na fila; retomar ou limpar.

### Critério de aceite
- [ ] Gerar e limpar 100, 500 e 1.000 no perfil **estrutural**, com verificação de que nada sobrou.
- [ ] Gerar e limpar uma massa no perfil **realista**, calibração 1, com tamanhos vindos da Fase 2/5 (não inventados).
- [ ] Fixture do relatório de referência da D-19 gerada e versionada.
- [ ] Determinismo provado por teste, nos dois perfis.
- [ ] `--perfil` obrigatório; recusa sem ele.
- [ ] As duas recusas de segurança (sem `--org`, org não marcada) funcionam.
- [ ] Tamanho real dos arquivos no bucket confere com o pedido (±10%) — prova de que o preenchimento é incompressível.
- [ ] Calibração registrada junto com a massa.
- [ ] Roteiro de baseline executado ponta a ponta, resultado salvo em `docs/medicoes/`.
- [ ] Nenhuma linha de código de produção alterada nesta fase.

### Rollback
Remover `scripts/massa-escala/`. Não há efeito no sistema. A massa gerada sai por
`limpar.ts`.

### Risco
**Baixo** para o sistema (nenhuma mudança de produção). **Médio operacional** — um gerador
apontado para a org errada é um estrago real. Daí as seis travas.

### Commit
1. `chore(escala): gerador determinístico de massa com travas de organização`
2. `chore(escala): script de limpeza por seed`
3. `docs(medicoes): roteiro de baseline`
**PARAR.**

---

# FASE 9 — Listas grandes

### Objetivo
Fazer as telas de lista continuarem instantâneas com 1.000+ itens, **sem** introduzir
paginação de servidor onde ela não é necessária.

### Achados envolvidos
A-07.

### Por que esta fase vem agora
Depois da Fase 8, que dá a massa. Sem ela não há critério de aceite mensurável.

### Escopo exato
- `src/pages/Equipamentos.tsx` — virtualização da lista.
- `src/services/vencimentos.ts` — memoização de `listarVencimentos()`.
- `src/pages/Dashboard.tsx`, `src/pages/Vencimentos.tsx` — consumidores.
- Avaliar (medir antes de mexer): `LivroRegistro.tsx`, `Calibracoes.tsx`, histórico em `Relatorios.tsx`.
- Testes: `vencimentos.test.ts` (estender).

### O que NÃO será mexido
- **Não haverá paginação de servidor.** Decisão técnica registrada: os dados já estão inteiros no `Map` em memória depois da hidratação (I-08, I-11). Paginar no servidor obrigaria a ir à rede para dados que o aparelho já tem, quebraria o funcionamento offline, e é exatamente a otimização que você pediu para não fazer por reflexo.
- Busca e filtro continuam no cliente — pelo mesmo motivo, e porque funcionam offline.
- A hidratação e o cache.

### Arquitetura antes
```
listarEquipamentos()  →  await lerTudo()  →  resumo de TODOS
Equipamentos.tsx      →  renderiza 1 card por item, sem virtualização
listarVencimentos()   →  varre nr13_info_, e para CADA um:
                           listarIndice(tag)  +  ler(nr13_calibracoes_<tag>)
                         recalculado a cada evento 'focus' da janela
```

### Arquitetura depois
```
Equipamentos.tsx  →  lista virtualizada: só as linhas visíveis (+ margem) no DOM
                     filtro e busca continuam sobre o array completo em memória

listarVencimentos()  →  memo por IDENTIDADE DE VALOR, usando lerCru()
                        (na v2 o Map devolve a MESMA instância de string enquanto o
                         valor não muda → comparação O(1))
                     →  recalcula só o que mudou
```

**Por que `lerCru` é a chave:** `storage.lerCru()` existe exatamente para isso e já é usada
pelo cache do histórico legado. A identidade da string é o critério de invalidação correto —
memo por sessão ou por evento mostraria dado da organização anterior depois de trocar de
conta, defeito que o comentário do próprio `historicoRelatorios.ts` documenta.

**Escolha da biblioteca de virtualização:** avaliar na fase. Preferência por implementação
própria mínima (janela + `IntersectionObserver`, que o projeto já usa em `FotoImg`) antes de
adicionar dependência. O projeto tem histórico deliberado de evitar dependências (sprite SVG
próprio em vez de lucide, xlsx pelo CDN). Decidir medindo, não por reflexo.

**Interação com `FotoImg` (I-21):** a virtualização remove nós do DOM. O `IntersectionObserver`
do `FotoImg` precisa continuar funcionando — e a rede de segurança de 1,2 s dele precisa ser
reavaliada, porque numa lista virtualizada um card fora da janela pode ser montado e
desmontado antes do prazo. Testar explicitamente que rolar rápido não dispara download de
foto que nunca apareceu.

### Migração
Nenhuma.

### Compatibilidade
Nenhuma mudança de dado ou de contrato.

### Offline
Sem regressão — e é justamente por isso que a paginação de servidor foi descartada. Testar
as listas grandes com a rede desligada.

### Segurança
Nenhum impacto.

### Integridade
Nenhum impacto.

### Métricas de baseline
Com a massa da Fase 8, para 100 / 500 / 1.000 / 5.000:
- nº de nós no DOM;
- memória (heap);
- tempo até a lista pintar;
- tempo de aplicar um filtro;
- tempo de digitar na busca (por tecla);
- tempo de `listarVencimentos()`;
- tempo de recálculo ao voltar o foco da janela.

### Métricas esperadas
| Medida | Antes (1.000 itens) | Depois (critério) |
|---|---|---|
| Nós no DOM | ~1.000 cards | **constante** (~itens visíveis + margem) |
| Tempo até pintar | cresce linearmente | **< 300 ms**, quase constante |
| Filtro/busca | cresce | **< 100 ms** |
| `listarVencimentos()` no 2º cálculo | igual ao 1º | **< 10%** do 1º (memo) |
| Memória | cresce linearmente | crescimento bem menor |
| 5.000 itens | provavelmente inviável | utilizável |

### Testes automatizados
- Memo de vencimentos: sem mudança de valor → não recalcula. Com mudança → recalcula só o afetado.
- Memo invalida ao trocar de organização (teste explícito — é a regressão perigosa).
- Filtro e busca dão o mesmo resultado com e sem virtualização.
- Ordenação preservada.

### Testes manuais
1. Com 1.000 equipamentos: abrir `/equipamentos`, rolar até o fim, filtrar, buscar, limpar filtro.
2. Contar nós no DOM (DevTools → Elements) no topo e no fim da rolagem.
3. Dashboard e `/vencimentos` com a mesma massa.
4. Rolagem rápida: conferir que fotos fora da janela não são baixadas (Network).
5. Repetir tudo offline.
6. Com 5.000: confirmar que ainda é utilizável.

### Teste de falha
- Rolagem muito rápida → sem card em branco permanente.
- Redimensionar a janela durante a rolagem → janela virtual se recompõe.
- Foco/desfoco repetido da janela → memo não dispara recálculo desnecessário.
- Offline com massa grande → tudo funciona (dados vêm do Map).

### Critério de aceite
- [ ] Nós no DOM constantes independentemente do total.
- [ ] `/equipamentos` com 1.000: pinta em < 300 ms; filtro < 100 ms.
- [ ] 2º cálculo de vencimentos < 10% do 1º.
- [ ] Memo invalida ao trocar de organização.
- [ ] Fotos fora da janela não baixadas.
- [ ] Tudo funciona offline.
- [ ] 5.000 itens utilizável.
- [ ] Suíte verde, build limpo.

### Rollback
Reverter os commits. Puramente de UI, sem dado envolvido, rollback imediato.

### Risco
**Baixo.** Nenhuma mudança de dado, de rede ou de contrato.

### Commit
1. `perf(vencimentos): memoizar por identidade de valor`
2. `perf(equipamentos): virtualizar a lista`
**PARAR.**

---

# FASE 10A — Higiene: auditoria READ-ONLY

> **Esta fase NÃO APAGA NADA.** Nenhuma linha, nenhum arquivo, nenhuma chave. É a fase de
> observação que produz os números com que a 10B será decidida. Qualquer passo que remova
> dado pertence à 10B — se aparecer aqui, foi erro de escopo.

### Objetivo
Medir e classificar as três fontes de crescimento estrutural, e avaliar se a convivência da
Fase 7 já pode ser encerrada. Produzir o relatório que autoriza (ou bloqueia) a 10B.

### Achados envolvidos
A-15 (medição), A-06 (inventário), A-13 (conferência), e a avaliação das condições C1–C8 da
D-11 (Fase 7).

### Por que esta fase vem agora
Depois da Fase 2 (que dá as métricas) e da Fase 8 (que dá massa para exercitar o inventário
sem risco). Antes das fases de PDF, para que o inventário já exista quando a Fase 12 começar
a gerar PDFs em formato novo — senão os arquivos das duas gerações se misturam sem baseline.

### Escopo exato
- **A-06:** nova Edge `supabase/functions/inventario_arquivos/` — **read-only**, sem nenhum caminho de escrita.
- **A-06:** `src/pages/Admin.tsx` — tela do inventário.
- **A-15:** consulta de medição de `app_storage_mutacoes` (contagem, bytes, distribuição por idade). **Só `select`.**
- **A-13:** relatório de conferência da migração do histórico, por organização. **Só `select`.**
- **D-11:** verificação automatizada das condições C1–C8.

### O que NÃO será mexido
- **Nada é removido.** Nem mutação, nem arquivo, nem chave de legado, nem dataURL de rubrica.
- **`app_storage_excluidos` não é sequer candidata a poda** — é estrutural: é ela que torna o piso de versão permanente e dispensa qualquer regra baseada em data do cliente (I-06). Confundir as duas tabelas é o erro que esta divisão de fases existe para tornar impossível.
- Nenhum código de caminho de dado do usuário.

### A-06 — Inventário de órfãos

```
Edge inventario_arquivos (service_role, guarda role='admin'):
  1. lista storage.objects do bucket 'inspecao'
  2. lista as referências existentes em app_storage:
       nr13_fotos_*[].ref.path
       nr13_docs_* → refs das fotos de campo
       nr13_rastreab_*.pdfRef.path
       nr13_rel_*.pdfRef.path
       nr13_componentes_cal_*[].fotoRef.path
       nr13_pront_fab_*.pdfRef.path
       nr13_livro_*[].assinaturaRef.path
       nr13_lista_phs[].assinaturaRef.path        ← após a Fase 7
       nr13_minha_empresa.logoRef.path            ← após a Fase 7
       meta.assinantes[].assinaturaRef.path       ← dentro de nr13_rel_*
       meta.empresa.logoRef.path                  ← dentro de nr13_rel_*
       *.thumbPath                                ← após a Fase 5
  3. cruza e classifica cada arquivo
  4. devolve: path, tamanho, idade, organização, origem provável (pela pasta), status
```

**Classificação, e a terceira categoria é a que protege:**

| Status | Significado | Ação futura permitida |
|---|---|---|
| `REFERENCIADO` | alguma chave aponta para ele | nunca remover |
| `ÓRFÃO APARENTE` | nenhuma referência encontrada | candidato, com retenção, na 10B ou depois |
| `ÓRFÃO PROTEGIDO` | está em `<org>/relatorios/` | **jamais remover**, mesmo sem referência |

**Por que `<org>/relatorios/` é intocável:** todo arquivo ali é PDF de relatório emitido.
Parecer órfão não prova que é — pode ser o artefato de um relatório que ainda só existe no
aparelho de alguém e não sincronizou (I-12, I-14). Remover seria destruir um documento
técnico assinado, e a Fase 12 vai acrescentar PDFs em formato novo nessa mesma pasta.

**Regra dura da Edge:** ela **não pode conter** `delete`, `update`, `remove` ou `upsert`.
Um teste estático verifica isso no fonte — não é comentário, é asserção.

**Fontes conhecidas de órfão** (a tela deve explicar cada uma): exclusão de equipamento
(`excluirVaso` não toca no bucket), exclusão de relatório (o PDF fica), `removerFoto` com
falha engolida, thumbs de fotos revertidas (Fase 5), thumb gravado sem `thumbPath` no
registro (D-18).

### A-15 — Medição das mutações (sem retenção ainda)

Levantar, por organização: total de linhas, bytes, linha mais antiga, e a distribuição por
faixa de idade (0–30, 31–60, 61–90, 91–180, >180 dias). Sem esses números não há como
afirmar que a janela de 90 dias é adequada — a análise da 10B depende deste levantamento.

### A-13 — Conferência do legado

Por organização: entradas em `nr13_historico_relatorios`; registros `nr13_rel_%`; **ids no
legado sem registro correspondente** (tem que ser zero); bytes ocupados pelo legado; data
da última sincronização de cada aparelho da organização.

### D-11 — Avaliação da convivência da Fase 7

Verificar e registrar cada uma das condições C1–C8 da D-11, com valor medido. O relatório
diz explicitamente: **"convivência pode ser encerrada"** ou **"bloqueada por Cx"**.

### Migração / Compatibilidade / Offline / Integridade
Nenhuma migração. Nenhum impacto em compatibilidade, offline ou integridade — é leitura.

### Segurança
Guarda `role='admin'` na Edge, como nas funções da Fase 2. A Edge usa `service_role` (é
obrigatório para listar o bucket) e por isso **jamais** pode ser chamada sem a guarda. Ela
devolve metadados de arquivo (path, tamanho, data), nunca conteúdo. `service_role` só na
Edge, nunca no bundle.

### Métricas de baseline
É a fase que os produz. Registrar em `docs/medicoes/AAAA-MM-DD-fase10a.md`.

### Métricas esperadas
| Medida | Antes | Depois |
|---|---|---|
| Órfãos do bucket | desconhecidos | **quantificados e classificados** |
| Bytes em órfãos aparentes | desconhecidos | conhecidos |
| `app_storage_mutacoes` | crescimento desconhecido | linhas, bytes e distribuição por idade |
| Divergências de migração do histórico | desconhecidas | **zero, provado** (ou listadas) |
| Convivência da Fase 7 | indefinida | **liberada ou bloqueada, com o motivo** |

### Testes automatizados
- Classificação correta de referenciado / órfão aparente / órfão protegido, com fixtures.
- Todo path em `<org>/relatorios/` sai como `ÓRFÃO PROTEGIDO`, nunca como aparente.
- **A Edge não tem nenhum caminho de escrita** — teste estático sobre o fonte.
- Conferência de migração detecta divergência quando ela existe (fixture com divergência).
- Avaliação C1–C8 devolve "bloqueada" quando qualquer condição falha.

### Testes manuais
1. Rodar o inventário na organização de teste com massa (Fase 8) → conferir os três status.
2. Excluir um equipamento de teste → rodar de novo → suas fotos aparecem como órfãs aparentes.
3. Conferir que os PDFs de `relatorios/` aparecem como protegidos.
4. Rodar a conferência de migração em **todas** as organizações reais — **read-only** — e registrar.
5. Rodar a avaliação C1–C8 e registrar o veredito.

### Teste de falha
- Bucket muito grande → paginação, sem timeout.
- Organização sem arquivos → zero, sem erro.
- Chave com JSON inválido → ignorada, sem derrubar o inventário.
- Referência apontando para arquivo inexistente → aparece como **referência órfã** (o inverso do arquivo órfão), que é o sinal de C5 da D-11.

### Critério de aceite
- [ ] Inventário funcionando, com os três status corretos.
- [ ] Teste estático provando ausência de caminho de escrita na Edge.
- [ ] Medição das mutações com distribuição por idade registrada.
- [ ] Conferência de migração executada em todas as organizações, com **zero divergências** (ou a lista das que houver).
- [ ] Veredito C1–C8 registrado.
- [ ] **Nada removido** — conferido por comparação de contagens antes/depois no banco e no bucket.
- [ ] Suíte verde, build limpo.

### Rollback
Remover a Edge e a tela. Zero impacto — nada foi alterado.

### Risco
**Baixo.** Nenhuma escrita em lugar nenhum.

### Commit
1. `feat(admin): inventário read-only de arquivos do bucket`
2. `feat(admin): medição de mutações e conferência do legado`
**PARAR — PORTÃO P5.** A Fase 10B não começa sem sua aprovação dos números desta fase.

---

# FASE 10B — Retenção e retirada controlada de legado

> **Esta é a única fase do roteiro que remove dados.** Só existe depois do portão P5, com
> os números da 10A na mão e com sua autorização explícita para cada item — os três itens
> abaixo são independentes e podem ser aprovados separadamente ou recusados.

### Objetivo
Executar as remoções que a 10A provou seguras, uma a uma, cada uma com backup e critério
próprio.

### Achados envolvidos
A-15 (retenção), A-13 (legado), e o encerramento da D-11 (Fase 7).

### Por que esta fase vem agora
Porque a 10A já mediu. Nenhum dos itens abaixo pode ser decidido sem esses números — e
misturar a medição com a remoção foi exatamente o defeito da versão anterior deste plano.

### Escopo exato — três itens INDEPENDENTES
- **10B-1:** `supabase/retencao_mutacoes.sql` — retenção em `app_storage_mutacoes`.
- **10B-2:** encerrar a gravação dupla da Fase 7 (zerar a dataURL viva, manter a ref).
- **10B-3:** deixar de hidratar `nr13_historico_relatorios`.

Cada item tem seu próprio critério, seu próprio backup e seu próprio commit. Aprovar um não
aprova os outros.

### O que NÃO será mexido
- **`app_storage_excluidos`** — nunca, em nenhuma circunstância desta fase.
- **Nenhum arquivo do bucket.** A remoção de órfãos **não** entra na 10B: exige retenção, auditoria e revisão prévia da lista, e é candidata a fase futura própria. A 10A só inventaria; ninguém apaga arquivo neste roteiro.
- Nenhum relatório, PDF ou entrada de livro.

### 10B-1 — Retenção de mutações

**Antes:** `app_storage_mutacoes` guarda uma linha por mutação aplicada, para sempre — uma
linha por escrita, indefinidamente, crescendo mais rápido que os próprios dados.

**Depois:** job de retenção removendo linhas mais antigas que a janela.

**Escolha da janela:**

| Janela | A favor | Contra |
|---|---|---|
| 30 dias | Menor tabela | Curta demais: inspetor fica semanas em campo, e há aparelho parado meses |
| 60 dias | Meio-termo | Sem folga confortável para férias + campo |
| **90 dias** | **Cobre férias, campo prolongado e aparelho esquecido; tabela 4× menor que hoje ao fim de um ano** | Maior que as alternativas |
| 180 dias | Muito seguro | Ganho pequeno frente a 90 |

**Recomendação: 90 dias**, com a justificativa registrada no SQL — e **revisada contra a
distribuição por idade medida na 10A**. Se a 10A mostrar mutações legítimas com mais de 90
dias, a janela sobe; o número não é dogma, é hipótese a confirmar com dado.

**Análise do pior caso, que é o que torna a janela aceitável:** uma janela curta faria um
`mutationId` já expirado ser reenviado por um aparelho que voltou do offline. A RPC não
reconheceria o id e **reaplicaria** a mutação. Reaplicar um `set` com o mesmo valor é
inofensivo; reaplicar depois de o valor ter mudado no servidor cai na detecção de conflito
por versão (I-04), que preserva as duas versões (I-05). Ou seja: mesmo no pior caso a
idempotência degrada para "conflito detectado", **nunca** para "dado perdido".

**Backup obrigatório** da tabela antes da primeira execução.

**Teste obrigatório:** aparelho com mutação pendente de 100 dias (data manipulada em
ambiente de teste) volta online depois da retenção → nada se perde; pior desfecho é
conflito detectado com as duas versões preservadas.

### 10B-2 — Encerrar a gravação dupla da Fase 7

**Pré-requisito:** o veredito C1–C8 da 10A precisa dizer "pode ser encerrada". Uma condição
falha bloqueia — sem exceção e sem "quase".

Ação: parar de gravar `assinatura`/`logo` em dataURL no dado vivo; zerar as existentes.
A `ref` permanece. Os arquivos no bucket permanecem — são endereçados por conteúdo e nunca
sobrescritos (I-18).

**Backup obrigatório** de `nr13_lista_phs` e `nr13_minha_empresa` de todas as organizações,
verificado, antes de zerar (condição C7).

Ao concluir: remover a linha correspondente de `PENDENCIAS.md` e o comentário-lembrete no
código, conforme a trava contra esquecimento da D-11.

### 10B-3 — Deixar de hidratar o legado do histórico

**Critérios, todos simultaneamente:**
1. zero divergências em **todas** as organizações (medido na 10A);
2. ≥ 60 dias desde a migração de 14/08/2026 — ou seja, a partir de meados de outubro de 2026;
3. `profiles.ultima_sync` de todo **usuário** ativo posterior ao deploy da migração — com a mesma ressalva da D-25: isso é evidência por usuário, não por aparelho, e por isso o critério 2 (prazo) é o que de fato sustenta a decisão. O legado, além disso, **continua no banco** mesmo depois deste passo: um aparelho atrasado que volte segue lendo-o normalmente;
4. backup da tabela feito e verificado.

**Remover a chave é passo separado e posterior:** os quatro critérios acima **mais** 30 dias
sem hidratar e sem nenhuma reclamação de relatório faltando. `WHERE` explícito por `org_id`
**e** `chave`, uma organização por vez, nunca em massa. Exige autorização sua específica,
distinta da autorização para parar de hidratar.

**Nada é apagado apenas para economizar alguns KB.**

### Migração
As três são operações de manutenção, não migrações de dado do usuário.

### Compatibilidade
- 10B-1: nenhuma. Ver a análise do pior caso.
- 10B-2: o código já lê pela `ref` desde a Fase 7; a dataURL era só rede de segurança.
- 10B-3: o legado continua **existindo** no banco; apenas deixa de ser hidratado. Aparelho com bundle antigo continua lendo-o normalmente.

### Offline
- 10B-1: testado pelo cenário do aparelho de 100 dias.
- 10B-2: rubrica e logo já vêm do cofre local (I-12); sem regressão.
- 10B-3: o histórico já vem do índice por TAG desde 14/08 (I-19).

### Segurança
Nenhum impacto em RLS. Toda remoção com `WHERE` delimitado por `org_id`.

### Integridade
- Nenhum documento emitido é tocado.
- Nenhum PDF é regerado.
- Nenhuma entrada de livro é alterada.
- `app_storage_excluidos` intocada, preservando o piso de versão (I-06).

### Métricas de baseline
Os números da 10A. Esta fase não mede — ela age sobre o que já foi medido.

### Métricas esperadas
| Medida | Antes | Depois |
|---|---|---|
| `app_storage_mutacoes` | cresce sem teto | limitada à janela aprovada |
| dataURL de rubrica/logo no dado vivo | presente | ausente (ref permanece) |
| Bytes hidratados por boot | inclui o legado | reduzido |
| Documentos perdidos | 0 | **0** |

### Testes automatizados
- Retenção remove só o que passou da janela; nada mais recente.
- Retenção **nunca** toca `app_storage_excluidos` — teste explícito.
- Após 10B-2, todo consumidor de rubrica/logo continua funcionando pela ref.
- Após 10B-3, `listarIndice` e `carregarRelatorio` continuam devolvendo tudo.

### Testes manuais
1. Backup de cada alvo, verificado por restauração em ambiente de teste **antes** de executar.
2. 10B-1 em org de teste com massa: contagens antes/depois; cenário do aparelho de 100 dias.
3. 10B-2 em org de teste: gerar relatório, abrir prontuário, abrir livro, abrir no Portal — rubrica e logo em todos.
4. 10B-3 em org de teste: histórico completo, Dashboard e vencimentos corretos.

### Teste de falha
- Retenção interrompida no meio → parcial seguro, idempotente na próxima.
- Restauração do backup testada **antes** de qualquer remoção — backup não verificado é backup inexistente.
- Aparelho com bundle antigo após 10B-2 → cai no fallback do dado vivo; testar o que ele exibe.
- Aparelho com bundle antigo após 10B-3 → continua lendo o legado, que segue no banco.

### Critério de aceite
- [ ] Cada item aprovado por você **separadamente**.
- [ ] Backup verificado por restauração antes de cada remoção.
- [ ] Janela de retenção revisada contra a distribuição medida na 10A.
- [ ] Teste do aparelho de 100 dias passa sem perda.
- [ ] `app_storage_excluidos` intocada, provado por contagem antes/depois.
- [ ] 10B-2 só executado com veredito C1–C8 favorável.
- [ ] 10B-3 só executado com os 4 critérios atendidos.
- [ ] **Nenhum arquivo do bucket removido.**
- [ ] `PENDENCIAS.md` atualizado após 10B-2.
- [ ] Suíte verde, build limpo.

### Rollback
| Item | Rollback | Perda |
|---|---|---|
| 10B-1 | parar o job; restaurar do backup | linhas antigas voltam; pior caso sem backup é conflito detectado, nunca perda |
| 10B-2 | restaurar `nr13_lista_phs` e `nr13_minha_empresa` do backup | nenhuma, com C7 cumprido |
| 10B-3 | voltar a hidratar (uma linha de código); a chave nunca saiu do banco | nenhuma |

### Risco
**Médio.** É a única fase que remove dado. Mitigado por: medição prévia obrigatória (10A),
backup verificado por restauração, três itens independentes, análise escrita do pior caso
de cada um, e nenhum arquivo de bucket tocado.

### Commit
Um por item, deployados separadamente, com **PARAR** entre eles:
1. `chore(banco): retenção em app_storage_mutacoes`
2. `chore(assinatura): encerrar a gravação dupla da Fase 7`
3. `chore(historico): deixar de hidratar o legado`

---

# FASE 11 — Piloto PDF vetorial/híbrido

### Objetivo
Descobrir, com medição real e sem risco, se vale reescrever a geração de PDF — e, no mesmo
experimento, se é viável tirar as fotos do caminho base64 do palco.

### Achados envolvidos
A-04, A-12.

### Por que esta fase vem agora
É a maior mudança do roteiro e a de maior risco. Precisa de: forma final da foto (Fase 5),
forma final de rubrica e logo (Fase 7), e massa para medir (Fase 8). E o ganho — Storage e
egress — é o que mais cresce com o tempo, então vale fazer **antes** que o acervo de PDFs
rasterizados fique grande demais.

### Escopo exato
- **Etapa 11.0:** `scripts/prototipo-pdf/` — os protótipos das candidatas, descartáveis após a decisão.
- **Novo:** `docs/medicoes/selecao-tecnologica-pdf.md` — a comparação e a escolha.
- **Novo:** `src/features/relatorios/pdfVetorial/` — gerador experimental, isolado.
- **Novo:** `src/features/relatorios/pdfVetorial/folhas/<NOME>.ts` — a folha do piloto.
- Flag de desenvolvimento para escolher o gerador. **Não** é feature flag de produção nesta fase.
- **Novo:** `docs/medicoes/piloto-pdf.md` — a comparação com custo decomposto (D-19).
- Fixture do relatório de referência (D-19), gerada pelo perfil realista da Fase 8.

### O que NÃO será mexido
- **`pdfService.ts` continua sendo o gerador de produção, intocado.** Durante todo o piloto.
- Nenhum template HTML.
- Nenhum relatório existente.
- O artefato imutável (I-16): o piloto gera PDF para **comparação**, não para publicação.

### ETAPA 11.0 — Seleção tecnológica (antes de escrever a folha piloto)

**A revisão 1 tratava "redesenhar com jsPDF manualmente" como decisão tomada. Não é.** O
objetivo é PDF vetorial/híbrido; jsPDF manual é *uma* forma de chegar lá, e fixá-la antes de
comparar seria escolher a ferramenta antes de conhecer o problema — com 40+ folhas em jogo,
o custo de manutenção da escolha errada é alto.

**Caixa de tempo: uma sessão.** Não é pesquisa aberta. É uma comparação curta, com
protótipo mínimo de cada candidata, e uma decisão registrada.

#### O protótipo mínimo (idêntico para todas as candidatas)

Um fragmento que exercita, num A4, tudo que dá errado na prática:
- um título e um parágrafo com acentuação portuguesa completa (`ã ç õ é ê á à ü`) em regular, negrito e itálico;
- uma tabela de 8 linhas × 5 colunas, com bordas de 0,25 pt e cabeçalho em negrito caixa alta;
- uma linha horizontal fina e um retângulo;
- uma imagem JPEG (foto de referência);
- um PNG com transparência (rubrica);
- uma quebra de página com continuação da tabela.

#### Candidatas

| # | Abordagem | A avaliar |
|---|---|---|
| 1 | **jsPDF com primitivas manuais** (`text`/`line`/`rect`) + `jspdf-autotable` para tabela | já é dependência (`jspdf ^4.2.1`); controle total; custo de layout manual por folha |
| 2 | **pdf-lib desenhando diretamente** | já é dependência (`pdf-lib ^1.17.1`); API de baixo nível; sem motor de tabela; é quem já faz o merge dos anexos |
| 3 | **HTML → PDF vetorial** via `jsPDF.html()` / `html2pdf` | aproveitaria os templates existentes; historicamente frágil com CSS complexo — a avaliar sem preconceito |
| 4 | **SVG → PDF** (templates viram SVG; SVG embutido no PDF) | vetorial por natureza; alinha com o croqui 2D, que **já é SVG gerado** (`croqui2dService`) |
| 5 | **Motor declarativo** (ex.: pdfmake, com definição de documento em objeto) | tabelas e layout resolvidos pela lib; menos código por folha; peso e fontes a avaliar |

Candidatas 1, 2 e 3 partem de dependências que **já estão no projeto** — vantagem real, dado
o histórico deliberado de evitar dependências novas (sprite SVG próprio em vez de lucide,
xlsx pelo CDN). Acrescentar peso ao bundle precisa ser justificado, não presumido.

#### Critérios de decisão

| Critério | Peso | Como medir no protótipo |
|---|---|---|
| **Fidelidade visual** vs. a folha atual | alto | comparação lado a lado + impressão |
| **Fontes** — Inter embutida, acentuação, 6 pesos, itálico | **eliminatório** | inspeção do protótipo; caixa vazia reprova |
| **Tabelas** — bordas finas, cabeçalho repetido, quebra | alto | o protótipo tem tabela com quebra |
| **Offline** — sem rede em nenhuma etapa | **eliminatório** | gerar com DevTools em Offline |
| **Imagens raster** — JPEG e PNG com transparência | alto | protótipo |
| **Incorporação direta de JPEG sem recodificar** (`DCTDecode`) | **alto — quase decisivo** | extrair o stream do PDF e comparar o hash com o arquivo de origem. Se bater, a fidelidade fotográfica da D-19 vira identidade provada em vez de semelhança estimada, e uma classe inteira de risco desaparece |
| **Compatibilidade com pdf-lib** para anexar certificados (I-16) | **eliminatório** | anexar um PDF ao resultado |
| **Tamanho** do arquivo gerado | alto | bytes do protótipo, decomposto (D-19) |
| **Velocidade e memória** | médio | 30 repetições do protótipo |
| **Manutenção de 40+ folhas** | **alto** | linhas de código do protótipo; o quanto o layout é declarativo |
| **Migração folha por folha** | **eliminatório** | precisa conviver com o gerador raster (D-16) |
| **Peso no bundle** | médio | diff do `vite build` |

Cinco critérios são **eliminatórios**. Candidata que falhe em qualquer um sai, sem discussão
sobre os demais.

#### Entregável

`docs/medicoes/selecao-tecnologica-pdf.md` com: a tabela preenchida, o protótipo de cada
candidata que chegou a rodar, a escolha, e — o mais importante — **o motivo de cada
descarte**. Se um dia a escolhida decepcionar, esse documento é o que evita refazer a
comparação do zero.

**Só depois disso a folha piloto é construída.** Se nenhuma candidata passar nos cinco
eliminatórios, a Fase 11 é reprovada aqui mesmo, sem construir folha nenhuma — e vale a
contingência do fim do documento. Descobrir isso em uma sessão é muito melhor que descobrir
depois de reescrever uma folha inteira.

### Escolha da folha do piloto
Critérios: muito texto, tabela, linhas finas, campos preenchidos, logo, assinatura e, se
possível, uma imagem. **Candidata: `PRONTUARIO.html`** — dados construtivos, tabelas
densas, fórmulas, cabeçalho com logo e carimbo de assinatura. Alternativa:
`RESUMO-MEMORIAL.html`. Decidir abrindo as duas e escolhendo a mais representativa do
conjunto; registrar a escolha e o porquê.

### Arquitetura antes
```
HTML no iframe  →  html2canvas(scale:2)  →  bitmap ~1588×2245
                →  toDataURL('image/jpeg', 0.95)
                →  pdf.addImage(cobrindo 210×297mm)
⇒ zero vetor. Texto, tabela, linha, fórmula: tudo pixel.
```

### Arquitetura depois (piloto)
```
Dados (do Map, sem passar pelo palco)
  →  gerador vetorial — TECNOLOGIA DEFINIDA NA ETAPA 11.0, não presumida aqui
  →  texto, tabelas, linhas, bordas e fórmulas em VETOR
  →  imagens raster SÓ onde são imagens: foto, rubrica, logo, croqui
  →  PDF

Fontes: a Inter já está empacotada (@fontsource-variable/inter). Qualquer que seja
        a tecnologia escolhida, ela precisa embutir a fonte e resolver acentuação
        portuguesa em 6 pesos + itálico. É o primeiro risco do piloto e um dos
        cinco critérios eliminatórios da 11.0.
```

**A questão das imagens (A-12), estudada aqui:** se o gerador vetorial lê os dados
direto do `Map`, ele **não precisa do palco** — pode resolver a foto pelo cofre local ou
pelo bucket e passar os bytes direto ao jsPDF. Isso elimina, para as folhas migradas:
- a conversão base64 (+33%);
- o custo UTF-16 (×2);
- o orçamento de 3.368 KB;
- a degradação de qualidade que hoje é o preço de caber.

**Quatro alternativas a avaliar no piloto**, na ordem de preferência:
1. **Gerador lê os dados direto** (não precisa de palco nem de canal) — preferida, porque elimina o problema em vez de contorná-lo. Vale para as folhas migradas.
2. **`<img src>` com URL assinada** — para folhas ainda em HTML durante a transição. Custo: exige rede no momento da montagem, o que quebra a geração offline.
3. **Blob URL** — funciona offline (o blob está no cofre), sem inflar nada. Boa opção intermediária, mas o template precisa aprender a receber a URL.
4. **`postMessage`** — mais invasivo, exige mudar todos os templates.

**Critério que não se negocia:** a qualidade técnica da foto **não pode** ser degradada
para caber. Se o caminho novo não conseguir entregar a foto em qualidade plena, ele não
substitui o atual.

### Migração
Nenhuma. Piloto não publica nada.

### Compatibilidade
Total — o sistema de produção não muda.

### Offline
O gerador vetorial deve funcionar offline (dados do `Map`, imagens do cofre). Medir isso é
parte do piloto: se o caminho novo exigir rede, é uma **regressão** frente ao atual, que
funciona offline.

### Segurança
Nenhum impacto. Nada é publicado.

### Integridade
Nenhum PDF do piloto vai para o bucket, recebe hash de artefato ou entra em histórico.
Marcar visivelmente os PDFs do piloto (marca d'água "PILOTO") para que jamais sejam
confundidos com documento válido.

### D-19 — como o tamanho do PDF é julgado (substitui o teto absoluto)

A revisão 1 usava "relatório de 30 folhas < 3 MB". **Isso está errado e foi removido**, por
um motivo simples: um relatório com 40 fotografias técnicas pode legitimamente pesar mais
que 3 MB, e um executor pressionado por essa meta tem um caminho fácil e desastroso para
atingi-la — baixar a resolução das fotos. Foto de inspeção é evidência técnica: é nela que
se lê a placa, a trinca, a corrosão. **Nenhuma meta de MB justifica degradá-la.**

#### O relatório de referência

Massa fixa, versionada, gerada pelo perfil realista da Fase 8, usada em toda comparação:

| Elemento | Quantidade |
|---|---|
| Folhas de texto/tabela | 18 |
| Folhas de registro fotográfico | 6 |
| Fotos | 20 (4 por folha nas 5 primeiras) |
| Resolução das fotos | 1200 px, q0.7 (o padrão da Fase 5) |
| Rubricas | 2 (engenheiro + técnico) |
| Logo | 1 |
| Croqui 2D | 1 |
| Anexo de certificado padrão | 1 PDF de ~400 KB |
| **Total de folhas** | **~30** |

Congelado como fixture. Toda medição de PDF do roteiro usa exatamente este relatório.

#### Custo separado — a medição que de fato informa

Toda medição decompõe o arquivo, em vez de olhar só o total:

| Componente | Como medir |
|---|---|
| Overhead do PDF (estrutura, fontes embutidas) | gerar o mesmo relatório **sem nenhuma imagem** |
| Custo do texto/tabela por folha | (total sem imagem − overhead) ÷ nº de folhas |
| Custo por fotografia | (total com fotos − total sem fotos) ÷ nº de fotos |
| Custo de rubrica e logo | medido isoladamente |
| Custo do anexo | tamanho do PDF anexado |
| **Total** | soma, conferida contra o arquivo real |

#### Os critérios que substituem o teto absoluto

**Critério principal — mesmo relatório, mesmos dados, mesmas fotos, antes e depois:**

| Componente | Critério |
|---|---|
| Texto, tabelas e linhas | **redução ≥ 80%** — é aqui que está o ganho real |
| Fotografias | **fidelidade preservada** — ver a escala de verificação abaixo. **Bytes NÃO são o critério** |
| Rubrica, logo, croqui | fidelidade preservada, mesmo critério |
| Anexo | idêntico (é cópia via pdf-lib) |
| **Total do relatório de referência** | consequência dos itens acima, **não uma meta em si** |

#### Critério de guarda fotográfico (corrigido em 16/08/2026)

A revisão 2 usava "bytes ±5%". **Isso está errado como medida de qualidade.** Uma biblioteca
pode remover metadata EXIF, trocar o encapsulamento, reorganizar tabelas de Huffman ou mudar
o encoding e produzir contagem de bytes diferente com **exatamente a mesma imagem** — e o
inverso também vale: bytes parecidos não provam fidelidade nenhuma. Byte é proxy ruim nas
duas direções.

**A escala de verificação, em ordem de força da evidência:**

| # | Verificação | Peso |
|---|---|---|
| 1 | **Dimensões em pixels idênticas** (largura × altura da imagem incorporada) | **eliminatório** |
| 2 | **Orientação idêntica** — nenhuma rotação introduzida | **eliminatório** |
| 3 | **Área/crop idênticos** — nenhum corte, nenhuma margem comida | **eliminatório** |
| 4 | **Nenhuma redução deliberada de qualidade** — nenhum parâmetro de compressão abaixo do atual em nenhum ponto do código | **eliminatório** |
| 5 | **Nenhuma recompressão** quando for tecnicamente possível reutilizar os bytes originais | **preferencial — ver melhor cenário** |
| 6 | **Comparação técnica das 6 fotos de referência**, com zoom, lado a lado | obrigatório |
| 7 | **Comparação de pixels da imagem decodificada** ou métrica objetiva equivalente (PSNR/SSIM), quando viável | obrigatório se viável |
| 8 | **Inspeção física do PDF impresso** | obrigatório |

**Melhor cenário — e é o que se deve perseguir primeiro:** a foto já está no bucket e no
cofre como **JPEG otimizado** (1200 px, q0.7, produzido na Fase 5). Se a tecnologia
escolhida na etapa 11.0 puder **incorporar esses bytes diretamente**, sem decodificar e
recodificar, então:

> a imagem dentro do PDF é **byte a byte idêntica** ao arquivo do bucket, e a verificação
> vira trivial: comparar o hash do stream JPEG extraído do PDF com o hash do arquivo. Isso
> é **identidade provada**, não semelhança estimada.

Incorporação direta de JPEG é capacidade comum em bibliotecas de PDF — o formato aceita o
stream JPEG como está (`DCTDecode`). **Verificar essa capacidade é um dos critérios da
etapa 11.0**, e uma candidata que a ofereça tem vantagem decisiva: elimina uma classe
inteira de risco.

**Se a tecnologia obrigar recodificação,** o critério não vira "bytes idênticos" — vira:

- dimensões, orientação e área preservadas (itens 1–3, eliminatórios);
- qualidade de codificação **igual ou superior** à atual (nunca abaixo de q0.7);
- **nenhuma perda perceptível nos detalhes de inspeção** nas 6 fotos de referência;
- resultado documentado, com as imagens comparadas anexadas à medição.

**As 6 fotos de referência continuam sendo:** placa de identificação com texto pequeno ·
solda · região com corrosão · trinca · instrumento com mostrador · visão geral. São elas
que definem "detalhe de inspeção" — se a placa continua legível e a trinca continua
visível, a foto serve; se não, não serve, independentemente de qualquer número.

> **Regra absoluta:** nenhuma otimização de PDF pode reduzir a utilidade técnica da
> fotografia. A foto é a evidência do laudo; o tamanho do arquivo é conveniência.

**Expectativa realista, para calibrar sem virar meta:** com ~20 fotos de ~110 KB, as fotos
sozinhas somam ~2,2 MB. Um relatório de referência vetorial deve ficar na casa de 2,5–3 MB,
quase todo ele fotografia — contra 10–30 MB hoje. Um relatório **sem fotos** (só memorial e
tabelas) deve cair para poucas centenas de KB. Esses números são **expectativa**, não
aceite; o aceite são os percentuais por componente acima.

### Métricas de baseline
Do relatório de referência inteiro **e** da folha do piloto, no gerador atual, com o custo
decomposto conforme a D-19: overhead, custo por folha de texto, custo por fotografia,
rubrica, logo, anexo, total. Mais: tempo de geração, pico de memória, e capturas de tela em
100%, 200% e 400% de zoom, além de uma impressão física.

### Métricas esperadas — a tabela de comparação
| Dimensão | Atual | Piloto | Critério de aprovação |
|---|---|---|---|
| Tamanho da folha **sem foto** | X KB | Y KB | **Y ≤ 0,2·X** (redução ≥ 80%) |
| Tamanho da folha **com foto** | X KB | Y KB | ver D-19 — julgado pelo custo separado |
| Tempo de geração | X ms | Y ms | Y ≤ X |
| Pico de memória | X MB | Y MB | Y < X |
| Nitidez do texto em 400% | pixelado | vetorial | **nitidez perfeita** |
| Texto selecionável/buscável | não | sim | sim |
| Linhas finas de tabela | engrossam/somem | precisas | precisas |
| Fontes e acentuação | ok | ? | **idêntica** — sem caixa vazia, sem acento errado |
| Espaçamento e alinhamento | referência | ? | fiel |
| Quebra de página | referência | ? | fiel |
| Logo e assinatura | raster | raster | idênticos |
| Foto | raster | raster | **qualidade igual ou melhor** |
| Anexo de certificado (pdf-lib) | funciona | ? | funciona |
| Impressão física A4 | referência | ? | **igual ou melhor** |
| Offline | funciona | ? | **precisa funcionar** |

### Testes automatizados
- O gerador vetorial produz PDF válido, parseável por pdf-lib.
- Contagem de páginas correta.
- Texto extraível contém as strings esperadas.
- A folha do piloto renderiza com dados faltando sem quebrar.
- Testes do gerador atual permanecem intactos e verdes.

### Testes manuais — o coração desta fase
1. Gerar a mesma folha nos dois caminhos, com os mesmos dados reais de org de teste.
2. Abrir os dois PDFs lado a lado; comparar em 100%, 200%, 400%.
3. **Imprimir os dois em papel A4** e comparar fisicamente. Impressão é o uso final; tela não substitui esse teste.
4. Selecionar e buscar texto no PDF vetorial.
5. Medir tamanho, tempo e memória.
6. Testar com dados extremos: campos muito longos, tabela com muitas linhas, campos vazios.
7. Testar offline.
8. Anexar certificado padrão com pdf-lib ao PDF vetorial.
9. Conferir acentuação portuguesa: ã, ç, õ, é, ê, á — em negrito, itálico e caixa alta.

### Teste de falha
- Fonte não carrega → o gerador deve falhar de forma **visível**, nunca produzir PDF com caixas vazias.
- Foto ausente → espaço em branco, nunca quebra.
- Dados faltando → folha sai com "-", como hoje.
- Offline → precisa funcionar; se não funcionar, é reprovação.

### Critério de aceite (é decisão de GO / NO-GO)
- [ ] **Etapa 11.0 concluída:** `docs/medicoes/selecao-tecnologica-pdf.md` com a tabela preenchida, a escolha e o motivo de cada descarte.
- [ ] Nenhuma candidata escolhida falhou em critério eliminatório.
- [ ] Tabela de comparação preenchida, com números reais.
- [ ] Custo decomposto medido (D-19): overhead, texto por folha, por fotografia, rubrica, logo, anexo.
- [ ] Texto/tabelas/linhas com **redução ≥ 80%**.
- [ ] **Critério de guarda fotográfico da D-19 cumprido**, na escala de 8 itens: dimensões, orientação e área idênticas (eliminatórios); nenhuma redução deliberada de qualidade; comparação técnica das 6 fotos de referência; comparação de pixels/métrica objetiva quando viável; inspeção impressa.
- [ ] Registrado se a tecnologia **incorpora o JPEG original sem recodificar**. Se sim, identidade provada por hash do stream. Se não, o motivo e o resultado da comparação documentados.
- [ ] Nenhuma perda perceptível nos detalhes de inspeção — placa legível, trinca visível.
- [ ] Nitidez em 400% comprovadamente superior.
- [ ] Impressão física **igual ou melhor**.
- [ ] Acentuação portuguesa perfeita em todos os pesos.
- [ ] Funciona offline.
- [ ] Anexo de certificado funciona.
- [ ] Gerador atual intocado e suíte verde.
- [ ] **Sua aprovação explícita** para prosseguir para a Fase 12.

**Se reprovado:** o piloto fica no repositório documentado como experimento, o gerador
atual segue, e A-09 volta a ser fase autônoma (ver contingência no fim).

### Rollback
Remover o diretório do piloto. Zero impacto — nada em produção foi tocado.

### Risco
**Alto em esforço, baixo em consequência.** O piloto pode consumir tempo e ser reprovado.
Mas não pode quebrar nada, porque não toca em nada de produção. Esse é o desenho: colocar o
risco no cronograma, não no sistema.

### Commit
1. `docs(medicoes): seleção tecnológica do gerador vetorial` *(etapa 11.0 — parada intermediária: vale a pena revisar a escolha antes de construir a folha)*
2. `feat(pdf): gerador vetorial experimental — piloto de uma folha`
3. `docs(medicoes): comparação piloto vs. gerador atual, com custo decomposto`
**PARAR — PORTÃO P6.** Decisão GO/NO-GO.

---

# FASE 12 — Expansão do PDF + chave única de campo

### Objetivo
Migrar as folhas restantes para o gerador aprovado, uma por vez, e — na mesma passada —
uniformizar qual chave cada folha lê, aposentando a duplicação de dados de inspeção.

### Achados envolvidos
A-04, A-12 (expansão) + A-09 (chave duplicada).

### Por que esta fase vem agora
Só depois do GO da Fase 11. A fusão com A-09 economiza uma varredura completa dos 40+
templates e um ciclo inteiro de risco sobre os mesmos arquivos.

### Escopo exato
Por folha migrada: um arquivo em `pdfVetorial/folhas/`, e a folha HTML correspondente
aposentada do caminho de PDF (mas mantida para o preview em tela enquanto for necessária).
Mais: `relatoriosService.ts` (`gravarInspecaoOrigemAtual`), `palco.ts`
(`CHAVES_DE_CAMPO`), e o teste de varredura.

### O que NÃO será mexido
- Relatórios já emitidos: **nunca** regerados (I-16). O gerador novo vale só para emissões novas.
- Nenhuma folha migra sem sua própria comparação visual e de impressão.
- Nenhuma folha é aposentada antes da sua substituta estar aprovada.

### REGRA DURA — nunca alteração em bloco

> **Proibido:** qualquer commit que altere mais de uma folha de conteúdo. Proibido
> "aproveitar que já estou no arquivo". Proibido migrar duas folhas parecidas juntas.

O ciclo abaixo é **completo por folha**, e a folha seguinte não começa antes de ele fechar:

```
1. implementar a folha no gerador vetorial
2. gerar os dois PDFs com os MESMOS dados (relatório de referência, D-19)
3. comparar em tela: 100%, 200%, 400%
4. IMPRIMIR os dois em A4 e comparar fisicamente
5. medir com custo decomposto (D-19); conferir o critério de guarda das fotos
6. testar offline
7. aceite da folha  →  se reprovada, ela NÃO entra e as demais seguem
8. marcar 'vetorial' no MAPA_GERADOR                     ← uma linha
9. commit desta folha, só dela
10. próxima folha
```

**Uma folha com problema volta sozinha para raster** — uma linha no mapa, sem deploy de
emergência, sem afetar as folhas já aprovadas (D-16). É a razão de o mapa ser por folha e
não uma flag global.

**Lotes de deploy:** folhas aprovadas podem ser deployadas em lotes (3–5), com **PARAR** e
validação em produção entre lotes (portão P7). Lote não é atalho de implementação — cada
folha dentro dele passou pelo ciclo completo de 10 passos.

### A-09 — condição de aposentadoria da chave redundante

A segunda chave de campo só deixa de ser **gravada** quando o teste automatizado provar que
**nenhuma folha restante a lê**:

```
1. cada folha migrada deixa de ler localStorage        (consequência do gerador novo)
2. a varredura de public/ (I-24) recalcula, a cada folha, quem ainda lê cada chave
3. enquanto restar UMA folha em HTML lendo a segunda chave → ela CONTINUA sendo gravada
4. quando a varredura devolver zero leitores → só então parar de gravar
5. o passo 4 é commit próprio, separado, com seu próprio aceite
```

**A ordem não se inverte:** uniformizar a leitura primeiro; parar de gravar depois. O teste
de varredura é o que autoriza o passo 4 — não uma conferência manual, não uma impressão de
que já deu. Um template esquecido imprime folha em branco, e a falha é silenciosa.

### Estratégia de migração — folha por folha, com flag
```
Para cada folha, na ordem: das mais densas em texto (maior ganho) para as mais visuais:
  1. implementar a versão vetorial
  2. gerar os dois PDFs com os mesmos dados
  3. comparar em tela e IMPRESSA
  4. só então marcar a folha como "vetorial" no mapa de folhas
  5. commit por folha

Flag por folha, não global:
  MAPA_GERADOR = { 'PRONTUARIO': 'vetorial', 'CAPA': 'raster', ... }
⇒ um relatório pode ser híbrido durante a transição, e uma folha problemática
  volta para raster mudando uma linha.
```

**Ordem sugerida:** PRONTUARIO, RESUMO-MEMORIAL, MEMORIAL, CLASSIFICACAO-RISCO, PLACA,
INSPECOES, VERIFICACAO-DOCUMENTACAO, checklists, VISUAL-*, CONCLUSAO, ULTRASSOM,
TESTE-HIDROSTATICO, LIVRO-REGISTRO, SUMARIO, CAPA. As folhas de **fotos** vão por último —
são majoritariamente imagem, ganho menor, e é onde o desenho de imagem (A-12) é mais
sensível.

### A-09 dentro desta fase
Cada folha migrada para o gerador vetorial **deixa de ler `localStorage`** — passa a
receber os dados. Isso resolve A-09 por consequência: a duplicação
`nr13_inspecao_atual`/`nr13_injecao_atual` existe só porque os templates não são uniformes
sobre qual chave ler. Quando nenhuma folha lê `localStorage`, a duplicação perde a razão de
ser.

**Ordem obrigatória, como você pediu:** uniformizar a **leitura** primeiro; só quando
**nenhuma** folha depender da segunda chave é que ela deixa de ser gravada. O teste de
varredura (I-24) é o que prova que chegou a hora. Para folhas que ainda estiverem em HTML,
a segunda chave continua sendo gravada — sem exceção.

### Migração
Nenhuma de dado. É mudança de caminho de geração.

### Compatibilidade
- Relatório antigo: PDF do bucket, intocado.
- Relatório novo: gerado pelo caminho novo nas folhas já migradas.
- Folha ainda não migrada: caminho atual.

### Offline
Cada folha migrada deve funcionar offline. Teste por folha, não só no fim.

### Segurança
Nenhum impacto.

### Integridade
- PDF novo continua recebendo SHA-256, indo ao bucket e sendo imutável (I-16).
- Relatório antigo **nunca** regerado — regerar produziria documento com dados de hoje carimbado como o artefato daquela emissão.

### Métricas de baseline
Por folha: tamanho, tempo, memória, no gerador atual. E, no fim, o relatório completo de
30 folhas nos dois caminhos.

### Métricas esperadas
| Medida | Antes | Depois (critério) |
|---|---|---|
| Relatório de referência (D-19) | 10–30 MB | dominado pelas fotos; texto ≥ 80% menor |
| Tempo de geração | dezenas de segundos | menor |
| Pico de memória | alto | bem menor |
| Storage por relatório novo | 10–30 MB | ≈ soma das fotos + overhead pequeno |
| Egress ao abrir relatório | 10–30 MB | idem |
| Relatório **sem fotos** (só memorial/tabelas) | vários MB | poucas centenas de KB |
| Chaves de campo gravadas | 3 cópias | 2 (`nr13_docs_` + uma) |
| Orçamento do palco | apertado | folgado ou dispensado |

### Testes automatizados
- Por folha: PDF válido, texto extraível com as strings esperadas, contagem de páginas.
- Varredura de templates atualizada a cada folha migrada.
- Teste que impede aposentar a segunda chave enquanto alguma folha ainda a ler.
- Relatório híbrido (folhas vetoriais + raster) gera PDF único e coerente.

### Testes manuais
Por folha migrada: comparação em tela e **impressa**. No fim: relatório completo comparado
página a página com um gerado pelo caminho antigo, com os mesmos dados.

### Teste de falha
Os mesmos da Fase 11, por folha. Mais: folha vetorial falhando no meio de um relatório →
o relatório inteiro falha de forma visível, nunca sai com folha faltando (mesmo princípio
do palco, I-23).

### Critério de aceite
- [ ] Todas as folhas planejadas migradas e aprovadas individualmente (tela + impressão).
- [ ] Relatório de referência (D-19) medido com custo decomposto; texto ≥ 80% menor.
- [ ] **Critério de guarda fotográfico da D-19 respeitado em cada folha migrada** — os quatro itens eliminatórios (dimensão, orientação, área, nenhuma redução deliberada de qualidade) verificados por extração, mais a inspeção impressa das folhas de registro fotográfico.
- [ ] Nenhum relatório antigo alterado.
- [ ] Segunda chave de campo só aposentada quando o teste provar que nenhuma folha a lê.
- [ ] Tudo funciona offline.
- [ ] Suíte verde, build limpo.

### Rollback
Por folha: mudar a entrada no mapa de volta para `raster`. É a razão de o mapa ser por
folha e não global. Rollback de uma linha, sem deploy de emergência.

### Risco
**Alto.** É a maior mudança do roteiro. Mitigado por: piloto aprovado antes, migração
folha a folha com aceite individual, flag por folha, gerador antigo permanentemente
disponível, e nenhum documento emitido tocado.

### Commit
Um commit por folha: `feat(pdf): folha <NOME> em vetorial`. Depois:
`refactor(inspecao): chave única de dados de campo`. Deploy pode ser por lote de folhas,
com **PARAR — PORTÃO P7** entre lotes.

---

# FASE 13 — Teste de carga

### Objetivo
Dizer, com número medido, quantos usuários simultâneos o sistema suporta — e onde ele
quebra primeiro.

### Achados envolvidos
A-18.

### Por que esta fase vem agora
Por último, e essa é a única posição defensável: medir capacidade de arquitetura que ainda
está mudando produz número que expira antes de ser usado. Depende de 1 (índice), 4 (Portal),
9 (listas), 12 (PDF) — as quatro que mudam o perfil de carga.

### Escopo exato
- **Novo:** `scripts/carga/` — cenário (k6, Artillery ou script próprio; decidir na fase).
- Usa a massa da Fase 8.
- **Novo:** `docs/medicoes/carga.md`.

### O que NÃO será mexido
Nenhum código de produção. Só medição.

### ETAPA 13.0 — Definir os SLOs ANTES de executar (obrigatória)

**A revisão 1 dizia "P95 aceitável", que é um critério que se ajusta ao resultado.** Isso é
o oposto de medir. Os limites são definidos, registrados e **aprovados por você antes de a
primeira requisição sair** — e não mudam depois.

### D-22 (revisada em 16/08/2026) — dois limites, e a operação precisa passar nos dois

A revisão 2 usava só **P95 = 2× baseline**. Isso mede degradação relativa bem e experiência
mal: se uma operação já leva 8 s sem carga nenhuma, `2× baseline` autoriza 16 s — e 16 s não
é uma experiência aceitável só porque o sistema degradou "dentro do esperado". O limite
relativo, sozinho, transforma lentidão existente em lentidão tolerada.

**Cada operação passa a ter DOIS limites, e a regra é conjuntiva:**

```
P95 da operação  ≤  min( 2 × baseline ,  teto_absoluto_aprovado )
```

| Limite | O que protege | Origem |
|---|---|---|
| **Relativo** (2× baseline) | contra degradação sob carga | medição da Fase 8 |
| **Absoluto** (teto de experiência) | contra "lento sempre" virar aceitável | julgamento, aprovado na 13.0 |

**Passa somente se atender aos dois ao mesmo tempo.** Estourar qualquer um reprova aquele
degrau de carga.

**Os tetos absolutos NÃO são inventados aqui.** São definidos na etapa 13.0, com o baseline
real em mãos, considerando: percepção de uso, natureza da operação (interativa vs. em
segundo plano), rede típica de campo, volume de dados envolvido, e o custo para o usuário se
aquilo travar. Uma operação de fundo que o usuário não espera olhando tolera mais que um
clique em botão.

**Sinal importante que essa regra produz:** se o teto absoluto de alguma operação for
**menor** que `2× baseline`, isso significa que a operação **já está lenta sem carga
nenhuma** — e isso é um achado do teste, a ser registrado como trabalho futuro, não um
motivo para afrouxar o teto.

| Operação | Baseline (1 usuário) | Limite relativo P95 | Teto absoluto P95 | Teto absoluto P99 |
|---|---|---|---|---|
| Login | a medir | 2× baseline | a definir na 13.0 | a definir |
| Hidratação incremental, **nada mudou** | a medir | 2× baseline | a definir | a definir |
| Hidratação incremental, **poucas mudanças** | a medir | 2× baseline | a definir | a definir |
| Primeiro boot (hidratação completa) | a medir | 2× baseline | a definir | a definir |
| Dashboard | a medir | 2× baseline | a definir | a definir |
| Lista de equipamentos | a medir | 2× baseline | a definir | a definir |
| Abrir um equipamento | a medir | 2× baseline | a definir | a definir |
| Salvar alteração (até o commit local) | a medir | 2× baseline | a definir | a definir |
| Sincronizar (RPC confirmada) | a medir | 2× baseline | a definir | a definir |
| Abrir histórico | a medir | 2× baseline | a definir | a definir |
| Abrir PDF (download do bucket) | a medir | 2× baseline | a definir | a definir |

**Nenhuma célula pode continuar como "a medir" ou "a definir" no momento da execução.**
Tabela incompleta não autoriza rodar o teste.

| Métrica global | SLO |
|---|---|
| Taxa de erro | **< 1%** |
| Erros 5xx | **0** — erro de servidor não é degradação, é falha |
| Falhas de sincronização (item preso na fila) | **0** |
| Perda de dado | **0** — eliminatório absoluto |

**Preencher a coluna "baseline" com número real antes de rodar.** Tabela com "a medir" não
autoriza execução.

**Regra anti-ajuste, e ela é o ponto desta etapa:**

> Os SLOs são congelados em `docs/medicoes/slo-carga.md`, com data e sua aprovação, **antes**
> da primeira execução. Alterá-los depois de ver o resultado invalida a medição. Se um SLO se
> mostrar irrealista, isso é um **achado do teste** — registrado como tal, com o número real
> ao lado — e não uma correção retroativa da meta.

**Capacidade observada** passa a ter definição única e verificável:

> A maior quantidade de usuários simultâneos em que **todas** as operações atendem
> simultaneamente ao limite **relativo** e ao **teto absoluto** de P95, a taxa de erro fica
> abaixo de 1%, não há 5xx, não há falha de sincronização e não há perda de dado.

### ETAPA 13.1 — Ambiente (obrigatória, antes de qualquer carga alta)

**O risco real:** se o projeto Supabase do teste compartilhar compute, banco ou pool com
produção, a carga **degrada o sistema de clientes reais** — inspetores em campo, com prazo,
sem entender por que o app parou. Carga não é operação read-only: satura recursos
compartilhados.

**Ordem obrigatória:**

1. **Determinar se há compartilhamento.** Projeto Supabase do teste, plano, compute, pooler, região. Documentar.
2. **Se compartilha com produção:** carga alta **NÃO** é executada. Provisionar projeto de staging com configuração equivalente é pré-requisito, não sugestão.
3. **Se é separado:** documentar as diferenças de compute e plano. Um staging menor que produção dá número **conservador** (bom); um maior dá número **otimista** (perigoso, porque superestima a capacidade real).
4. **Nunca extrapolar entre ambientes sem declarar a diferença.** Todo número do relatório final vem com a configuração ao lado.
5. **Carga alta em produção só com sua autorização deliberada, por escrito**, em janela combinada, com plano de aborto (critério objetivo de parada) e alguém acompanhando.

**Escada de segurança, mesmo em ambiente separado:** começar em 25 usuários e só subir de
degrau depois de o anterior fechar dentro do SLO. Critério de aborto imediato: qualquer 5xx,
qualquer falha de sincronização, ou latência acima do P99.

**Se não houver ambiente separado disponível:** rodar apenas os degraus baixos (25, 50) em
janela de baixíssimo uso, com aborto imediato ao primeiro sinal de degradação, e declarar no
relatório que os degraus altos **não foram medidos**. Número não medido não vira estimativa
— vira lacuna registrada.

### Cenário — proporção realista
```
Por usuário virtual, em loop:
  login                                    1×
  hidratação (boot)                        1×
  Dashboard                                1×
  lista de equipamentos                    1×
  abrir 1 equipamento                      1×
  alteração ocasional + sync              ~30% dos usuários
  abrir histórico                         ~40%
  abrir 1 PDF                             ~15%   ← fração pequena, como é na vida real
```

**Explicitamente não fazer:** 500 usuários abrindo PDF simultaneamente. Não representa uso
real e produziria um número que só assusta.

**Degraus:** 25 → 50 → 100 → 250 → 500 → além se houver margem. Cada degrau sustentado por
tempo suficiente para estabilizar (sugestão: 10 min), com rampa de subida.

**Onde rodar:** contra a org de teste, em janela combinada, **nunca** contra organizações
reais e nunca em horário de uso. Se o Supabase for compartilhado entre teste e produção, o
teste de carga afeta clientes reais — avaliar antes de rodar e, se for o caso, usar
projeto Supabase separado.

### Métricas
| Camada | Medida |
|---|---|
| Cliente | latência P50/P95/P99 por operação; taxa de erro |
| Postgres | CPU, conexões ativas, queries lentas, cache hit ratio |
| PostgREST | tempo de resposta, taxa de erro, saturação |
| Storage | requests, bytes servidos, latência |
| Egress | bytes totais do teste, extrapolados para mês |
| App | tempo de hidratação, tempo de sync, falhas de fila |

### Métricas esperadas
**Os critérios numéricos existem e são os SLOs congelados na etapa 13.0** — o que a fase
descobre não é *qual* é o limite aceitável, e sim *em quantos usuários* ele deixa de ser
atendido. O entregável é:
1. capacidade **observada** (usuários simultâneos com P95 aceitável e erro < 1%);
2. identificação do gargalo em cada degrau;
3. projeção de custo de egress e Storage por 100 clientes;
4. lista priorizada do próximo trabalho, se houver.

**Hipótese a testar (da auditoria):** o gargalo aparece nesta ordem — (1) CPU do Postgres na
hidratação, (2) egress do Storage por PDF, (3) PostgREST no pico de boot. Depois das Fases
1, 4 e 12, os três devem ter melhorado, e o teste diz quais sobraram.

### Testes automatizados
O próprio cenário é o teste. Versionado, repetível, com seed fixa da massa.

### Testes manuais
Durante cada degrau, um humano usando o app normalmente e registrando a percepção: em que
ponto fica visivelmente lento, em que ponto começa a errar.

### Teste de falha
- Saturar de propósito para achar o ponto de quebra e observar **como** quebra: erro claro ou timeout silencioso.
- Simular queda do Storage durante o teste.
- Simular rede degradada.

### Critério de aceite
- [ ] Todos os degraus executados e registrados.
- [ ] **Etapa 13.0 concluída antes da execução:** `docs/medicoes/slo-carga.md` com **limite relativo E teto absoluto** de cada operação preenchidos com número real (nenhum "a medir"/"a definir"), datado e aprovado por você.
- [ ] Operações cujo teto absoluto ficou **abaixo** de 2× baseline registradas como achado ("já lenta sem carga"), sem afrouxar o teto.
- [ ] **Etapa 13.1 concluída:** ambiente determinado e documentado; se compartilhar com produção, carga alta não executada.
- [ ] Massa gerada com o **perfil realista, calibração 2** (pós-Fase 12) — não com PDF sintético pequeno.
- [ ] Calibração usada registrada junto com o resultado.
- [ ] Nenhum SLO alterado após ver o resultado. SLO estourado é achado registrado, não meta corrigida.
- [ ] Capacidade observada declarada com número, pela definição da 13.0, não estimada por conexões.
- [ ] Gargalo de cada degrau identificado.
- [ ] Projeção de custo por 100 clientes, com a configuração do ambiente ao lado.
- [ ] Degraus não executados (por falta de ambiente) declarados como **lacuna**, nunca extrapolados.
- [ ] Nenhuma organização real afetada.

### Rollback
Não se aplica. Limpar a massa após o teste.

### Risco
**Baixo** se rodar contra ambiente isolado. **Alto** se rodar contra o Supabase de
produção — por isso a avaliação de ambiente separado é pré-requisito da fase, não detalhe.

### Commit
1. `docs(medicoes): SLOs congelados para o teste de carga` *(etapa 13.0)*
2. `docs(medicoes): avaliação de ambiente para carga` *(etapa 13.1)*

**PARAR — PORTÃO P8.** A execução da carga só acontece com os SLOs aprovados e o ambiente
resolvido.

3. `chore(carga): cenário de teste de carga`
4. `docs(medicoes): resultado do teste de carga`

---

# Visão resumida

| | Fase | Achados | Risco | Complexidade |
|---|---|---|---|---|
| **0** | **Segurança** — isolamento do Portal | A-01 | Médio | M |
| **1** | **Fundação** — índice da hidratação | A-03 | Baixo | P |
| **2** | **Observabilidade** — métricas e contagem correta | A-11 | Baixo | M |
| **3** | **Sincronização** — fechar o ciclo de conflitos | A-14 | Médio | M |
| **4** | **Portal** — arquitetura de leitura | A-02 | Baixo | M |
| **5** | **Fotos** — thumbnail, EXIF, teto de altura | A-08 | Baixo | M |
| **6** | **Arquivos** — recuperação do fallback base64 | A-10 | Baixo | P–M |
| **7** | **Versionamento** — logo e rubrica por conteúdo | A-05 | Médio | M–G |
| **8** | **Ambiente de escala** — massa e baseline | A-17 | Baixo | M |
| **9** | **UI/escala** — listas grandes | A-07 | Baixo | M |
| **10A** | **Higiene: auditoria** — inventário, medição, conferência (**read-only**) | A-15, A-06, A-13 | Baixo | M |
| **10B** | **Higiene: retenção** — remoções aprovadas, uma a uma | A-15, A-06, A-13 | Médio | M |
| **11** | **Piloto PDF** vetorial/híbrido (com etapa 11.0 de seleção tecnológica) | A-04, A-12 | Alto | G |
| **12** | **Expansão do PDF** + chave única de campo | A-04, A-12, A-09 | Alto | G |
| **13** | **Teste de carga** (com etapas 13.0 SLOs e 13.1 ambiente) | A-18 | Baixo | M |

**Respostas diretas às suas 13 perguntas:**

1. **Ordem final:** 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → **10A → 10B** → 11 → 12 → 13.
2. **Dependências:** no diagrama da seção "Dependências".
3. **Independentes:** 0, 1, 3 — nenhuma depende de outra.
4. **Obrigatoriamente antes:** 0 antes de 4 e de 7 (D-05 resolve as refs de rubrica/logo) · 1 antes de 2 · 2 antes de 5, 6, 8, 10A · 6 antes de 7 · 8 antes de 9 e 11 · 5 e 7 antes de 11 · **10A antes de 10B** · 11 antes de 12 · **12 antes da calibração 2 da massa realista** · 1, 4, 9, 12 antes de 13.
5. **Risco:** na tabela acima; justificado em cada fase.
6. **Ganho:** na seção "Métricas esperadas" de cada fase, com número.
7. **Complexidade relativa:** P = 1 sessão · M = 2–4 sessões · G = 5+ sessões, com aceite intermediário.
8. **Checklist de aceite:** seção "Critério de aceite" de cada fase.
9. **Rollback:** seção "Rollback" de cada fase. Os três pontos que exigiram desenho especial estão declarados: upgrade de schema do IndexedDB na Fase 3 (aditivo, seguro); gravação dupla da Fase 7 (para o rollback não apagar rubrica); e a Fase 10B, **a única que remove dado**, com backup verificado por restauração como condição.
10. **Métricas antes/depois:** seções "Métricas de baseline" e "Métricas esperadas". Todas gravadas em `docs/medicoes/`.
11. **Massa de escala:** **Fase 8**, em **dois perfis** (D-20). Estrutural para listas e DOM; realista para Storage, egress e carga — este recalibrado após a Fase 12.
12. **Piloto vetorial:** **Fase 11**, começando pela **etapa 11.0** (seleção tecnológica, uma sessão), depois de fotos (5), rubrica/logo (7) e massa (8).
13. **Teste de carga:** **Fase 13**, precedido das etapas **13.0** (congelar SLOs) e **13.1** (garantir ambiente separado), depois de índice (1), Portal (4), listas (9) e PDF (12).

---

# Contingência: se o piloto da Fase 11 for reprovado

Cenário plausível — o gerador vetorial pode não atingir fidelidade suficiente, e é melhor
saber disso antes de começar.

1. A Fase 12 não acontece na forma planejada.
2. **A-09 volta a ser fase autônoma:** varredura dos templates, inventário de quem lê cada chave, uniformização da leitura com compatibilidade temporária, e só depois aposentadoria da chave redundante — exatamente o roteiro que você descreveu.
3. **A-12 (fotos fora do palco) vira fase própria**, usando a alternativa 3 (Blob URL), que funciona offline e não exige gerador novo — só que os templates aprendam a receber a URL.
4. **A-04 fica em aberto** com uma alternativa intermediária a avaliar: manter o raster, mas reduzir de `scale: 2` + JPEG 0.95 para parâmetros medidos folha a folha. Ganho menor, risco muito menor. Requer o mesmo protocolo de comparação impressa.

---

# Registro de decisões tomadas neste plano

Decisões que não estavam na auditoria e que passam a valer:

| # | Decisão | Onde | Motivo |
|---|---|---|---|
| D-01 | A-14 sobe para Fase 3 | Ordem | Cópias de conflito poluem o `Map` e crescem sem teto |
| D-02 | Massa (A-17) antes de listas (A-07) | Ordem | A-07 não é mensurável sem massa |
| D-03 | A-09 funde com a Fase 12 | Ordem | Evita duas varreduras dos 40+ templates |
| ~~D-04 v1~~ | ~~Policy de leitura por lista **negra**~~ | — | **REVERTIDA em 16/08/2026 — era fail open** |
| **D-04** | Policy de leitura por lista **branca** (`in ('mestre','gerente','funcionario')`) — **fail closed** | Fase 0 | Papel futuro nasce **sem** acesso; é o padrão que toda policy de escrita do projeto já usa |
| ~~D-05 v1~~ | ~~Edge valida que o path pertence a um ativo do cliente~~ | — | **REVISADA em 16/08/2026 — autorizar por pasta é insuficiente** |
| **D-05** | Edge autoriza arquivo por **VÍNCULO**: o path precisa ser referenciado por um recurso que aquele cliente pode ver | Fase 0 | PDF, rubrica, logo e certificado moram em pastas comuns da org, não sob a TAG |
| D-06 | Lista de chaves do Portal a partir de `familiasChave.POR_TAG` | Fase 4 | Uma query com `= any(array)`, não N queries com `LIKE` |
| D-07 | Teste de paridade entre `familiasChave.ts` e a Edge | Fase 4 | Duplicação de tabela dessincroniza em silêncio |
| D-08 | Variante principal permanece 1200 px / q0.7 | Fase 5 | É o valor certo para A4 a 300 dpi |
| D-09 | Thumb em path irmão, não pasta separada | Fase 5 | Policy do bucket vale igual sem alteração |
| D-10 | Sem migração obrigatória de fotos antigas | Fase 5 | Custaria egress; o fallback já resolve |
| **D-11** | Gravação dupla **só no dado vivo**; snapshot novo já guarda só a ref. Encerramento na 10B, condicionado a C1–C8 e a ≥ 45 dias | Fase 7 → 10B | Sem a dupla o rollback seria destrutivo; sem prazo e critério ela vira permanente por inércia |
| D-12 | Sem paginação de servidor nas listas | Fase 9 | Dados já em memória; paginar quebraria o offline |
| **D-13** | Retenção de mutações em **90 dias**, revisada contra a distribuição medida na 10A | Fase 10B | Cobre campo prolongado; pior caso degrada para conflito (I-04/I-05), nunca para perda |
| **D-14** | Inventário é read-only e vive na **10A**; remoção é fase separada | Fase 10A | Observação não pode compartilhar fase com remoção |
| D-15 | PDFs em `<org>/relatorios/` são "órfão protegido" | Fase 10A | Nunca removíveis, mesmo sem referência aparente |
| D-16 | Flag do gerador de PDF é **por folha** | Fase 12 | Rollback de uma linha, sem deploy de emergência |
| D-17 | Nenhum relatório antigo é regerado | Fase 12 | Produziria documento com dados de hoje carimbado como o de ontem |
| **D-18** | Principal e thumbnail **não são atômicos**; a principal é estado completo | Fase 5 | Atomicidade faria erro no thumb custar a foto tirada em campo |
| **D-19** | Tamanho do PDF julgado por **relatório de referência + custo decomposto**, com critério de guarda que reprova qualquer perda fotográfica | Fases 11, 12 | Teto absoluto em MB dá ao executor um atalho destrutivo: degradar a foto |
| **D-20** | Massa em **dois perfis** — estrutural e realista, o realista com duas calibrações | Fases 8, 13 | PDF sintético pequeno produz capacidade falsa no teste de carga |
| **D-21** | Etapa **11.0** de seleção tecnológica antes de construir a folha piloto | Fase 11 | jsPDF manual é uma opção entre cinco; fixar antes de comparar é escolher a ferramenta sem conhecer o problema |
| **D-22** | Etapas **13.0** (SLOs congelados) e **13.1** (ambiente) antes de qualquer carga. **SLO = limite relativo E teto absoluto, conjuntivos** | Fase 13 | "P95 aceitável" se ajusta ao resultado; e só o relativo transformaria lentidão existente em lentidão tolerada |
| **D-23** | Fase 12 proíbe commit que altere mais de uma folha | Fase 12 | Alteração em bloco em documento técnico não tem rollback granular |
| **D-24** | Origem fail-open (`papel` default `'mestre'`) **bloqueia a Fase 0** se a auditoria achar qualquer caminho implícito | Fase 0 | RLS fail-closed sobre origem fail-open é aparência de segurança, não segurança |
| **D-25** | `ultima_sync` é **por usuário**, não por aparelho. C4 reescrita para não afirmar o que os dados não provam | Fase 7 → 10B | Um PC que sincroniza hoje mascara um notebook parado há semanas |
| **D-26** | Não-enumeração é propriedade do **código**, não do cronômetro | Fase 0 | Exigir tempo idêntico produz teste intermitente que o time aprende a ignorar |
| **D-19 (ampliada)** | Fidelidade fotográfica verificada por **dimensão/orientação/área + ausência de recodificação**, não por bytes | Fases 11, 12 | Byte é proxy ruim nas duas direções: metadata e encoding mudam bytes sem mudar a imagem |

---

# Histórico de revisões

## Revisão 3 — 16/08/2026 (revisão técnica pontual; **plano macro fechado**)

Seis correções pontuais. **Ordem das fases inalterada**, nenhuma dependência nova de
sequência. Duas das seis foram resolvidas por verificação no código, não por raciocínio.

| Item | O que mudou | Como foi decidido |
|---|---|---|
| **D-24** | `papel` default `'mestre'` passa a **bloquear a Fase 0** se a auditoria achar caminho implícito. Bifurcação A/B, subetapas 0.a–0.f, testes de origem, rollback assimétrico | endurecimento a pedido |
| **Fase 3** | Semântica do `mutationId` após conflito virou **pré-condição bloqueante**, com a leitura do código registrada como hipótese forte de **Caso B** e um defeito ativo provável identificado em `/pendencias` | **verificado no SQL e no cliente** |
| **D-25** | `ultima_sync` confirmada **por usuário**. C4 reescrita em C4.1–C4.4, sem afirmar garantia que os dados não provam | **verificado no código** |
| **D-19** | Critério fotográfico deixa de ser bytes ±5% e vira escala de 8 itens, com 4 eliminatórios e o cenário ideal de incorporação direta de JPEG | correção técnica |
| **D-26** | Não-enumeração vira propriedade do código; tempo de resposta sai dos critérios | correção técnica |
| **D-22** | SLO passa a ser **relativo E absoluto**, conjuntivos | correção técnica |

**Achado da revisão 3 que merece atenção imediata:** a pré-condição da Fase 3 indica que
reenviar um item em estado `conflito` com o mesmo `mutationId` faz a RPC devolver
`repetido`, que o cliente trata como sucesso — removendo o item da fila sem ter gravado nada
no servidor. E `/pendencias` **já hoje** reenvia itens em conflito no botão "Tentar todas".
Se confirmado na verificação, é perda silenciosa de dado em produção, não risco futuro. A
correção mínima é de uma linha (recusar item em conflito nesses dois botões) e está no
escopo da Fase 3 — **antecipá-la como hotfix é decisão do dono**, e o plano não reordena
nada por conta própria.

## Revisão 2 — 16/08/2026 (endurecimento pré-Fase 0)

| Item | O que mudou |
|---|---|
| **D-04** | Lista negra → **lista branca (fail closed)**. Papel futuro nasce sem acesso. Matriz de acesso acrescentada. Teste do papel desconhecido acrescentado |
| **D-05** | Autorização de arquivo por pasta → **por vínculo**. Tabela de arquivos fora da pasta da TAG, algoritmo da Edge, TTL curto, resposta indistinguível |
| **D-11** | Contradição resolvida: gravação dupla **só no dado vivo**, snapshot já com ref. Condições C1–C8, prazo de 45 dias, trava contra esquecimento, rollback nos dois momentos |
| **Fase 10** | Dividida em **10A (read-only)** e **10B (remoção)**, com o portão P5 entre elas |
| **D-19** | Critério `< 3 MB` **removido**. Relatório de referência, custo decomposto, critério de guarda fotográfico |
| **D-21** | Etapa **11.0** acrescentada: 5 candidatas, 5 critérios eliminatórios, caixa de tempo de uma sessão |
| **D-18** | Thumbnail explicitamente **não-atômica**, com a ordem de gravação e um teste por ponto de falha |
| **D-20** | Massa em **dois perfis**, realista com duas calibrações (pré e pós-Fase 12) |
| **D-22** | Etapas **13.0** (SLOs congelados antes) e **13.1** (ambiente separado) |
| **D-23** | Fase 12: regra dura de uma folha por commit; condição de aposentadoria da chave A-09 |
| **Portões** | Seção de portões de parada P1–P8 no topo do documento |
| **Fase 0** | Pendência do Portal virou **pré-condição bloqueante**, com buscas globais e entregável |

**Dependências novas descobertas nesta revisão:**

1. **`profiles.papel` tem `default 'mestre'`** — perfil sem papel explícito nasce com acesso total. Auditoria dos caminhos de criação entra na Fase 0; trocar o default fica para ciclo próprio.
2. **`FotoImg` do Portal chama `createSignedUrl` direto** — quebra no instante em que a policy do bucket for aplicada. Migrar para a Edge é parte da Fase 0, não posterior.
3. **Fase 7 depende da Fase 0** — `portal_arquivo` precisa resolver `assinaturaRef`/`logoRef` antes de o snapshot novo existir, senão o relatório abre no Portal sem a rubrica.
4. **Fase 13 depende da Fase 12** para a calibração 2 da massa realista.
5. **Verificar se o Admin faz `select` direto em `app_storage`** — quebraria com a policy fail closed.

## Revisão 1 — 15/08/2026
Versão inicial, a partir da auditoria `docs/auditoria-arquitetura-2026-08-15.md`. 14 fases,
invariantes I-01…I-26, decisões D-01…D-17.
