/**
 * 시안 세 장을 한 파일로 묶는다.  실행: node demo/build-bundle.js [나갈 파일]
 *
 * 리포에서는 main / browse / detail 이 각각의 파일이고 서로 링크로 오간다.
 * 아티팩트는 한 페이지뿐이라 그대로 올리면 링크가 전부 깨진다.
 * 그래서 세 화면의 마크업을 `<template>` 에 담고 해시로 갈아 끼운다.
 *
 * **손으로 베끼지 않는다** — 원본이 바뀌면 이 스크립트를 다시 돌리면 된다.
 */
const fs = require("node:fs");
const path = require("node:path");

// 이 스크립트가 있는 demo/ 의 부모가 시안 폴더다
const SRC = path.resolve(__dirname, "..");
const OUT = process.argv[2] || path.join(SRC, "bundle.html");

const read = (f) => fs.readFileSync(path.join(SRC, f), "utf8");

/* ── 1. 사진을 data URI 로 ─────────────────────────────────
   CSP 가 외부 이미지를 막는다. 파일 참조를 인라인으로 바꾼다 */
var photos = 0;
function inlineImages(html) {
  return html.replace(/src="assets\/([\w.-]+)"/g, function (whole, file) {
    const p = path.join(SRC, "assets", file);
    if (!fs.existsSync(p)) return whole;
    photos += 1;
    return 'src="data:image/jpeg;base64,' + fs.readFileSync(p).toString("base64") + '"';
  });
}

/* ── 2. 페이지에서 스타일과 본문을 뽑는다 ───────────────── */
function slice(html, openTag, closeTag) {
  const a = html.indexOf(openTag);
  const b = html.lastIndexOf(closeTag);
  if (a < 0 || b < 0) throw new Error("경계를 못 찾음: " + openTag);
  return html.slice(a + openTag.length, b);
}

function parsePage(file) {
  let html = inlineImages(read(file));
  const style = slice(html, "<style>", "</style>");
  const body = slice(html, "<body>", "</body>");
  // 인라인 <script> 는 아래에서 한 번만 넣는다. 본문에서는 뺀다
  const markup = body.replace(/<script[\s\S]*?<\/script>/g, "").trim();
  const scripts = (body.match(/<script>[\s\S]*?<\/script>/g) || [])
    .map((s) => s.replace(/^<script>|<\/script>$/g, ""))
    .join("\n");
  return { style, markup, scripts };
}

const pages = {
  main: parsePage("main.html"),
  browse: parsePage("browse.html"),
  detail: parsePage("detail.html"),
};

