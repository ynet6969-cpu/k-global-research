"use client";

// Design Ref: §5.1 — 입력 방식(2), 입력창(3), 안내 문구(4), 관심 분야(5), 실행 버튼(6) 구역.
// PLAN 작업 4: "분석하기"를 누르면 입력을 모아 부모(page)에게 넘긴다. 실제 API 호출은 page가 한다.
// PLAN 작업 6: 입력창 아래에 공개 자료만 넣으라는 안내 문구를 둔다 (PRD 7번, DESIGN §5.1 구역 4).
// PLAN 작업 8: "원문 붙여넣기"와 "링크 입력" 중 하나를 고르게 한다. 탭을 바꿔도 적어 둔 내용은 남는다.
// PLAN 작업 15: 분석 중에는 버튼을 "분석 중…"으로 바꾸고 막는다.
//   페이지가 다 열리기 전(화면 코드가 붙기 전)에도 버튼을 막아, 눌렀을 때 새로고침되는 일을 없앤다.
// 파일 불러오기: PDF·엑셀·CSV·TXT에서 글자만 뽑아 원문칸에 넣는다. 파일 자체는 서버로 보내지 않는다.

import { useRef, useState, useSyncExternalStore } from "react";
import { ACCEPTED_FILES, FileReadError, readTextFromFile } from "@/lib/readFile";
import {
  FIELDS,
  MAX_CUSTOM_FIELD_LENGTH,
  MAX_SOURCE_LABEL_LENGTH,
  MAX_TEXT_LENGTH,
  type AnalyzeRequest,
  type Field,
  type InputMode,
} from "@/lib/types";

interface Props {
  /** 입력을 모아 분석을 요청한다 */
  onSubmit: (request: AnalyzeRequest) => void;
  /** 분석 중이면 true */
  loading: boolean;
}

/** 바뀔 일이 없는 값이라 구독할 것도 없다 */
const subscribeNothing = () => () => {};

const MODE_TABS: { mode: InputMode; label: string }[] = [
  { mode: "text", label: "원문 붙여넣기" },
  { mode: "url", label: "링크 입력" },
];

