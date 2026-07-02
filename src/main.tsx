import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fontes self-hosted (funcionam offline no PWA — sem Google Fonts em runtime)
import '@fontsource-variable/inter/index.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'
import './styles/tokens.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// PWA: registra o service worker (habilita instalação na área de trabalho e uso offline).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* registro falhou (ex.: ambiente sem HTTPS) — app segue funcionando normal */
    })
  })
}
