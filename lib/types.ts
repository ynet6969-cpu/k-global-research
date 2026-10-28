// Design Ref: §3 — 화면과 서버가 함께 쓰는 데이터 모양을 한 파일에 모아 둔다.
// 이 파일에는 타입과 상수만 둔다. AI 호출이나 키 같은 서버 전용 코드는 넣지 않는다.

/** 입력 방식: 원문 붙여넣기 또는 링크 1개 */
export type InputMode = "text" | "url";

/** 관심 분야 선택지 (DESIGN §3) */
export const FIELDS = ["금리", "환율", "경제성장률", "무역·수출", "직접 입력"] as const;
export type Field = (typeof FIELDS)[number];

/** 원문 길이 제한 (DESIGN §6: TOO_SHORT, TOO_LONG) */
export const MIN_TEXT_LENGTH = 200;
export const MAX_TEXT_LENGTH = 20000;

/** 출처를 비웠을 때 화면에 보여 줄 문구 (PLAN 확정 사항 1) */
export const NO_SOURCE_LABEL = "출처 미입력";

/** 브라우저 → 서버: POST /api/analyze 요청 내용 */
export interface AnalyzeRequest {
  mode: InputMode;
  /** mode가 "text"일 때 붙여넣은 원문 */
  text?: string;
  /** mode가 "url"일 때 링크 1개 */
  url?: string;
  /** 원문 붙여넣기 때의 출처 (선택 입력) */
  sourceLabel?: string;
  /** 관심 분야 */
  field: Field;
  /** field가 "직접 입력"일 때 사용자가 적은 분야 이름 */
  customField?: string;
}

/** must ① 요약의 한 줄 (5줄 이하, 한 줄 60자 이내) */
export interface SummaryLine {
  text: string;
  /** 금리·환율·경제성장률 같은 수치가 들어 있는지 */
  hasNumber: boolean;
  /** 수치가 있는 줄의 출처 표시 */
  sourceRef?: string;
}

/** must ② 영향 판정 */
export type Verdict = "긍정" | "부정" | "중립" | "판단 보류";

/** must ② 한국·우리 산업 영향 분석 */
export interface Impact {
  verdict: Verdict;
  /** 원문에서 그대로 옮긴 근거 인용 (2개 이상) */
  evidence: string[];
  /** 해설. 원문에 근거가 없는 추측은 "[추정]"으로 시작한다 */
  reasoning: string;
}

/** 결과에 붙는 원문 출처 */
export interface Source {
  /** 출처 이름 (기관명 등). 비어 있으면 NO_SOURCE_LABEL */
  label: string;
  /** 링크가 있으면 원문 주소 */
  url?: string;
}

/** 서버 → 브라우저: 분석 성공 결과 */
export interface AnalyzeResult {
  summary: SummaryLine[];
  impact: Impact;
  source: Source;
  /** 서버가 규칙 검사에서 바로잡은 내용 */
  warnings: string[];
}

/** 오류 코드 (DESIGN §6) */
export type ErrorCode = "TOO_SHORT" | "TOO_LONG" | "INVALID_URL" | "FETCH_FAILED" | "AI_FAILED";

/** 서버 → 브라우저: 분석 실패 응답 */
export interface AnalyzeError {
  error: {
    code: ErrorCode;
    /** 사용자에게 보여 줄 한국어 문장 */
    message: string;
  };
}
