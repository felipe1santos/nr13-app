/**
 * O modal de RESULTADOS OBTIDOS — a etapa que cansava.
 *
 * ## Por que existe (10/09/2026)
 *
 * Os resultados eram vinte células nuas no meio de um formulário de trinta
 * campos: duas tabelas lado a lado, cada uma com a sua coluna de valor
 * convencional (a MESMA coluna, digitada duas vezes), sem unidade no campo,
 * sem saber quantos pontos faltavam e sem nada que dissesse se o resultado
 * estava bom. No celular as duas tabelas viravam uma faixa de rolagem
 * horizontal.
 *
 * Aqui a unidade de trabalho é o PONTO: uma linha por ponto, com as duas
 * leituras lado a lado e os dois erros calculados enquanto se digita. Dez
 * campos no lugar de vinte, o progresso no topo, e `Enter` desce para o
 * próximo campo — a mão não sai do teclado e, no celular, o polegar não sai
 * da coluna.
 *
 * O que se GRAVA não mudou: `paraLinhas()` devolve as duas tabelas da folha
 * com o mesmo VC. Os dois templates `CERTIFICADO-CAL-*` não sabem que este
 * modal existe.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icone } from '../../components/Icone';
import { calcularErro } from './calibracaoService';
import {
  PONTOS_NA_FOLHA,
  cabeMaisUmPonto,
  maiorErro,
  pontoVazio,
  resumoPontos,
  type PontoCal,
} from './resultadosCalibracao';
import '../relatorios/modalFiltrosRelatorios.css';
import './modalResultados.css';

export interface ValoresPsv {
  pressaoAbertura: string;
  pressaoAjuste: string;
  fechamento: string;
  incerteza: string;
  coef: string;
}

export interface ValoresManometro {
  pontos: PontoCal[];
  incertezaC: string;
  coefC: string;
  incertezaD: string;
  coefD: string;
}

export default function ModalResultados({
  tipo,
  unidade,
  nome,
  manometro,
  psv,
  aoConfirmar,
  aoFechar,
}: {
  tipo: 'manometro' | 'psv';
  unidade: string;
  nome: string;
  manometro: ValoresManometro;
  psv: ValoresPsv;
  aoConfirmar: (v: { manometro: ValoresManometro; psv: ValoresPsv }) => void;
  aoFechar: () => void;
}) {
  const [man, setMan] = useState<ValoresManometro>(manometro);
  const [val, setVal] = useState<ValoresPsv>(psv);
  const caixa = useRef<HTMLDivElement>(null);
  const primeiro = useRef<HTMLInputElement>(null);

  useEffect(() => {
    primeiro.current?.focus();
    primeiro.current?.select();
  }, []);

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        aoFechar();
        return;
      }
      if (e.key !== 'Tab' || !caixa.current) return;
      const focaveis = caixa.current.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (focaveis.length === 0) return;
      const p = focaveis[0];
      const u = focaveis[focaveis.length - 1];
      if (!e.shiftKey && document.activeElement === u) {
        e.preventDefault();
        p.focus();
      } else if (e.shiftKey && document.activeElement === p) {
        e.preventDefault();
        u.focus();
      }
    }
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aoFechar]);

  const resumo = useMemo(() => resumoPontos(man.pontos), [man.pontos]);
  const pior = useMemo(() => maiorErro(man.pontos), [man.pontos]);

  function setPonto(i: number, campo: keyof PontoCal, v: string) {
    setMan((m) => {
      const pontos = m.pontos.map((p, k) => (k === i ? { ...p, [campo]: v } : p));
      return { ...m, pontos };
    });
  }

  /**
   * `Enter` desce para o mesmo campo do ponto seguinte, em vez de submeter.
   *
   * Quem preenche uma calibração lê o padrão ponto a ponto: digita a leitura
   * do ponto 1, do 2, do 3. Andar na COLUNA é o movimento natural — `Tab`
   * continua andando na linha, para quem preferir.
   */
  function descer(e: React.KeyboardEvent<HTMLInputElement>, campo: string, i: number) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const alvo = caixa.current?.querySelector<HTMLInputElement>(
      `input[data-campo="${campo}"][data-linha="${i + 1}"]`,
    );
    if (alvo) {
      alvo.focus();
      alvo.select();
    }
  }

  const podeConfirmar = tipo === 'psv' ? true : resumo.feitos > 0 || resumo.total === 0;

  return (
    <div
      className="fj-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && aoFechar()}
      role="dialog"
      aria-modal="true"
      aria-label="Resultados obtidos na calibração"
    >
      <div className="fj-modal-box mres-box" ref={caixa}>
        <div className="fj-modal-head">
          <div>
            <h3>Resultados obtidos</h3>
            <p className="mres-sub">
              {nome || (tipo === 'manometro' ? 'Manômetro' : 'Válvula de segurança')} ·{' '}
              <strong>{unidade}</strong>
            </p>
          </div>
          <button type="button" className="fj-modal-close" onClick={aoFechar} aria-label="Fechar">
            <Icone nome="x" tam={15} />
          </button>
        </div>

        {tipo === 'manometro' ? (
          <div className="mres-corpo">
            <div className="mres-barra" role="status">
              <span className="mres-progresso">
                <strong>{resumo.feitos}</strong> de {resumo.total || man.pontos.length} pontos medidos
              </span>
              {pior !== null && (
                <span className="mres-pior">
                  maior erro <strong>{pior}</strong> {unidade}
                </span>
              )}
            </div>

            <div className="mres-tabela" role="table">
              <div className="mres-cabecalho" role="row">
                <span role="columnheader">Ponto</span>
                <span role="columnheader">
                  Valor do padrão<em>{unidade}</em>
                </span>
                <span role="columnheader">
                  Leitura subindo<em>{unidade}</em>
                </span>
                <span role="columnheader" className="mres-col-erro">
                  Erro
                </span>
                <span role="columnheader">
                  Leitura descendo<em>{unidade}</em>
                </span>
                <span role="columnheader" className="mres-col-erro">
                  Erro
                </span>
              </div>

              {man.pontos.map((p, i) => {
                const eC = p.vc && p.viC ? calcularErro(p.vc, p.viC) : null;
                const eD = p.vc && p.viD ? calcularErro(p.vc, p.viD) : null;
                return (
                  <div className="mres-linha" role="row" key={i}>
                    <span className="mres-n" aria-hidden>
                      {i + 1}
                    </span>
                    {/* O rótulo existe sempre e some no desktop por CSS: lá o
                        cabeçalho da tabela já o carrega, e no celular — onde a
                        tabela vira cartão — não haveria mais cabeçalho nenhum. */}
                    <label className="mres-campo mres-campo-vc">
                      <span aria-hidden>Valor do padrão</span>
                      <input
                        ref={i === 0 ? primeiro : undefined}
                        data-campo="vc"
                        data-linha={i}
                        value={p.vc}
                        inputMode="decimal"
                        aria-label={`Valor do padrão no ponto ${i + 1}`}
                        onChange={(e) => setPonto(i, 'vc', e.target.value)}
                        onKeyDown={(e) => descer(e, 'vc', i)}
                      />
                    </label>
                    <label className="mres-campo">
                      <span aria-hidden>Subindo</span>
                      <input
                        data-campo="viC"
                        data-linha={i}
                        value={p.viC}
                        inputMode="decimal"
                        aria-label={`Leitura subindo no ponto ${i + 1}`}
                        onChange={(e) => setPonto(i, 'viC', e.target.value)}
                        onKeyDown={(e) => descer(e, 'viC', i)}
                      />
                    </label>
                    <span className={`mres-erro${eC && eC !== '----' ? ' tem' : ''}`}>{eC ?? '—'}</span>
                    <label className="mres-campo">
                      <span aria-hidden>Descendo</span>
                      <input
                        data-campo="viD"
                        data-linha={i}
                        value={p.viD}
                        inputMode="decimal"
                        aria-label={`Leitura descendo no ponto ${i + 1}`}
                        onChange={(e) => setPonto(i, 'viD', e.target.value)}
                        onKeyDown={(e) => descer(e, 'viD', i)}
                      />
                    </label>
                    <span className={`mres-erro${eD && eD !== '----' ? ' tem' : ''}`}>{eD ?? '—'}</span>
                  </div>
                );
              })}
            </div>

            <div className="mres-linha-acoes">
              {/* O teto é o da FOLHA. Deixar acrescentar o sétimo ponto seria
                  aceitar uma medição que o certificado não imprime — e some
                  sem aviso, que é o defeito que este trabalho inteiro ataca. */}
              <button
                type="button"
                className="fj-btn fj-btn-ghost"
                disabled={!cabeMaisUmPonto(man.pontos)}
                onClick={() => setMan((m) => ({ ...m, pontos: [...m.pontos, pontoVazio()] }))}
              >
                <Icone nome="plus" tam={13} /> Acrescentar ponto
              </button>
              {man.pontos.length > 1 && (
                <button
                  type="button"
                  className="fj-btn fj-btn-ghost"
                  onClick={() => setMan((m) => ({ ...m, pontos: m.pontos.slice(0, -1) }))}
                >
                  Remover o último
                </button>
              )}
              {!cabeMaisUmPonto(man.pontos) && (
                <span className="mres-teto">
                  O certificado imprime {PONTOS_NA_FOLHA} pontos.
                </span>
              )}
            </div>

            <div className="mres-incertezas">
              <div className="mres-inc-grupo">
                <span className="mres-inc-titulo">Sentido crescente</span>
                <label>
                  <span>Incerteza de medição</span>
                  <input
                    value={man.incertezaC}
                    inputMode="decimal"
                    onChange={(e) => setMan((m) => ({ ...m, incertezaC: e.target.value }))}
                  />
                </label>
                <label>
                  <span>Coeficiente k</span>
                  <input
                    value={man.coefC}
                    inputMode="decimal"
                    onChange={(e) => setMan((m) => ({ ...m, coefC: e.target.value }))}
                  />
                </label>
              </div>
              <div className="mres-inc-grupo">
                <span className="mres-inc-titulo">Sentido decrescente</span>
                <label>
                  <span>Incerteza de medição</span>
                  <input
                    value={man.incertezaD}
                    inputMode="decimal"
                    onChange={(e) => setMan((m) => ({ ...m, incertezaD: e.target.value }))}
                  />
                </label>
                <label>
                  <span>Coeficiente k</span>
                  <input
                    value={man.coefD}
                    inputMode="decimal"
                    onChange={(e) => setMan((m) => ({ ...m, coefD: e.target.value }))}
                  />
                </label>
              </div>
              <button
                type="button"
                className="fj-btn fj-btn-ghost mres-copiar"
                onClick={() =>
                  setMan((m) => ({ ...m, incertezaD: m.incertezaC, coefD: m.coefC }))
                }
                disabled={man.incertezaC === '' && man.coefC === ''}
              >
                <Icone nome="copy" tam={13} /> Repetir no decrescente
              </button>
            </div>
          </div>
        ) : (
          <div className="mres-corpo">
            <p className="mres-ajuda">
              Os três valores do ensaio da válvula. A <strong>pressão de ajuste</strong> vem do
              cadastro do componente quando já estiver preenchida lá.
            </p>
            <div className="mres-psv">
              <label>
                <span>
                  Pressão de abertura<em>{unidade}</em>
                </span>
                <input
                  ref={primeiro}
                  value={val.pressaoAbertura}
                  inputMode="decimal"
                  onChange={(e) => setVal((v) => ({ ...v, pressaoAbertura: e.target.value }))}
                />
              </label>
              <label>
                <span>
                  Pressão de ajuste<em>{unidade}</em>
                </span>
                <input
                  value={val.pressaoAjuste}
                  inputMode="decimal"
                  onChange={(e) => setVal((v) => ({ ...v, pressaoAjuste: e.target.value }))}
                />
              </label>
              <label>
                <span>
                  Fechamento<em>{unidade}</em>
                </span>
                <input
                  value={val.fechamento}
                  inputMode="decimal"
                  onChange={(e) => setVal((v) => ({ ...v, fechamento: e.target.value }))}
                />
              </label>
              <label>
                <span>Incerteza de medição</span>
                <input
                  value={val.incerteza}
                  inputMode="decimal"
                  onChange={(e) => setVal((v) => ({ ...v, incerteza: e.target.value }))}
                />
              </label>
              <label>
                <span>Coeficiente k</span>
                <input
                  value={val.coef}
                  inputMode="decimal"
                  onChange={(e) => setVal((v) => ({ ...v, coef: e.target.value }))}
                />
              </label>
            </div>
          </div>
        )}

        <div className="mres-acoes">
          <button type="button" className="fj-btn fj-btn-ghost" onClick={aoFechar}>
            Cancelar
          </button>
          <button
            type="button"
            className="fj-btn fj-btn-primary"
            disabled={!podeConfirmar}
            onClick={() => aoConfirmar({ manometro: man, psv: val })}
          >
            Aplicar resultados
          </button>
        </div>
      </div>
    </div>
  );
}
