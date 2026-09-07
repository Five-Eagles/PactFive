/**
 * 로컬 독립 서버 진입점 — `npm run dev`로 실행한다.
 *
 * src/express-app.ts의 app을 가져와 listen 한 줄만 추가한다. 이 파일 하나를 추가/삭제하는
 * 것으로 서버리스 ↔ 독립 서버 전환이 끝난다 (app/server/AGENTS.md).
 *
 * 2026-09-06 — 원래 이름은 `server.ts`였는데 `dev-server.ts`로 바꿨다. Vercel의 Express
 * zero-config 자동 감지가 `src/server.{js,ts,...}`를 정확히 찾는 경로 중 하나라서, 이 이름
 * 그대로 두면 Vercel이 (번들링된 배포 산출물 대신) 이 로컬 전용 파일을 배포 대상으로 오인식할
 * 수 있었다 (app/server/AGENTS.md "배포 아키텍처" 참고).
 *
 * 포트 3000은 app/web의 vite proxy 대상과 맞춰져 있다 (app/web/vite.config.ts).
 */
import app from './express-app';

const PORT = Number(process.env.PORT ?? 3000);

app.listen(PORT, () => {
  console.log(`[pactfive-server] http://localhost:${PORT} 에서 실행 중`);
});
