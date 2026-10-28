"use client";

// Design Ref: §5.1 — 화면 전체 배치. 위에서 아래로 머리 → 입력 폼 → 결과 영역.
// PLAN 작업 4: 폼의 입력을 받아 /api/analyze를 부르고, 받은 결과를 결과 영역에 넘긴다.

import { useState } from "react";
import type { AnalyzeError, AnalyzeRequest, AnalyzeResult } from "@/lib/types";
import AnalyzeForm from "./components/AnalyzeForm";
import ResultView from "./components/ResultView";

export default function Home() {
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function analyze(request: AnalyzeRequest) {
    setError(null);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const data = (await response.json()) as AnalyzeResult | AnalyzeError;
      if (!response.ok || "error" in data) {
        setResult(null);
        setError("error" in data ? data.error.message : "분석 요청에 실패했습니다.");
        return;
      }
      setResult(data);
    } catch {
      // 오류 안내 문구와 다시 시도 안내는 작업 15에서 다듬는다
      setResult(null);
      setError("서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-blue-950 sm:text-3xl dark:text-blue-100">K-글로벌 금융리서치</h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          해외 금융 자료를 한국어로 요약하고, 한국과 우리 산업에 미치는 영향을 출처와 함께 정리합니다.
        </p>
      </header>

      <AnalyzeForm onSubmit={analyze} />

      {error && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      <ResultView result={result} />
    </main>
  );
}
