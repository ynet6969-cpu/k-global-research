// 분석 결과를 Word·PPT로 저장하기 전에, 두 파일이 같이 쓰는 "문서 구조"로 바꿔 둔다.
// 한 건 분석(AnalyzeResult)과 종합비교(CompareResult)가 같은 저장 코드(lib/exportReport.ts)를 쓰게 하려는 것이다.
// 이 파일에는 라이브러리를 부르는 코드가 없다. 글만 정리한다.

import type { AnalyzeResult, CompareResult } from "./types";

/** 문서의 한 구역 (Word에서는 소제목 + 내용, PPT에서는 슬라이드 한 장) */
export interface ReportBlock {
  heading: string;
  /** 영향 판정 같은 짧은 배지 글 */
  badge?: string;
  /** 번호를 붙여 나열할 줄 */
  numbered?: string[];
  /** 원문에서 그대로 옮긴 인용 */
  quotes?: string[];
  /** 일반 문단 */
  paragraphs?: string[];
  /** 표 */
  table?: {
    head: string[];
    rows: string[][];
    /** 열 폭 비율 (없으면 첫 열은 좁게, 나머지는 같게) */
    widths?: number[];
  };
}

export interface ReportDoc {
  title: string;
  subtitle: string;
  blocks: ReportBlock[];
  /** 파일 이름 앞부분 (확장자 제외) */
  fileBase: string;
}

const SERVICE_NAME = "K-글로벌 금융리서치";

/** 저장한 날짜 (예: 2026-10-29) */
function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 한 건 분석 결과 → 문서 */
export function analysisToReport({ summary, impact, source }: AnalyzeResult): ReportDoc {
  const sourceText = source.url && source.url !== source.label ? `${source.label} (${source.url})` : source.label;
  return {
    title: "해외 금융 자료 분석 보고서",
    subtitle: `${SERVICE_NAME} · ${today()}`,
    fileBase: `금융리서치_분석_${today()}`,
    blocks: [
      {
        heading: "요약",
        numbered: summary.map((l) => `${l.text}${l.hasNumber && l.sourceRef ? ` [출처: ${l.sourceRef}]` : ""}`),
      },
      {
        heading: "한국·우리 산업 영향",
        badge: impact.verdict,
        quotes: impact.evidence,
        paragraphs: [impact.reasoning],
      },
      { heading: "원문 출처", paragraphs: [sourceText] },
    ],
  };
}

/** 종합비교 결과 → 문서 */
export function comparisonToReport({ sources, indicators, comparison, sections, impact }: CompareResult): ReportDoc {
  const labelOf = (n: number) => sources.find((s) => s.index === n)?.source ?? `자료 ${n}`;
  return {
    title: "금리·환율·경제성장 종합비교 보고서",
    subtitle: `${SERVICE_NAME} · ${today()}`,
    fileBase: `금융리서치_종합비교_${today()}`,
    blocks: [
      {
        heading: "비교한 자료",
        table: { head: ["번호", "분야", "출처"], rows: sources.map((s) => [`자료 ${s.index}`, s.field, s.source]) },
      },
      {
        heading: "핵심 지표 비교",
        table: {
          head: ["자료", "지표", "수치", "변화"],
          rows: indicators.map((i) => [`자료 ${i.material}`, i.name, i.value, i.change || "-"]),
        },
      },
      {
        heading: "종합 비교",
        table: {
          head: ["번호", "비교 내용", "근거 자료"],
          widths: [1, 7, 3],
          rows: comparison.map((l, i) => [
            String(i + 1),
            l.text,
            // 수치가 든 줄은 출처 이름을, 아닌 줄은 자료 번호만 적는다
            l.materials.map((n) => (l.hasNumber ? labelOf(n) : `자료 ${n}`)).join(", ") || "-",
          ]),
        },
      },
      ...(sections.length
        ? [
            {
              heading: "상세 분석",
              table: { head: ["주제", "내용"], widths: [2, 9], rows: sections.map((s) => [s.title, s.body]) },
            },
          ]
        : []),
      {
        heading: "한국·우리 산업 영향",
        badge: impact.verdict,
        quotes: impact.evidence,
        paragraphs: [impact.reasoning],
      },
    ],
  };
}
