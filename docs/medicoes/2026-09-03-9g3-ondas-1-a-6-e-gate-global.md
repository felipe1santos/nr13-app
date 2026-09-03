# 9G.3 · AS SEIS ONDAS EM 30/30, E O GATE GLOBAL

**03/09/2026** · projeto `qqsesrntfvmdxqxrfvmw`. Fast-track autorizado pelo dono:
sem janela de calendário entre ondas, cada uma concluída na mesma rodada se os
gates passassem.

> **RESULTADO: as OITO flags em 30/30**, auditoria 30/30 convergindo, 0
> pendências, e o gate global verde. **Nenhum caminho legado foi removido.**

---

## 1 · Pré-flight (regra obrigatória do §1 do plano)

| | |
|---|---|
| organizações | 30 |
| `auditar_projecao` convergindo | **30** |
| divergentes | **0** |
| `busca_pendencias` | 0 (evidência complementar) |

Repetido antes de cada ampliação. Nunca foi ligada flag em organização
divergente.

## 2 · As seis ondas

| onda | flags | resultado | validação em tela (org de teste) |
|---|---|---|---|
| **1** | `busca_v9` | **30/30** | `/equipamentos`: 4 resultados, busca e filtros, 1 `buscar_equipamentos`, **0 hidratação** |
| **2** | `inspecoes_v9` + `prontuarios_v9` | **30/30** | `/inspecoes`: 4 resultados, "1 Inspeção". `/prontuarios`: "Prontuário OK" / "Sem Prontuário". **0 hidratação** |
| **3** | `calibracoes_v9` + `relatorios_v9` | **30/30** | `/calibracoes`: 4 resultados com foto e proprietário. `/relatorios`: 3 relatórios reais. **0 hidratação** |
| **4** | `livro_v9` | **30/30** | `/livro-registro`: 2 livros, contagens (1 e 2) e datas (19/08, 21/08) corretas |
| **5** | `vencimentos_v9` | **30/30** | `/vencimentos`: KPIs 4 · 0 · 0 · 100 %, 4 linhas idênticas ao baseline |
| **6** | `boot_v9` | **30/30** | pré-condição própria conferida antes: **0 organizações com migração de histórico pendente** |

### Rollback provado, não presumido (passo H)

| onda | prova |
|---|---|
| **1** | `busca_v9` OFF na org de teste → `buscar_equipamentos` = 0, hidratação integral = **1** (legado voltou), sem campo de busca, e **os mesmos 4 equipamentos** com o mesmo conteúdo |
| **2** | as duas flags OFF → rótulo legado "Equipamentos Cadastrados", hidratação = 1, e a **mesma contagem** "1 Inspeções" |

Nos dois casos a flag foi religada em seguida e o estado conferido.

## 3 · O erro que eu cometi no meio da rodada — e como foi corrigido

Ao validar a onda 3 eu contei `.card-equipamento-horiz` (cartão de EQUIPAMENTO)
na tela `/relatorios`, vi **zero**, e concluí que havia uma regressão em
produção. **Revertei `busca_v9` para 0 nas 30 organizações** por precaução, antes
de diagnosticar.

Estava errado. `/relatorios` com `busca_v9` ligada é a tela da **9E**, que lista
RELATÓRIOS — não cartões de equipamento. Ela estava funcionando: 3 relatórios
reais, com nome de arquivo, TAG, tipo e data, ordenados por data decrescente.

As RPCs que ela chama (`buscar_relatorios`, `contar_relatorios`) **existem em
produção** — conferido no catálogo do Postgres logo depois.

**O que aprendi e fica registrado:** contar elementos de uma classe CSS não é
validar uma tela. A ausência de um seletor prova que aquele seletor não está lá,
não que a tela quebrou. A verificação certa é o CONTEÚDO — e foi o conteúdo que
mostrou que estava tudo certo.

O rollback preventivo não causou dano (devolveu ao caminho legado, que funciona)
e foi desfeito em seguida.

### O achado que veio junto, e que vale mais que o susto

**`busca_v9` PREVALECE sobre `relatorios_v9` em `/relatorios`.** O roteamento é:

```
Relatorios()                        // src/pages/Relatorios.tsx:1221
  busca_v9 ON  → RelatoriosV9       // 9E: LISTA DE RELATÓRIOS
  busca_v9 OFF → RelatoriosLegado
                   relatorios_v9 ON → CatalogoRelatoriosV9   // 9F.6: catálogo de equipamentos
```

Com as duas ligadas, quem aparece é a lista de relatórios da 9E. O catálogo da
9F.6 só é alcançável com `busca_v9` desligada — ou seja, hoje ele é o caminho de
recuo, não o caminho principal.

