// 원문 파일(PDF·엑셀·CSV·TXT)에서 글자만 뽑아 원문 입력칸에 넣는다.
// 파일은 브라우저 안에서만 읽고 서버로 보내지 않는다. 서버에는 뽑은 글자만 지금처럼 원문으로 간다.
// 엑셀(.xlsx)은 압축(zip) 안의 XML이라 브라우저 기본 기능(DecompressionStream·DOMParser)으로 읽고,
// PDF만 pdfjs-dist 라이브러리를 쓴다 (사용자 확인 후 추가).

/** 올릴 수 있는 파일 (input accept 값) */
export const ACCEPTED_FILES = ".pdf,.xlsx,.csv,.txt";

/** 너무 큰 파일은 브라우저가 멈출 수 있어 막는다 */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** 사용자에게 그대로 보여 줄 한국어 오류 */
export class FileReadError extends Error {}

/** 파일 종류에 맞게 글자를 뽑는다. limit 글자를 넘으면 더 읽지 않는다. */
export async function readTextFromFile(file: File, limit: number): Promise<string> {
  if (file.size > MAX_FILE_BYTES) {
    throw new FileReadError("파일이 너무 커요. 20MB 이하 파일만 올릴 수 있어요.");
  }
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  let text: string;
  if (ext === "pdf") text = await readPdf(file, limit);
  else if (ext === "xlsx") text = await readXlsx(file, limit);
  else if (ext === "csv" || ext === "txt") text = decodeText(await file.arrayBuffer());
  else if (ext === "xls") throw new FileReadError("예전 엑셀 형식(.xls)은 읽을 수 없어요. 엑셀에서 .xlsx로 저장한 뒤 올려 주세요.");
  else throw new FileReadError("PDF, 엑셀(.xlsx), CSV, TXT 파일만 올릴 수 있어요.");

  text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) {
    throw new FileReadError(
      ext === "pdf"
        ? "PDF에서 글자를 찾지 못했어요. 스캔한 이미지 PDF일 수 있어요."
        : "파일에서 글자를 찾지 못했어요.",
    );
  }
  return text;
}

/** UTF-8로 읽고, 깨지면 한국어 엑셀이 저장하는 EUC-KR로 다시 읽는다 */
function decodeText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("euc-kr").decode(buffer);
  }
}

// ---------- PDF ----------

async function readPdf(file: File, limit: number): Promise<string> {
  // 필요할 때만 불러와 첫 화면을 무겁게 하지 않는다
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    void task.destroy();
    if (e instanceof Error && e.name === "PasswordException") {
      throw new FileReadError("암호가 걸린 PDF는 읽을 수 없어요.");
    }
    throw new FileReadError("PDF 파일을 열 수 없어요. 파일이 손상되지 않았는지 확인해 주세요.");
  }

  const pages: string[] = [];
  let length = 0;
  try {
    for (let i = 1; i <= doc.numPages && length < limit; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let pageText = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        pageText += item.str + (item.hasEOL ? "\n" : "");
      }
      pages.push(pageText);
      length += pageText.length;
    }
  } finally {
    // 문서를 다 읽으면 PDF를 읽던 작업 스레드(worker)를 닫는다
    await task.destroy();
  }
  return pages.join("\n\n");
}

// ---------- 엑셀(.xlsx) ----------

