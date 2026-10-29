# Todo 앱 (Supabase 버전)

> my_blog 안의 `todo-backend/` 폴더. 명령은 모두 이 폴더에서 실행해요 (`cd todo-backend`).
> (같은 저장소의 `my-todo/` 는 이전 과제의 React 화면 앱으로, 이 앱과 별개예요.)

기획은 [PRD.md](PRD.md), DB 구조는 [DB_DESIGN.md](DB_DESIGN.md) + [supabase/schema.sql](supabase/schema.sql).

```
브라우저(public/)  ──/api/...──▶  Express 백엔드(server.js)  ──supabase-js──▶  Supabase (Postgres + Auth)
  키·토큰 없음                    .env 의 키 사용, 로그인 쿠키 관리           RLS 로 본인 데이터만 허용
```

- 화면 코드는 백엔드 API 에만 요청. Supabase 접속 키는 백엔드 `.env` 에만 있음.
- 로그인은 Supabase Auth(이메일+비밀번호). 토큰은 httpOnly 쿠키라 화면 JS 에서 못 읽음.
- 백엔드는 로그인한 사용자의 토큰으로 DB 에 접근 → RLS 정책이 "본인 할 일만" 을 강제.
  RLS 를 무시하는 service_role 키는 쓰지 않음.
- 이전 SQLite 버전은 [sqlite-version/](sqlite-version/) 에 보관. `npm run start:sqlite` → http://localhost:3001
- 시연 화면: [DEMO.md](DEMO.md), 과제 확인 절차와 기록: [VERIFY.md](VERIFY.md), 배포 준비물: [DEPLOY.md](DEPLOY.md)

## 처음 설정

1. https://supabase.com 에서 무료 프로젝트 생성
2. 대시보드 → **SQL Editor** → [supabase/schema.sql](supabase/schema.sql) 내용 붙여 넣고 Run
3. (선택) 같은 곳에서 [supabase/rls_test.sql](supabase/rls_test.sql) Run → `RLS 테스트 통과` 가 나오면 정책 정상
4. `.env.example` 을 `.env` 로 복사하고 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` 채우기
5. 실행

```bash
npm install
npm start
```

http://localhost:3000 → 회원가입 → (메일 확인 링크 클릭) → 로그인.

## API

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/auth/signup` | 회원가입 `{ email, password }` |
| POST | `/api/auth/login` | 로그인 (쿠키 설정) |
| POST | `/api/auth/logout` | 로그아웃 |
| GET | `/api/auth/me` | 현재 사용자 |
| GET | `/api/todos?status=all\|active\|done\|overdue&tag=이름&today=YYYY-MM-DD` | 내 할 일 목록 |
| POST | `/api/todos` | 추가 `{ title, memo?, due_date?, tags? }` |
| PATCH | `/api/todos/:id` | 수정 (완료 표시: `{ is_done: true }`) |
| DELETE | `/api/todos/:id` | 삭제 |
| GET | `/api/tags` | 내 태그 목록 |

`/api/todos`, `/api/tags` 는 로그인하지 않으면 401.
