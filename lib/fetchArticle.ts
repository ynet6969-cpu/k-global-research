// Design Ref: §2.2 단계 5, §7 보안 — 서버에서 링크 1개의 본문 글자를 가져온다.
// PLAN 작업 9: 새 라이브러리 없이 HTML 태그를 걷어 내고 글자만 뽑는다.
// 보안: http·https만, 내부망 주소 차단(리다이렉트마다 다시 확인), 시간·크기 제한을 둔다.
// Gap 1·2 수정: 내부망 검사를 "실제로 접속하는 순간"의 IP에 한다 (주소 확인과 접속 사이에 IP가 바뀌는 DNS 리바인딩 차단).
//   IP 판정은 Node 기본 BlockList로 한다 (::ffff:7f00:1 같은 16진 표기, NAT64 주소도 막힘).

import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";
import { MAX_TEXT_LENGTH, MIN_TEXT_LENGTH, type ErrorCode } from "./types";

/** 링크 하나를 가져오는 데 기다리는 최대 시간 (주소 조회·리다이렉트까지 모두 포함) */
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

  // 리다이렉트를 몇 번 거치든 전체를 합쳐 10초 안에 끝낸다
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if ((url.protocol !== "http:" && url.protocol !== "https:") || isBlockedHostLiteral(url.hostname)) {
        return { ok: false, code: "INVALID_URL" };
      }

      // 리다이렉트는 직접 따라가며 도착지 주소도 매번 다시 확인한다
      const response = await getOnce(url, signal);

      if (response.status >= 300 && response.status < 400) {
        if (!response.location) return { ok: false, code: "FETCH_FAILED" };
        url = new URL(response.location, url);
        continue;
      }

      if (response.status < 200 || response.status >= 300) return { ok: false, code: "FETCH_FAILED" };

      // PDF·이미지 등은 지원하지 않는다 (PRD 비범위: PDF 업로드)
      const contentType = response.contentType;
      if (!/text\/html|text\/plain|application\/xhtml/i.test(contentType)) {
        return { ok: false, code: "FETCH_FAILED" };
      }

      const raw = decode(response.body, contentType);
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
  } catch (error) {
    // 접속 순간 내부망 주소로 확인된 경우는 링크 문제(400), 그 밖의 시간 초과·연결 실패는 가져오기 실패(502)
    return { ok: false, code: error instanceof BlockedAddressError ? "INVALID_URL" : "FETCH_FAILED" };
  }
}

// ───────────── 내부망 주소 차단 ─────────────

/** 인터넷에서 접속하면 안 되는 주소 범위 (사설망, 자기 자신, 클라우드 메타데이터, 문서용·특수 용도 주소) */
const BLOCKED = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) {
  BLOCKED.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 96], // ::, ::1, IPv4 호환 주소(::a.b.c.d)
  ["64:ff9b::", 96], ["64:ff9b:1::", 48], // NAT64 (안쪽 IPv4로 내부망에 닿을 수 있음)
  ["100::", 64], ["2001:db8::", 32], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
] as const) {
  BLOCKED.addSubnet(network, prefix, "ipv6");
}

/** 내부망 주소인지. ::ffff:7f00:1처럼 IPv4를 품은 IPv6 표기도 안쪽 IPv4 기준으로 판단한다 */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return BLOCKED.check(address, "ipv4");
  if (family === 6) return BLOCKED.check(address, "ipv6");
  return true; // IP 형식이 아니면 막는다
}

/** 주소창에 IP나 localhost를 직접 적은 경우. 이름(도메인)은 접속하는 순간 safeLookup이 확인한다 */
function isBlockedHostLiteral(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  return isIP(host) !== 0 && isBlockedAddress(host);
}

class BlockedAddressError extends Error {}

/**
 * 접속에 쓸 IP를 찾는 함수를 바꿔 끼운다. 조회된 IP 중 하나라도 내부망이면 접속하지 않는다.
 * 확인한 IP로 바로 접속하므로, 확인과 접속 사이에 IP가 바뀔 틈이 없다.
 */
