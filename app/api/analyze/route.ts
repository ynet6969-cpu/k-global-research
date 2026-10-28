// Design Ref: §4 — POST /api/analyze. 입력을 받아 AnalyzeResult 모양으로 돌려준다.
// PLAN 작업 7: 먼저 입력 길이를 검사한다.
// PLAN 작업 9: 링크 방식이면 서버가 본문 글자를 가져와 원문으로 쓴다.
// PLAN 작업 10: 원문을 OpenAI에 보내 실제 분석 결과를 받는다.
// PLAN 작업 11: must ① 요약 규칙을 지시문에 넣고, 수치 줄 출처 표시는 서버가 붙인다.
// must ② 규칙(작업 12)과 나머지 서버 규칙 검사(작업 13)는 이후 작업에서 붙인다.

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
import { attachSources } from "@/lib/checkRules";

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

  const result: AnalyzeResult = {
    // must ①: 수치가 있는 줄마다 서버가 출처를 붙인다 (PLAN 작업 11)
    summary: attachSources(ai.summary, source.label),
    impact: { verdict: ai.verdict, evidence: ai.evidence, reasoning: ai.reasoning },
    source,
    warnings,
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
