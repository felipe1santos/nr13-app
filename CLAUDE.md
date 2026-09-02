# CLAUDE.md — Sistema NR-13 (estrutura fixa do sistema)

Este arquivo é a **fonte de verdade** do sistema. Toda implementação, folha de relatório/prontuário,
formulário de inspeção e regra de injeção de dados DEVE respeitar o que está aqui. A ordem dos
documentos no relatório DEVE seguir a seção "Organização do Relatório".

---

## 1. Objetivo e fluxo do usuário

O sistema torna a inspeção NR-13 e a elaboração da documentação **mais rápida e fácil**. Fluxo real:

1. **Em campo (celular):** o usuário abre o botão **"Inspeções"**, preenche as ferramentas de
   inspeção (checklist, visual externo/interno, ultrassom/ME, teste hidrostático) respondendo
   perguntas e anexando fotos com descrição. Salva no container de inspeção.
2. **No escritório (computador):** o usuário gera a documentação. O sistema **puxa automaticamente**
   tudo que foi salvo (ficha do equipamento, memorial, cadastro da empresa/funcionários, cadastro do
   cliente, dados de campo) e monta as folhas do relatório e do prontuário, com assinatura do
   engenheiro responsável.

Por isso: **as telas de inspeção precisam ser 100% responsivas para mobile**, e os dados delas são
**injetados** nas folhas que geram o relatório e o prontuário.

---

## 2. Stack e arquitetura

- React 19 + TypeScript + Vite. Estado em Zustand. Rotas em `react-router-dom`.
- PDF: `html2canvas` + `jspdf` (A4 210×297mm, JPEG 0.95) — `src/features/relatorios/pdfService.ts`.
- **As folhas do relatório/prontuário são templates HTML estáticos** em `public/arquivos-inspecao/`
  e `public/arquivos-prontuario/`, renderizados em `<iframe>` com `?tag=<TAG>&page=<N>`.
- Cada template lê os dados que precisa **direto do `localStorage`** no `DOMContentLoaded`.
  Não há backend: o "banco" é o `localStorage` (via `src/services/storage.ts`).

### §2-ter — Armazenamento v1 (localStorage) e v2 (Map + IndexedDB) — 05/08/2026

O `localStorage` tem cota de ~5 MB para a origem INTEIRA. Medido em produção, a conta
`cmam.caldeiras` precisava de 5.692 KB e **nenhum** dos seus 38 equipamentos entrava no
cache: a hidratação, ordenada por nome, estourava a cota dentro de `nr13_fotos_` e nunca
chegava em `nr13_info_`. Spec completa em
`docs/superpowers/specs/2026-08-04-armazenamento-offline-design.md`.

`src/services/storage.ts` é um **DESPACHANTE** entre duas implementações, escolhidas pela
flag `nr13_armazenamento_v2` — memoizada por sessão (reler a cada chamada faria o caminho
trocar no meio da sessão) e gravada no login a partir de `org_sync.v2_ativa`.

> **ORGANIZAÇÃO NOVA NASCE EM v2 (11/08/2026).** `v2_ativa` era `default false` e a ativação
> de 10/08 foi um tiro único sobre as 27 orgs existentes — toda conta criada depois caía na v1
> e voltava a bater no teto de 5 MB. Agora: `flag.ts` trata "consulta respondeu e NÃO veio
> linha" como org nova → v2; `supabase/v2_por_default.sql` põe `default true`, faz backfill e
> cria a linha por trigger (`trg_garantir_org_sync` em `profiles`). Linha PRESENTE com `false`
> (rollback deliberado) continua vencendo. Errar para o lado da v2 é o lado barato:
> `aplicar_mutacao_storage` nunca consulta `v2_ativa`, então org que o servidor ainda considera
> v1 grava normal pela RPC — o erro caro é o inverso (bundle v1 × servidor v2 = o bug do `cmam`).
>
> **QUEM LIGA A FLAG (10/08/2026):** `flag.sincronizarFlagDoServidor()`, chamada dentro de
> `carregarPerfil()` (auth.ts) logo depois de `nr13_org_id` ser gravada — ou seja, no login E
> em todo boot pelo `verificarAcesso()` do `RotaProtegida`. **Esse elo não existia**: a v2
> ficou pronta e desligada, e quando `definir_v2_org(org, true)` foi executado para
> `cmam.caldeiras` em 05/08, o bundle continuou na v1 contra um servidor já migrado. Resultado
> medido: a guarda `trg_guardar_app_storage` recusava TODA escrita direta
> (`nr13_escrita_direta_bloqueada`), a v1 empilhava tudo em `nr13_fila_sync`, e a leitura
> estourava a cota antes de chegar em `nr13_info_` — 38 equipamentos no banco, zero na tela,
> `profiles.ultima_sync` parada em 05/08. Erro de rede na consulta **não rebaixa** para v1:
> rebaixar mostraria a conta vazia, que é o sumiço que este projeto conserta.
>
> **Herança do aparelho que vinha da v1** (`migracaoV1.ts`, aplicada por `storageV2.lerTudo`
> depois de uma hidratação bem-sucedida): a fila `nr13_fila_sync` é ADOTADA pela fila da v2
> (é onde estão as escritas recusadas — os equipamentos "que sumiram") e o cache v1 do
> `localStorage` é purgado, senão não sobra espaço para o palco. A purga só recua diante de um
> palco **vivo**; manifesto órfão (trava `nr13_palco_dono` vencida) sai junto — encontrado em
> produção travando a purga para sempre.
>
> **Drenagem automática:** a v2 nasceu sem o listener de `online` que a v1 tinha. Agora escuta
> `online` **e** `visibilitychange` (no celular a rede volta com a aba em segundo plano e
> nenhum evento `online` chega à página). O selo da topbar (`SyncStatus`) conta pendências por
> `storage.contarPendencias()` — lia direto o `nr13_fila_sync` e anunciava "Sincronizado" com
> trabalho de campo inteiro parado no aparelho.

| | v1 (`storageV1.ts`) | v2 (`storageV2.ts`) |
|---|---|---|
| Cache | `localStorage`, teto de 5 MB | `Map` em memória + IndexedDB `nr13_dados_<org_id>` |
| Escrita | upsert direto | RPC `aplicar_mutacao_storage` + fila transacional |
| Remoção local | apagava chave ausente no servidor | **só tombstone explícito** |
| Offline | `lerTudo` devolvia `{}` | devolve snapshot do `Map` |

> **REGRA QUE NÃO SE QUEBRA:** na v2 nada é apagado localmente por não ter voltado do
> servidor. Era o apagar-por-ausência que transformava qualquer falha de rede ou de cota
> em sumiço de dado.

Na v2 o `localStorage` vira só o **PALCO** (`palco.ts`): antes de abrir um documento, o app
materializa ali as chaves daquela TAG, monta os iframes e limpa depois — os 40+ templates
HTML **não mudaram**. O palco tem dono exclusivo por aba (`palcoTrava.ts`), orçamento de
3.400 KB, degradação de imagem em passos fixos (qualidade 0,60/0,45/0,35, depois largura
900/700/560) e materialização tudo-ou-nada com restauração dos valores anteriores.

