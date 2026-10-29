// lib/checkRules.ts 시험: 규칙을 하나씩 어긴 AI 답을 만들어 서버가 바로잡는지 확인한다 (한 건 분석).
// 실행: npm test (lib를 tests/.build로 컴파일한 뒤 실행한다)
const { test } = require("node:test");
const assert = require("node:assert");
const { checkAnalysis, normalizeUnits, isKorean } = require("./.build/checkRules.js");

const SOURCE =
  "The committee held its rate in a target range of 4.25 to 4.50 percent, the third consecutive meeting without a change. " +
  "Core prices rose 2.8 percent. Several officials indicated that two rate cuts could be appropriate later this year. " +
  "Ten-year Treasury yields fell to 4.12 percent. The currency traded at 1,385 per dollar in September.";

const base = (over = {}) => ({
  summary: [{ text: "기준금리를 4.25~4.50%로 동결했다." }],
  verdict: "중립",
  evidence: ["Core prices rose 2.8 percent.", "Ten-year Treasury yields fell to 4.12 percent."],
  reasoning: "원문은 금리 동결을 전한다.",
  ...over,
});

test("단위: percent → %, percentage points → %p, 범위는 ~", () => {
  assert.strictEqual(normalizeUnits("근원물가 2.8 percent 상승"), "근원물가 2.8% 상승");
  assert.strictEqual(normalizeUnits("0.25 percentage points 인하"), "0.25%p 인하");
  assert.strictEqual(normalizeUnits("기준금리를 4.25 to 4.50 percent로 동결"), "기준금리를 4.25~4.50%로 동결");
  assert.strictEqual(normalizeUnits("tariffs to be applied"), "tariffs to be applied");
});

test("요약: 단위를 고친 뒤 출처를 붙인다", () => {
  const r = checkAnalysis(base({ summary: [{ text: "근원물가는 2.8 percent 올랐다." }] }), SOURCE, "테스트 출처");
  assert.strictEqual(r.summary[0].text, "근원물가는 2.8% 올랐다.");
  assert.strictEqual(r.summary[0].sourceRef, "테스트 출처");
  assert.strictEqual(r.warnings.length, 0);
});

test("요약: 원문에 없는 숫자(93억, 5.1%) 줄은 빼고 경고한다", () => {
  const r = checkAnalysis(
    base({ summary: [{ text: "금리를 4.25~4.50%로 동결했다." }, { text: "흑자는 93억 달러였다." }, { text: "성장률은 5.1%였다." }] }),
    SOURCE,
    "s",
  );
  assert.strictEqual(r.summary.length, 1);
  assert.ok(r.warnings.some((w) => w.includes("2줄을 뺐습니다")));
});

test("요약: 영어 수 단어(third, two, ten-year)와 월(September→9월)은 원문 숫자로 인정", () => {
  const r = checkAnalysis(
    base({
      summary: [
        { text: "3회 연속 동결이다." },
        { text: "연내 2회 인하 가능성이 언급됐다." },
        { text: "10년물 금리는 4.12%로 내렸다." },
        { text: "9월 환율은 달러당 1,385였다." },
      ],
    }),
    SOURCE,
    "s",
  );
  assert.strictEqual(r.summary.length, 4);
  assert.strictEqual(r.warnings.length, 0);
});

test("요약: 날짜만 있는 줄은 수치 줄이 아니라 출처를 붙이지 않는다", () => {
  const r = checkAnalysis(base({ summary: [{ text: "9월 회의에서 결정됐다." }] }), SOURCE, "s");
  assert.strictEqual(r.summary[0].hasNumber, false);
  assert.strictEqual(r.summary[0].sourceRef, undefined);
});

test("요약: 60자 초과 줄은 줄이고, 5줄 초과는 앞 5줄만", () => {
  const long = "가".repeat(70);
  const r = checkAnalysis(
    base({ summary: [long, "첫째 줄이다.", "둘째 줄이다.", "셋째 줄이다.", "넷째 줄이다.", "다섯째 줄이다."].map((text) => ({ text })) }),
    SOURCE,
    "s",
  );
  assert.strictEqual(r.summary.length, 5);
  assert.strictEqual(r.summary[0].text.length, 60);
  assert.ok(r.warnings.some((w) => w.includes("60자")) && r.warnings.some((w) => w.includes("5줄")));
});

test("한국어 판정: 영어 고유명사가 섞인 한국어 줄은 통과, 통째로 영어인 줄은 걸러짐", () => {
  assert.ok(isKorean("Northwind Semiconductor 주가가 9.2% 올랐다."));
  assert.ok(isKorean("현재 Bank Rate는 3.75%다."));
  assert.ok(isKorean("1965년 도입한 변동환율제는 won을 평가절하했다."));
  assert.ok(!isKorean("On Apr. 17, 2024, the Bank of Korea froze its key interest rate."));
  assert.ok(!isKorean("The decision was made due to U.S. tariff policies."));
  assert.ok(!isKorean("4.25~4.50%"));
});

