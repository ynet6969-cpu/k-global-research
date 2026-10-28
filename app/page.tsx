// Design Ref: §5.1 — 화면 전체 배치. 위에서 아래로 머리 → 입력 폼 → 결과 영역.

import AnalyzeForm from "./components/AnalyzeForm";
import ResultView from "./components/ResultView";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-blue-950 sm:text-3xl dark:text-blue-100">K-글로벌 금융리서치</h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          해외 금융 자료를 한국어로 요약하고, 한국과 우리 산업에 미치는 영향을 출처와 함께 정리합니다.
        </p>
      </header>

      <AnalyzeForm />

      <ResultView />
    </main>
  );
}
