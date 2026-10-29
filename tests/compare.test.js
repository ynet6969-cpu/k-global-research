// 종합비교 시험: 입력 검사(lib/validate.ts), AI 답 서버 검사(lib/checkCompare.ts), 보고서 변환(lib/report.ts).
// 실행: npm test
const { test } = require("node:test");
const assert = require("node:assert");
const { validateCompareRequest } = require("./.build/validate.js");
const { checkComparison } = require("./.build/checkCompare.js");
const { comparisonToReport } = require("./.build/report.js");

const RATE =
  "The Federal Reserve held its benchmark interest rate at 4.25 to 4.50 percent on Wednesday, the third straight meeting without a change. " +
  "Officials said inflation remains somewhat elevated at 2.9 percent and signaled two rate cuts could come later this year if price pressures ease.";
const FX =
  "The Korean won weakened to 1,385 per dollar on Thursday, its lowest level in five months, as foreign investors sold Korean equities for a third day. " +
  "The Bank of Korea has held its policy rate at 3.00 percent and said it is monitoring currency volatility closely.";
const GDP =
  "The U.S. economy grew at an annualized rate of 2.8 percent in the second quarter, faster than the 1.4 percent pace in the first quarter. " +
  "Consumer spending rose 2.3 percent while exports of goods increased 4.1 percent, the Commerce Department said.";
const TEXTS = [RATE, FX, GDP];

const material = (text, over = {}) => ({ field: "금리", text, ...over });

// ───────────── 입력 검사 ─────────────
test("입력: 자료 2~3개, 각 200자 이상 10,000자 이하면 통과", () => {
  assert.strictEqual(validateCompareRequest({ materials: [material(RATE), material(FX)] }), null);
  assert.strictEqual(validateCompareRequest({ materials: [material(RATE), material(FX), material(GDP)] }), null);
});

test("입력: 자료가 2개 미만이거나 배열이 아니면 TOO_FEW_MATERIALS", () => {
  for (const body of [{ materials: [material(RATE)] }, { materials: [] }, {}, { materials: "x" }]) {
    assert.strictEqual(validateCompareRequest(body).error.code, "TOO_FEW_MATERIALS");
  }
});

test("입력: 자료가 4개 이상이면 INVALID_INPUT", () => {
  const four = [material(RATE), material(FX), material(GDP), material(RATE)];
  assert.strictEqual(validateCompareRequest({ materials: four }).error.code, "INVALID_INPUT");
});

test("입력: 짧은 자료는 TOO_SHORT, 한 건 분석(2만 자)보다 좁은 1만 자 초과는 TOO_LONG", () => {
  assert.strictEqual(validateCompareRequest({ materials: [material(RATE), material("짧다")] }).error.code, "TOO_SHORT");
  assert.strictEqual(validateCompareRequest({ materials: [material(RATE), material(RATE.repeat(80))] }).error.code, "TOO_LONG");
});

test("입력: 선택지 밖 분야, 문자열이 아닌 출처, 긴 출처는 INVALID_INPUT", () => {
  const bad = [
    material(RATE, { field: "해킹" }),
    material(RATE, { sourceLabel: 123 }),
    material(RATE, { sourceLabel: "가".repeat(201) }),
    material(RATE, { field: "직접 입력", customField: "가".repeat(31) }),
  ];
  for (const m of bad) {
    assert.strictEqual(validateCompareRequest({ materials: [m, material(FX)] }).error.code, "INVALID_INPUT");
  }
  assert.strictEqual(validateCompareRequest({ materials: [null, material(FX)] }).error.code, "INVALID_INPUT");
});

// ───────────── AI 답 서버 검사 ─────────────
const ai = (over = {}) => ({
  indicators: [
    { material: 1, name: "기준금리", value: "4.25~4.50%", change: "동결" },
    { material: 2, name: "환율", value: "달러당 1,385원", change: "약세" },
    { material: 3, name: "경제성장률", value: "2.8%", change: "" },
  ],
  comparison: [{ text: "미국은 금리를 동결했고 원화는 약세였다.", materials: [1, 2] }],
  sections: [{ title: "미국 금리", body: "자료 1은 기준금리를 4.25~4.50%로 동결했다고 적었다." }],
  verdict: "중립",
  evidence: ["held its benchmark interest rate at 4.25 to 4.50 percent", "weakened to 1,385 per dollar"],
  reasoning: "자료들은 방향이 엇갈린다.",
  ...over,
});

