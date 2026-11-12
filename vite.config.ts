import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// 국가법령정보 Open API는 브라우저에서 직접 호출할 수 없어(CORS) 같은 출처의 /lawapi 경로로 중계한다.
// 배포 환경에서는 vercel.json의 rewrites가 같은 역할을 한다.
const lawProxy = { '/lawapi': { target: 'https://www.law.go.kr', changeOrigin: true, rewrite: (p: string) => p.replace(/^\/lawapi/, '') } };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 3000, host: '0.0.0.0', proxy: lawProxy },
  preview: { port: 4173, proxy: lawProxy },
  build: { chunkSizeWarningLimit: 1200 },
  test: { include: ['src/**/*.test.ts'] },
});
