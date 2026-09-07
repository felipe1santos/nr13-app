# Ajuda contextual com ilustrações — Calibrações e Certificados

**07/09/2026.** Só UX/onboarding. Nenhuma regra de calibração, validade,
rastreabilidade, geração de PDF, anexação documental, histórico, Storage ou
cálculo foi tocada.

---

## 1 · Os arquivos

As duas ilustrações vieram prontas do dono. Cada uma foi **aberta e conferida
visualmente** antes de usar — trocá-las faria cada sessão explicar a outra:

| origem | destino | conteúdo |
|---|---|---|
| `Downloads/d28a1968-….png` | `public/ilustracoes/fluxo-calibracao.webp` | equipamento → acessórios → pasta do lote → técnico calibrando → lote concluído |
| `Downloads/be0de694-….png` | `public/ilustracoes/rastreabilidade-padroes.webp` | engenheiro, manômetros padrão, PSV, ultrassom, certificados e calendário |

**Otimização:** PNG 2172×724 de ~1,0 MB → WebP 1400px de **42 KB** e **46 KB**
(ffmpeg, qualidade 86). Servidas com `Content-Type: image/webp`, confirmado em
produção.

## 2 · Onde a ilustração aparece — e onde não

> **A tela operacional continua compacta.** A arte só existe em lugares onde não
> há trabalho a fazer.

| lugar | quando |
|---|---|
| modal `[i] Informações` | quando o usuário pede |
| estado vazio de Calibrações | só com **zero** lotes; some assim que existir um |

**Certificados não ganhou estado vazio ilustrado**, e é decisão: a tela é três
cartões, um por padrão, e cada um já diz "Nenhum certificado cadastrado" com o
seu botão "+ Adicionar". Uma ilustração acima empurraria as três ações para
baixo — exatamente o que esta rodada existe para evitar.

## 3 · O texto descreve o que o código faz

Conferido antes de escrever. O passo delicado é o da reutilização automática,
que tem **duas** condições — e uma promessa genérica esconderia as duas:

1. o relatório precisa **incluir a folha** daquele ensaio. `ULTRASSOM.html` puxa
   o bloco padrão de espessura; cada folha `CERTIFICADO-CAL-*?calibId=` puxa o
   padrão do tipo daquela calibração (`tiposPadraoDoRelatorio`);
2. a caixa **"Injetar no final do relatório"** precisa estar marcada
   (`injetaNoRelatorio`).

Sem uma das duas, nada é anexado. Dizer o contrário faria o usuário entregar um
documento acreditando que o certificado está lá dentro.

Também está escrito, porque é o que o código faz: o PDF do padrão **não é
alterado** — as páginas são copiadas para o fim do relatório; e havendo mais de
um cadastro do mesmo tipo, vence o mais recente **que tenha PDF**.

## 4 · O modal

| | |
|---|---|
| largura | 720px no desktop; quase total no celular |
| altura | `max-height: 88vh`, com o CORPO rolando — cabeçalho e "Entendi" ficam |
| animação | 10px de subida, escala 0,985, 200ms; overlay em fade |
| `prefers-reduced-motion` | desliga a animação, mantendo a abertura |
| foco inicial | o **botão Fechar** — quem abre uma ajuda quer ler e sair |
| fecha por | X · ESC · overlay · "Entendi" (informativo, nada se perde) |
| acessibilidade | `role="dialog"`, `aria-modal`, `aria-labelledby`, armadilha de foco |

## 5 · Verificação

### Produção

| | Calibrações | Certificados |
|---|---|---|
| `[i] Informações` na barra | sim | sim |
| título | "Como funcionam as calibrações" | "Certificados e rastreabilidade dos padrões" |
| passos | 4, corretos | 4, corretos |
| ilustração | `fluxo-calibracao.webp` | `rastreabilidade-padroes.webp` |
| `aria-labelledby` | — | `ajuda-titulo` |
| foco inicial | "Fechar" | "Fechar" |
| ESC / Entendi / overlay | — | os três fecham |
| bloco fixo antigo | removido | removido |

### Medição headless, com o CSS de produção

| largura | modal | imagem | proporção |
|---|---|---|---|
| 1400px | 719×769 | 671×224 | 3,00 : 1 |
| 768px | 688×751 | 640×213 | 3,00 : 1 |
| 386px | 347×750 | 315×105 | 3,00 : 1 |

`object-fit: contain` em todas — **a arte não estica nem corta**. Sem rolagem
horizontal em nenhuma largura.

### Suíte

**2.316 testes, 175 arquivos, 0 falhas.** 27 asserções na sessão, incluindo o
tamanho dos arquivos (< 150 KB), a proporção, o alt descritivo e as duas
condições do texto.

## 6 · Um erro meu, registrado

O medidor reprovava 33 contra 34px de altura de botão. Tentei corrigir de dois
jeitos e **os dois foram piores que o defeito**:

- `line-height` explícito → as duas famílias herdam valores diferentes, e a
  divergência virou 34/35/36;
- piso de `min-height: 34px` → como `forja.css` carrega **depois** do
  `tokens.css`, onde mora a regra de 44px do celular, o piso de mesma
  especificidade venceu por vir por último e **derrubou o alvo de toque**:
  34px em 386px, onde tinha de ser 44.

Revertido. O medidor passou a aceitar 1px de variação e continua reprovando o
que se enxerga (26 contra 34, 2 contra 44). O motivo está escrito no próprio
teste, com as duas tentativas, para não se repetir o caminho.

## 7 · Pendência

`ModalAjudaCalibracoes` foi removido — órfão no repositório é o que a próxima
pessoa lê achando que está em uso.
