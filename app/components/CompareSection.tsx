"use client";

// 종합비교 화면: 금리·환율·경제성장률 같은 자료를 2~3개 넣고 한 번에 견주어 분석한다.
// 자료마다 분야·원문(붙여넣기 또는 파일)·출처를 받고, /api/compare를 불러 결과를 보여 준다.
// 파일은 브라우저에서 글자만 뽑는다 (lib/readFile.ts). 파일 자체는 서버로 보내지 않는다.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ERROR_MESSAGES,
  FIELDS,
  MAX_COMPARE_ITEMS,
  MAX_COMPARE_TEXT_LENGTH,
  MAX_CUSTOM_FIELD_LENGTH,
  MAX_SOURCE_LABEL_LENGTH,
  MIN_COMPARE_ITEMS,
  MIN_TEXT_LENGTH,
  type AnalyzeError,
  type CompareRequest,
  type CompareResult,
  type ErrorCode,
  type Field,
} from "@/lib/types";
import { ACCEPTED_FILES, FileReadError, readTextFromFile } from "@/lib/readFile";
import CompareResultView from "./CompareResultView";

const CLIENT_TIMEOUT_MS = 95_000;
const RETRYABLE: ErrorCode[] = ["AI_FAILED"];

/** 새 자료칸의 분야를 순서대로 금리 → 환율 → 경제성장률로 미리 골라 둔다 */
const DEFAULT_FIELDS: Field[] = ["금리", "환율", "경제성장률"];

const subscribeNothing = () => () => {};

interface Item {
  /** 목록에서 칸을 구분하는 번호 (칸을 지워도 바뀌지 않는다) */
  id: number;
  field: Field;
  customField: string;
  text: string;
  sourceLabel: string;
  /** 파일 이름으로 자동 입력한 출처 값 (사용자가 직접 고쳤는지 구분하려고 기억해 둔다) */
  autoSource: string;
  fileStatus: { kind: "loading" | "ok" | "error"; message: string } | null;
}

const newItem = (id: number, index: number): Item => ({
  id,
  field: DEFAULT_FIELDS[index] ?? FIELDS[0],
  customField: "",
  text: "",
  sourceLabel: "",
  autoSource: "",
  fileStatus: null,
});

