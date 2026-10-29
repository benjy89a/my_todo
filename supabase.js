// Supabase 연결 (백엔드 전용 — 접속 키는 .env 에서만 읽음)
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error('SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY 가 없어요. .env.example 을 .env 로 복사해서 채워 주세요.');
  process.exit(1);
}

// 요청마다 새 클라이언트를 만듦. accessToken 을 주면 그 사용자로 DB 에 접근 → RLS 적용.
// service_role(secret) 키는 RLS 를 무시하므로 이 앱에서는 쓰지 않음.
export function createSupabase(accessToken) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {},
  });
}
