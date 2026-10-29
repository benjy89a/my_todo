const state = { status: 'all', tag: null };

const $ = (sel) => document.querySelector(sel);

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `요청 실패 (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

function showError(message) {
  const el = $('#error');
  el.textContent = message || '';
  el.hidden = !message;
}

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

function renderTodo(todo) {
  const checkbox = el('input', { type: 'checkbox', checked: todo.is_done });
  checkbox.addEventListener('change', () => update(todo.id, { is_done: checkbox.checked }));

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

async function renderTags() {
  const tags = await api('GET', '/api/tags');
  if (state.tag && !tags.some((t) => t.name === state.tag)) state.tag = null;

  const box = $('#tag-filter');
  box.replaceChildren(
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
    await renderTags();
    const params = new URLSearchParams({ status: state.status });
    if (state.tag) params.set('tag', state.tag);
    const todos = await api('GET', `/api/todos?${params}`);
    $('#list').replaceChildren(...todos.map(renderTodo));
    $('#empty').hidden = todos.length > 0;
    showError('');
  } catch (err) {
    showError(err.message);
  }
}

async function update(id, changes) {
  try {
    await api('PATCH', `/api/todos/${id}`, changes);
  } catch (err) {
    showError(err.message);
  }
  refresh();
}

async function remove(id) {
  if (!confirm('이 할 일을 삭제할까요?')) return;
  try {
    await api('DELETE', `/api/todos/${id}`);
  } catch (err) {
    showError(err.message);
  }
  refresh();
}

$('#add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = $('#title').value.trim();
  if (!title) return;
  try {
    await api('POST', '/api/todos', {
      title,
      due_date: $('#due').value || null,
      tags: $('#tags').value.split(','),
    });
    e.target.reset();
    $('#title').focus();
    refresh();
  } catch (err) {
    showError(err.message);
  }
});

$('#status-filter').addEventListener('click', (e) => {
  const button = e.target.closest('button');
  if (!button) return;
  state.status = button.dataset.status;
  for (const b of $('#status-filter').children) b.classList.toggle('active', b === button);
  refresh();
});

refresh();
