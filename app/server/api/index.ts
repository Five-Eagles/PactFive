/**
 * Vercel 서버리스 진입점.
 *
 * Vercel Node 런타임이 Express `app`을 `(req, res)` 핸들러로 인식하므로 별도 어댑터가 없다.
 * 비즈니스 로직은 전부 src/app.ts에 있고 이 파일은 재export만 한다
 * (app/server/AGENTS.md "배포 아키텍처 — 이중 진입점").
 */
import app from '../src/app';

export default app;
