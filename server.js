import express from 'express';
import cookieParser from 'cookie-parser';
import { createSupabase } from './supabase.js';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BASE_COLUMNS = 'id, title, memo, is_done, due_date, created_at, updated_at';
const TODO_COLUMNS = `${BASE_COLUMNS}, tags(name)`;

// ───────── 로그인 세션 (httpOnly 쿠키 — 화면 JS 에서는 토큰을 볼 수 없음) ─────────

const COOKIE = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

function setSessionCookies(res, session) {
  res.cookie('sb_access', session.access_token, { ...COOKIE, maxAge: session.expires_in * 1000 });
  res.cookie('sb_refresh', session.refresh_token, { ...COOKIE, maxAge: 30 * 24 * 60 * 60 * 1000 });
}

function clearSessionCookies(res) {
  res.clearCookie('sb_access', COOKIE);
  res.clearCookie('sb_refresh', COOKIE);
}

// 쿠키의 토큰을 확인하고, 만료됐으면 refresh 토큰으로 새로 받음. 실패하면 null.
async function resolveSession(req, res) {
  const { sb_access: access, sb_refresh: refresh } = req.cookies;
  const auth = createSupabase().auth;

  if (access) {
    // 토큰 서명을 Supabase 공개키(JWKS, 캐시됨)로 서버에서 직접 검증 → 매 요청 Auth 서버 왕복 없음
    const { data, error } = await auth.getClaims(access);
    if (!error && data?.claims) {
      return { user: { id: data.claims.sub, email: data.claims.email }, accessToken: access };
    }
  }
  if (refresh) {
    const { data, error } = await auth.refreshSession({ refresh_token: refresh });
    if (!error && data.session) {
      setSessionCookies(res, data.session);
      return { user: data.user, accessToken: data.session.access_token };
    }
  }
  clearSessionCookies(res);
  return null;
}

async function requireUser(req, res, next) {
  const session = await resolveSession(req, res);
  if (!session) return res.status(401).json({ error: '로그인이 필요해요.' });
  req.user = session.user;
  req.db = createSupabase(session.accessToken); // 이 사용자 권한으로 DB 접근 (RLS 적용)
  next();
}

function publicUser(user) {
  return { id: user.id, email: user.email };
}

function validateCredentials(body) {
  const { email, password } = body ?? {};
  if (typeof email !== 'string' || !email.includes('@')) return '이메일을 확인해 주세요.';
  if (typeof password !== 'string' || password.length < 6) return '비밀번호는 6자 이상이어야 해요.';
  return null;
}

app.post('/api/auth/signup', async (req, res) => {
  const error = validateCredentials(req.body);
  if (error) return res.status(400).json({ error });

  const { data, error: authError } = await createSupabase().auth.signUp({
    email: req.body.email.trim(),
    password: req.body.password,
  });
  if (authError) return res.status(400).json({ error: authError.message });

  // 이메일 확인이 켜져 있으면 session 이 없음 → 메일의 링크를 눌러야 로그인 가능
  if (!data.session) return res.status(201).json({ needsConfirmation: true });
  setSessionCookies(res, data.session);
  res.status(201).json({ user: publicUser(data.user) });
});

app.post('/api/auth/login', async (req, res) => {
  const error = validateCredentials(req.body);
  if (error) return res.status(400).json({ error });

  const { data, error: authError } = await createSupabase().auth.signInWithPassword({
    email: req.body.email.trim(),
    password: req.body.password,
  });
  if (authError) return res.status(401).json({ error: '이메일 또는 비밀번호가 맞지 않아요.' });

  setSessionCookies(res, data.session);
  res.json({ user: publicUser(data.user) });
});

app.post('/api/auth/logout', async (req, res) => {
  const { sb_access: access, sb_refresh: refresh } = req.cookies;
  if (access && refresh) {
    // refresh 토큰을 Supabase 쪽에서도 무효화
    const auth = createSupabase().auth;
    const { error } = await auth.setSession({ access_token: access, refresh_token: refresh });
    if (!error) await auth.signOut({ scope: 'local' });
  }
  clearSessionCookies(res);
  res.status(204).end();
});

app.get('/api/auth/me', async (req, res) => {
  const session = await resolveSession(req, res);
  if (!session) return res.status(401).json({ error: '로그인이 필요해요.' });
  res.json({ user: publicUser(session.user) });
});

// ───────── 할 일 API (전부 로그인 필요) ─────────

app.use('/api/todos', requireUser);
app.use('/api/tags', requireUser);

function rowToTodo(row) {
  return { ...row, tags: row.tags.map((t) => t.name).sort() };
}

function cleanTags(tags) {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags.map((t) => String(t).trim()).filter(Boolean))];
}

