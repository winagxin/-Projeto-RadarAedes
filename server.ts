import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { getActiveDbKind, runMigrations, seedFromLocalSamples } from './server/db.ts';
import { criarApiRouter } from './server/routes.ts';

const portaEnv = Number(process.env.PORT);
const PORT = Number.isInteger(portaEnv) && portaEnv > 0 ? portaEnv : 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

async function iniciarServidor() {
  // Inicializa o banco ativo (PostgreSQL se DATABASE_URL existir, senão SQLite),
  // garante o schema das 4 tabelas e carrega amostras locais se necessário
  await runMigrations();
  await seedFromLocalSamples();

  const app = express();
  app.use(express.json());

  // Rotas da API (o front-end lê exclusivamente do nosso servidor/banco)
  app.use('/api', criarApiRouter());

  if (IS_PROD) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      if (req.originalUrl.startsWith('/api/')) return next();
      try {
        const htmlPath = path.resolve(process.cwd(), 'index.html');
        const template = fs.readFileSync(htmlPath, 'utf-8');
        const html = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (err) {
        next(err);
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`RadarAedes rodando em http://0.0.0.0:${PORT} (banco: ${getActiveDbKind()})`);
  });
}

iniciarServidor().catch((err) => {
  console.error('Erro fatal ao iniciar servidor:', err);
  process.exit(1);
});
