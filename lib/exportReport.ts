// 분석 결과를 Word(.docx)·PowerPoint(.pptx) 파일로 만들어 내려받게 한다 (lib/report.ts의 문서 구조 사용).
// 파일은 브라우저 안에서만 만들고 서버로 보내지 않는다. 라이브러리는 버튼을 눌렀을 때만 불러와 첫 화면을 가볍게 둔다.

import type { ReportBlock, ReportDoc } from "./report";

const FONT = "맑은 고딕";
const BLUE = "1E3A8A";
const LIGHT_BLUE = "EFF6FF";
const GRAY = "52525B";

/** 영향 판정 배지 색 (화면과 같은 구분: 긍정 초록 / 부정 빨강 / 중립 회색 / 판단 보류 주황) */
const VERDICT_COLOR: Record<string, { fill: string; text: string }> = {
  긍정: { fill: "DCFCE7", text: "14532D" },
  부정: { fill: "FEE2E2", text: "7F1D1D" },
  중립: { fill: "E4E4E7", text: "18181B" },
  "판단 보류": { fill: "FEF3C7", text: "78350F" },
};
const verdictColor = (badge: string) => VERDICT_COLOR[badge] ?? VERDICT_COLOR["중립"];

/** 만든 파일을 내려받게 한다 */
function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 내려받기가 시작될 시간을 준 뒤 주소를 풀어 준다
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ───────────── Word ─────────────

export async function saveAsWord(doc: ReportDoc): Promise<void> {
  const {
    AlignmentType,
    BorderStyle,
    Document,
    Footer,
    HeadingLevel,
    PageNumber,
    Packer,
    Paragraph,
    ShadingType,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
  } = await import("docx");

  const run = (text: string, opts: { bold?: boolean; italics?: boolean; size?: number; color?: string } = {}) =>
    new TextRun({ text, font: FONT, size: opts.size ?? 22, bold: opts.bold, italics: opts.italics, color: opts.color });

  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [
    new Paragraph({ spacing: { after: 80 }, children: [run(doc.title, { bold: true, size: 40, color: BLUE })] }),
    new Paragraph({ spacing: { after: 320 }, children: [run(doc.subtitle, { size: 20, color: GRAY })] }),
  ];

  for (const block of doc.blocks) {
    // 소제목은 다음 내용과 같은 쪽에 붙어 있게 한다 (제목만 쪽 끝에 남지 않도록)
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        keepNext: true,
        spacing: { before: 280, after: 120 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BLUE, space: 4 } },
        children: [run(block.heading, { bold: true, size: 28, color: BLUE })],
      }),
    );

    if (block.badge) {
      const c = verdictColor(block.badge);
      children.push(
        new Paragraph({
          keepNext: true,
          spacing: { after: 120 },
          children: [
            new TextRun({
              text: ` ${block.badge} `,
              font: FONT,
              size: 24,
              bold: true,
              color: c.text,
              shading: { type: ShadingType.CLEAR, fill: c.fill, color: "auto" },
            }),
          ],
        }),
      );
    }

    if (block.table) {
      const weights = block.table.widths ?? block.table.head.map((_, i) => (i === 0 ? 1 : 2));
      const total = weights.reduce((a, b) => a + b, 0);
      const content = 9026; // A4에서 좌우 여백 1인치를 뺀 폭(DXA)
      const widths = weights.map((w) => Math.round((content * w) / total));
      const cell = (text: string, i: number, head: boolean) =>
        new TableCell({
          width: { size: widths[i], type: WidthType.DXA },
          shading: head ? { type: ShadingType.CLEAR, fill: BLUE, color: "auto" } : undefined,
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: [new Paragraph({ children: [run(text, { bold: head, size: 20, color: head ? "FFFFFF" : undefined })] })],
        });
      children.push(
        new Table({
          width: { size: content, type: WidthType.DXA },
          columnWidths: widths,
          rows: [
            new TableRow({ tableHeader: true, cantSplit: true, children: block.table.head.map((t, i) => cell(t, i, true)) }),
            ...block.table.rows.map(
              (row) => new TableRow({ cantSplit: true, children: row.map((t, i) => cell(t, i, false)) }),
            ),
          ],
        }),
      );
    }

    (block.numbered ?? []).forEach((line, i) =>
      children.push(
        new Paragraph({
          spacing: { after: 100, line: 320 },
          indent: { left: 360, hanging: 360 },
          children: [run(`${i + 1}. ${line}`)],
        }),
      ),
    );

    if (block.quotes?.length) {
      children.push(
        new Paragraph({ keepNext: true, spacing: { before: 80, after: 60 }, children: [run("근거 (원문 인용)", { bold: true, size: 20, color: GRAY })] }),
      );
      for (const quote of block.quotes) {
        children.push(
          new Paragraph({
            spacing: { after: 80, line: 300 },
            indent: { left: 240 },
            shading: { type: ShadingType.CLEAR, fill: "F4F4F5", color: "auto" },
            border: { left: { style: BorderStyle.SINGLE, size: 18, color: "93C5FD", space: 8 } },
            children: [run(`“${quote}”`, { italics: true, size: 21 })],
          }),
        );
      }
    }

    if (block.paragraphs?.length) {
      if (block.quotes?.length) {
        children.push(
          new Paragraph({ keepNext: true, spacing: { before: 120, after: 60 }, children: [run("해설", { bold: true, size: 20, color: GRAY })] }),
        );
      }
      for (const p of block.paragraphs) {
        children.push(new Paragraph({ spacing: { after: 100, line: 320 }, children: [run(p)] }));
      }
    }
  }

  const document = new Document({
    title: doc.title,
    creator: "K-글로벌 금융리서치",
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1440, right: 1440 } } },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: GRAY })],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  download(await Packer.toBlob(document), `${doc.fileBase}.docx`);
}