> **SÓ VAI PRO PALCO O QUE ALGUM TEMPLATE LÊ** (`FORA_DO_PALCO`). O orçamento é de 3.368 KB
> por DOCUMENTO (3.400 menos a margem), e é o limite do navegador, não do sistema — o dado
> mora no IndexedDB/Supabase sem esse teto. Antes de deixar uma família de chave entrar no
> palco, confira por varredura em `public/` que alguma folha realmente a lê. Já saíram por
> isso: `nr13_docs_`, `nr13_pront_fab_` (05/08) e `nr13_componentes_cal_`/`nr13_lotes_cal_`
> (11/08 — a foto base64 de cada válvula/manômetro; 2.518 KB dos 3.959 KB de um documento na
> conta `gabriel.dadona`, recusando o relatório inteiro por foto que nenhuma folha imprime).
>
> **E TUDO QUE ALGUM TEMPLATE LÊ PRECISA IR (13/08/2026).** A regra acima só cuidava do
> excesso; a falta é o defeito mais caro, porque é SILENCIOSO — a folha cai no `|| '{}'`,
> imprime "-" e ninguém vê erro nenhum. Faltavam quatro famílias, e cada uma virou uma queixa
> separada do usuário: `nr13_relatorio_meta_atual` (a 2ª chave mais lida do sistema, 36
> ocorrências) deixava a CAPA com "Nº RELATÓRIO / DATA INSPEÇÃO / VALIDADE: -" mesmo com o
> modal Configurações preenchido, e a folha INSPECOES sem marcar natureza, tipo de exame nem
> resultado; `nr13_rastreab_` deixava "INSTRUMENTO DE MEDIÇÃO UTILIZADO" com "--" no
> ULTRASSOM; `nr13_calibracao_item_` deixava o certificado de calibração em branco; e
> `nr13_prontuario_` (lida pela PLACA) nem família tinha em `familiasChave` — caía em
> 'global', então não ia para o palco e nem era apagada por `excluirVaso`.
> `nr13_calibracao_item_` entra FILTRADA pela lista de `nr13_calibracoes_<TAG>`, não por
> varredura de prefixo: ela é global por organização, e varrer traria o parque inteiro.
> `nr13_historico_relatorios` é o caso raro do meio-termo — é lida (`LIVRO-REGISTRO.html`) e
> mesmo assim fica em `FORA_DO_PALCO`, porque cresce sem teto (224 KB e subindo) e desde
> §7-ter o `ro=1` já faz o que ela fazia. **`palco.varreduraTemplates.test.ts` varre `public/`
> e quebra se aparecer chave nova sem cobertura** — a conferência que antes era manual.
>
> **A degradação só recomprime `nr13_fotos_`** (`ehChaveDeFoto`). As fotos de campo que vêm
> em `nr13_inspecao_atual`/`nr13_injecao_atual` (640 KB × 2, duplicação obrigatória do §2)
> NÃO degradam — é o teto que volta a apertar conforme a inspeção cresce, e o que a Fase 2
> (fotos no bucket) resolve de vez.

Módulos: `db` (IndexedDB por org), `cacheLocal` (Map + índice por TAG), `familiasChave`
(tabela explícita prefixo→escopo — a dedução por regex errava em `nr13_med_esp_`,
`nr13_livro_config_` e `nr13_minha_empresa`), `sync` (fila + tombstones + drenagem),
`errosSync`, `manifesto`, `quotaDispositivo`, `palco`/`palcoTrava`, `ponteTemplates`,
`sessaoArmazenamento`, `flag`, `gateEscrita`.

SQL em `supabase/armazenamento_v2.sql` — aplicado em produção em 05/08/2026 com
`v2_ativa` **desligada** em todas as organizações. Ver `PENDENCIAS.md`.

### Como o documento puxa as informações (chaves de `localStorage`)

Tudo que o usuário salva pode ser fonte de injeção. Chaves por TAG do equipamento e globais:

| Chave | Conteúdo | Origem (onde o usuário salva) |
|---|---|---|
| `nr13_info_<TAG>` | Dados cadastrais do equipamento | Ficha em "Equipamentos" |
| `nr13_calc_<TAG>` | Resultados do memorial: `pmta`, `pth` (MPa), `memorialHTML`, `logCalculo` e `componentes[]` (array estruturado por componente: nome, pmtaMpa, tReqMm, tNom, E, S, D, raio, ca, material, fórmulas) consumido pelo RESUMO-MEMORIAL | "Salvar Memorial Completo" |
| `nr13_vaso_<TAG>` / `nr13_vaso_ac_corpo_<TAG>` | Componentes/cálculo do memorial | Memorial |
| `nr13_vaso_cald_<TAG>` | Dados do memorial de caldeira (ASME I: costado/tubo/espelho) | Memorial da caldeira |
| `nr13_cat_<TAG>` | Categoria de risco | Calculadora de categoria |
| `nr13_emp_<TAG>` | Empresa/cliente do equipamento | Cadastro de cliente |
| `nr13_fotos_<TAG>` | Fotos da capa/equipamento | Ficha |
| `nr13_med_esp_<TAG>` | Medição de espessura (ultrassom/ME) | Inspeção |
| `nr13_pref_unidade_<TAG>` | Unidade de medida da ficha | Ficha (Seletor de Unidade) |
| `nr13_minha_empresa` | Dados + logo da empresa executante | "Minha Empresa" |
| `nr13_lista_phs` | Profissionais habilitados / engenheiros (assinatura) | Funcionários |
| `nr13_calibracao_item_<id>` | Certificado de calibração | Calibrações |
| `nr13_livro_<TAG>` / `nr13_livro_config_<TAG>` | Livro de registro de segurança | Auto + config |
| `nr13_vida_<TAG>` | Vida remanescente (taxa de corrosão, vida, próxima inspeção) | Card "Vida Remanescente" na ficha |
| `nr13_rastreab_<id>` | Certificado de calibração do instrumento PADRÃO (PDF base64 fixo, **um por `tipoInstrumento`** entre os ATIVOS: ultrassom/manômetro/válvula/bloco/pressostato/termostato/manovacuômetro/termômetro/outro). Injeção **automática por tipo**: relatório NOVO usa `rastreabilidadesParaRelatorio(documentos)`; relatório ABERTO usa `rastreabilidadesDoRelatorioAberto` (prefere `meta.rastreabIds` congelado). **IMUTABILIDADE (soft-replace)**: editar/excluir NUNCA apaga — grava versão nova (id novo) e marca a antiga `substituidoEm`; substituída sai da lista/prefill/injeção nova mas segue resolvível por id para relatórios salvos. `injetarNoRelatorio` voltou a VALER (30/07/2026): é a caixinha "Injetar no final do relatório" do card — `injetaNoRelatorio(r)` filtra em `rastreabilidadesParaRelatorio`, e **ausente = marcado** (registro legado nunca perde o anexo). `tags[]` segue LEGADO. **O PDF NÃO fica no localStorage** (ver §2-bis): no cache o registro vem com `pdfBase64: ''` + `temPdf`/`pdfBytes`; use `temPdfDe(r)` (síncrono, p/ UI) e `await resolverPdf(r)` (IndexedDB → Supabase) para o arquivo. Só os 3 tipos com rota de injeção são cadastráveis: `ultrassom` (bloco padrão de espessura), `manometro`, `valvula` | Menu **Certificados** (`/certificados`) |
| `nr13_permissoes_<userId>` | Módulos permitidos do sub-login ({ modulos: string[] }) | Acessos (mestre) |
| `nr13_componentes_cal_<TAG>` | Válvulas/manômetros cadastrados (nome, série, foto) | Calibrações → Componentes |
| `nr13_lotes_cal_<TAG>` | Lotes/rodadas de calibração (certificados ganham loteId/componenteId) | Calibrações → Lotes |
| `nr13_agenda_notas` | Anotações do usuário no calendário (`NotaAgenda[]`: data `AAAA-MM-DD`, título, tipo, TAG opcional, observações). **Controle pessoal** — não alimenta relatório, prontuário, livro nem cálculo de vencimento, e nenhum template de `public/` lê, então NÃO entra no palco (a lista `GLOBAIS` do `palco.ts` é explícita) | Dashboard → Agenda (`src/features/agenda/notasAgenda.ts`) |
| `nr13_demo_seed` | Marcador do seed de demonstração do trial (`{v,em}`) — impede reinjetar os dados DEMO-* | `src/services/demoSeed.ts` (1ª entrada do trial) |
| `nr13_assinatura_status` / `nr13_assinatura_ate` | Espelho LOCAL da assinatura (ver §11). Só desenha UI e corta ação no bundle — quem decide é a RLS | Gravadas no login por `carregarPerfil` (RPC `assinatura_org()`) |
| `nr13_assinatura_sucesso_pendente` | Marca que falta exibir o modal "Assinatura confirmada" (quem fechou a aba antes do polling detectar) | `ModalAssinatura` / consumida no `Layout` |
| `nr13_rel_<id>_<TAG>` | UM relatório salvo, completo (`RelatorioSalvo`: documentos, meta com os snapshots congelados do §7-bis, `pdfRef`/`sha256`, `livroSnapshot`). A TAG fica no FIM porque a Edge `portal_cliente` filtra por `endsWith('_'+tag)`; o prefixo é `nr13_rel_` e não `nr13_relatorio_` para NÃO colidir com `nr13_relatorio_meta_atual` em filtros por prefixo. **Fora do palco** — nenhuma folha o lê | "Salvar" do relatório |
| `nr13_historico_indice_<TAG>` | Índice LEVE do histórico do equipamento (`RelatorioIndiceItem[]`: id, código, nome, tipo, datas, `pdfRef`, `sha256`) — é o que a lista, o Dashboard, `listarVencimentos` e o Portal leem. É DERIVADO: `listarIndice` reconstrói do registro o que faltar, então perder o índice numa corrida entre aparelhos nunca some com o relatório. **Fora do palco** | Gravado junto com o relatório |
| `nr13_historico_relatorios` | **LEGADO** (até 14/08/2026): array com o histórico da organização inteira. Só LEITURA — fallback enquanto a migração não roda em todo aparelho. Encolhe ao excluir um relatório; nunca cresce. Fora do palco (§7-sexies) | — |
| `nr13_relatorio_meta_atual` | Metadados do relatório em montagem | Gravado na geração |
| `nr13_inspecao_atual` **e** `nr13_injecao_atual` | Dados de campo do container escolhido | Gravado na geração |
| `nr13_prontuario_meta_<TAG>` | Nº do relatório (`REL-<timestamp>`) + data de emissão do prontuário; reusado entre reimpressões (`obterOuCriarMeta`) | Gravado ao abrir o visualizador do prontuário |
| `nr13_assinantes_pront_<TAG>` | Assinantes do prontuário (`{engenheiroId, tecnicoId}` de `nr13_lista_phs`) — lido por `pront-assinatura.js` nas 6 folhas | Selects Engenheiro/Técnico no visualizador do prontuário |
| `nr13_assinantes_rel_<TAG>` | Assinantes do relatório (`{engenheiroId, tecnicoId}`) — fallback LEGADO do `rel-assinatura.js` (fonte primária: snapshot `meta.assinantes`, ver §7-bis); espelhado em `meta.phNome/phCrea/tecnicoNome` | Selects no modal Configurações do Relatório |
| `nr13_laudo_<TAG>` | Laudo da conclusão (`{apto, relatorioCodigo, atualizadoEm}`) — alimenta o selo APTO/INAPTO do livro de registro | Checkbox SIM/NÃO da CONCLUSAO.html |
| `nr13_croqui3d_<TAG>` | **LEGADO** (render 3D removido em 11/07/2026): PNG antigo do croqui 3D; nenhum código grava mais — PRONT-ULTRASSOM só lê como fallback de dados antigos | — (só leitura de legado) |
| `nr13_modelo3d_<TAG>` | Modelo do editor de Croqui 2D (`ModeloVaso`: diâmetro, comprimento, casco, virolas, tampos, bocais, suporte) — nome da chave mantido por compatibilidade | Editor de Croqui 2D (Prontuários → botão "Croqui 2D do Equipamento") |
| `nr13_croqui2d_<TAG>` | SVGs 2D gerados no save do editor: `{ longitudinal, transversal, detalheTampo }` | Editor de Croqui 2D (save) → PRONT-CROQUI2D.html + croqui da folha 1 (PRONT-ULTRASSOM.html) |
| `nr13_folha_dados_<TAG>` | Payload derivado do modelo (`FolhaDadosDerivada`: bocais, pesos, dimensões por componente, comprimento total, circunferência) para a folha de dados | Editor de Croqui 2D (save) → PRONT-FOLHA-DADOS.html |

