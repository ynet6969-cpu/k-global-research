"use client";

// Design Ref: §5.1 — 입력창(3), 관심 분야(5), 실행 버튼(6) 구역.
// PLAN 작업 4: "분석하기"를 누르면 입력을 모아 부모(page)에게 넘긴다. 실제 API 호출은 page가 한다.
// PLAN 작업 6: 입력창 아래에 공개 자료만 넣으라는 안내 문구를 둔다 (PRD 7번, DESIGN §5.1 구역 4).
// 입력 방식 전환(작업 8)은 이후 작업에서 이 컴포넌트에 추가한다.

import { useState } from "react";
import { FIELDS, MAX_TEXT_LENGTH, type AnalyzeRequest, type Field } from "@/lib/types";

interface Props {
  /** 입력을 모아 분석을 요청한다 */
  onSubmit: (request: AnalyzeRequest) => void;
}

export default function AnalyzeForm({ onSubmit }: Props) {
  const [text, setText] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [field, setField] = useState<Field>(FIELDS[0]);
  const [customField, setCustomField] = useState("");

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        // 입력 방식 전환(작업 8) 전까지는 원문 붙여넣기 방식만 있다
        onSubmit({
          mode: "text",
          text,
          sourceLabel,
          field,
          customField: field === "직접 입력" ? customField : undefined,
        });
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
          aria-describedby="public-data-notice"
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
