// Design Ref: §4 — POST /api/analyze. 입력을 받아 AnalyzeResult 모양으로 돌려준다.
// PLAN 작업 2: 지금은 AI 없이 고정된 예시 결과를 돌려주는 뼈대다.
// PLAN 작업 7: 예시 결과를 돌려주기 전에 입력 길이를 검사한다.
// PLAN 작업 9: 링크 방식이면 서버가 본문 글자를 가져와 원문으로 쓴다.
// AI 호출(작업 10~13)은 이후 작업에서 이 자리에 붙인다.

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

export async function POST(request: Request) {
  // JSON이 아니면 빈 입력으로 보고 검사에서 걸러지게 한다
  const parsed: unknown = await request.json().catch(() => ({}));
  const body = (parsed && typeof parsed === "object" ? parsed : {}) as Partial<AnalyzeRequest>;

  const invalid = validateRequest(body);
  if (invalid) {
    return Response.json(invalid, { status: 400 });
  }

  if (body.mode === "url" && body.url) {
    const article = await fetchArticle(body.url);
    if (!article.ok) {
      // 링크 형식·주소 문제는 사용자 입력 문제(400), 가져오기 실패는 상대 사이트 문제(502)
      return errorResponse(article.code, article.code === "INVALID_URL" ? 400 : 502);
    }

    const warnings = [`링크 본문 ${article.text.length.toLocaleString()}자를 가져왔습니다.`];
    if (article.truncated) {
      warnings.push(`본문이 길어 앞부분 ${MAX_TEXT_LENGTH.toLocaleString()}자만 분석합니다.`);
    }
    // 가져온 원문(article.text)은 AI 연결(작업 10)에서 분석에 쓴다
    return Response.json(sampleResult({ label: article.title ?? article.finalUrl, url: article.finalUrl }, warnings));
  }

  return Response.json(sampleResult(textSource(body)));
}

function errorResponse(code: ErrorCode, status: number) {
  const error: AnalyzeError = { error: { code, message: ERROR_MESSAGES[code] } };
  return Response.json(error, { status });
}

/** 원문 방식의 출처: 적은 출처를 쓰고, 비어 있으면 "출처 미입력" */
function textSource(body: Partial<AnalyzeRequest>): Source {
  const label = body.sourceLabel?.trim();
  return { label: label || NO_SOURCE_LABEL };
}

/** 화면 개발용 예시 결과. 실제 AI 결과가 아님을 문구로 드러낸다 */
function sampleResult(source: Source, extraWarnings: string[] = []): AnalyzeResult {
  return {
    summary: [
      { text: "[예시] 미국 연준이 기준금리를 연 4.50%로 동결했습니다.", hasNumber: true, sourceRef: source.label },
      { text: "[예시] 물가 상승세가 둔화되고 있다고 평가했습니다.", hasNumber: false },
      { text: "[예시] 추가 인하 시점은 지표를 보고 정하겠다고 밝혔습니다.", hasNumber: false },
    ],
    impact: {
      verdict: "중립",
      evidence: [
        "[예시 인용] 위원회는 기준금리 목표 범위를 유지하기로 결정했다.",
        "[예시 인용] 향후 결정은 들어오는 데이터에 따라 판단할 것이다.",
      ],
      reasoning: "[예시] 금리 동결로 원·달러 환율의 급격한 변동 가능성은 낮아 보입니다.",
    },
    source,
    warnings: ["이 결과는 화면 개발용 예시입니다. 실제 분석은 AI 연결(작업 10) 후에 나옵니다.", ...extraWarnings],
  };
}
