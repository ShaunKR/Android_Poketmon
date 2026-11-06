import { OrthographicCamera, SRGBColorSpace, WebGLRenderTarget } from 'three';

const size = 512;

function canvas() {
  const element = document.createElement('canvas');
  element.width = element.height = size;
  return element;
}

export class ColoringSheet {
  constructor() {
    this.element = canvas();
    this.element.id = 'coloringSheet';
    this.element.hidden = true;
    this.element.setAttribute('aria-label', '포켓몬 정면 색칠 도안');
    this.camera = new OrthographicCamera(-0.85, 0.85, 1.575, -0.125, 0.1, 12);
    this.camera.position.set(0, 0, 4);
    this.camera.updateMatrixWorld();
    this.outline = canvas();
    this.mask = canvas();
    this.ink = canvas();
    this.visibleInk = canvas();
    this.history = new WeakMap();
  }

  prepare(renderer, scene) {
    const target = new WebGLRenderTarget(size, size, { samples: Math.min(4, renderer.capabilities.maxSamples) });
    target.texture.colorSpace = SRGBColorSpace;
    const pixels = new Uint8Array(size * size * 4);
    const background = scene.background;
    const clearAlpha = renderer.getClearAlpha();
    const previous = renderer.getRenderTarget();
    try {
      scene.background = null;
      renderer.setClearAlpha(0);
      renderer.setRenderTarget(target);
      renderer.render(scene, this.camera);
      renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
    } finally {
      renderer.setRenderTarget(previous);
      renderer.setClearAlpha(clearAlpha);
      scene.background = background;
      target.dispose();
    }

    const outline = this.outline.getContext('2d');
    const mask = this.mask.getContext('2d');
    const lines = outline.createImageData(size, size);
    const shape = mask.createImageData(size, size);
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const source = ((size - 1 - y) * size + x) * 4;
        const destination = (y * size + x) * 4;
        const alpha = pixels[source + 3];
        shape.data[destination + 3] = alpha;
        let edge = 0;
        for (const offset of [-8, 8, -size * 8, size * 8]) {
          const neighbor = source + offset;
          const contrast = Math.max(
            Math.abs(pixels[source] - pixels[neighbor]),
            Math.abs(pixels[source + 1] - pixels[neighbor + 1]),
            Math.abs(pixels[source + 2] - pixels[neighbor + 2])
          );
          const silhouette = Math.abs(alpha - pixels[neighbor + 3]);
          const interior = alpha > 220 && pixels[neighbor + 3] > 220 ? (contrast - 18) * 5 : 0;
          edge = Math.max(edge, silhouette * 1.1, interior);
        }
        lines.data[destination] = 37;
        lines.data[destination + 1] = 48;
        lines.data[destination + 2] = 44;
        lines.data[destination + 3] = edge;
      }
    }
    outline.putImageData(lines, 0, 0);
    mask.putImageData(shape, 0, 0);
    this.replay([]);
  }

  stamp(stroke, point, previous) {
    const context = this.ink.getContext('2d');
    const radius = stroke.size * size / 700;
    context.strokeStyle = context.fillStyle = stroke.color;
    if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < size / 6) {
      context.lineWidth = radius * 2;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(previous.x, previous.y);
      context.lineTo(point.x, point.y);
      context.stroke();
    }
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, 2 * Math.PI);
    context.fill();
  }

  add(stroke, point) {
    if (!this.history.has(stroke)) this.history.set(stroke, []);
    const points = this.history.get(stroke);
    if (point) this.stamp(stroke, point, points.at(-1));
    if (point || points.at(-1)) points.push(point);
    if (point) this.render();
  }

  replay(strokes) {
    this.ink.getContext('2d').clearRect(0, 0, size, size);
    for (const stroke of strokes) {
      let previous;
      for (const point of this.history.get(stroke) ?? []) {
        if (point) this.stamp(stroke, point, previous);
        previous = point;
      }
    }
    this.render();
  }

  render() {
    const ink = this.visibleInk.getContext('2d');
    ink.clearRect(0, 0, size, size);
    ink.drawImage(this.ink, 0, 0);
    ink.globalCompositeOperation = 'destination-in';
    ink.drawImage(this.mask, 0, 0);
    ink.globalCompositeOperation = 'source-over';
    const paper = this.element.getContext('2d');
    paper.fillStyle = '#fff';
    paper.fillRect(0, 0, size, size);
    paper.drawImage(this.visibleInk, 0, 0);
    paper.drawImage(this.outline, 0, 0);
  }
}
