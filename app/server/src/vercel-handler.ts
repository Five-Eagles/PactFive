/**
 * Vercel 서버리스 진입점의 소스 — 빌드 산출물(`app/server/api/index.js`)로 번들링되는 원본이다.
 *
 * Vercel Node 런타임이 Express `app`을 `(req, res)` 핸들러로 인식하므로 별도 어댑터가 없다.
 * 비즈니스 로직은 전부 `app.ts`에 있고 이 파일은 재export만 한다
 * (app/server/AGENTS.md "배포 아키텍처 — 이중 진입점").
 *
 * 2026-09-05 버그 수정 — 예전에는 이 파일이 `app/server/api/index.ts`에 있었고 Vercel이 그
 * `.ts`를 그대로 배포했다. `tsconfig.json`이 `moduleResolution: "bundler"`(확장자 없는
 * 상대경로 import 허용)인데, 이 프로젝트에서 Vercel의 기본 처리는 파일별 개별 트랜스파일만
 * 하고 번들링을 하지 않아서, 배포되면 `app.ts`가 가진 확장자 없는 import
 * (`from './features/.../auth.routes'`)를 Node의 실제 ESM 로더가 못 찾고
 * `ERR_MODULE_NOT_FOUND`로 죽었다(`"type": "module"`이라 CommonJS처럼 확장자를 자동으로
 * 붙여주지 않는다). 로컬 `tsx`는 이 문제를 안 겪어서 로컬에서는 잘 되는 것처럼 보였다.
 *
 * 그래서 이 파일을 `api/` 밖(`src/`)으로 옮기고, `npm run build`(package.json)가
 * `tsc --noEmit`(타입 검사) 뒤에 esbuild로 이 파일을 `api/index.js`로 번들링하게 했다 — 모든
 * 상대경로 import가 하나의 파일로 합쳐지므로 확장자 문제 자체가 사라진다(npm 패키지는
 * `--packages=external`로 번들에 안 넣고 node_modules를 그대로 쓴다). `api/` 폴더에는 이제
 * 빌드 산출물 `index.js`만 생기고 `.ts` 원본을 두지 않는다 — Vercel이 `.ts`/`.js` 중 뭘
 * 우선하는지 추측할 필요가 아예 없어진다. `api/index.js`는 git에 커밋하지 않는다
 * (.gitignore, 배포 때마다 새로 만들어진다).
 */
import app from './app';

export default app;
