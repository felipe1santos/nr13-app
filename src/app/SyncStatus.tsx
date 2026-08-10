import { useEffect, useState } from 'react';
import { Icone } from '../components/Icone';
import { contarPendencias, flushFila } from '../services/storage';

// Indicador de sincronização offline (topbar). Mostra:
//  - Offline: dados sendo salvos no aparelho
//  - Online com pendências: botão para sincronizar agora
//  - Online sem pendências: nuvem ok
//
// A contagem vem do serviço, não do `localStorage`: cada implementação guarda a
// fila em um lugar (v1 no localStorage, v2 no IndexedDB), e ler direto daqui
// fazia a topbar anunciar "Sincronizado" numa organização já migrada, com dados
// pendentes no aparelho.

export default function SyncStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [pendencias, setPendencias] = useState(() => contarPendencias());
  const [sincronizando, setSincronizando] = useState(false);

  useEffect(() => {
    const aoOnline = () => setOnline(true);
    const aoOffline = () => setOnline(false);
    window.addEventListener('online', aoOnline);
    window.addEventListener('offline', aoOffline);
    // fila muda por gravações do próprio app — checagem barata a cada 4s
    const timer = window.setInterval(() => setPendencias(contarPendencias()), 4000);
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