function validate(body, { partial }) {
  if (!partial || 'title' in body) {
    if (typeof body.title !== 'string' || !body.title.trim()) return '제목을 입력해 주세요.';
  }
  if (body.due_date != null && body.due_date !== '' && !DATE_RE.test(body.due_date)) {
    return '마감일은 YYYY-MM-DD 형식이어야 해요.';
  }
  return null;
}

// Supabase 오류는 서버 로그에만 자세히 남기고, 화면에는 일반 메시지만
function dbError(res, error) {
  console.error(error);
  return res.status(500).json({ error: '데이터를 처리하지 못했어요. 잠시 후 다시 시도해 주세요.' });
}

// 태그를 교체하고 정리된 태그 이름 목록을 돌려줌
async function setTags(db, todoId, tags) {
  const names = cleanTags(tags);
  const { error } = await db.rpc('set_todo_tags', { p_todo_id: todoId, p_names: names });
  if (error) throw error;
  return names.sort();
}

// 목록: ?status=all|active|done|overdue  &tag=이름  &today=YYYY-MM-DD(사용자 기준 오늘)
app.get('/api/todos', async (req, res) => {
  try {
    const { status = 'all', tag } = req.query;
    const today = DATE_RE.test(req.query.today) ? req.query.today : new Date().toISOString().slice(0, 10);
    let query = req.db.from('todos').select(TODO_COLUMNS);

    if (status === 'active') query = query.eq('is_done', false);
    if (status === 'done') query = query.eq('is_done', true);
    if (status === 'overdue') query = query.eq('is_done', false).lt('due_date', today);
    if (tag) {
      const { data: links, error } = await req.db
        .from('todo_tags')
        .select('todo_id, tags!inner(name)')
        .eq('tags.name', tag);
      if (error) throw error;
      query = query.in('id', links.map((l) => l.todo_id));
    }

    const { data, error } = await query
      .order('is_done')
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('id', { ascending: false });
    if (error) throw error;
    res.json(data.map(rowToTodo));
  } catch (error) {
    dbError(res, error);
  }
});

app.get('/api/tags', async (req, res) => {
  const { data, error } = await req.db.from('tags').select('id, name, color').order('name');
  if (error) return dbError(res, error);
  res.json(data);
});

app.post('/api/todos', async (req, res) => {
  const message = validate(req.body, { partial: false });
  if (message) return res.status(400).json({ error: message });

  try {
    const { title, memo, due_date, tags } = req.body;
    // user_id 는 보내지 않음 → DB 기본값 auth.uid() 로 로그인한 사용자가 기록됨
    const { data, error } = await req.db
      .from('todos')
      .insert({ title: title.trim(), memo: memo || null, due_date: due_date || null })
      .select(BASE_COLUMNS)
      .single();
    if (error) throw error;
    const tagNames = cleanTags(tags).length ? await setTags(req.db, data.id, tags) : [];
    res.status(201).json({ ...data, tags: tagNames });
  } catch (error) {
    dbError(res, error);
  }
});

app.patch('/api/todos/:id', async (req, res) => {
  const id = Number(req.params.id);
  const message = validate(req.body, { partial: true });
  if (message) return res.status(400).json({ error: message });

  try {
    const changes = {};
    if ('title' in req.body) changes.title = req.body.title.trim();
    if ('memo' in req.body) changes.memo = req.body.memo || null;
    if ('due_date' in req.body) changes.due_date = req.body.due_date || null;
    if ('is_done' in req.body) changes.is_done = Boolean(req.body.is_done);

    // 바꿀 열이 있으면 수정하면서 결과를 받고, 없으면 조회만 (RLS 때문에 남의 할 일은 안 보임 → 404)
    const query = Object.keys(changes).length
      ? req.db.from('todos').update(changes).eq('id', id).select(TODO_COLUMNS)
      : req.db.from('todos').select(TODO_COLUMNS).eq('id', id);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: '할 일을 찾을 수 없어요.' });

    const todo = rowToTodo(data);
    if ('tags' in req.body) todo.tags = await setTags(req.db, id, req.body.tags);
    res.json(todo);
  } catch (error) {
    dbError(res, error);
  }
});

app.delete('/api/todos/:id', async (req, res) => {
  const { data, error } = await req.db.from('todos').delete().eq('id', Number(req.params.id)).select('id');
  if (error) return dbError(res, error);
  if (!data.length) return res.status(404).json({ error: '할 일을 찾을 수 없어요.' });
  res.status(204).end();
});

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '127.0.0.1';
app.listen(port, host, () => {
  console.log(`Todo 앱 실행 중: http://localhost:${port}`);
});
