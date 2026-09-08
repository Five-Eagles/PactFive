import 'dotenv/config';
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
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
});
