// Design Ref: §2.2 단계 7 — AI 답을 서버가 한 번 더 검사하고 바로잡는다.
// PLAN 작업 11: must ① "수치 문장마다 출처 표시"를 AI에 맡기지 않고 서버가 직접 붙인다.
// PLAN 작업 13: must ①·② 규칙을 서버가 검사한다. AI는 지시를 가끔 어기므로 지시문만 믿지 않는다.
//   - 요약: 단위 표기, 한국어가 아닌 줄(TEST-RESULTS L5), 원문에 없는 숫자, 5줄·60자
//   - 근거: 원문에 그대로 있는 인용만 남기고, 2개 미만이면 "판단 보류" (PLAN 확정 사항 3)
//   - 해설: 원문에 없는 한국 영향 문장에 "[추정]", 투자 권유 문장 제거

import type { Impact, SummaryLine } from "./types";
import type { AiAnalysis } from "./prompts";

const MAX_SUMMARY_LINES = 5;
const MAX_LINE_LENGTH = 60;
const MIN_EVIDENCE = 2;
const GUESS_MARK = "[추정]";

export interface CheckedAnalysis {
  summary: SummaryLine[];
  impact: Impact;
  /** 서버가 바로잡은 내용 (사용자에게 그대로 보여 준다) */
  warnings: string[];
}

/** AI 답을 원문과 대조해 규칙에 맞게 고친다. 요약이 하나도 남지 않으면 null */
export function checkAnalysis(ai: AiAnalysis, sourceText: string, sourceLabel: string): CheckedAnalysis | null {
  const warnings: string[] = [];
  const summary = checkSummary(ai.summary, sourceText, sourceLabel, warnings);
  if (summary.length === 0) return null;
  const impact = checkImpact(ai, sourceText, warnings);
  return { summary, impact, warnings };
}

// ───────────── must ① 요약 ─────────────

function checkSummary(lines: { text: string }[], sourceText: string, sourceLabel: string, warnings: string[]): SummaryLine[] {
  const sourceNumbers = numbersInSource(sourceText);
  let invented = 0;
  let trimmed = 0;
  let notKorean = 0;

  const kept: { text: string }[] = [];
  for (const line of lines) {
    let text = normalizeUnits(line.text.trim());
    if (!text) continue;

    // 번역되지 않고 영어 등으로 남은 줄은 뺀다 (요약은 한국어로 쓴다)
    if (!isKorean(text)) {
      notKorean++;
      continue;
    }

    // 60자를 넘으면 숫자가 잘리지 않게 단어 사이에서 줄인다 (Gap 4: "1,385"가 "1,3…"이 되던 문제)
    if (text.length > MAX_LINE_LENGTH) {
      text = shortenAtWord(text, MAX_LINE_LENGTH);
      trimmed++;
    }

    // 줄인 뒤의 글자로 검사한다: 원문에 없는 숫자가 하나라도 있으면 그 줄을 뺀다
    if (numbersIn(text).some((n) => !sourceNumbers.has(n))) {
      invented++;
      continue;
    }
    kept.push({ text });
  }

  if (notKorean) warnings.push(`한국어로 옮겨지지 않은 요약 ${notKorean}줄을 뺐습니다.`);
  if (invented) warnings.push(`원문에서 확인되지 않는 숫자가 들어간 요약 ${invented}줄을 뺐습니다.`);
  if (trimmed) warnings.push(`60자를 넘는 요약 ${trimmed}줄을 줄였습니다.`);
  if (kept.length > MAX_SUMMARY_LINES) {
    warnings.push(`요약이 5줄을 넘어 앞의 5줄만 남겼습니다.`);
    kept.length = MAX_SUMMARY_LINES;
  }
  return attachSources(kept, sourceLabel);
}

