"use client";

// Design Ref: §5.1 — 입력창(3), 관심 분야(5), 실행 버튼(6) 구역.
// PLAN 작업 3: 화면 뼈대만 만든다. 버튼을 눌러 API를 부르는 연결은 작업 4에서 붙인다.
// 입력 방식 전환(작업 8)과 안내 문구(작업 6)는 이후 작업에서 이 컴포넌트에 추가한다.

import { useState } from "react";
import { FIELDS, MAX_TEXT_LENGTH, type Field } from "@/lib/types";

export default function AnalyzeForm() {
  const [text, setText] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [field, setField] = useState<Field>(FIELDS[0]);
  const [customField, setCustomField] = useState("");

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        // 작업 4에서 /api/analyze 호출을 연결하기 전까지는 아무 일도 하지 않는다
        e.preventDefault();
      }}
    >
      <div className="flex flex-col gap-2">
        <label htmlFor="text" className="text-sm font-semibold">
          원문
        </label>
        <textarea
          id="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_TEXT_LENGTH}
          rows={10}
          placeholder="해외 금융 기사나 보고서의 원문을 붙여넣으세요."
          className="w-full resize-y rounded-lg border border-zinc-300 bg-white p-3 text-sm leading-6 focus:border-blue-700 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
        />
        <p className="text-right text-xs text-zinc-500">
          {text.length.toLocaleString()} / {MAX_TEXT_LENGTH.toLocaleString()}자
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="source" className="text-sm font-semibold">
          출처 <span className="font-normal text-zinc-500">(선택: 기관명 또는 링크)</span>
        </label>
        <input
          id="source"
          value={sourceLabel}
          onChange={(e) => setSourceLabel(e.target.value)}
          placeholder="예: 미국 연방준비제도 보도자료"
          className="w-full rounded-lg border border-zinc-300 bg-white p-3 text-sm focus:border-blue-700 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

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
              placeholder="예: 반도체 산업"
              className="flex-1 rounded-lg border border-zinc-300 bg-white p-3 text-sm focus:border-blue-700 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
            />
          )}
        </div>
      </div>

      <button
        type="submit"
        className="h-12 rounded-lg bg-blue-900 text-base font-semibold text-white transition-colors hover:bg-blue-800"
      >
        분석하기
      </button>
    </form>
  );
}
