# Fase 0-B — Task-level (isolamento do Portal)

> Implementa a Parte 0-B da Fase 0 do roteiro macro. A Parte 0-A (origem do papel) está
> validada em produção desde 16/08/2026.

**Goal:** fechar o A-01 — fazer com que uma conta `papel='cliente'` só alcance dados e
arquivos dos ativos vinculados a ela, **no servidor**, independentemente do que o frontend
faça.

**Spec:** `2026-08-15-evolucao-arquitetura.md` — Fase 0, D-04 (fail closed), D-05 (vínculo,
não pasta), D-26 (não-enumeração).

---

## O que a pré-condição 0.d encontrou

Quatro famílias de acesso direto do Portal ao Supabase, todas passando por **três funções**:

| Chokepoint | Arquivo | Quem usa no Portal |
|---|---|---|
| `urlAssinada(path)` | `fotos.ts:290` | `FotoImg` → `resolverFoto` — capa, galeria, componentes |
| `baixarFoto(ref)` | `fotos.ts:342` | `VisualizadorPdf`, `baixarPdfArquivado`, `abrirProntuarioFabricante`, `AnexosRastreabPreview` |
| `lerRemoto(chave)` | `storageV2.ts:390` | `resolverPdf` (fallback de certificado legado) |

Rotear as três resolve os quatro call sites **sem tocar em componente de UI do Portal**.

---

## Global Constraints

- `npm test` verde (baseline 924) · `npm run build` limpo · `npm run lint` sem erro novo (baseline 50 problemas).
- SQL versionado, **aplicado manualmente**, e **só depois** do bundle e da Edge estarem em produção.
- Invariantes preservados. Esta fase não toca em fila, cache, palco, PDF, livro nem em nada do sistema interno.
- Organização de teste para tudo. Produção real só read-only.

---

## Ordem de deploy — não é negociável

```
1. Edge portal_arquivo   (nova; ninguém chama ainda — inerte)
2. Bundle novo           (Portal passa a usar a Edge; policies ANTIGAS ainda permitem tudo)
3. CONFERIR o Portal funcionando com as policies antigas   ← o passo que garante o rollback
4. SÓ ENTÃO aplicar as policies fail-closed
5. Reconferir o Portal
```

O passo 3 é o que torna o rollback do 4 suficiente: se o Portal já funcionava pela Edge com
as policies antigas, voltar as policies devolve exatamente o estado testado.

Aplicar a policy antes do bundle derruba o Portal no intervalo — e esse intervalo depende do
dono fazer o redeploy, ou seja, pode ser longo.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/services/papelSessao.ts` | **criar** — o papel da sessão, lido do localStorage, sem importar `auth.ts` |
| `src/services/__tests__/papelSessao.test.ts` | **criar** — contrato |
| `supabase/functions/portal_arquivo/index.ts` | **criar** — autoriza por vínculo e emite URL assinada |
| `src/services/fotos.ts` | **modificar** — `urlAssinada` e `baixarFoto` roteiam pela Edge quando cliente |
| `src/services/storageV2.ts` | **modificar** — `lerRemoto` recusa para cliente |
| `supabase/portal_policies.sql` | **criar** — SELECT fail-closed em `app_storage` e no bucket |
| `supabase/portal_policies_rollback.sql` | **criar** — restaura as policies atuais |

**Por que `papelSessao.ts` e não `auth.isCliente()`:** `fotos.ts` é importado por `palco.ts`,
que é importado por várias telas. Fazer `fotos` depender de `auth` (que importa `storage`,
que importa `storageV1/V2`) cria um grafo de import largo e arrisca ciclo. O papel já vive em
`localStorage.nr13_papel`; ler dali é três linhas e zero acoplamento.

**Isso NÃO é a checagem de segurança.** É só roteamento — decide qual caminho o cliente usa.
Quem impede o acesso é a policy (servidor). Um cliente que forje `nr13_papel` no localStorage
só consegue tentar o caminho direto, que a policy recusa.

---

## Task 1 — `papelSessao.ts`

**Files:** Create `src/services/papelSessao.ts`, `src/services/__tests__/papelSessao.test.ts`

**Produces:** `papelDaSessao(): string`, `ehCliente(): boolean`

- [ ] **1.1 Teste que falha**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { ehCliente, papelDaSessao } from '../papelSessao';

describe('papelSessao', () => {
  beforeEach(() => localStorage.clear());

  it('sem papel gravado devolve string vazia e não é cliente', () => {
    expect(papelDaSessao()).toBe('');
    expect(ehCliente()).toBe(false);
  });

  it('reconhece o papel cliente', () => {
    localStorage.setItem('nr13_papel', 'cliente');
    expect(ehCliente()).toBe(true);
  });

  it('papéis internos não são cliente', () => {
    for (const p of ['mestre', 'gerente', 'funcionario']) {
      localStorage.setItem('nr13_papel', p);
      expect(ehCliente()).toBe(false);
    }
  });

  // Sensível a caixa, como a lista branca das policies (D-04).
  it('caixa trocada não vira cliente', () => {
    localStorage.setItem('nr13_papel', 'CLIENTE');
    expect(ehCliente()).toBe(false);
  });

  it('localStorage indisponível não derruba a leitura', () => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error('bloqueado'); };
    try { expect(papelDaSessao()).toBe(''); expect(ehCliente()).toBe(false); }
    finally { Storage.prototype.getItem = orig; }
  });
});
```

