import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NotificationListPage, NotificationListView } from "../web/NotificationListPage";
import { createNotificationStore } from "../web/notification.store";
import { createNotificationApiMock, createNotificationDemoSnapshot } from "../mock/notification-api.mock";
import { notificationStyles } from "../web/styles";

type Check = (name: string, fn: () => void | Promise<void>) => Promise<void>;
const render = (props: React.ComponentProps<typeof NotificationListView>) =>
  renderToStaticMarkup(React.createElement(NotificationListView, props));
function snapshot(scenario: "client" | "freelancer" | "empty" = "client") {
  return createNotificationStore(createNotificationApiMock({ scenario }), "session:fixture",
    createNotificationDemoSnapshot(scenario)).getSnapshot();
}

export async function runNotificationUiTests(check: Check) {
  await check("규칙 15: HTML 필수 요소 manifest9개와 기본 SSR 일치", () => {
    const design = readFileSync(new URL("../../design/high-fi.html", import.meta.url), "utf8");
    const match = design.match(/<script id="required-elements" type="application\/json">([\s\S]*?)<\/script>/);
    assert.ok(match, "HTML 필수 요소 JSON 목록이 있어야 합니다.");
    const required: string[] = JSON.parse(match[1]); assert.ok(required.length >= 9);
    const html = renderToStaticMarkup(React.createElement(NotificationListPage, {
      api: createNotificationApiMock(), sessionKey: "session:fixture",
    }));
    for (const label of required) assert.ok(html.includes(label), `기본 SSR 누락: ${label}`);
  });
  await check("규칙 15: 실제 알림·종류·발생 시각·안전한 프로젝트 이동 렌더", () => {
    const state = snapshot("freelancer"); const html = render({ snapshot: state });
    for (const item of state.items) {
      assert.ok(html.includes(item.title)); assert.ok(html.includes(`href="${item.linkUrl}"`));
      assert.ok(html.includes(item.createdAt), "time dateTime은 원본 절대시각을 유지합니다.");
    }
    for (const text of ["읽음 처리", "프로젝트 보기", "한국 시간"]) assert.ok(html.includes(text));
  });
  await check("규칙 15: 전체 미읽음 수는 현재 목록 크기로 대체하지 않는다", () => {
    const html = render({ snapshot: { ...snapshot(), unreadCount: 105 } });
    assert.ok(html.includes("105")); assert.ok(html.includes("100건"));
  });
  await check("규칙 16: 초기 로딩·빈 목록·실패·세션 만료 별도 표현", () => {
    const api = createNotificationApiMock();
    const loading = render({ snapshot: createNotificationStore(api, "fixture").getSnapshot() });
    assert.ok(loading.includes("불러오"));
    const empty = render({ snapshot: snapshot("empty") }); assert.ok(empty.includes("아직 도착한 알림이 없어요"));
    const error = render({ snapshot: { ...snapshot("empty"), status: "error", hasLoaded: false,
      errorMessage: "연결을 확인해 주세요." } });
    assert.ok(error.includes("다시 시도"));
    const session = render({ snapshot: createNotificationStore(api, null).getSnapshot() });
    assert.ok(session.includes("다시 로그인")); assert.ok(session.includes("/login"));
    assert.ok(!session.includes("새로운 지원이 도착했습니다"));
  });
  await check("규칙 16: 다른 세션의 initialSnapshot은 SSR에서 노출하지 않는다", () => {
    const data = createNotificationDemoSnapshot(); data.items[0].title = "이전 계정 전용 알림";
    for (const sessionKey of ["new:session", null]) {
      const html = renderToStaticMarkup(React.createElement(NotificationListPage, {
        api: createNotificationApiMock(), sessionKey, initialSnapshot: { sessionKey: "old:session", data },
      }));
      assert.ok(!html.includes("이전 계정 전용 알림"));
    }
  });
  await check("규칙 17: 텍스트 이스케이프·색 이외 읽음 안내·live 영역", () => {
    const state = snapshot();
    state.items[0] = { ...state.items[0], title: "<img src=x onerror=alert(1)>", body: "<script>bad()</script>" };
    const html = render({ snapshot: state });
    assert.ok(html.includes("&lt;img")); assert.ok(!html.includes("<script>bad()"));
    assert.ok(html.includes("aria-live=")); assert.ok(html.includes("안 읽음"));
    assert.ok(html.includes("<button")); assert.ok(html.includes("<time"));
  });
  await check("규칙 16: 실패 뒤 재시도 중에는 사라진 버튼 대신 로딩을 안내한다", () => {
    const html = render({ snapshot: { ...snapshot("empty"), status: "error", hasLoaded: false,
      isRefreshing: true, errorMessage: null } });
    assert.ok(html.includes("알림을 불러오고 있습니다."));
    assert.ok(!html.includes("위의 다시 시도"));
  });
  await check("규칙 17: 반응형·컨테이너·포커스·reduced-motion 스타일 계약", () => {
    for (const token of ["max-width:767px", "@container", "container-type:inline-size",
      "min-height:44px", ":focus-visible", "prefers-reduced-motion:reduce", "nth-child(-n+8)"]) {
      assert.ok(notificationStyles.includes(token), `스타일 계약 누락: ${token}`);
    }
  });
}
