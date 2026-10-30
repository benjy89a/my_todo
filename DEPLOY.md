# 배포 준비물 (Render)

백엔드(server.js)를 클라우드에 올려 인터넷 주소로 접속할 수 있게 하는 준비물.
DB 는 이미 Supabase(클라우드)에 있으므로 로컬 실행·배포 모두 **같은 DB** 를 씀.

```
브라우저 ──▶ Render 의 server.js (https://내앱.onrender.com) ──▶ Supabase DB
```

| 준비물 | 값 |
|---|---|
| 코드 보관 위치 | GitHub `benjy89a/my_todo` (추천, 저장소 전체가 이 앱) 또는 `benjy89a/my_blog` 의 `todo-backend/` 폴더 |
| Root Directory | `my_todo` 로 배포하면 **비워 둠** / `my_blog` 로 배포하면 `todo-backend` |
| 올리면 안 되는 것 | `.env`, `todo.db`, `node_modules/` → `.gitignore` 에 있음 |
| Render 서비스 종류 | New → **Web Service**, Free 플랜 |
| Region | Supabase 프로젝트와 같은(가까운) 지역 |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Node 버전 | 22 이상 (`package.json` 의 `engines`) |
| 환경변수 | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (.env 와 같은 값) |
| | `HOST=0.0.0.0` (외부 접속 허용) |
| | `NODE_ENV=production` (로그인 쿠키에 Secure) |
| | `PORT` 는 Render 가 자동으로 넣음 → 입력하지 않음 |
| 배포 후 Supabase 설정 | Authentication → URL Configuration → **Site URL** 을 Render 주소로 |

## 배포 후 확인 방법

1. `https://내앱.onrender.com` 접속 → 로그인 화면이 보이면 서버 실행 OK
2. `https://내앱.onrender.com/api/todos` → `{"error":"로그인이 필요해요."}` 가 보이면 API 와 보안 OK
3. 로그인 → 로컬에서 만든 할 일이 그대로 보이면 Supabase 연결 OK
4. 할 일 추가·완료·삭제 → Supabase Table Editor 에도 반영되는지 확인

## 알아 둘 점

- 무료 플랜은 15분간 접속이 없으면 잠듦 → 다음 첫 접속에 30초~1분 걸림
- 환경변수를 바꾸면 Render 가 자동으로 다시 배포함
- 로그가 궁금하면 Render 대시보드 → 서비스 → **Logs**
