/**
 * Turns ffprobe's JSON (`-show_format -show_streams`) into the few facts the
 * tool shows and plans with, and formats them for display.
 */

export type Kind = 'video' | 'audio' | 'cover' | 'subtitle' | 'data';

export type Stream = {
  /** ffmpeg's stream index, as used in `-map 0:<index>`. */
  index: number;
  kind: Kind;
  codec: string;
  profile?: string;
  width?: number;
  height?: number;
  fps?: number;
  /** Clockwise degrees a player turns the picture, such as 90 for a portrait phone video. */
  rotation?: number;
  pixelFormat?: string;
  bitDepth?: number;
  sampleRate?: number;
  channels?: number;
  layout?: string;
  bitRate?: number;
  language?: string;
};

export type MediaInfo = {
  format: string;
  /** Seconds; missing when the container does not say. */
  duration?: number;
  size?: number;
  bitRate?: number;
  tags: [string, string][];
  streams: Stream[];
};

type Json = Record<string, any>;

const number = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

function rate(value: unknown) {
  const [top, bottom] = String(value ?? '').split('/').map(Number);
  return top > 0 && bottom > 0 ? top / bottom : undefined;
}

function kind(stream: Json): Kind {
  if (stream.codec_type === 'video') return stream.disposition?.attached_pic ? 'cover' : 'video';
  if (stream.codec_type === 'audio' || stream.codec_type === 'subtitle') return stream.codec_type;
  return 'data';
}

function rotation(stream: Json) {
  const matrix = (stream.side_data_list ?? []).find((side: Json) => typeof side.rotation === 'number');
  // ffprobe reports the counter-clockwise angle; players and people think clockwise.
  const degrees = matrix ? -matrix.rotation : -Number(stream.tags?.rotate ?? 0);
  const normalised = ((Math.round(degrees) % 360) + 360) % 360;
  return normalised || undefined;
}

function bitDepth(stream: Json) {
  const raw = number(stream.bits_per_raw_sample);
  if (raw) return raw;
  const match = /p(\d+)(?:le|be)$/.exec(stream.pix_fmt ?? '');
  return match ? Number(match[1]) : undefined;
}

// Tags ffmpeg writes on every file; they say nothing about the content.
const noiseTags = new Set(['encoder', 'major_brand', 'minor_version', 'compatible_brands', 'handler_name', 'vendor_id']);

export function parseProbe(json: Json): MediaInfo {
  const format = json.format ?? {};
  const streams: Stream[] = (json.streams ?? []).map((stream: Json) => {
    const tags = stream.tags ?? {};
    return {
      index: stream.index,
      kind: kind(stream),
      codec: stream.codec_name ?? stream.codec_tag_string ?? 'unknown',
      profile: stream.profile && stream.profile !== 'unknown' ? stream.profile : undefined,
      width: number(stream.width),
      height: number(stream.height),
      fps: stream.codec_type === 'video' ? rate(stream.avg_frame_rate) ?? rate(stream.r_frame_rate) : undefined,
      rotation: stream.codec_type === 'video' ? rotation(stream) : undefined,
      pixelFormat: stream.pix_fmt,
      bitDepth: bitDepth(stream),
      sampleRate: number(stream.sample_rate),
      channels: number(stream.channels),
      layout: stream.channel_layout,
      bitRate: number(stream.bit_rate) ?? number(tags.BPS),
      language: tags.language && tags.language !== 'und' ? tags.language : undefined,
    } satisfies Stream;
  });
  const tags = Object.entries<string>(format.tags ?? {})
    .filter(([key, value]) => !noiseTags.has(key.toLowerCase()) && String(value).trim())
    .map(([key, value]): [string, string] => [key.toLowerCase(), String(value).trim()]);
  return {
    format: format.format_long_name ?? format.format_name ?? 'unknown',
    duration: number(format.duration),
    size: number(format.size),
    bitRate: number(format.bit_rate),
    tags,
    streams,
  };
}

export function formatDuration(seconds: number) {
  const tenths = Math.round(seconds * 10);
  const h = Math.floor(tenths / 36000);
  const m = Math.floor(tenths / 600) % 60;
  const s = ((tenths % 600) / 10).toFixed(1).padStart(4, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function formatBitRate(bitsPerSecond: number) {
  return bitsPerSecond >= 1e6 ? `${(bitsPerSecond / 1e6).toFixed(1)} Mb/s` : `${Math.round(bitsPerSecond / 1e3)} kb/s`;
}

const channelNames: Record<number, string> = { 1: 'mono', 2: 'stereo' };

/** One line per stream, such as "hevc (Main 10) · 1080×1920 · 30 fps · rotated 90° · 5.0 Mb/s". */
export function describeStream(stream: Stream) {
  const parts = [stream.profile ? `${stream.codec} (${stream.profile})` : stream.codec];
  if (stream.width && stream.height) parts.push(`${stream.width}×${stream.height}`);
  if (stream.kind === 'video') {
    if (stream.fps) parts.push(`${Number(stream.fps.toFixed(2))} fps`);
    if (stream.bitDepth && stream.bitDepth > 8) parts.push(`${stream.bitDepth}-bit`);
    if (stream.rotation) parts.push(`rotated ${stream.rotation}°`);
  }
  if (stream.kind === 'audio') {
    if (stream.sampleRate) parts.push(`${Number((stream.sampleRate / 1000).toFixed(1))} kHz`);
    if (stream.channels) parts.push(channelNames[stream.channels] ?? (stream.layout && stream.layout !== 'unknown' ? stream.layout : `${stream.channels} ch`));
  }
  if (stream.bitRate && stream.kind !== 'cover') parts.push(formatBitRate(stream.bitRate));
  if (stream.language) parts.push(stream.language);
  return parts.join(' · ');
}

/** The `file`-style summary: "QuickTime / MOV, 0:10.0, 20.4 MB, 16.4 Mb/s". */
export function describeFile(info: MediaInfo) {
  const parts = [info.format];
  if (info.duration) parts.push(formatDuration(info.duration));
  if (info.size) parts.push(formatSize(info.size));
  if (info.bitRate) parts.push(formatBitRate(info.bitRate));
  return parts.join(', ');
}
