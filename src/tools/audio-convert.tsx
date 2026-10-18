import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioLines, Download, Music4, RotateCcw, Upload, X } from 'lucide-react';
import { Actions, Hint, KeyValue, Panel, ToolSplit } from './kit';
import { Alert, Button, EmptyState, Spinner } from '../components/ui';
import { cn, download, formatBytes, formatNumber, readFileAsArrayBuffer } from '../lib/utils';
import { useToast } from '../lib/toast';

const MAX_FILE = 60 * 1024 * 1024;

const AUDIO_ACCEPT =
  'audio/*,.mp3,.wav,.ogg,.oga,.m4a,.aac,.flac,.webm,.opus,.aiff,.aif,.wma';

interface WavResult {
  blob: Blob;
  url: string;
  duration: number;
  sampleRate: number;
  channels: number;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
}

function channelLabel(channels: number): string {
  if (channels === 1) return '单声道';
  if (channels === 2) return '立体声';
  return `${channels} 声道`;
}

/** Encode an AudioBuffer as a 16-bit PCM WAV file (little-endian, RIFF). */
function encodeWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels;
  const frameCount = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataSize = frameCount * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  const writeAscii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);

  const channelData: Float32Array[] = [];
  for (let channel = 0; channel < channels; channel += 1) {
    channelData.push(buffer.getChannelData(channel));
  }

  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][frame]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