/**
 * 끝에 "…"을 붙여 max자 안에 들어가게 줄인다. 가능하면 마지막 띄어쓰기에서 자르고,
 * 띄어쓰기가 없어 중간에서 잘라야 하면 끝에 남은 숫자 조각(예: "1,3")을 지운다.
 */
export function shortenAtWord(text: string, max: number): string {
  const room = text.slice(0, max - 1);
  const lastSpace = room.lastIndexOf(" ");
  const cut = lastSpace >= max / 3 ? room.slice(0, lastSpace) : room.replace(/[\d.,~%\-]+$/, "");
  return cut.trimEnd() + "…";
}

/**
 * 한국어 문장인지. 한글이 3자 이상이고, 영문 글자가 한글의 4배를 넘지 않으면 한국어로 본다.
 * "Northwind Semiconductor 주가가 9.2% 올랐다"처럼 영어 고유명사가 긴 줄은 통과하고,
 * 통째로 영어인 줄("The decision was made ...")만 걸러진다.
 */
export function isKorean(text: string): boolean {
  const hangul = (text.match(/[가-힣]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return hangul >= 3 && latin <= hangul * 4;
}

/** 영어 단위를 한국어 표기로 바꾼다. 숫자 자체는 건드리지 않는다 */
export function normalizeUnits(text: string): string {
  return text
    .replace(/(\d)\s*percentage\s+points?/gi, "$1%p")
    .replace(/(\d)\s*(percent|per\s*cent)/gi, "$1%")
    // 범위 표기: "4.25 to 4.50%" → "4.25~4.50%"
    .replace(/(\d[\d,.]*)\s+to\s+(\d)/gi, "$1~$2");
}

/** 날짜(9월, 15일)는 수치로 보지 않는다 (월 이름 번역은 허용) */
function withoutDates(text: string): string {
  return text.replace(/\d+\s*(월|일)(?![가-힣]*률)/g, "");
}

/** 글 속 숫자를 "4.25", "1385"처럼 모은다 */
export function numbersIn(text: string): string[] {
  return (withoutDates(text).match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, ""));
}

/** 영어로 적힌 수(third, ten-year, two cuts)는 그 숫자가 원문에 있는 것으로 본다 */
const NUMBER_WORDS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", twenty: "20", thirty: "30", fifty: "50", hundred: "100",
  first: "1", second: "2", third: "3", fourth: "4", fifth: "5", sixth: "6", seventh: "7", eighth: "8", ninth: "9", tenth: "10",
  once: "1", twice: "2",
};

export function numbersInSource(sourceText: string): Set<string> {
  const set = new Set(numbersIn(sourceText));
  for (const word of sourceText.toLowerCase().match(/[a-z]+/g) ?? []) {
    if (NUMBER_WORDS[word]) set.add(NUMBER_WORDS[word]);
  }
  // 소수 끝의 0을 뺀 표기도 같은 숫자로 인정한다 (예: 원문 4.50 → 요약 4.5)
  for (const n of [...set]) if (n.includes(".")) set.add(String(Number(n)));
  return set;
}

/** 금리·환율·성장률·금액처럼 숫자가 들어 있는 줄인지 */
export function hasFigure(text: string): boolean {
  return /\d/.test(withoutDates(text));
}

/** 수치가 있는 줄에는 출처를 붙이고, 없는 줄에서는 뺀다 */
export function attachSources(lines: { text: string }[], sourceLabel: string): SummaryLine[] {
  return lines.map(({ text }) => {
    const hasNumber = hasFigure(text);
    return { text, hasNumber, sourceRef: hasNumber ? sourceLabel : undefined };
  });
}

// ───────────── must ② 영향 분석 ─────────────