export default function CompareSection() {
  const ready = useSyncExternalStore(subscribeNothing, () => true, () => false);

  const [items, setItems] = useState<Item[]>([newItem(1, 0), newItem(2, 1)]);
  const nextId = useRef(3);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  // 분석이 시작되거나 결과가 나오면 결과 영역이 보이게 옮긴다
  useEffect(() => {
    const area = resultRef.current;
    if (!area || (!loading && !result)) return;
    if (result && !loading) area.focus({ preventScroll: true });
    const top = area.getBoundingClientRect().top;
    if (top >= 0 && top <= window.innerHeight * 0.6) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    area.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    const fallback = window.setTimeout(() => {
      const t = area.getBoundingClientRect().top;
      if (t < 0 || t > window.innerHeight * 0.6) area.scrollIntoView({ behavior: "auto", block: "start" });
    }, 700);
    return () => window.clearTimeout(fallback);
  }, [loading, result]);

  const update = (id: number, patch: Partial<Item>) =>
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  function addItem() {
    if (items.length >= MAX_COMPARE_ITEMS) return;
    setItems((list) => [...list, newItem(nextId.current++, list.length)]);
  }

  function fail(message: string, retryable = false) {
    setResult(null);
    setError({ message, retryable });
  }

  /** 고른 파일에서 글자를 뽑아 그 자료칸의 원문을 채운다. 출처가 비어 있거나 앞 파일 이름이면 새 파일 이름으로 바꾼다 */
  async function loadFile(id: number, file: File) {
    update(id, { fileStatus: { kind: "loading", message: "" } });
    try {
      const extracted = await readTextFromFile(file, MAX_COMPARE_TEXT_LENGTH);
      const cut = extracted.length > MAX_COMPARE_TEXT_LENGTH;
      const name = file.name.slice(0, MAX_SOURCE_LABEL_LENGTH);
      setItems((list) =>
        list.map((it) =>
          it.id !== id
            ? it
            : {
                ...it,
                text: cut ? extracted.slice(0, MAX_COMPARE_TEXT_LENGTH) : extracted,
                sourceLabel: !it.sourceLabel.trim() || it.sourceLabel === it.autoSource ? name : it.sourceLabel,
                autoSource: name,
                fileStatus: {
                  kind: "ok",
                  message: cut
                    ? `「${file.name}」이 길어서 앞 ${MAX_COMPARE_TEXT_LENGTH.toLocaleString()}자만 넣었어요.`
                    : `「${file.name}」에서 글자를 불러왔어요. 내용을 확인한 뒤 분석하세요.`,
                },
              },
        ),
      );
    } catch (e) {
      update(id, {
        fileStatus: {
          kind: "error",
          message: e instanceof FileReadError ? e.message : "파일을 읽지 못했어요. 다른 파일로 다시 시도해 주세요.",
        },
      });
    }
  }

  async function compare() {
    if (loading) return;
    setError(null);

    // 비어 있는 칸은 건너뛰고, 글자가 있는 칸만 비교한다 (서버와 같은 기준: 앞뒤 공백 제외)
    const filled = items.filter((it) => it.text.trim().length > 0);
    if (filled.length < MIN_COMPARE_ITEMS) {
      fail(ERROR_MESSAGES.TOO_FEW_MATERIALS);
      return;
    }
    if (filled.some((it) => it.text.trim().length < MIN_TEXT_LENGTH)) {
      fail(ERROR_MESSAGES.TOO_SHORT);
      return;
    }

    const request: CompareRequest = {
      materials: filled.map((it) => ({
        field: it.field,
        customField: it.field === "직접 입력" ? it.customField : undefined,
        text: it.text,
        sourceLabel: it.sourceLabel,
      })),
    };

    setLoading(true);
    try {
      const response = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
      });
      const data = (await response.json().catch(() => null)) as CompareResult | AnalyzeError | null;
      if (data && "error" in data) {
        fail(data.error.message, RETRYABLE.includes(data.error.code));
      } else if (!response.ok || !data) {
        fail(`비교 요청에 실패했습니다 (오류 ${response.status}). 잠시 후 다시 시도해 주세요.`, true);
      } else {
        setResult(data);
      }
    } catch (e) {
      const timedOut = e instanceof DOMException && e.name === "TimeoutError";
      fail(
        timedOut
          ? "분석 시간이 너무 오래 걸립니다. 자료를 줄이거나 잠시 후 다시 시도해 주세요."
          : "서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.",
        true,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void compare();
        }}
      >
        <p className="rounded-lg bg-zinc-100 p-3 text-sm leading-6 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          금리·환율·경제성장률 같은 자료를 {MIN_COMPARE_ITEMS}~{MAX_COMPARE_ITEMS}개 넣으면, 지표를 나란히 비교하고 한국에 미치는 영향을 종합해 드립니다.
        </p>

        {items.map((it, index) => (
          <MaterialCard
            key={it.id}
            index={index}
            item={it}
            disabled={!ready || loading}
            removable={items.length > MIN_COMPARE_ITEMS}
            onChange={(patch) => update(it.id, patch)}
            onRemove={() => setItems((list) => list.filter((x) => x.id !== it.id))}
            onFile={(file) => void loadFile(it.id, file)}
          />
        ))}

        {items.length < MAX_COMPARE_ITEMS && (
          <button
            type="button"
            onClick={addItem}
            disabled={!ready || loading}
            className="h-11 rounded-lg border border-dashed border-zinc-400 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            + 자료 추가 ({items.length}/{MAX_COMPARE_ITEMS})
          </button>
        )}

        <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm leading-6 text-blue-950 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100">
          <strong className="font-semibold">공개 자료만 입력하세요.</strong> 사내 기밀·유료 리포트·개인정보는 넣지 마세요.
        </p>

        <button
          type="submit"
          disabled={!ready || loading}
          aria-busy={loading}
          className="flex h-12 items-center justify-center gap-2 rounded-lg bg-blue-900 text-base font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-blue-900/60"
        >
          {loading && (
            <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          )}
          {loading ? "비교 중…" : "종합비교 분석하기"}
        </button>
      </form>

      {error && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          <p>{error.message}</p>
          {error.retryable && (
            <button
              type="button"
              onClick={() => void compare()}
              disabled={loading}
              className="h-9 shrink-0 rounded-md border border-red-400 px-4 font-semibold transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-700 dark:hover:bg-red-900"
            >
              다시 시도
            </button>
          )}
        </div>
      )}

      <div ref={resultRef} tabIndex={-1} className="scroll-mt-4 outline-none">
        <CompareResultView result={result} loading={loading} />
      </div>
    </>
  );
}

