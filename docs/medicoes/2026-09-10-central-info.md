# A central Info — auditoria e conteúdo, 10/09/2026

Commit `6a4338a`. Rota `/info`, item **Info** no fim do menu principal.

## Objetivo

Todo o conhecimento de como operar o sistema estava na cabeça de quem o
construiu e em três ajudas espalhadas — containers de inspeção, calibrações e
certificados. Quem entrava pela primeira vez precisava descobrir sozinho que a
inspeção pende do equipamento, que marcar um ensaio não é preenchê-lo e que
rascunho não gera prazo.

A regra desta rodada foi uma só: **nada escrito a partir do nome de uma tela**.
Cada afirmação foi conferida no código e no app antes de virar texto. Onde a
ajuda manda clicar em algo, aquele botão existe hoje com aquele rótulo.

---

## Inventário das telas — o que foi auditado

| módulo | rota | o que foi conferido |
|---|---|---|
| Meus dados | `/minha-empresa` | campos reais; só o mestre entra; a logo vai ao cabeçalho de todas as folhas |
| Dashboard | `/dashboard` | régua `15 · 30 · 60 · 90 · Vencidos`, cumulativa; coluna **Origem** com três valores |
| Agenda | `/agenda` | serviço, valor opcional, status; previsto ≠ realizado; cancelado sai das duas contas |
| Equipamentos | `/equipamentos` | criação por TAG + tipo; importação por planilha; arrastar arquivo |
| Ficha | `/equipamento/:tag` | os 6 cards: dados, empresa, categoria, memorial, pressões da documentação, vida remanescente, prontuário do fabricante |
| Clientes | `/empresas` | cadastro + busca no Google + Portal do Cliente |
| Funcionários | `/funcionarios` | tipo Engenheiro/Inspetor, CREA, função, campos extras, assinatura, folhas que assina |
| Inspeções | `/inspecoes` | catálogo → containers; `+ Nova Inspeção`; os 5 ensaios; Pendente/Preenchido |
| Memorial | `/equipamento/:tag/memorial` | P, D, componentes, `Σ Gerar Cálculo`, `Salvar` |
| Relatórios | `/relatorios` | assistente de 3 etapas; rascunho × finalizado; barra "O que falta" |
| Prontuários | `/prontuarios` | criar → preencher → pré-visualizar → emitir; revisões |
| Calibrações | `/calibracoes` | componentes → lote → calibrar → vincular ao relatório |
| Certificados | `/certificados` | os 3 padrões; nº, validade, PDF; a caixa de injeção |
| Registros de Segurança | `/livro-registro` | novo registro, rascunho, trancar, exportar PDF |
| Acessos | `/acesso` | Gerente/Inspetor, permissão por módulo |

### O que a auditoria corrigiu na versão inicial do texto

| escrito de primeira | o que o sistema faz | correção |
|---|---|---|
| "faixas 15/30/60/90 mostram só aquela janela" | a regra é **cumulativa** e inclui o vencido | reescrito com a palavra "cumulativas" |
| "o prazo vem da vida remanescente" | vem do **último relatório**; a vida é reserva | invertida a ordem |
| "o croqui 2D é do prontuário de qualquer equipamento" | as folhas 2 e 3 **só existem para vaso de pressão** | dito no passo |
| "o certificado entra no relatório automaticamente" | entram **duas** condições, e a caixa é uma delas | virou observação e FAQ próprio |
| "a Agenda soma o faturamento do mês" | previsto e realizado são **números separados** | virou observação |
| "emitir o prontuário substitui a emissão anterior" | **acrescenta uma revisão** | corrigido |
| "o formulário de ultrassom aceita foto" | **não aceita** | declarado na observação do guia de fotos |

---

## O fluxo real do sistema

Auditado etapa a etapa; as dependências são reais, não sugeridas.

```
Meus dados → Funcionários → Clientes
                 ↓
           Equipamento  ← a raiz: tudo o mais pende dele
                 ↓
   Memorial → Categoria (automática a partir da PMTA)
                 ↓
   Certificados dos padrões · Calibrações dos acessórios
                 ↓
        Container de inspeção → preencher e SALVAR
                 ↓
     Relatório (assistente: documentos → inspeção → revisar)
                 ↓
          Rascunho → revisar → Finalizar
                 ↓
     Dashboard / Vencimentos  ← só documento FINALIZADO gera prazo
```

Doze etapas na tela inicial, cada uma com o botão que leva à rota real.

---

