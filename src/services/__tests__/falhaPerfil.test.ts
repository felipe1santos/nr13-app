import { describe, expect, it } from 'vitest';
import { classificarFalhaPerfil, ehFalhaDeTransporte } from '../falhaPerfil';

/**
 * Esta regra decide entre deslogar o usuário e deixá-lo trabalhar. Os dois lados
 * precisam estar travados: afrouxar o lado da autorização abre brecha de acesso;
 * apertar o lado da indisponibilidade expulsa todo mundo numa instabilidade do
 * banco — que foi exatamente o que acontecia.
 */
describe('quem desloga: recusa por autorização', () => {
  it('401 e 403 são revogação', () => {
    expect(classificarFalhaPerfil(401)).toBe('autorizacao');
    expect(classificarFalhaPerfil(403)).toBe('autorizacao');
  });

  it('JWT inválido e RLS negando são revogação, mesmo com outro status', () => {
    expect(classificarFalhaPerfil(400, 'PGRST301')).toBe('autorizacao');
    expect(classificarFalhaPerfil(200, '42501')).toBe('autorizacao');
  });

  it('autorização vence indisponibilidade quando os dois sinais aparecem', () => {
    // Um 500 acompanhado de PGRST301 é credencial inválida atrás de um erro de
    // servidor. Na dúvida entre manter e cortar a sessão, corta.
    expect(classificarFalhaPerfil(500, 'PGRST301')).toBe('autorizacao');
  });
});

describe('quem NÃO desloga: servidor indisponível', () => {
  it('402 — cota estourada, o caso que motivou o fix', () => {
    expect(classificarFalhaPerfil(402)).toBe('indisponivel');
  });

  it('429, 408 e a faixa 5xx', () => {
    expect(classificarFalhaPerfil(429)).toBe('indisponivel');
    expect(classificarFalhaPerfil(408)).toBe('indisponivel');
    expect(classificarFalhaPerfil(500)).toBe('indisponivel');
    expect(classificarFalhaPerfil(502)).toBe('indisponivel');
    expect(classificarFalhaPerfil(503)).toBe('indisponivel');
  });

  it('status 0 — requisição que nem chegou a ter resposta', () => {
    expect(classificarFalhaPerfil(0)).toBe('indisponivel');
  });
});

describe('o que não se reconhece não vira sessão eterna', () => {
  it('400 por coluna inexistente segue o caminho de antes', () => {
    // É o fallback para o select legado (migração acesso_setup.sql não rodou).
    expect(classificarFalhaPerfil(400, '42703')).toBe('nenhuma');
  });

  it('200 sem código é sucesso', () => {
    expect(classificarFalhaPerfil(200)).toBe('nenhuma');
  });

  it('404 não é indisponibilidade', () => {
    expect(classificarFalhaPerfil(404)).toBe('nenhuma');
  });
});

describe('falha de transporte', () => {
  it('reconhece as mensagens dos navegadores', () => {
    expect(ehFalhaDeTransporte(new TypeError('Failed to fetch'))).toBe(true);
    expect(ehFalhaDeTransporte(new Error('NetworkError when attempting to fetch resource.'))).toBe(true);
    expect(ehFalhaDeTransporte(new Error('Load failed'))).toBe(true);
    expect(ehFalhaDeTransporte('TypeError: fetch failed')).toBe(true);
  });

  it('não confunde erro de aplicação com queda de rede', () => {
    expect(ehFalhaDeTransporte(new Error('permission denied for table profiles'))).toBe(false);
    expect(ehFalhaDeTransporte(null)).toBe(false);
    expect(ehFalhaDeTransporte(undefined)).toBe(false);
  });
});
