/**
 * The preview area: shows one image, fitted at first, and lets it be zoomed
 * and moved with the mouse, a trackpad or the keyboard. The image is resized
 * rather than CSS-scaled, so the browser redraws the vector sharply at every zoom.
 */

// Smallest part of the image, in pixels, that panning keeps inside the stage.
const KEEP = 32;
const PADDING = 24;
// Largest side the image is drawn at, so zooming in stays responsive.
const MAX_SIDE = 16384;

export class Stage {
  private width = 1;
  private height = 1;
  private scale = 1;
  private x = 0;
  private y = 0;
  private fitted = true;
  private boxWidth = 0;
  onChange: (scale: number, fitted: boolean) => void = () => {};

  private box: HTMLElement;
  private image: HTMLImageElement;

  constructor(box: HTMLElement, image: HTMLImageElement) {
    this.box = box;
    this.image = image;
    image.draggable = false;
    image.addEventListener('dragstart', event => event.preventDefault());
    this.bindPointer();
    this.bindWheel();
    this.bindKeys();
    box.addEventListener('dblclick', () => (this.fitted ? this.actual() : this.fit()));
    new ResizeObserver(() => {
      if (!this.box.isConnected || this.box.clientWidth === this.boxWidth) return;
      this.layout();
    }).observe(box);
  }

  /** Shows an image whose natural size is `width` × `height`, fitted to the stage. */
  show(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.fitted = true;
    this.layout();
  }

  /** Sizes the stage to suit the image's shape, then refits if the image was fitted. */
  private layout() {
    this.boxWidth = this.box.clientWidth;
    const wanted = (this.boxWidth - PADDING * 2) * (this.height / this.width) + PADDING * 2;
    this.box.style.height = `${Math.round(Math.min(Math.max(wanted, 240), innerHeight * 0.7, 720))}px`;
    if (this.fitted) this.fit();
    else this.apply();
  }

  private get fitScale() {
    return Math.min((this.box.clientWidth - PADDING * 2) / this.width, (this.box.clientHeight - PADDING * 2) / this.height);
  }
  private get limits() {
    const fit = this.fitScale;
    return { min: Math.min(fit, 1) / 4, max: Math.max(fit, Math.min(64, MAX_SIDE / Math.max(this.width, this.height))) };
  }

  fit() {
    this.scale = this.fitScale;
    this.centre();
    this.fitted = true;
    this.apply();
  }

  /** One image pixel to one CSS pixel. */
  actual() {
    this.scale = Math.min(1, this.limits.max);
    this.centre();
    this.fitted = false;
    this.apply();
  }

  /** Zooms by `factor`, keeping the point (`cx`, `cy`) of the stage still; the centre by default. */
  zoom(factor: number, cx = this.box.clientWidth / 2, cy = this.box.clientHeight / 2) {
    const { min, max } = this.limits;
    const next = Math.min(max, Math.max(min, this.scale * factor));
    if (next === this.scale) return;
    this.x = cx - ((cx - this.x) * next) / this.scale;
    this.y = cy - ((cy - this.y) * next) / this.scale;
    this.scale = next;
    this.fitted = false;
    this.apply();
  }

  pan(dx: number, dy: number) {
    this.x += dx;
    this.y += dy;
    this.fitted = false;
    this.apply();
  }

  private centre() {
    this.x = (this.box.clientWidth - this.width * this.scale) / 2;
    this.y = (this.box.clientHeight - this.height * this.scale) / 2;
  }

  private apply() {
    const width = this.width * this.scale;
    const height = this.height * this.scale;
    this.x = Math.min(this.box.clientWidth - KEEP, Math.max(KEEP - width, this.x));
    this.y = Math.min(this.box.clientHeight - KEEP, Math.max(KEEP - height, this.y));
    this.image.style.width = `${width}px`;
    this.image.style.height = `${height}px`;
    this.image.style.transform = `translate(${this.x}px, ${this.y}px)`;
    this.onChange(this.scale, this.fitted);
  }

  private bindPointer() {
    let last: { x: number; y: number } | undefined;
    this.box.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      last = { x: event.clientX, y: event.clientY };
      this.box.setPointerCapture(event.pointerId);
      this.box.classList.add('panning');
    });
    this.box.addEventListener('pointermove', event => {
      if (!last) return;
      this.pan(event.clientX - last.x, event.clientY - last.y);
      last = { x: event.clientX, y: event.clientY };
    });
    const stop = () => {
      last = undefined;
      this.box.classList.remove('panning');
    };
    this.box.addEventListener('pointerup', stop);
    this.box.addEventListener('pointercancel', stop);
  }

  // A plain wheel keeps scrolling the page; with Ctrl or ⌘ held, or a trackpad pinch
  // (which browsers report as Ctrl + wheel), it zooms around the pointer.
  private bindWheel() {
    this.box.addEventListener('wheel', event => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1);
      // Pinches send many small steps; a mouse wheel sends big ones, each capped near one √2 zoom step.
      const step = Math.min(35, Math.max(-35, pixels));
      const rect = this.box.getBoundingClientRect();
      this.zoom(Math.exp(-step * 0.01), event.clientX - rect.left, event.clientY - rect.top);
    }, { passive: false });
  }

  private bindKeys() {
    this.box.addEventListener('keydown', event => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const step = event.shiftKey ? 160 : 40;
      const actions: Record<string, () => void> = {
        '+': () => this.zoom(Math.SQRT2), '=': () => this.zoom(Math.SQRT2), '-': () => this.zoom(Math.SQRT1_2),
        0: () => this.fit(), 1: () => this.actual(),
        ArrowLeft: () => this.pan(step, 0), ArrowRight: () => this.pan(-step, 0),
        ArrowUp: () => this.pan(0, step), ArrowDown: () => this.pan(0, -step),
      };
      const action = actions[event.key];
      if (!action) return;
      event.preventDefault();
      action();
    });
  }
}