test("지표: 정상 답은 그대로 통과하고 경고가 없다", () => {
  const r = checkComparison(ai(), TEXTS);
  assert.strictEqual(r.indicators.length, 3);
  assert.strictEqual(r.warnings.length, 0);
  assert.strictEqual(r.impact.verdict, "중립");
});

test("지표: 다른 자료에만 있는 숫자를 가져다 쓴 지표는 뺀다 (자료 1에 1,385가 없음)", () => {
  const r = checkComparison(
    ai({ indicators: [...ai().indicators, { material: 1, name: "환율", value: "달러당 1,385원", change: "" }] }),
    TEXTS,
  );
  assert.strictEqual(r.indicators.filter((i) => i.material === 1).length, 1);
  assert.ok(r.warnings.some((w) => w.includes("지표 1개를 뺐습니다")));
});

test("지표: 없는 자료 번호, 빈 이름·수치는 뺀다", () => {
  const r = checkComparison(
    ai({
      indicators: [
        ...ai().indicators,
        { material: 9, name: "유령", value: "1%", change: "" },
        { material: 1, name: "", value: "2.9%", change: "" },
        { material: 1, name: "물가", value: "", change: "" },
      ],
    }),
    TEXTS,
  );
  assert.strictEqual(r.indicators.length, 3);
  assert.ok(r.warnings.some((w) => w.includes("올바르지 않은 지표 3개")));
});

test("지표: 자료 하나당 3개까지, 자료 번호 순으로 정렬한다", () => {
  const many = [
    { material: 2, name: "a", value: "3.00%", change: "" },
    { material: 1, name: "b", value: "2.9%", change: "" },
    { material: 1, name: "c", value: "4.25~4.50%", change: "" },
    { material: 1, name: "d", value: "2.9%", change: "" },
    { material: 1, name: "e", value: "2.9%", change: "" },
  ];
  const r = checkComparison(ai({ indicators: many }), TEXTS);
  assert.deepStrictEqual(r.indicators.map((i) => i.material), [1, 1, 1, 2]);
});

test("지표: 단위를 고친다 (percent → %)", () => {
  const r = checkComparison(
    ai({ indicators: [...ai().indicators, { material: 3, name: "소비", value: "2.3 percent", change: "" }] }),
    TEXTS,
  );
  assert.ok(r.indicators.some((i) => i.value === "2.3%"));
});

test("지표가 2개 미만이면 null (결과를 보여 주지 않는다)", () => {
  assert.strictEqual(checkComparison(ai({ indicators: [ai().indicators[0]] }), TEXTS), null);
});

test("비교 문장: 영어 줄·자료에 없는 숫자 줄은 빼고, 비면 null", () => {
  const r = checkComparison(
    ai({
      comparison: [
        { text: "미국은 금리를 동결했다.", materials: [1] },
        { text: "The Fed held rates.", materials: [1] },
        { text: "성장률은 7.7%였다.", materials: [3] },
      ],
    }),
    TEXTS,
  );
  assert.strictEqual(r.comparison.length, 1);
  assert.ok(r.warnings.some((w) => w.includes("한국어로 옮겨지지 않은 비교 문장 1줄")));
  assert.ok(r.warnings.some((w) => w.includes("숫자가 들어간 비교 문장 1줄")));
  assert.strictEqual(checkComparison(ai({ comparison: [{ text: "성장률은 7.7%였다.", materials: [3] }] }), TEXTS), null);
});

test("비교 문장: 숫자는 모든 자료에서 찾고, 자료 번호는 실제 번호만 중복 없이 남긴다", () => {
  const r = checkComparison(
    ai({ comparison: [{ text: "금리 4.25~4.50%와 환율 1,385는 함께 나타났다.", materials: [2, 1, 1, 9, 0] }] }),
    TEXTS,
  );
  assert.strictEqual(r.comparison.length, 1);
  assert.deepStrictEqual(r.comparison[0].materials, [1, 2]);
  assert.strictEqual(r.comparison[0].hasNumber, true);
});

