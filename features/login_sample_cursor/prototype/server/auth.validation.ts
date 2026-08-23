import type { LoginInput } from './auth.types';

// spec.md 규칙 1 — 요청 형식 오류(400)는 인증 실패(401)와 다른 케이스로 분리한다.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class ValidationError extends Error {}

export function assertValidLoginInput(input: Partial<LoginInput>): asserts input is LoginInput {
  if (!input.email || !EMAIL_PATTERN.test(input.email)) {
    throw new ValidationError('이메일 형식이 올바르지 않습니다');
  }
  if (!input.password) {
    throw new ValidationError('비밀번호를 입력해주세요');
  }
}