- [ ] **1.2 Rodar, ver falhar** — `npx vitest run src/services/__tests__/papelSessao.test.ts`
- [ ] **1.3 Implementar**
- [ ] **1.4 Rodar, ver passar**
- [ ] **1.5 Commit** — `feat(portal): papel da sessão sem acoplar fotos.ts a auth.ts`

---

## Task 2 — Edge `portal_arquivo`

**Files:** Create `supabase/functions/portal_arquivo/index.ts`

Implementa a D-05: autoriza por **vínculo**, não por pasta.

```
POST { path }  com Bearer do cliente
  1. perfil: papel == 'cliente', org_id, cliente_id      (senão recusa)
  2. TAGS = { tag : nr13_emp_<tag>.clienteId == cliente_id }
  3. PATHS = união das referências alcançáveis a partir de TAGS:
       nr13_fotos_<tag>[].ref.path
       nr13_docs_<tag> → refs das fotos de campo
       nr13_pront_fab_<tag>.pdfRef.path
       nr13_componentes_cal_<tag>[].fotoRef.path
       nr13_rel_<id>_<tag>.pdfRef.path
       nr13_rel_<id>_<tag>.meta.assinantes[].assinaturaRef.path   ← Fase 7
       nr13_rel_<id>_<tag>.meta.empresa.logoRef.path              ← Fase 7
       nr13_rel_<id>_<tag>.meta.rastreabIds → nr13_rastreab_<id>.pdfRef.path
       nr13_livro_<tag>[].assinaturaRef.path
  4. path ∈ PATHS ? createSignedUrl(path, 300) : recusa
  5. Recusa SEMPRE com o mesmo status, corpo e cabeçalhos (D-26)
```

**Decisões:**
- **TTL de 300 s** (contra 3600 hoje). URL assinada é bearer token: quem a tiver, acessa. TTL longo transforma link vazado em acesso de uma hora.
- **Resolve `assinaturaRef`/`logoRef` desde já**, mesmo que nenhum snapshot os tenha ainda. Elimina o acoplamento de cronograma com a Fase 7 (alternativa (a) da dependência registrada lá).
- **Nunca consulta a existência do arquivo** antes de decidir. A decisão é pertinência ao conjunto — por isso não há caminho distinguível para cronometrar (D-26).

- [ ] **2.1** Escrever a Edge
- [ ] **2.2** Commit — `feat(portal): edge portal_arquivo autoriza arquivo por vínculo`

---

## Task 3 — `fotos.ts` roteia pela Edge quando cliente

**Files:** Modify `src/services/fotos.ts`

- [ ] **3.1 Teste que falha** — cliente não chama `supabase.storage` direto; interno continua chamando
- [ ] **3.2 Implementar**

```
urlAssinada(path):
  se ehCliente() → pede à Edge portal_arquivo
  senão          → createSignedUrl como hoje
  (cache em memória continua igual, com TTL menor para o cliente)

baixarFoto(ref):
  cofre local primeiro (INALTERADO — offline e egress zero)
  se ehCliente() → urlAssinada(path) → fetch → blob
  senão          → storage.download como hoje
```

- [ ] **3.3 Rodar, ver passar**
- [ ] **3.4 Commit** — `feat(portal): arquivo do cliente sai pela edge, não pelo SDK`

---

## ACHADO DURANTE A EXECUÇÃO — 16/08/2026: o cliente hidrata a organização inteira

A pré-condição 0.d mapeou o acesso a **arquivos**. Faltou o acesso a **dados**, e ele é pior.

`src/app/router.tsx:38` põe **tudo** dentro de `RotaProtegida`, inclusive a árvore do Portal.
E `RotaProtegida` (linhas 43-44) faz, sem distinguir papel:

```ts
await iniciarArmazenamento();
await lerTudo();          // ← baixa a ORGANIZAÇÃO INTEIRA
```

Consequências, as duas graves:

1. **Hoje, um cliente que faz login já recebe todo o `app_storage` da organização** no `Map` e no IndexedDB do aparelho dele. Não é "consegue consultar se tentar" — é "o app já baixou e guardou". A Edge `portal_cliente` filtra o que a TELA mostra; a hidratação, que roda antes, não filtra nada.
2. **Quando a policy fail-closed entrar, `lerTudo()` volta vazio** → o `Map` fica vazio → `ler()` devolve `null` → `montarAtivos` e todas as telas do Portal quebram. O Portal hoje lê do `Map` hidratado, não do `localStorage` que o `portalService` preenche (aquilo serve aos templates em iframe).

