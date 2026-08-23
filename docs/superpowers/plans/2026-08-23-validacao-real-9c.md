# Validação real da 9C — roteiro para o portão P9.2

**Preparado em 23/08/2026.** **NADA AQUI FOI EXECUTADO.**

> **BLOQUEIO ATIVO:** o Supabase de produção mostra **`Grace period is over`**. Enquanto esse
> estado não for esclarecido, **nada deste roteiro roda** — nem o SQL, nem a flag, nem o deploy.

---

## 0 · O que este roteiro é, e o que ele não é

**É:** o procedimento para provar, numa organização REAL com dados REAIS, que a flag ligada
entrega o mesmo conteúdo que a flag desligada, e que o rollback devolve o estado anterior.

**Não é:** carga, massa sintética, backfill global nem benchmark de escala. A 9C já foi medida no
laboratório com 50.000 registros; o que falta é **fidelidade sobre dado de verdade**.

### Regras que não se quebram durante a validação

1. **Nenhuma informação real pode ser alterada para benchmark.** Nada de editar um equipamento
   "só para ver". A única escrita permitida é a do passo 8, com TAG descartável documentada.
2. **Não gerar massa.** Nem 100, nem 500, nem um único registro além do item de teste do passo 8.
3. **Uma organização por vez.** A flag é por org e nasce desligada para todas.
4. **Ao primeiro sinal de divergência, desligar a flag** e registrar. O rollback é de um toque e
   não converte dado nenhum.

---

## 1 · Pré-requisitos, na ordem

### 1.1 Esclarecer o `Grace period is over`

Antes de qualquer coisa. O aviso pode significar cobrança pendente, projeto pausado ou restrição
de recursos — e **aplicar migration num projeto nesse estado é a pior hora possível**. Confirmar
no painel qual é o estado real e regularizar.

### 1.2 Backup da organização escolhida

`scripts/backup-org.mjs` já existe no repositório. Rodar **antes** de qualquer SQL e guardar o
arquivo fora da máquina.

### 1.3 Ordem de aplicação do SQL — e ela importa

| # | Arquivo | Observação |
|---|---|---|
| 1 | `supabase/busca_index.sql` | tabelas de projeção + RLS |
| 2 | `supabase/busca_manutencao.sql` | projeção, rebuild, reparo, auditoria |
| 3 | `supabase/busca_index_rpc.sql` | a RPC de escrita passa a manter a projeção |
| 4 | `supabase/busca_index_indices.sql` | **reescreve a coluna `tag`** |
| 5 | `supabase/busca_consulta.sql` | `buscar_equipamentos` / `contar_equipamentos` |
| 6 | `supabase/busca_v9_flag.sql` | a coluna da flag, `default false` |

> **O passo 4 tem de vir com as tabelas VAZIAS.** Ele faz
> `alter column tag type text collate "C"`, que reescreve a tabela e reconstrói a PK. Com a
> projeção vazia é instantâneo; depois do backfill de uma org grande é uma janela de lock.
>
> Ou seja: **todo o SQL antes do backfill, sempre.**

### 1.4 Deploy do bundle

O front tem de estar publicado **antes** de a flag ser ligada. Com a flag desligada — que é o
padrão para todas as organizações — o bundle novo se comporta exatamente como o atual.

> Deploy do front neste projeto é **manual, no Coolify**.

### 1.5 `rls_funcoes_estaveis.sql` — decisão separada

Não faz parte deste roteiro. É mudança independente, com validação e rollback próprios
(`docs/medicoes/2026-08-23-rls-funcoes-volateis.md`). Pode ir antes, depois, ou não ir.

---

## 2 · Escolha da organização

**Critérios**, nesta ordem:

1. Uma organização **do próprio dono**, ou de cliente que aceite participar sabendo.
2. Entre **20 e 200 equipamentos** — grande o bastante para a lista paginar (mais de 50), pequena
   o bastante para conferir item a item se preciso.
3. **Não** a maior conta em produção. A maior é o alvo do benefício, não da primeira validação.

```sql
-- Candidatas, sem tocar em nada:
select p.org_id,
       count(*) filter (where s.chave like 'nr13_info_%' and s.deletado_em is null) as equipamentos
  from public.profiles p
  join public.app_storage s on s.org_id = p.org_id
 where p.papel = 'mestre'
 group by p.org_id
having count(*) filter (where s.chave like 'nr13_info_%' and s.deletado_em is null) between 20 and 200
 order by 2;
```

---

## 3 · Backfill da organização escolhida — e só dela