test("비교 문장: 90자 초과는 줄이고, 8줄 초과는 앞 8줄만", () => {
  const lines = Array.from({ length: 10 }, (_, i) => ({ text: `${i + 1}번째로 기준금리가 동결됐다.`.replace(/\d+번째로/, "다음으로"), materials: [1] }));
  lines[0] = { text: "가".repeat(100), materials: [1] };
  const r = checkComparison(ai({ comparison: lines }), TEXTS);
  assert.strictEqual(r.comparison.length, 8);
  assert.strictEqual(r.comparison[0].text.length, 90);
  assert.ok(r.warnings.some((w) => w.includes("90자")) && r.warnings.some((w) => w.includes("8줄")));
});

test("상세 분석: 자료에 없는 숫자 문장은 빼고, 한국 영향 추측에는 [추정]을 붙인다", () => {
  const r = checkComparison(
    ai({
      sections: [
        {
          title: "파급 경로",
          body: "자료 1은 금리를 4.25~4.50%로 동결했다. 성장률은 9.9%였다. 한국 수출기업의 부담이 커질 수 있다.",
        },
      ],
    }),
    [RATE, GDP, GDP],
  );
  assert.strictEqual(r.sections.length, 1);
  assert.ok(!r.sections[0].body.includes("9.9"));
  assert.ok(r.sections[0].body.includes("[추정] 한국 수출기업"));
  assert.ok(r.warnings.some((w) => w.includes("상세 분석 문장 1개")));
});

test("상세 분석: 투자 권유 문장은 조용히 뺀다, 영어뿐인 토막은 통째로 뺀다", () => {
  const r = checkComparison(
    ai({
      sections: [
        { title: "시장", body: "금리는 동결됐다. 지금 주식을 매수하세요." },
        { title: "영어", body: "The Fed held rates steady." },
      ],
    }),
    TEXTS,
  );
  assert.strictEqual(r.sections.length, 1);
  assert.strictEqual(r.sections[0].body, "금리는 동결됐다.");
  assert.ok(!r.warnings.some((w) => w.includes("투자 권유")));
});

test("상세 분석: 6토막까지만 남긴다", () => {
  const sections = Array.from({ length: 9 }, (_, i) => ({ title: `토막${i}`, body: "금리는 동결됐다." }));
  assert.strictEqual(checkComparison(ai({ sections }), TEXTS).sections.length, 6);
});

test("영향: 근거 인용은 어느 자료에든 그대로 있어야 하고, 2개 미만이면 판단 보류", () => {
  const r = checkComparison(ai({ verdict: "긍정", evidence: ["weakened to 1,385 per dollar", "지어낸 인용문"] }), TEXTS);
  assert.strictEqual(r.impact.evidence.length, 1);
  assert.strictEqual(r.impact.verdict, "판단 보류");
});

// ───────────── 보고서 변환 ─────────────
test("보고서: 표 구조(자료·지표·종합 비교·상세 분석)로 바뀌고 수치 줄에는 출처 이름이 붙는다", () => {
  const checked = checkComparison(
    ai({ comparison: [{ text: "미국 금리는 4.25~4.50%로 동결됐다.", materials: [1] }, { text: "자료만으로 관계는 알 수 없다.", materials: [1, 2] }] }),
    TEXTS,
  );
  const sources = [
    { index: 1, field: "금리", source: "Reuters" },
    { index: 2, field: "환율", source: "자료 2" },
    { index: 3, field: "경제성장률", source: "상무부" },
  ];
  const doc = comparisonToReport({ sources, ...checked });
  const heads = doc.blocks.map((b) => b.heading);
  assert.deepStrictEqual(heads, ["비교한 자료", "핵심 지표 비교", "종합 비교", "상세 분석", "한국·우리 산업 영향"]);
  const compare = doc.blocks.find((b) => b.heading === "종합 비교").table;
  assert.strictEqual(compare.rows[0][2], "Reuters");
  assert.strictEqual(compare.rows[1][2], "자료 1, 자료 2");
  assert.ok(doc.fileBase.startsWith("금융리서치_종합비교_"));
});
