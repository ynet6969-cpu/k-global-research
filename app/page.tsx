"use client";

// Design Ref: §5.1 — 화면 전체 배치. 위에서 아래로 머리 → 입력 폼 → 결과 영역.
// PLAN 작업 4: 폼의 입력을 받아 /api/analyze를 부르고, 받은 결과를 결과 영역에 넘긴다.
// PLAN 작업 7: 원문 길이를 먼저 확인해, 짧거나 길면 서버로 보내지 않고 바로 안내한다 (DESIGN §2.2 단계 2).

import { useState } from "react";
import {
  ERROR_MESSAGES,
  MAX_TEXT_LENGTH,
  MIN_TEXT_LENGTH,
  type AnalyzeError,
  type AnalyzeRequest,
  type AnalyzeResult,
} from "@/lib/types";
import AnalyzeForm from "./components/AnalyzeForm";
import ResultView from "./components/ResultView";

export default function Home() {
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function analyze(request: AnalyzeRequest) {
    setError(null);

    if (request.mode === "text") {
      // 서버와 같은 기준(앞뒤 공백 제외)으로 센다
      const length = (request.text ?? "").trim().length;
      if (length < MIN_TEXT_LENGTH || length > MAX_TEXT_LENGTH) {
        setResult(null);
        setError(ERROR_MESSAGES[length < MIN_TEXT_LENGTH ? "TOO_SHORT" : "TOO_LONG"]);
        return;
      }
    }

    // PLAN 작업 8: 링크 방식이면 http·https 주소인지 먼저 확인한다 (서버도 다시 확인한다)
    if (request.mode === "url" && !isWebUrl(request.url)) {
      setResult(null);
      setError(ERROR_MESSAGES.INVALID_URL);
      return;
    }

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

function isWebUrl(value: string | undefined): boolean {
  try {
    const { protocol } = new URL((value ?? "").trim());
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
