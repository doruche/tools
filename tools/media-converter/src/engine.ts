/**
 * Runs ffmpeg.wasm in a worker. The 32 MB core downloads once, on first use,
 * and stays in memory as blob URLs, so restarting the worker after a cancel or
 * a crash does not download it again.
 */
import { FFmpeg } from '@ffmpeg/ffmpeg';
import coreUrl from '@ffmpeg/core?url';
import wasmUrl from '@ffmpeg/core/wasm?url';

declare const __CORE_WASM_SIZE__: number;

const INPUT_DIR = '/input';

let sources: Promise<{ core: string; wasm: string }> | undefined;
let instance: Promise<FFmpeg> | undefined;
let onLog: ((line: string) => void) | undefined;
let onTime: ((seconds: number) => void) | undefined;

/**
 * Downloads a file into a blob URL, reporting the share received. GitHub Pages
 * compresses the wasm, so the response's length is not the size; the build
 * supplies the real one.
 */
async function download(url: string, type: string, size: number, progress?: (share: number) => void) {
  const response = await fetch(new URL(url, document.baseURI));
  if (!response.ok || !response.body) throw new Error(`could not download ffmpeg (HTTP ${response.status})`);
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let received = 0;
  for await (const chunk of response.body) {
    chunks.push(chunk);
    received += chunk.length;
    progress?.(Math.min(1, received / size));
  }
  return URL.createObjectURL(new Blob(chunks, { type }));
}

/** Starts ffmpeg, downloading it first if needed. */
export function engine(progress?: (share: number) => void): Promise<FFmpeg> {
  sources ??= Promise.all([
    download(coreUrl, 'text/javascript', 0, undefined),
    download(wasmUrl, 'application/wasm', __CORE_WASM_SIZE__, progress),
  ]).then(([core, wasm]) => ({ core, wasm }));
  sources.catch(() => { sources = undefined; });

  instance ??= sources.then(async ({ core, wasm }) => {
    const ffmpeg = new FFmpeg();
    ffmpeg.on('log', ({ message }) => onLog?.(message));
    // Progress lines end in a carriage return, so they never reach the log until the end; this event does.
    ffmpeg.on('progress', ({ time }) => onTime?.(time / 1e6));
    await ffmpeg.load({ coreURL: core, wasmURL: wasm });
    await ffmpeg.createDir(INPUT_DIR);
    return ffmpeg;
  });
  instance.catch(() => { instance = undefined; });
  return instance;
}

/** Stops whatever ffmpeg is doing. The next call starts a fresh worker. */
export function stop() {
  const current = instance;
  instance = undefined;
  current?.then(ffmpeg => ffmpeg.terminate(), () => {});
}

/** Gives ffmpeg read access to the file without copying it into memory, for the duration of `work`. */
async function withInput<T>(ffmpeg: FFmpeg, file: File, work: (path: string) => Promise<T>) {
  await ffmpeg.mount('WORKERFS' as never, { files: [file] }, INPUT_DIR);
  try {
    return await work(`${INPUT_DIR}/${file.name}`);
  } finally {
    await ffmpeg.unmount(INPUT_DIR).catch(() => {});
  }
}

/** Runs a step, and throws away the worker if it crashes so the next step starts clean. */
async function guarded<T>(work: (ffmpeg: FFmpeg) => Promise<T>) {
  const ffmpeg = await engine();
  try {
    return await work(ffmpeg);
  } catch (error) {
    if (instance && (await instance) === ffmpeg) stop();
    throw error;
  }
}

/** ffprobe's JSON for the file. */
export function probe(file: File): Promise<unknown> {
  return guarded(ffmpeg => withInput(ffmpeg, file, async input => {
    const output = '/probe.json';
    // ffprobe.wasm reports a non-zero exit code even on success, so its output is the test.
    await ffmpeg.ffprobe(['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', input, '-o', output]);
    const json = await ffmpeg.readFile(output, 'utf8').catch(() => '');
    await ffmpeg.deleteFile(output).catch(() => {});
    const result = json ? JSON.parse(json as string) : undefined;
    if (!result?.format) throw new Error('ffprobe found no audio or video in it');
    return result;
  }));
}

/**
 * Runs `ffmpeg -i <file> ...args <output>` and returns the output's bytes.
 * Every log line goes to `log` and the position reached, in seconds, to
 * `time`; on failure the error carries ffmpeg's last words.
 */
export function convert(file: File, args: string[], outputName: string, log: (line: string) => void, time: (seconds: number) => void) {
  return guarded(ffmpeg => withInput(ffmpeg, file, async input => {
    const output = `/${outputName}`;
    const recent: string[] = [];
    onLog = line => {
      recent.push(line);
      if (recent.length > 6) recent.shift();
      // ffmpeg.wasm's own exit marker, not something ffmpeg said.
      if (line !== 'Aborted()') log(line);
    };
    onTime = time;
    try {
      const code = await ffmpeg.exec(['-i', input, ...args, output]);
      if (code !== 0) throw new Error(recent.filter(line => !line.startsWith('Aborted')).at(-1) ?? `ffmpeg exited with ${code}`);
      return await ffmpeg.readFile(output) as Uint8Array<ArrayBuffer>;
    } finally {
      onLog = undefined;
      onTime = undefined;
      await ffmpeg.deleteFile(output).catch(() => {});
    }
  }));
}
