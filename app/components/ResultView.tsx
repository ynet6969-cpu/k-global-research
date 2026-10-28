"use client";

// Design Ref: §5.1 — 결과 구역(8 요약, 9 영향, 10 출처, 11 복사).
// PLAN 작업 5: 받은 결과를 요약·영향·출처 구역으로 나눠 보여 준다.
// PLAN 작업 14: 결과 전체를 보고서에 붙여넣기 좋은 글로 한 번에 복사한다.

import { useEffect, useState } from "react";
import type { AnalyzeResult, Source, Verdict } from "@/lib/types";

interface Props {
  result: AnalyzeResult | null;
  /** 분석 중이면 결과 자리에 진행 안내를 보여 준다 (PLAN 작업 15) */
  loading: boolean;
}

/** 영향 판정마다 배지 색을 다르게 해 한눈에 구분되게 한다 */
const VERDICT_STYLE: Record<Verdict, string> = {
  긍정: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
  부정: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  중립: "bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100",
  "판단 보류": "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
};

export default function ResultView({ result, loading }: Props) {
  if (loading) {
    return (
      <section
        aria-label="분석 결과"
        aria-busy
        className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-blue-300 p-6 text-center text-sm text-blue-900 dark:border-blue-800 dark:text-blue-200"
      >
        <span aria-hidden className="h-6 w-6 animate-spin rounded-full border-2 border-blue-200 border-t-blue-800 dark:border-blue-900 dark:border-t-blue-300" />
        <p role="status">AI가 원문을 읽고 요약과 영향 분석을 만들고 있습니다. 보통 5~15초 걸립니다.</p>
      </section>
    );
  }

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

  const { summary, impact, source, warnings } = result;

  return (
    <section aria-label="분석 결과" className="flex flex-col gap-4">
      {warnings.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <Card title="요약">
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm leading-6">
          {summary.map((line, i) => (
            <li key={i}>
              {line.text}
              {line.hasNumber && line.sourceRef && (
                <span className="ml-2 whitespace-nowrap text-xs text-blue-700 dark:text-blue-300">[출처: {line.sourceRef}]</span>
              )}
            </li>
          ))}
        </ol>
      </Card>

      <Card title="한국·우리 산업 영향">
        <div className="flex flex-col gap-4 text-sm leading-6">
          <p>
            <span className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${VERDICT_STYLE[impact.verdict]}`}>
              {impact.verdict}
            </span>
          </p>
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold text-zinc-500">근거 (원문 인용)</h3>
            {impact.evidence.map((quote, i) => (
              <blockquote key={i} className="rounded-md bg-zinc-100 px-3 py-2 italic dark:bg-zinc-800">
                &ldquo;{quote}&rdquo;
              </blockquote>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="text-xs font-semibold text-zinc-500">해설</h3>
            <p>{impact.reasoning}</p>
          </div>
        </div>
      </Card>

      <Card title="원문 출처">
        <SourceLine source={source} />
      </Card>

      <CopyButton text={toReportText(result)} />
    </section>
  );
}

type CopyState = "idle" | "copied" | "failed";

function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<CopyState>("idle");

  // "복사됨" 표시는 2초 뒤에 원래대로 돌린다
  useEffect(() => {
    if (state !== "copied") return;
    const timer = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      // 회사 PC·내장 브라우저처럼 클립보드 권한이 막힌 곳에서는 예전 방식으로 한 번 더 시도한다
      setState(copyWithSelection(text) ? "copied" : "failed");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={copy}
        className="h-11 rounded-lg border border-blue-900 px-5 text-sm font-semibold text-blue-900 transition-colors hover:bg-blue-50 dark:border-blue-300 dark:text-blue-200 dark:hover:bg-blue-950"
      >
        {state === "copied" ? "복사됨 ✓" : "결과 복사하기"}
      </button>
      <p role="status" className="text-xs text-zinc-500">
        {state === "copied" && "요약·영향 분석·출처를 복사했습니다. 보고서에 붙여넣으세요."}
        {state === "failed" && "복사하지 못했습니다. 결과를 직접 선택해 복사해 주세요."}
      </p>
    </div>
  );
}

/** 보이지 않는 글상자에 글을 넣고 선택해 복사한다 (Clipboard API를 못 쓸 때의 대안) */
function copyWithSelection(text: string): boolean {
  const box = document.createElement("textarea");
  box.value = text;
  box.setAttribute("readonly", "");
  box.style.position = "fixed";
  box.style.opacity = "0";
  document.body.appendChild(box);
  box.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    box.remove();
  }
}

/** 보고서에 바로 붙여넣을 수 있는 글 형태. 서버 경고는 앱 안내라서 넣지 않는다 */
function toReportText({ summary, impact, source }: AnalyzeResult): string {
  const sourceText = source.url && source.url !== source.label ? `${source.label} (${source.url})` : source.label;
  return [
    "■ 요약",
    ...summary.map((line, i) => `${i + 1}. ${line.text}${line.hasNumber && line.sourceRef ? ` [출처: ${line.sourceRef}]` : ""}`),
    "",
    `■ 한국·우리 산업 영향: ${impact.verdict}`,
    "근거 (원문 인용)",
    ...impact.evidence.map((quote) => `- "${quote}"`),
    "해설",
    impact.reasoning,
    "",
    `■ 원문 출처: ${sourceText}`,
  ].join("\n");
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-base font-bold text-blue-950 dark:text-blue-100">{title}</h2>
      {children}
    </div>
  );
}

/** 링크는 http·https일 때만 누를 수 있게 한다 (javascript: 같은 주소가 실행되지 않도록) */
function SourceLine({ source }: { source: Source }) {
  const isWebLink = source.url !== undefined && /^https?:\/\//i.test(source.url);

  if (!isWebLink) {
    return <p className="text-sm">{source.label}</p>;
  }

  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="break-all text-sm text-blue-700 underline underline-offset-2 dark:text-blue-300"
    >
      {source.label}
    </a>
  );
}
