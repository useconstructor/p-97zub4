CREATE TABLE IF NOT EXISTS spaces (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, space_id TEXT NOT NULL REFERENCES spaces(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS expenses (id TEXT PRIMARY KEY, space_id TEXT NOT NULL REFERENCES spaces(id), concept TEXT NOT NULL CHECK(length(trim(concept)) BETWEEN 1 AND 120), category_id TEXT NOT NULL REFERENCES categories(id), date TEXT NOT NULL, amount_cents INTEGER NOT NULL CHECK(amount_cents BETWEEN 1 AND 9007199254740991), is_example INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS expenses_space_date ON expenses(space_id, date DESC, created_at DESC, id DESC);
CREATE TABLE IF NOT EXISTS operations (space_id TEXT NOT NULL REFERENCES spaces(id), key TEXT NOT NULL, type TEXT NOT NULL, target_id TEXT, payload TEXT NOT NULL, response TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(space_id, key));
CREATE TABLE IF NOT EXISTS seed_markers (space_id TEXT PRIMARY KEY REFERENCES spaces(id), created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS expenses_space_category_date ON expenses(space_id, category_id, date DESC, created_at DESC, id DESC);
