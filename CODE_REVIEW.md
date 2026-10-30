# 코드 리뷰 — my_todobenjy89a

- 대상: https://github.com/jkspawn/my_todobenjy89a (`main`, 커밋 `ceb62d0`)
- 리뷰 날짜: 2026-10-30
- 확인한 것: `npm install`, `node --check` 문법 검사 통과. Supabase 버전은 `.env`가 없어 실행하지 않음.
  2번 항목(본문 없는 요청)은 Express 5로 직접 실행해서 확인함.

## 잘된 점

- Supabase 키와 토큰을 백엔드와 httpOnly 쿠키에만 둠. 화면 JS에서는 토큰을 볼 수 없음.
- `service_role` 키 없이 사용자 토큰으로 DB에 접근해서 RLS가 그대로 적용됨.
- `supabase/rls_test.sql`로 RLS 정책을 사용자 A·B·익명으로 시험하고 rollback함.
- DB 오류 내용은 서버 로그에만 남기고 화면에는 일반 메시지만 보여줌.

## 고쳐야 할 것

### 1. 추가·수정이 한 번에 처리되지 않음 (`server.js:204-210`, `230-238`)

할 일을 먼저 넣고 `set_todo_tags`를 따로 호출함.

- 태그 저장이 실패하면 할 일은 이미 저장됐는데 화면에는 500 오류가 뜸. 사용자가 다시 누르면 같은 할 일이 두 번 생김.
- 수정도 같은 구조임. SQLite 버전은 `inTransaction`으로 묶여 있는데 Supabase 버전에서는 이 보장이 빠짐.
- 고치는 방법: 할 일 추가와 태그 저장을 RPC 함수 하나(예: `create_todo(title, memo, due_date, tags)`)로 옮김.

### 2. 본문 없이 요청하면 400이 아니라 500이 남 (`server.js:138`, `sqlite-version/server.js:49`)

Express 5는 JSON 본문이 없으면 `req.body`를 `undefined`로 둠.

- 그래서 `validate()`의 `body.title`과 `'title' in body`에서 TypeError가 남.
- 두 서버 모두 같은 문제임.
- 고치는 방법: `validate(req.body ?? {}, …)`

### 3. 입력값 종류를 확인하지 않음

- `is_done: "false"`(문자열)를 보내면 `Boolean("false")`가 `true`라서 완료로 바뀜 (`server.js:227`).
- `memo`가 문자열인지 확인하지 않음.
- 태그 `[null]`은 `"null"`이라는 태그가 됨 (`server.js:134`).
- `id`가 숫자가 아니면(`/api/todos/abc`) `NaN`이 DB로 넘어가서 404가 아니라 500이 남.
- `2024-13-45`처럼 형식만 맞는 날짜는 DB에서 거부돼서 500이 남.

### 4. 이메일을 아직 확인하지 않은 사용자에게 잘못된 오류를 보여줌 (`server.js:99`)

로그인 실패를 모두 "이메일 또는 비밀번호가 맞지 않아요"로 바꿈.

- 가입한 뒤 메일 링크를 누르지 않은 사용자도 비밀번호가 틀렸다고 안내받음.
- 고치는 방법: `authError.code === 'email_not_confirmed'`일 때는 따로 안내함.

## 개선하면 좋은 것

### 5. 배포하면 모든 사용자가 한 IP에서 로그인하는 셈임

Supabase Auth는 로그인·가입·토큰 갱신 횟수를 IP별로 제한함. Render에 올리면 모든 사용자의 요청이 서버 IP 하나에서 나가서 이 한도를 함께 씀. 사용자가 늘면 서로의 로그인이 막힐 수 있음.

### 6. 태그 필터가 할 일 id를 전부 URL에 실음 (`server.js:171-177`)

태그로 거를 때 해당 id를 모두 모아 `.in('id', [...])`로 보냄. 할 일이 많아지면 URL이 너무 길어짐. `todo_tags!inner`로 조건을 걸어 쿼리 하나로 처리할 수 있음.

### 7. 화면이 이전 응답으로 덮일 수 있음 (`public/app.js:137`)

필터나 체크박스를 빠르게 누르면 `refresh()`가 여러 번 동시에 실행됨. 늦게 도착한 이전 요청의 결과가 최신 목록을 덮을 수 있음. 마지막 요청의 결과만 그리도록 번호를 붙이면 됨.

### 8. 그 밖의 작은 문제

- `express.static('public')`(`server.js:8`)은 명령을 실행한 폴더를 기준으로 경로를 찾음. 다른 폴더에서 실행하면 화면이 안 뜸. SQLite 버전처럼 `import.meta.url`을 쓰면 됨.
- 가입 오류는 Supabase 메시지를 그대로 화면에 보여줌(`server.js:83`). 그래서 어떤 이메일이 이미 가입돼 있는지 알 수 있음.
- 태그만 바꾸면 `updated_at`이 갱신되지 않음.
- 제목과 태그 길이에 제한이 없음.
