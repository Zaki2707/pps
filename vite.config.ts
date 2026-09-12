import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const keyFile = env.HTTPS_KEY_FILE?.trim();
  const certFile = env.HTTPS_CERT_FILE?.trim();

  const canUseHttps = Boolean(
    keyFile &&
    certFile &&
    fs.existsSync(path.resolve(keyFile)) &&
    fs.existsSync(path.resolve(certFile))
  );

  const https = canUseHttps
    ? {
        key: fs.readFileSync(path.resolve(keyFile!)),
        cert: fs.readFileSync(path.resolve(certFile!))
      }
    : undefined;

  const proxyTarget = env.VITE_API_PROXY_TARGET || (canUseHttps ? 'https://localhost:3001' : 'http://localhost:3001');

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      https,
      proxy: {
        '/api': {
          target: proxyTarget,
          secure: false
        }
      }
    },
    build: {
      outDir: 'dist-client'
    }
  };
});
