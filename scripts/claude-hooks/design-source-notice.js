#!/usr/bin/env node
'use strict';

// scripts/claude-hooks/design-source-notice.js
//
// Claude Code PostToolUse 훅 — app/web 의 화면 파일을 쓰거나 고칠 때, 그 기능의 시안 경로를
// 알려 준다. `.claude/settings.json` 에서 Write|Edit 에 걸려 있다.
//
// ## 왜 있는가
//
// 2026-08-28 통합에서 SCR-B02(프로젝트 상세)를 `prototype/web/*.tsx` 기준으로 만들어,
// `design/high-fi-browse.html` 에 정의된 2단 레이아웃·사이드바·`.kv` 행이 통째로 빠졌다.
// AGENTS.md 에 정본 순서를 적어 두었지만(app/web/AGENTS.md "무엇이 무엇의 정본인가"),
// **문서는 열어봐야 읽힌다.** 이 훅은 화면 파일을 건드리는 그 순간에 경로를 들이민다.
//
// 커밋·푸시 시점의 검사(git 훅·CI)와 목적이 다르다 — 그때는 이미 잘못 짠 뒤다.
//
// ## 동작
//
// stdin 으로 훅 입력 JSON 을 받아 file_path 를 본다. app/web/src/features/{기능}/ 아래의
// .tsx 면 그 기능의 design/*.html 목록을, shared/ui/ 아래면 _tokens.css 를 알린다.
// 해당 없으면 아무것도 출력하지 않는다 — 관계없는 편집에 소음을 내지 않는다.

const { readdirSync, existsSync } = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');

function readStdin() {
  try {
    return require('node:fs').readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function filePathFrom(raw) {
  try {
    const input = JSON.parse(raw);
    return input?.tool_response?.filePath ?? input?.tool_input?.file_path ?? null;
  } catch {
    return null;
  }
}

function designFilesFor(feature) {
  const dir = path.join(REPO_ROOT, 'features', feature, 'design');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.html'))
    .map((name) => `features/${feature}/design/${name}`);
}

function emit(context) {
  process.stdout.write(
    JSON.stringify({
      suppressOutput: true,
      hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: context },
    }),
  );
}

function main() {
  const filePath = filePathFrom(readStdin());
  if (!filePath) return;

  // 경로 구분자를 통일한다 — Windows 에서 역슬래시로 온다.
  const relative = path.relative(REPO_ROOT, filePath).split(path.sep).join('/');
  if (!relative.startsWith('app/web/src/') || !relative.endsWith('.tsx')) return;

  const featureMatch = relative.match(/^app\/web\/src\/features\/([^/]+)\//);
  if (featureMatch) {
    const feature = featureMatch[1];
    const designs = designFilesFor(feature);
    if (designs.length === 0) return; // 시안이 없는 기능이면 할 말이 없다
    emit(
      `[design 정본 알림] ${relative} 는 ${feature} 화면 코드다.\n` +
        `화면 구조(레이아웃·영역 구성)의 정본은 아래 시안이며 prototype/web/*.tsx 가 아니다 ` +
        `(app/web/AGENTS.md "무엇이 무엇의 정본인가"):\n` +
        designs.map((file) => `  - ${file}`).join('\n') +
        `\n시안의 "필수 요소 목록" 섹션만 보지 말고 화면 마크업·CSS 를 함께 확인할 것. ` +
        `클래스 누락은 \`npm run check:design\` 으로 확인한다.`,
    );
    return;
  }

  if (relative.startsWith('app/web/src/shared/ui/')) {
    emit(
      `[design 정본 알림] ${relative} 는 공용 UI 조각이다.\n` +
        `값의 정본은 design-system/design-tokens.md 이고, 시안이 쓰는 클래스는 ` +
        `features/*/design/_tokens.css 에 있다. 원시 색상값을 넣지 말 것.\n` +
        `누락 여부는 \`npm run check:design\` 으로 확인한다.`,
    );
  }
}

main();
