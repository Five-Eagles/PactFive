# 외부 대기 회신 — 오민혁 — 2026-08-31

| | |
|---|---|
| 보내는 사람 | 오민혁 · user-management |
| 받는 사람 | 조준영 · reviews |
| 원문 | `external-wait-2026-08-31.md` §3 |
| 회신 범위 | `REVIEW_CREATED` 소비와 `users.rating_average` · `users.review_count` 갱신 계약 |
| 구현 상태 | 인터페이스 합의. user-management 소비자 구현 완료를 의미하지 않음 |

## 회신

| # | 질문 | 답변 | 조건·메모 |
|---|---|---|---|
| M1 | 공개 시점에만 소비하고 미공개 INSERT는 무시하는가 | **예** | `REVIEW_CREATED`는 이름과 무관하게 실제 공개가 확정된 리뷰만 의미한다. `publishedAt`은 실제 공개 시각이어야 한다. |
| M2 | 같은 `reviewId`를 멱등 처리하는가 | **예** | 동일 이벤트가 재전송돼도 캐시를 증분으로 두 번 올리지 않는다. 공개 리뷰 집계를 다시 읽어 같은 값으로 덮어쓰는 방식으로 수렴시킨다. |
| M3 | 현재 5필드로 평점 캐시 갱신이 충분한가 | **조건부 예** | 이벤트 트리거·대상 식별에는 충분하다. 정확한 재계산을 위해 Reviews가 공개 리뷰 집계 조회 포트를 제공해야 한다. 이 포트가 없다면 이벤트 페이로드만으로는 부족하다. |
| M4 | 평균은 공개분 산술평균인가 | **예** | 공개된 리뷰만 포함하는 가중치 없는 산술평균이다. 0건이면 `rating_average=null`, `review_count=0`이다. |

## 합의할 내부 계약

Reviews 도메인은 user-management가 Reviews 저장소를 직접 import하지 않도록 작은 읽기 포트를
제공한다.

```ts
type PublishedRatingAggregate = {
  ratingSum: number;
  reviewCount: number;
};

interface PublishedRatingAggregateReader {
  getPublishedRatingAggregate(revieweeId: string): Promise<PublishedRatingAggregate>;
}
```

user-management 소비자는 다음 순서로 처리한다.

1. 공개 트랜잭션이 확정된 뒤 전달된 `REVIEW_CREATED`만 받는다.
2. `revieweeId`로 공개 리뷰의 `ratingSum`·`reviewCount`를 조회한다.
3. `reviewCount`가 0이면 `rating_average=null`, `review_count=0`으로 저장한다.
4. 1건 이상이면 원본 합계에서 산술평균을 구하고, DB `numeric(3,2)` 저장 시점에만 소수 둘째
   자리로 반올림한다.
5. `rating_average`·`review_count`를 한 트랜잭션에서 원자적으로 덮어쓴다.

기존의 반올림된 `rating_average`에 새 `rating`을 계속 더하는 증분 계산은 사용하지 않는다.
이벤트가 중복되거나 순서가 바뀌어도 공개분 전체 집계를 다시 읽으므로 동일 결과로 수렴해야 한다.

## 전달·실패 정책

- `REVIEW_CREATED`는 해당 리뷰의 공개 확정 커밋 이후 발행한다.
- 전달은 재시도·중복 수신이 가능한 at-least-once 방식으로 간주한다.
- 캐시 갱신 실패가 리뷰 공개를 취소하지 않는다. 재시도 또는 재집계로 복구한다.
- 현재 리뷰는 공개 후 PATCH·삭제가 없다는 불변을 유지한다. 정책이 바뀌면 별도 이벤트와 캐시
  재계산 계약을 다시 합의한다.
- 현재 5필드 `reviewId` · `projectId` · `revieweeId` · `rating` · `publishedAt`은 유지한다.
  집계값을 이벤트에 복제하지 않고 Reviews 읽기 포트를 정본으로 사용한다.

## Discord 전달 문안

> 조준영님, 오민혁(user-management) §3 회신입니다.
>
> M1 예 — 미공개 INSERT는 무시하고 실제 공개 시점의 `REVIEW_CREATED`만 소비합니다.
>
> M2 예 — 동일 `reviewId` 재수신으로 `rating_average`·`review_count`가 중복 증가하지 않도록
> 멱등 처리합니다.
>
> M3 조건부 예 — 제시한 5필드는 이벤트 트리거와 대상 식별에는 충분합니다. 다만 반올림된 기존
> 평균에 평점을 증분 계산하지 않고, ERD 기준대로 Users가 공개 리뷰 합계·개수를 재계산해야 합니다.
> Reviews 쪽에서 `getPublishedRatingAggregate(revieweeId) → { ratingSum, reviewCount }` 내부 조회
> 계약을 제공해 주세요. 이 조회 계약이 없다면 이벤트 페이로드만으로는 정확한 갱신이 부족합니다.
>
> M4 예 — 공개된 리뷰만의 가중치 없는 산술평균입니다. 0건이면 `rating_average=null`,
> `review_count=0`으로 유지하고, 평균은 원본 합계에서 계산한 뒤 저장 시 한 번만 소수 둘째 자리로
> 반올림합니다.
>
> 이벤트는 리뷰 공개 커밋 이후 발행하고 재전송 가능하게 해 주세요. 이번 회신은 인터페이스
> 합의이며 user-management 소비자 구현이 이미 완료됐다는 의미는 아닙니다.
