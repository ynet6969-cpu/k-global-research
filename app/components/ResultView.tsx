// Design Ref: §5.1 — 결과 구역(8 요약, 9 영향, 10 출처).
// PLAN 작업 5: 받은 결과를 요약·영향·출처 구역으로 나눠 보여 준다.
// 복사하기 버튼(11)은 작업 14에서 추가한다.

import type { AnalyzeResult, Source, Verdict } from "@/lib/types";

interface Props {
  result: AnalyzeResult | null;
}

/** 영향 판정마다 배지 색을 다르게 해 한눈에 구분되게 한다 */
const VERDICT_STYLE: Record<Verdict, string> = {
  긍정: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
  부정: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  중립: "bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100",
  "판단 보류": "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
};

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
    </section>
  );
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
