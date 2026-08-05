import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  EVENTOS_BLOQUEADOS,
  documentoSomenteLeitura,
  paramsSomenteLeitura,
  travarDocumento,
} from './somenteLeituraDoc';

// ---------------------------------------------------------------------------
// Dublês mínimos de DOM
// ---------------------------------------------------------------------------
// O Vitest deste repo roda em `environment: 'node'` (ver vite.config.ts) e não há
// jsdom. A trava só usa um punhado de métodos do Document, então um dublê cobre
// o comportamento que importa: quais elementos ficam travados, qual CSS entra e
// quais eventos passam a ser barrados.

class ElFake {
  attrs: Record<string, string> = {};
  readOnly = false;
  textContent = '';
  id = '';
  filhos: ElFake[] = [];
  tag: string;
  constructor(tag: string) {
    this.tag = tag;
  }
  getAttribute(n: string): string | null {
    return this.attrs[n] ?? null;
  }
  setAttribute(n: string, v: string): void {
    this.attrs[n] = v;
  }
  appendChild(c: ElFake): ElFake {
    this.filhos.push(c);
    return c;
  }
}

interface Ouvinte {
  nome: string;
  fn: (ev: unknown) => void;
  captura: boolean;
}

class DocFake {
  designMode = 'on';
  head = new ElFake('head');
  documentElement = new ElFake('html');
  ouvintes: Ouvinte[] = [];
  editaveis: ElFake[];
  campos: ElFake[];
  constructor(editaveis: ElFake[] = [], campos: ElFake[] = []) {
    this.editaveis = editaveis;
    this.campos = campos;
  }
  getElementById(id: string): ElFake | null {
    return this.head.filhos.find((e) => e.id === id) ?? null;
  }
  createElement(tag: string): ElFake {
    return new ElFake(tag);
  }
  querySelectorAll(sel: string): ElFake[] {
    return sel.includes('contenteditable') ? this.editaveis : this.campos;
  }
  addEventListener(nome: string, fn: (ev: unknown) => void, captura: boolean): void {
    this.ouvintes.push({ nome, fn, captura });
  }
  removeEventListener(nome: string, fn: (ev: unknown) => void): void {
    const i = this.ouvintes.findIndex((o) => o.nome === nome && o.fn === fn);
    if (i >= 0) this.ouvintes.splice(i, 1);
  }
}

const comoDocumento = (d: DocFake) => d as unknown as Document;

let observadores: Array<{ observando: boolean }> = [];

beforeEach(() => {
  observadores = [];
  (globalThis as Record<string, unknown>).MutationObserver = class {
    estado = { observando: false };
    constructor() {
      observadores.push(this.estado);
    }
    observe(): void {
      this.estado.observando = true;
    }
    disconnect(): void {
      this.estado.observando = false;
    }
  };
});

// ---------------------------------------------------------------------------

describe('paramsSomenteLeitura', () => {
  it('marca ro=1 para o iframe saber que a folha é de relatório salvo', () => {
    expect(paramsSomenteLeitura(true)).toBe('&ro=1');
  });

  it('não marca nada quando o relatório é editável', () => {
    expect(paramsSomenteLeitura(false)).toBe('');
  });
});

describe('documentoSomenteLeitura — espelho do gate de sb-storage.js', () => {
  it('reconhece ro=1 na query string', () => {
    expect(documentoSomenteLeitura('?tag=V1&page=2&ctx=rel&ro=1')).toBe(true);
  });

  it('sem o parâmetro, a folha continua gravável (relatório novo)', () => {
    expect(documentoSomenteLeitura('?tag=V1&page=2&ctx=rel')).toBe(false);
  });

  it('só o valor 1 conta — nada de "0" ou "false" virar bloqueio silencioso', () => {
    expect(documentoSomenteLeitura('?ro=0')).toBe(false);
    expect(documentoSomenteLeitura('?ro=false')).toBe(false);
  });
});

describe('travarDocumento — o que fica travado', () => {
  it('desliga contenteditable de todos os campos de texto da folha', () => {
    const a = new ElFake('div');
    a.setAttribute('contenteditable', 'true');
    const b = new ElFake('td');
    b.setAttribute('contenteditable', '');
    const doc = new DocFake([a, b], []);

    travarDocumento(comoDocumento(doc));

    expect(a.getAttribute('contenteditable')).toBe('false');
    expect(b.getAttribute('contenteditable')).toBe('false');
  });

  it('põe inputs e textareas em readOnly', () => {
    const i = new ElFake('input');
    const t = new ElFake('textarea');
    const doc = new DocFake([], [i, t]);

    travarDocumento(comoDocumento(doc));

    expect(i.readOnly).toBe(true);
    expect(t.readOnly).toBe(true);
  });

  it('injeta o CSS da trava uma única vez', () => {
    const doc = new DocFake();
    travarDocumento(comoDocumento(doc));
    travarDocumento(comoDocumento(doc));

    const estilos = doc.head.filhos.filter((e) => e.tag === 'style');
    expect(estilos).toHaveLength(1);
    expect(estilos[0].textContent).toContain('read-only');
  });

  it('desliga o designMode (senão a folha inteira vira editável)', () => {
    const doc = new DocFake();
    travarDocumento(comoDocumento(doc));
    expect(doc.designMode).toBe('off');
  });

  it('barra CLIQUE: os onclick inline dos templates são ações de edição', () => {
    // selectSN (grava nr13_laudo_), selOpt, toggleCb, removerFoto, trocar logo…
    expect(EVENTOS_BLOQUEADOS).toContain('click');
    const doc = new DocFake();
    travarDocumento(comoDocumento(doc));
    expect(doc.ouvintes.some((o) => o.nome === 'click' && o.captura)).toBe(true);
  });

  it('barra digitação e colagem', () => {
    const doc = new DocFake();
    travarDocumento(comoDocumento(doc));
    for (const nome of ['beforeinput', 'keydown', 'paste', 'cut', 'drop']) {
      expect(doc.ouvintes.some((o) => o.nome === nome && o.captura)).toBe(true);
    }
  });

  it('o bloqueio impede o evento de chegar ao onclick inline do elemento', () => {
    const doc = new DocFake();
    travarDocumento(comoDocumento(doc));
    const ouvinte = doc.ouvintes.find((o) => o.nome === 'click')!;
    const ev = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    ouvinte.fn(ev);
    // stopPropagation na fase de captura é o que impede o handler do alvo de rodar.
    expect(ev.stopPropagation).toHaveBeenCalled();
    expect(ev.preventDefault).toHaveBeenCalled();
  });

  it('reaplica a trava quando o template monta conteúdo depois (MutationObserver ligado)', () => {
    const doc = new DocFake();
    travarDocumento(comoDocumento(doc));
    expect(observadores.some((o) => o.observando)).toBe(true);
  });

  it('a limpeza solta observer e ouvintes — remontar a folha não vaza', () => {
    const doc = new DocFake();
    const limpar = travarDocumento(comoDocumento(doc));
    limpar();
    expect(doc.ouvintes).toHaveLength(0);
    expect(observadores.every((o) => !o.observando)).toBe(true);
  });
});
