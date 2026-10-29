// 1부 로컬 SQLite 버전 — 실행: npm run start:sqlite → http://localhost:3001
import express from 'express';
import { fileURLToPath } from 'node:url';
import db from './db.js';

const app = express();
app.use(express.json());
app.use(express.static(fileURLToPath(new URL('public', import.meta.url))));

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 할 일 + 붙은 태그 이름 목록을 한 번에 가져오는 기본 쿼리
const SELECT_TODOS = `
  SELECT t.*,
         COALESCE((SELECT json_group_array(g.name)
                   FROM todo_tags tt JOIN tags g ON g.id = tt.tag_id
                   WHERE tt.todo_id = t.id), '[]') AS tags
  FROM todos t`;

function rowToTodo(row) {
  return { ...row, is_done: row.is_done === 1, tags: JSON.parse(row.tags) };
}

function getTodo(id) {
  const row = db.prepare(`${SELECT_TODOS} WHERE t.id = ?`).get(id);
  return row ? rowToTodo(row) : null;
}

// 태그 이름 배열 -> 할 일에 연결 (없는 태그는 새로 만듦)
function setTags(todoId, names) {
  db.prepare('DELETE FROM todo_tags WHERE todo_id = ?').run(todoId);
  const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
  const findTag = db.prepare('SELECT id FROM tags WHERE name = ?');
  const link = db.prepare('INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?, ?)');
  for (const name of names) {
    insertTag.run(name);
    link.run(todoId, findTag.get(name).id);
  }
  // 어떤 할 일에도 안 붙은 태그는 정리
  db.exec('DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM todo_tags)');
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

function inTransaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// 목록: ?status=all|active|done|overdue  &tag=이름
app.get('/api/todos', (req, res) => {
  const where = [];
  const params = [];
  const { status = 'all', tag } = req.query;

  if (status === 'active') where.push('t.is_done = 0');
  if (status === 'done') where.push('t.is_done = 1');
  if (status === 'overdue') where.push("t.is_done = 0 AND t.due_date < date('now', 'localtime')");
  if (tag) {
    where.push(`t.id IN (SELECT tt.todo_id FROM todo_tags tt
                         JOIN tags g ON g.id = tt.tag_id WHERE g.name = ?)`);
    params.push(tag);
  }

  const sql = `${SELECT_TODOS}
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY t.is_done, t.due_date IS NULL, t.due_date, t.id DESC`;
  res.json(db.prepare(sql).all(...params).map(rowToTodo));
});

app.get('/api/tags', (req, res) => {
  res.json(db.prepare('SELECT * FROM tags ORDER BY name').all());
});

app.post('/api/todos', (req, res) => {
  const error = validate(req.body, { partial: false });
  if (error) return res.status(400).json({ error });

  const { title, memo, due_date, tags } = req.body;
  const id = inTransaction(() => {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO todos (title, memo, due_date) VALUES (?, ?, ?)')
      .run(title.trim(), memo || null, due_date || null);
    setTags(lastInsertRowid, cleanTags(tags));
    return lastInsertRowid;
  });
  res.status(201).json(getTodo(id));
});

app.patch('/api/todos/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!getTodo(id)) return res.status(404).json({ error: '할 일을 찾을 수 없어요.' });

  const error = validate(req.body, { partial: true });
  if (error) return res.status(400).json({ error });

  const sets = [];
  const params = [];
  if ('title' in req.body) { sets.push('title = ?'); params.push(req.body.title.trim()); }
  if ('memo' in req.body) { sets.push('memo = ?'); params.push(req.body.memo || null); }
  if ('due_date' in req.body) { sets.push('due_date = ?'); params.push(req.body.due_date || null); }
  if ('is_done' in req.body) { sets.push('is_done = ?'); params.push(req.body.is_done ? 1 : 0); }

  inTransaction(() => {
    if (sets.length) {
      sets.push("updated_at = datetime('now', 'localtime')");
      db.prepare(`UPDATE todos SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
    }
    if ('tags' in req.body) setTags(id, cleanTags(req.body.tags));
  });
  res.json(getTodo(id));
});

app.delete('/api/todos/:id', (req, res) => {
  const id = Number(req.params.id);
  const { changes } = inTransaction(() => {
    const result = db.prepare('DELETE FROM todos WHERE id = ?').run(id);
    db.exec('DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM todo_tags)');
    return result;
  });
  if (!changes) return res.status(404).json({ error: '할 일을 찾을 수 없어요.' });
  res.status(204).end();
});

// Supabase 버전(3000)과 동시에 켤 수 있게 3001 사용
const port = 3001;
app.listen(port, '127.0.0.1', () => {
  console.log(`Todo 앱 실행 중: http://localhost:${port}`);
});
