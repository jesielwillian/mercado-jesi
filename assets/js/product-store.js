const DB_NAME = "mercado-jesi-local";
const STORE = "products";
const DB_VERSION = 2;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains("messages")) db.createObjectStore("messages", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction(mode, callback) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let result;
    try { result = callback(store); } catch (error) { reject(error); db.close(); return; }
    tx.oncomplete = () => { db.close(); resolve(result?.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}

export async function localProductsList() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => { db.close(); resolve(request.result.sort((a,b) => a.name.localeCompare(b.name, "pt-BR"))); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

export async function localProductSave(product) {
  return transaction("readwrite", store => store.put(product));
}

export async function localProductDelete(id) {
  return transaction("readwrite", store => store.delete(id));
}

export function localImageUrl(product) {
  if (!product?.image) return "";
  return URL.createObjectURL(product.image);
}

// Remove automaticamente um quadriculado de transparência que tenha sido
// salvo dentro da imagem. O fundo real da vitrine fica por conta do CSS.
const cleanedImageCache = new WeakMap();

function colorDistance(data, index, color) {
  return Math.abs(data[index] - color[0]) +
    Math.abs(data[index + 1] - color[1]) +
    Math.abs(data[index + 2] - color[2]);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.crossOrigin = "anonymous";
    image.src = url;
  });
}

function detectCheckerColors(data, width, height) {
  const counts = new Map();
  const borderSamples = [];
  const add = (r, g, b) => {
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max < 190 || max - min > 18) return null;
    const key = `${Math.round(r / 8) * 8},${Math.round(g / 8) * 8},${Math.round(b / 8) * 8}`;
    counts.set(key, (counts.get(key) || 0) + 1);
    return key;
  };
  const step = Math.max(1, Math.floor(Math.min(width, height) / 140));
  for (let x = 0; x < width; x += step) {
    for (const y of [0, height - 1]) {
      const i = (y * width + x) * 4;
      if (data[i + 3] > 0) borderSamples.push(add(data[i], data[i + 1], data[i + 2]));
    }
  }
  for (let y = 0; y < height; y += step) {
    for (const x of [0, width - 1]) {
      const i = (y * width + x) * 4;
      if (data[i + 3] > 0) borderSamples.push(add(data[i], data[i + 1], data[i + 2]));
    }
  }
  const colors = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([key]) => key);
  if (colors.length !== 2 || !borderSamples.length) return null;

  const total = borderSamples.length;
  const firstRatio = borderSamples.filter(key => key === colors[0]).length / total;
  const secondRatio = borderSamples.filter(key => key === colors[1]).length / total;
  let transitions = 0, previous = null;
  for (const key of borderSamples) {
    if ((key === colors[0] || key === colors[1]) && previous && key !== previous) transitions++;
    if (key === colors[0] || key === colors[1]) previous = key;
  }
  // Só trata como quadriculado quando há duas cores claras bem distribuídas
  // e várias alternâncias na borda. Assim o branco do próprio produto é preservado.
  if (firstRatio < 0.16 || secondRatio < 0.16 || transitions < 8) return null;
  return colors.map(key => key.split(',').map(Number));
}

function removeCheckerboard(image) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) return null;
  const scale = Math.min(1, 1400 / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, width, height);

  const pixels = ctx.getImageData(0, 0, width, height);
  const { data } = pixels;
  // Detecta tons neutros claros conectados às bordas. Isso remove também
  // pequenos blocos cinza que sobram quando o quadriculado não usa só duas
  // cores exatas, sem apagar áreas brancas isoladas do rótulo do produto.
  const matches = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0, tail = 0;
  const isBackgroundPixel = index => {
    const alpha = data[index + 3];
    if (alpha === 0) return true;
    const r = data[index], g = data[index + 1], b = data[index + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    return min >= 165 && (max - min) <= 30;
  };
  const push = (x, y) => {
    const pos = y * width + x;
    if (matches[pos]) return;
    const index = pos * 4;
    if (!isBackgroundPixel(index)) return;
    matches[pos] = 1;
    queue[tail++] = pos;
  };

  for (let x = 0; x < width; x++) { push(x, 0); push(x, height - 1); }
  for (let y = 0; y < height; y++) { push(0, y); push(width - 1, y); }

  while (head < tail) {
    const pos = queue[head++];
    const x = pos % width;
    const y = Math.floor(pos / width);
    if (x > 0) push(x - 1, y);
    if (x < width - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < height - 1) push(x, y + 1);
  }

  if (tail < Math.max(32, width * height * 0.015)) return null;
  for (let pos = 0; pos < matches.length; pos++) {
    if (matches[pos]) data[pos * 4 + 3] = 0;
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas.toDataURL('image/png');
}

export async function cleanLocalImageUrl(product) {
  if (!product?.image) return "";
  if (cleanedImageCache.has(product.image)) return cleanedImageCache.get(product.image);

  const sourceUrl = URL.createObjectURL(product.image);
  try {
    const image = await loadImage(sourceUrl);
    const cleaned = removeCheckerboard(image) || sourceUrl;
    cleanedImageCache.set(product.image, cleaned);
    if (cleaned !== sourceUrl) URL.revokeObjectURL(sourceUrl);
    return cleaned;
  } catch {
    cleanedImageCache.set(product.image, sourceUrl);
    return sourceUrl;
  }
}


// Também limpa imagens hospedadas no Supabase quando o próprio arquivo
// contém o quadriculado usado para simular transparência.
const cleanedRemoteImageCache = new Map();
export async function cleanRemoteImageUrl(url) {
  if (!url) return "";
  if (cleanedRemoteImageCache.has(url)) return cleanedRemoteImageCache.get(url);
  try {
    const image = await loadImage(url);
    const cleaned = removeCheckerboard(image);
    const result = cleaned || url;
    cleanedRemoteImageCache.set(url, result);
    return result;
  } catch {
    cleanedRemoteImageCache.set(url, url);
    return url;
  }
}
