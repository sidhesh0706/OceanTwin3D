import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8000' } },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three/') || id.includes('node_modules/three-stdlib/'))
            return 'ocean-engine';
          if (id.includes('node_modules/recharts/')) return 'profile-charts';
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
});
