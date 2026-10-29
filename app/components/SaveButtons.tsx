"use client";

// 분석 결과를 Word(.docx)·PowerPoint(.pptx) 파일로 저장하는 버튼 두 개.
// 파일은 브라우저 안에서만 만든다 (lib/exportReport.ts). 라이브러리는 눌렀을 때 처음 불러온다.

import { useState } from "react";
import type { ReportDoc } from "@/lib/report";

type Kind = "word" | "ppt";

const LABELS: Record<Kind, { icon: string; idle: string; busy: string; done: string }> = {
  word: { icon: "📄", idle: "Word로 저장", busy: "Word 만드는 중…", done: "Word 저장됨 ✓" },
  ppt: { icon: "📊", idle: "PPT로 저장", busy: "PPT 만드는 중…", done: "PPT 저장됨 ✓" },
};

export default function SaveButtons({ report }: { report: ReportDoc }) {
  const [busy, setBusy] = useState<Kind | null>(null);
  const [done, setDone] = useState<Kind | null>(null);
  const [failed, setFailed] = useState(false);

  async function save(kind: Kind) {
    if (busy) return;
    setBusy(kind);
    setDone(null);
    setFailed(false);
    try {
      // 눌렀을 때만 불러온다 (docx·pptxgenjs는 무거워서 첫 화면에 넣지 않는다)
      const { saveAsWord, saveAsPowerPoint } = await import("@/lib/exportReport");
      await (kind === "word" ? saveAsWord(report) : saveAsPowerPoint(report));
      setDone(kind);
      setTimeout(() => setDone((d) => (d === kind ? null : d)), 3000);
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-2">
        {(Object.keys(LABELS) as Kind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => void save(kind)}
            disabled={busy !== null}
            className="flex h-11 items-center gap-1.5 rounded-lg border border-blue-900 px-5 text-sm font-semibold text-blue-900 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-300 dark:text-blue-200 dark:hover:bg-blue-950"
          >
            <span aria-hidden>{LABELS[kind].icon}</span>
            {busy === kind ? LABELS[kind].busy : done === kind ? LABELS[kind].done : LABELS[kind].idle}
          </button>
        ))}
      </div>
      <p role="status" className="text-xs text-zinc-500">
        {failed && "파일을 만들지 못했습니다. 잠시 후 다시 시도해 주세요."}
        {done && !failed && "파일이 내려받기 폴더에 저장됩니다."}
      </p>
    </div>
  );
}
