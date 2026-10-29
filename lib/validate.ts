// Design Ref: §2.2 단계 4 — 서버 2차 검사. 브라우저 검사는 우회될 수 있으므로 서버에서 다시 확인한다.
// PLAN 작업 7: 원문 길이(200자 이상, 20,000자 이하)를 검사한다.
// CHECK #1: 출처·관심 분야도 검사한다. 이 값들은 AI 지시문에 그대로 들어가므로
//   아주 긴 값(AI 요금 증가)이나 문자열이 아닌 값(서버 500 오류)을 막는다.

import {
  ERROR_MESSAGES,
  FIELDS,
  MAX_COMPARE_ITEMS,
  MAX_COMPARE_TEXT_LENGTH,
  MAX_CUSTOM_FIELD_LENGTH,
  MAX_SOURCE_LABEL_LENGTH,
  MAX_TEXT_LENGTH,
  MIN_COMPARE_ITEMS,
  MIN_TEXT_LENGTH,
  type AnalyzeError,
  type AnalyzeRequest,
  type CompareMaterial,
  type CompareRequest,
  type ErrorCode,
} from "./types";

/** 문제가 없으면 null, 있으면 사용자에게 보여 줄 오류를 돌려준다 */
export function validateRequest(body: Partial<AnalyzeRequest>): AnalyzeError | null {
  const extra = checkExtraFields(body);
  if (extra) return extra;

  if (body.mode === "url") {
    // 링크 형식 검사만 한다. 본문을 가져와 길이를 재는 것은 fetchArticle에서 한다
    return isWebUrl(body.url) ? null : errorOf("INVALID_URL");
  }

  // 입력 방식이 없거나 알 수 없으면 원문 방식으로 보고 검사한다 (원문이 없으면 "너무 짧음")
  return checkTextLength(body.text);
}

/** 관심 분야는 정해진 선택지만, 직접 입력 분야와 출처는 정해진 길이 이하의 글자만 받는다 */
function checkExtraFields(body: { field?: unknown; customField?: unknown; sourceLabel?: unknown }): AnalyzeError | null {
  if (!(FIELDS as readonly unknown[]).includes(body.field)) return errorOf("INVALID_INPUT");
  if (!isOptionalText(body.customField, MAX_CUSTOM_FIELD_LENGTH)) return errorOf("INVALID_INPUT");
  if (!isOptionalText(body.sourceLabel, MAX_SOURCE_LABEL_LENGTH)) return errorOf("INVALID_INPUT");
  return null;
}

/** 값이 없거나, 앞뒤 공백을 뺀 길이가 max 이하인 글자인지 */
function isOptionalText(value: unknown, max: number): boolean {
  if (value === undefined || value === null) return true;
  return typeof value === "string" && value.trim().length <= max;
}

/** 원문 길이 검사. 앞뒤 공백은 빼고 센다 (공백만 채워 넣어 통과하지 못하게) */
export function checkTextLength(text: unknown): AnalyzeError | null {
  const length = typeof text === "string" ? text.trim().length : 0;
  if (length < MIN_TEXT_LENGTH) return errorOf("TOO_SHORT");
  if (length > MAX_TEXT_LENGTH) return errorOf("TOO_LONG");
  return null;
}

/** 링크 길이 상한. 보통 주소는 수백 자 이내다 (아주 긴 주소가 출처 이름으로 쓰이는 것을 막음) */
const MAX_URL_LENGTH = 2000;

function isWebUrl(value: unknown): boolean {
  if (typeof value !== "string" || value.length > MAX_URL_LENGTH) return false;
  try {
    const { protocol } = new URL(value.trim());
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

// ───────────── 종합비교 입력 검사 (POST /api/compare) ─────────────

/** 비교할 자료 2~3개를 검사한다. 문제가 없으면 null. 한 건 분석과 같은 기준(분야 선택지·글자 수·문자열)을 쓴다 */
export function validateCompareRequest(body: Partial<CompareRequest>): AnalyzeError | null {
  const materials: unknown = body.materials;
  if (!Array.isArray(materials)) return errorOf("TOO_FEW_MATERIALS");
  if (materials.length < MIN_COMPARE_ITEMS) return errorOf("TOO_FEW_MATERIALS");
  if (materials.length > MAX_COMPARE_ITEMS) return errorOf("INVALID_INPUT");

  for (const item of materials as Partial<CompareMaterial>[]) {
    if (!item || typeof item !== "object") return errorOf("INVALID_INPUT");
    const extra = checkExtraFields(item);
    if (extra) return extra;

    const length = typeof item.text === "string" ? item.text.trim().length : 0;
    if (length < MIN_TEXT_LENGTH) return errorOf("TOO_SHORT");
    if (length > MAX_COMPARE_TEXT_LENGTH) return errorOf("TOO_LONG");
  }
  return null;
}

function errorOf(code: ErrorCode): AnalyzeError {
  return { error: { code, message: ERROR_MESSAGES[code] } };
}