export default function AnalyzeForm({ onSubmit, loading }: Props) {
  // 서버에서 그린 첫 화면에서는 false, 브라우저에서 화면 코드가 붙은 뒤 true
  const ready = useSyncExternalStore(subscribeNothing, () => true, () => false);

  const [mode, setMode] = useState<InputMode>("text");
  const [text, setText] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [url, setUrl] = useState("");
  const [field, setField] = useState<Field>(FIELDS[0]);
  const [customField, setCustomField] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileStatus, setFileStatus] = useState<{ kind: "loading" | "ok" | "error"; message: string } | null>(null);

  /** 고른 파일에서 글자를 뽑아 원문칸을 채운다. 출처가 비어 있으면 파일 이름을 넣는다. */
  async function loadFile(file: File) {
    setFileStatus({ kind: "loading", message: "" });
    try {
      const extracted = await readTextFromFile(file, MAX_TEXT_LENGTH);
      const cut = extracted.length > MAX_TEXT_LENGTH;
      setText(cut ? extracted.slice(0, MAX_TEXT_LENGTH) : extracted);
      if (!sourceLabel.trim()) setSourceLabel(file.name.slice(0, MAX_SOURCE_LABEL_LENGTH));
      setFileStatus({
        kind: "ok",
        message: cut
          ? `「${file.name}」이 길어서 앞 ${MAX_TEXT_LENGTH.toLocaleString()}자만 넣었어요.`
          : `「${file.name}」에서 글자를 불러왔어요. 내용을 확인한 뒤 분석하세요.`,
      });
    } catch (e) {
      setFileStatus({
        kind: "error",
        message: e instanceof FileReadError ? e.message : "파일을 읽지 못했어요. 다른 파일로 다시 시도해 주세요.",
      });
    }
  }

  return (
    <form
      // 브라우저 기본 검사 말풍선 대신, 화면과 서버가 함께 쓰는 한국어 안내(ERROR_MESSAGES)를 보여 준다
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        // 고른 방식에 해당하는 값만 보낸다 (링크 방식에서는 링크가 곧 출처)
        onSubmit({
          mode,
          ...(mode === "text" ? { text, sourceLabel } : { url }),
          field,
          customField: field === "직접 입력" ? customField : undefined,
        });
      }}
    >
      <div role="tablist" aria-label="입력 방식" className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900">
        {MODE_TABS.map((tab) => (
          <button
            key={tab.mode}
            type="button"
            role="tab"
            id={`tab-${tab.mode}`}
            aria-selected={mode === tab.mode}
            aria-controls="input-panel"
            onClick={() => setMode(tab.mode)}
            className={`h-10 rounded-md text-sm font-semibold transition-colors ${
              mode === tab.mode
                ? "bg-white text-blue-950 shadow-sm dark:bg-zinc-700 dark:text-white"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div id="input-panel" role="tabpanel" aria-labelledby={`tab-${mode}`} className="flex flex-col gap-5">
        {mode === "text" ? (
          <>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="text" className="text-sm font-semibold">
                  원문
                </label>
                <input
                  ref={fileInput}
                  type="file"
                  accept={ACCEPTED_FILES}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    // 같은 파일을 다시 골라도 불러오도록 비워 둔다
                    e.target.value = "";
                    if (file) void loadFile(file);
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  disabled={!ready || loading || fileStatus?.kind === "loading"}
                  className="flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-blue-950 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-blue-100 dark:hover:bg-zinc-800"
                >
                  <span aria-hidden>📎</span>
                  {fileStatus?.kind === "loading" ? "파일 읽는 중…" : "파일에서 불러오기"}
                </button>
              </div>
              <textarea
                id="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={MAX_TEXT_LENGTH}
                aria-describedby="public-data-notice"
                rows={10}
                placeholder="해외 금융 기사나 보고서의 원문을 붙여넣으세요."
                className="w-full resize-y rounded-lg border border-zinc-300 bg-white p-3 text-sm leading-6 focus:border-blue-700 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
              />
              <div className="flex items-start justify-between gap-3 text-xs">
                <p
                  role="status"
                  className={fileStatus?.kind === "error" ? "text-red-700 dark:text-red-400" : "text-zinc-500"}
                >
                  {fileStatus?.kind === "loading" ? "" : (fileStatus?.message ?? "PDF·엑셀(.xlsx)·CSV·TXT 파일을 올리면 글자만 뽑아 넣어요.")}
                </p>
                <p className="shrink-0 text-zinc-500">
                  {text.length.toLocaleString()} / {MAX_TEXT_LENGTH.toLocaleString()}자
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="source" className="text-sm font-semibold">
                출처 <span className="font-normal text-zinc-500">(선택: 기관명 또는 링크)</span>
              </label>
              <input
                id="source"
                value={sourceLabel}
                onChange={(e) => setSourceLabel(e.target.value)}
                maxLength={MAX_SOURCE_LABEL_LENGTH}
                placeholder="예: 미국 연방준비제도 보도자료"
                className="w-full rounded-lg border border-zinc-300 bg-white p-3 text-sm focus:border-blue-700 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <label htmlFor="url" className="text-sm font-semibold">
              링크 <span className="font-normal text-zinc-500">(기사·보고서 1개)</span>
            </label>
            <input
              id="url"
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              aria-describedby="public-data-notice"
              placeholder="https://"
              className="w-full rounded-lg border border-zinc-300 bg-white p-3 text-sm focus:border-blue-700 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
            />
            <p className="text-xs text-zinc-500">링크의 본문을 가져와 분석합니다. 이 링크가 결과의 출처로 표시됩니다.</p>
          </div>
        )}
      </div>

      <p
        id="public-data-notice"
        className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm leading-6 text-blue-950 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100"
      >
        <strong className="font-semibold">공개 자료만 입력하세요.</strong> 사내 기밀·유료 리포트·개인정보는 넣지 마세요.
      </p>

      <div className="flex flex-col gap-2">
        <label htmlFor="field" className="text-sm font-semibold">
          관심 분야
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            id="field"
            value={field}
            onChange={(e) => setField(e.target.value as Field)}
            className="rounded-lg border border-zinc-300 bg-white p-3 text-sm focus:border-blue-700 focus:outline-none sm:w-48 dark:border-zinc-700 dark:bg-zinc-900"
          >
            {FIELDS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          {field === "직접 입력" && (
            <input
              aria-label="관심 분야 직접 입력"
              value={customField}
              onChange={(e) => setCustomField(e.target.value)}
              maxLength={MAX_CUSTOM_FIELD_LENGTH}
              placeholder="예: 반도체 산업"
              className="flex-1 rounded-lg border border-zinc-300 bg-white p-3 text-sm focus:border-blue-700 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
            />
          )}
        </div>
      </div>

      <button
        type="submit"
        disabled={!ready || loading}
        aria-busy={loading}
        className="flex h-12 items-center justify-center gap-2 rounded-lg bg-blue-900 text-base font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-blue-900/60"
      >
        {loading && (
          <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        )}
        {loading ? "분석 중…" : "분석하기"}
      </button>
    </form>
  );
}
