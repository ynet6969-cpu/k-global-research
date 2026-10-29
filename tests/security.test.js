// 보안·안정성 시험: 내부망 주소 차단(SSRF), 요청 횟수 제한, 숫자가 잘리지 않는 줄이기.
// 실행: npm test
const { test } = require("node:test");
const assert = require("node:assert");
const { isBlockedAddress, fetchArticle } = require("./.build/fetchArticle.js");
const { shortenAtWord, checkAnalysis } = require("./.build/checkRules.js");
const { createRateLimiter } = require("./.build/rateLimit.js");

// ── 내부망 주소 판정 ──
test("IPv4 내부망·특수 주소는 막는다", () => {
  for (const a of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1"]) {
    assert.ok(isBlockedAddress(a), a);
  }
});

test("IPv4를 품은 IPv6(점 표기·16진 표기)와 NAT64도 막는다", () => {
  for (const a of ["::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe", "64:ff9b::7f00:1", "::1", "::", "fe80::1", "fd00::1"]) {
    assert.ok(isBlockedAddress(a), a);
  }
});

test("공개 주소는 통과한다", () => {
  for (const a of ["8.8.8.8", "151.101.1.69", "2606:4700:4700::1111", "::ffff:808:808"]) {
    assert.ok(!isBlockedAddress(a), a);
  }
});

test("주소창에 내부망 주소를 어떤 표기로 적어도 접속 전에 막는다 (INVALID_URL)", async () => {
  for (const u of [
    "http://[::ffff:127.0.0.1]:9/",
    "http://[::ffff:7f00:1]:9/",
    "http://[::ffff:169.254.169.254]/",
    "http://[64:ff9b::7f00:1]/",
    "http://localhost:9/",
    "http://127.1:9/",
  ]) {
    const r = await fetchArticle(u);
    assert.strictEqual(r.code, "INVALID_URL", u + " → " + JSON.stringify(r));
  }
});

test("이름이 내부망 IP로 풀리면 접속하는 순간 막는다 (localtest.me → 127.0.0.1)", async (t) => {
  const r = await fetchArticle("http://localtest.me:9/");
  // 인터넷이 끊겨 이름을 풀지 못한 경우는 이 시험을 할 수 없으니 건너뛴다
  if (r.code === "FETCH_FAILED") return t.skip("DNS를 쓸 수 없는 환경");
  assert.strictEqual(r.code, "INVALID_URL", JSON.stringify(r));
});

// ── 요청 횟수 제한 ──
test("한 사람은 10분에 10번까지, 11번째는 기다릴 시간을 돌려준다", () => {
  const lim = createRateLimiter(10, 100, 600000);
  for (let i = 0; i < 10; i++) assert.strictEqual(lim.take("a", 1000 + i), 0);
  const wait = lim.take("a", 2000);
  assert.ok(wait > 0 && wait <= 600, "wait " + wait);
  assert.strictEqual(lim.take("b", 2000), 0, "다른 사람은 영향 없음");
  assert.strictEqual(lim.take("a", 1000 + 600000 + 1), 0, "10분 지나면 다시 가능");
});

test("서버 전체 한도를 넘으면 누구든 기다린다", () => {
  const lim = createRateLimiter(10, 3, 600000);
  assert.strictEqual(lim.take("a", 0), 0);
  assert.strictEqual(lim.take("b", 0), 0);
  assert.strictEqual(lim.take("c", 0), 0);
  assert.ok(lim.take("d", 0) > 0);
});

test("종합비교의 좁은 한도(한 사람 5회)가 지켜진다", () => {
  const lim = createRateLimiter(5, 40, 600000);
  for (let i = 0; i < 5; i++) assert.strictEqual(lim.take("a", i), 0);
  assert.ok(lim.take("a", 10) > 0);
});

// ── 숫자가 잘리지 않는 줄이기 ──
test("단어 사이에서 줄여 숫자를 보존한다", () => {
  const line = "발표 이후 현지 통화는 달러당 거래 수준이 크게 움직였고 수출업체 전망은 불확실하다며 환율은 달러당 1,385였다";
  const s = shortenAtWord(line, 60);
  assert.ok(s.length <= 60, s.length + "자");
  assert.ok(!/1,3…|1,…/.test(s), s);
});

test("띄어쓰기 없이 잘릴 때 끝의 숫자 조각을 지운다", () => {
  const s = shortenAtWord("가".repeat(55) + "1,385였다", 60);
  assert.ok(s.endsWith("가…"), s);
});

test("검사 결과 화면에 잘린 숫자가 나오지 않는다", () => {
  const src =
    "The currency traded at 1,385 per dollar after the release, and the central bank said the outlook remained uncertain for exporters.";
  const line = "발표 이후 현지 통화는 달러당 거래 수준이 크게 움직였고 수출업체 전망은 불확실하다며 환율은 달러당 1,385였다";
  const r = checkAnalysis({ summary: [{ text: line }, { text: "환율은 달러당 1,385였다." }], verdict: "중립", evidence: [], reasoning: "" }, src, "s");
  for (const l of r.summary) assert.ok(!/1,3(?!85)/.test(l.text), l.text);
  assert.ok(r.summary.some((l) => l.text.includes("1,385")));
});
