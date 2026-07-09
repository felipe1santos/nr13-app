import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      // CALCULOS/ guarda planilhas/imagens de referência fora do código — arquivos ficam
      // abertos em outros programas (Explorer/Photos) e travam o watcher do Vite (EBUSY).
      ignored: ['**/CALCULOS/**'],
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
