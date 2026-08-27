import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// app/web 전용 설정. 리포 루트의 vite.config.ts는 features/*/prototype/web 프리뷰
// 하네스(tools/preview)용이며 이 파일과 무관하다 (app/web/AGENTS.md 참고).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174, // 루트 프리뷰 하네스(5173)와 동시에 띄울 수 있도록 다른 포트를 쓴다
    proxy: {
      // 로컬 개발 시 /api 요청을 app/server(3000)로 넘긴다.
      // 이 덕분에 개발 중에는 VITE_API_BASE_URL을 비워둬도 되고, CORS 설정 없이 동작한다.
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
