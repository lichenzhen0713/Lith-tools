import { all, get, nowIso, run, transaction } from '../db/client.js';
import { config } from '../config.js';

const MAIL_PREFIX = 'mail.';
const AI_PREFIX = 'ai.';

let cache: Map<string, string> | null = null;

function readAll(): Map<string, string> {
  if (cache) return cache;
  const rows = all<{ key: string; value: string }>('SELECT key, value FROM settings');
  cache = new Map(rows.map((row) => [row.key, row.value]));
  return cache;
}

function set(key: string, value: string): void {
  run(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    key,
    value,
    nowIso(),
  );
}

function remove(key: string): void {
  run('DELETE FROM settings WHERE key = ?', key);
}

function pick(key: string, fallback: string): string {
  const value = readAll().get(key);
  return value === undefined ? fallback : value;
}

function hasPrefix(prefix: string): boolean {
  for (const key of readAll().keys()) {
    if (key.startsWith(prefix)) return true;
  }
  return false;
}

function updatedAt(prefix: string): string | null {
  const row = get<{ value: string | null }>(
    'SELECT MAX(updated_at) AS value FROM settings WHERE key LIKE ?',
    `${prefix}%`,
  );
  return row?.value ?? null;
}

export interface MailSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  configured: boolean;
  source: 'db' | 'env' | 'none';
  updatedAt: string | null;
}

export interface AiSettings {
  apiKey: string;
  baseUrl: string;
  chatModel: string;
  reasoningModel: string;
  configured: boolean;
  source: 'db' | 'env' | 'none';
  updatedAt: string | null;
}

export function mailSettings(): MailSettings {
  const env = config.smtp;
  const host = pick('mail.host', env.host).trim();
  const user = pick('mail.user', env.user).trim();
  const pass = pick('mail.pass', env.pass);
  const port = Number(pick('mail.port', String(env.port))) || env.port;
  const secure = pick('mail.secure', String(env.secure)) === 'true';
  const from = pick('mail.from', env.from).trim();
  const source = hasPrefix(MAIL_PREFIX) ? 'db' : env.host && env.user ? 'env' : 'none';
  return {
    host,
    port,
    secure,
    user,
    pass,
    from,
    configured: Boolean(host && user),
    source,
    updatedAt: updatedAt(MAIL_PREFIX),
  };
}

export function aiSettings(): AiSettings {
  const env = config.deepseek;
  const apiKey = pick('ai.apiKey', env.apiKey).trim();
  const baseUrl = (pick('ai.baseUrl', env.baseUrl).trim() || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
  const chatModel = pick('ai.chatModel', env.chatModel).trim() || 'deepseek-chat';
  const reasoningModel = pick('ai.reasoningModel', env.reasoningModel).trim() || 'deepseek-reasoner';
  const source = hasPrefix(AI_PREFIX) ? 'db' : env.apiKey ? 'env' : 'none';
  return {
    apiKey,
    baseUrl,
    chatModel,
    reasoningModel,
    configured: Boolean(apiKey),
    source,
    updatedAt: updatedAt(AI_PREFIX),
  };
}

export interface MailInput {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
  pass?: string;
  clearPassword?: boolean;
}

export function saveMailSettings(input: MailInput): MailSettings {
  transaction(() => {
    set('mail.host', input.host.trim());
    set('mail.port', String(input.port));
    set('mail.secure', String(input.secure));
    set('mail.user', input.user.trim());
    set('mail.from', input.from.trim());
    if (input.clearPassword) remove('mail.pass');
    else if (input.pass?.trim()) set('mail.pass', input.pass.trim());
  });
  cache = null;
  return mailSettings();
}

export interface AiInput {
  baseUrl: string;
  chatModel: string;
  reasoningModel: string;
  apiKey?: string;
  clearApiKey?: boolean;
}

export function saveAiSettings(input: AiInput): AiSettings {
  transaction(() => {
    set('ai.baseUrl', input.baseUrl.trim().replace(/\/+$/, '') || 'https://api.deepseek.com/v1');
    set('ai.chatModel', input.chatModel.trim() || 'deepseek-chat');
    set('ai.reasoningModel', input.reasoningModel.trim() || 'deepseek-reasoner');
    if (input.clearApiKey) remove('ai.apiKey');
    else if (input.apiKey?.trim()) set('ai.apiKey', input.apiKey.trim());
  });
  cache = null;
  return aiSettings();
}

/** Safe view for the admin UI: secrets are reported as flags, never returned. */
export function adminSettingsView() {
  const mail = mailSettings();
  const ai = aiSettings();
  return {
    mail: {
      host: mail.host,
      port: mail.port,
      secure: mail.secure,
      user: mail.user,
      from: mail.from,
      configured: mail.configured,
      hasPassword: Boolean(mail.pass),
      source: mail.source,
      updatedAt: mail.updatedAt,
    },
    ai: {
      baseUrl: ai.baseUrl,
      chatModel: ai.chatModel,
      reasoningModel: ai.reasoningModel,
      configured: ai.configured,
      hasApiKey: Boolean(ai.apiKey),
      apiKeyHint: ai.apiKey ? `${ai.apiKey.slice(0, 3)}…${ai.apiKey.slice(-4)}` : '',
      source: ai.source,
      updatedAt: ai.updatedAt,
    },
    env: {
      mailConfigured: Boolean(config.smtp.host && config.smtp.user),
      aiConfigured: Boolean(config.deepseek.apiKey),
    },
  };
}
