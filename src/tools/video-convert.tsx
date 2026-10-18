import { useEffect, useRef, useState } from 'react';
import { Download, Film, Image as ImageIcon, Music4, RotateCcw, Upload, X } from 'lucide-react';
import { Actions, Hint, KeyValue, Panel, ToolSplit } from './kit';
import { Alert, Button, EmptyState, Spinner } from '../components/ui';
import { cn, download, formatBytes, readFileAsArrayBuffer } from '../lib/utils';
import { useToast } from '../lib/toast';

const MAX_FILE = 200 * 1024 * 1024;

const VIDEO_ACCEPT = 'video/*,.mp4,.webm,.ogv,.ogg,.mov,.m4v,.mkv,.avi';

interface VideoMeta {
  duration: number;
  width: number;
  height: number;
  type: string;
  size: number;
}

interface AudioResult {
  blob: Blob;
  url: string;
  duration: number;
  sampleRate: number;
  channels: number;
}

interface FrameResult {
  blob: Blob;
  url: string;
  width: number;
  height: number;
  time: number;
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
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * blockAlign, true);
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

export default function VideoConvertTool() {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const frameUrlRef = useRef<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const [audio, setAudio] = useState<AudioResult | null>(null);
  const [audioBusy, setAudioBusy] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  const [frame, setFrame] = useState<FrameResult | null>(null);
  const [frameBusy, setFrameBusy] = useState(false);
  const [frameError, setFrameError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setVideoUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    return () => {
      const video = videoRef.current;
      if (video) video.pause();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      if (frameUrlRef.current) URL.revokeObjectURL(frameUrlRef.current);
      audioUrlRef.current = null;
      frameUrlRef.current = null;
    };
  }, []);

  const clearAudio = () => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setAudio(null);
    setAudioError(null);
  };

  const clearFrame = () => {
    if (frameUrlRef.current) {
      URL.revokeObjectURL(frameUrlRef.current);
      frameUrlRef.current = null;
    }
    setFrame(null);
    setFrameError(null);
  };

  const acceptFile = (next: File | null) => {
    setLoadError(null);
    clearAudio();
    clearFrame();
    setMeta(null);
    setCurrentTime(0);
    if (!next) {
      setFile(null);
      return;
    }
    const looksVideo =
      next.type.startsWith('video/') || /\.(mp4|webm|ogv|ogg|mov|m4v|mkv|avi)$/i.test(next.name);
    if (!looksVideo) {
      setLoadError('请选择视频文件：MP4、WebM、MOV 等。');
      return;
    }
    if (next.size === 0) {
      setLoadError('该文件为空，请更换文件。');
      return;
    }
    if (next.size > MAX_FILE) {
      setLoadError(`文件体积 ${formatBytes(next.size)} 超过 200 MB 上限，请先裁剪或压缩。`);
      return;
    }
    setFile(next);
  };

  const resetAll = () => {
    setFile(null);
    setMeta(null);
    setLoadError(null);
    setCurrentTime(0);
    clearAudio();
    clearFrame();
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleMetadata = () => {
    const video = videoRef.current;
    if (!video || !file) return;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) {
      setLoadError('无法读取画面尺寸，可能是纯音频文件或该视频编码不受支持。');
      return;
    }
    setMeta({
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      width,
      height,
      type: file.type || '未知类型',
      size: file.size,
    });
    setLoadError(null);
    if (Number.isFinite(video.duration) && video.duration > 0.2 && video.currentTime === 0) {
      // Seeking slightly forces most browsers to paint a real frame for the poster area.
      video.currentTime = Math.min(0.1, video.duration / 2);
    }
  };

  const seek = (value: number) => {
    const video = videoRef.current;
    if (!video) return;
    const max = Number.isFinite(video.duration) ? video.duration : value;
    const next = Math.max(0, Math.min(value, max));
    try {
      video.currentTime = next;
    } catch {
      // Seeking before metadata is ready — ignore.
    }
    setCurrentTime(next);
  };

  const extractAudio = async () => {
    if (!file) return;
    clearAudio();
    setAudioBusy(true);
    let context: AudioContext | null = null;
    try {
      const arrayBuffer = await readFileAsArrayBuffer(file);
      context = new AudioContext();
      const buffer = await context.decodeAudioData(arrayBuffer).catch(() => null);
      if (!buffer) {
        setAudioError('该视频可能没有音轨，或浏览器不支持其音频编码（如 AC-3 / DTS）。');
        return;
      }
      if (!buffer.length || buffer.duration <= 0) {
        setAudioError('音轨为空（时长为 0），无法导出。');
        return;
      }
      const blob = encodeWav(buffer);
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      setAudio({
        blob,
        url,
        duration: buffer.duration,
        sampleRate: buffer.sampleRate,
        channels: buffer.numberOfChannels,
      });
      toast.success('已提取音频为 WAV');
    } catch (cause) {
      setAudioError(cause instanceof Error ? cause.message : '提取音频失败，请重试。');
    } finally {
      if (context) void context.close().catch(() => undefined);
      setAudioBusy(false);
    }
  };

  const captureFrame = async () => {
    const video = videoRef.current;
    if (!video || !meta) return;
    if (!video.videoWidth || !video.videoHeight) {
      setFrameError('还没有可截取的画面，请先播放或拖动进度条。');
      return;
    }
    if (video.readyState < 2) {
      setFrameError('视频画面尚未加载完成，请稍候重试。');
      return;
    }
    setFrameBusy(true);
    setFrameError(null);
    try {
      const width = video.videoWidth;
      const height = video.videoHeight;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('当前浏览器不支持 Canvas 2D，无法截取画面。');
      context.drawImage(video, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('PNG 编码失败，请重试。');
      if (frameUrlRef.current) URL.revokeObjectURL(frameUrlRef.current);
      const url = URL.createObjectURL(blob);
      frameUrlRef.current = url;
      setFrame({ blob, url, width, height, time: video.currentTime });
      toast.success('已截取当前帧');
    } catch (cause) {
      setFrameError(cause instanceof Error ? cause.message : '截取画面失败，请重试。');
    } finally {
      setFrameBusy(false);
    }
  };

  const baseName = file
    ? file.name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'video'
    : 'video';
  const audioName = `${baseName}-audio.wav`;
  const frameName = `${baseName}-${Math.round((frame?.time ?? currentTime) * 100) / 100}s.png`;
  const duration = meta?.duration ?? 0;

  return (
    <div className="space-y-4">
      <ToolSplit>
        <Panel title="选择视频" description="视频不会上传，解码、截图全部在本地完成。">
          <div className="space-y-4">
            <input
              ref={inputRef}
              type="file"
              accept={VIDEO_ACCEPT}
              className="hidden"
              onChange={(event) => {
                acceptFile(event.target.files?.[0] ?? null);
                event.currentTarget.value = '';
              }}
            />

            {file ? (
              <div className="flex items-center gap-3 rounded-xl border p-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                  <Film className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                  <p className="text-xs subtle">
                    {file.type || '未知类型'} · {formatBytes(file.size)}
                  </p>
                </div>
                <Button variant="ghost" size="sm" icon={X} onClick={resetAll}>
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
                <p className="text-sm muted">拖拽视频到此处，或</p>
                <Button className="mt-2" size="sm" icon={Film} onClick={() => inputRef.current?.click()}>
                  选择视频文件
                </Button>
                <p className="mt-3 text-xs subtle">支持 MP4 / WebM / MOV 等，最大 200 MB</p>
              </div>
            )}

            {loadError ? <Alert tone="error">{loadError}</Alert> : null}

            {meta ? (
              <KeyValue
                items={[
                  { label: '时长', value: formatDuration(meta.duration) },
                  { label: '分辨率', value: `${meta.width} × ${meta.height} px` },
                  { label: '文件体积', value: formatBytes(meta.size) },
                  { label: 'MIME 类型', value: meta.type },
                ]}
              />
            ) : null}

            <Alert tone="info" title="不做假转码">
              浏览器无法仅靠 JavaScript 把 MP4 重新编码成 MKV / AVI / MOV。本工具只做三件真实可靠的事：
              提取音轨为 WAV、截取当前帧为 PNG、下载原始文件；不会把原文件改成其他扩展名冒充已转换。
            </Alert>

            <Hint>
              提取音频会解码整个视频文件，超大视频可能占用较多内存并耗时较久；若音轨为 AC-3 / DTS
              等浏览器不支持的编码，将无法提取。
            </Hint>
          </div>
        </Panel>

        <Panel title="画面预览" description="播放或拖动进度条选择画面，然后截取当前帧。">
          {!file ? (
            <EmptyState
              icon={Film}
              title="先选择一个视频"
              description="上传后可查看时长、分辨率，并导出音频、当前帧或原文件。"
            />
          ) : loadError ? (
            <Alert tone="warning" title="无法预览">
              如果视频无法播放，仍然可以尝试下载原文件。
            </Alert>
          ) : (
            <div className="space-y-4">
              {videoUrl ? (
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  playsInline
                  preload="auto"
                  className="w-full rounded-xl border bg-black"
                  onLoadedMetadata={handleMetadata}
                  onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                  onError={() =>
                    setLoadError(
                      '浏览器无法播放该视频，编码可能不受支持（例如 HEVC / AV1 或部分封装格式）。',
                    )
                  }
                />
              ) : (
                <div className="flex items-center gap-2 py-10 text-sm subtle">
                  <Spinner /> 正在载入视频…
                </div>
              )}

              {meta ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs subtle">
                    <span>当前位置</span>
                    <span className="font-mono">
                      {currentTime.toFixed(1)}s / {duration.toFixed(1)}s
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={duration > 0 ? duration : 1}
                    step={0.05}
                    value={Math.min(currentTime, duration || 1)}
                    onChange={(event) => seek(Number(event.target.value))}
                    aria-label="视频进度"
                    className="w-full accent-indigo-600"
                    disabled={duration <= 0}
                  />
                </div>
              ) : null}
            </div>
          )}
        </Panel>
      </ToolSplit>

      <Panel title="导出" description="三项操作互不影响，结果只在本地生成。">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Music4 className="size-4 text-indigo-600 dark:text-indigo-400" />
              音频 → WAV
            </div>
            <p className="text-xs muted">提取视频中的音轨，编码为 16-bit PCM WAV。</p>
            <Actions className="mt-3">
              <Button
                size="sm"
                icon={Music4}
                loading={audioBusy}
                disabled={!file || audioBusy}
                onClick={() => void extractAudio()}
              >
                提取音频
              </Button>
              {audio ? (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Download}
                  onClick={() => {
                    download(audio.blob, audioName);
                    toast.success('已开始下载 WAV');
                  }}
                >
                  下载 WAV
                </Button>
              ) : null}
            </Actions>
            {audioError ? (
              <Alert tone="error" className="mt-3">
                {audioError}
              </Alert>
            ) : null}
            {audio ? (
              <div className="mt-3 space-y-2">
                <audio controls preload="metadata" src={audio.url} className="w-full">
                  当前浏览器不支持音频播放。
                </audio>
                <p className="text-xs subtle">
                  {formatDuration(audio.duration)} · {audio.sampleRate} Hz ·{' '}
                  {channelLabel(audio.channels)} · {formatBytes(audio.blob.size)}
                </p>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <ImageIcon className="size-4 text-indigo-600 dark:text-indigo-400" />
              当前帧 → PNG
            </div>
            <p className="text-xs muted">按视频原始分辨率截取当前画面，无损 PNG。</p>
            <Actions className="mt-3">
              <Button
                size="sm"
                icon={ImageIcon}
                loading={frameBusy}
                disabled={!meta || frameBusy}
                onClick={() => void captureFrame()}
              >
                截取当前帧
              </Button>
              {frame ? (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Download}
                  onClick={() => {
                    download(frame.blob, frameName);
                    toast.success('已开始下载 PNG');
                  }}
                >
                  下载 PNG
                </Button>
              ) : null}
            </Actions>
            {frameError ? (
              <Alert tone="error" className="mt-3">
                {frameError}
              </Alert>
            ) : null}
            {frame ? (
              <div className="mt-3 space-y-2">
                <img
                  src={frame.url}
                  alt="截取画面预览"
                  className="max-h-40 w-full rounded-lg border object-contain"
                />
                <p className="text-xs subtle">
                  {frame.width} × {frame.height} px · {frame.time.toFixed(2)}s ·{' '}
                  {formatBytes(frame.blob.size)}
                </p>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Download className="size-4 text-indigo-600 dark:text-indigo-400" />
              原始文件
            </div>
            <p className="text-xs muted">不重新编码，直接保存上传的视频原文件。</p>
            <Actions className="mt-3">
              <Button
                variant="secondary"
                size="sm"
                icon={Download}
                disabled={!file}
                onClick={() => {
                  if (!file) return;
                  download(file, file.name);
                  toast.success('已开始下载原文件');
                }}
              >
                下载原文件
              </Button>
              <Button variant="ghost" size="sm" icon={RotateCcw} disabled={!file} onClick={resetAll}>
                清空
              </Button>
            </Actions>
            {file ? <p className="mt-3 text-xs subtle">文件名：{file.name}</p> : null}
          </div>
        </div>
      </Panel>
    </div>
  );
}
