// Design Ref: §2.2 단계 7 — AI 답을 서버가 한 번 더 다듬는다.
// PLAN 작업 11: must ① "수치 문장마다 출처 표시"를 AI에 맡기지 않고 서버가 직접 붙인다.
// 줄 수·글자 수, 원문에 없는 숫자, 근거 인용 검사는 작업 13에서 이 파일에 추가한다.

import type { SummaryLine } from "./types";

/** 날짜(9월, 15일)는 수치로 보지 않는다 */
function withoutDates(text: string): string {
  return text.replace(/\d+\s*(월|일)/g, "");
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