## Estrutura dos guias

`src/features/info/infoConteudo.ts` — conteúdo como DADOS. Acrescentar um guia
é acrescentar um objeto; nenhum JSX muda.

```ts
{ id, titulo, resumo, categoria, icone, chaves[],
  preRequisitos[], passos[{titulo,texto}], observacoes[],
  depois?, rota?, rotaRotulo?, ilustracao?, ilustracaoAlt? }
```

**17 guias**, em 4 categorias:

| categoria | guias |
|---|---|
| Primeiros passos | como começar · dados da empresa · funcionários · clientes |
| Operação | equipamentos · memorial · categorização · inspeções · fotos · calibrações · certificados |
| Documentação | gerar relatório · de onde vêm os dados · rascunho × finalizado · integridade · prontuários · registros de segurança |
| Gestão | dashboard e vencimentos · agenda · acessos |

`preRequisitos` é o que faltava em toda ajuda que este sistema já teve: dizer
**antes** que a inspeção precisa do equipamento evita o caminho em que o
usuário abre Inspeções e não entende por que a lista está vazia.

## FAQ

**27 perguntas**, escritas na língua de quem pergunta ("Marquei o ensaio na
criação. Por que ele não aparece no relatório?"), cada uma podendo apontar o
guia correspondente. Sete delas nasceram de defeitos reais achados nas rodadas
anteriores — o certificado que não ia ao relatório, o campo de Configurações
que parecia não ser aceito, a placa que vazava para outros documentos.

---

## Rotas

Todas as rotas citadas nos guias e no fluxo são conferidas por gate contra o
`router.tsx`. Hoje: `/minha-empresa`, `/funcionarios`, `/empresas`,
`/equipamentos`, `/inspecoes`, `/relatorios`, `/prontuarios`, `/calibracoes`,
`/certificados`, `/livro-registro`, `/dashboard`, `/agenda`, `/acesso`.

`/info?guia=<id>` abre um guia direto, sem duplicar texto em nenhum outro lugar.

O item de menu fica **fora** do filtro de permissão por módulo: o inspetor com
acesso só a Inspeções é quem mais precisa de ajuda, e esconder a documentação
de quem tem menos permissão é o contrário do que ela serve.

---

## Responsividade

| largura | comportamento |
|---|---|
| 1400 | grades de 2–3 colunas; guia em modal de 720 px |
| 768 | grades reflowam sozinhas (`minmax(min(100%, N), 1fr)`) |
| 386–390 | uma coluna em tudo; card de guia com 60 px; guia ocupa a tela inteira (`100dvh`); botões de 44 px |

As grades usam `minmax(min(100%, N), 1fr)` porque `1fr` sozinho não encolhe
abaixo do conteúdo — foi o que produziu overflow em três telas desta base.

---

## Testes

`src/features/info/info.test.ts` — **28 gates**:

- rota `/info` declarada, item no menu, título na topbar, ajuda fora da permissão;
- id único, categoria válida, nenhuma categoria vazia, todo guia com ≥ 2 passos;
- **nenhum link para rota inexistente** (guias e fluxo, contra o router real);
- toda ilustração citada existe em `public/` e tem `alt`;
- todo FAQ que aponta guia aponta guia existente; nenhuma pergunta repetida;
- **o vocabulário interno não vaza** (10 termos proibidos);
- **as regras que não podem ser escondidas estão ditas** (documento finalizado,
  container salvo, rascunho sem prazo, condição do certificado, assinatura);
- busca: sem termo devolve tudo; acha por título, passo, observação e chave;
  ignora acento; termo sem resposta devolve vazio; as quatro palavras sugeridas
  na tela vazia realmente acham algo;
- modal: `role=dialog`, `aria-modal`, `aria-labelledby`, ESC, foco preso,
  retorno do foco; rótulo em todo ícone-só;
- celular: coluna única, alvo de 44 px, sem largura fixa, `minmax(min(...))`.

Suíte: **2.931 passando** (era 2.903).

---

## Divergências encontradas

Nenhuma regra de negócio foi alterada nesta rodada — o que apareceu está
registrado aqui.

1. **A ajuda dos containers, das calibrações e dos certificados continua
   existindo dentro das próprias telas.** Elas não foram removidas nem
   duplicadas: a central cobre o mesmo assunto com mais contexto, e o texto das
   três é o mesmo de antes. Vale decidir depois se o botão "i" da seção deve
   apontar para `/info?guia=<id>` em vez de abrir o próprio modal.
2. **`nr13_predef_recomendacoes` (a biblioteca de recomendações) não tem guia
   próprio** — está citada dentro do FAQ. Se o recurso crescer para outros
   campos, ele merece um guia.
3. **Vencimentos tem rota própria (`/vencimentos`) e não tem item de menu.**
   Ela é alcançada pelo Dashboard. O guia diz isso, mas o botão "Ir para" aponta
   para `/dashboard` — apontar para uma tela sem porta no menu deixaria o
   usuário sem caminho de volta.
4. **O Portal do Cliente não tem guia**, porque quem o usa não entra na central
   (o Portal tem layout próprio, sem este menu). Está citado dentro dos guias de
   Clientes e de Acessos.

## Segunda passada — UX (mesmo dia)

Depois de ver a tela pronta, o dono pediu cinco mudanças. Todas entraram, e uma
delas virou padrão da casa.

| pedido | o que mudou |
|---|---|
| setas ligando os cartões numerados | `::after` no gap, escondida no fim de cada fileira por `nth-child`. Foi por isso que as colunas viraram FIXAS por faixa (4 · 3 · 2 · 1): com `auto-fill` não há como saber qual cartão fecha a fileira, e a seta apontaria para o vazio da margem. Doze etapas fecham exato nas quatro contagens; no celular a seta gira para baixo |
| clicar na etapa abre um modal com "Ir à seção" | `ModalJornada`, com `?etapa=<n>` |
| "Guia completo" abre a jornada inteira, avançando pela seta, com progresso no topo | o MESMO componente, começando do zero. A barra de progresso também navega: cada traço é uma etapa e clicar salta para ela |
| guias por seção mais completos | passos novos em equipamentos, funcionários, inspeções, relatórios, dashboard e acessos |
| FAQ só com a resposta, sem "Ver o guia" | botão removido |
| sem ilustração no guia, só o ícone | `ilustracao` saiu do tipo e dos guias |

Um componente só para os dois usos do modal, e a razão é de uso: quem abre a
etapa 3 e entende **quer ver a 4**. Dois modais separados deixariam o primeiro
sem saída.

### Três decisões de UX que não foram pedidas, mas a tela pedia

1. **A faixa de identificação emagreceu de 96 px para 54 px** — e virou padrão
   para toda tela nova. A topbar já diz o nome da tela; repetir em corpo de
   manchete gastava a dobra com o que o usuário já sabia. Com ela fina, as doze
   etapas da jornada cabem inteiras na primeira tela.
2. **A busca acompanha a rolagem.** Jornada + quatro categorias + 29 perguntas:
   voltar ao topo para procurar é atrito puro.
3. **O FAQ abre cortado em 8**, com "Ver todas as 29 perguntas". Buscando, vem
   inteiro — cortar o resultado de uma busca esconderia a resposta procurada.

### Duas perguntas novas sobre acesso

"Meus funcionários e colaboradores podem acessar o sistema também?" responde o
controle de acesso inteiro: os três tipos de login (mestre, equipe, cliente do
Portal), que colaborador não paga assinatura separada, a permissão módulo a
módulo, os dois perfis e o que só o mestre faz. A segunda — "uma pessoa começa a
inspeção no celular e outra gera o relatório" — diz que inspeção e documento
pertencem à organização, não a quem os criou.

### Medido em produção

| largura | jornada | cards | seta | overflow |
|---|---|---|---|---|
| 1400 | 4 col | 3 col | → | não |
| 1000 | 3 col | 2 col | → | não |
| 768 | 2 col | 2 col | → | não |
| 390 / 386 | 1 col | 1 col | ↓ | não |

Faixa com 54 px; busca colada no topo depois de 900 px de rolagem; FAQ com 8 de
29. Jornada: abre na etapa clicada, avança pela seta e pelo teclado, salta pela
barra de progresso, e a última traz "Concluir" em vez de "Próxima etapa".

Suíte: **2.951 passando**, 48 gates da central.

## Ponto de retomada

- Avaliar a dica discreta de primeiro acesso ("Precisa de ajuda? Veja o guia de
  primeiros passos em Info"). Não foi implementada: não há hoje um marcador
  seguro de "esta organização nunca viu a central", e inventar um só para isso
  criaria estado novo por uma dica.
- Avaliar apontar os botões "i" das seções para `/info?guia=<id>`.
- Guias que faltam quando os módulos crescerem: Portal do Cliente, biblioteca de
  recomendações, importação por planilha em detalhe.
