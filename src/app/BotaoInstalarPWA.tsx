import { useEffect, useState } from 'react';

// Evento beforeinstallprompt (não tipado no lib.dom padrão).
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Botão de "instalar app" (PWA). Vive dentro do menu da conta (variante "item");
// a variante "icone" é a antiga, ainda usada onde só cabe um botão quadrado.
// Usa o prompt nativo do navegador quando disponível; senão mostra instruções manuais.
export default function BotaoInstalarPWA({
  className = '',
  variante = 'icone',
  aoConcluir,
}: {
  className?: string;
  variante?: 'icone' | 'item';
  aoConcluir?: () => void;
}) {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [instalado, setInstalado] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches,
  );

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalado = () => {
      setInstalado(true);
      setPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalado);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalado);
    };
  }, []);

  if (instalado) return null;

  async function instalar() {
    if (prompt) {
      await prompt.prompt();
      await prompt.userChoice;
      setPrompt(null);
      aoConcluir?.();
      return;
    }
    aoConcluir?.();
    // Sem prompt nativo (iOS/Safari ou já elegível por outro caminho): instrui manualmente.
    alert(
      'Para instalar o app:\n\n' +
        '• Chrome/Edge (PC): ícone de instalar na barra de endereço, ou menu ⋮ → "Instalar".\n' +
        '• Android: menu ⋮ → "Adicionar à tela inicial".\n' +
        '• iPhone (Safari): botão Compartilhar → "Adicionar à Tela de Início".',
    );
  }

  const icone = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );

  if (variante === 'item') {
    return (
      <button type="button" className="menu-conta-item" role="menuitem" onClick={instalar}>
        {icone}
        <span>Instalar aplicativo</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`btn-instalar-pwa ${className}`}
      onClick={instalar}
      title="Instalar app na área de trabalho"
      aria-label="Instalar app"
    >
      {icone}
    </button>
  );
}