// ───────────── PowerPoint ─────────────

/** 화면 한 장에 들어갈 만큼 줄 수를 나눈다. 슬라이드 하나가 넘치지 않게 구역을 쪼갠다 */
function slidePlan(block: ReportBlock): { title: string; part: ReportBlock }[] {
  // 표는 한 장에 들어갈 만큼만 담고 나머지 줄은 다음 장으로 넘긴다 (내용이 긴 상세 분석 표 대비)
  if (block.table) {
    const { head, rows, widths } = block.table;
    const pages: string[][][] = [[]];
    let used = 0;
    for (const row of rows) {
      const cost = Math.max(1, ...row.map((cell, i) => Math.ceil(cell.length / (i === 0 ? 8 : 70))));
      if (used + cost > 12 && pages[pages.length - 1].length) {
        pages.push([]);
        used = 0;
      }
      pages[pages.length - 1].push(row);
      used += cost;
    }
    return pages.map((chunk, i) => ({
      title: pages.length > 1 ? `${block.heading} (${i + 1}/${pages.length})` : block.heading,
      part: { ...block, table: { head, rows: chunk, widths } },
    }));
  }
  const hasLong = block.quotes?.length && block.paragraphs?.length;
  if (!hasLong) return [{ title: block.heading, part: block }];
  // 영향 분석처럼 인용과 해설이 함께 있으면 두 장으로 나눈다
  return [
    { title: block.heading, part: { ...block, paragraphs: undefined } },
    { title: `${block.heading} — 해설`, part: { heading: block.heading, paragraphs: block.paragraphs } },
  ];
}

