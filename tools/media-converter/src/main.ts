import '@doruche-tools/kit/kit.css';
import './style.css';
import { bindCopy } from '@doruche-tools/kit/copy.js';
import { bindDrop } from '@doruche-tools/kit/drop.js';
import { convert, engine, probe, stop } from './engine.ts';
import { availableTargets, mimeType, outputName, plan, shellQuote, type Plan, type TargetId } from './plan.ts';
import { describeFile, describeStream, formatDuration, formatSize, parseProbe, type MediaInfo } from './probe.ts';

const $ = <T extends Element>(selector: string) => document.querySelector<T>(selector)!;
const dropzone = $<HTMLElement>('#dropzone');
const media = $<HTMLElement>('#media');
const fileInfo = $<HTMLElement>('#file-info');
const streams = $<HTMLDListElement>('#streams');
const form = $<HTMLFormElement>('#convert');
const targetSelect = $<HTMLSelectElement>('#target');
const h264Row = $<HTMLElement>('#h264-row');
const h264 = $<HTMLInputElement>('#h264');
const changeList = $<HTMLUListElement>('#changes');
const command = $<HTMLElement>('#command');
const runButton = $<HTMLButtonElement>('#run');
const cancelButton = $<HTMLButtonElement>('#cancel');
const job = $<HTMLElement>('#job');
const progress = $<HTMLElement>('#progress');
const result = $<HTMLElement>('#result');
const download = $<HTMLAnchorElement>('#download');
const log = $<HTMLElement>('#log');
const status = $<HTMLElement>('#status');

// Lines kept in the visible log.
const LOG_LINES = 400;
// Narrow screens get a shorter bar so the whole progress line fits.
const narrow = matchMedia('(max-width: 32rem)');

let current: { file: File; info: MediaInfo } | undefined;
let running = false;
// Opening, clearing, converting and cancelling each start a new generation;
// work that finishes after its generation has passed is ignored.
let generation = 0;

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

function report(message: string, kind: 'ok' | 'error' | '' = '') {
  status.className = `log ${kind}`.trim();
  status.textContent = message;
}

function element(tag: string, className: string, text = '') {
  return Object.assign(document.createElement(tag), { className, textContent: text });
}

function showInfo(file: File, info: MediaInfo) {
  fileInfo.textContent = `${file.name}: ${describeFile({ ...info, size: info.size ?? file.size })}`;
  streams.replaceChildren(
    ...info.streams.flatMap(stream => [element('dt', '', `#${stream.index} ${stream.kind}`), element('dd', '', describeStream(stream))]),
    ...info.tags.flatMap(([key, value]) => [element('dt', 'tag', key), element('dd', 'tag', value)]),
  );
}

function fillTargets(file: File, info: MediaInfo) {
  const ids = availableTargets(info);
  targetSelect.replaceChildren(...ids.map(id => new Option(id, id)));
  // Video becomes mp4 unless it already is; then, like audio, it most likely wants mp3.
  const extension = file.name.split('.').pop()?.toLowerCase();
  targetSelect.value = ids.find(id => id !== extension) ?? ids[0];
  h264.checked = false;
}

function currentPlan() {
  if (!current) return undefined;
  const target = targetSelect.value as TargetId;
  return { target, plan: plan(current.info, { target, h264: h264.checked }), output: outputName(current.file.name, target) };
}

const summaries: Record<Plan['reencodes'], string> = {
  nothing: 'nothing is re-encoded: fast and lossless',
  audio: 'only audio is re-encoded: a few seconds',
  video: 're-encoding video is slow in a browser: expect a few times the length of the clip',
};

function showPlan() {
  const next = currentPlan();
  if (!next || !current) return;
  h264Row.hidden = !next.plan.offersH264;
  changeList.replaceChildren(
    ...next.plan.changes.map(({ stream, what, why }) => {
      const item = element('li', what === 'left out' ? 'left-out' : '');
      item.append(element('span', 'stream', `#${stream.index} ${stream.kind}`), element('span', 'what', what));
      if (why) item.append(element('span', 'why', why));
      return item;
    }),
    element('li', 'summary', summaries[next.plan.reencodes]),
  );
  // One span per argument, so a line never breaks inside one such as -movflags.
  const words = ['ffmpeg', '-i', current.file.name, ...next.plan.args, next.output];
  command.replaceChildren(...words.flatMap((word, index) => [index ? ' ' : '', element('span', '', shellQuote(word))]));
}

