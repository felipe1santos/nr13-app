/**
 * Aleatoriedade DETERMINÍSTICA para a massa de escala da Fase 8.
 *
 * `Math.random` não serve: a fase inteira depende de "mesma seed = mesmo dataset
 * lógico". Sem isso, medir de novo depois de uma mudança compararia maçã com
 * laranja, e a baseline não valeria nada duas semanas depois.
 *
 * mulberry32: 32 bits de estado, distribuição boa o bastante para texto e datas
 * sintéticas, e — o que importa aqui — reprodutível em qualquer máquina e
 * qualquer versão do Node.
 */

/** @returns {() => number} gerador em [0,1) */
export function prng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Inteiro em [min, max]. */
export function inteiro(rnd, min, max) {
  return min + Math.floor(rnd() * (max - min + 1));
}

/** Elemento de uma lista. */
export function escolher(rnd, lista) {
  return lista[Math.floor(rnd() * lista.length)];
}

/** Decimal com casas fixas — evita 0.30000000000000004 no conteúdo gerado. */
export function decimal(rnd, min, max, casas = 2) {
  return Number((min + rnd() * (max - min)).toFixed(casas));
}

/**
 * Data determinística em `DD/MM/AAAA`, deslocada `diasAtras` do marco fixo.
 *
 * O marco é FIXO de propósito: usar `new Date()` faria a mesma seed produzir
 * datas diferentes a cada execução, e o dataset deixaria de ser reprodutível.
 */
export const MARCO = Date.UTC(2026, 0, 1);

export function dataBR(diasAtras) {
  const d = new Date(MARCO - diasAtras * 86400000);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

export function dataISO(diasAtras) {
  return new Date(MARCO - diasAtras * 86400000).toISOString();
}

/**
 * UUID v4 derivado da seed — determinístico, e é isso que importa: ids iguais
 * entre execuções deixam o dataset comparável chave a chave.
 */
export function uuid(rnd) {
  const hex = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 32; i++) {
    if (i === 12) s += '4';
    else if (i === 16) s += hex[(Math.floor(rnd() * 16) & 0x3) | 0x8];
    else s += hex[Math.floor(rnd() * 16)];
  }
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
