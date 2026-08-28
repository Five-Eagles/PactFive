#!/usr/bin/env node
'use strict';

// scripts/check-design-drift.js — 시안과 app/web 사이의 표류를 찾는다
//
// 사용법: npm run check:design
//
// 검사 셋:
//   1. 클래스 누락  — features/*/design/_tokens.css 의 클래스가
//                     app/web/src/shared/ui/tokens.css 에 있는가
//   2. 담당자 간 표류 — 여러 기능의 _tokens.css 가 서로 다른가
//   3. 원시 색상값   — app/web 컴포넌트에 #RRGGBB 가 박혀 있는가
//
// ## 왜 필요한가
//
// 2026-08-28 통합에서 `_tokens.css` 의 토큰 변수(:root)만 옮기고 그 아래 컴포넌트 클래스
// 100여 줄을 빠뜨렸다. `.frame` · `.kv` · `.h2` · `.steps` 가 없으니 시안의 레이아웃을 쓸 수
// 없었고, 화면이 문구만 맞고 구조는 다른 상태가 됐다. 사람 눈으로는 "스타일이 있긴 하다"로
// 보여서 놓치기 쉬운데, 클래스 이름 대조는 기계가 확실히 잡는다.
//
// ## 이 스크립트가 잡지 못하는 것
//
// **클래스가 있다고 화면이 시안과 같다는 뜻은 아니다.** 2단 그리드인지, 사이드바가 sticky인지,
// 카드 경계가 맞는지는 사람이 시안을 열어 봐야 한다 (app/web/AGENTS.md "통합 시 확인").
// 이 검사는 그 확인을 대신하지 않고, 확인을 시작하기 전에 명백한 누락을 걸러낼 뿐이다.

const { readFileSync, readdirSync, existsSync } = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const APP_TOKENS = path.join(REPO_ROOT, 'app/web/src/shared/ui/tokens.css');
const FEATURES_DIR = path.join(REPO_ROOT, 'features');
const WEB_SRC = path.join(REPO_ROOT, 'app/web/src');

/** `.foo`, `.foo.bar`, `.foo > .bar` 등에서 클래스 이름만 뽑는다 */
function classNamesIn(css) {
  const found = new Set();
  for (const match of css.matchAll(/\.([a-zA-Z][\w-]*)/g)) found.add(match[1]);
  return found;
}

/** 시안 파일에만 쓰이는 것 — app/web 은 시안 미리보기 페이지가 아니라 실제 앱이다 */
const PREVIEW_ONLY = new Set([
  'meta', // 시안 상단 제목 블록
  'fi', // 시안 배지
  'screen', // 시안 화면 구분 래퍼
  'id', // 시안 화면 번호 라벨
  'required', // 필수 요소 목록 표
  'lead',
]);

/**
 * 시안은 변형을 `.btn.primary` 처럼 두 클래스로 쓰고, app/web 은 BEM `.btn--primary` 로 쓴다
 * (docs/naming-convention.md §5). 이름 규칙 차이지 표류가 아니므로, 어떤 app 클래스가
 * `--<이름>` 으로 끝나면 있는 것으로 본다.
 *
 * **이름이 아예 다른 경우는 걸러지지 않는다** — 예컨대 시안의 `.badge.open` 을 app 이
 * `.badge--success` 로 옮겼다면 여기서 잡히지 않고 누락으로 보고된다. 그건 실제로
 * 확인이 필요한 지점이라 일부러 통과시키지 않는다.
 */
function satisfiedByModifier(name, appClasses) {
  const suffix = `--${name}`;
  for (const existing of appClasses) {
    if (existing.endsWith(suffix)) return true;
  }
  return false;
}

function collectFeatureTokens() {
  if (!existsSync(FEATURES_DIR)) return [];
  return readdirSync(FEATURES_DIR)
    .map((feature) => ({
      feature,
      file: path.join(FEATURES_DIR, feature, 'design/_tokens.css'),
    }))
    .filter((entry) => existsSync(entry.file))
    .map((entry) => ({ ...entry, css: readFileSync(entry.file, 'utf8') }));
}

