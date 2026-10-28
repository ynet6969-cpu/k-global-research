"use client";

// Design Ref: §5.1 — 화면 전체 배치. 위에서 아래로 머리 → 입력 폼 → 오류 → 결과 영역.
// PLAN 작업 4: 폼의 입력을 받아 /api/analyze를 부르고, 받은 결과를 결과 영역에 넘긴다.
// PLAN 작업 7: 원문 길이를 먼저 확인해, 짧거나 길면 서버로 보내지 않고 바로 안내한다 (DESIGN §2.2 단계 2).
// PLAN 작업 15: 분석 중 표시, 중복 요청 막기, 상황별 오류 안내와 "다시 시도" 버튼.

import { useState } from "react";
import {
  ERROR_MESSAGES,
  MAX_TEXT_LENGTH,
  MIN_TEXT_LENGTH,
  type AnalyzeError,
  type AnalyzeRequest,
  type AnalyzeResult,
  type ErrorCode,
} from "@/lib/types";
import AnalyzeForm from "./components/AnalyzeForm";
import ResultView from "./components/ResultView";

/** 서버 최대 실행 시간(90초)보다 조금 더 기다린다 */
const CLIENT_TIMEOUT_MS = 95_000;

/** 같은 입력으로 다시 시도하면 해결될 수 있는 오류 */
const RETRYABLE: ErrorCode[] = ["AI_FAILED", "FETCH_FAILED"];

interface ErrorState {
  message: string;
  /** "다시 시도" 버튼을 보여 줄지 */
  retryable: boolean;
}

export default function Home() {
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRequest, setLastRequest] = useState<AnalyzeRequest | null>(null);

  function fail(message: string, retryable = false) {
    setResult(null);
    setError({ message, retryable });
  }

  async function analyze(request: AnalyzeRequest) {
    // 분석 중에는 다시 보내지 않는다 (같은 요청이 두 번 가서 비용이 두 번 드는 것을 막음)
    if (loading) return;
    setError(null);

    if (request.mode === "text") {
      // 서버와 같은 기준(앞뒤 공백 제외)으로 센다
      const length = (request.text ?? "").trim().length;
      if (length < MIN_TEXT_LENGTH || length > MAX_TEXT_LENGTH) {
        fail(ERROR_MESSAGES[length < MIN_TEXT_LENGTH ? "TOO_SHORT" : "TOO_LONG"]);
        return;
      }
    }

    // PLAN 작업 8: 링크 방식이면 http·https 주소인지 먼저 확인한다 (서버도 다시 확인한다)
    if (request.mode === "url" && !isWebUrl(request.url)) {
      fail(ERROR_MESSAGES.INVALID_URL);
      return;
    }

    setLastRequest(request);
    setLoading(true);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
      });
      // 서버가 JSON이 아닌 오류 화면(예: 배포 환경의 시간 초과 페이지)을 돌려줄 수도 있다
      const data = (await response.json().catch(() => null)) as AnalyzeResult | AnalyzeError | null;

      if (data && "error" in data) {
        fail(data.error.message, RETRYABLE.includes(data.error.code));
      } else if (!response.ok || !data) {
        fail(`분석 요청에 실패했습니다 (오류 ${response.status}). 잠시 후 다시 시도해 주세요.`, true);
      } else {
        setResult(data);
      }
    } catch (e) {
      const timedOut = e instanceof DOMException && e.name === "TimeoutError";
      fail(
        timedOut
          ? "분석 시간이 너무 오래 걸립니다. 원문을 줄이거나 잠시 후 다시 시도해 주세요."
          : "서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.",
        true,
      );
    } finally {
      setLoading(false);
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

      <AnalyzeForm onSubmit={analyze} loading={loading} />

      {error && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          <p>{error.message}</p>
          {error.retryable && lastRequest && (
            <button
              type="button"
              onClick={() => analyze(lastRequest)}
              disabled={loading}
              className="h-9 shrink-0 rounded-md border border-red-400 px-4 font-semibold transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-700 dark:hover:bg-red-900"
            >
              다시 시도
            </button>
          )}
        </div>
      )}

      <ResultView result={result} loading={loading} />
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