**Isto corrige o desenho da Fase 10** (`docs/FASE-10-DESENHO.md` §5.1), que dizia
que `/relatorios` "hoje lista equipamentos" e que "falta uma RPC de listagem". As
duas afirmações estavam erradas: a tela já lista relatórios por data e a RPC já
existe. O que falta para a Fase 10 é menos do que estava escrito — badges de
rascunho/finalizado e o filtro por empresa.

## 4 · O gate global

Todas as flags ligadas, organização de teste, bundle `index-C2_BBPFP.js`.

### 4.1 · Navegação — oito telas

| tela | hidratação integral | `app_storage` | erro |
|---|---|---|---|
| `/dashboard` | **0** | 3 | não |
| `/equipamentos` | **0** | 3 | não |
| `/inspecoes` | **0** | 3 | não |
| `/relatorios` | **0** | 3 | não |
| `/prontuarios` | **0** | 3 | não |
| `/calibracoes` | **0** | 3 | não |
| `/livro-registro` | **0** | 3 | não |
| `/vencimentos` | **0** | 3 | não |

**Zero `lerTudo()` em todas as oito.** As 3 requisições a `app_storage` são o
conjunto FIXO do boot leve (globais, rastreabilidades, permissões) e **não
crescem** ao navegar — o número é o mesmo do começo ao fim da caminhada.

RPCs observadas, todas da projeção: `buscar_equipamentos`, `contar_equipamentos`,
`buscar_relatorios`, `contar_relatorios`, `buscar_livros`, `contar_livros`,
`vencimentos_org`, `assinatura_org`.

### 4.2 · Abrir itens reais

| item | resultado |
|---|---|
| livro de `ZZ-FASE3` | **2 REGISTRO(S)**, "**Cadeia de registros íntegra**", as duas entradas marcadas **Íntegro**, Capa, Termo de Abertura e Histórico presentes |
| `/relatorios` | 3 relatórios reais com nome de arquivo, TAG, tipo e data |

O lacre foi conferido **com dado real**, não com massa.

### 4.3 · Busca

| consulta | resultado |
|---|---|
| `ZZ-FASE3` | **1 resultado**, exato |
| `NAOEXISTE-XYZ` | **Nenhum resultado** |
| limpar | volta a **4 resultados** |

### 4.4 · Offline e sincronização

Simulado bloqueando as chamadas ao Supabase no navegador — **não derrubei o
servidor de produção**, que atende clientes. Fica declarado que esta é uma
simulação; a prova com servidor realmente fora foi feita no laboratório.

| tela | comportamento |
|---|---|
| `/livro-registro` | "Não foi possível carregar os livros de registro." — mensagem clara, sem travar |
| `/relatorios` | **melhor**: avisa "buscando no que está neste aparelho" e **serve os 3 relatórios do cache local** |
| recuperação | ao restaurar a rede, a tela voltou sozinha e o selo marcou **"Sincronizado"** |

Nenhuma tela caiu na hidratação integral como "remédio" para a falha de rede.

### 4.5 · Estado final do servidor

```
orgs=30 | convergiram=30 | divergentes=0 | pendencias=0
v2=30 busca=30 insp=30 pront=30 calib=30 livro=30 venc=30 rel=30 boot=30 /30
```

## 5 · O que NÃO foi provado, e fica declarado

1. **Login em produção não foi exercitado.** A sessão do navegador já estava
   autenticada e esta sessão não tem a senha da conta de teste. O que foi
   validado é o BOOT, não o login. A 9G.1 (login respeitando `boot_v9`) segue
   provada só no laboratório.
2. **Nenhuma conta de cliente foi aberta em tela.** As validações visuais são
   todas da organização de teste. Para as outras 29 o que se afirma é: mesma
   versão de código, auditoria convergindo, e flags ligadas. Não é a mesma coisa
   que ver a tela do cliente.
3. **Offline é simulação**, pelo motivo do §4.4.
4. **Escala em produção não foi medida** — e não deve ser: massa é proibida lá
   (§12 do `CLAUDE.md`). A maior organização real tem 39 equipamentos.

## 6 · Veredito

**FASE 9 TECNICAMENTE PRONTA PARA A REMOÇÃO DOS LEGADOS.**

As oito flags em 30/30, projeção convergindo nas trinta, zero pendências, oito
telas sem hidratação integral, itens reais abrindo com o lacre íntegro, busca
funcionando, offline degradando com aviso e recuperando sozinho, e rollback
provado em duas ondas.

**A remoção NÃO foi feita e depende de autorização explícita do dono.** Ela é a
etapa 7 do plano, é irreversível, e a ordem está escrita: cliente → testes → SQL.
