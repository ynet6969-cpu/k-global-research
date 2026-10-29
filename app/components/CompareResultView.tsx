"use client";

// 종합비교 결과: 비교한 자료 → 핵심 지표 표 → 종합 비교 → 한국·우리 산업 영향. (한 건 분석 결과와 같은 카드 모양)

import type { CompareResult } from "@/lib/types";
import { comparisonToReport } from "@/lib/report";
import { Card, CopyButton, VERDICT_STYLE } from "./ResultView";
import SaveButtons from "./SaveButtons";

interface Props {
  result: CompareResult | null;
  loading: boolean;
}

export default function CompareResultView({ result, loading }: Props) {
  if (loading) {
    return (
      <section
        aria-label="종합비교 결과"
        aria-busy
        className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-blue-300 p-6 text-center text-sm text-blue-900 dark:border-blue-800 dark:text-blue-200"
      >
        <span aria-hidden className="h-6 w-6 animate-spin rounded-full border-2 border-blue-200 border-t-blue-800 dark:border-blue-900 dark:border-t-blue-300" />
        <p role="status">AI가 자료들을 견주어 비교표와 영향 분석을 만들고 있습니다. 보통 5~20초 걸립니다.</p>
      </section>
    );
  }

  if (!result) {
    return (
      <section
        aria-label="종합비교 결과"
        className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700"
      >
        자료를 2개 이상 넣고 &quot;종합비교 분석하기&quot;를 누르면 지표 비교표와 종합 분석이 여기에 표시됩니다.
      </section>
    );
  }

  const { sources, indicators, comparison, sections, impact, warnings } = result;
  const labelOf = (n: number) => sources.find((s) => s.index === n)?.source ?? `자료 ${n}`;
  const report = comparisonToReport(result);

  return (
    <section aria-label="종합비교 결과" className="flex flex-col gap-4">
      {warnings.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <Card title="핵심 지표 비교">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-300 text-xs text-zinc-500 dark:border-zinc-700">
                <th className="py-2 pr-3 font-semibold">자료</th>
                <th className="py-2 pr-3 font-semibold">지표</th>
                <th className="py-2 pr-3 font-semibold">수치</th>
                <th className="py-2 font-semibold">변화</th>
              </tr>
            </thead>
            <tbody>
              {indicators.map((row, i) => (
                <tr key={i} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                  <td className="py-2 pr-3 align-top">
                    <span className="whitespace-nowrap rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-900 dark:bg-blue-950 dark:text-blue-200">
                      자료 {row.material}
                    </span>
                  </td>
                  <td className="py-2 pr-3 align-top">{row.name}</td>
                  <td className="py-2 pr-3 align-top font-semibold">{row.value}</td>
                  <td className="py-2 align-top">{row.change || <span className="text-zinc-400">-</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="flex flex-col gap-1 text-xs text-zinc-500">
          {sources.map((s) => (
            <li key={s.index}>
              자료 {s.index} · {s.field} · {s.source}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="종합 비교">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] border-collapse text-left text-sm leading-6">
            <thead>
              <tr className="border-b border-zinc-300 text-xs text-zinc-500 dark:border-zinc-700">
                <th className="w-10 py-2 pr-3 font-semibold">번호</th>
                <th className="py-2 pr-3 font-semibold">비교 내용</th>
                <th className="py-2 font-semibold">근거 자료</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((line, i) => (
                <tr key={i} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                  <td className="py-2 pr-3 align-top text-zinc-500">{i + 1}</td>
                  <td className="py-2 pr-3 align-top">{line.text}</td>
                  <td className="py-2 align-top text-xs text-blue-700 dark:text-blue-300">
                    {line.materials.length > 0
                      ? line.materials.map((n) => (line.hasNumber ? labelOf(n) : `자료 ${n}`)).join(", ")
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {sections.length > 0 && (
        <Card title="상세 분석">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] border-collapse text-left text-sm leading-6">
              <thead>
                <tr className="border-b border-zinc-300 text-xs text-zinc-500 dark:border-zinc-700">
                  <th className="w-1/4 py-2 pr-3 font-semibold">주제</th>
                  <th className="py-2 font-semibold">내용</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((s, i) => (
                  <tr key={i} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                    <th scope="row" className="py-3 pr-3 text-left align-top font-semibold text-blue-950 dark:text-blue-100">
                      {s.title}
                    </th>
                    <td className="py-3 align-top">{s.body}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

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

      <div className="flex flex-col items-end gap-3">
        <SaveButtons report={report} />
        <CopyButton text={toCopyText(report)} />
      </div>
    </section>
  );
}

/** 복사용 글: 문서 구조를 보고서에 붙여넣기 좋은 글로 펼친다 */
function toCopyText(report: ReturnType<typeof comparisonToReport>): string {
  const lines: string[] = [];
  for (const b of report.blocks) {
    lines.push(`■ ${b.heading}${b.badge ? `: ${b.badge}` : ""}`);
    if (b.table) {
      lines.push(b.table.head.join(" | "));
      b.table.rows.forEach((r) => lines.push(r.join(" | ")));
    }
    b.numbered?.forEach((l, i) => lines.push(`${i + 1}. ${l}`));
    if (b.quotes?.length) {
      lines.push("근거 (원문 인용)");
      b.quotes.forEach((q) => lines.push(`- "${q}"`));
    }
    if (b.paragraphs?.length) {
      if (b.quotes?.length) lines.push("해설");
      lines.push(...b.paragraphs);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}
