// Design Ref: §4 — POST /api/analyze. 입력을 받아 AnalyzeResult 모양으로 돌려준다.
// PLAN 작업 7: 먼저 입력 길이를 검사한다.
// PLAN 작업 9: 링크 방식이면 서버가 본문 글자를 가져와 원문으로 쓴다.
// PLAN 작업 10: 원문을 OpenAI에 보내 실제 분석 결과를 받는다.
// PLAN 작업 11·12: must ①·② 규칙은 지시문(lib/prompts.ts)에 있다.
// PLAN 작업 13: AI 답을 서버가 원문과 대조해 규칙에 맞게 바로잡는다 (lib/checkRules.ts).

import {
  ERROR_MESSAGES,
  MAX_TEXT_LENGTH,
  NO_SOURCE_LABEL,
  type AnalyzeError,
  type AnalyzeRequest,
  type AnalyzeResult,
  type ErrorCode,
  type Source,
} from "@/lib/types";
import { validateRequest } from "@/lib/validate";
import { fetchArticle } from "@/lib/fetchArticle";
import { callAiJson } from "@/lib/ai";
import { ANALYSIS_SCHEMA, buildAnalysisMessages, type AiAnalysis } from "@/lib/prompts";
import { checkAnalysis } from "@/lib/checkRules";
import { clientKeyOf, createRateLimiter } from "@/lib/rateLimit";

/** 분석 요청 횟수 제한 (Gap 3). 서버가 켜져 있는 동안 기억한다 */
const limiter = createRateLimiter();

/** Vercel에서 이 API가 실행될 수 있는 최대 시간(초). 링크 가져오기 10초 + AI 60초를 넉넉히 덮는다 */
export const maxDuration = 90;

export async function POST(request: Request) {
  // JSON이 아니면 빈 입력으로 보고 검사에서 걸러지게 한다
  const parsed: unknown = await request.json().catch(() => ({}));
  const body = (parsed && typeof parsed === "object" ? parsed : {}) as Partial<AnalyzeRequest>;

  const invalid = validateRequest(body);
  if (invalid) {
    return Response.json(invalid, { status: 400 });
  }

  // 링크 가져오기·AI 호출처럼 비용이 드는 일을 하기 전에 횟수를 센다 (잘못된 입력은 세지 않는다)
  const waitSeconds = limiter.take(clientKeyOf(request));
  if (waitSeconds > 0) {
    const minutes = Math.ceil(waitSeconds / 60);
    const error: AnalyzeError = {
      error: { code: "RATE_LIMITED", message: `짧은 시간에 분석을 너무 많이 요청했습니다. 약 ${minutes}분 후 다시 시도해 주세요.` },
    };
    return Response.json(error, { status: 429, headers: { "Retry-After": String(waitSeconds) } });
  }

  let text: string;
  let source: Source;
  const warnings: string[] = [];

  if (body.mode === "url" && body.url) {
    const article = await fetchArticle(body.url);
    if (!article.ok) {
      // 링크 형식·주소 문제는 사용자 입력 문제(400), 가져오기 실패는 상대 사이트 문제(502)
      return errorResponse(article.code, article.code === "INVALID_URL" ? 400 : 502);
    }
    text = article.text;
    source = { label: article.title ?? article.finalUrl, url: article.finalUrl };
    if (article.truncated) {
      warnings.push(`본문이 길어 앞부분 ${MAX_TEXT_LENGTH.toLocaleString()}자만 분석했습니다.`);
    }
  } else {
    text = (body.text ?? "").trim();
    source = { label: body.sourceLabel?.trim() || NO_SOURCE_LABEL };
  }

  const ai = await callAiJson<AiAnalysis>(
    buildAnalysisMessages({ text, field: fieldOf(body), sourceLabel: source.label }),
    ANALYSIS_SCHEMA,
  );
  if (!ai) {
    return errorResponse("AI_FAILED", 502);
  }

  // must ①·②: AI 답을 원문과 대조해 규칙에 맞게 바로잡는다 (PLAN 작업 13)
  const checked = checkAnalysis(ai, text, source.label);
  if (!checked) {
    // 규칙에 맞는 요약이 한 줄도 남지 않으면 결과를 보여 주지 않는다
    return errorResponse("AI_FAILED", 502);
  }

  const result: AnalyzeResult = {
    summary: checked.summary,
    impact: checked.impact,
    source,
    warnings: [...warnings, ...checked.warnings],
  };
  return Response.json(result);
}

function errorResponse(code: ErrorCode, status: number) {
  const error: AnalyzeError = { error: { code, message: ERROR_MESSAGES[code] } };
  return Response.json(error, { status });
}

/** 관심 분야: "직접 입력"이면 사용자가 적은 이름을, 비어 있으면 "일반 경제"를 쓴다 */
function fieldOf(body: Partial<AnalyzeRequest>): string {
  if (body.field === "직접 입력") return body.customField?.trim() || "일반 경제";
  return typeof body.field === "string" && body.field ? body.field : "일반 경제";
}