const safeLookup = ((
  hostname: string,
  options: { all?: boolean },
  callback: (error: Error | null, address: string | LookupAddress[], family?: number) => void,
) => {
  dnsLookup(hostname, { all: true }, (error, addresses) => {
    if (error) return callback(error, "");
    if (addresses.length === 0 || addresses.some((a) => isBlockedAddress(a.address))) {
      return callback(new BlockedAddressError("내부망 주소"), "");
    }
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
}) as unknown as http.RequestOptions["lookup"];

// ───────────── 한 번 요청하기 ─────────────

interface RawResponse {
  status: number;
  location?: string;
  contentType: string;
  body: Uint8Array;
}

/** 리다이렉트를 따라가지 않고 한 번만 요청한다. 본문은 정해 둔 크기까지만 읽는다 */
function getOnce(url: URL, signal: AbortSignal): Promise<RawResponse> {
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.get(
      url,
      {
        signal,
        lookup: safeLookup,
        headers: {
          "User-Agent": "Mozilla/5.0 (K-Global-Research)",
          Accept: "text/html,text/plain;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const contentType = String(response.headers["content-type"] ?? "");
        const location = response.headers.location;
        // 리다이렉트·오류·지원하지 않는 형식이면 본문은 읽지 않는다
        if (status < 200 || status >= 300 || !/text\/html|text\/plain|application\/xhtml/i.test(contentType)) {
          response.resume();
          return resolve({ status, location, contentType, body: new Uint8Array() });
        }

        const chunks: Buffer[] = [];
        let total = 0;
        response.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
          total += chunk.length;
          // 아주 큰 페이지로 서버가 멈추지 않게 정해 둔 크기에서 끊는다
          if (total >= MAX_BYTES) response.destroy();
        });
        let finished = false;
        const finish = () => {
          // "end"와 "close"가 둘 다 오므로 한 번만 처리한다
          if (finished) return;
          finished = true;
          try {
            const body = decompress(Buffer.concat(chunks).subarray(0, MAX_BYTES), String(response.headers["content-encoding"] ?? ""));
            resolve({ status, location, contentType, body });
          } catch (error) {
            reject(error);
          }
        };
        response.on("end", finish);
        response.on("close", finish);
        response.on("error", reject);
      },
    );
    request.on("error", reject);
  });
}

/** 압축된 응답을 푼다. 풀린 크기도 정해 둔 한도를 넘지 않게 한다 */
function decompress(body: Buffer, encoding: string): Uint8Array {
  const limit = { maxOutputLength: MAX_BYTES * 5 };
  try {
    if (/gzip/i.test(encoding)) return gunzipSync(body, limit);
    if (/br/i.test(encoding)) return brotliDecompressSync(body, limit);
    if (/deflate/i.test(encoding)) return inflateSync(body, limit);
  } catch {
    // 크기 한도에서 잘려 끝까지 못 푼 경우 등: 본문 없음으로 보고 "가져오기 실패"로 처리된다
    return new Uint8Array();
  }
  return body;
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

/** HTML 태그 하나. 속성 값 안의 ">"(예: data-x='{"a":">"}')에서 태그가 끝난 것으로 잘못 보지 않게 따옴표를 건너뛴다 */
const TAG = /<(?:[^>"']|"[^"]*"|'[^']*')*>/g;

/** HTML에서 메뉴·스크립트를 빼고 본문 글자만 남긴다. <article>이나 <main>이 있으면 그 안만 쓴다 */
function htmlToText(html: string): string {
  let body = html.replace(/<!--[\s\S]*?-->/g, "");
  body = body.replace(/<(script|style|noscript|template|svg|iframe|nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, " ");

  const main = body.match(/<article\b[\s\S]*?<\/article>/i)?.[0] ?? body.match(/<main\b[\s\S]*?<\/main>/i)?.[0];
  if (main && main.replace(TAG, "").trim().length >= MIN_TEXT_LENGTH) body = main;

  body = body
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote|section|article)>/gi, "\n")
    .replace(TAG, " ");

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
  const named: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", hellip: "…",
    middot: "·", bull: "•", copy: "©", reg: "®", trade: "™", euro: "€", pound: "£", yen: "¥", deg: "°", times: "×",
  };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}