> **REGRA CRÍTICA DE INJEÇÃO:** os dados de campo do container **devem ser gravados nas duas chaves**
> `nr13_inspecao_atual` **e** `nr13_injecao_atual` (ver `gravarInspecaoOrigemAtual`). Os templates não
> são uniformes: VERIFICACAO/checklist1-3/CHECKLIST-FOTOS leem `nr13_inspecao_atual`; VISUAL-EXTERNO/
> INTERNO, suas folhas de fotos, TESTE-HIDROSTATICO, ULTRASSOM e CERTIFICADO-CAL-* leem
> `nr13_injecao_atual`. Ao reabrir um relatório salvo, re-gravar `nr13_relatorio_meta_atual` e os
> dados do container **antes** de remontar os iframes, senão exibe dados do último relatório gerado.

### §2-bis — Campos pesados fora do localStorage (30/07/2026)

A cota do `localStorage` é de **~5 MB para a origem inteira**, dividida com todas as fotos de
inspeção. Medido em conta real: storage a **96%** (4888/5080 KB), com `nr13_rastreab_` sozinho
ocupando 1478 KB — metade disso em versões já substituídas. Nesse estado **nenhum PDF acima de
~144 KB conseguia ser salvo**, e certificado escaneado tem 200–800 KB. Era a causa da queixa
"o sistema não aceita meu PDF".

**Regra:** campos declarados em `CAMPOS_PESADOS` (`src/services/storage.ts`) NÃO vão para o
`localStorage`. Hoje há um: `pdfBase64` das chaves `nr13_rastreab_`.

- **localStorage** — registro enxuto: campo zerado + `temPdf: true` + `pdfBytes`. Os templates em
  iframe seguem lendo os metadados que usam (aparelho, nº série, validade) sem alteração nenhuma.
- **IndexedDB** (`src/services/pdfStore.ts`, db `nr13_pdfs`) — o arquivo, chaveado pela mesma
  chave do storage. Cota na casa das centenas de MB.
- **Supabase** — continua recebendo o registro **COMPLETO**. É ele que sincroniza o PDF entre
  aparelhos; o IndexedDB é repovoado na hidratação (`lerTudo`) e por `resolverPdf`.

**Ao consumir:** `temPdfDe(r)` para saber se existe arquivo (síncrono, para a UI) e
`await resolverPdf(r)` para obtê-lo (objeto → IndexedDB → Supabase). **Nunca** ler `r.pdfBase64`
direto: no cache ele vem vazio e o relatório sairia sem os certificados.

`aliviarCacheLocal()` roda uma vez por sessão no `lerTudo` e migra registros antigos ainda gordos.
Só é seguro mover um campo para cá se **nenhum template HTML o ler** — confira antes de somar
prefixos a `CAMPOS_PESADOS`.

---

## 3. Ficha do equipamento e o Memorial salvo

- Em **"Equipamentos"** ficam os cards. Clicar no card abre a **ficha** do equipamento.
- Ao calcular o memorial, o resultado fica salvo na ficha em **"Ver Memorial Completo"** e a partir
  dele injeta no resto da ficha.
- **O memorial injeta:** Volume (m³), PMTA (kgf/cm²) para cálculo de categoria (basta inserir o
  fluido para calcular a categoria), Tipo de Tampo, material, menor PMTA, PMTA do componente,
  espessura mínima requerida, Volume, etc.
