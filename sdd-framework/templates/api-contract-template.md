# {feature-name} — API 계약

형식은 `docs/naming-convention.md` §7(REST API), §6(DTO 패턴)을 따른다. 실제로 작성된 전체 예시는
`features/sample-login/api-contract.md`를 참고한다.

## {METHOD} {경로}

<!-- 예: POST /projects, GET /projects/:projectId -->

요청:

```json
{}
```

응답 {상태코드}:

```json
{}
```

에러: <!-- 4xx 상태코드와 조건을 나열. 계정/리소스 존재 여부를 노출하면 안 되는 경우는
같은 메시지로 통일한다 (sample-login 참고) -->

<!-- 엔드포인트가 여러 개면 위 블록을 반복한다 -->

## DTO

```ts
// naming-convention.md §6: 서버 내부 입력은 ...Input, 응답은 ...Response, 목록 항목은 ...Item
```
