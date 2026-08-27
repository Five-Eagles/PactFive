import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';

/**
 * Express 앱 — 순수 모듈. 여기서 `app.listen()`을 호출하지 않는다.
 * 배포 진입점은 분리한다 (app/server/AGENTS.md "배포 아키텍처 — 이중 진입점"):
 *   - api/index.ts   → Vercel 서버리스
 *   - src/server.ts  → 로컬 독립 서버
 */
const app = express();

// app/web과 app/server는 Vercel 프로젝트가 분리돼 있어 배포 시 오리진이 다르다 (ADR-0007).
// 허용할 프론트 주소는 환경 변수로 받는다 (쉼표로 여러 개 가능).
// 로컬 개발은 vite proxy를 쓰므로 CORS를 타지 않는다 (app/web/vite.config.ts).
const allowedOrigins = (process.env.WEB_ORIGIN ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true,
  }),
);

app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// 기능별 라우터를 등록하는 곳은 여기 한 곳뿐이다 (app/web의 App.tsx와 대칭).
// 통합 시 아래처럼 추가한다:
//   import authRoutes from './features/user-management/auth.routes';
//   app.use('/api/v1/auth', authRoutes);
//
// 외부 벤더 어댑터(supabase-auth.adapter 등)를 구체 타입으로 연결하는 조립 지점도 여기다
// (app/server/AGENTS.md "외부 벤더 연동", ADR-0009).

app.use((_req: Request, res: Response) => {
  res.status(404).json({ message: 'Not Found' });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ message: 'Internal Server Error' });
});

export default app;
