/* 재정관리시스템 서비스워커: 오프라인에서도 화면이 열리게 한다.
 * - /_next/static/ (해시 붙은 정적 파일): 캐시 우선
 * - 화면(HTML)·화면 데이터(RSC): 네트워크 우선, 실패하면 마지막 캐시
 * - 그 밖의 같은 출처 GET(아이콘·글꼴): 캐시 보여주고 뒤에서 갱신
 * - 다른 출처(Supabase 등)·/api/ 는 건드리지 않는다 (데이터는 앱이 IndexedDB 로 따로 다룬다)
 */
const VERSION = "v1";
const STATIC = `ndfms-static-${VERSION}`;
const PAGES = `ndfms-pages-${VERSION}`;
const KEEP = [STATIC, PAGES];

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// 앱이 보내는 요청: 자주 쓰는 화면을 미리 받아 둔다 (HTML + 그 화면이 쓰는 JS·CSS 파일까지)
self.addEventListener("message", (e) => {
  if (e.data?.type === "warm" && Array.isArray(e.data.urls)) e.waitUntil(warmAll(e.data.urls));
});

// 한 시간에 한 번만 (앱을 열 때마다 모든 화면을 다시 받지 않게)
async function warmAll(urls) {
  const c = await caches.open(PAGES);
  const mark = await c.match("/__warmed-at");
  if (mark && Date.now() - Number(await mark.text()) < 60 * 60 * 1000) return;
  await c.put("/__warmed-at", new Response(String(Date.now())));
  await Promise.all(urls.map(warm));
}

const ASSET_RE = /["'](?:\/_next\/)?(static\/(?:chunks|css|media)\/[^"'\\\s]+\.(?:js|css|woff2))["']/g;
const assetsIn = (text) => [...new Set([...text.matchAll(ASSET_RE)].map((m) => "/_next/" + m[1]))];

async function warm(u) {
  try {
    const res = await fetch(u, { credentials: "same-origin" });
    if (!storable(res)) return;
    const html = await res.clone().text();
    await (await caches.open(PAGES)).put(u, res);
    // 화면이 쓰는 JS·CSS: HTML 에 적힌 것 + 그 JS 가 다시 불러오는 것(동적 import)까지 따라간다
    const st = await caches.open(STATIC);
    const queue = assetsIn(html), seen = new Set(queue);
    while (queue.length) {
      const a = queue.shift();
      let r = await st.match(a);
      if (!r) { r = await fetch(a); if (!storable(r)) continue; await st.put(a, r.clone()); }
      if (a.endsWith(".js")) for (const b of assetsIn(await r.clone().text())) if (!seen.has(b)) { seen.add(b); queue.push(b); }
    }
  } catch {}
}

const storable = (r) => r && r.ok && r.type === "basic" && !r.redirected;

async function cacheFirst(req) {
  const c = await caches.open(STATIC);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (storable(res)) c.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const c = await caches.open(PAGES);
  try {
    const res = await fetch(req);
    if (storable(res)) c.put(req, res.clone());
    return res;
  } catch (e) {
    const hit = await c.match(req);
    if (hit) return hit;
    if (req.mode === "navigate") {
      // 같은 주소의 HTML 이 다른 조건으로 저장돼 있으면 그것을 (화면 데이터(RSC)는 HTML 이 아니므로 제외)
      const all = await c.matchAll(req, { ignoreVary: true, ignoreSearch: true });
      return all.find((r) => (r.headers.get("content-type") || "").includes("text/html")) || offlinePage();
    }
    throw e;
  }
}

async function staleWhileRevalidate(req) {
  const c = await caches.open(STATIC);
  const hit = await c.match(req);
  const net = fetch(req).then((res) => { if (storable(res)) c.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || net;
}

const offlinePage = () => new Response(
  `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>오프라인</title>
<body style="font-family:sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#f6f8fb;color:#334155">
<div style="text-align:center;padding:24px"><h1 style="font-size:18px">지금은 오프라인이에요</h1>
<p style="font-size:14px">이 화면은 아직 기기에 저장되지 않았어요. 연결된 뒤 한 번 열어 두면 다음부터는 오프라인에서도 열려요.</p>
<p><a href="/dashboard" style="color:#22c55e">대시보드로</a> · <a href="javascript:location.reload()" style="color:#22c55e">다시 시도</a></p></div></body></html>`,
  { headers: { "Content-Type": "text/html; charset=utf-8" } });

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/") || url.pathname === "/sw.js") return;
  if (url.pathname.startsWith("/_next/static/")) return e.respondWith(cacheFirst(req));
  if (url.pathname.startsWith("/_next/")) return; // 이미지 최적화·HMR 등은 그대로
  const isPage = req.mode === "navigate" || req.headers.get("RSC") === "1" || url.searchParams.has("_rsc") || req.headers.get("accept")?.includes("text/html");
  if (isPage) return e.respondWith(networkFirst(req));
  e.respondWith(staleWhileRevalidate(req));
});
