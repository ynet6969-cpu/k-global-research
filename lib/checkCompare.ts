// 종합비교: AI 답을 서버가 자료와 대조해 규칙에 맞게 바로잡는다 (CLAUDE.md: AI 규칙은 서버 검사로도 막는다).
//   - 지표표: 자료 번호가 맞고, 수치·변화의 숫자가 "그 자료"에 있는 것만 남긴다
//   - 비교 문장: 한국어·60자·원문에 있는 숫자만 (단건 요약과 같은 기준, 숫자는 모든 자료에서 찾는다)
//   - 영향: 근거 인용은 어느 자료에든 그대로 있어야 하고, 한국 영향은 [추정], 투자 권유는 제거 (checkImpact 재사용)

import type { CompareIndicator, CompareLine, CompareSection, Impact } from "./types";
import type { AiComparison } from "./prompts";
import {
  checkImpact,
  cleanProse,
  hasFigure,
  isKorean,
  normalizeUnits,
  numbersIn,
  numbersInSource,
  shortenAtWord,
} from "./checkRules";

const MAX_LINE_LENGTH = 90;
const MAX_COMPARISON_LINES = 8;
const MAX_INDICATORS_PER_MATERIAL = 3;
const MAX_SECTIONS = 6;
const MAX_SECTION_TITLE = 20;
const MAX_SECTION_BODY = 800;
const MAX_NAME_LENGTH = 20;
const MAX_VALUE_LENGTH = 30;

export interface CheckedComparison {
  indicators: CompareIndicator[];
  comparison: CompareLine[];
  sections: CompareSection[];
  impact: Impact;
  warnings: string[];
}

/** 지표가 2개 미만이거나 비교 문장이 하나도 남지 않으면 null (결과를 보여 주지 않는다) */
export function checkComparison(ai: AiComparison, texts: string[]): CheckedComparison | null {
  const warnings: string[] = [];
  const perMaterial = texts.map((t) => numbersInSource(t));
  const allNumbers = numbersInSource(texts.join("\n"));

  const indicators = checkIndicators(ai.indicators, perMaterial, warnings);
  const comparison = checkLines(ai.comparison, texts.length, allNumbers, warnings);
  if (indicators.length < 2 || comparison.length === 0) return null;

  // 상세 분석은 없어도 결과를 보여 준다 (지표·비교·영향이 핵심이고, 상세는 덧붙이는 내용)
  const sections = checkSections(ai.sections, texts.join("\n\n"), allNumbers, warnings);
  const impact = checkImpact(ai, texts.join("\n\n"), warnings);
  return { indicators, comparison, sections, impact, warnings };
}

/** 상세 분석 토막: 문장마다 투자 권유·자료에 없는 숫자를 걸러내고, 한국 영향 추측에는 [추정]을 붙인다 */
function checkSections(
  rows: AiComparison["sections"],
  sourceText: string,
  allNumbers: Set<string>,
  warnings: string[],
): CompareSection[] {
  const kept: CompareSection[] = [];
  let marked = 0;
  let invented = 0;
  for (const row of rows) {
    const title = row.title.trim().slice(0, MAX_SECTION_TITLE);
    const cleaned = cleanProse(row.body.trim().slice(0, MAX_SECTION_BODY), sourceText, allNumbers);
    marked += cleaned.marked;
    invented += cleaned.invented;
    // 제목이 없거나, 검사 뒤 한국어 글이 남지 않으면 토막째 뺀다
    if (!title || !isKorean(cleaned.text)) continue;
    kept.push({ title, body: cleaned.text });
  }
  if (invented) warnings.push(`자료에서 확인되지 않는 숫자가 들어간 상세 분석 문장 ${invented}개를 뺐습니다.`);
  if (marked) warnings.push(`자료에 없는 한국 영향 문장 ${marked}개에 "[추정]"을 붙였습니다.`);
  if (kept.length > MAX_SECTIONS) kept.length = MAX_SECTIONS;
  return kept;
}

function checkIndicators(
  rows: AiComparison["indicators"],
  perMaterial: Set<string>[],
  warnings: string[],
): CompareIndicator[] {
  const kept: CompareIndicator[] = [];
  const counts = new Map<number, number>();
  let invented = 0;
  let invalid = 0;

  for (const row of rows) {
    const material = row.material;
    const name = row.name.trim().slice(0, MAX_NAME_LENGTH);
    const value = normalizeUnits(row.value.trim());
    const change = normalizeUnits(row.change.trim());

    // 없는 자료 번호이거나 이름·수치가 비어 있으면 뺀다
    if (!Number.isInteger(material) || material < 1 || material > perMaterial.length || !name || !value) {
      invalid++;
      continue;
    }
    // 수치·변화의 숫자는 그 지표가 나온 자료에 있어야 한다 (다른 자료의 숫자를 가져다 쓰지 못하게)
    const known = perMaterial[material - 1];
    if ([...numbersIn(value), ...numbersIn(change)].some((n) => !known.has(n))) {
      invented++;
      continue;
    }
    const used = counts.get(material) ?? 0;
    if (used >= MAX_INDICATORS_PER_MATERIAL) continue;
    counts.set(material, used + 1);
    kept.push({ material, name, value: value.slice(0, MAX_VALUE_LENGTH), change: change.slice(0, MAX_VALUE_LENGTH) });
  }

  if (invalid) warnings.push(`자료 번호나 내용이 올바르지 않은 지표 ${invalid}개를 뺐습니다.`);
  if (invented) warnings.push(`자료에서 확인되지 않는 숫자가 들어간 지표 ${invented}개를 뺐습니다.`);
  return kept.sort((a, b) => a.material - b.material);
}

function checkLines(
  lines: AiComparison["comparison"],
  materialCount: number,
  allNumbers: Set<string>,
  warnings: string[],
): CompareLine[] {
  const kept: CompareLine[] = [];
  let notKorean = 0;
  let invented = 0;
  let trimmed = 0;

  for (const line of lines) {
    let text = normalizeUnits(line.text.trim());
    if (!text) continue;
    if (!isKorean(text)) {
      notKorean++;
      continue;
    }
    if (text.length > MAX_LINE_LENGTH) {
      text = shortenAtWord(text, MAX_LINE_LENGTH);
      trimmed++;
    }
    if (numbersIn(text).some((n) => !allNumbers.has(n))) {
      invented++;
      continue;
    }
    // 근거 자료 번호는 실제 있는 번호만, 중복 없이 남긴다
    const materials = [...new Set(line.materials.filter((n) => Number.isInteger(n) && n >= 1 && n <= materialCount))].sort(
      (a, b) => a - b,
    );
    kept.push({ text, hasNumber: hasFigure(text), materials });
  }

  if (notKorean) warnings.push(`한국어로 옮겨지지 않은 비교 문장 ${notKorean}줄을 뺐습니다.`);
  if (invented) warnings.push(`자료에서 확인되지 않는 숫자가 들어간 비교 문장 ${invented}줄을 뺐습니다.`);
  if (trimmed) warnings.push(`${MAX_LINE_LENGTH}자를 넘는 비교 문장 ${trimmed}줄을 줄였습니다.`);
  if (kept.length > MAX_COMPARISON_LINES) {
    warnings.push(`비교 문장이 ${MAX_COMPARISON_LINES}줄을 넘어 앞의 ${MAX_COMPARISON_LINES}줄만 남겼습니다.`);
    kept.length = MAX_COMPARISON_LINES;
  }
  return kept;
}
