# Vercel 배포 준비 (PLAN 작업 17)

- **점검일**: 2026-10-28
- **상태**: 배포 준비 확인 완료. 실제 배포는 Part 5에서 진행

## 1. 준비 점검 결과

| 항목 | 결과 |
|---|---|
| `npm run lint`, `npm run build` | ✅ 오류 0건 |
| 배포용 빌드(`next start`)로 실제 분석 | ✅ 원문 3.7초, 링크 4.2초, 둘 다 정상 결과 |
| 브라우저로 가는 파일(23개)·첫 화면 HTML에 API 키 | ✅ 없음 (실제 키 값으로 대조) |
| 응답 헤더의 서버 정보 노출 | ✅ 없음 |
| `.env`가 GitHub에 올라가는지 | ✅ 안 올라감 (`.gitignore`) |
| `.env`·Word·PPT가 Vercel CLI로 올라가는지 | ✅ 안 올라감 (`.vercelignore`) |
| 함수 최대 실행 시간 | `maxDuration = 90`초 (`app/api/analyze/route.ts`) |

## 2. 배포 환경에 등록할 환경변수

Vercel 프로젝트 설정 → Environment Variables (Production)에 등록합니다. 목록은 `.env.example`에도 있습니다.

| 이름 | 필수 | 내용 |
|---|---|---|
| `OPENAI_API_KEY` | 필수 | OpenAI API 키. 서버에서만 읽음. `NEXT_PUBLIC_`을 붙이지 않음 |
| `OPENAI_MODEL` | 선택 | 모델 이름. 비우면 `gpt-5.4-mini` |

## 3. 배포 전에 정해야 할 것 (중요)

1. **API 키 교체**: 대화창에 노출됐던 GitHub·Supabase·Vercel·OpenAI 키를 새로 발급받아 `.env`에 넣은 뒤 배포합니다.
2. **사용 비용 보호**: 이 앱은 로그인이 없어서(PRD 비범위) 주소를 아는 사람은 누구나 분석을 요청할 수 있고, 그만큼 OpenAI 요금이 나갑니다. 배포 전에 아래 중 하나 이상을 정합니다.
   - OpenAI 대시보드에서 **월 사용 한도(budget)** 설정
   - Vercel **Deployment Protection**(접근 보호)으로 팀원만 접속
   - 주소를 공개하지 않고 실습 참여자에게만 공유
3. **Vercel 함수 실행 시간 한도**: 사용하는 Vercel 요금제가 90초 실행을 허용하는지 확인합니다. 보통 AI 응답은 3~5초라 실제로 90초까지 가는 일은 드뭅니다.

## 4. Part 5 배포 순서 (CLAUDE.md 규칙대로)

토큰 값은 채팅에 묻거나 출력하지 않고 `.env`의 `VERCEL_TOKEN`을 읽어 씁니다.

1. 키 교체와 비용 보호 결정 (3번)
2. Vercel CLI 설치: `npm i -g vercel`
3. 프로젝트 연결: `vercel link` (`.env`의 `VERCEL_TOKEN`으로 인증)
4. 환경변수 등록: `vercel env add OPENAI_API_KEY production` (값은 `.env`에서 읽어 전달)
5. 배포: `vercel deploy --prod`
6. 배포 후 확인 (5번)

## 5. 배포 후 확인 목록

- [ ] 배포 주소에서 첫 화면이 열린다
- [ ] 원문 붙여넣기로 분석하면 5~15초 안에 결과가 나온다
- [ ] 링크 입력으로 분석하면 결과의 출처에 페이지 제목이 나온다
- [ ] 짧은 글을 넣으면 "자료가 너무 짧습니다" 안내가 나온다
- [ ] "결과 복사하기"를 눌러 메모장에 붙여넣으면 보고서 형식 글이 들어온다
- [ ] 브라우저 개발자 도구(Network)에서 응답에 API 키가 보이지 않는다
