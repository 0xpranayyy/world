import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { geocodeApi } from './vite.geocode.ts'
import { pinsApi } from './vite.pins.ts'

export default defineConfig({
  appType: 'spa',
  plugins: [react(), pinsApi(), geocodeApi()],
})
