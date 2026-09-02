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
// 사진 경로는 HTML 의 src= 뿐 아니라 demo/experts.js 의 문자열에도 있다.
// src= 만 훑으면 전문가 카드의 썸네일이 빈 칸으로 나온다.
const IMG = new RegExp(String.raw`"assets/([\w.-]+)"`, "g");
function inlineImages(text) {
  return text.replace(IMG, function (whole, file) {
    const q = path.join(SRC, "assets", file);
    if (!fs.existsSync(q)) return whole;
    photos += 1;
    return '"data:image/jpeg;base64,' + fs.readFileSync(q).toString("base64") + '"';
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

const PAGES = [
  { name: "main",    file: "main.html",    path: "/" },
  { name: "browse",  file: "browse.html",  path: "/projects" },
  { name: "detail",  file: "detail.html",  path: "/detail" },
  { name: "experts", file: "experts.html", path: "/experts" },
  { name: "expert",  file: "expert.html",  path: "/expert" },
  { name: "mypage",  file: "mypage.html",  path: "/mypage" },
  { name: "register", file: "register.html", path: "/register" },
  { name: "guide",    file: "guide.html",    path: "/guide" },
];

const pages = {};
PAGES.forEach(function (x) { pages[x.name] = parsePage(x.file); });

/*
 * 화면마다 CSS 를 자기 자리 안으로 가둔다.
 *
 * 파일이 따로일 때는 `.filters` 가 겹쳐도 문제가 없었다. 한 파일로 묶으면
 * 나중에 실린 쪽이 이긴다 — 목록 화면의 필터 패널이 전문가 목록의 것으로 바뀐다.
 * 셀렉터 앞에 `.route-<이름>` 을 붙여 서로를 건드리지 못하게 한다.
 */
function scopeCss(css, scope) {
  // 주석을 잠시 빼둔다. 안 그러면 셀렉터 자리에 섞인다
  const comments = [];
  css = css.replace(new RegExp("/\\*[\\s\\S]*?\\*/", "g"), function (m) {
    comments.push(m);
    return "/*__C" + (comments.length - 1) + "__*/";
  });

  const RULE = new RegExp("(^|\\})([^{}]+)\\{", "g");
  function prefix(body) {
    return body.replace(RULE, function (whole, close, sel) {
      const out = sel
        .split(",")
        .map(function (one) {
          const t = one.trim();
          if (!t || t.charAt(0) === "@") return one;
          return " " + scope + " " + t;
        })
        .join(",");
      return close + out + "{";
    });
  }

  let out = "";
  let i = 0;
  while (i < css.length) {
    const at = css.indexOf("@media", i);
    if (at < 0) { out += prefix(css.slice(i)); break; }
    out += prefix(css.slice(i, at));
    const open = css.indexOf("{", at);
    let depth = 0;
    let k = open;
    for (; k < css.length; k++) {
      if (css[k] === "{") depth++;
      else if (css[k] === "}") { depth--; if (depth === 0) break; }
    }
    out += css.slice(at, open + 1) + prefix(css.slice(open + 1, k)) + "}";
    i = k + 1;
  }
  return out.replace(new RegExp("/\\*__C(\\d+)__\\*/", "g"), function (m, n) {
    return comments[n];
  });
}

/* ── 3. 화면 안 링크를 해시 경로로 ─────────────────────── */
function toRoutes(s) {
  return s
    .split('href="experts.html#').join('href="#/experts?')
    .split('href="experts.html"').join('href="#/experts"')
    .split('href="expert.html#').join('href="#/expert?')
    .split('href="mypage.html"').join('href="#/mypage"')
    .split('expert.html#id=').join("#/expert?id=")
    .split('experts.html#category=').join("#/experts?category=")
    .split('"experts.html"').join('"#/experts"')
    .split('"mypage.html"').join('"#/mypage"')
    .split('href="register.html"').join('href="#/register"')
    .split('href="guide.html#safety"').join('href="#/guide?s=safety"')
    .split('href="guide.html"').join('href="#/guide"')
    .split('"register.html"').join('"#/register"')
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
const demo = ["data.js", "engine.js", "experts.js", "bookmarks.js", "session.js", "register.js", "notyet.js"]
  .map((f) => "/* ── demo/" + f + " ── */\n" + inlineImages(fs.readFileSync(path.join(SRC, "demo", f), "utf8")))
  .join("\n");

/* ── 4. 조립 ───────────────────────────────────────────── */
const html = `<title>PactFive 대표페이지</title>
<style>
/* ── _tokens.css ── */
${tokens}
</style>
${PAGES.map(function (x) {
  return "<style>/* ── " + x.file + " (.route-" + x.name + " 안으로 가둠) ── */\n" +
    scopeCss(pages[x.name].style, ".route-" + x.name) + "\n</style>";
}).join("\n")}

<div id="screen"></div>

${PAGES.map(function (x) {
  return '<template id="tpl-' + x.name + '">' + toRoutes(pages[x.name].markup) + "</template>";
}).join("\n")}

<script>
${toRoutes(demo)}
</script>

<script>
/* 각 화면의 구동부. 이름만 등록하고 부르지는 않는다 — 라우터가 부른다 */
${PAGES.map(function (x) { return toRoutes(pages[x.name].scripts); }).join("\n")}
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
  var ROUTES = ${JSON.stringify(
    PAGES.reduce(function (m, x) { m[x.path] = x.name; return m; }, {}),
  )};

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
    var name = ROUTES[r.path] || "main";

    // 화면 안 코드가 location.hash 에서 조건을 읽는다. 경로를 뺀 값만 보이게 맞춘다
    window.__pactfiveQuery = r.query;

    if (current !== name) {
      screen.innerHTML = document.getElementById("tpl-" + name).innerHTML;
      // 화면마다 CSS 를 가둬 두었다. 어느 화면인지 여기서 알려 준다
      screen.className = "route-" + name;
      current = name;
    }
    window.PactFiveInit[name]();
    window.PactFiveBookmarks.bind();
    window.PactFiveNotYet.bind();
    window.PactFiveSession.bind();
    window.PactFiveSession.paintHeader();
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
