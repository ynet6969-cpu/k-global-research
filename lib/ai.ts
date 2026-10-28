// Design Ref: §2.1 lib/ai.ts, §7 보안 — OpenAI를 서버에서만 부른다.
// PLAN 작업 10: 새 라이브러리 없이 fetch로 Chat Completions API를 호출하고, 정해진 JSON 모양으로 답을 받는다.
// 키는 process.env에서만 읽는다. NEXT_PUBLIC_을 붙이지 않으므로 브라우저로 나가지 않는다.

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
/** .env에 OPENAI_MODEL이 없을 때 쓸 모델 (빠르고 저렴한 소형 모델) */
const DEFAULT_MODEL = "gpt-5.4-mini";
/** AI 답을 기다리는 최대 시간 */
const AI_TIMEOUT_MS = 60_000;

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

/** AI에게 이 모양(JSON Schema)대로만 답하라고 요구한다 */
export interface JsonSchema {
  name: string;
  schema: Record<string, unknown>;
}

/**
 * AI를 불러 JSON 답을 받는다. 실패하면 null을 돌려준다.
 * 실패 이유는 서버 로그에만 남기고, 키나 응답 원문은 남기지 않는다.
 */
export async function callAiJson<T>(messages: ChatMessage[], format: JsonSchema): Promise<T | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[ai] OPENAI_API_KEY가 설정되지 않았습니다.");
    return null;
  }

  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        messages,
        response_format: { type: "json_schema", json_schema: { name: format.name, strict: true, schema: format.schema } },
      }),
    });

    if (!response.ok) {
      console.error(`[ai] OpenAI 응답 오류: HTTP ${response.status}`);
      return null;
    }

    const data = (await response.json()) as { choices?: { message?: { content?: string; refusal?: string } }[] };
    const message = data.choices?.[0]?.message;
    if (!message?.content) {
      console.error(message?.refusal ? "[ai] AI가 답변을 거절했습니다." : "[ai] AI 답이 비어 있습니다.");
      return null;
    }
    return JSON.parse(message.content) as T;
  } catch (error) {
    console.error(`[ai] 호출 실패: ${error instanceof Error ? error.name : "알 수 없는 오류"}`);
    return null;
  }
}
