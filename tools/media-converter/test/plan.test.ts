import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { availableTargets, outputName, plan, shellQuote } from '../src/plan.ts';
import { describeFile, describeStream, parseProbe } from '../src/probe.ts';

// Real ffprobe output from the browser build, one file per case.
const fixture = (name: string) => parseProbe(JSON.parse(readFileSync(new URL(`fixtures/${name}.json`, import.meta.url), 'utf8')));
const changes = (result: ReturnType<typeof plan>) => result.changes.map(({ stream, what }) => `#${stream.index} ${what}`);

test('describes files and streams', () => {
  const phone = fixture('iphone-mov');
  assert.equal(describeFile(phone), 'QuickTime / MOV, 0:03.0, 1.8 MB, 5.1 Mb/s');
  assert.equal(describeStream(phone.streams[0]), 'hevc (Main 10) · 1080×1920 · 30 fps · 10-bit · rotated 270° · 5.0 Mb/s');
  assert.match(describeStream(phone.streams[1]), /^aac \(LC\) · 48 kHz · mono · \d+ kb\/s$/);

  const song = fixture('cover-mp3');
  assert.deepEqual(song.streams.map(stream => stream.kind), ['audio', 'cover']);
  assert.deepEqual(song.tags, [['artist', 'Someone'], ['title', 'A song']]);
});

test('copies what mp4 can hold, keeping rotation and tagging HEVC for Apple players', () => {
  const result = plan(fixture('iphone-mov'), { target: 'mp4' });
  assert.deepEqual(result.args, ['-map', '0:0', '-map', '0:1', '-c:v', 'copy', '-tag:v', 'hvc1', '-c:a', 'copy', '-movflags', '+faststart']);
  assert.deepEqual(result.changes, []);
  assert.equal(result.reencodes, 'nothing');
  assert.ok(result.offersH264);
});

test('re-encodes to H.264 only when asked or when mp4 cannot hold the video', () => {
  const asked = plan(fixture('hevc-mov'), { target: 'mp4', h264: true });
  assert.deepEqual(changes(asked), ['#0 hevc → h264']);
  assert.ok(asked.args.join(' ').includes('-c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -c:a copy'));
  assert.equal(asked.reencodes, 'video');

  assert.equal(plan(fixture('clip-mp4'), { target: 'mp4' }).offersH264, false);

  const vp9 = plan(fixture('multi-mkv'), { target: 'mp4' });
  assert.deepEqual(changes(vp9), ['#0 vp9 → h264', '#1 opus → aac', '#2 opus → aac']);
  assert.equal(vp9.changes[0].why, 'mp4 cannot hold vp9');
  assert.equal(vp9.offersH264, false);
});

test('keeps album art where the format allows it', () => {
  const m4a = plan(fixture('cover-mp3'), { target: 'm4a' });
  assert.deepEqual(m4a.args, ['-map', '0:0', '-c:a', 'aac', '-b:a', '192k', '-map', '0:1', '-c:v', 'copy', '-disposition:v:0', 'attached_pic', '-movflags', '+faststart']);
  assert.deepEqual(changes(m4a), ['#0 mp3 → aac']);

  const wav = plan(fixture('cover-mp3'), { target: 'wav' });
  assert.deepEqual(wav.args, ['-map', '0:0', '-c:a', 'pcm_s16le']);
  assert.equal(wav.changes[1].why, 'wav cannot keep album art');
});

test('takes the first audio track out of a video', () => {
  const result = plan(fixture('multi-mkv'), { target: 'mp3' });
  assert.deepEqual(result.args, ['-map', '0:1', '-c:a', 'libmp3lame', '-q:a', '2', '-id3v2_version', '3']);
  assert.deepEqual(changes(result), ['#1 opus → mp3', '#2 left out']);
  assert.equal(result.reencodes, 'audio');

  assert.equal(plan(fixture('clip-mp4'), { target: 'm4a' }).reencodes, 'nothing');
});

test('offers only targets the file has streams for', () => {
  assert.deepEqual(availableTargets(fixture('song-flac')), ['mp3', 'm4a', 'flac', 'wav']);
  assert.deepEqual(availableTargets(fixture('clip-mp4')), ['mp4', 'mp3', 'm4a', 'flac', 'wav']);
});

test('names the output and quotes arguments', () => {
  assert.equal(outputName('clip.mov', 'mp4'), 'clip.mp4');
  assert.equal(outputName('clip.mp4', 'mp4'), 'clip-converted.mp4');
  assert.equal(outputName('notes', 'mp3'), 'notes.mp3');
  assert.equal(shellQuote('-crf'), '-crf');
  assert.equal(shellQuote("my clip's.mov"), `'my clip'\\''s.mov'`);
});