test("요약: 영어로 남은 줄은 빼고 경고한다", () => {
  const r = checkAnalysis(
    base({ summary: [{ text: "기준금리를 4.25~4.50%로 동결했다." }, { text: "Core prices rose 2.8 percent." }] }),
    SOURCE,
    "s",
  );
  assert.strictEqual(r.summary.length, 1);
  assert.ok(r.warnings.some((w) => w.includes("한국어로 옮겨지지 않은 요약 1줄")));
});

test("요약: 남는 줄이 없으면 null (오류로 처리)", () => {
  assert.strictEqual(checkAnalysis(base({ summary: [{ text: "성장률은 7%였다." }] }), SOURCE, "s"), null);
});

test("근거: 공백·따옴표·대소문자 차이는 같은 인용으로 본다", () => {
  const r = checkAnalysis(
    base({ evidence: ["core prices  rose 2.8 percent.", "Ten-year Treasury yields fell to 4.12 percent."] }),
    SOURCE,
    "s",
  );
  assert.strictEqual(r.impact.evidence.length, 2);
  assert.strictEqual(r.impact.verdict, "중립");
});

test("근거: 원문과 다른 인용은 빼고, 2개 미만이면 '판단 보류'로 바꾼다", () => {
  const r = checkAnalysis(
    base({ verdict: "긍정", evidence: ["Core prices rose 2.8 percent.", "While officials warned that rates could rise"] }),
    SOURCE,
    "s",
  );
  assert.strictEqual(r.impact.evidence.length, 1);
  assert.strictEqual(r.impact.verdict, "판단 보류");
  assert.ok(r.warnings.some((w) => w.includes("1개를 뺐습니다")) && r.warnings.some((w) => w.includes("판단 보류")));
});

test("해설: 원문에 없는 한국 영향 문장에 [추정]을 붙이고, 이미 붙은 문장은 그대로", () => {
  const r = checkAnalysis(
    base({ reasoning: "원문은 금리 동결을 전한다. 한국 원화에는 절상 압력이 될 수 있다. [추정] 국내 수출기업은 부담이 커질 수 있다." }),
    SOURCE,
    "s",
  );
  assert.strictEqual(
    r.impact.reasoning,
    "원문은 금리 동결을 전한다. [추정] 한국 원화에는 절상 압력이 될 수 있다. [추정] 국내 수출기업은 부담이 커질 수 있다.",
  );
  assert.ok(r.warnings.some((w) => w.includes("1개에")));
});

test("해설: 원문이 한국을 다루면 한국 언급 문장에 [추정]을 억지로 붙이지 않는다", () => {
  const r = checkAnalysis(base({ reasoning: "한국 수출이 늘었다." }), SOURCE + " Korea's exports rose.", "s");
  assert.strictEqual(r.impact.reasoning, "한국 수출이 늘었다.");
});

test("해설: 투자 권유 문장은 조용히 뺀다 (화면 경고는 만들지 않는다)", () => {
  const r = checkAnalysis(
    base({ reasoning: "업황은 개선되고 있다. 지금 반도체주를 매수하는 것이 좋다. 목표주가 상향이 예상된다." }),
    SOURCE,
    "s",
  );
  assert.strictEqual(r.impact.reasoning, "업황은 개선되고 있다.");
  assert.ok(!r.warnings.some((w) => w.includes("투자 권유")));
});

test("해설: '외국인 순매도' 같은 사실 설명은 투자 권유로 오해해 지우지 않는다", () => {
  const r = checkAnalysis(
    base({ reasoning: "외국인 순매도가 이어졌다. 자료 2는 원화 약세와 외국인 주식 매도를 함께 제시한다." }),
    SOURCE + " Korea's won fell.",
    "s",
  );
  assert.strictEqual(r.impact.reasoning, "외국인 순매도가 이어졌다. 자료 2는 원화 약세와 외국인 주식 매도를 함께 제시한다.");
});

test("해설: 매수·매도를 권하는 말은 뺀다", () => {
  for (const s of ["주식 매도를 권한다.", "매수를 추천한다.", "지금이 매도 적기다.", "달러를 사야 한다."]) {
    const r = checkAnalysis(base({ reasoning: `업황은 개선됐다. ${s}` }), SOURCE, "s");
    assert.strictEqual(r.impact.reasoning, "업황은 개선됐다.", s);
  }
});
