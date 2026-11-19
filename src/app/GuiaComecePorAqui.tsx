/**
 * "Comece por aqui" — guia de primeiros passos (protótipo Cobalto).
 *
 * Fica no canto inferior esquerdo, acima do conteúdo. Cada passo só aparece
 * como FEITO quando há prova no dado — nunca por ter visitado a tela:
 *
 *   · empresa     → `nr13_minha_empresa` com razão social ou nome fantasia;
 *   · equipe      → `nr13_lista_phs` com ao menos uma pessoa;
 *   · cliente     → `nr13_clientes` com ao menos um cliente;
 *   · equipamento → o contador do menu (`nEquip`, do agregado do servidor);
 *   · inspeção    → algum equipamento da 1ª página do catálogo com inspeção;
 *   · relatório   → `contar_relatorios` > 0 (ativos ou históricos);
 *   · agenda      → `nr13_agenda_notas` com ao menos um serviço.
 *
 * As quatro chaves locais são do boot leve (`essencial.ts`), então a leitura é
 * do cache, sem rede. As duas consultas ao servidor rodam só enquanto o passo
 * ainda não está feito, uma vez por sessão (e de novo quando os dados mudam);
 * na dúvida — erro de rede — o passo fica PENDENTE: dizer "feito" sem ter
 * conferido seria pior do que pedir um clique a mais.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icone } from '../components/Icone';
import { ler } from '../services/storage';
import { assinarDadosAlterados } from '../services/eventos';
import { listarPagina } from '../services/buscaIndex';
import { contarRelatorios } from '../services/buscaRelatorios';
import type { MinhaEmpresaDados } from '../features/cadastros/tipos';

const CHAVE_MIN = 'nr13_guia_min';
const CHAVE_FECHADO = 'nr13_guia_fechado';
const CHAVE_SERVIDOR = 'nr13_guia_servidor';

interface Passo {
  id: string;
  titulo: string;
  rota: string;
}

const PASSOS: Passo[] = [
  { id: 'empresa', titulo: 'Cadastre os dados da sua empresa', rota: '/minha-empresa' },
  { id: 'equipe', titulo: 'Cadastre a equipe e o engenheiro responsável', rota: '/funcionarios' },
  { id: 'cliente', titulo: 'Cadastre um cliente', rota: '/empresas' },
  { id: 'equipamento', titulo: 'Cadastre um equipamento', rota: '/equipamentos' },
  { id: 'inspecao', titulo: 'Crie uma inspeção', rota: '/inspecoes' },
  { id: 'relatorio', titulo: 'Gere o primeiro relatório', rota: '/relatorios' },
  { id: 'agenda', titulo: 'Agende um serviço', rota: '/agenda' },
];

function lerPref(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}
function gravarPref(chave: string, valor: string) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    /* sem armazenamento: só não lembra a preferência */
  }
}

function temLista(chave: string): boolean {
  const v = ler<unknown[]>(chave);
  return Array.isArray(v) && v.length > 0;
}

function feitosLocais(nEquip: number): Record<string, boolean> {
  const emp = ler<MinhaEmpresaDados>('nr13_minha_empresa');
  return {
    empresa: !!(emp && ((emp.razao ?? '').trim() || (emp.fantasia ?? '').trim())),
    equipe: temLista('nr13_lista_phs'),
    cliente: temLista('nr13_clientes'),
    equipamento: nEquip > 0,
    agenda: temLista('nr13_agenda_notas'),
  };
}

interface FeitosServidor {
  inspecao?: boolean;
  relatorio?: boolean;
}

function lerServidorSessao(): FeitosServidor {
  try {
    return JSON.parse(sessionStorage.getItem(CHAVE_SERVIDOR) ?? '{}') as FeitosServidor;
  } catch {
    return {};
  }
}