/** 비교할 때만 쓴다: 공백·따옴표 모양 차이는 같은 글로 본다 */
function comparable(text: string): string {
  return text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * 매수·매도·투자 권유로 읽히는 표현.
 * "외국인 순매도", "주식 매도" 같은 사실 설명은 권유가 아니므로, 매수·매도는 권하는 말이 뒤따를 때만 막는다.
 */
const ADVICE =
  /(매수|매도)(를|을)?\s*(권|추천|고려|검토|하세요|하라|하는\s*것|할\s*것|하길|하면\s*좋|해야|해\s*(두|보)|할\s*만|할\s*때|적기|기회|시점|유리|좋)|사들이|팔아야|사야|투자\s*(를|을)?\s*권|추천|목표\s*주가|비중\s*(확대|축소)|담을\s*만/;
/** 한국 경제·시장에 대한 언급 */
const KOREA = /한국|국내|원화|원\/달러|원·달러|원-달러|코스피|우리\s*(나라|경제|산업|기업)/;

// 종합비교(lib/checkCompare.ts)도 같은 영향 규칙(근거 인용·[추정]·투자 권유 제거)을 쓴다
export function checkImpact(
  ai: Pick<AiAnalysis, "verdict" | "evidence" | "reasoning">,
  sourceText: string,
  warnings: string[],
): Impact {
  const source = comparable(sourceText);

  const evidence = ai.evidence.map((e) => e.trim()).filter((e) => e && source.includes(comparable(e)));
  const removed = ai.evidence.length - evidence.length;
  if (removed) warnings.push(`원문에서 그대로 찾을 수 없는 근거 인용 ${removed}개를 뺐습니다.`);

  let verdict = ai.verdict;
  if (evidence.length < MIN_EVIDENCE && verdict !== "판단 보류") {
    verdict = "판단 보류";
    warnings.push(`원문에서 확인된 근거가 ${MIN_EVIDENCE}개 미만이라 판정을 "판단 보류"로 바꿨습니다.`);
  }

  // 원문 자체가 한국을 다루지 않으면, 한국 영향 문장은 모두 추측이다
  const sourceMentionsKorea = /korea|korean|seoul|won\b/i.test(sourceText) || KOREA.test(sourceText);
  let marked = 0;
  const sentences = splitSentences(ai.reasoning).filter((s) => {
    // 투자 권유로 읽히는 문장은 화면 안내 없이 조용히 뺀다
    return !ADVICE.test(s);
  });
  const reasoning = sentences
    .map((s) => {
      if (!s.startsWith(GUESS_MARK) && !sourceMentionsKorea && KOREA.test(s)) {
        marked++;
        return `${GUESS_MARK} ${s}`;
      }
      return s;
    })
    .join(" ");

  if (marked) warnings.push(`원문에 없는 한국 영향 문장 ${marked}개에 "[추정]"을 붙였습니다.`);

  return { verdict, evidence, reasoning };
}

/**
 * 상세 분석 문단(lib/checkCompare.ts)을 문장 단위로 검사한다.
 *  - 투자 권유로 읽히는 문장은 뺀다
 *  - 자료에 없는 숫자가 들어간 문장은 뺀다
 *  - 자료가 한국을 다루지 않는데 한국 영향을 말하는 문장에는 "[추정]"을 붙인다
 */
export function cleanProse(
  text: string,
  sourceText: string,
  allowedNumbers: Set<string>,
): { text: string; marked: number; invented: number } {
  const sourceMentionsKorea = /korea|korean|seoul|won\b/i.test(sourceText) || KOREA.test(sourceText);
  let marked = 0;
  let invented = 0;
  const kept: string[] = [];
  for (const s of splitSentences(text)) {
    if (ADVICE.test(s)) continue;
    if (numbersIn(s).some((n) => !allowedNumbers.has(n))) {
      invented++;
      continue;
    }
    if (!s.startsWith(GUESS_MARK) && !sourceMentionsKorea && KOREA.test(s)) {
      marked++;
      kept.push(`${GUESS_MARK} ${s}`);
    } else {
      kept.push(s);
    }
  }
  return { text: kept.join(" "), marked, invented };
}

/** 한국어·영어 문장 끝(다. 요. . ! ?)에서 나눈다 */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
