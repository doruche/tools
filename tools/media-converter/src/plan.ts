/**
 * Decides how to turn a file into the chosen format and writes the ffmpeg
 * arguments that do it. A stream the target can hold is copied as it is,
 * which is lossless and takes seconds; only what does not fit is re-encoded,
 * with fixed settings that look and sound like the original.
 */
import type { MediaInfo, Stream } from './probe.ts';

export type TargetId = 'mp4' | 'mp3' | 'm4a' | 'flac' | 'wav';

type AudioTarget = {
  mime: string;
  /** Codecs kept as they are. */
  keeps: string[];
  /** The codec written and its arguments when the source has to be re-encoded. */
  encode: (stream: Stream) => { codec: string; args: string[] };
  /** Whether the format can carry album art. */
  cover: boolean;
};

const aac = { codec: 'aac', args: ['-c:a', 'aac', '-b:a', '192k'] };

const audioTargets: Record<Exclude<TargetId, 'mp4'>, AudioTarget> = {
  mp3: { mime: 'audio/mpeg', keeps: ['mp3'], cover: true, encode: () => ({ codec: 'mp3', args: ['-c:a', 'libmp3lame', '-q:a', '2'] }) },
  m4a: { mime: 'audio/mp4', keeps: ['aac', 'alac'], cover: true, encode: () => aac },
  flac: { mime: 'audio/flac', keeps: ['flac'], cover: true, encode: () => ({ codec: 'flac', args: ['-c:a', 'flac'] }) },
  wav: {
    mime: 'audio/wav',
    keeps: ['pcm_s16le', 'pcm_s24le'],
    cover: false,
    encode: stream => {
      const codec = (stream.bitDepth ?? 16) > 16 ? 'pcm_s24le' : 'pcm_s16le';
      return { codec, args: ['-c:a', codec] };
    },
  },
};

// What MP4 holds that every current player opens.
const mp4Video = ['h264', 'hevc', 'av1'];
const mp4Audio = ['aac', 'mp3', 'alac'];

export const targetIds: TargetId[] = ['mp4', 'mp3', 'm4a', 'flac', 'wav'];

export function mimeType(target: TargetId) {
  return target === 'mp4' ? 'video/mp4' : audioTargets[target].mime;
}

export type Options = {
  target: TargetId;
  /** Re-encode video as H.264 even though MP4 could keep it, for older players. */
  h264?: boolean;
};

/** Something worth pointing out about one stream: it is re-encoded or left out. */
export type Change = { stream: Stream; what: string; why?: string };

export type Plan = {
  /** Arguments between `-i <input>` and the output file. */
  args: string[];
  /** Only the exceptions: streams that are copied as they are go unmentioned. */
  changes: Change[];
  /** The slowest kind of work involved, which says roughly how long it takes. */
  reencodes: 'nothing' | 'audio' | 'video';
  /** Whether `--h264` applies: the video fits MP4 but is not H.264. */
  offersH264: boolean;
};

const first = (info: MediaInfo, kind: Stream['kind']) => info.streams.find(stream => stream.kind === kind);

/** Formats a file can become: MP4 needs a video stream, the rest an audio stream. */
export function availableTargets(info: MediaInfo): TargetId[] {
  return targetIds.filter(id => first(info, id === 'mp4' ? 'video' : 'audio'));
}

export function plan(info: MediaInfo, options: Options): Plan {
  return options.target === 'mp4' ? planMp4(info, options) : planAudio(info, options.target);
}

function planMp4(info: MediaInfo, { h264 }: Options): Plan {
  const video = first(info, 'video');
  if (!video) throw new Error('this file has no video stream');
  const audio = info.streams.filter(stream => stream.kind === 'audio');
  const args = ['-map', `0:${video.index}`, ...audio.flatMap(stream => ['-map', `0:${stream.index}`])];
  const changes: Change[] = [];

  const fits = mp4Video.includes(video.codec);
  const offersH264 = fits && video.codec !== 'h264';
  const encodeVideo = !fits || (offersH264 && !!h264);
  if (encodeVideo) {
    changes.push({ stream: video, what: `${video.codec} → h264`, why: fits ? '--h264' : `mp4 cannot hold ${video.codec}` });
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p');
    // 4:2:0 H.264 needs even dimensions.
    if ((video.width ?? 0) % 2 || (video.height ?? 0) % 2) args.push('-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2');
  } else {
    args.push('-c:v', 'copy');
    // Apple players only open HEVC in MP4 with the hvc1 tag.
    if (video.codec === 'hevc') args.push('-tag:v', 'hvc1');
  }

  // Tracks are all copied or all re-encoded; a mix of codecs within one file is too rare to plan for.
  const encodeAudio = audio.some(stream => !mp4Audio.includes(stream.codec));
  if (encodeAudio) {
    for (const stream of audio) changes.push({ stream, what: `${stream.codec} → aac` });
    args.push(...aac.args);
  } else if (audio.length) {
    args.push('-c:a', 'copy');
  }

  for (const stream of info.streams.filter(stream => stream.kind === 'subtitle')) {
    changes.push({ stream, what: 'left out', why: 'subtitles are not kept' });
  }
  args.push('-movflags', '+faststart');
  return { args, changes, reencodes: encodeVideo ? 'video' : encodeAudio ? 'audio' : 'nothing', offersH264 };
}

function planAudio(info: MediaInfo, id: Exclude<TargetId, 'mp4'>): Plan {
  const target = audioTargets[id];
  const audio = first(info, 'audio');
  if (!audio) throw new Error('this file has no audio stream');
  const args = ['-map', `0:${audio.index}`];
  const changes: Change[] = [];

  const keep = target.keeps.includes(audio.codec);
  if (keep) {
    args.push('-c:a', 'copy');
  } else {
    const encoder = target.encode(audio);
    changes.push({ stream: audio, what: `${audio.codec} → ${encoder.codec}` });
    args.push(...encoder.args);
  }

  // Album art: an image stream marked as the cover. Video tracks of a film are not art.
  const cover = first(info, 'cover');
  if (cover && target.cover && ['mjpeg', 'png'].includes(cover.codec)) {
    args.push('-map', `0:${cover.index}`, '-c:v', 'copy', '-disposition:v:0', 'attached_pic');
  } else if (cover) {
    changes.push({ stream: cover, what: 'left out', why: `${id} cannot keep album art` });
  }
  for (const other of info.streams.filter(stream => stream.kind === 'audio' && stream !== audio)) {
    changes.push({ stream: other, what: 'left out', why: 'only the first audio track is kept' });
  }

  // ID3v2.3 is the version Windows and most car stereos read.
  if (id === 'mp3') args.push('-id3v2_version', '3');
  if (id === 'm4a') args.push('-movflags', '+faststart');
  return { args, changes, reencodes: keep ? 'nothing' : 'audio', offersH264: false };
}

/** The output file name: the input's name with the new extension, never the input's own name. */
export function outputName(input: string, target: TargetId) {
  const base = input.replace(/\.[^.]*$/, '') || 'output';
  const name = `${base}.${target}`;
  return name === input ? `${base}-converted.${target}` : name;
}

/** Writes one argument the way a shell would accept it, for display and copying. */
export function shellQuote(arg: string) {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", `'\\''`)}'`;
}
