import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { pinsApi } from './vite.pins.ts'

export default defineConfig({
  appType: 'spa',
  plugins: [react(), pinsApi()],
})
