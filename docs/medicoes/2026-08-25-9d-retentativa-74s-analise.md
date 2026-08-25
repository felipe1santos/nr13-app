# 9D · Por que a retentativa levou ~74 s se a janela é de 45 s

**25/08/2026.** Verificação pedida antes de qualquer expansão. Conclusão: **não há defeito** —
o número é da MEDIÇÃO, não do mecanismo. O teto real é `JANELA + TICK ≈ 49 s`.

---

## 1 · A conta

| peça | valor | onde |
|---|---|---|
| Janela mínima entre retentativas | **45 s** | `INTERVALO_RETENTATIVA_MS` |
| Tick que avalia a decisão | **4 s** | `setInterval` do `SyncStatus` |
| Teto entre a volta da rede e a drenagem | **≤ 49 s** | os dois somados |

O relógio da retentativa **não começa quando a rede volta** — ele já estava correndo. Durante a
queda, cada ciclo tentou drenar, falhou e reiniciou a janela. No instante em que a rede voltou,
o tempo restante do ciclo em andamento era um valor qualquer entre 0 e 45 s; some o tick, e o
pior caso é 49 s.

## 2 · Por que a leitura marcou 74 s

Porque **74 s foi quando alguém olhou**, não quando a fila drenou. A sequência da prova:

| horário | evento |
|---|---|
| 14:54:40 | rede volta; testemunha instalada; fila = 3 |
| *(sem medição no intervalo)* | — |
| 14:55:54 | primeira conferência: fila = 2, **já drenada** |

Entre as duas leituras não houve amostragem intermediária. O que a medição prova é
"drenou em algum momento dentro de 74 s", e isso é compatível com o teto de 49 s. Uma medição
mais fina exigiria amostrar a fila a cada segundo — o que não muda o mecanismo, só a precisão do
relato.

## 3 · O que os testes travam

`retentativaRede.test.ts` (11 casos) simula o laço do selo com relógio determinístico:

| garantia | teste |
|---|---|
| Entre duas retentativas nunca passa de JANELA + TICK | `entre duas retentativas nunca passa de JANELA + TICK` |
| **Não há backoff escondido** — o primeiro intervalo é igual ao último | `a espera NÃO cresce a cada tentativa` |
| O ciclo não para: 10 min de queda → ≥ 12 tentativas | `o ciclo não para` |
| A rede voltando em qualquer instante drena em ≤ JANELA + TICK | `a rede volta no meio de um ciclo` |
| Sem evidência de queda, nenhuma requisição é gasta | `sem evidência de queda` |

## 4 · As quatro perguntas, respondidas

1. **Existe bug de timer?** Não. O `setInterval` é fixo em 4 s e a janela é uma comparação de
   timestamps (`Date.now() - ultimaRetentativa`), não um timer aninhado — não há acúmulo nem
   drift entre ciclos.
2. **Existe espera crescente inesperada?** Não. `deveRetentar` compara com uma constante; não há
   backoff, nem multiplicador, nem contador de tentativas na decisão. Travado por teste.
3. **A retentativa continuará acontecendo?** Sim, enquanto houver evidência de queda. O ciclo é
   perpétuo por construção: cada tentativa que falha mantém a `categoria: 'offline'` no item, que
   é a própria condição de continuar.
4. **Alguma fila pode ficar parada indefinidamente porque `navigator.onLine` mente?** Não. A
   evidência de queda **é persistida junto do item da fila** (`sync.persistir` grava o `ItemFila`
   inteiro, `erro` incluído, e `carregarFilaDoDisco` o recarrega). Ela sobrevive a fechar o
   navegador: o app reabre, a fila volta com a marca de rede, e o ciclo recomeça sozinho.

## 5 · Uma nota de comportamento do navegador

Em aba **oculta**, o Chrome limita `setInterval` a ~1×/minuto. Nesse estado o teto passa de ~49 s
para ~105 s — ainda limitado, nunca indefinido. E é o caso menos preocupante: quando a aba volta
a ficar visível, `visibilitychange` dispara e a drenagem acontece na hora, sem esperar a janela.
