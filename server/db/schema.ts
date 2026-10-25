import { getDb } from './client.js';

/**
 * Ordered migrations. Each entry is applied once and recorded through
 * `PRAGMA user_version`. Never edit an applied migration — append a new one.
 */
interface Migration {
  version: number;
  name: string;
  sql: string;
}

const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial schema',
    sql: /* sql */ `
      CREATE TABLE users (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        username         TEXT    NOT NULL UNIQUE,
        email            TEXT    NOT NULL UNIQUE COLLATE NOCASE,
        password_hash    TEXT    NOT NULL,
        role             INTEGER NOT NULL DEFAULT 0 CHECK (role IN (0, 1, 2)),
        created_at       TEXT    NOT NULL,
        email_verified_at TEXT,
        banned_until     TEXT,
        ban_reason       TEXT,
        last_ip          TEXT
      );
      CREATE INDEX idx_users_role ON users(role);

      CREATE TABLE sessions (
        id          TEXT    PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at  TEXT    NOT NULL,
        expires_at  TEXT    NOT NULL,
        ip          TEXT,
        user_agent  TEXT
      );
      CREATE INDEX idx_sessions_user ON sessions(user_id);
      CREATE INDEX idx_sessions_expires ON sessions(expires_at);

      CREATE TABLE email_verifications (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        email              TEXT    NOT NULL COLLATE NOCASE,
        verification_code  TEXT    NOT NULL,
        attempts           INTEGER NOT NULL DEFAULT 0,
        created_at         TEXT    NOT NULL,
        expires_at         TEXT    NOT NULL,
        consumed_at        TEXT
      );
      CREATE INDEX idx_email_verifications_email ON email_verifications(email, expires_at);

      CREATE TABLE password_resets (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        email       TEXT    NOT NULL COLLATE NOCASE,
        token_hash  TEXT    NOT NULL UNIQUE,
        created_at  TEXT    NOT NULL,
        expires_at  TEXT    NOT NULL,
        used_at     TEXT
      );

      CREATE TABLE tool_categories (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        slug        TEXT    NOT NULL UNIQUE,
        name        TEXT    NOT NULL,
        icon        TEXT    NOT NULL DEFAULT 'Sparkles',
        description TEXT    NOT NULL DEFAULT '',
        sort_order  INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE tools (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        slug        TEXT    UNIQUE,
        name        TEXT    NOT NULL,
        description TEXT    NOT NULL DEFAULT '',
        link        TEXT    NOT NULL DEFAULT '',
        category_id INTEGER REFERENCES tool_categories(id) ON DELETE SET NULL,
        icon        TEXT    NOT NULL DEFAULT 'Sparkles',
        is_external INTEGER NOT NULL DEFAULT 0,
        disabled    INTEGER NOT NULL DEFAULT 0,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT    NOT NULL
      );
      CREATE INDEX idx_tools_category ON tools(category_id, sort_order);

      CREATE TABLE categories (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT    NOT NULL UNIQUE,
        created_at TEXT    NOT NULL
      );

      CREATE TABLE blogs (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        title       TEXT    NOT NULL,
        content     TEXT    NOT NULL,
        summary     TEXT    NOT NULL DEFAULT '',
        author_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        is_public   INTEGER NOT NULL DEFAULT 1,
        views       INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT    NOT NULL,
        latest_at   TEXT    NOT NULL
      );
      CREATE INDEX idx_blogs_author ON blogs(author_id);
      CREATE INDEX idx_blogs_category ON blogs(category_id);
      CREATE INDEX idx_blogs_latest ON blogs(is_public, latest_at DESC);

      CREATE TABLE blog_comments (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        blog_id    INTEGER NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        comment    TEXT    NOT NULL,
        created_at TEXT    NOT NULL
      );
      CREATE INDEX idx_blog_comments_blog ON blog_comments(blog_id, created_at);

      CREATE TABLE blog_likes (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        blog_id    INTEGER NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT    NOT NULL,
        UNIQUE (blog_id, user_id)
      );

      CREATE TABLE blog_submissions (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        title       TEXT    NOT NULL,
        content     TEXT    NOT NULL,
        author_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status      TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        created_at  TEXT    NOT NULL,
        reviewed_at TEXT,
        reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX idx_blog_submissions_status ON blog_submissions(status, created_at DESC);

      CREATE TABLE forums (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT    NOT NULL UNIQUE,
        description TEXT    NOT NULL DEFAULT '',
        created_at  TEXT    NOT NULL
      );

      CREATE TABLE threads (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        forum_id   INTEGER NOT NULL REFERENCES forums(id) ON DELETE CASCADE,
        title      TEXT    NOT NULL,
        author_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT    NOT NULL,
        updated_at TEXT    NOT NULL
      );
      CREATE INDEX idx_threads_forum ON threads(forum_id, updated_at DESC);

      CREATE TABLE posts (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id  INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
        author_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content    TEXT    NOT NULL,
        created_at TEXT    NOT NULL
      );
      CREATE INDEX idx_posts_thread ON posts(thread_id, created_at);

      CREATE TABLE chat_messages (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
        username   TEXT    NOT NULL,
        content    TEXT    NOT NULL,
        created_at TEXT    NOT NULL
      );
      CREATE INDEX idx_chat_created ON chat_messages(created_at DESC);

      CREATE TABLE user_feedback (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
        username   TEXT    NOT NULL,
        rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        feedback   TEXT    NOT NULL,
        status     TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
        created_at TEXT    NOT NULL
      );
      CREATE INDEX idx_feedback_status ON user_feedback(status, created_at DESC);

      CREATE TABLE user_submissions (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
        username        TEXT    NOT NULL,
        tool_name       TEXT    NOT NULL,
        description     TEXT    NOT NULL DEFAULT '',
        tool_link       TEXT    NOT NULL DEFAULT '',
        status          TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        ip_address      TEXT    NOT NULL DEFAULT '',
        created_at      TEXT    NOT NULL,
        reviewed_at     TEXT,
        reviewed_by     INTEGER REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX idx_submissions_status ON user_submissions(status, created_at DESC);

      CREATE TABLE banned_ips (
        ip_address    TEXT    PRIMARY KEY,
        reason        TEXT    NOT NULL DEFAULT '',
        banned_until  TEXT    NOT NULL,
        created_at    TEXT    NOT NULL,
        banned_by     INTEGER REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE ban_history (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        ip_address    TEXT    NOT NULL,
        reason        TEXT    NOT NULL DEFAULT '',
        banned_until  TEXT    NOT NULL,
        banned_at     TEXT    NOT NULL,
        unban_time    TEXT,
        admin_id      INTEGER REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX idx_ban_history_time ON ban_history(unban_time DESC);

      CREATE TABLE access_logs (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        ip_address    TEXT    NOT NULL UNIQUE,
        access_time   TEXT    NOT NULL,
        access_count  INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX idx_access_logs_time ON access_logs(access_time DESC);

      CREATE TABLE temporary_access_logs (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        ip_address    TEXT    NOT NULL UNIQUE,
        access_time   TEXT    NOT NULL,
        access_count  INTEGER NOT NULL DEFAULT 1
      );
    `,
  },
  {
    version: 2,
    name: 'runtime settings',
    sql: /* sql */ `
      CREATE TABLE settings (
        key         TEXT PRIMARY KEY,
        value       TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
    `,
  },
  {
    version: 3,
    name: 'oauth account links',
    sql: /* sql */ `
      -- 第三方 OAuth 账号与本地用户的绑定。provider_user_id 存 LCZOJ 的永久 sub
      -- （不是可复用的 uid），一个本地用户可绑定多个第三方账号。
      CREATE TABLE oauth_accounts (
        provider            TEXT    NOT NULL,
        provider_user_id    TEXT    NOT NULL,
        user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider_username   TEXT    NOT NULL DEFAULT '',
        provider_email      TEXT    NOT NULL DEFAULT '',
        linked_at           TEXT    NOT NULL,
        PRIMARY KEY (provider, provider_user_id)
      );
      CREATE INDEX idx_oauth_accounts_user ON oauth_accounts(user_id);
    `,
  },
];

export function migrate(): void {
  const db = getDb();
  const current = Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version ?? 0);
  for (const migration of migrations) {
    if (migration.version <= current) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(migration.sql);
      db.exec(`PRAGMA user_version = ${migration.version}`);
      db.exec('COMMIT');
      console.log(`[db] applied migration ${migration.version}: ${migration.name}`);
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}
