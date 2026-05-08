import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/seoul-api': {
        target: 'http://openapi.seoul.go.kr:8088',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/seoul-api/, ''),
      },
      '/subway-api': {
        target: 'http://swopenAPI.seoul.go.kr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/subway-api/, ''),
      },
      '/culture-image': {
        target: 'https://culture.seoul.go.kr',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/culture-image/, ''),
      },
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
    },
  },
});
