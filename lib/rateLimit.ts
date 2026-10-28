// Gap 3 수정: 공개 배포에서 한 사람이 분석을 무한히 요청해 OpenAI 요금이 계속 나가는 것을 막는다.
// 서버 메모리에 최근 요청 시각을 기억하는 간단한 방식이다. Vercel에서는 서버 인스턴스마다 따로 세므로
// 1차 방어선으로만 쓰고, 최종 비용 보호는 OpenAI 월 사용 한도로 한다 (DEPLOY.md 3번).

/** 한 사람(IP)이 정해진 시간 안에 할 수 있는 분석 횟수 */
export const PER_CLIENT_LIMIT = 10;
/** 서버 하나가 정해진 시간 안에 처리하는 전체 분석 횟수 */
export const GLOBAL_LIMIT = 100;
/** 횟수를 세는 시간 창 */
export const WINDOW_MS = 10 * 60 * 1000;

export interface RateLimiter {
  /** 허용되면 기록하고 0을, 넘었으면 몇 초 뒤에 다시 하면 되는지를 돌려준다 */
  take(clientKey: string, now?: number): number;
}

export function createRateLimiter(perClient = PER_CLIENT_LIMIT, global = GLOBAL_LIMIT, windowMs = WINDOW_MS): RateLimiter {
  const byClient = new Map<string, number[]>();
  let all: number[] = [];

  const recent = (times: number[], now: number) => times.filter((t) => now - t < windowMs);
  const waitSeconds = (times: number[], now: number) => Math.max(1, Math.ceil((times[0] + windowMs - now) / 1000));

  return {
    take(clientKey, now = Date.now()) {
      all = recent(all, now);
      const mine = recent(byClient.get(clientKey) ?? [], now);

      if (mine.length >= perClient) return waitSeconds(mine, now);
      if (all.length >= global) return waitSeconds(all, now);

      mine.push(now);
      all.push(now);
      byClient.set(clientKey, mine);

      // 오래된 기록이 쌓이지 않게 가끔 정리한다
      if (byClient.size > 1000) {
        for (const [key, times] of byClient) if (recent(times, now).length === 0) byClient.delete(key);
      }
      return 0;
    },
  };
}

/** 요청한 사람을 구분할 열쇠. Vercel은 x-forwarded-for 맨 앞에 실제 접속 IP를 넣는다 */
export function clientKeyOf(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}
