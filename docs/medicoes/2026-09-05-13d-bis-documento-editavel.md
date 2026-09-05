# 13D-bis · o documento editável por overrides no rascunho

**05/09/2026.** Enquanto o relatório é rascunho, todo texto documental do
Modelo Novo pode ser corrigido à mão — e o que ficou na tela é o que é emitido.

---

## 1 · A hierarquia

```
fonte automática do sistema → valor base → override manual do rascunho → prévia → PDF
```

O override pertence ÀQUELE relatório. Nada aqui escreve em ficha, cliente,
memorial, categoria, cálculo ou configuração da organização.

## 2 · Três estados (e o terceiro é o que costuma faltar)

| estado | quando | o documento mostra |
|---|---|---|
| ausente | ninguém mexeu | o valor automático |
| `manual` | o usuário escreveu | exatamente o texto dele |
| `branco` | o usuário APAGOU | vazio — e o automático **não volta** |

"Restaurar automático" REMOVE o override; é diferente de gravar vazio.

## 3 · Onde a decisão vive

| peça | papel |
|---|---|
| `overridesRelatorio.ts` | estados, resolução, persistência oficial, cópia na duplicação |
| `Documento` | resolve o override ao DESENHAR (antes de medir a linha) e registra a caixa em mm de cada campo |
| `folhas.ts` · `idCampo()` | ids semânticos (`equipamento.fabricante`), derivados do rótulo documental |
| `Documento.campoLivre()` | o gancho para blocos desenhados à mão — a placa hoje, o gate das 21 folhas amanhã |
| `PreviaVetorial` + `EditorCampoDocumento` | camada React de botões transparentes sobre o canvas; popover com Salvar / Restaurar |

Chave: `nr13_ovr_<id>_<TAG>` — prefixo próprio, porque `nr13_rel_ovr_` seria
lido pelo índice do histórico como se fosse um relatório salvo. Fora do palco:
nenhum template HTML lê overrides; quem os aplica é o gerador, em memória.

**Ids semânticos, nunca posicionais.** A paginação muda quando um checklist
cresce; um id de página/índice passaria a apontar para outro campo. Quando um
rótulo mudar de fato, o override antigo deixa de casar e o campo volta ao
automático — degradação segura.

## 4 · Rastreabilidade

Cada override guarda o valor automático que substituiu, o texto manual e
quando. Na finalização o mapa é congelado em `meta.overrides` do registro —
**não é dele que o PDF lê** (o PDF já saiu resolvido e é imutável); ele existe
para explicar, meses depois, por que o documento diz uma coisa e a ficha diz
outra.

## 5 · Validação em produção

Org de teste, `ZZ-TESTE-P2`, bundles `index-xob6Xdp-.js` / `index-DXKJVitl.js`.

| | verificado | resultado |
|---|---|---|
| A | campo automático sem override | 52 áreas clicáveis; FABRICANTE abre com o valor da ficha |
| B | escrever "WEG Equipamentos LTDA" | prévia e PDF do rascunho passam a dizer isso; barra mostra "1 campo alterado" |
| B2 | cadastro mestre | **intacto** — a placa reconstruída, que lê a ficha, continuou com `ZZ-TESTE-B-CICLO2` no mesmo PDF em que a tabela já dizia o texto manual |
| C | apagar TIPO DE EQUIPAMENTO e regerar | o campo saiu **vazio** no PDF; "Vaso de Pressão" não voltou |
| D | Restaurar automático no CONTRATANTE | contador voltou de 2 para 1 campo alterado, e o texto sumiu do documento |
| E | preencher campo vazio, sair da tela e reabrir o rascunho | override de volta: "1 campo alterado", 1 marcador |
| F | texto padrão (objetivo) | tem id próprio e default do gerador — editável como qualquer campo |
| G | campo técnico | override muda o impresso; `nr13_calc_` segue com o valor calculado |
| H | finalizar | 10 páginas, SHA `c1ae8690ce09e917…`; o arquivo baixado tem o MESMO SHA e contém "WEG Equipamentos LTDA" e **não** contém o texto restaurado |
| I | histórico | documento arquivado abre pelos bytes; sem camada de edição (0 áreas clicáveis) |

**Achado corrigido durante a validação:** a placa reconstruída é desenhada à
mão e não passava pelo resolvedor — a mesma folha mostrava o texto manual na
tabela e o valor da ficha na placa. Virou `campoLivre`, com id `placa.<campo>`.

**Segundo achado:** uma geração de abertura não completou (aba congelada pelo
navegador) e a área ficou com "Sem prévia." e nada mais. Agora o mesmo estado
traz o botão que gera.

## 6 · Testes

`overridesRelatorio.test.ts` — **32 testes**, cobrindo A–I, a cópia na
duplicação, os ids semânticos e a garantia de que a camada é React (nem o
visualizador nem o gerador contêm `contentEditable`).

| | |
|---|---|
| suíte | **2.031 testes, 162 arquivos, 0 falhas** |
| `tsc -b` · `vite build` | limpos |

## 7 · Fora do escopo

Auditoria das 21 folhas contra `relatorio-nr13.html`, fidelidade visual e 13F
não foram iniciadas. A infraestrutura fica pronta para elas: campo novo entra
com `id` na célula (tabela/parágrafo) ou com `campoLivre` (bloco desenhado), e
já nasce com fonte automática, override por relatório e área clicável.