function collectWebComponents(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectWebComponents(full, found);
    else if (entry.name.endsWith('.tsx')) found.push(full);
  }
  return found;
}

function main() {
  const problems = [];
  const notes = [];

  const featureTokens = collectFeatureTokens();
  if (featureTokens.length === 0) {
    console.log('[check:design] features/*/design/_tokens.css 가 없습니다 — 검사할 것이 없습니다.');
    return 0;
  }
  if (!existsSync(APP_TOKENS)) {
    problems.push(`app/web/src/shared/ui/tokens.css 가 없습니다.`);
    report(problems, notes);
    return 1;
  }

  // ── 1. 클래스 누락 ──────────────────────────────────────────
  const appClasses = classNamesIn(readFileSync(APP_TOKENS, 'utf8'));
  const missing = new Map(); // class -> [feature]

  for (const { feature, css } of featureTokens) {
    for (const name of classNamesIn(css)) {
      if (PREVIEW_ONLY.has(name) || appClasses.has(name)) continue;
      if (satisfiedByModifier(name, appClasses)) continue;
      if (!missing.has(name)) missing.set(name, []);
      missing.get(name).push(feature);
    }
  }

  if (missing.size > 0) {
    problems.push(
      `시안에 정의된 클래스 ${missing.size}개가 app/web/src/shared/ui/tokens.css 에 없습니다.\n` +
        [...missing.entries()]
          .map(([name, features]) => `    .${name}  (${[...new Set(features)].join(', ')})`)
          .join('\n') +
        `\n\n  시안의 레이아웃을 쓰려면 이 클래스들이 필요합니다. 옮기지 않기로 했다면\n` +
        `  feedback_loop 에 이유를 남기고 이 스크립트의 PREVIEW_ONLY 에 추가하세요.`,
    );
  }

  // ── 2. 담당자 간 표류 ───────────────────────────────────────
  const byContent = new Map();
  for (const { feature, css } of featureTokens) {
    const key = css.replace(/\r\n/g, '\n');
    if (!byContent.has(key)) byContent.set(key, []);
    byContent.get(key).push(feature);
  }
  if (byContent.size > 1) {
    notes.push(
      `features/*/design/_tokens.css 가 기능마다 다릅니다 — 정본은 design-system/design-tokens.md 하나입니다.\n` +
        [...byContent.values()].map((group) => `    [${group.join(', ')}]`).join('\n') +
        `\n\n  담당자끼리 이미 갈라진 상태입니다. 통합 전에 어느 쪽이 맞는지 정해야 합니다.`,
    );
  }

  // ── 3. 원시 색상값 ──────────────────────────────────────────
  const rawColors = [];
  for (const file of collectWebComponents(WEB_SRC)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      // 주석에 예시로 적은 것은 넘어간다 (primitives.tsx 가 "#0B132B 같은 것"을 설명한다)
      if (/^\s*(\*|\/\/)/.test(line)) return;
      if (/#[0-9A-Fa-f]{6}\b/.test(line)) {
        rawColors.push(`    ${path.relative(REPO_ROOT, file)}:${index + 1}`);
      }
    });
  }
  if (rawColors.length > 0) {
    problems.push(
      `화면 코드에 원시 색상값(#RRGGBB)이 박혀 있습니다 — 색은 tokens.css 의 CSS 변수로만 씁니다.\n` +
        rawColors.join('\n'),
    );
  }

  report(problems, notes);
  return problems.length > 0 ? 1 : 0;
}

function report(problems, notes) {
  for (const note of notes) console.log(`\n[check:design] 참고 — ${note}`);
  for (const problem of problems) console.error(`\n[check:design] 문제 — ${problem}`);

  if (problems.length === 0) {
    console.log('\n[check:design] 통과. 시안 클래스 누락·원시 색상값 없음.');
    console.log(
      '[check:design] 이 검사는 "클래스가 있는가"만 봅니다 — 화면이 시안과 같은 구조인지는\n' +
        '               design/*.html 을 열어 직접 대조해야 합니다 (app/web/AGENTS.md "통합 시 확인").',
    );
  }
}

process.exit(main());
