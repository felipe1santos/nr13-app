import { describe, expect, it } from 'vitest';
import { matchRoutes } from 'react-router-dom';
import {
  rotaEquipamento,
  rotaMemorial,
  rotaInspecaoContainer,
  rotaInspecaoFormulario,
  rotaPortalAtivo,
  rotaInspecoes,
} from './rotas';

// Defeito relatado em 19/08/2026 e reproduzido em produção: TAG com barra
// (`COMPRESSOR V8-15/200L`, o modelo da placa do compressor) virava DOIS
// segmentos de caminho. Nenhuma rota casa `/equipamento/:tag` com dois
// segmentos, o react-router levanta o 404 e o `errorElement` mostra "Ocorreu um
// erro inesperado". A ficha ficava inalcançável — só o card do DEMO abria.
const TAG_BARRA = 'COMPRESSOR V8-15/200L';

// As MESMAS strings de `router.tsx`. Se uma rota for renomeada lá sem mudar
// aqui, os testes de casamento abaixo quebram — que é o aviso desejado.
const rotas = [
  { path: '/equipamento/:tag' },
  { path: '/equipamento/:tag/memorial' },
  { path: '/inspecoes/:tag/:containerId' },
  { path: '/inspecoes/:tag/:containerId/:formulario' },
  { path: '/portal/ativo/:tag' },
];

describe('construtores de rota por TAG', () => {
  it('codifica a barra da TAG na ficha do equipamento', () => {
    expect(rotaEquipamento(TAG_BARRA)).toBe('/equipamento/COMPRESSOR%20V8-15%2F200L');
  });

  it('a ficha continua casando a rota, com a TAG original de volta', () => {
    const m = matchRoutes(rotas, rotaEquipamento(TAG_BARRA));
    expect(m).not.toBeNull();
    expect(m?.[m.length - 1].params.tag).toBe(TAG_BARRA);
  });

  it('memorial, inspeções e portal casam a rota com TAG de barra', () => {
    for (const caminho of [
      rotaMemorial(TAG_BARRA),
      rotaInspecaoContainer(TAG_BARRA, 'c-1'),
      rotaInspecaoFormulario(TAG_BARRA, 'c-1', 'checklist'),
      rotaPortalAtivo(TAG_BARRA),
    ]) {
      const m = matchRoutes(rotas, caminho);
      expect(m, caminho).not.toBeNull();
      expect(m?.[m.length - 1].params.tag).toBe(TAG_BARRA);
    }
  });

  it('o containerId também é codificado — ele vem de dado do usuário', () => {
    const m = matchRoutes(rotas, rotaInspecaoContainer('VP-01', 'lote 1/2'));
    expect(m?.[m.length - 1].params.containerId).toBe('lote 1/2');
  });

  it('TAG com % ou # não quebra o caminho', () => {
    for (const tag of ['VP 50%', 'VP#3']) {
      const m = matchRoutes(rotas, rotaEquipamento(tag));
      expect(m?.[m.length - 1].params.tag, tag).toBe(tag);
    }
  });

  it('a query de origem fica FORA do segmento codificado', () => {
    expect(rotaInspecaoFormulario('VP-01', 'c-1', 'checklist', 'equipamento')).toBe(
      '/inspecoes/VP-01/c-1/checklist?origem=equipamento',
    );
  });

  it('a lista de inspeções leva a TAG na QUERY, também codificada', () => {
    // `&` e `#` na TAG cortariam a query — e `?tag=` é o filtro da lista.
    expect(rotaInspecoes('A&B#1')).toBe('/inspecoes?tag=A%26B%231');
    expect(new URLSearchParams(rotaInspecoes(TAG_BARRA).split('?')[1]).get('tag')).toBe(TAG_BARRA);
  });

  it('sem TAG, a lista de inspeções é a rota nua', () => {
    expect(rotaInspecoes()).toBe('/inspecoes');
  });

  it('TAG sem caractere especial sai idêntica', () => {
    expect(rotaEquipamento('DEMO-CP-01')).toBe('/equipamento/DEMO-CP-01');
  });
});
