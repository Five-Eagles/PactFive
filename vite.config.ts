import { defineConfig } from 'vite';
import path from 'node:path';

// features/*/prototype/web/index.tsx를 브라우저에서 눈으로 확인하기 위한 프리뷰 전용 설정.
// 실제 앱(app/web) 빌드 설정과는 무관하다 — app/web용 설정은 Step 1 구현 착수 시 별도로
// 확정한다 (package.json 설명 참고).
export default defineConfig({
  root: path.resolve(__dirname, 'tools/preview'),
  server: { port: 5173 },
  build: {
    outDir: path.resolve(__dirname, 'dist/preview'),
    emptyOutDir: true,
  },
});