/** wget-style progress: [=========>          ]  45%  0:04.5 / 0:10.0  eta 0:12 */
function showProgress(done: number, total: number | undefined, elapsed = 0) {
  if (!total) {
    progress.textContent = `${formatDuration(done)} done`;
    return;
  }
  const share = Math.min(1, done / total);
  const width = narrow.matches ? 10 : 24;
  const filled = Math.round(share * width);
  const bar = '='.repeat(Math.max(0, filled - 1)) + (filled ? (filled === width ? '=' : '>') : '') + ' '.repeat(width - filled);
  // Only guess the time left once there is enough to go on.
  const eta = share > 0.03 && share < 1 && elapsed > 2 ? `  eta ${formatDuration(elapsed / share - elapsed).replace(/\.\d$/, '')}` : '';
  progress.textContent = `[${bar}] ${String(Math.floor(share * 100)).padStart(3)}%  ${formatDuration(done)} / ${formatDuration(total)}${eta}`;
}

function appendLog(line: string) {
  const atBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 4;
  log.append(line + '\n');
  while (log.childNodes.length > LOG_LINES) log.firstChild!.remove();
  if (atBottom) log.scrollTop = log.scrollHeight;
}

/** While converting, the options and the file stay as they are; cancel to change them. */
function setRunning(value: boolean) {
  running = value;
  for (const control of document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('#convert :is(input, select), [data-choose], #clear')) {
    control.disabled = value;
  }
  runButton.hidden = value;
  cancelButton.hidden = !value;
}

function resetJob() {
  job.hidden = true;
  progress.textContent = '';
  result.className = 'log';
  result.textContent = '';
  log.textContent = '';
  if (download.href) URL.revokeObjectURL(download.href);
  download.removeAttribute('href');
  download.hidden = true;
}

async function run() {
  const next = currentPlan();
  if (!next || !current || running) return;
  const { file, info } = current;
  const mine = ++generation;
  resetJob();
  job.hidden = false;
  setRunning(true);
  showProgress(0, info.duration);
  const started = performance.now();
  try {
    const data = await convert(file, next.plan.args, next.output, line => {
      if (mine === generation) appendLog(line);
    }, seconds => {
      if (mine === generation && seconds >= 0) showProgress(seconds, info.duration, (performance.now() - started) / 1000);
    });
    if (mine !== generation) return;
    if (info.duration) showProgress(info.duration, info.duration);
    const elapsed = performance.now() - started;
    const took = elapsed < 1000 ? `${Math.max(1, Math.round(elapsed))} ms` : `${(elapsed / 1000).toFixed(1)} s`;
    download.href = URL.createObjectURL(new Blob([data], { type: mimeType(next.target) }));
    download.download = next.output;
    download.textContent = `download ${next.output}`;
    download.hidden = false;
    result.className = 'log ok';
    result.textContent = `${next.output} · ${formatSize(data.length)} · took ${took}`;
  } catch (error) {
    if (mine !== generation) return;
    result.className = 'log error';
    result.textContent = /out of bounds|out of memory|Cannot enlarge memory/i.test(errorText(error))
      ? 'ran out of memory: the browser build of ffmpeg can only hold about 2 GB'
      : errorText(error);
  } finally {
    if (mine === generation) setRunning(false);
  }
}

function cancel() {
  if (!running) return;
  generation++;
  stop();
  setRunning(false);
  result.textContent = 'cancelled';
}

async function open(file: File) {
  if (running) {
    report('cancel the conversion before opening another file');
    return;
  }
  const mine = ++generation;
  current = undefined;
  resetJob();
  form.hidden = true;
  streams.replaceChildren();
  fileInfo.textContent = `${file.name}: ${formatSize(file.size)}`;
  dropzone.hidden = true;
  media.hidden = false;

  try {
    await engine(share => {
      if (mine === generation) report(`downloading ffmpeg… ${Math.floor(share * 100)}% (about 10 MB, only the first time)`);
    });
    if (mine !== generation) return;
    report('reading the file…');
    const info = parseProbe(await probe(file) as Record<string, unknown>);
    if (mine !== generation) return;
    showInfo(file, info);
    if (!availableTargets(info).length) {
      report('no audio or video found in this file', 'error');
      return;
    }
    report('');
    current = { file, info };
    fillTargets(file, info);
    form.hidden = false;
    showPlan();
  } catch (error) {
    if (mine === generation) report(`could not read ${file.name}: ${errorText(error)}`, 'error');
  }
}

function clear() {
  if (running) return;
  generation++;
  current = undefined;
  resetJob();
  media.hidden = true;
  dropzone.hidden = false;
  report('');
}

bindDrop({ zone: dropzone, input: $<HTMLInputElement>('#file'), onFile: open });
$('#clear').addEventListener('click', clear);
form.addEventListener('change', showPlan);
form.addEventListener('submit', event => {
  event.preventDefault();
  run();
});
cancelButton.addEventListener('click', cancel);
bindCopy($<HTMLButtonElement>('#copy-command'), () => command.textContent ?? '');
