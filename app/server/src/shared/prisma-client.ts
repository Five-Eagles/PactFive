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

export function isPrismaConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
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
