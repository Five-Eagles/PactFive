import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config as loadEnvFile } from 'dotenv';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 설정 파일 — CLI(generate/migrate/db push 등)가 쓰는 연결·경로 설정.
 *
 * 2026-09-07: Prisma 7부터 schema.prisma의 datasource 블록에 url/directUrl을 못 쓴다
 * (P1012 에러). CLI용 연결 문자열은 이 파일로 옮겼다 — 공식 마이그레이션 가이드
 * (https://pris.ly/d/config-datasource) 그대로다.
 *
 * DIRECT_URL(포트 5432, pgbouncer 안 거침)을 쓴다 — `prisma migrate`가 필요로 하는
 * 스키마 변경(DDL)은 pgbouncer transaction 모드에서 지원되지 않는다. 값이 없으면
 * DATABASE_URL(pooled)로 대체한다 — 그것도 없으면 빈 문자열.
 *
 * `env()` 헬퍼(Prisma 공식 제공) 대신 `process.env`를 직접 쓴다 — `env()`는 값이
 * 없으면 config 로딩 자체를 에러로 던지는데, `prisma generate`는 DB에 실제로 연결하지
 * 않아서 DATABASE_URL/DIRECT_URL이 없어도 원래는 성공해야 한다(Vercel 빌드마다 항상
 * 도는 명령이다 — postinstall 참고). `env()`를 쓰면 이 값이 아직 없는 배포 환경에서
 * `prisma generate` 자체가 막혀 빌드가 실패한다 — Prisma 공식 문서도 이 경우
 * `process.env`를 직접 쓰라고 권고한다.
 *
 * 2026-09-08 버그 수정 — `import 'dotenv/config'`(예전 코드)는 `process.cwd()`의 `.env`만
 * 본다. `prisma generate`/`migrate`는 항상 `app/server`가 cwd인데(npm이 scripts를 그
 * package.json 위치에서 돌린다) 실제 키는 리포 루트 `.env`에 있고 `app/server/.env`는
 * 아예 없다 — 그래서 `DIRECT_URL`/`DATABASE_URL`을 루트 `.env`에 채워도 이 CLI 설정은
 * 계속 못 봤다. `express-app.ts`가 이미 쓰는 것과 같은 방식(파일 위치 기준 상대경로,
 * cwd 무관)으로 고쳤다 — 이 파일은 `app/server/` 바로 밑이라 루트까지 2단계 위다
 * (express-app.ts는 `app/server/src/` 밑이라 3단계 위였다).
 */
loadEnvFile({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
});
