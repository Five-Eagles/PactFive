import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

/**
 * PrismaClient 싱글턴 — 실제 Postgres(Supabase) 연결.
 *
 * 2026-09-07, 물리 마이그레이션 + 어댑터 교체 트랙(팀장 작업, 인메모리→Prisma 전환의
 * 첫 조각인 user-management부터 시작). Vercel 서버리스 콜드 스타트마다 새 커넥션을
 * 여는 걸 피하려고 모듈 스코프에서 한 번만 만든다 — Express 앱 자체가 이미
 * express-app.ts에서 모듈 스코프 싱글턴 패턴을 쓰고 있어(`authProvider` 등) 동일한
 * 관례를 따른다.
 *
 * `@prisma/adapter-pg`(순수 JS pg 드라이버) 위에서 동작한다 — 배포 OS별 네이티브
 * 쿼리 엔진 바이너리를 맞출 필요가 없다(schema.prisma generator 블록 주석 참고).
 *
 * `DATABASE_URL`은 Supabase의 pooled 연결(포트 6543, pgbouncer transaction 모드)이어야
 * 한다 — direct 연결(5432)을 런타임에 쓰면 서버리스 함수 인스턴스가 늘어날 때
 * Postgres 커넥션이 금방 고갈된다(.env.example 참고).
 */

let client: PrismaClient | null = null;

/**
 * 2026-09-08 — `DATABASE_URL` 존재만으로 안 정하고 `authProviderMode`도 같이 본다(팀장 결정).
 *
 * 이유 1(원래 목적): 로컬은 `AUTH_PROVIDER_MODE`가 기본값 `mock`이고 배포는 기본값
 * `supabase`다(express-app.ts) — 이미 팀 전체가 매일 쓰는 `npm run dev`의 mock 인증
 * 프롬프트가 그대로 "로컬 페이즈/배포 페이즈" 스위치가 된다. `DATABASE_URL`을 로컬
 * `.env`에 그대로 둬도(지금 팀장 로컬처럼) mock 모드로 뜨면 자동으로 InMemory로 빠져서,
 * 로컬 `.env`를 매번 지웠다 채웠다 안 해도 된다.
 *
 * 이유 2(더 중요한 근거, 로컬 mock 인증 흐름을 다시 보다가 발견) — mock 인증
 * (`auth.mock.ts`)이 발급하는 `usr_00000000000000000000000001`/`...002`는 실제 DB에
 * 없는 가짜 id다(오늘 만든 마이그레이션은 스키마만 만들었고 이 행들을 심지 않았다).
 * mock 인증 상태에서 Prisma 리포지토리가 켜져 있으면, 이 가짜 id로 만든 지원·북마크 등의
 * 행이 `users` 테이블 FK 제약을 못 만족해 INSERT가 그대로 깨진다 — 그러니 mock 모드에서는
 * Prisma를 켜면 안 된다는 게 "로컬 편의" 이상의 정합성 요구사항이다.
 *
 * `authProviderMode`를 인자로 받는 이유: `isProduction ? 'supabase' : 'mock'` 기본값 계산은
 * 이미 express-app.ts에 있다 — 여기서 또 계산하면 두 곳이 갈라질 위험이 생긴다(단일 정본
 * 원칙, 이 세션 전체에서 반복해 온 패턴).
 */
export function isPrismaConfigured(authProviderMode: string): boolean {
  return authProviderMode !== 'mock' && Boolean(process.env.DATABASE_URL);
}

export function getPrismaClient(): PrismaClient {
  if (!client) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL이 설정되지 않았습니다 — PrismaAuthRepository를 준비할 수 없습니다.');
    }
    const adapter = new PrismaPg({ connectionString });
    client = new PrismaClient({ adapter });
  }
  return client;
}
