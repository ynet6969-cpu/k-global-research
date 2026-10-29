// 종합비교 API: POST /api/compare. 금리·환율·경제성장률 같은 자료 2~3개를 한 번에 견주어 분석한다.
// 입력 검사(lib/validate.ts) → 횟수 제한 → AI 호출(lib/ai.ts) → 서버 규칙 검사(lib/checkCompare.ts) 순서로,
// 한 건 분석(/api/analyze)과 같은 방식이다. 링크 가져오기는 하지 않고 붙여넣은 원문·파일에서 뽑은 글자만 받는다.

import {
  ERROR_MESSAGES,
  type AnalyzeError,
  type CompareRequest,
  type CompareResult,
  type CompareSource,
  type ErrorCode,
} from "@/lib/types";
import { validateCompareRequest } from "@/lib/validate";
import { callAiJson } from "@/lib/ai";
import { COMPARISON_SCHEMA, buildComparisonMessages, type AiComparison } from "@/lib/prompts";
import { checkComparison } from "@/lib/checkCompare";
import { clientKeyOf, createRateLimiter } from "@/lib/rateLimit";

/** 자료가 여러 개라 AI 요금이 한 건 분석보다 크므로 횟수를 더 좁게 센다 (한 사람 5회, 서버 전체 40회) */
const limiter = createRateLimiter(5, 40);

export const maxDuration = 90;

export async function POST(request: Request) {
  const parsed: unknown = await request.json().catch(() => ({}));
  const body = (parsed && typeof parsed === "object" ? parsed : {}) as Partial<CompareRequest>;

  const invalid = validateCompareRequest(body);
  if (invalid) {
    return Response.json(invalid, { status: 400 });
  }

  const waitSeconds = limiter.take(clientKeyOf(request));
  if (waitSeconds > 0) {
    const minutes = Math.ceil(waitSeconds / 60);
    const error: AnalyzeError = {
      error: { code: "RATE_LIMITED", message: `짧은 시간에 분석을 너무 많이 요청했습니다. 약 ${minutes}분 후 다시 시도해 주세요.` },
    };
    return Response.json(error, { status: 429, headers: { "Retry-After": String(waitSeconds) } });
  }

  // 검사를 통과한 입력이므로 모양은 믿어도 된다. 자료마다 앞뒤 공백을 뺀 글자와 출처 이름을 정리한다
  const materials = (body.materials ?? []).map((m, i) => ({
    field: m.field === "직접 입력" ? m.customField?.trim() || "일반 경제" : m.field,
    text: m.text.trim(),
    sourceLabel: m.sourceLabel?.trim() || `자료 ${i + 1}`,
  }));

  const ai = await callAiJson<AiComparison>(buildComparisonMessages(materials), COMPARISON_SCHEMA);
  if (!ai) {
    return errorResponse("AI_FAILED", 502);
  }

  const checked = checkComparison(
    ai,
    materials.map((m) => m.text),
  );
  if (!checked) {
    // 지표가 2개 미만이거나 비교 문장이 한 줄도 남지 않으면 결과를 보여 주지 않는다
    return errorResponse("AI_FAILED", 502);
  }

  const sources: CompareSource[] = materials.map((m, i) => ({ index: i + 1, field: m.field, source: m.sourceLabel }));
  const result: CompareResult = { sources, ...checked };
  return Response.json(result);
}

function errorResponse(code: ErrorCode, status: number) {
  const error: AnalyzeError = { error: { code, message: ERROR_MESSAGES[code] } };
  return Response.json(error, { status });
}