Ou seja: a policy sozinha **fecha o vazamento e quebra o Portal na mesma ação**. As duas
coisas precisam ser resolvidas juntas, nesta fase.

### Correção (Tasks 4a e 4b, acrescentadas)

**4a — cliente não hidrata.** `RotaProtegida` passa a chamar `iniciarArmazenamento()` (que só
prepara org/IndexedDB/Map, sem rede) mas **não** `lerTudo()` para `papel='cliente'`. Isso já
elimina o download da organização inteira, independentemente da policy.

**4b — o Portal semeia o cache com o que a Edge entregou.** `carregarDadosPortal` passa a
gravar as chaves recebidas **no cache** (além do `localStorage`, que os templates precisam),
para que `ler()` continue funcionando em todo o Portal sem mudar nenhuma tela.

Ordem que importa: 4a e 4b vão no **mesmo deploy**. 4a sem 4b quebraria o Portal na hora.

## Task 4 — `lerRemoto` recusa para cliente

**Files:** Modify `src/services/storageV2.ts`

**Investigar ANTES de implementar:** `resolverPdf` cai em `lerRemoto` só quando o registro
não tem `pdfRef` (certificado legado). Para o Portal, `portal_cliente` já entrega o registro
`nr13_rastreab_` **completo**, com `pdfBase64` — então `resolverPdf` resolve no primeiro
passo (`if (r.pdfBase64) return r.pdfBase64`) e nunca chega ao `lerRemoto`.

Se a investigação confirmar isso, `lerRemoto` retornar `null` para cliente é inócuo. Se não
confirmar, o certificado legado precisa de rota na Edge — e aí a task cresce.

- [ ] **4.1** Confirmar o caminho com teste
- [ ] **4.2** Implementar a recusa
- [ ] **4.3** Commit

---

## Task 5 — Policies fail-closed (SQL, NÃO aplicado)

**Files:** Create `supabase/portal_policies.sql`, `supabase/portal_policies_rollback.sql`

```sql
-- app_storage: leitura só para papéis internos (D-04, lista branca)
drop policy if exists app_storage_select_org on public.app_storage;
create policy app_storage_select_org on public.app_storage
  for select using (
    org_id = public.org_atual()
    and public.papel_atual() in ('mestre','gerente','funcionario')
  );

-- bucket: idem
drop policy if exists inspecao_leitura on storage.objects;
create policy inspecao_leitura on storage.objects for select
  using (
    bucket_id = 'inspecao'
    and (storage.foldername(name))[1] = public.org_atual()::text
    and public.papel_atual() in ('mestre','gerente','funcionario')
  );
```

**Verificar antes de aplicar:** nenhuma tela do Admin faz `select` direto em `app_storage`
(ela usa `admin_usage_stats()`, que é `security definer`). Se fizer, migra para RPC primeiro.

- [ ] **5.1** Escrever ida e volta
- [ ] **5.2** Commit — **não aplicar**

---

## Validação (após deploy, org de teste)

Com `cliente-A1` logado e DevTools aberto, os 16 passos do roteiro macro. Os essenciais:

| # | Tentativa | Esperado |
|---|---|---|
| 1 | `supabase.from('app_storage').select('chave').limit(1000)` | `[]` |
| 2 | `supabase.storage.from('inspecao').createSignedUrl(<path de A2>, 60)` | erro |
| 3 | `portal_arquivo` com path de foto de A2 | recusado |
| 4 | `portal_arquivo` com PDF de relatório de A2 (pasta comum) | recusado |
| 5 | `portal_arquivo` com rubrica usada só em relatório de A2 | **recusado** ← teste central da D-05 |
| 6 | `portal_arquivo` com path inventado em `assinaturas/` | recusado, resposta **idêntica** ao #5 |
| 7 | `portal_arquivo` com path de outra organização | recusado |
| 8 | UI do Portal de A1: lista, ativo, foto, PDF, rubrica | tudo funciona |
| 9 | Papel desconhecido (`auditor_externo`) | sem acesso — fail closed |
| 10 | Sistema interno (mestre/gerente/funcionario) | sem regressão |

**Cenário mínimo:** a org de teste precisa de **dois** clientes com ativos distintos. Hoje ela
tem 1 cliente e 13 equipamentos — falta criar o segundo cliente e vincular ao menos um
equipamento a cada.

---

## Rollback

| Sintoma | Ação |
|---|---|
| Portal não carrega nada | reverter só `app_storage_select_org` |
| Portal carrega mas fotos/PDF não abrem | reverter só `inspecao_leitura` |
| Admin quebrado | reverter `app_storage_select_org`, migrar a tela para RPC, tentar de novo |
| Sistema interno afetado | reverter as duas — não deveria acontecer |

Frontend e Edge podem permanecer: eles funcionam com as policies antigas (foi o passo 3 do
deploy que provou isso).

**Risco:** médio. Reversível em segundos, sem perda de dado.
