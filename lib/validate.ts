// Design Ref: §2.2 단계 4 — 서버 2차 검사. 브라우저 검사는 우회될 수 있으므로 서버에서 다시 확인한다.
// PLAN 작업 7: 원문 길이(200자 이상, 20,000자 이하)를 검사한다.

import {
  ERROR_MESSAGES,
  MAX_TEXT_LENGTH,
  MIN_TEXT_LENGTH,
  type AnalyzeError,
  type AnalyzeRequest,
  type ErrorCode,
} from "./types";

/** 문제가 없으면 null, 있으면 사용자에게 보여 줄 오류를 돌려준다 */
export function validateRequest(body: Partial<AnalyzeRequest>): AnalyzeError | null {
  if (body.mode === "url") {
    // 링크 형식 검사만 한다. 본문을 가져와 길이를 재는 것은 작업 9에서 붙인다
    return isWebUrl(body.url) ? null : errorOf("INVALID_URL");
  }

  // 입력 방식이 없거나 알 수 없으면 원문 방식으로 보고 검사한다 (원문이 없으면 "너무 짧음")
  return checkTextLength(body.text);
}

/** 원문 길이 검사. 앞뒤 공백은 빼고 센다 (공백만 채워 넣어 통과하지 못하게) */
export function checkTextLength(text: unknown): AnalyzeError | null {
  const length = typeof text === "string" ? text.trim().length : 0;
  if (length < MIN_TEXT_LENGTH) return errorOf("TOO_SHORT");
  if (length > MAX_TEXT_LENGTH) return errorOf("TOO_LONG");
  return null;
}

function isWebUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const { protocol } = new URL(value.trim());
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function errorOf(code: ErrorCode): AnalyzeError {
  return { error: { code, message: ERROR_MESSAGES[code] } };
}
