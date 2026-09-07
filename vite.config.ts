import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { geocodeApi } from './vite.geocode.ts'
import { pinsApi } from './vite.pins.ts'

export default defineConfig({
  appType: 'spa',
  plugins: [react(), pinsApi(), geocodeApi()],
  build: {
    // The Three.js scene chunk is large but lazy-loaded (see App.tsx) and
    // never blocks initial render, so the default 500kB warning is noise.
    chunkSizeWarningLimit: 600,
  },
})
