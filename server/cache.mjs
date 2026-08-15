/* 结果缓存与相似输入去重
 * - 缓存键：图片感知哈希（pHash）+ prompt MD5
 * - 模糊匹配：pHash 汉明距离 <= 阈值（相似度 > 95%）视为同一张图
 * - 存储：内存 Map（LRU 最近 1000 条）+ 磁盘文件持久化（原子写入）
 * 命中时直接返回缓存结果，跳过 API 调用，降低延迟与成本。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(DIR, 'cache.json');
const TMP_FILE = CACHE_FILE + '.tmp';

export const MAX_ENTRIES = 1000;
/* pHash 为 64bit → 汉明距离上限 64；>95% 相似 ≈ 距离 <= 3（64*5%≈3.2） */
export const HAMMING_THRESHOLD = 3;

/* ---------- pHash（感知哈希） ----------
 * 8x8 DCT 简化版：缩小到 32x32 → 灰度 → 取 8x8 低频块均值作阈值 → 64bit 签名 */
export function phashFromRgba(rgba, width, height) {
  const size = 32;
  // 1. 缩放采样为 32x32 灰度
  const gray = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = Math.min(width - 1, (x * width / size) | 0);
      const sy = Math.min(height - 1, (y * height / size) | 0);
      const i = (sy * width + sx) * 4;
      gray[y * size + x] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    }
  }
  // 2. 取左上 8x8 低频块（近似 DCT 低频系数）
  const block = new Float32Array(64);
  let sum = 0;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      // 简单平均池化 4x4 → 1，替代完整 DCT，保证速度
      let acc = 0;
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 4; dx++) {
          acc += gray[(y * 4 + dy) * size + (x * 4 + dx)];
        }
      }
      const v = acc / 16;
      block[y * 8 + x] = v;
      sum += v;
    }
  }
  const mean = sum / 64;
  // 3. 与均值比较生成 64bit
  let hash = 0n;
  for (let i = 0; i < 64; i++) {
    if (block[i] >= mean) hash |= (1n << BigInt(63 - i));
  }
  return hash;
}

export function hashToHex(h) {
  return h.toString(16).padStart(16, '0');
}

export function hexToHash(hex) {
  return BigInt('0x' + hex);
}

/* 汉明距离（64bit） */
export function hammingDistance(a, b) {
  let x = a ^ b;
  let d = 0;
  while (x) { d++; x &= x - 1n; }
  return d;
}

/* prompt MD5 */
export function md5(s) {
  return crypto.createHash('md5').update(s).digest('hex');
}

/* ---------- 缓存结构 ----------
 * 内存 Map: key = `${phashHex}:${promptMd5}` → { phash, phashHex, promptMd5, image(b64), mime, provider, ts }
 * 为支持模糊匹配，额外维护一个 phash 列表用于线性扫描（1000 条内代价可接受）。 */
let memory = new Map();
let phashIndex = []; // [{ phash: BigInt, phashHex, promptMd5, key, ts }]
let loaded = false;

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    if (Array.isArray(raw)) {
      for (const e of raw) {
        if (e && e.key && e.image) {
          memory.set(e.key, e);
          phashIndex.push({ phash: hexToHash(e.phashHex), phashHex: e.phashHex, promptMd5: e.promptMd5, key: e.key, ts: e.ts });
        }
      }
    }
  } catch { /* 首启无缓存文件 */ }
}

function persist() {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    // 只保留最近 MAX_ENTRIES 条，按 ts 降序
    const arr = [...memory.values()].sort((a, b) => b.ts - a.ts).slice(0, MAX_ENTRIES);
    fs.writeFileSync(TMP_FILE, JSON.stringify(arr));
    fs.renameSync(TMP_FILE, CACHE_FILE);
  } catch (e) {
    console.error('[cache] 写入失败', e.message);
  }
}

/* 淘汰最旧条目（内存 LRU） */
function evict() {
  while (memory.size > MAX_ENTRIES) {
    let oldestKey = null, oldestTs = Infinity;
    for (const [k, v] of memory) {
      if (v.ts < oldestTs) { oldestTs = v.ts; oldestKey = k; }
    }
    if (!oldestKey) break;
    memory.delete(oldestKey);
    phashIndex = phashIndex.filter(p => p.key !== oldestKey);
  }
}

/* 查询：先精确 key，再模糊匹配 pHash（同 prompt） */
export function lookup(rgba, width, height, prompt) {
  ensureLoaded();
  const phash = phashFromRgba(rgba, width, height);
  const phashHex = hashToHex(phash);
  const promptMd5 = md5(prompt);
  const key = `${phashHex}:${promptMd5}`;

  // 1. 精确命中
  if (memory.has(key)) {
    const e = memory.get(key);
    e.ts = Date.now(); // 刷新 LRU 时间
    return { hit: true, exact: true, entry: e };
  }

  // 2. 模糊匹配：同 promptMd5 下，pHash 汉明距离 <= 阈值
  let best = null, bestDist = HAMMING_THRESHOLD + 1;
  for (const p of phashIndex) {
    if (p.promptMd5 !== promptMd5) continue;
    const d = hammingDistance(p.phash, phash);
    if (d < bestDist) { bestDist = d; best = p; }
  }
  if (best && bestDist <= HAMMING_THRESHOLD) {
    const e = memory.get(best.key);
    e.ts = Date.now();
    return { hit: true, exact: false, dist: bestDist, entry: e };
  }

  return { hit: false, phash, phashHex, promptMd5, key };
}

/* 写入缓存 */
export function store(rgba, width, height, prompt, image, mime, provider) {
  ensureLoaded();
  const phash = phashFromRgba(rgba, width, height);
  const phashHex = hashToHex(phash);
  const promptMd5 = md5(prompt);
  const key = `${phashHex}:${promptMd5}`;
  const entry = { key, phashHex, promptMd5, image, mime, provider, ts: Date.now() };
  memory.set(key, entry);
  phashIndex.push({ phash, phashHex, promptMd5, key, ts: entry.ts });
  evict();
  persist();
}

export const cacheStats = () => ({ size: memory.size, max: MAX_ENTRIES });