```sql
-- 1. estado inicial: quantos a VERDADE tem
select count(*) as na_verdade
  from public.app_storage
 where org_id = '<ORG>' and chave like 'nr13_info_%' and deletado_em is null;

-- 2. reconstrói em lotes (repetir até `concluido`)
select public.reiniciar_rebuild_busca('<ORG>');
select public.reconstruir_indice_busca('<ORG>', 1000);
-- repetir a linha acima enquanto a resposta não disser etapa = 'concluido'

-- 3. a auditoria PRECISA convergir antes de a flag ser ligada
select jsonb_pretty(public.auditar_projecao('<ORG>'));
```

**Critério de aprovação do passo 3:** `convergiu: true`, `faltando: 0`, `sobrando: 0`,
`defasadas: 0`, `pendencias: 0`, e `na_projecao` **igual** a `na_verdade`.

Se não convergir: `select public.reparar_divergencias('<ORG>', 500);` e auditar de novo.
**Não ligar a flag com auditoria divergente.**

---

## 4 · A comparação — FLAG DESLIGADA primeiro

Com a flag ainda **OFF**, na organização escolhida, anotar:

| # | O que anotar | Como |
|---|---|---|
| 4.1 | **Quantidade** de equipamentos | o cabeçalho da tela: "N equipamentos cadastrados" |
| 4.2 | **A lista de TAGs**, inteira | console: `[...document.querySelectorAll('.plate-tag-chip')].map(e=>e.textContent).sort()` |
| 4.3 | **Os cartões de 5 equipamentos** escolhidos: TAG, descrição, empresa, PMTA, categoria, volume, fluido, PTH, resultado, vida, unidade, tem foto | captura de tela |
| 4.4 | Nós no DOM e heap | `document.getElementsByTagName('*').length` e `performance.memory.usedJSHeapSize` |
| 4.5 | Tempo até a lista aparecer | cronômetro mesmo |

> Guardar isto por escrito. É a **linha de base** contra a qual tudo depois é comparado.

---

## 5 · Ligar a flag

```sql
select public.definir_busca_v9('<ORG>', true);
```

O usuário precisa **sair e entrar** (ou recarregar): a flag é lida no login, por
`sincronizarFlagDoServidor`.

Confirmar que chegou ao bundle: `localStorage.getItem('nr13_busca_v9')` deve ser `"1"`.

---

## 6 · A comparação — FLAG LIGADA

| # | Prova | Critério de aprovação |
|---|---|---|
| 6.1 | Quantidade | o contador bate com 4.1 (ou "mais de 1.000" se passar do teto) |
| 6.2 | **Conjunto de TAGs** | rolar até o fim e comparar com 4.2: **mesmo conjunto, sem faltar nem sobrar** |
| 6.3 | Os mesmos 5 cartões | **campo a campo** contra 4.3. Nenhum "—" onde antes havia valor |
| 6.4 | Miniaturas | as fotos aparecem, e só carregam ao entrar na tela |
| 6.5 | DOM e heap | devem cair muito. É o ganho |
| 6.6 | Busca por **TAG exata** | acha o equipamento |
| 6.7 | Busca por **prefixo de TAG** | acha os do prefixo |
| 6.8 | Busca por **fabricante** real da conta | acha — e **digitado sem acento** também |
| 6.9 | Busca por **nº de série** real | acha o equipamento certo |
| 6.10 | Busca por **cliente** e **localização** | acham |
| 6.11 | Filtros de tipo e categoria | resultado bate com o que a lista antiga filtrava |
| 6.12 | Termo inexistente | "Nenhum equipamento para «…»", sem erro |
| 6.13 | Limpar (`×` e `Esc`) | volta à lista completa |
| 6.14 | Recarregar com `?q=` na URL | reabre com a busca aplicada |

### 6.15 · Abrir um equipamento — o caminho inteiro

Escolher **um** equipamento que tenha memorial, fotos e relatório salvo:

1. abrir a ficha → todos os campos presentes;
2. "Ver Memorial Completo" → abre com o cálculo;
3. Prontuário → as folhas montam;
4. um relatório salvo → abre;
5. **voltar para a lista** → o equipamento continua lá, na mesma posição.

**Nenhum documento pode abrir vazio.** É o que a estratégia de compatibilidade protege, e o que
mais importa provar sobre dado real.

---

## 7 · Offline

