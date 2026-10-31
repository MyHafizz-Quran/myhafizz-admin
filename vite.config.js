import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// En local : `npm run dev` lance le site + l'API (server/dev.js) sur le même port via le proxy.
export default defineConfig({ plugins: [react()], server: { proxy: { '/api': 'http://localhost:8787' } } });
