import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import { loadUser, requireAuth } from './lib/auth.js';
import { publicRouter } from './routes/public.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';

const app = express();
const port = Number(process.env.PORT || 3001);

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(loadUser);

app.get('/api/health', (_req,res) => res.json({ ok: true, time: new Date().toISOString() }));
app.use('/api/public', publicRouter);
app.use('/api/auth', authRouter);
app.use('/api/admin', requireAuth, adminRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  const msg = err?.message || 'Terjadi kesalahan server.';
  res.status(400).json({ error: msg });
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(__dirname, '../../dist-client');
if (fs.existsSync(clientDir)) {
  app.use(express.static(clientDir));
  app.use((req,res,next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDir,'index.html'));
  });
}

const keyFile = process.env.HTTPS_KEY_FILE?.trim();
const certFile = process.env.HTTPS_CERT_FILE?.trim();

if (keyFile && certFile) {
  const server = https.createServer({
    key: fs.readFileSync(path.resolve(keyFile)),
    cert: fs.readFileSync(path.resolve(certFile))
  }, app);
  server.listen(port, '0.0.0.0', () => {
    console.log(`Perpustakaan server HTTPS aktif di https://0.0.0.0:${port}`);
  });
} else {
  app.listen(port, '0.0.0.0', () => {
    console.log(`Perpustakaan server aktif di http://0.0.0.0:${port}`);
    console.log('Catatan: kamera pada PC/HP lain di LAN memerlukan HTTPS. Isi HTTPS_KEY_FILE dan HTTPS_CERT_FILE untuk mengaktifkannya.');
  });
}
