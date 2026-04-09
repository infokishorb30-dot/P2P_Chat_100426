import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Allow access from any network interface
    host: '0.0.0.0',
    // Enable CORS for cross-origin requests
    cors: true,
    // Ensure HMR works across networks
    middlewareMode: false
  },
  build: {
    // Output directory for production build
    outDir: 'dist',
    // Source map for debugging (optional, remove for smaller bundle)
    sourcemap: false,
    // Use esbuild minifier (built-in, no extra dependencies)
    minify: 'esbuild',
    // Chunk splitting for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          'peerjs': ['peerjs']
        }
      }
    }
  }
})
