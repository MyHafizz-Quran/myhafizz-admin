// Serveur local de l'API pour `npm run dev` (lit .env.local).
import { serve } from '@hono/node-server';
import app from './app.js';
serve({ fetch: app.fetch, port: 8787 }, () => console.log('API admin sur http://localhost:8787'));