interface CardProps {
  index: number;
  item: Item;
  disabled: boolean;
  removable: boolean;
  onChange: (patch: Partial<Item>) => void;
  onRemove: () => void;
  onFile: (file: File) => void;
}

/** 자료 한 칸: 분야 선택, 원문(붙여넣기·파일), 출처 */
function MaterialCard({ index, item, disabled, removable, onChange, onRemove, onFile }: CardProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const n = index + 1;
  const loadingFile = item.fileStatus?.kind === "loading";

  const field =
    "rounded-lg border border-zinc-300 bg-white p-3 text-sm focus:border-blue-700 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900";

  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <legend className="px-1 text-sm font-bold text-blue-950 dark:text-blue-100">자료 {n}</legend>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <select
            aria-label={`자료 ${n} 분야`}
            value={item.field}
            onChange={(e) => onChange({ field: e.target.value as Field })}
            className={`${field} sm:w-44`}
          >
            {FIELDS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          {item.field === "직접 입력" && (
            <input
              aria-label={`자료 ${n} 분야 직접 입력`}
              value={item.customField}
              onChange={(e) => onChange({ customField: e.target.value })}
              maxLength={MAX_CUSTOM_FIELD_LENGTH}
              placeholder="예: 반도체 산업"
              className={`${field} flex-1`}
            />
          )}
        </div>

        <input
          ref={fileInput}
          type="file"
          accept={ACCEPTED_FILES}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onFile(file);
          }}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={disabled || loadingFile}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-blue-950 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-blue-100 dark:hover:bg-zinc-800"
          >
            <span aria-hidden>📎</span>
            {loadingFile ? "파일 읽는 중…" : "파일에서 불러오기"}
          </button>
          {removable && (
            <button
              type="button"
              onClick={onRemove}
              disabled={disabled}
              aria-label={`자료 ${n} 지우기`}
              className="h-9 rounded-lg border border-zinc-300 px-3 text-sm text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
            >
              지우기
            </button>
          )}
        </div>
      </div>

      <textarea
        aria-label={`자료 ${n} 원문`}
        value={item.text}
        onChange={(e) => onChange({ text: e.target.value })}
        maxLength={MAX_COMPARE_TEXT_LENGTH}
        rows={6}
        placeholder="해외 금융 기사나 보고서의 원문을 붙여넣으세요."
        className={`${field} w-full resize-y leading-6`}
      />
      <div className="flex items-start justify-between gap-3 text-xs">
        <p role="status" className={item.fileStatus?.kind === "error" ? "text-red-700 dark:text-red-400" : "text-zinc-500"}>
          {item.fileStatus?.kind === "loading" ? "" : (item.fileStatus?.message ?? "")}
        </p>
        <p className="shrink-0 text-zinc-500">
          {item.text.length.toLocaleString()} / {MAX_COMPARE_TEXT_LENGTH.toLocaleString()}자
        </p>
      </div>

      <input
        aria-label={`자료 ${n} 출처`}
        value={item.sourceLabel}
        onChange={(e) => onChange({ sourceLabel: e.target.value })}
        maxLength={MAX_SOURCE_LABEL_LENGTH}
        placeholder="출처 (선택: 기관명 또는 링크)"
        className={field}
      />
    </fieldset>
  );
}
