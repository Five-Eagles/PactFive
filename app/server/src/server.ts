/**
 * 로컬 독립 서버 진입점 — `npm run dev`로 실행한다.
 *
 * src/app.ts의 app을 가져와 listen 한 줄만 추가한다. 이 파일 하나를 추가/삭제하는 것으로
 * 서버리스 ↔ 독립 서버 전환이 끝난다 (app/server/AGENTS.md).
 *
 * 포트 3000은 app/web의 vite proxy 대상과 맞춰져 있다 (app/web/vite.config.ts).
 */
import app from './app';

const PORT = Number(process.env.PORT ?? 3000);

app.listen(PORT, () => {
  console.log(`[pactfive-server] http://localhost:${PORT} 에서 실행 중`);
});
