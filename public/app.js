// 화면 코드는 백엔드 API(/api/...)에만 요청함. Supabase 키·토큰은 여기 없음.
const state = { status: 'all', tag: null };

const $ = (sel) => document.querySelector(sel);

class AuthError extends Error {}

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('/api/auth/login')) {
    showAuth();
    throw new AuthError(data?.error || '로그인이 필요해요.');
  }
  if (!res.ok) throw new Error(data?.error || `요청 실패 (${res.status})`);
  return data;
}

function showMessage(selector, message) {
  const el = $(selector);
  el.textContent = message || '';
  el.hidden = !message;
}
const showError = (message) => showMessage('#error', message);
const showNotice = (message) => showMessage('#notice', message);

function today() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

// ───────── 로그인 ─────────

function showAuth() {
  $('#auth-view').hidden = false;
  $('#app-view').hidden = true;
  $('#user-box').hidden = true;
  $('#email').focus();
}

function showApp(user) {
  $('#auth-view').hidden = true;
  $('#app-view').hidden = false;
  $('#user-box').hidden = false;
  $('#user-email').textContent = user.email;
  showNotice('');
  refresh();
}

$('#auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const mode = e.submitter?.dataset.mode || 'login';
  const credentials = { email: $('#email').value.trim(), password: $('#password').value };
  showError('');
  try {
    const data = await api('POST', `/api/auth/${mode}`, credentials);
    $('#password').value = '';
    if (data.needsConfirmation) {
      showNotice('가입 확인 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.');
      return;
    }
    showApp(data.user);
  } catch (err) {
    showError(err.message);
  }
});

$('#logout').addEventListener('click', async () => {
  await api('POST', '/api/auth/logout').catch(() => {});
  state.tag = null;
  $('#list').replaceChildren();
  showAuth();
});

// ───────── 할 일 ─────────

function renderTodo(todo) {
  const checkbox = el('input', { type: 'checkbox', checked: todo.is_done });
  checkbox.addEventListener('change', () => {
    checkbox.closest('li').classList.toggle('done', checkbox.checked); // 응답 전에 먼저 화면에 반영
    update(todo.id, { is_done: checkbox.checked });
  });

  const meta = el('div', { className: 'meta' });
  if (todo.due_date) {
    const due = el('span', { className: 'due', textContent: `마감 ${todo.due_date}` });
    if (!todo.is_done && todo.due_date < today()) {
      due.classList.add('overdue');
      due.textContent += ' · 지남';
    } else if (!todo.is_done && todo.due_date === today()) {
      due.classList.add('today');
      due.textContent += ' · 오늘';
    }
    meta.append(due);
  }
  for (const name of todo.tags) {
    meta.append(el('span', { className: 'chip', textContent: name }));
  }

  const del = el('button', { className: 'delete', textContent: '삭제', title: '삭제' });
  del.addEventListener('click', () => remove(todo.id));

  return el('li', { className: todo.is_done ? 'done' : '' }, [
    checkbox,
    el('div', { className: 'body' }, [el('div', { className: 'title', textContent: todo.title }), meta]),
    del,
  ]);
}

function renderTags(tags) {
  $('#tag-filter').replaceChildren(
    ...tags.map((t) => {
      const chip = el('button', {
        className: 'chip' + (state.tag === t.name ? ' active' : ''),
        textContent: `#${t.name}`,
      });
      chip.addEventListener('click', () => {
        state.tag = state.tag === t.name ? null : t.name;
        refresh();
      });
      return chip;
    }),
  );
}

async function refresh() {
  try {
    const params = new URLSearchParams({ status: state.status, today: today() });
    if (state.tag) params.set('tag', state.tag);
    // 태그와 할 일을 동시에 요청 (차례로 하면 두 배 느림)
    const [tags, todos] = await Promise.all([api('GET', '/api/tags'), api('GET', `/api/todos?${params}`)]);
    if (state.tag && !tags.some((t) => t.name === state.tag)) {
      state.tag = null; // 고른 태그가 사라졌으면 필터 해제 후 다시 불러옴
      return refresh();
    }
    renderTags(tags);
    $('#list').replaceChildren(...todos.map(renderTodo));
    $('#empty').hidden = todos.length > 0;
    showError('');
  } catch (err) {
    if (!(err instanceof AuthError)) showError(err.message);
  }
}

async function update(id, changes) {
  try {
    await api('PATCH', `/api/todos/${id}`, changes);
  } catch (err) {
    if (!(err instanceof AuthError)) showError(err.message);
  }
  refresh();
}

async function remove(id) {
  if (!confirm('이 할 일을 삭제할까요?')) return;
  try {
    await api('DELETE', `/api/todos/${id}`);
  } catch (err) {
    if (!(err instanceof AuthError)) showError(err.message);
  }
  refresh();
}

$('#add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = $('#title').value.trim();
  const button = e.target.querySelector('button[type=submit]');
  if (!title || button.disabled) return;

  // 저장이 끝날 때까지 버튼을 막아 두 번 저장되지 않게 함
  button.disabled = true;
  button.textContent = '저장 중…';
  try {
    await api('POST', '/api/todos', {
      title,
      due_date: $('#due').value || null,
      tags: $('#tags').value.split(','),
    });
    e.target.reset();
    $('#title').focus();
    await refresh();
  } catch (err) {
    if (!(err instanceof AuthError)) showError(err.message);
  } finally {
    button.disabled = false;
    button.textContent = '추가';
  }
});

$('#status-filter').addEventListener('click', (e) => {
  const button = e.target.closest('button');
  if (!button) return;
  state.status = button.dataset.status;
  for (const b of $('#status-filter').children) b.classList.toggle('active', b === button);
  refresh();
});

// 시작: 이미 로그인돼 있으면 바로 목록, 아니면 로그인 화면
api('GET', '/api/auth/me')
  .then((data) => showApp(data.user))
  .catch(() => {});