export default function AudioConvertTool() {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const urlRef = useRef<string | null>(null);
  const runRef = useRef(0);

  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<WavResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const releaseUrl = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  const decode = useCallback(
    async (target: File) => {
      const runId = runRef.current + 1;
      runRef.current = runId;
      releaseUrl();
      setResult(null);
      setError(null);
      setBusy(true);

      let context: AudioContext | null = null;
      try {
        const arrayBuffer = await readFileAsArrayBuffer(target);
        if (runRef.current !== runId) return;

        context = new AudioContext();
        contextRef.current = context;

        const audioBuffer = await context.decodeAudioData(arrayBuffer).catch(() => null);
        if (runRef.current !== runId) return;
        if (!audioBuffer) {
          setError(
            '浏览器无法解码该音频。可能是编码不受支持（如部分 FLAC、APE、WMA），或文件已损坏。请先转换为 WAV / MP3 / OGG 后重试。',
          );
          return;
        }
        if (!audioBuffer.length || audioBuffer.duration <= 0) {
          setError('音频内容为空（时长为 0），无法导出。');
          return;
        }

        const blob = encodeWav(audioBuffer);
        const url = URL.createObjectURL(blob);
        if (runRef.current !== runId) {
          URL.revokeObjectURL(url);
          return;
        }
        urlRef.current = url;
        setResult({
          blob,
          url,
          duration: audioBuffer.duration,
          sampleRate: audioBuffer.sampleRate,
          channels: audioBuffer.numberOfChannels,
        });
      } catch (cause) {
        if (runRef.current !== runId) return;
        setError(cause instanceof Error ? cause.message : '音频处理失败，请重试。');
      } finally {
        if (context) {
          void context.close().catch(() => undefined);
          if (contextRef.current === context) contextRef.current = null;
        }
        if (runRef.current === runId) setBusy(false);
      }
    },
    [releaseUrl],
  );

  useEffect(() => {
    if (!file) return;
    void decode(file);
  }, [file, decode]);

  useEffect(() => {
    return () => {
      runRef.current += 1;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
      const context = contextRef.current;
      if (context) void context.close().catch(() => undefined);
      contextRef.current = null;
    };
  }, []);

  const acceptFile = (next: File | null) => {
    setError(null);
    // Invalidate any in-flight decode before swapping the source file.
    runRef.current += 1;
    if (!next) {
      setFile(null);
      setBusy(false);
      releaseUrl();
      setResult(null);
      return;
    }
    const looksAudio =
      next.type.startsWith('audio/') ||
      /\.(mp3|wav|wave|ogg|oga|m4a|aac|flac|webm|opus|aiff?|wma)$/i.test(next.name);
    if (!looksAudio) {
      setError('请选择音频文件：WAV、MP3、OGG、M4A、FLAC 等。');
      return;
    }
    if (next.size === 0) {
      setError('该文件为空，请更换文件。');
      return;
    }
    if (next.size > MAX_FILE) {
      setError(`文件体积 ${formatBytes(next.size)} 超过 60 MB 上限，请压缩或裁剪后再试。`);
      return;
    }
    setFile(next);
  };

  const baseName = file
    ? file.name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'audio'
    : 'audio';
  const wavName = `${baseName}.wav`;

  return (
    <div className="space-y-4">
      <ToolSplit>
        <Panel title="选择音频" description="文件只在浏览器内解码，不会上传到服务器。">
          <div className="space-y-4">
            <input
              ref={inputRef}
              type="file"
              accept={AUDIO_ACCEPT}
              className="hidden"
              onChange={(event) => {
                acceptFile(event.target.files?.[0] ?? null);
                event.currentTarget.value = '';
              }}
            />

            {file ? (
              <div className="flex items-center gap-3 rounded-xl border p-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                  <Music4 className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                  <p className="text-xs subtle">
                    {file.type || '未知类型'} · {formatBytes(file.size)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={X}
                  onClick={() => {
                    setFile(null);
                    setResult(null);
                    setError(null);
                    releaseUrl();
                  }}
                >
                  移除
                </Button>
              </div>
            ) : (
              <div
                className={cn(
                  'rounded-xl border border-dashed px-4 py-8 text-center transition-colors',
                  dragging ? 'border-indigo-400 bg-indigo-50/70 dark:bg-indigo-500/10' : 'bg-[var(--hover-bg)]',
                )}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  acceptFile(event.dataTransfer.files?.[0] ?? null);
                }}
              >
                <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                  <Upload className="size-5" />
                </div>
                <p className="text-sm muted">拖拽音频到此处，或</p>
                <Button className="mt-2" size="sm" icon={AudioLines} onClick={() => inputRef.current?.click()}>
                  选择音频文件
                </Button>
                <p className="mt-3 text-xs subtle">支持 WAV / MP3 / OGG / M4A / FLAC 等，最大 60 MB</p>
              </div>
            )}

            {file ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" icon={Upload} onClick={() => inputRef.current?.click()}>
                  换一个文件
                </Button>
                {result || error ? (
                  <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => void decode(file)}>
                    重新解码
                  </Button>
                ) : null}
              </div>
            ) : null}

            <Alert tone="info" title="导出格式只有 WAV">
              浏览器能可靠生成的是 <span className="font-mono">16-bit PCM WAV</span>。MP3 / AAC / OGG / FLAC
              编码需要额外的编码器，本项目不内置，因此不会把 WAV 改成 .mp3 后缀来假装转换成功。
            </Alert>

            <Hint>
              WAV 为无压缩格式，体积约为「采样率 × 声道数 × 2 字节 × 秒数」。例如 44.1 kHz 立体声约 10
              MB/分钟，属于正常现象。
            </Hint>
          </div>
        </Panel>

        <Panel title="转换结果" description="解码后的参数与可下载的 WAV 文件。">
          {error ? (
            <Alert tone="error" title="无法完成转换">
              {error}
            </Alert>
          ) : null}

          {busy ? (
            <div className="flex items-center gap-3 rounded-xl border bg-[var(--hover-bg)] px-4 py-8 text-sm muted">
              <Spinner />
              正在解码音频并生成 WAV…
            </div>
          ) : result ? (
            <div className="space-y-4">
              <audio controls preload="metadata" src={result.url} className="w-full">
                当前浏览器不支持音频播放。
              </audio>

              <KeyValue
                items={[
                  { label: '时长', value: `${formatDuration(result.duration)}（${result.duration.toFixed(2)} 秒）` },
                  { label: '采样率', value: `${formatNumber(result.sampleRate)} Hz` },
                  { label: '声道', value: channelLabel(result.channels) },
                  { label: '位深', value: '16-bit PCM' },
                  { label: '输出格式', value: 'WAV（audio/wav）' },
                  {
                    label: '输出体积',
                    value: <span className="font-mono">{formatBytes(result.blob.size)}</span>,
                  },
                  ...(file
                    ? [
                        { label: '原始体积', value: formatBytes(file.size) },
                        {
                          label: '体积变化',
                          value:
                            file.size > 0
                              ? `${result.blob.size >= file.size ? '+' : ''}${(((result.blob.size - file.size) / file.size) * 100).toFixed(1)}%`
                              : '—',
                        },
                      ]
                    : []),
                ]}
              />

              <Actions className="mt-0">
                <Button
                  icon={Download}
                  onClick={() => {
                    download(result.blob, wavName);
                    toast.success('已开始下载 WAV');
                  }}
                >
                  下载 WAV
                </Button>
              </Actions>
              <p className="text-xs subtle">文件名：{wavName}</p>
            </div>
          ) : error ? null : !file ? (
            <EmptyState
              icon={AudioLines}
              title="先选择一个音频文件"
              description="解码完成后可试听并下载为 WAV，全部处理都在你的浏览器中完成。"
            />
          ) : null}
        </Panel>
      </ToolSplit>
    </div>
  );
}
