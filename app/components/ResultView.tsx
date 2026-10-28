// Design Ref: §5.1 — 결과 구역(8~11).
// PLAN 작업 3: 결과가 아직 없을 때의 빈 영역만 보여 준다.
// 요약·영향·출처를 구역별로 그리는 부분은 작업 5, 복사하기 버튼은 작업 14에서 추가한다.

export default function ResultView() {
  return (
    <section
      aria-label="분석 결과"
      className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700"
    >
      원문을 넣고 &quot;분석하기&quot;를 누르면 요약과 영향 분석이 여기에 표시됩니다.
    </section>
  );
}