export default function GuiaComecePorAqui({ nEquip }: { nEquip: number }) {
  const navigate = useNavigate();
  const [fechado, setFechado] = useState(() => lerPref(CHAVE_FECHADO) === '1');
  const [min, setMin] = useState(() => lerPref(CHAVE_MIN) === '1');
  const [locais, setLocais] = useState(() => feitosLocais(nEquip));
  const [servidor, setServidor] = useState<FeitosServidor>(lerServidorSessao);
  const consultando = useRef(false);

  const conferirServidor = useCallback(async (atual: FeitosServidor) => {
    if (consultando.current || (atual.inspecao && atual.relatorio)) return;
    consultando.current = true;
    try {
      const [rel, pag] = await Promise.all([
        atual.relatorio ? null : contarRelatorios({ escopo: 'todos' }).catch(() => null),
        atual.inspecao ? null : listarPagina({}, null).catch(() => null),
      ]);
      const novo: FeitosServidor = {
        relatorio: atual.relatorio || (rel ? rel.total > 0 : false),
        inspecao: atual.inspecao || (pag ? pag.itens.some((i) => (i.inspecoes ?? 0) > 0) : false),
      };
      // Relatório gerado pressupõe inspeção registrada no equipamento.
      if (novo.relatorio) novo.inspecao = true;
      try {
        sessionStorage.setItem(CHAVE_SERVIDOR, JSON.stringify(novo));
      } catch {
        /* sem sessão: consulta de novo na próxima carga */
      }
      setServidor(novo);
    } finally {
      consultando.current = false;
    }
  }, []);

  useEffect(() => {
    if (fechado) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- o contador do menu chega depois da montagem
    setLocais(feitosLocais(nEquip));
  }, [nEquip, fechado]);

  useEffect(() => {
    if (fechado) return;
    void conferirServidor(lerServidorSessao());
    return assinarDadosAlterados(() => {
      setLocais(feitosLocais(nEquip));
      void conferirServidor(lerServidorSessao());
    });
  }, [fechado, nEquip, conferirServidor]);

  if (fechado) return null;

  const feito = (id: string) => (id === 'inspecao' || id === 'relatorio' ? !!servidor[id] : !!locais[id]);
  const nFeitos = PASSOS.filter((p) => feito(p.id)).length;
  const pct = Math.round((nFeitos / PASSOS.length) * 100);

  if (pct === 100) {
    return (
      <aside className="guia pronto" aria-label="Primeiros passos concluídos">
        <div className="g-pronto">
          <img className="g-ilus" src="/ilustracoes/ilus-A3-conquista-roseta.webp" alt="" width={132} loading="lazy" decoding="async" />
          <b>Tudo pronto!</b>
          <span>Seu sistema está configurado. Agora é só inspecionar.</span>
          <button
            type="button"
            className="g-ok"
            onClick={() => {
              gravarPref(CHAVE_FECHADO, '1');
              setFechado(true);
            }}
          >
            ENTENDI
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className={`guia${min ? ' min' : ''}`} aria-label="Primeiros passos">
      <button
        type="button"
        className="g-h"
        aria-expanded={!min}
        onClick={() => {
          gravarPref(CHAVE_MIN, min ? '0' : '1');
          setMin(!min);
        }}
      >
        <span className="g-ic" aria-hidden>
          <Icone nome="checkcircle" tam={22} />
        </span>
        <span>
          Comece por aqui e <b>configure seu sistema</b>
        </span>
        <span className="g-chev" aria-hidden>
          <Icone nome="chevdown" tam={18} />
        </span>
        <span className="g-bar">
          <i style={{ width: `${pct}%` }} />
        </span>
        <small>{pct}%</small>
      </button>
      {!min && (
        <ol className="g-l">
          {PASSOS.map((p) => {
            const ok = feito(p.id);
            return (
              <li key={p.id} className={ok ? 'ok' : ''}>
                <button type="button" tabIndex={ok ? -1 : 0} onClick={() => !ok && navigate(p.rota)} aria-disabled={ok || undefined}>
                  <span className="g-ck" aria-hidden>
                    {ok && <Icone nome="check" tam={13} />}
                  </span>
                  <span className="g-t">{p.titulo}</span>
                  {!ok && <Icone nome="chevright" tam={16} />}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