- **Inserção manual:** dados do equipamento e a **espessura da parede de teste** (espessura "dona do
  vaso") que o memorial não calcula são preenchidos pelo usuário na ficha em "Equipamentos".

### Memorial de caldeira (ASME I-2004) e bocais opcionais

- **Caldeira** segue ASME I-2004: costado (PG-27.2.2: `e = P·D/(2·S·E+2·y·P) + C`), tubo
  (PG-27.2.1: `e = P·D/(2S+P) + 0,005·D + e`) e espelho (PG-46.1: `e = p·√(P/(S·C))`). Dados em
  `nr13_vaso_cald_<TAG>`; payload padrão (pmta/pth em MPa, componentes, memorialHTML) em
  `nr13_calc_<TAG>`. **PMTA = P de projeto convertida** (kgf/cm² = P×10,19716) e **TH = 1,5×PMTA**
  (não inverter a fórmula pela espessura; caldeira usa 1,5, vaso usa 1,3). Aprovação por etapa:
  espessura encontrada ≥ e calculada. NÃO chamar `atualizarCategoriaComPmta` para caldeira.
- **Bocais opcionais (UG-37/UG-40):** entram como componentes com id `bocal<N>` e tipo `'bocal'` em
  `nr13_vaso_<TAG>.componentes` — verificação de compensação de área (A1+A2+A3+A4 ≥ A_req). O bocal
  não tem PMTA própria, não entra no min() da PMTA nem nos `componentes[]` do RESUMO; reprovado
  derruba o resultado geral. `calcularResumoVaso` injeta `dadosCascoRef` do casco automaticamente.
- **GV do autoclave:** folhas MEMORIAL/RESUMO-MEMORIAL e `relatoriosService.linhasMemorial` mesclam
  `nr13_calc_gv_<TAG>` **na leitura** (nunca na gravação — ver bug documentado em
  `vasoMemorialService.ts`), exibindo o cálculo do GV logo abaixo do memorial principal.

---

## 4. Unidades de medida

- A unidade é definida **dentro da ficha** e reflete em todo o sistema, convertendo onde necessário.
- Alterar o grupo de unidade na ficha reconverte os dados em "Ver Memorial Completo" e em tudo salvo
  na ficha.
- **REGRA ABSOLUTA (exceção):** NUNCA converter as unidades do **cálculo da Categoria de Risco**.
  - **Enquadramento: (kPa) × (m³) > 8** — base confirmada (decisão de engenharia, mesma base do
    texto do checklist). NÃO usar kgf/cm² aqui.
  - Grupo de risco: (MPa) × (m³).
  - Ver `src/calc/categoria.ts` — recebe MPa/m³ e nunca toca nas unidades de exibição.

---

## 5. Layout, responsividade e impressão (todas as folhas)

- **Mobile:** todas as telas do sistema e telas/ferramentas de inspeção são responsivas. O
  preenchimento em campo pelo celular é a base do fluxo.
- **Impressão A4:** folhas de relatório e prontuário ajustam na impressão para sair exatamente a
  folha A4.
- **Sem quebra:** ao injetar/modificar conteúdo, nada pode ser cortado pelo limite da folha nem
  empurrar o rodapé para fora da margem.
- **Sem vazio:** não deixar grande espaço em branco; ajustar fontes/espaçamentos para proporção
  adequada do conteúdo na folha.

### Imagens / registros fotográficos (fotos da documentação, checklists, V.E., V.I. e TH)

- **Máx. 4 fotos por folha.**
- **Overflow (>4):** gera 2ª folha (e seguintes) com o mesmo cabeçalho/rodapé; a 1ª imagem da nova
  folha é a 5ª adicionada. (Ver `buildPages()` em `CHECKLIST-FOTOS.html` como referência.)
- **<4 fotos:** as 1/2/3 imagens se reajustam para ocupar a folha inteira, sem espaço vazio.

---

## 6. Inspeção mobile → fragmentação nas folhas do relatório

O usuário preenche **um arquivo único de inspeção** no celular (botão "Inspeções"): responde o
checklist e anexa fotos com descrição abaixo de cada item. Ao salvar no container, o sistema
**fragmenta** esse arquivo nos documentos do relatório, **nesta ordem**:

1. **Verificação da documentação** — só a lista de perguntas/verificações da documentação.
2. **Checklist 1, 2, 3** — só as listas relativas a eles.
3. **Fotos da documentação** (`FOTOS-DOCUMENTACAO.html`) — folha dedicada, só as fotos da etapa de
   documentação (grupo `fotosDocumentacao` do checklist). Auto-injetada após checklist3.
4. **Fotos do checklist** (`CHECKLIST-FOTOS.html`) — folha dedicada, fotos dos checklists 1-3.
5. **Vis. Externo** — perguntas/respostas do checklist "visual externo".
6. **Registro Foto V.E** — folha com as imagens do visual externo.
7. **Vis. Interno** — perguntas/respostas do checklist "visual interno".
8. **Registro Foto V.I** — folha com as imagens do visual interno.

As folhas de fotos (CHECKLIST-FOTOS, VISUAL-*-FOTOS, TESTE-HIDROSTATICO-FOTOS) e o TERMO-ABERTURA
são **auto-injetados** por `montarListaComTermoAbertura()` logo após sua folha-pai — não entram em
`DOCUMENTOS_DISPONIVEIS` e não são selecionados manualmente (evita duplicação).

---

## 7. Organização do Relatório — ORDEM DE MONTAGEM E INJEÇÃO (fixa)

Esta é a ordem canônica. `DOCUMENTOS_DISPONIVEIS` em `src/features/relatorios/tipos.ts` deve segui-la,
e a auto-injeção insere as folhas de fotos/termo nas posições indicadas.

| # | Documento | Arquivo | Injeta de |
|---|---|---|---|
| 1 | Capa | `CAPA.html` | ficha do equipamento |
| 2 | Sumário | `SUMARIO.html` | — |
| 3 | Placa | `PLACA.html` | ficha; PMTA em 3 unidades (converter) |
| 4 | **Caracterização** | `CLASSIFICACAO-RISCO.html` | dados do equipamento + categoria de risco |
| 5 | Prontuário | `PRONTUARIO.html` | memorial (fórmulas) + PMTA/PTH em kgf, bar, mpa |
| 6 | Resumo Memorial | `RESUMO-MEMORIAL.html` | ficha + fórmulas do "Ver Memorial" (não fixas); PMO/PMTA em MPa, kgf, bar |
| 7 | Memorial 1, 2, 3… | `MEMORIAL1/2/3.html` | cálculo de "Ver Memorial Completo"; folhas conforme tamanho do cálculo |
| 8 | Resumo do que foi inspecionado | `INSPECOES.html` | ficha + categoria |
| 9 | Verificação da documentação | `VERIFICACAO-DOCUMENTACAO.html` | só perguntas de documentação |
| 10 | Checklist 1, 2, 3 | `checklist1/2/3.html` | só as listas deles |
| 11 | **Fotos da documentação** | `FOTOS-DOCUMENTACAO.html` *(auto após checklist3)* | fotos da etapa de documentação (`fotosDocumentacao`) |
| 12 | Fotos do checklist | `CHECKLIST-FOTOS.html` *(auto-injetado após checklist3)* | fotos dos checklists 1-3 |
| 13 | Vis. Externo | `VISUAL-EXTERNO.html` | checklist "visual externo" |
| 14 | Registro Foto V.E | `VISUAL-EXTERNO-FOTOS.html` *(auto após VE)* | imagens do visual externo |
| 15 | Vis. Interno | `VISUAL-INTERNO.html` | checklist "visual interno" |
| 16 | Registro Foto V.I | `VISUAL-INTERNO-FOTOS.html` *(auto após VI)* | imagens do visual interno |
| 17 | Resultado inspeção e laudo | `CONCLUSAO.html` | — |
| 18 | ME | `ULTRASSOM.html` | medição de espessura |
| 19 | TH | `TESTE-HIDROSTATICO.html` | gráfico do TH + dados do equipamento |
| 20 | Fotos do TH | `TESTE-HIDROSTATICO-FOTOS.html` *(auto após TH)* | descrição breve + fotos do TH |
| 21 | Registro Seg. | `LIVRO-REGISTRO.html` *(TERMO-ABERTURA auto antes, se 1ª inspeção)* | livro de registro |
| 22 | Calibrações | `CERTIFICADO-CAL-MANOMETRO.html` / `CERTIIFCADO-CAL-PSV.html` | injetado ao fim — seção "Calibrações" do Modal lista as **3 últimas** calibrações (lote = 1 item); marcar um LOTE injeta **todas** as folhas `?calibId=` dele + põe o lote na fila de vínculo (`vincularProximoRelatorio` → validades do histórico) + os PDFs dos certificados PADRÃO por tipo entram no export/impressão (ver `nr13_rastreab_`) |

### §7-bis — Motor de assinatura do RELATÓRIO (carimbo flutuante, 14/07/2026)

- `public/rel-assinatura.js` (incluído em todas as folhas do relatório EXCETO `CAPA.html`,
  `SUMARIO.html`, `CAPA-LIVRO-REGISTRO.html` e `CERTIFICADO-CAL-*` — certificados têm assinatura
  própria/independente) sobrepõe **carimbos compactos** (engenheiro + técnico) em posição
  `absolute` logo acima do rodapé de cada `.page`/`.pagina` — **não empurra conteúdo**.
- **Filtro por folha:** cada assinante carimba só as folhas marcadas em `folhasRelatorio[]`
  (Funcionários; lista = `FOLHAS_RELATORIO_ASSINAVEIS` = `DOCUMENTOS_DISPONIVEIS` sem capa/sumário;
  default: Engenheiro todas, Inspetor nenhuma). Folhas auto-injetadas seguem a folha-pai
  (`*-FOTOS` → folha do ensaio; `FOTOS-DOCUMENTACAO`/`checklist1` → VERIFICACAO-DOCUMENTACAO;
  `CHECKLIST-FOTOS` → checklist3; `TERMO-ABERTURA` → LIVRO-REGISTRO, e no termo só o engenheiro).
- **Imutabilidade do relatório salvo:** na geração, `RelatorioMeta` congela `empresa` (cópia de
  `nr13_minha_empresa`) e `assinantes` (snapshots com nome, cargo, CREA, rubrica, camposExtras,
  folhasRelatorio). Os iframes do visualizador rodam com `&ctx=rel`; com esse param,
  `rel-empresa.js` e `rel-assinatura.js` usam os snapshots da meta — trocar rubrica/logo/cadastro
  depois NÃO altera relatório salvo. Sem `ctx=rel` (livro standalone etc.) ou sem snapshot
  (relatórios antigos), caem no dado vivo (`nr13_assinantes_rel_<TAG>` + `nr13_lista_phs`).
  Duplicar = relatório novo → snapshots refeitos com o estado atual; selects de assinante ficam
  desabilitados em relatório salvo (somenteLeitura).
- **Calibrações também congelam (20/07/2026):** `meta.certCalibracoes` (dados das folhas
  `?calibId=`, lidos pelos templates CERTIFICADO-CAL-* com preferência sobre a chave viva) e
  `meta.rastreabIds` (versões dos certificados padrão — ver soft-replace em `nr13_rastreab_`).
  Editar calibração/certificado depois NÃO altera relatório salvo; retrofit na 1ª reabertura
  de relatórios antigos, igual empresa/assinantes.

### §7-quater — RELATÓRIO FINALIZADO É UM ARQUIVO, NÃO UMA RECEITA (12/08/2026)

> **REGRA QUE NÃO SE QUEBRA:** relatório com `pdfRef` NÃO é remontado. Visualizar,
> imprimir, baixar e o Portal do Cliente servem o **arquivo**. `documentos` e `meta`
> continuam gravados só para auditoria.

Até aqui, salvar gravava a RECEITA (lista de templates + campos) e reabrir remontava os 27
templates com os dados **vivos**. Consequências medidas em produção: editar a ficha mudava a
Capa/Placa/Caracterização de relatório assinado; mexer no checkbox da conclusão mudava o
APTO/INAPTO de laudo antigo; corrigir uma margem num `.html` reescrevia todo documento já
emitido; e no Portal bastava o DevTools para adulterar o DOM e baixar um PDF falso com a logo
e a assinatura do engenheiro.

**No "Salvar"** (`Relatorios.tsx:salvarHistorico`), nesta ordem, e cada passo importa:
drenar a ponte → congelar `livroSnapshot` → `gerarPdfBytes` (com progresso) → SHA-256 →
upload em `<org>/relatorios/<uuid>.pdf` → só então gravar o histórico. Falha em gerar ou
subir **NÃO salva**.

`RelatorioSalvo` ganhou `pdfRef`, `sha256`, `geradoEm`, `paginas`, `pdfPendente`,
`livroSnapshot` — todos **opcionais**: sem `pdfRef` o relatório é legado e segue o fluxo
antigo. **Não há retrofit automático**: gerar o PDF ao abrir um relatório antigo produziria um
documento com os dados de HOJE carimbado como "o artefato daquela emissão".

Peças: `features/relatorios/artefatoRelatorio.ts` (hash, publicação, `artefatoDe`),
`components/VisualizadorPdf.tsx`, `pdfService.gerarPdfBytes`. Reusa a fila offline das fotos
(`fotos.salvarArquivo`), e `pdfPendente` vem de `fotos.arquivoPendente` — **nunca** de
`navigator.onLine`, que mente quando o servidor recusa com o navegador online.

### §7-quinquies — LIVRO DE REGISTRO: LACRE + TRAVA NO BANCO (12/08/2026)

Cada entrada nasce lacrada (`livroLacre.ts`): `sha256` do conteúdo canônico, `shaAnterior`
(elo da anterior) e `lacradaEm`. ~180 bytes por entrada, nenhum arquivo — congelar o livro
inteiro em PDF a cada inspeção cresceria ao quadrado, e a folha daquela inspeção já está
dentro do PDF imutável do relatório.

**Serialização CANÔNICA** (chaves ordenadas, sem os campos do lacre): sem isso um
`{...entrada}` reordenado acusaria de adulterada uma entrada íntegra, e o selo viraria ruído.
Entrada sem `sha256` é ANTIGA, não adulterada.

**A trava que impede vive no banco** — `supabase/livro_imutavel.sql`, aplicado em 12/08/2026.
O lacre DETECTA; detectar não é impedir (uma chamada à RPC pelo console alterava entrada
emitida). A regra: a sequência de entradas lacradas do valor novo precisa começar exatamente
pela do valor antigo. Recusa editar, apagar, reordenar e forjar o hash; permite acrescentar ao
fim, inserir ocorrência manual e retificar. Porta de manutenção: `set local nr13.manutencao = '1'`.

### §7-sexies — HISTÓRICO: 1 REGISTRO POR RELATÓRIO + ÍNDICE LEVE (14/08/2026)

> **REGRA QUE NÃO SE QUEBRA:** salvar um relatório grava DUAS chaves — o registro
> daquele relatório e o índice daquele equipamento. Nunca o histórico inteiro.

O histórico da organização vivia numa chave só, `nr13_historico_relatorios`, e cada
entrada carrega os snapshots congelados do §7-bis: `meta.empresa` com a LOGO em base64,
`meta.assinantes` com duas rubricas PNG, `meta.certCalibracoes` e o `livroSnapshot` —
~110 KB por relatório, medidos na conta `engyuricesar`. Salvar reescrevia o array
inteiro; a hidratação incremental (§2-ter) trazia a linha INTEIRA de volta em todo boot,
porque ela muda a cada emissão; e `listarVencimentos` fazia `JSON.parse` de tudo para ler
quatro datas. Com 100 relatórios: 10,8 MB reescritos e retransmitidos por emissão.

Modelo: `nr13_rel_<id>_<TAG>` (o relatório, a VERDADE) + `nr13_historico_indice_<TAG>`
(a lista) + `nr13_historico_relatorios` (legado, só leitura). Medido com 100 relatórios:
reescrita por save **10,8 MB → 170 KB**, leitura para listar **10,8 MB → 60 KB**.

**O conteúdo do `RelatorioSalvo` NÃO mudou.** Os snapshots continuam snapshots dentro do
registro — trocá-los por referência a dado vivo desfaria o §7-bis. Só o contêiner mudou.
`pdfRef` + `sha256` (§7-quater) seguem sendo a fonte do documento finalizado.

**Concorrência sem RPC nova:** o índice é DERIVADO. Dois aparelhos salvando relatórios do
mesmo equipamento ao mesmo tempo fazem a última gravação do índice vencer — mas os dois
REGISTROS existem em chaves distintas, e `listarIndice` recompõe o que faltar varrendo as
chaves daquela TAG (índice explícito da v2, não varredura do cache). Perder o índice custa
uma listagem mais lenta; perder o registro custaria o relatório.

**Migração** (`migrarHistoricoEmSegundoPlano`, chamada no `RotaProtegida` depois da
hidratação): idempotente, valida a contagem por equipamento e **não apaga o legado** — ele
é o backup e o fallback de quem ainda não rodou o código novo. Conta somente leitura
(Portal, assinatura vencida) não migra. O único caminho que ainda reescreve o array antigo
é a EXCLUSÃO de um relatório, e lá ele só encolhe.

### §7-ter — RELATÓRIO SALVO NÃO SE EDITA (05/08/2026)

> **REGRA QUE NÃO SE QUEBRA:** relatório salvo é registro técnico assinado. Depois do
> "Salvar", NENHUM caminho do sistema pode alterar o documento — nem a UI React, nem o
> conteúdo dentro do iframe, nem as chaves por TAG que a folha grava. Quem quiser mudar
> alguma coisa usa **Duplicar** (nasce editável, com snapshots refeitos).

**Causa raiz do bug** (relatório salvo continuava editável): `somenteLeitura`
(`Relatorios.tsx`) é estado React e só alcançava a **UI React** — modal de configurações,
selects de assinante, botão Salvar. O conteúdo do relatório **não mora no React**: mora nos
27 templates de `public/arquivos-inspecao/`, que são preenchíveis por design
(`contenteditable`, `input`, `div` com `onclick`). A flag nunca era propagada para o iframe.
Pior: 3 templates **persistem** o que é digitado via `window.sbSalvar` —
`ULTRASSOM.html` (`nr13_med_esp_`, `nr13_med_grid_`) e `CONCLUSAO.html` (`nr13_laudo_`) —
contaminando o prontuário e os próximos relatórios da mesma TAG.
(`LIVRO-REGISTRO.html` já tinha trava própria, via `relatorioJaSalvo`.)

**Três camadas, e as três precisam existir** — a de DOM é visual e pode ser burlada pelo
DevTools; a de dados é quem realmente protege:

| Camada | Onde | O que faz |
|---|---|---|
| 1 · DOM | `src/features/documentos/somenteLeituraDoc.ts`, aplicada por efeito em `Relatorios.tsx` | `contenteditable=false`, `readOnly`, CSS de trava e bloqueio em **captura** de `beforeinput/keydown/keypress/paste/cut/drop/dragstart/click/dblclick`. `click` está na lista porque **todo `onclick` inline dos templates é ação de edição** (`selOpt`, `toggleCb`, `selectSN`, `removerFoto`, trocar logo/foto). `mousedown` fica **de fora** de propósito: sem ele o usuário não conseguiria selecionar e copiar texto. `MutationObserver` reaplica, porque os templates montam conteúdo depois do `DOMContentLoaded`. |
| 2 · Dados (iframe) | `public/sb-storage.js` | Com `ro=1` na query, `window.sbSalvar` **retorna sem gravar** — nada entra na ponte. Mesmo lugar do gate do papel `cliente`. |
| 3 · Dados (app) | `usePalcoDocumento` | Em documento somente leitura **não drena** `nr13_fila_ponte`. |

`paramsSomenteLeitura(true)` → `&ro=1` na URL do iframe. `documentoSomenteLeitura(search)` é
o espelho do gate do `sb-storage.js` do lado do app, para a regra ter **um único teste de
verdade** (`somenteLeituraDoc.test.ts`): mudar um sem o outro quebra o teste.

**Ordem que importa em `salvarHistorico()`:** drenar a ponte → `setSomenteLeitura(true)` →
`setVersao(v+1)`. Trancar antes de drenar **descarta** a medição de espessura/laudo digitada
enquanto o relatório ainda era editável. O bump de versão remonta os iframes para a folha
nascer já com `ro=1`.

Guardas de dados nos handlers (o gate visual do botão/`disabled` não basta):
`trocarAssinanteRel`, `trocarAssinanteTermoLivro`, `atualizarMetadados`, `setCampoMeta` e
`salvarHistorico` retornam cedo com `somenteLeitura`. `visualizar()` chama
`carregarAssinantesRel(..., { gravar: false })` — abrir um relatório salvo não pode regravar
`nr13_assinantes_rel_<TAG>`, que é chave viva compartilhada.

**Fora da regra, de propósito:** renomear (rótulo do histórico, não altera o documento),
excluir, e o retrofit de snapshots na 1ª reabertura de relatório antigo (§7-bis) — esse
último congela o que faltava, ou seja, protege a imutabilidade em vez de violá-la.

O Portal do Cliente usa a **mesma** trava (`travarIframeSomenteLeitura`), agora em
`features/documentos/` por ser compartilhada — antes vivia em `features/portal/`.

---

## 8. Prontuário

O prontuário deve puxar automaticamente: o **cálculo** (memorial), o **croqui 2D**
(`nr13_croqui2d_<TAG>`), a **logo e dados da empresa** (`nr13_minha_empresa`), e os dados do
**engenheiro responsável** para **assinar** (`nr13_lista_phs`). `PAGINAS_PRONTUARIO`
(`src/features/prontuarios/tipos.ts`) define as 6 folhas, nesta ordem fixa:

1. `PRONT-ULTRASSOM.html` — grade de espessuras (ultrassom) + croqui (SVG longitudinal do croqui
   2D; fallback: PNG legado `nr13_croqui3d_` → "Croqui não gerado") + rastreabilidade dos
   instrumentos + responsabilidade técnica.
2. `PRONT-CROQUI2D.html` — croqui 2D cotado (SVG gerado em runtime) + tabela de dimensões reais.
3. `PRONT-FOLHA-DADOS.html` — prancha técnica do equipamento.
4. `PRONT-PRONTUARIO.html` — dados construtivos + categorização de risco.
5. `PRONT-CONTINUACAO.html` — procedimentos, dispositivos de segurança e pontos de atenção.
6. `PRONT-MEMORIAL.html` — resumo dos cálculos do memorial.

Rodapés das 6 folhas são **sem paginação** (nº de página/total não impresso).

**Motor de assinatura (prontuário — implementado 13/07/2026):** Funcionários (`nr13_lista_phs`)
guarda por funcionário: `funcao` (cargo exibido), `camposExtras[{rotulo,valor}]`,
`folhasProntuario[]`/`folhasRelatorio[]` (quais folhas ele assina — pré-setado no cadastro;
default: Engenheiro todas / Inspetor nenhuma, inclusive para registros antigos sem o campo).
O visualizador do prontuário tem selects de Engenheiro/Técnico que gravam
`nr13_assinantes_pront_<TAG>` (`{engenheiroId, tecnicoId}`) antes de remontar os iframes.
`public/pront-assinatura.js` (incluído nas 6 folhas, antes do script inline) preenche o bloco
"Responsabilidade Técnica" com nome, função, CREA/Registro, campos extras e a imagem da
assinatura, respeitando `folhasProntuario` de cada assinante (não assina a folha → coluna limpa).
**Fallback:** sem a chave de assinantes ou ambos vazios → a folha mantém a assinatura fictícia
de exemplo ("Fulano Da Silva"). **Relatório: motor próprio em modo carimbo (ver §7-bis).**
Certificados de calibração ainda usam o fluxo antigo (ver PENDENCIAS.md).

> **AS FOLHAS 2 e 3 SÓ EXISTEM PARA VASO DE PRESSÃO (13/08/2026).** `PRONT-CROQUI2D` e
> `PRONT-FOLHA-DADOS` derivam do mesmo modelo do editor de croqui, que nunca soube desenhar
> caldeira nem autoclave — o prontuário delas saía com um desenho genérico que não é o
> equipamento e uma tabela de dimensões vazia, num documento assinado por engenheiro.
> `paginasProntuario(tipo)` (`features/prontuarios/tipos.ts`) é a fonte única: dela saem os
> iframes do visualizador, o `page`/`total` de cada folha e — porque impressão e PDF
> rasterizam `.prontuario-preview` — também o papel e o arquivo. O Portal do Cliente usa a
> MESMA função (`info.tipo` do equipamento), senão o cliente receberia duas folhas que o
> engenheiro não vê. O botão "Croqui 2D do Equipamento" também passou a aparecer só para
> vaso.

`PRONTUARIO-RECONSTITUICAO-1..4` **não fazem parte** do prontuário — seguem como folhas do
**relatório** (ver §7).

Ao abrir o visualizador do prontuário (`Prontuarios.tsx`, antes de montar os iframes), o app grava
`obterOuCriarMeta(tag)` em `nr13_prontuario_meta_<TAG>` (nº do relatório + data de emissão, reusado
entre reimpressões). O croqui vem direto de `nr13_croqui2d_<TAG>` — nada é regravado na abertura.

**Editor de Croqui 2D (ex-Modelador; render 3D removido em 11/07/2026 — sem three.js):** overlay
com formulário (`PainelElementos`) + preview 2D ao vivo (`gerarCroquis2d`, função pura sobre
`ModeloVaso`). O save alimenta a folha 1 (SVG longitudinal), a folha 2 (`nr13_croqui2d_<TAG>` —
SVGs substituem o desenho genérico do `PRONT-CROQUI2D.html`) e a folha 3 (`nr13_folha_dados_<TAG>`
— bocais, pesos e dimensões reais do `PRONT-FOLHA-DADOS.html`). Sem o modelo salvo, as folhas
mantêm o comportamento genérico/vazio de sempre (fallback).

**Croqui 2D é OPCIONAL e vive só no Prontuário** (gates removidos em 20/07/2026 a pedido do
usuário): o memorial salva sem abrir o editor e "Ver Memorial Completo" da ficha abre o documento
direto. Único ponto de edição: botão "Croqui 2D do Equipamento" em Prontuários. O editor continua
pré-preenchendo do memorial ao abrir (`carregarOuPreCarregar` re-sincroniza Ø, espessuras, tampos,
material e bocais do `nr13_vaso_<TAG>`, preservando comprimento/virolas/suporte já digitados;
comprimento sugerido pelo volume de `nr13_cat_<TAG>` quando vazio). Sem croqui salvo, as folhas
do prontuário usam os fallbacks ("Croqui não gerado" / desenho genérico).

---

## 9. Pendências conhecidas (gaps vs. esta estrutura)

> **LISTA VIVA: `PENDENCIAS.md` na raiz do repo** — checklist atual de pendências (deploy manual,
> fase do motor de assinatura, polimentos). REGRA: ao concluir um item de lá, REMOVER o item do
> arquivo e commitar (o arquivo encolhe até ser deletado). Os blocos abaixo são histórico
> detalhado; a lista viva é a fonte do que ainda falta.

> **Controle de Acesso multi-papel + Portal do Cliente + Sessão Única: CÓDIGO IMPLEMENTADO**
> (plano em `PLANO-CONTROLE-DE-ACESSO.md`). Pendências de DEPLOY (manuais, pelo dono do projeto):
> 1. Rodar `supabase/acesso_setup.sql` no SQL Editor do Supabase (idempotente; backfill
>    `org_id = user_id` mantém o comportamento atual até criar sub-logins).
> 2. Deploy das Edge Functions `org_admin` e `portal_cliente` (Dashboard → Edge Functions).
> 3. Conferir o trigger `handle_new_user`: não pode sobrescrever `org_id`/`papel`/`cliente_id`
>    (ver comentário no fim do acesso_setup.sql).
> O frontend tem fallback: antes do SQL, tudo segue por `user_id` (deploy do código é seguro).
> Peças: `src/services/{auth,storage,orgAdmin}.ts`, `src/pages/Acesso.tsx`, `src/pages/portal/*`,
> guards em `src/app/Rota*.tsx`, seção "Acesso ao Portal" em Empresas.

> **Redesign "Forja" (03/07/2026):** design system em `design/` (fonte da verdade visual) —
> paleta steel/âmbar, sidebar escura, Space Grotesk/IBM Plex (self-hosted), sprite SVG próprio
> (`src/components/Icone.tsx`, sem lucide/emoji). Novidades: Dashboard com vencimentos
> (`src/services/vencimentos.ts`), rota `/equipamentos` (lista; `/dashboard` é o painel),
> `/vencimentos`, `/livro-registro`, Calibrações→Rastreabilidade (merge de PDF no relatório via
> pdf-lib em `rastreabilidadeService.ts`), Acessos com permissões por módulo
> (`src/services/permissoes.ts`, aplicadas no menu/rotas do Layout).

> **Google Maps/Places nos clientes (03/07/2026): PENDÊNCIAS DE DEPLOY (manuais, pelo dono do projeto)**
> A tela "Empresas" usa a chave `VITE_GOOGLE_MAPS_KEY` (arquivo `.env`, NÃO commitado) para a
> busca de empresas (Places API New, REST) e o mapa do detalhe do cliente (Maps Embed API).
> 1. **Criar a variável `VITE_GOOGLE_MAPS_KEY` no ambiente de deploy** (Vercel/Netlify/etc. →
>    Environment Variables). O `.env` local não vai no push; sem a variável no build de produção,
>    busca e mapa ficam desativados (o resto da tela funciona normal).
> 2. **Restringir a chave no Google Cloud Console** (APIs & Services → Credentials → a chave):
>    - Application restrictions: **HTTP referrers**, com os domínios do app
>      (ex.: `https://SEU-DOMINIO/*` e `http://localhost:*` para dev).
>    - API restrictions: permitir SOMENTE **Places API (New)** e **Maps Embed API**.
>    **Por quê:** chaves `VITE_*` ficam embutidas no bundle JavaScript público — qualquer pessoa
>    que abrir o site consegue ler a chave. Sem restrição, ela pode ser usada por terceiros em
>    outros sites/apps, consumindo sua cota e **gerando cobrança no seu cartão do Google Cloud**.
>    Com a restrição por referrer, a chave só funciona a partir do seu domínio; com a restrição
>    de APIs, mesmo vazada não serve para outros serviços do Google.
> 3. No painel do Google Cloud, ativar as APIs **Places API (New)** e **Maps Embed API** no
>    projeto da chave (sem isso a busca retorna erro 403).

> **Painel Admin robusto (03/07/2026): PENDÊNCIA DE DEPLOY (manual)**
> Rodar `supabase/admin_stats.sql` no SQL Editor do Supabase (idempotente). Cria a função
> `admin_usage_stats()` (SECURITY DEFINER, só role admin) que agrega por usuário: equipamentos
> por tipo, inspeções, relatórios salvos, PDFs/impressões (contador `nr13_uso_contadores`,
> incrementado em Relatórios) e sub-logins criados. Sem o SQL, o painel funciona e essas
> colunas mostram "—". O aviso vermelho de expiração (≤30 dias) usa `nr13_acesso_expira_em`
> gravada no login — não depende do SQL.

> **Troca de senha pelo usuário (08/07/2026): PENDÊNCIA DE DEPLOY (manual, no painel Supabase)**
> O usuário troca a própria senha em três frentes: **"Trocar minha senha"** na tela de login
> (e-mail + senha atual + nova — SEM e-mail/SMTP, funciona sem nenhuma config), botão
> **"Trocar Senha"** na sidebar (logado; código por e-mail OU senha atual) e **"Esqueci minha
> senha"** na tela de login (código por e-mail). Superadmin segue resetando pelo painel Admin
> (`reset_password`) e o mestre pelo Acessos (`resetar_senha` da org_admin) — sem e-mail.
> Para o **código por e-mail** funcionar, configurar no Supabase Dashboard:
> 1. **Authentication → Email Templates → "Reset Password"**: o corpo do e-mail PRECISA conter
>    `{{ .Token }}` (código de 6 dígitos). O template padrão só tem `{{ .ConfirmationURL }}`
>    (link) — sem o `{{ .Token }}` o fluxo de código falha. Exemplo de corpo:
>    `<h2>Troca de senha</h2><p>Seu código de confirmação: <b>{{ .Token }}</b></p><p>Ele expira em 1 hora. Se você não pediu a troca, ignore este e-mail.</p>`
> 2. **SMTP próprio (recomendado p/ produção)**: Authentication → SMTP Settings. O e-mail
>    embutido do Supabase tem limite de ~2 mensagens/hora (só para testes) — em produção,
>    configurar um SMTP (Resend/Brevo/etc.) senão os códigos param de chegar.
> 3. Rate limit no app: 1 envio por minuto por usuário (cooldown de 60s na UI); código expira
>    em 1h (padrão "Email OTP Expiration" em Auth → Providers → Email).
> Enquanto o template não for ajustado, o usuário logado ainda troca a senha pela aba
> **"Senha atual"** do modal — esse caminho não usa e-mail nenhum.
> Código: `enviarCodigoTrocaSenha`/`trocarSenhaComCodigo`/`trocarSenhaComSenhaAtual` em
> `src/services/auth.ts`, `src/components/ModalTrocarSenha.tsx`, modo "recuperar" em Login.tsx.

> **Cadastro automático de trial 48h (19/07/2026): IMPLANTADO** (código + config).
> Fluxo: Login → "Testar o sistema gratuitamente por 2 dias" (só aparece com a flag ligada) →
> form do lead → código por e-mail (verifyOtp type 'signup') → Edge Function `trial` ativa
> server-side (`ativo=true, plano='trial', acesso_expira_em=+48h`) → seed de demonstração
> (`demoSeed.ts`, TAGs DEMO-*) → barra regressiva (`BarraTrial`). Bloqueios do trial:
> `imprimirRelatorio`/`exportarPdf`/`exportarPdfLivroCompleto` (funis únicos), `<a download>` do
> prontuário do fabricante e importação de planilha (só assinantes). Enforcement no servidor:
> `trial_setup.sql` (tabela `config_global`, trigger `trg_proteger_campos_sensiveis` impede o
> usuário estender o próprio prazo, RLS `acesso_vigente()` bloqueia ESCRITA no app_storage de
> conta expirada). Admin: toggle "Permitir cadastro automático" + badge TRIAL + "Liberar acesso
> completo" (converte: `plano='completo'`). Config já aplicada no Supabase em 19/07: toggle
> "Confirm email" LIGADO, `trial_setup.sql` executado, edge `trial` deployada. A geração de
> PDF é 100% client-side — bloqueio de documentos é no bundle/UI (não existe endpoint de PDF).

Nenhuma pendência estrutural aberta. Itens já resolvidos:
- ✅ "Fotos da documentação" (folha #11): grupo `fotosDocumentacao` no `FormularioChecklist` +
  `FOTOS-DOCUMENTACAO.html`, auto-injetado após `checklist3` e antes de `CHECKLIST-FOTOS`.
- ✅ Base de enquadramento confirmada em kPa × m³ > 8 (§4).

Sugestões futuras (não bloqueiam): auditoria de responsividade mobile folha a folha; revisão de
`@media print` em cada template para garantir A4 exato sem corte/rodapé empurrado.

---

## 10. Convenções ao alterar o sistema

- Nova folha de relatório → criar HTML em `public/arquivos-inspecao/`, ler dados das chaves do §2 no
  `DOMContentLoaded`, e posicioná-la em `DOCUMENTOS_DISPONIVEIS` (ou na auto-injeção) conforme §7.
- Toda folha nova segue as regras de fotos/impressão/responsividade do §5.
- Qualquer dado novo que o usuário salve deve ser gravado em chave do §2 para poder ser injetado.

---

## 11. Assinatura recorrente (Kiwify) — implantado em 27/07/2026

Trial de 48h → paywall → checkout → o sistema libera sozinho. Conta sem assinatura em dia vira
**somente leitura** (NÃO desloga). Spec: `docs/superpowers/specs/2026-07-26-assinatura-kiwify-design.md`.

### Estados (fonte da verdade: Postgres, na linha do MESTRE da org)

| Status | Entra quando | Pode |
|---|---|---|
| `trial` | Cadastro automático 48h | Tudo, menos PDF/impressão/importação |
| `ativa` | `compra_aprovada` / `subscription_renewed` (+30 dias) | Tudo |
| `graca` | `subscription_late` (piso de 5 dias, alinhado à retentativa de cartão da Kiwify) | Tudo + barra âmbar |
| `cancelada_no_prazo` | `subscription_canceled` com período pago em aberto | Tudo até `assinatura_ate` |
| `somente_leitura` | Prazo venceu · chargeback · reembolso | Lê tudo; não escreve, não gera PDF |

`assinatura_ate` **nulo = SEM VENCIMENTO** (conta vitalícia liberada pelo Admin) — nunca rebaixa.
A regra vive em 3 lugares que precisam concordar: `src/features/assinatura/maquinaEstados.ts`,
`assinatura_status_org()` no SQL e a Edge Function. `consistenciaEdge.test.ts` trava front↔edge.

### Peças

- `supabase/assinatura_setup.sql` — colunas em `profiles`, backfill, `assinatura_status_org()`,
  `assinatura_org()` (RPC lida pelo front), RLS de escrita em `app_storage` (exige
  `acesso_vigente()` **e** `assinatura_permite_escrita()`), tabela `kiwify_eventos`.
- `supabase/functions/kiwify_webhook/` — recebe os 6 eventos. Autentica por **segredo na query**
  (`?s=`), porque a Kiwify não documenta HMAC. **Verify JWT precisa ficar DESLIGADO** na função,
  senão o gateway recusa antes (a Kiwify não manda Authorization).
- `src/services/assinatura.ts` — espelho local; `BarraAssinatura` / `ModalAssinatura` (checkout em
  nova aba + polling de 10s); `ModalAviso` é o modal global de bloqueio/sucesso.
- Admin: coluna de status + seção "Eventos Kiwify sem conta" (pagamento cujo e-mail não casou) com
  vínculo manual.

### Regras que não podem ser quebradas

- **O e-mail casa por igualdade exata (`.eq`), NUNCA `ilike`** — `_`/`%` são coringas e casariam a
  conta errada, liberando/bloqueando quem não devia.
- As colunas legadas `plano`/`acesso_expira_em` continuam mandando no **login**; quem grava
  assinatura (webhook e ações do Admin) precisa gravar as duas coisas, senão a conta "ativa" não
  entra ou a "liberada" não escreve.
- Evento sem conta identificada vira **órfão** em `kiwify_eventos` — nunca se chuta um perfil.

### Pendência

O payload real da Kiwify não é público: o parser lê por tentativa. Validar com uma compra de teste
e, se o e-mail vier em campo não previsto, acrescentar o caminho em `parser.ts` **com teste**.

---

## 12. Escala e laboratório — produção não é banco de teste (01/09/2026)

> **REGRA QUE NÃO SE QUEBRA:** massa de escala, benchmark, gate de 1k/10k/50k e stress
> test rodam **somente em Supabase local** (`npx supabase start`). O projeto de produção
> do NR-13 — **`qqsesrntfvmdxqxrfvmw`** — nunca recebe massa.

**O que motivou a regra, medido.** O ciclo de 20/ago a 20/set fechou com **8,32 GB de
Cached Egress contra 5 GB de cota (166%)**, excedente de 3,32 GB. O grace period venceu
em 16/08 e o projeto passou a exibir `EXCEEDING USAGE LIMITS` — a um passo de responder
**402** para os clientes pagantes. A distribuição diária bate dia a dia com os gates da
Fase 9 rodados contra o banco de produção: picos de ~1 GB/dia em 21–23/08 (instalação da
9A/9B/9C), 25/08 (os 50.000 relatórios da 9E) e o maior deles em **29/08, ~1,8 GB** (gate
de 50k da 9F.1). Nos dois dias seguintes, sem laboratório rodando, o consumo foi a zero.
Quinze usuários ativos no mês não produzem 8 GB — os gates produzem.

**Produção passa a servir só para:** rollout controlado, organização de teste, poucos
registros reais, validação funcional e rollback.

**Onde a trava vive:** `scripts/massa-escala/seguranca.mjs`.

| peça | o que faz |
|---|---|
| `REF_PRODUCAO_NR13` / `REFS_PROIBIDOS` | lista de refs onde massa é proibida em absoluto |
| `refDoProjeto(url)` | extrai `<ref>` de `https://<ref>.supabase.co`; `null` para local |
| `ehProducaoProibida(url)` | a trava; **fail-closed** — URL ausente/ilegível conta como proibida |
| `validarAlvo(...)` | usada por `gerar.mjs`; avalia o bloqueio **antes** de qualquer permissão |

**`NR13_PERMITIR_PRODUCAO=1` NÃO destrava esta regra**, e há teste que garante isso
(`massa.test.mjs`). A variável continua existindo para o caso legítimo de apontar o
gerador a um projeto hospedado descartável; contra o projeto que atende cliente pagante
não existe caso legítimo. Uma trava que se destrava com variável de ambiente é a que se
destrava às 2 da manhã, no meio de um gate, "só para medir uma coisa".

**`limpar.mjs` também é travado** — ele é o que APAGA, e antes desta mudança não tinha
guarda de produção nenhuma: bastava `--org` na lista branca e uma URL de produção.

Testes: `node --test scripts/massa-escala/massa.test.mjs` (35). A suíte do app segue em
`src/**/*.test.ts` e não cobre `scripts/` — os dois runners são separados de propósito.
