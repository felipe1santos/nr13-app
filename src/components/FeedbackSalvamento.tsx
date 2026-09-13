import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DURACAO_CHECK_MS,
  esperaRestante,
  mensagemDeErro,
  rotuloSalvamento,
  vivacidade,
  type EstadoSalvamento,
} from './salvamento';
import './feedback-salvamento.css';

/**
 * O AVISO DE SALVAMENTO, um só para o sistema inteiro — 10/09/2026.
 *
 * ## Por que existe
 *
 * O usuário clicava em "Salvar" no formulário de ultrassom, o dado ia para o
 * armazenamento, e a tela não dizia nada. Cada tela tinha (ou não tinha) o seu
 * próprio jeito de avisar: um `unidade-salva-ok` aqui, um `toast-sucesso` ali,
 * um `alert()` acolá. Sem um lugar comum, "salvou?" vira uma pergunta que o
 * sistema responde de cinco formas — e em algumas, de nenhuma.
 *
 * ## A regra que ele não quebra
 *
 * O check verde aparece **depois** da promessa resolver, nunca junto do clique.
 * Se a gravação falhar, mostra a falha — não um sucesso otimista. Ver
 * `salvamento.ts`, onde a máquina e os tempos moram (e são testados).
 *
 * ## O que ele NÃO faz
 *
 * Não afirma sincronização com o servidor. `storage.salvar` grava no cache e
 * enfileira; quem conta a história do servidor é o selo da topbar
 * (`SyncStatus`), que existe justamente para isso. "Salvo" aqui quer dizer
 * "guardado", que é a promessa que esta arquitetura cumpre offline.
 */
export function useSalvamento() {
  const [estado, setEstado] = useState<EstadoSalvamento>('ocioso');
  const [erro, setErro] = useState<string | null>(null);
  const vivo = useRef(true);
  const timers = useRef<number[]>([]);

  /**
   * `vivo` volta a TRUE na montagem — e essa linha não é decorativa.
   *
   * O efeito tinha só o cleanup. Em `StrictMode` (dev) o React monta, limpa e
   * monta de novo; sem o setup, `vivo.current` ficava `false` desde a primeira
   * passagem e nunca mais voltava. Consequência: `executar` caía no
   * `if (!vivo.current) return true` e devolvia sucesso **sem nunca mostrar o
   * check** — o aviso ficava preso em "Salvando…" para sempre.
   *
   * Em produção não há StrictMode, então o cleanup só roda no unmount de
   * verdade e o defeito não aparecia. Achado em 13/09/2026, ao ligar o aviso na
   * tela de Certificados e vê-lo travado no desenvolvimento.
   */
  useEffect(() => {
    vivo.current = true;
    const agendados = timers.current;
    return () => {
      vivo.current = false;
      for (const t of agendados) window.clearTimeout(t);
    };
  }, []);

  const agendar = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  /**
   * Roda a gravação de verdade e conduz o aviso.
   *
   * Devolve `true` no sucesso, para quem chama poder decidir o que fazer
   * depois (fechar um modal, navegar) sem repetir o try/catch.
   */
  const executar = useCallback(
    async (operacao: () => Promise<unknown>): Promise<boolean> => {
      setErro(null);
      setEstado('salvando');
      const inicio = Date.now();
      try {
        await operacao();
        // O piso não atrasa a GRAVAÇÃO — ela já terminou. Ele só evita que o
        // aviso pisque por 20 ms, que o olho lê como "não fez nada".
        await new Promise((r) => setTimeout(r, esperaRestante(Date.now() - inicio)));
        if (!vivo.current) return true;
        setEstado('salvo');
        agendar(() => vivo.current && setEstado('ocioso'), DURACAO_CHECK_MS);
        return true;
      } catch (e) {
        if (!vivo.current) return false;
        setErro(mensagemDeErro(e));
        setEstado('erro');
        return false;
      }
    },
    [agendar],
  );

  const limpar = useCallback(() => {
    setEstado('ocioso');
    setErro(null);
  }, []);

  /**
   * Falha que não veio de uma gravação — anexar uma foto que o navegador não
   * conseguiu processar, por exemplo. Aos olhos do usuário é a mesma coisa:
   * ele fez algo e não ficou. Mesmo aviso, mesmo lugar.
   */
  const falhar = useCallback((mensagem: string) => {
    setErro(mensagem);
    setEstado('erro');
  }, []);

  return { estado, erro, executar, limpar, falhar, salvando: estado === 'salvando' };
}

export default function FeedbackSalvamento({
  estado,
  erro,
  aoTentarNovamente,
  aoFechar,
}: {
  estado: EstadoSalvamento;
  erro?: string | null;
  /** Só aparece no erro, e só quando quem chama sabe repetir a operação. */
  aoTentarNovamente?: () => void;
  aoFechar?: () => void;
}) {
  if (estado === 'ocioso') return null;
  const texto = rotuloSalvamento(estado, erro);

  return (
    <div className={`fbs-fundo fbs-${estado}`} role="status" aria-live={vivacidade(estado)}>
      <div className="fbs-caixa">
        {estado === 'salvando' && (
          <span className="fbs-spinner" aria-hidden="true">
            <svg viewBox="0 0 40 40" width="34" height="34">
              <circle className="fbs-trilha" cx="20" cy="20" r="16" fill="none" strokeWidth="3.5" />
              <circle className="fbs-arco" cx="20" cy="20" r="16" fill="none" strokeWidth="3.5" strokeLinecap="round" />
            </svg>
          </span>
        )}
        {estado === 'salvo' && (
          <span className="fbs-marca fbs-ok" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
        )}
        {estado === 'erro' && (
          <span className="fbs-marca fbs-falha" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </span>
        )}
        <span className="fbs-texto">{texto}</span>
        {estado === 'erro' && (
          <span className="fbs-acoes">
            {aoTentarNovamente && (
              <button type="button" className="fbs-btn fbs-btn-forte" onClick={aoTentarNovamente}>
                Tentar novamente
              </button>
            )}
            {aoFechar && (
              <button type="button" className="fbs-btn" onClick={aoFechar}>
                Fechar
              </button>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
