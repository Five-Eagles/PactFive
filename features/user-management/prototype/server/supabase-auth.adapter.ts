import type { AuthProvider } from "./auth.port";

// 실제 Supabase SDK, 프로젝트 URL, 키가 아직 준비 완료로 확인되지 않았으므로 이 단계에서는
// composition root가 실수로 라이브 어댑터를 선택하지 못하게 fail-closed 한다. 연동 단계에서는
// 이 파일만 @supabase/supabase-js를 import하고 AuthProvider를 구현해야 한다.
export function createSupabaseAuthAdapter(): AuthProvider {
  throw new Error("AUTH_PROVIDER_NOT_READY: Supabase 설정 readback과 secret 주입이 필요합니다.");
}
