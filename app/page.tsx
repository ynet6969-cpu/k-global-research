"use client";

// Design Ref: §5.1 — 화면 전체 배치. 위에서 아래로 머리 → 입력 폼 → 오류 → 결과 영역.
// PLAN 작업 4: 폼의 입력을 받아 /api/analyze를 부르고, 받은 결과를 결과 영역에 넘긴다.
// PLAN 작업 7: 원문 길이를 먼저 확인해, 짧거나 길면 서버로 보내지 않고 바로 안내한다 (DESIGN §2.2 단계 2).
// PLAN 작업 15: 분석 중 표시, 중복 요청 막기, 상황별 오류 안내와 "다시 시도" 버튼.
// UX 개선: 분석을 시작하면 진행 안내로, 결과가 나오면 결과로 화면을 옮긴다.
//   휴대폰에서는 결과가 화면 아래에 나타나 보이지 않아, 실패한 줄 알고 다시 누르는 일이 있었다.

import { useEffect, useRef, useState } from "react";
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
import CompareSection from "./components/CompareSection";
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

/** 화면 맨 위에서 고르는 기능: 자료 한 건 분석 / 금리·환율·경제성장 종합비교 */
const VIEWS = [
  { view: "single", icon: "📄", label: "자료 분석" },
  { view: "compare", icon: "📊", label: "종합비교" },
] as const;

export default function Home() {
  const [view, setView] = useState<(typeof VIEWS)[number]["view"]>("single");
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRequest, setLastRequest] = useState<AnalyzeRequest | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // 분석이 시작되거나 결과가 나오면 결과 영역이 보이게 옮긴다
  useEffect(() => {
    const area = resultRef.current;
    if (!area || (!loading && !result)) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const outOfView = () => {
      const top = area.getBoundingClientRect().top;
      return top < 0 || top > window.innerHeight * 0.6;
    };
    // 결과가 나오면 화면 낭독기도 결과부터 읽도록 초점을 옮긴다 (화면은 다시 움직이지 않게)
    if (result && !loading) area.focus({ preventScroll: true });

    // 결과 영역 윗부분이 이미 화면 안에 있으면 움직이지 않는다
    if (!outOfView()) return;
    area.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    // 부드러운 스크롤이 동작하지 않는 환경(절전 모드·내장 브라우저 등)에서는 바로 이동한다
    const fallback = window.setTimeout(() => {
      if (outOfView()) area.scrollIntoView({ behavior: "auto", block: "start" });
    }, 700);
    return () => window.clearTimeout(fallback);
  }, [loading, result]);

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

      <div role="tablist" aria-label="기능 선택" className="grid grid-cols-2 gap-2">
        {VIEWS.map((v) => (
          <button
            key={v.view}
            type="button"
            role="tab"
            aria-selected={view === v.view}
            onClick={() => setView(v.view)}
            className={`flex h-12 items-center justify-center gap-2 rounded-lg border text-sm font-bold transition-colors ${
              view === v.view
                ? "border-blue-900 bg-blue-900 text-white dark:border-blue-300 dark:bg-blue-300 dark:text-blue-950"
                : "border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            }`}
          >
            <span aria-hidden>{v.icon}</span>
            {v.label}
          </button>
        ))}
      </div>

      {view === "compare" ? (
        <CompareSection />
      ) : (
        <>
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

      <div ref={resultRef} tabIndex={-1} className="scroll-mt-4 outline-none">
        <ResultView result={result} loading={loading} />
      </div>
        </>
      )}
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