1. Com a lista carregada, cortar a rede (modo avião / DevTools → Offline).
2. Recarregar a tela.
3. **Esperado:** a lista responde pelo catálogo do aparelho, com o selo *"buscando no que está
   neste aparelho"*, e a busca continua funcionando sobre ele.
4. **Proibido:** lista vazia sem explicação.
5. Voltar a rede → a lista volta ao servidor, sem selo.

---

## 8 · Escrita — o único ponto em que se cria alguma coisa

> **TAG descartável e documentada:** `ZZ-TESTE-9C-<AAAAMMDD>`.
> Exemplo: `ZZ-TESTE-9C-20260825`. O prefixo `ZZ-` a joga para o fim de qualquer ordenação e
> deixa evidente que não é ativo real.

1. Criar o equipamento com essa TAG.
2. **Ele aparece na lista imediatamente** — é a garantia do item recém-salvo (§6.5 do desenho).
3. Abrir, preencher descrição e fabricante, salvar.
4. Voltar à lista: os dados novos aparecem no cartão.
5. Buscar pelo fabricante que foi digitado: **acha**.
6. **Remover pelo fluxo oficial da tela** (excluir equipamento), nunca por SQL.
7. Conferir que sumiu da lista e da busca.
8. `select count(*) from public.equipamentos_index where org_id='<ORG>' and tag like 'ZZ-TESTE-9C-%';`
   deve devolver **0** — a exclusão tem de limpar a projeção também.

### 8.1 Escrita offline

1. Ficar offline, criar `ZZ-TESTE-9C-OFF-<AAAAMMDD>`.
2. **Aparece na lista, com o selo "aguardando envio".**
3. Voltar a rede, esperar o selo da topbar dizer "Sincronizado".
4. O equipamento continua na lista, agora sem o selo de pendente.
5. Remover pelo fluxo oficial.

---

## 9 · Rollback — exercitado de verdade, não presumido

```sql
select public.definir_busca_v9('<ORG>', false);
```

Sair e entrar. **Esperado:**

- a tela antiga volta inteira, com o botão "Filtrar";
- a quantidade bate com 4.1;
- o conjunto de TAGs bate com 4.2;
- os 5 cartões batem com 4.3;
- **nenhum dado precisou ser convertido**.

> Este passo é obrigatório **mesmo que tudo dê certo**. Rollback que nunca foi exercitado não é
> rollback, é esperança.

---

## 10 · Auditoria depois de tudo

```sql
select jsonb_pretty(public.auditar_projecao('<ORG>'));
select * from public.busca_pendencias where org_id = '<ORG>';
```

`convergiu: true` e **zero** pendências. Se houver pendência, ela nomeia a chave — e
`reparar_divergencias` resolve.

---

## 11 · O que registrar ao fim

- os pares 4.x × 6.x lado a lado, com as diferenças (se houver);
- DOM e heap antes e depois;
- tempo até a lista, antes e depois;
- toda divergência de conteúdo, **por menor que seja**;
- se a TAG descartável foi criada e removida;
- se o rollback foi exercitado.

---

## 12 · Critérios de aprovação do P9.2

- [ ] Auditoria convergida antes de ligar a flag
- [ ] Quantidade e **conjunto de TAGs** idênticos com a flag ligada e desligada
- [ ] Os 5 cartões idênticos campo a campo
- [ ] Busca por fabricante, nº de série, cliente e localização funcionando sobre dado real
- [ ] Equipamento abre, memorial abre, prontuário monta, relatório abre
- [ ] Voltar à lista não perde nada
- [ ] Offline responde com selo, e nunca vazio sem explicação
- [ ] Item recém-salvo aparece na hora, inclusive offline
- [ ] TAG descartável criada e removida pelo fluxo oficial
- [ ] Rollback exercitado e conferido
- [ ] Auditoria convergida ao fim, zero pendências
- [ ] Nenhum dado real alterado

---

## 13 · Se algo der errado

| Sintoma | Ação |
|---|---|
| Equipamento faltando na lista com a flag ON | **desligar a flag**, rodar `auditar_projecao`, guardar a saída |
| Cartão com campo vazio que antes tinha valor | desligar a flag, anotar TAG e campo |
| Busca não acha algo que existe | anotar o termo exato e a TAG; não desligar ainda — é informação valiosa |
| Erro na tela | desligar a flag; a tela antiga volta |
| Qualquer dúvida | **desligar a flag.** Ela existe para isso, e desligá-la não custa nada |

**Desligar a flag nunca perde dado.** A projeção é derivada; `app_storage` continua sendo a
verdade, e nada nela foi alterado pela 9C.
