import { useEffect, useState } from 'react';
import { Icone } from '../components/Icone';
import { contarPendencias, flushFila, listarPendentesFila } from '../services/storage';
import { estadoConectividade } from '../services/conectividade';
import { deveRetentar } from '../services/retentativaRede';

// Indicador de sincronização offline (topbar). Mostra:
//  - Offline: dados sendo salvos no aparelho
//  - Online com pendências: botão para sincronizar agora
//  - Online sem pendências: nuvem ok
//
// A contagem vem do serviço, não do `localStorage`: cada implementação guarda a
// fila em um lugar (v1 no localStorage, v2 no IndexedDB), e ler direto daqui
// fazia a topbar anunciar "Sincronizado" numa organização já migrada, com dados
// pendentes no aparelho.
//
// E o ESTADO DA REDE não vem de `navigator.onLine` sozinho (25/08/2026). Medido
// na prova offline da 9D: com a aba em Offline pelo DevTools, `onLine` ficou
// `true` a sessão inteira enquanto 50 requisições falhavam com `TypeError:
// Failed to fetch` — e a topbar convidava a clicar em "Sincronizar (3)", um
// botão sem como funcionar. Quem decide é `conectividade.ts`, que lê o erro
// REAL da última tentativa de cada pendência.

export default function SyncStatus() {
  const [navegadorOnLine, setNavegadorOnLine] = useState(() => navigator.onLine);
  const [pendencias, setPendencias] = useState(() => contarPendencias());
  const [redeCaiu, setRedeCaiu] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);

  const online = !redeCaiu && navegadorOnLine;

  useEffect(() => {
    const aoOnline = () => setNavegadorOnLine(true);
    const aoOffline = () => setNavegadorOnLine(false);
    window.addEventListener('online', aoOnline);
    window.addEventListener('offline', aoOffline);
    // fila muda por gravações do próprio app — checagem barata a cada 4s
    let ultimaRetentativa = Date.now();
    const reavaliar = () => {
      const pendentes = listarPendentesFila();
      setPendencias(contarPendencias());
      setRedeCaiu(
        estadoConectividade({ navegadorOnLine: navigator.onLine, pendentes }) === 'offline',
      );

      // Rede de segurança dos listeners `online`/`visibilitychange`: quando a
      // conexão volta sem que o navegador perceba, nenhum dos dois dispara e a
      // fila fica parada com a internet de volta (medido em 25/08/2026). Só
      // acontece com evidência de queda e fora da janela — ver
      // `retentativaRede.ts`.
      if (deveRetentar({ pendentes, desdeUltima: Date.now() - ultimaRetentativa })) {
        ultimaRetentativa = Date.now();
        void flushFila().then(() => setPendencias(contarPendencias()));
      }
    };
    reavaliar();
    const timer = window.setInterval(reavaliar, 4000);
    return () => {
      window.removeEventListener('online', aoOnline);
      window.removeEventListener('offline', aoOffline);
      window.clearInterval(timer);
    };
  }, []);

  async function sincronizarAgora() {
    setSincronizando(true);
    try {
      await flushFila();
      setPendencias(contarPendencias());
    } finally {
      setSincronizando(false);
    }
  }

  if (!online) {
    return (
      <span className="sync-status offline" title="Sem internet — os dados são salvos no aparelho e sincronizam quando a conexão voltar.">
        <Icone nome="cloudoff" tam={14} />
        <span className="sync-status-txt">Offline — salvo no aparelho{pendencias > 0 ? ` (${pendencias})` : ''}</span>
      </span>
    );
  }

  if (pendencias > 0) {
    return (
      <button
        type="button"
        className="sync-status pendente"
        onClick={sincronizarAgora}
        disabled={sincronizando}
        title="Há dados salvos no aparelho aguardando envio à nuvem. Toque para sincronizar agora."
      >
        <Icone nome="refresh" tam={14} className={sincronizando ? "girando" : undefined} />
        <span className="sync-status-txt">{sincronizando ? 'Sincronizando...' : `Sincronizar (${pendencias})`}</span>
      </button>
    );
  }

  return (
    <span className="sync-status ok" title="Todos os dados sincronizados com a nuvem.">
      <Icone nome="cloudcheck" tam={14} />
      <span className="sync-status-txt">Sincronizado</span>
    </span>
  );
}
