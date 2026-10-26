import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fontes self-hosted (funcionam offline no PWA — sem Google Fonts em runtime)
// v5: DM Sans (texto e títulos) + DM Mono (dados técnicos)
import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/dm-sans/600.css'
import '@fontsource/dm-sans/700.css'
import '@fontsource/dm-mono/400.css'
import '@fontsource/dm-mono/500.css'
// Memorial de cálculo (design/painel_pmta.html): Inter + JetBrains Mono
import '@fontsource-variable/inter/index.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/600.css'
import './styles/tokens.css'
import './styles/forja.css'
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
