// SQLite 연결 + 테이블 생성 (구조는 DB_DESIGN.md 참고)
import { DatabaseSync } from 'node:sqlite';

// 이 폴더의 todo.db 에 저장 (어디서 실행하든 같은 파일)
const db = new DatabaseSync(new URL('todo.db', import.meta.url));

db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS todos (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT    NOT NULL,
      memo       TEXT,
      is_done    INTEGER NOT NULL DEFAULT 0 CHECK (is_done IN (0, 1)),
      due_date   TEXT,
      created_at TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS tags (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      name  TEXT NOT NULL UNIQUE,
      color TEXT
  );

  CREATE TABLE IF NOT EXISTS todo_tags (
      todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
      tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
      PRIMARY KEY (todo_id, tag_id)
  );

  CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);
  CREATE INDEX IF NOT EXISTS idx_todo_tags_tag  ON todo_tags(tag_id);
`);

export default db;
