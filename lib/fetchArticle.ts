// Design Ref: §2.2 단계 5, §7 보안 — 서버에서 링크 1개의 본문 글자를 가져온다.
// PLAN 작업 9: 새 라이브러리 없이 HTML 태그를 걷어 내고 글자만 뽑는다.
// 보안: http·https만, 내부망 주소 차단(리다이렉트마다 다시 확인), 시간·크기 제한을 둔다.

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { MAX_TEXT_LENGTH, MIN_TEXT_LENGTH, type ErrorCode } from "./types";

/** 링크 하나를 가져오는 데 기다리는 최대 시간 */
const FETCH_TIMEOUT_MS = 10_000;
/** 받아 올 최대 크기 (이보다 큰 페이지는 앞부분만 읽는다) */
const MAX_BYTES = 2_000_000;
/** 리다이렉트를 따라가는 최대 횟수 */
const MAX_REDIRECTS = 3;

export type FetchArticleResult =
  | { ok: true; text: string; title?: string; finalUrl: string; truncated: boolean }
  | { ok: false; code: ErrorCode };

export async function fetchArticle(rawUrl: string): Promise<FetchArticleResult> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return { ok: false, code: "INVALID_URL" };
  }

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if ((url.protocol !== "http:" && url.protocol !== "https:") || !(await isPublicHost(url.hostname))) {
        return { ok: false, code: "INVALID_URL" };
      }

      // 리다이렉트는 직접 따라가며 도착지 주소도 매번 다시 확인한다
      const response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { "User-Agent": "Mozilla/5.0 (K-Global-Research)", Accept: "text/html,text/plain;q=0.9" },
      });

      if (response.status >= 300 && response.status < 400) {
        const next = response.headers.get("location");
        if (!next) return { ok: false, code: "FETCH_FAILED" };
        url = new URL(next, url);
        continue;
      }

      if (!response.ok) return { ok: false, code: "FETCH_FAILED" };

      // PDF·이미지 등은 지원하지 않는다 (PRD 비범위: PDF 업로드)
      const contentType = response.headers.get("content-type") ?? "";
      if (!/text\/html|text\/plain|application\/xhtml/i.test(contentType)) {
        return { ok: false, code: "FETCH_FAILED" };
      }

      const bytes = await readLimited(response, MAX_BYTES);
      const raw = decode(bytes, contentType);
      const isHtml = !/text\/plain/i.test(contentType);
      const title = isHtml ? extractTitle(raw) : undefined;
      let text = isHtml ? htmlToText(raw) : normalizeText(raw);

      // 본문이 너무 짧으면 유료 기사·로그인 페이지 등으로 보고 원문 붙여넣기를 안내한다
      if (text.length < MIN_TEXT_LENGTH) return { ok: false, code: "FETCH_FAILED" };

      const truncated = text.length > MAX_TEXT_LENGTH;
      if (truncated) text = text.slice(0, MAX_TEXT_LENGTH);

      return { ok: true, text, title, finalUrl: url.toString(), truncated };
    }
    return { ok: false, code: "FETCH_FAILED" };
  } catch {
    // 시간 초과, 연결 실패, 주소 조회 실패 등
    return { ok: false, code: "FETCH_FAILED" };
  }
}

/** 이름을 실제 IP로 바꿔 보고, 내부망·자기 자신 주소면 막는다 */
async function isPublicHost(hostname: string): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) return false;

  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  return addresses.length > 0 && addresses.every((address) => !isPrivateAddress(address));
}

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  const v6 = address.toLowerCase();
  // IPv4를 품은 IPv6 주소(::ffff:127.0.0.1 등)는 안쪽 IPv4로 다시 판단한다
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]);
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

/** 정해 둔 크기까지만 읽는다 (아주 큰 페이지로 서버가 멈추지 않게) */
async function readLimited(response: Response, limit: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  await reader.cancel().catch(() => {});
  const out = new Uint8Array(Math.min(total, limit));
  let offset = 0;
  for (const chunk of chunks) {
    const part = chunk.subarray(0, Math.min(chunk.length, out.length - offset));
    out.set(part, offset);
    offset += part.length;
    if (offset >= out.length) break;
  }
  return out;
}

/** 응답 헤더나 <meta>에 적힌 문자 인코딩(utf-8, euc-kr 등)으로 글자를 읽는다 */
function decode(bytes: Uint8Array, contentType: string): string {
  const fromHeader = contentType.match(/charset=([\w-]+)/i)?.[1];
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 2048));
  const fromMeta = head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  for (const label of [fromHeader, fromMeta, "utf-8"]) {
    if (!label) continue;
    try {
      return new TextDecoder(label).decode(bytes);
    } catch {
      // 모르는 인코딩 이름이면 다음 후보로 넘어간다
    }
  }
  return new TextDecoder().decode(bytes);
}

function extractTitle(html: string): string | undefined {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return title ? decodeEntities(title).replace(/\s+/g, " ").trim() || undefined : undefined;
}

/** HTML에서 메뉴·스크립트를 빼고 본문 글자만 남긴다. <article>이나 <main>이 있으면 그 안만 쓴다 */
function htmlToText(html: string): string {
  let body = html.replace(/<!--[\s\S]*?-->/g, "");
  body = body.replace(/<(script|style|noscript|template|svg|iframe|nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, " ");

  const main = body.match(/<article\b[\s\S]*?<\/article>/i)?.[0] ?? body.match(/<main\b[\s\S]*?<\/main>/i)?.[0];
  if (main && main.replace(/<[^>]+>/g, "").trim().length >= MIN_TEXT_LENGTH) body = main;

  body = body
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  return normalizeText(decodeEntities(body));
}

function normalizeText(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}
