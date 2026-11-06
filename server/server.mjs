import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('../app/src/main/assets/web/', import.meta.url));
const models = new Set(['bulbasaur', 'charmander', 'squirtle', 'pikachu', 'eevee']);
const profiles = new Set(['아이 1', '아이 2']);
const maxBytes = 256 * 1024;
const key = process.env.GARDEN_KEY ?? '';
if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new Error('Set GARDEN_KEY (16–128 letters, numbers, underscores or hyphens).');

const storage = resolve(process.env.GARDEN_DATA ?? './garden-data/drawings.json');
mkdirSync(dirname(storage), { recursive: true });
let drawings = existsSync(storage) ? JSON.parse(readFileSync(storage, 'utf8')) : [];
if (!Array.isArray(drawings)) throw new Error('Invalid garden storage file.');
for (const id of models) {
  if (!existsSync(resolve(webRoot, 'models', id + '.glb'))) throw new Error('Missing model: ' + id + '.glb');
}

const types = {
  html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8', glb: 'model/gltf-binary',
};

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

function authorized(request) {
  const expected = Buffer.from('Bearer ' + key);
  const actual = Buffer.from(request.headers.authorization ?? '');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function readBody(request, response, onBody) {
  const chunks = [];
  let length = 0;
  request.on('data', chunk => {
    if (response.writableEnded) return;
    length += chunk.length;
    if (length > maxBytes) {
      json(response, 413, { error: 'Drawing too large' });
    } else {
      chunks.push(chunk);
    }
  });
  request.on('end', () => {
    if (!response.writableEnded) onBody(Buffer.concat(chunks, length).toString('utf8'));
  });
  request.on('error', () => {
    if (!response.writableEnded) json(response, 400, { error: 'Incomplete request' });
  });
}

function validPoint(point) {
  if (point === null) return true;
  if (!Array.isArray(point) || point.length !== 3) return false;
  const [layer, u, v] = point;
  return Number.isInteger(layer) && layer >= 0 && layer < 64
    && [u, v].every(coordinate => Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1);
}

function validate(input) {
  if (!input || typeof input !== 'object') return null;
  const { uploadId, id, profile, strokes } = input;
  if (typeof uploadId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(uploadId)
      || !models.has(id) || !profiles.has(profile)
      || !Array.isArray(strokes) || !strokes.length || strokes.length > 2048) return null;

  let pointCount = 0;
  const result = [];
  for (const stroke of strokes) {
    if (!stroke || typeof stroke.color !== 'string' || !/^#[a-f0-9]{6}$/.test(stroke.color)
        || !Number.isInteger(stroke.size) || stroke.size < 3 || stroke.size > 35
        || !Array.isArray(stroke.points) || !stroke.points.length
        || !stroke.points.every(validPoint) || !stroke.points.some(point => point !== null)) return null;
    pointCount += stroke.points.length;
    if (pointCount > 12000) return null;
    result.push({ color: stroke.color, size: stroke.size, points: stroke.points });
  }
  return { uploadId, id, profile, strokes: result };
}

function upload(request, response) {
  if (!authorized(request)) {
    request.resume();
    return json(response, 401, { error: 'Invalid key' });
  }
  if (Number(request.headers['content-length']) > maxBytes) {
    request.resume();
    return json(response, 413, { error: 'Drawing too large' });
  }
  readBody(request, response, body => {
    let entry;
    try {
      entry = validate(JSON.parse(body));
    } catch {
      return json(response, 400, { error: 'Invalid JSON' });
    }
    if (!entry) return json(response, 400, { error: 'Invalid drawing' });
    const previous = drawings.find(item => item.uploadId === entry.uploadId);
    if (previous) {
      const same = JSON.stringify(previous) === JSON.stringify(entry);
      return json(response, same ? 200 : 409, { uploadId: entry.uploadId });
    }
    const next = [...drawings.slice(-23), entry];
    try {
      writeFileSync(storage + '.tmp', JSON.stringify(next), { mode: 0o600 });
      renameSync(storage + '.tmp', storage);
      drawings = next;
    } catch (error) {
      console.error('Could not save drawing:', error.message);
      return json(response, 500, { error: 'Could not save drawing' });
    }
    json(response, 201, { uploadId: entry.uploadId });
  });
}

function staticFile(request, response, pathname) {
  const file = pathname === '/garden' ? 'index.html' : pathname.slice(1);
  if (!/^(?:index\.html|app\.js|coloring-sheet\.js|style\.css|vendor\/[A-Za-z.]+\.js|models\/[a-z]+\.glb)$/.test(file)) {
    return json(response, 404, { error: 'Not found' });
  }
  const path = resolve(webRoot, file);
  try {
    const size = statSync(path).size;
    const ext = file.slice(file.lastIndexOf('.') + 1);
    response.writeHead(200, {
      'Content-Type': types[ext], 'Content-Length': size, 'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
    });
    if (request.method === 'HEAD') return response.end();
    const stream = createReadStream(path);
    stream.on('error', () => response.destroy());
    stream.pipe(response);
  } catch {
    json(response, 404, { error: 'Not found' });
  }
}

createServer({ requestTimeout: 15000 }, (request, response) => {
  const pathname = request.url.split('?')[0];
  if (pathname === '/api/drawings') {
    if (request.method === 'GET') return json(response, 200, drawings.slice(-6));
    if (request.method === 'POST') return upload(request, response);
    return json(response, 405, { error: 'Method not allowed' });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json(response, 405, { error: 'Method not allowed' });
  }
  if (pathname === '/') {
    response.writeHead(302, { Location: '/garden' });
    return response.end();
  }
  staticFile(request, response, pathname);
}).listen(Number(process.env.GARDEN_PORT ?? 8787), process.env.GARDEN_HOST ?? '0.0.0.0', () => {
  console.log('Family garden listening');
});
