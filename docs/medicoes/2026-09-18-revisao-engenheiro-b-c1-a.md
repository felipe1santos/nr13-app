# Revisão do engenheiro — Etapas B, C.1 e A · medição (18/09/2026)

Branch local `revisao-engenheiro-b-c1-a` (sem push, sem deploy, produção intocada).
Plano: `docs/PLANO-AJUSTES-REVISAO-ENGENHEIRO.md`.

## 1 · Laboratório

O laboratório local do NR-13 não existia mais (nenhum container/volume `nr13-app`), e as portas
54321/54322 estavam com o stack local do projeto `cardapio`. Com autorização do dono:

1. `supabase stop --project-id cardapio` (dados preservados);
2. `supabase start` no NR-13 e schema recriado do zero na ordem de
   `docs/medicoes/2026-08-22-fase8-laboratorio-e-f81.md` §3 (passos 0–12 + complementares) e as
   projeções da Fase 9 — **33 arquivos, 33 OK**;
3. conta `lab@local.test` / `lab123456` criada pela API admin local e ativada (mestre, plano
   completo, assinatura ativa sem vencimento).

Dados semeados pelos serviços oficiais do app (gravação pela RPC real, ACK conferido no banco):
empresa com LOGO no bucket (`logoRef`), engenheiro, 3 equipamentos (`ZZ-E2E-SI`, `-TEC`, `-PB`)
criados por `criarEquipamento` com a unidade, memorial (P = 1,9 MPa), pressões adotadas
(PMTA 2,2 · PMO 1,75 · PTH 2,86 MPa), categoria (fluido "A - Hidrogênio"), cliente, container.

## 2 · Inspeção em campo (390 px)

A janela do Chrome não encolhe abaixo do mínimo; 390 px foi obtido com iframe da mesma origem
(`innerWidth` 390, `scrollWidth` 390 — sem rolagem horizontal). Paisagem 844×390 também sem
rolagem horizontal; a faixa da pergunta ocupa 79 px.

| verificação | resultado |
|---|---|
| pergunta "Foi encontrada alguma não conformidade?" visível e presa no topo | ✅ |
| SIM ativo | fundo `rgb(251,234,233)`, texto `rgb(185,58,51)` (tokens `--crit*`) ✅ |
| NÃO ativo | fundo `rgb(231,246,239)`, texto `rgb(31,169,113)` (`--ok*`) ✅ |
| botões com 44 px de altura | ✅ |
| SIM sem descrição → campo em destaque + aviso; some ao descrever | ✅ |
| resumo derivado ("Resultado: SIM — 1 não conformidade (item 1)") | ✅ |
| salvar → servidor (`semanticaNc=1`, `itens.1=sim`, observação) | ✅ |
| F5 → respostas e observação preservadas | ✅ |
| TH: rótulos "(bar)", projeto 19.00 travado "Do memorial de cálculo", fluido vazio | ✅ |

**Offline** (gateway local derrubado com a página aberta): exame interno e observações do
checklist salvos → cache local + 1 pendência na fila; banco SEM os dados; gateway de volta →
drenagem (evento `online`/`visibilitychange`) → 0 pendências → banco COM os dados. ✅

**Registro antigo:** carimbo removido do externo do SI → formulário mostra o aviso de revisão;
`validarParaFinalizar` bloqueia; botão "Revisei" + salvar → banco com `semanticaNc=1`. ✅

Limitações declaradas: com a aba em segundo plano o Chrome não entrega cliques físicos nem roda
o raster (resolvido trazendo a janela à frente — memória `chrome-aba-visivel-por-script`); dentro
do iframe de 390 px os toques foram disparados com `.click()` nos botões reais.

## 3 · Relatório PB finalizado pela tela

Criar relatório → externo + interno + TH + lote de calibração → container → Gerar → laudo APTO →
Finalizar. Conferido no arquivo baixado do bucket:

- 16 páginas; **SHA-256 do arquivo = `sha256` gravado**; `pdfPendente: false`;
- reaberto após F5: "Documento arquivado", 0 templates montados, 16 páginas;
- TH: `PRESSÃO DE PROJETO (bar) 19.00 · PRESSÃO DE TRABALHO (bar) 17.50 · FLUIDO DE TESTE Água ·
  PRESSÃO DE TESTE (bar) 28.60`; gráfico `PT: 28.60 bar`, pontos `0.00 / 14.30 / 28.60 bar`,
  eixo `Pressão (bar)`; tabela `TEMPO (min) | PRESSÃO (bar)` com os mesmos números;
- 7.2 e 7.3 com a pergunta, a resposta derivada (`SIM — item 1` / `SIM — item 5`) e as descrições;
- observações do checklist partes 1 e 2 impressas;
- categorização: `PRESSÃO MÁX. ADMISSÍVEL (PMTA) 22.43 kgf/cm²`;
- nenhum `NaN`/`undefined`/`[object Object]`.

## 4 · SI e Técnico (mesmo gerador, no navegador, dados do lab)

| | SI | Técnico |
|---|---|---|
| projeto / trabalho / teste | `1.900 / 1.750 / 2.860 (MPa)` | `19.37 / 17.85 / 29.16 (kgf/cm²)` |
| PT e pontos | `2.860 MPa` · `0.000/1.430/2.860 MPa` | `29.16 kgf/cm²` · `0.00/14.58/29.16 kgf/cm²` |

**Folha de categorização idêntica nos três (SI, Técnico, Petrobras arquivado).** ✅

## 5 · Logo do Certificado de Calibração

Logo PNG (teal + laranja) cadastrada com `logoRef`.

| caminho | resultado |
|---|---|
| certificado avulso (tela) | `imgLogo` = dataURL, 300×120 decodificada ✅ |
| PDF individual (`gerarPdfBytes`, o mesmo do "Baixar PDF") | quadrante da logo com 3.353 px teal e 1.110 px laranja ✅ |
| anexado ao relatório finalizado (última página, raster) | **mesmos 3.353 / 1.110 px** ✅ |

## 6 · Observações fora do escopo desta rodada

- Recarregar a página com o servidor fora do ar fica em "Carregando…" até a conexão voltar
  (boot; não é o fluxo de edição offline, que funciona).
- A fila terminou com 1 item em **conflito** em `nr13_relatorio_meta_atual` (chave global, não
  tocada nesta rodada), provavelmente das duas instâncias do app abertas ao mesmo tempo (aba +
  iframe). Registrado em PENDENCIAS.
- `Prontuarios.tsx` pré-preenche a "pressão de projeto" e a "pressão máx. de operação" do
  prontuário com a PMTA — mesmo defeito corrigido no TH, em outro documento. Registrado.

## 7 · Suíte

`vitest run`: 228 arquivos, 3.492 testes verdes. `npm run build` OK. Lint dos arquivos tocados
igual ao baseline do HEAD (nenhum problema novo).
