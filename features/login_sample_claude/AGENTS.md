# login_sample_claude — AGENTS

이 폴더는 `sdd-framework/feature-workflow.md`를 따르는 실제 기능 폴더가 아니라, **그 워크플로우
문서만으로 "Claude" 역할의 AI가 처음부터 독립적으로 구현하면 어떤 결과가 나오는지 확인하기 위한
시뮬레이션 산출물**이다. 대화 세션의 맥락 없이 오직 커밋된 문서(`docs/naming-convention.md`,
`docs/domain/erd.md`, `docs/domain/prd.md`, `features/sample-login/`, `sdd-framework/constitution.md`)
만 읽었다는 가정으로 작성했다.

시작 전 `sdd-framework/feature-workflow.md`의 "0. 필수 패키지 확인" 절차대로
`node_modules/react` 존재를 확인했다.

실행: `npx tsx prototype/run.tsx` (리포 루트에서 `npm install` 이후, 이 폴더 기준으로 실행).