/* ── 3. 화면 안 링크를 해시 경로로 ─────────────────────── */
function toRoutes(s) {
  return s
    .replace(/href="main\.html"/g, 'href="#/"')
    .replace(/href="browse\.html#/g, 'href="#/projects?')
    .replace(/href="browse\.html"/g, 'href="#/projects"')
    .replace(/href="detail\.html#/g, 'href="#/detail?')
    // 스크립트 안의 문자열도 같이 바꾼다
    .replace(/"browse\.html" \+ \(v \? "#keyword=/g, '"#/projects?" + (v ? "keyword=')
    .replace(/href="browse\.html#"/g, 'href="#/projects"')
    .replace(/'browse\.html#'/g, "'#/projects'")
    .replace(/"detail\.html#id=" \+/g, '"#/detail?id=" +')
    .replace(/'detail\.html#id=' \+/g, "'#/detail?id=' +")
    .replace(/detail\.html#id=/g, "#/detail?id=")
    .replace(/browse\.html#category=/g, "#/projects?category=")
    // 자바스크립트 문자열 안에 남은 것들. engine.js 의 카드 링크가 여기 걸린다
    .replace(/detail\.html#id=/g, "#/detail?id=")
    .replace(/"browse\.html#"/g, '"#/projects"')
    .replace(/"browse\.html"/g, '"#/projects"');
}

const tokens = read("_tokens.css");
const demo = ["data.js", "engine.js", "bookmarks.js", "notyet.js"]
  .map((f) => "/* ── demo/" + f + " ── */\n" + fs.readFileSync(path.join(SRC, "demo", f), "utf8"))
  .join("\n");

/* ── 4. 조립 ───────────────────────────────────────────── */
const html = `<title>PactFive 대표페이지</title>
<style>
/* ── _tokens.css ── */
${tokens}
</style>
<style>/* ── main.html ── */
${pages.main.style}
</style>
<style>/* ── browse.html ── */
${pages.browse.style}
</style>
<style>/* ── detail.html ── */
${pages.detail.style}
</style>

<div id="screen"></div>

<template id="tpl-main">${toRoutes(pages.main.markup)}</template>
<template id="tpl-browse">${toRoutes(pages.browse.markup)}</template>
<template id="tpl-detail">${toRoutes(pages.detail.markup)}</template>

<script>
${toRoutes(demo)}
</script>

<script>
/* 각 화면의 구동부. 이름만 등록하고 부르지는 않는다 — 라우터가 부른다 */
${toRoutes(pages.main.scripts)}
${toRoutes(pages.browse.scripts)}
${toRoutes(pages.detail.scripts)}
</script>

<script>
/*
 * 세 화면을 한 파일에서 갈아 끼운다.
 *
 * 리포에서는 파일 세 개가 링크로 이어져 있다. 아티팩트는 한 페이지뿐이라
 * 마크업을 template 에 담아 두고 해시에 따라 하나만 꺼내 붙인다.
 * 붙인 뒤에 그 화면의 구동부를 다시 부른다 — 안 부르면 껍데기만 남는다.
 *
 *   #/                 대표페이지
 *   #/projects?...     목록 (조건은 그대로 물음표 뒤에)
 *   #/detail?id=...    상세
 */
(function () {
  "use strict";
  var screen = document.getElementById("screen");

  function parse() {
    // slice 로 읽는다. 아래 5단계의 일괄 치환이 replace(/^#/) 형태를 노리므로
    // 같은 형태로 쓰면 라우터가 자기 출력을 다시 읽게 된다
    var h = location.hash.slice(1) || "/";
    var at = h.indexOf("?");
    return { path: at < 0 ? h : h.slice(0, at), query: at < 0 ? "" : h.slice(at + 1) };
  }

  var current = null;

  function show() {
    var r = parse();
    var name = r.path.indexOf("/detail") === 0 ? "detail"
      : r.path.indexOf("/projects") === 0 ? "browse"
      : "main";

    // 화면 안 코드가 location.hash 에서 조건을 읽는다. 경로를 뺀 값만 보이게 맞춘다
    window.__pactfiveQuery = r.query;

    if (current !== name) {
      screen.innerHTML = document.getElementById("tpl-" + name).innerHTML;
      current = name;
    }
    window.PactFiveInit[name]();
    window.PactFiveBookmarks.bind();
    window.PactFiveNotYet.bind();
  }

  window.addEventListener("hashchange", show);
  if (!location.hash) location.replace("#/");
  show();
})();
</script>
`;

/* ── 5. 화면 안 코드가 조건을 읽는 곳을 라우터 값으로 ──── */
const routed = html
  .replace(/location\.hash\.replace\(\/\^#\/, ""\)/g, '(window.__pactfiveQuery || "")')
  // 목록이 조건을 쓸 때도 경로를 지켜야 한다
  .replace(
    /var url = location\.pathname \+ \(u\.toString\(\) \? "#" \+ u : "#"\);/,
    'var url = "#/projects" + (u.toString() ? "?" + u : "");',
  )
  .replace(/history\.pushState\(null, "", location\.pathname \+ "#"\);/, 'location.hash = "#/projects";')
  // 라우터가 화면을 다시 그리므로 페이지 자체의 hashchange 는 뺀다 (두 번 그린다)
  .replace(/\s*window\.addEventListener\("hashchange", render\);/g, "")
  .replace(/\s*window\.addEventListener\("hashchange", show\);(?!\n  if)/g, "");

fs.writeFileSync(OUT, routed);

const bytes = Buffer.byteLength(fs.readFileSync(OUT));
console.log(OUT);
console.log((bytes / 1024 / 1024).toFixed(2) + " MB · 사진 " + photos + "장 인라인");
console.log("남은 .html 링크:", /href="[^#][^"]*\.html/.test(routed) ? "❌ 있음" : "✅ 없음");
console.log("남은 assets/ 참조:", /"assets\//.test(routed) ? "❌ 있음" : "✅ 없음");