export async function saveAsPowerPoint(doc: ReportDoc): Promise<void> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 인치 (16:9)
  pres.title = doc.title;
  pres.author = "K-글로벌 금융리서치";

  // 글자마다 lang을 한국어로 둬야 PowerPoint가 글자 단위가 아니라 단어 단위로 줄을 바꾼다
  const text = { fontFace: FONT, lang: "ko-KR" };

  // 표지
  const cover = pres.addSlide();
  cover.background = { color: BLUE };
  cover.addText(doc.title, { ...text, x: 0.8, y: 2.4, w: 11.7, h: 1.4, fontSize: 36, bold: true, color: "FFFFFF", valign: "bottom" });
  cover.addText(doc.subtitle, { ...text, x: 0.8, y: 3.95, w: 11.7, h: 0.6, fontSize: 18, color: "BFDBFE" });

  let pageNo = 1;
  for (const block of doc.blocks) {
    for (const { title, part } of slidePlan(block)) {
      pageNo++;
      const slide = pres.addSlide();
      slide.background = { color: "FFFFFF" };
      slide.addShape("rect", { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: BLUE }, line: { color: BLUE } });
      slide.addText(title, { ...text, x: 0.6, y: 0.35, w: 12.1, h: 0.8, fontSize: 28, bold: true, color: BLUE });

      let y = 1.35;

      if (part.badge) {
        const c = verdictColor(part.badge);
        slide.addText(part.badge, {
          ...text, x: 0.6, y, w: 2.2, h: 0.5, fontSize: 18, bold: true, align: "center", color: c.text, fill: { color: c.fill },
        });
        y += 0.8;
      }

      if (part.table) {
        const head = part.table.head.map((t) => ({
          text: t, options: { ...text, bold: true, color: "FFFFFF", fill: { color: BLUE }, fontSize: 14 },
        }));
        const rows = part.table.rows.map((r) => r.map((t) => ({ text: t, options: { ...text, fontSize: 14 } })));
        slide.addTable([head, ...rows], {
          x: 0.6, y, w: 12.1, border: { type: "solid", pt: 0.75, color: "D4D4D8" }, colW: columnWidths(part.table.head.length, part.table.widths),
          valign: "middle", margin: 0.08,
        });
      }

      if (part.numbered) {
        const size = part.numbered.length > 4 ? 18 : 20;
        slide.addText(
          part.numbered.map((line, i) => ({
            text: `${i + 1}. ${line}`,
            options: { ...text, fontSize: size, breakLine: true, paraSpaceAfter: 12 },
          })),
          { x: 0.6, y, w: 12.1, h: 5.4, valign: "top", color: "18181B" },
        );
      }

      if (part.quotes?.length) {
        slide.addText("근거 (원문 인용)", { ...text, x: 0.6, y, w: 12.1, h: 0.4, fontSize: 14, bold: true, color: GRAY });
        const size = part.quotes.some((q) => q.length > 150) ? 13 : 15;
        slide.addText(
          part.quotes.map((q) => ({
            text: `“${q}”`,
            options: { ...text, fontSize: size, italic: true, breakLine: true, paraSpaceAfter: 10 },
          })),
          {
            x: 0.6, y: y + 0.5, w: 12.1, h: boxHeight(part.quotes.map((q) => `“${q}”`), size, 11.8, 7.5 - (y + 0.5) - 0.7),
            valign: "top", color: "18181B", fill: { color: "F4F4F5" }, margin: 0.15,
          },
        );
      }

      if (part.paragraphs?.length) {
        const length = part.paragraphs.join("").length;
        const size = length > 500 ? 16 : 18;
        slide.addText(
          part.paragraphs.map((p) => ({ text: p, options: { ...text, fontSize: size, breakLine: true, paraSpaceAfter: 10 } })),
          {
            x: 0.6, y, w: 12.1, h: boxHeight(part.paragraphs, size, 11.7, 7.5 - y - 0.7),
            valign: "top", color: "18181B", fill: { color: LIGHT_BLUE }, margin: 0.2,
          },
        );
      }

      slide.addText(`${pageNo}`, { ...text, x: 12.2, y: 7.0, w: 0.8, h: 0.3, fontSize: 11, color: GRAY, align: "right" });
    }
  }

  await pres.writeFile({ fileName: `${doc.fileBase}.pptx` });
}

/**
 * 글 상자 높이(인치)를 글 길이로 어림한다. 상자가 글보다 훨씬 커 보이지 않게 하려는 것이다.
 * 한글은 글자 폭이 글자 크기와 같고, 영문·숫자는 절반쯤으로 본다. 어림값이라 넉넉하게(+20%) 잡는다.
 */
function boxHeight(texts: string[], fontSize: number, widthIn: number, maxIn: number): number {
  const lineEm = (widthIn * 72) / fontSize;
  let lines = 0;
  for (const t of texts) {
    let em = 0;
    for (const ch of t) em += /[가-힣ㄱ-ㅎ]/.test(ch) ? 1 : 0.55;
    lines += Math.max(1, Math.ceil(em / lineEm));
  }
  const inches = (lines * fontSize * 1.4 + texts.length * 12) / 72;
  return Math.min(maxIn, inches * 1.2 + 0.4);
}

/** 표 열 폭(합이 12.1인치): 첫 열은 좁게, 나머지는 같게 */
function columnWidths(count: number, given?: number[]): number[] {
  const total = 12.1;
  const weights = given ?? Array.from({ length: count }, (_, i) => (i === 0 ? 1 : 2));
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => (total * w) / sum);
}
