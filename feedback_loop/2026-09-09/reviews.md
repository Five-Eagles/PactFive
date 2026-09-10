# 2026-09-09 — reviews 1~2단계 app/ 반영 (팀장)

브랜치 `feature/teamlead-cr-port-2026-09-09`. 최종 통합일 작업 3번째 단위.
근거: `features/reviews/review/teamlead-port-instructions-2026-09-09.md`(조준영, §1·§2).

## 배경

`app/server/src/features/reviews/`는 2026-09-05 이식본인데 2026-09-07에 설계서 v2.0으로
계약이 바뀌었다. app/은 폐기된 v1 계약(태그 코드·필드명·에러 코드)을 구현하고 있었다.

## 무엇을 했나

1. **태그 코드 v2.0** — `review.constants.ts`·`review.types.ts`(서버·웹 둘 다) 10종 교체.
   `GOOD_COMMUNICATION`·`PROFESSIONAL_ATTITUDE`는 양방향 공통 코드.
2. **필드명** — `comment`→`content`, `isPublic`→`visibility`(`'BLINDED'|'PUBLISHED'`),
   `createdAt`→`submittedAt`(값은 그대로), `editable: false` 신설. **DB 컬럼(`comment`)은 그대로
   둔다** — `ReviewRow`는 계속 `comment` 필드를 쓰고, API 응답 경계(`toItem`/`toCreateBody`)에서만
   `content`로 옮긴다.
3. **bodyHash 결함 수정** — 정규화된 content를 해시하도록 바꿨다. 이전엔 `input.comment`를
   해시했는데 요청 필드가 `content`로 바뀌어 있었다면(이번 반영 전 상태) 해시가 항상
   `null`로 계산돼 **본문이 다른 요청이 같은 idempotencyKey로 통과**하는 결함이었다.
4. **본문 길이 검증 신설** — `normalizeContent`(1~1,000자, trim). 공백만 있는 문자열은 422.
5. **에러 코드 6종 교체** — `PROJECT_FORBIDDEN`→`REVIEW_FORBIDDEN`,
   `TRANSACTION_NOT_COMPLETED`+`PROJECT_TRANSITION_CONFLICT`(취소 분기)→`PROJECT_NOT_COMPLETED`
   한 덩어리, `REVIEW_ALREADY_EXISTS` 두 용도를 `IDEMPOTENCY_KEY_REUSED`(같은 키·다른 본문)·
   `REVIEW_ALREADY_SUBMITTED`(같은 방향 재작성)로 분리, rating/tags 검증을
   `INVALID_REVIEW_RATING`(400)/`REVIEW_TAG_INVALID`(422)로 분리, `REVIEW_CONTENT_INVALID`
   신설. `idempotencyKey` 누락은 원본대로 `VALIDATION_ERROR` 유지.
6. **반올림 결함 수정** — `displayAverageRating(ratingSum, reviewCount)` 신설, 합계/건수에서
   바로 한 자리로 반올림한다. 이전엔 `ratingSum / reviewCount`를 그대로 내보내(반올림 안 함) —
   화면·클라이언트가 각자 반올림하면 이중 반올림(489/110 → 4.4 대신 4.5) 위험이 있었다.
7. **웹**: `ReviewPage.tsx` TAG_LABEL을 v2 한글 라벨로, `comment`→`content` 상태 변수,
   에러 코드 분기(`REVIEW_ALREADY_SUBMITTED`/`PROJECT_NOT_COMPLETED`)로 갱신.
   `useReviews.ts`의 `conflict` 판정도 같이.

## 아직 안 한 것 (다음 단위, #198·#203)

- 라우트 3종 신설(`reviews/me`·`users/:userId/rating`·`users/:userId/reviews`), 웹 라우트
  `/review`→`/reviews` 복수형 수정, `review-summary`→`rating` 경로 변경, 405 응답(선택).
- 14일 판정을 `createdAt` 기준에서 `review_windows` 기준으로 바꾸는 것 — **CR-RV-002 승인
  대기.** 이번 반영은 지시서가 명시한 대로 그 승인과 무관하게 먼저 반영했다(R1).

## 담당자별 영향 · 후속 조치

**조준영 (reviews)** — 영향 없음, 후속 조치 없음. 이번 반영은 본인이 작성한 이식 지시서를
그대로 따랐다. **확인 필요 (R4)**: 태그 한글 라벨을 지시서 원안대로 `app/web` 상수에 뒀다
(서버가 안 내려줌) — 계약 변경 없음, 그대로 진행. 단, `PROFESSIONAL_ATTITUDE` 라벨이 방향별로
다른데(「업무 태도」/「협업 태도」) 이 화면은 두 방향 태그를 한 목록으로 같이 보여줘 방향 구분
없이 "업무 태도" 쪽으로 고정했다 — 기존에 이미 있던 구조적 한계(화면이 상대 방향을 모른다,
파일 상단 주석·feedback_loop 2026-09-05 기록)라 이번에 새로 만든 문제는 아니지만, 아직
안 풀렸다는 점은 다시 남긴다.

**담당자 메모 (조준영, 2026-09-10) — R4 확인 완료**
- **한글 라벨을 `app/web` 상수로 둔 것 — 동의.** 서버가 라벨을 안 내려주는 계약과
  지시서 §1-2 원안이 같다. 그대로 두시면 됩니다.
- **`PROFESSIONAL_ATTITUDE` 라벨 고정 — 기존 한계로 인정.** 원본은 역할을 알 때
  라벨을 가른다(`prototype/web/review.view-model.ts` `CLIENT_TAG_LABEL` /
  `FREELANCER_TAG_LABEL`). `app/web`은 두 방향 태그를 한 목록으로 보여 서버 422에
  맡기는 절충이라, 「업무 태도」 고정은 이번 이식의 회귀가 아닙니다.
- **후속(이번 Increment 밖).** `GET .../reviews/me`가 이미 방향·당사자 판정을 주므로
  (#198), 작성 화면이 그 응답으로 `allowedTags`를 역할별로 좁히면 원본과 같아집니다.
  지금은 잘못된 방향 태그는 서버가 422로 막으므로 **차단 이슈는 아닙니다.**

**오민혁 (applications)** — 영향 없음. 「완료됨」 배지 CTA가 가리키는 웹 경로(`/review` vs
`/reviews`)는 이번 커밋에서 아직 안 건드렸다 — #198에서 함께 맞춘다.

**다른 기능(project-management·contracts-payments·ai-pricing·engagement·notifications)** —
reviews 폴더 밖에서 이 타입들을 참조하는 곳이 없다(grep 확인) — 영향 없음.

## 검증

- `app/server`, `app/web` tsc 통과
- `app/web` vite build 통과
- `app/server/tests/project-pricing-registration.test.ts` 8/8 통과 (회귀 확인, reviews와 무관한
  스위트지만 같은 브랜치 상태에서 재확인)
