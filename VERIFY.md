# 과제 확인 절차와 기록

## 실행 방법

| 버전 | 명령 | 주소 | 저장 위치 |
|---|---|---|---|
| 길 A: 로컬 SQLite | `npm run start:sqlite` | http://localhost:3001 | `sqlite-version/todo.db` |
| 길 B: Supabase | `npm start` | http://localhost:3000 | Supabase (클라우드 Postgres) |

둘 다 동시에 켜도 됨 (포트가 다름). 끌 때는 터미널에서 Ctrl+C.

## 1. DB 접근 코드는 어디에 있고, 왜 서버에서 실행되나

- 길 B: [supabase.js](supabase.js) (접속 키를 읽고 연결) + [server.js](server.js) (모든 조회·추가·수정·삭제)
- 길 A: [sqlite-version/db.js](sqlite-version/db.js) + [sqlite-version/server.js](sqlite-version/server.js)
- 화면 코드 [public/app.js](public/app.js) 는 `/api/...` 에만 요청하고 DB 주소·키가 없음

서버에서 실행하는 이유: 브라우저로 보내는 코드는 누구나 F12 로 열어 볼 수 있음.
DB 코드와 키가 브라우저에 있으면 키를 복사해 DB 에 직접 요청할 수 있음.
서버에 두면 키는 `.env` 에만 있고, 서버가 입력값 검사·로그인 확인을 거친 요청만 DB 로 보냄.
여기에 더해 Supabase 는 RLS 로 DB 자체에서 "본인 데이터만" 을 한 번 더 막음.

## 2. 껐다 켜도 남는지 (길 A, 길 B 각각)

1. 할 일 추가 → 하나는 완료 체크, 하나는 삭제
2. 터미널에서 Ctrl+C 로 서버 끄기 → 다시 `npm start` (또는 `npm run start:sqlite`)
3. 브라우저 새로고침 → 추가·완료한 할 일이 그대로, 삭제한 건 없음
4. 길 B 는 Supabase 대시보드 → **Table Editor** → `todos` 에도 행이 있는지 확인

## 3. 계정 두 개로 RLS 확인

**준비: 두 번째 계정 만들기**
메일 확인 때문에 번거로우면, 테스트하는 동안만 Supabase → Authentication → Sign In / Providers → Email →
**Confirm email** 을 끄고 가입. 테스트 후 다시 켜기.

**A, B 를 다른 브라우저에서** (쿠키가 따로라 동시에 로그인 가능)
예: A 는 평소 브라우저, B 는 Chrome 시크릿 창 (Ctrl+Shift+N).

1. **A 로그인** → 할 일 `A의 비밀 할 일` 추가
2. A 브라우저 주소창에 `http://localhost:3000/api/todos` → 그 할 일의 `"id"` 숫자를 적어 둠 (예: 15)
3. **B 로그인** → 목록에 `A의 비밀 할 일` 이 **안 보이는지** 확인
4. B 화면에서 F12 → Console 탭 → 아래를 붙여 넣고 Enter (15 는 A 의 id 로 바꾸기)
   (Chrome 이 붙여 넣기를 막으면 `allow pasting` 입력 후 다시)
   ```js
   const id = 15;
   const h = { 'Content-Type': 'application/json' };
   console.log('조회', await (await fetch('/api/todos')).json());
   const p = await fetch(`/api/todos/${id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ title: 'B가 바꿈' }) });
   console.log('수정', p.status, await p.json());
   const d = await fetch(`/api/todos/${id}`, { method: 'DELETE' });
   console.log('삭제', d.status, await d.json());
   ```
   기대 결과: 조회 목록에 A 의 할 일 없음 / 수정 `404 {error: '할 일을 찾을 수 없어요.'}` / 삭제 `404 ...`
   → A 의 데이터가 하나도 반환되지 않음
5. **A 브라우저 새로고침** → `A의 비밀 할 일` 이 제목 그대로 남아 있는지 확인
6. Supabase Table Editor → `todos` → `user_id` 열이 A, B 로 서로 다른지 확인

**DB 수준 확인:** SQL Editor 에서 [supabase/rls_test.sql](supabase/rls_test.sql) 실행 → `RLS 테스트 통과`

## 제출용 기록

- **클라우드 전환:** 길 A(로컬 SQLite 파일 `todo.db`, [sqlite-version/](sqlite-version/)) → 길 B(Supabase Postgres + Supabase Auth). 화면은 `/api` 만 호출하고, DB 접근 코드와 접속 키는 백엔드(`supabase.js`, `server.js`, `.env`)에만 있음. 할 일마다 소유자 `user_id` 기록.
- **로컬 저장 확인 (2026-10-29):** 길 A 에서 할 일 추가 → 완료 체크 → 서버 재시작 → 할 일과 완료 상태 그대로 → 삭제 후 목록에서 사라짐.
- **Supabase 저장 확인 (2026-10-29):** 길 B 에서 로그인 후 추가·완료·삭제·태그 필터 동작. 서버를 여러 번 재시작하고 폴더를 옮겨 다시 실행해도 할 일 4개 유지. Supabase Table Editor 의 `todos` 표에도 행이 쌓이는 것 확인.
- **RLS 확인 (2026-10-29):** 세 표 모두 RLS 켬, 정책은 "로그인한 본인 행만 조회·추가·수정·삭제". 로그인 없이 접근 → 조회 0건, 추가는 `new row violates row-level security policy` 로 거절. 없는(또는 남의) 할 일 id 로 수정·삭제 요청 → 404, 데이터 반환 없음. rls_test.sql(가짜 사용자 A·B 로 조회·수정·삭제·남의 명의 추가 시험) → `RLS 테스트 통과`.
- **두 계정 RLS 확인 (2026-10-29):** 실제 계정 A·B 로 로그인 → B 화면에 A 의 할 일 안 보임, B 가 A 의 할 일 id 로 수정·삭제 요청 → 404 로 거절되고 데이터 반환 없음, A 에서 새로고침하면 원래 할 일 그대로.
- **배포:** 하지 않음 (선택 사항). 준비물은 [DEPLOY.md](DEPLOY.md)
