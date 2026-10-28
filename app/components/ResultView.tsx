// Design Ref: §5.1 — 결과 구역(8~11).
// PLAN 작업 4: 결과를 받았는지만 보여 준다.
// 요약·영향·출처를 구역별로 그리는 부분은 작업 5, 복사하기 버튼은 작업 14에서 추가한다.

import type { AnalyzeResult } from "@/lib/types";

interface Props {
  result: AnalyzeResult | null;
}

export default function ResultView({ result }: Props) {
  if (!result) {
    return (
      <section
        aria-label="분석 결과"
        className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700"
      >
        원문을 넣고 &quot;분석하기&quot;를 누르면 요약과 영향 분석이 여기에 표시됩니다.
      </section>
    );
  }

  // 작업 5에서 구역별 표시로 바꾸기 전까지, 받은 결과의 개요만 보여 준다
  return (
    <section
      aria-label="분석 결과"
      className="flex flex-col gap-1 rounded-lg border border-blue-200 bg-blue-50 p-6 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100"
    >
      <p className="font-semibold">결과를 받았습니다.</p>
      <p>
        요약 {result.summary.length}줄 · 영향 판정 {result.impact.verdict} · 근거 {result.impact.evidence.length}개 · 출처{" "}
        {result.source.label}
      </p>
    </section>
  );
}