async function readXlsx(file: File, limit: number): Promise<string> {
  let zip: Map<string, () => Promise<string>>;
  try {
    zip = readZip(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new FileReadError("엑셀 파일을 열 수 없어요. 파일이 손상되지 않았는지 확인해 주세요.");
  }

  const readXml = async (path: string) => {
    const open = zip.get(path);
    return open ? new DOMParser().parseFromString(await open(), "application/xml") : null;
  };

  // 셀에 들어 있는 글자는 대부분 sharedStrings.xml 목록의 번호로만 적혀 있다
  const shared: string[] = [];
  const sharedDoc = await readXml("xl/sharedStrings.xml");
  if (sharedDoc) {
    for (const si of Array.from(sharedDoc.getElementsByTagName("si"))) {
      shared.push(Array.from(si.getElementsByTagName("t")).map((t) => t.textContent ?? "").join(""));
    }
  }

  // 셀 서식(퍼센트·날짜)은 styles.xml에 있다. 숫자 셀은 서식 번호(s)로 이 목록을 가리킨다.
  const formats: NumberKind[] = [];
  const styles = await readXml("xl/styles.xml");
  if (styles) {
    const custom = new Map<string, string>();
    for (const fmt of Array.from(styles.getElementsByTagName("numFmt"))) {
      custom.set(fmt.getAttribute("numFmtId") ?? "", fmt.getAttribute("formatCode") ?? "");
    }
    const cellXfs = styles.getElementsByTagName("cellXfs")[0];
    for (const xf of cellXfs ? Array.from(cellXfs.getElementsByTagName("xf")) : []) {
      formats.push(numberKind(xf.getAttribute("numFmtId") ?? "0", custom));
    }
  }

  // 시트 이름과 파일 위치는 workbook.xml과 그 연결 정보(rels)에 있다
  const workbook = await readXml("xl/workbook.xml");
  const rels = await readXml("xl/_rels/workbook.xml.rels");
  if (!workbook || !rels) throw new FileReadError("엑셀 파일을 열 수 없어요. 파일이 손상되지 않았는지 확인해 주세요.");
  const targets = new Map<string, string>();
  for (const rel of Array.from(rels.getElementsByTagName("Relationship"))) {
    const target = rel.getAttribute("Target") ?? "";
    targets.set(rel.getAttribute("Id") ?? "", target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  }

  const parts: string[] = [];
  let length = 0;
  for (const sheet of Array.from(workbook.getElementsByTagName("sheet"))) {
    if (length >= limit) break;
    const relId = sheet.getAttribute("r:id") ?? "";
    const sheetDoc = await readXml(targets.get(relId) ?? "");
    if (!sheetDoc) continue;

    const lines: string[] = [];
    for (const row of Array.from(sheetDoc.getElementsByTagName("row"))) {
      const cells = Array.from(row.getElementsByTagName("c")).map((c) => cellText(c, shared, formats));
      const line = cells.join("\t").trimEnd();
      if (line) lines.push(line);
    }
    if (lines.length) {
      const block = `[${sheet.getAttribute("name") ?? "시트"}]\n${lines.join("\n")}`;
      parts.push(block);
      length += block.length;
    }
  }
  return parts.join("\n\n");
}

type NumberKind = "plain" | "percent" | "date";

/** 서식 번호를 보고 숫자를 퍼센트·날짜·일반 중 무엇으로 보여 줄지 정한다 (9·10번은 엑셀 기본 퍼센트, 14~22번은 기본 날짜) */
function numberKind(id: string, custom: Map<string, string>): NumberKind {
  const n = Number(id);
  if (n === 9 || n === 10) return "percent";
  if ((n >= 14 && n <= 22) || (n >= 45 && n <= 47)) return "date";
  // 직접 만든 서식: 따옴표·대괄호 안 글자는 빼고 기호만 본다
  const code = (custom.get(id) ?? "").replace(/"[^"]*"|\[[^\]]*\]|\\./g, "");
  if (code.includes("%")) return "percent";
  if (/[ymd]/i.test(code)) return "date";
  return "plain";
}

/** 엑셀이 저장한 숫자(예: 0.029000000000000001)를 사람이 보는 모양(2.9%)으로 바꾼다 */
function formatNumber(value: string, kind: NumberKind): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  // 컴퓨터 소수 계산의 끝자리 오차를 없앤다
  const tidy = (x: number) => String(Number(x.toPrecision(12)));
  if (kind === "percent") return `${tidy(n * 100)}%`;
  if (kind === "date") {
    // 엑셀 날짜는 1899-12-30부터 센 날 수
    const date = new Date(Math.round((n - 25569) * 86400000));
    return date.toISOString().slice(0, 10);
  }
  return tidy(n);
}

/** 셀 하나의 글자. t="s"는 공유 목록 번호, inlineStr은 셀 안 글자, 숫자는 서식에 맞춰 바꾼다 */
function cellText(cell: Element, shared: string[], formats: NumberKind[]): string {
  const type = cell.getAttribute("t");
  if (type === "inlineStr") {
    return Array.from(cell.getElementsByTagName("t")).map((t) => t.textContent ?? "").join("");
  }
  const value = cell.getElementsByTagName("v")[0]?.textContent ?? "";
  if (type === "s") return shared[Number(value)] ?? "";
  if (type === "b") return value === "1" ? "TRUE" : "FALSE";
  if (type === "str" || type === "e" || !value) return value;
  return formatNumber(value, formats[Number(cell.getAttribute("s") ?? "0")] ?? "plain");
}

/** zip 파일의 목차(중앙 디렉터리)를 읽어 "경로 → 내용을 푸는 함수"로 돌려준다 */
function readZip(bytes: Uint8Array): Map<string, () => Promise<string>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // 목차 끝 표시(0x06054b50)는 파일 맨 뒤 근처에 있다
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("zip 아님");

  const count = view.getUint16(end + 10, true);
  let pos = view.getUint32(end + 16, true);
  const entries = new Map<string, () => Promise<string>>();
  const utf8 = new TextDecoder();

  for (let n = 0; n < count; n++) {
    if (view.getUint32(pos, true) !== 0x02014b50) throw new Error("목차 손상");
    const method = view.getUint16(pos + 10, true);
    const size = view.getUint32(pos + 20, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const local = view.getUint32(pos + 42, true);
    const name = utf8.decode(bytes.subarray(pos + 46, pos + 46 + nameLen));
    pos += 46 + nameLen + extraLen + commentLen;

    entries.set(name, async () => {
      // 실제 내용은 각 파일 앞머리(로컬 헤더) 바로 뒤에 있다
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const data = bytes.slice(start, start + size);
      if (method === 0) return utf8.decode(data);
      if (method !== 8) throw new Error("지원하지 않는 압축");
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new Response(stream).text();
    });
  }
  return entries;
}
