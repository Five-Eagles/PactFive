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

// 2026-09-10 추가 — 이 로컬 서버는 지금까지 예상 못한 에러가 나면 전체 프로세스가 죽는
// 구조였다(예: applications의 toHttp()가 미인식 에러를 rethrow → Express가 못 잡음 →
// 전역 handler도 없음 → Node가 프로세스 종료). 그날그날 발견되는 개별 지점(toHttp() 등)은
// 각자 고치는 게 맞지만, 아직 못 찾은 지점이 더 있을 수 있으니 로컬 QA 중에 서버 전체가
// 말없이 죽어서(vite 프록시에 ECONNREFUSED만 남고) 원인을 못 찾는 상황을 막는 마지막
// 안전망만 추가한다 — 배포 환경(Vercel 서버리스)에는 이 파일이 쓰이지 않는다(파일 헤더
// 주석 참고).
process.on('unhandledRejection', (reason) => {
  console.error('[pactfive-server] 처리되지 않은 Promise 거부 — 서버는 계속 실행합니다:', reason);
});
process.on('uncaughtException', (error) => {
  console.error('[pactfive-server] 처리되지 않은 예외 — 서버는 계속 실행합니다:', error);
});

app.listen(PORT, () => {
  console.log(`[pactfive-server] http://localhost:${PORT} 에서 실행 중`);
});
