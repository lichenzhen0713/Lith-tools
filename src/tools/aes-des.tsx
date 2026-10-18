import { useState, type FormEvent } from 'react';
import {
  ArrowDownUp,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LockOpen,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { Field, Hint, Input, KeyValue, Panel, Textarea, ToolSplit } from './kit';
import { Alert, Badge, Button, CopyButton, EmptyState, Tabs } from '../components/ui';
import { download } from '../lib/utils';
import { useToast } from '../lib/toast';

type Mode = 'encrypt' | 'decrypt';

const PREFIX = 'AESGCM1.';
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BITS = 128;
const TAG_BYTES = TAG_BITS / 8;
const ITERATIONS = 210_000;
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function base64ToBytes(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function concatBytes(parts: Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function randomPassword(length = 16): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let result = '';
  for (let index = 0; index < bytes.length; index += 1) {
    result += PASSWORD_ALPHABET[bytes[index] % PASSWORD_ALPHABET.length];
  }
  return result;
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, usages: KeyUsage[]): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    usages,
  );
}

export default function AesDesTool() {
  const [mode, setMode] = useState<Mode>('encrypt');
  const [password, setPassword] = useState('');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const toast = useToast();

  const cryptoAvailable =
    typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.subtle !== 'undefined';
  const strongEnough = password.length >= 12;
  const hasInput = input.trim() !== '';

  function switchMode(next: Mode) {
    setMode(next);
    setOutput('');
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!cryptoAvailable) {
      setError('当前浏览器环境不支持 Web Crypto（crypto.subtle），请通过 HTTPS 或 localhost 访问本站。');
      return;
    }
    if (password.length === 0) {
      setError('请输入密码：密码用于派生 AES 密钥，不会上传或保存。');
      return;
    }
    if (!hasInput) {
      setError(mode === 'encrypt' ? '请输入要加密的明文。' : '请输入要解密的密文。');
      return;
    }

    setBusy(true);
    setError(null);
    setOutput('');

    try {
      if (mode === 'encrypt') {
        const encoder = new TextEncoder();
        const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
        const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
        const key = await deriveKey(password, salt, ['encrypt']);
        const encrypted = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv, tagLength: TAG_BITS },
          key,
          encoder.encode(input),
        );
        const combined = concatBytes([salt, iv, new Uint8Array(encrypted)]);
        setOutput(`${PREFIX}${bytesToBase64(combined)}`);
        toast.success('加密完成，密文已生成');
      } else {
        const trimmed = input.trim();
        const body = (trimmed.startsWith(PREFIX) ? trimmed.slice(PREFIX.length) : trimmed).replace(/\s+/g, '');
        if (!body) {
          setError('密文内容为空。');
          return;
        }
        let payload: Uint8Array<ArrayBuffer>;
        try {
          payload = base64ToBytes(body);
        } catch {
          setError('密文不是有效的 Base64 文本，请检查是否完整复制。');
          return;
        }
        if (payload.length < SALT_BYTES + IV_BYTES + TAG_BYTES) {
          setError('密文长度不足，可能不是本工具生成的密文。');
          return;
        }
        const salt = payload.slice(0, SALT_BYTES);
        const iv = payload.slice(SALT_BYTES, SALT_BYTES + IV_BYTES);
        const data = payload.slice(SALT_BYTES + IV_BYTES);
        try {
          const key = await deriveKey(password, salt, ['decrypt']);
          const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: TAG_BITS }, key, data);
          const text = new TextDecoder('utf-8', { fatal: true }).decode(decrypted);
          setOutput(text);
          toast.success('解密成功');
        } catch {
          setError('解密失败：密码错误，或密文已损坏、被篡改。AES-GCM 校验不通过时会拒绝解密。');
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作失败，请重试。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <ToolSplit>
        <Panel title="AES 加密 / 解密" description="Web Crypto AES-256-GCM + PBKDF2 密码派生，全部在浏览器本地完成。">
          <Tabs<Mode>
            items={[
              { value: 'encrypt', label: '加密' },
              { value: 'decrypt', label: '解密' },
            ]}
            value={mode}
            onChange={switchMode}
            className="mb-4"
          />

          <form className="space-y-4" onSubmit={handleSubmit}>
            <Field
              label="密码"
              htmlFor="aes-password"
              hint="密码仅用于本地派生密钥，不会被保存或上传；建议至少 12 位并混合大小写、数字与符号。"
            >
              <div className="flex items-stretch gap-2">
                <Input
                  id="aes-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="输入用于加密 / 解密的密码"
                  autoComplete={mode === 'encrypt' ? 'new-password' : 'current-password'}
                />
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  title={showPassword ? '隐藏密码' : '显示密码'}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={() => {
                    try {
                      setPassword(randomPassword());
                      setShowPassword(true);
                      toast.info('已生成随机 16 位密码，请妥善保存');
                    } catch {
                      toast.error('无法生成随机密码');
                    }
                  }}
                  aria-label="生成随机密码"
                  title="生成随机密码"
                >
                  <RefreshCw className="size-4" />
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs subtle">密码长度：{password.length} 位</span>
                {password.length > 0 ? (
                  <Badge tone={strongEnough ? 'success' : password.length >= 8 ? 'brand' : 'warning'}>
                    {strongEnough ? '强度较好' : password.length >= 8 ? '强度一般' : '偏弱'}
                  </Badge>
                ) : null}
              </div>
            </Field>

            <Field
              label={mode === 'encrypt' ? '明文' : '密文（Base64）'}
              htmlFor="aes-input"
              hint={
                mode === 'encrypt'
                  ? '支持任意文本（中文、emoji、多行）。加密结果以 AESGCM1. 开头。'
                  : '粘贴本工具生成的密文，以 AESGCM1. 开头；也可省略前缀直接粘贴 Base64。'
              }
            >
              <Textarea
                id="aes-input"
                rows={8}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={
                  mode === 'encrypt' ? '输入要加密的文本…' : '粘贴要解密的密文，例如 AESGCM1.xxxxxxxx…'
                }
                className="min-h-[180px] font-mono text-xs leading-relaxed"
                spellCheck={false}
              />
            </Field>

            {error ? (
              <Alert tone="error" title={mode === 'encrypt' ? '加密未完成' : '解密未完成'}>
                {error}
              </Alert>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="submit"
                loading={busy}
                icon={mode === 'encrypt' ? Lock : LockOpen}
                disabled={!cryptoAvailable}
              >
                {mode === 'encrypt' ? '加密' : '解密'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setInput('');
                  setOutput('');
                  setError(null);
                }}
                disabled={!input && !output}
              >
                清空文本
              </Button>
              <Button
                type="button"
                variant="ghost"
                icon={KeyRound}
                onClick={() => {
                  setPassword('');
                  setOutput('');
                  setError(null);
                }}
                disabled={!password}
              >
                清除密码
              </Button>
            </div>
          </form>
        </Panel>

        <Panel title="结果" description="密文与解密结果均只保存在页面上，刷新后即消失。">
          {output ? (
            <div className="space-y-3">
              <div className="rounded-xl border bg-[var(--hover-bg)] p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs subtle">{mode === 'encrypt' ? '密文（Base64）' : '解密后的明文'}</p>
                  <span className="text-[11px] subtle">{output.length.toLocaleString('zh-CN')} 字符</span>
                </div>
                <pre className="mt-2 max-h-80 overflow-auto font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">
                  {output}
                </pre>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <CopyButton text={output} />
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Download}
                  onClick={() => {
                    download(
                      output,
                      mode === 'encrypt' ? 'ciphertext.txt' : 'plaintext.txt',
                      'text/plain;charset=utf-8',
                    );
                    toast.success('结果已下载');
                  }}
                >
                  下载结果
                </Button>
                {mode === 'encrypt' ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={ArrowDownUp}
                    onClick={() => {
                      switchMode('decrypt');
                      setInput(output);
                      setOutput('');
                    }}
                  >
                    用密文解密
                  </Button>
                ) : null}
              </div>
              {mode === 'decrypt' && output ? (
                <Hint>解密成功说明密码正确，且密文未被修改（AES-GCM 认证标签校验通过）。</Hint>
              ) : null}
            </div>
          ) : (
            <EmptyState
              icon={mode === 'encrypt' ? Lock : LockOpen}
              title={mode === 'encrypt' ? '尚未生成密文' : '尚未解密'}
              description={
                mode === 'encrypt'
                  ? '输入密码与明文后点击「加密」，会使用随机盐与随机 IV 生成 Base64 密文。'
                  : '输入正确密码并粘贴密文后点击「解密」，密码错误或数据被改动都会提示失败。'
              }
            />
          )}
        </Panel>
      </ToolSplit>

      <Panel title="算法与安全说明" description="仅支持 AES-GCM，不提供不安全的 DES。">
        <div className="space-y-4">
          <Alert tone="warning" title="为什么没有 DES？">
            旧版工具使用 crypto-js 的 DES。DES 仅有 56 位有效密钥，且常见实现使用不安全的 ECB 模式，今天可以在极短时间内被暴力破解。本工具只提供
            AES-256-GCM，无法执行 DES 加解密，也不建议继续使用 DES 保护任何数据。
          </Alert>
          <Alert tone="info" title="密文格式">
            输出格式为 <code className="font-mono">AESGCM1.Base64(盐 | IV | 密文)</code>：前 16 字节为随机盐，接着 12
            字节为随机 IV，其余为 AES-GCM 密文（末尾 16 字节为认证标签）。盐与 IV 每次都随机生成，相同明文和密码也会得到不同密文。
          </Alert>
          <KeyValue
            items={[
              { label: '加密算法', value: 'AES-256-GCM（认证加密）' },
              { label: '密钥派生', value: `PBKDF2-HMAC-SHA256，${ITERATIONS.toLocaleString('zh-CN')} 次迭代` },
              { label: '盐 / IV', value: '16 字节随机盐 / 12 字节随机 IV' },
              { label: '认证标签', value: '128 位（16 字节）' },
              { label: '实现方式', value: 'Web Crypto API（crypto.subtle），本地执行' },
            ]}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="success">
              <ShieldCheck className="size-3" /> 明文与密码不会离开浏览器
            </Badge>
            {!cryptoAvailable ? <Badge tone="danger">当前环境不支持 Web Crypto</Badge> : null}
          </div>
          <Hint>
            请妥善保存密码：密码不存储、不上传，忘记密码将无法恢复密文。若需要在其他工具中解密，需按上述格式与 PBKDF2 参数实现。
          </Hint>
        </div>
      </Panel>
    </div>
  );
}
