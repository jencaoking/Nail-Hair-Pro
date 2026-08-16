/* 结果缓存与相似输入去重
 * - 缓存键：图片感知哈希（pHash，由前端计算并随请求上传）+ prompt MD5（服务端计算）
 * - 模糊匹配：pHash 汉明距离 <= 阈值（相似度 > 96%）视为同一张图
 * - 存储：内存 Map（LRU 最近 1000 条）+ 磁盘文件持久化（原子写入）
 * 命中时直接返回缓存结果，跳过 API 调用，降低延迟与成本。
 * 注：pHash 由前端在 canvas 上计算（服务端零依赖、无图像解码器），此处只做缓存与匹配。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(DIR, 'cache.json');
const TMP_FILE = CACHE_FILE + '.tmp';

/* Vercel Serverless 文件系统只读且多实例不共享磁盘：
 * 缓存降级为「单实例内存态」，不读盘、不落盘（miss 只是少命中几次，不影响正确性） */
const IS_VERCEL = !!process.env.VERCEL;

export const MAX_ENTRIES = 1000;
/* pHash 为 64bit → 汉明距离上限 64；>95% 相似对应距离 <= 3（64*5%≈3.2）。
 * 收紧到 2（≈96.9% 相似），避免不同角度/构图的照片误命中串图。 */
export const HAMMING_THRESHOLD = 2;

/* prompt MD5 */
export function md5(s) {
  return crypto.createHash('md5').update(s).digest('hex');
}

export function hexToHash(hex) {
  return BigInt('0x' + hex);
}

export function hashToHex(h) {
  return h.toString(16).padStart(16, '0');
}

/* 汉明距离（64bit） */
export function hammingDistance(a, b) {
  let x = a ^ b;
  let d = 0;
  while (x) { d++; x &= x - 1n; }
  return d;
}

/* ---------- 缓存结构 ----------
 * 内存 Map: key = `${phashHex}:${promptMd5}` → { phashHex, promptMd5, image(b64), mime, provider, ts }
 * phashIndex 用于模糊匹配线性扫描。 */
let memory = new Map();
let phashIndex = []; // [{ phash: BigInt, phashHex, promptMd5, key, ts }]
let loaded = false;

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  if (IS_VERCEL) return;   // Vercel 上跳过磁盘加载
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
  if (IS_VERCEL) return;   // Vercel 上不落盘
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const arr = [...memory.values()].sort((a, b) => b.ts - a.ts).slice(0, MAX_ENTRIES);
    fs.writeFileSync(TMP_FILE, JSON.stringify(arr));
    fs.renameSync(TMP_FILE, CACHE_FILE);
  } catch (e) {
    console.error('[cache] 写入失败', e.message);
  }
}

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

/* 查询：先精确 key，再模糊匹配 pHash（同 prompt）。phashHex 由前端提供。 */
export function lookup(phashHex, prompt) {
  ensureLoaded();
  const promptMd5 = md5(prompt);
  const key = `${phashHex}:${promptMd5}`;

  if (memory.has(key)) {
    const e = memory.get(key);
    e.ts = Date.now();
    return { hit: true, exact: true, entry: e };
  }

  let best = null, bestDist = HAMMING_THRESHOLD + 1;
  for (const p of phashIndex) {
    if (p.promptMd5 !== promptMd5) continue;
    const d = hammingDistance(p.phash, hexToHash(phashHex));
    if (d < bestDist) { bestDist = d; best = p; }
  }
  if (best && bestDist <= HAMMING_THRESHOLD) {
    const e = memory.get(best.key);
    e.ts = Date.now();
    return { hit: true, exact: false, dist: bestDist, entry: e };
  }

  return { hit: false, phashHex, promptMd5, key };
}

/* 写入缓存 */
export function store(phashHex, prompt, image, mime, provider) {
  ensureLoaded();
  const promptMd5 = md5(prompt);
  const key = `${phashHex}:${promptMd5}`;
  const entry = { key, phashHex, promptMd5, image, mime, provider, ts: Date.now() };
  memory.set(key, entry);
  phashIndex.push({ phash: hexToHash(phashHex), phashHex, promptMd5, key, ts: entry.ts });
  evict();
  persist();
}

export const cacheStats = () => ({ size: memory.size, max: MAX_ENTRIES });
