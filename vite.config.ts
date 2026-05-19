import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import federation from '@originjs/vite-plugin-federation'

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'ofFederatedApp',
      filename: 'remoteEntry.js',
      exposes: {
        './App': './src/App.tsx',
      },
      shared: ['react', 'react-dom', 'react-redux'],
    }),
  ],
  base: '/of-federated-app/',
  build: {
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
  },
})
