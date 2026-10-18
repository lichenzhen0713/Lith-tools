import { all, get, nowIso, run } from '../db/client.js';

export interface ActiveBan {
  ip: string;
  bannedUntil: string;
  reason: string;
}

const DAY_MS = 86_400_000;

export function findActiveBan(ip: string): ActiveBan | null {
  const row = get<{ ip_address: string; banned_until: string; reason: string }>(
    'SELECT ip_address, banned_until, reason FROM banned_ips WHERE ip_address = ? AND banned_until > ?',
    ip,
    nowIso(),
  );
  if (!row) return null;
  return { ip: row.ip_address, bannedUntil: row.banned_until, reason: row.reason };
}

export function banIp(ip: string, days: number, reason: string, adminId: number | null): string {
  const bannedUntil = new Date(Date.now() + days * DAY_MS).toISOString();
  run(
    `INSERT INTO banned_ips (ip_address, reason, banned_until, created_at, banned_by)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(ip_address) DO UPDATE SET
       reason = excluded.reason,
       banned_until = excluded.banned_until,
       created_at = excluded.created_at,
       banned_by = excluded.banned_by`,
    ip,
    reason,
    bannedUntil,
    nowIso(),
    adminId,
  );
  return bannedUntil;
}

export function unbanIp(ip: string, adminId: number | null): boolean {
  const row = get<{ ip_address: string; banned_until: string; reason: string }>(
    'SELECT ip_address, banned_until, reason FROM banned_ips WHERE ip_address = ?',
    ip,
  );
  if (!row) return false;
  run(
    `INSERT INTO ban_history (ip_address, reason, banned_until, banned_at, unban_time, admin_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    row.ip_address,
    row.reason,
    row.banned_until,
    nowIso(),
    nowIso(),
    adminId,
  );
  run('DELETE FROM banned_ips WHERE ip_address = ?', ip);
  return true;
}

/**
 * Move expired bans into the history table. Mirrors the original dashboard
 * sweep, but runs periodically instead of only when the admin page loads.
 */
export function sweepExpiredBans(): number {
  const now = nowIso();
  const expired = all<{ ip_address: string; banned_until: string; reason: string; created_at: string }>(
    'SELECT ip_address, banned_until, reason, created_at FROM banned_ips WHERE banned_until <= ?',
    now,
  );
  for (const row of expired) {
    run(
      `INSERT INTO ban_history (ip_address, reason, banned_until, banned_at, unban_time, admin_id)
       VALUES (?, ?, ?, ?, ?, NULL)`,
      row.ip_address,
      row.reason,
      row.banned_until,
      row.created_at,
      now,
    );
    run('DELETE FROM banned_ips WHERE ip_address = ?', row.ip_address);
  }
  return expired.length;
}

/**
 * Two-tier visit counter, preserving the original promotion semantics:
 * 1st/2nd request → temporary row; 3rd → promoted with the accumulated count.
 */
export function logAccess(ip: string): void {
  const now = nowIso();
  const temp = get<{ id: number; access_count: number }>(
    'SELECT id, access_count FROM temporary_access_logs WHERE ip_address = ?',
    ip,
  );

  if (temp) {
    if (temp.access_count >= 2) {
      run(
        `INSERT INTO access_logs (ip_address, access_time, access_count) VALUES (?, ?, ?)
         ON CONFLICT(ip_address) DO UPDATE SET
           access_count = access_count + excluded.access_count,
           access_time = excluded.access_time`,
        ip,
        now,
        temp.access_count,
      );
      run('DELETE FROM temporary_access_logs WHERE id = ?', temp.id);
    } else {
      run(
        'UPDATE temporary_access_logs SET access_count = access_count + 1, access_time = ? WHERE id = ?',
        now,
        temp.id,
      );
    }
    return;
  }

  const existing = get<{ id: number }>('SELECT id FROM access_logs WHERE ip_address = ?', ip);
  if (!existing) {
    run('INSERT INTO temporary_access_logs (ip_address, access_time, access_count) VALUES (?, ?, 1)', ip, now);
  } else {
    run(
      'UPDATE access_logs SET access_count = access_count + 1, access_time = ? WHERE ip_address = ?',
      now,
      ip,
    );
  }
}

export function banPageHtml(ban: ActiveBan): string {
  const until = new Date(ban.bannedUntil).toLocaleString('zh-CN', { hour12: false });
  const reason = ban.reason
    ? ban.reason.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
    : '未填写';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>403 · 访问受限</title>
<style>
  :root{color-scheme:light dark}
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f8fb;color:#101828;
       font-family:-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;padding:24px}
  .card{max-width:460px;width:100%;background:#fff;border:1px solid #e7eaf0;border-radius:20px;
        padding:36px;box-shadow:0 20px 60px -30px rgba(16,24,40,.25);text-align:center}
  .code{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#e11d48;font-weight:700}
  h1{font-size:24px;margin:12px 0 8px;letter-spacing:-.02em}
  p{color:#5b6472;line-height:1.7;margin:8px 0}
  .info{background:#f8fafc;border:1px solid #eef1f6;border-radius:12px;padding:14px 16px;margin:20px 0;text-align:left;font-size:14px}
  .info b{color:#101828}
  @media (prefers-color-scheme:dark){body{background:#0b0d12;color:#f1f3f7}.card{background:#141822;border-color:#232936}p{color:#a8b0c0}.info{background:#171c26;border-color:#232936}.info b{color:#f1f3f7}}
</style></head><body>
  <div class="card">
    <div class="code">403 Forbidden</div>
    <h1>您的 IP 地址已被封禁</h1>
    <p>当前 IP 暂时无法访问 Lith Tools。</p>
    <div class="info">
      <p><b>封禁原因：</b>${reason}</p>
      <p><b>解封时间：</b>${until}</p>
    </div>
    <p>如果您认为这是一个错误，请联系网站管理员。</p>
  </div>
</body></html>`;
}
