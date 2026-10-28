// Design Ref: §4 — POST /api/analyze. 입력을 받아 AnalyzeResult 모양으로 돌려준다.
// PLAN 작업 2: 지금은 AI 없이 고정된 예시 결과를 돌려주는 뼈대다.
// PLAN 작업 7: 예시 결과를 돌려주기 전에 입력 길이를 검사한다.
// 링크 본문(작업 9), AI 호출(작업 10~13)은 이후 작업에서 이 자리에 붙인다.

import { NO_SOURCE_LABEL, type AnalyzeRequest, type AnalyzeResult, type Source } from "@/lib/types";
import { validateRequest } from "@/lib/validate";

export async function POST(request: Request) {
  // JSON이 아니면 빈 입력으로 보고 검사에서 걸러지게 한다
  const parsed: unknown = await request.json().catch(() => ({}));
  const body = (parsed && typeof parsed === "object" ? parsed : {}) as Partial<AnalyzeRequest>;

  const invalid = validateRequest(body);
  if (invalid) {
    return Response.json(invalid, { status: 400 });
  }

  return Response.json(sampleResult(body));
}

/** 화면 개발용 예시 결과. 실제 AI 결과가 아님을 문구로 드러낸다 */
function sampleResult(body: Partial<AnalyzeRequest>): AnalyzeResult {
  const source = sourceOf(body);

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
    warnings: ["이 결과는 화면 개발용 예시입니다. 실제 분석은 AI 연결(작업 10) 후에 나옵니다."],
  };
}

/** 링크로 넣었으면 링크를, 원문이면 적은 출처를, 둘 다 없으면 "출처 미입력"을 쓴다 */
function sourceOf(body: Partial<AnalyzeRequest>): Source {
  if (body.mode === "url" && body.url) {
    return { label: body.url, url: body.url };
  }
  const label = body.sourceLabel?.trim();
  return { label: label || NO_SOURCE_LABEL };
}
