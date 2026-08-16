/* AI 引擎适配层（服务端版）：降级链 + 临时图床
 * 与前端旧版同源逻辑，密钥全部来自服务端 store，绝不下发浏览器 */
import crypto from 'node:crypto';

export class AIError extends Error {
  constructor(type, message) {
    super(message || type);
    this.name = 'AIError';
    this.type = type;
  }
}

export function normalizeError(err) {
  if (err instanceof AIError) return err;
  if (err && (err.name === 'AbortError' || err.name === 'TimeoutError')) return new AIError('Timeout', '生成超时');
  if (err && err.code === 'UND_ERR_CONNECT_TIMEOUT') return new AIError('Network', '连接超时');
  if (err instanceof TypeError) return new AIError('Network', '出网请求失败');
  return new AIError('Unknown', (err && err.message) || '未知错误');
}

/* ---------- 出网通道：默认 global fetch；检测到代理环境时改用 undici.fetch ----------
 * 原因：Node 内置 fetch 用的是内置 undici，外部 undici 的 setGlobalDispatcher 管不到它，
 * 沙箱/内网这类「必须走 HTTP_PROXY」的环境里需要显式换成 undici.fetch + 代理 dispatcher。 */
let fetchImpl = globalThis.fetch;
let proxyOn = false;

export async function initNet() {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (!proxy) return false;
  const candidates = [
    'undici',
    process.cwd() + '/node_modules/undici/index.js',
    '/root/.nvm/versions/node/v22.16.0/lib/node_modules/undici/index.js',
    '/usr/lib/node_modules/undici/index.js'
  ];
  for (const p of candidates) {
    try {
      const undici = await import(p);
      if (!undici.fetch || !undici.EnvHttpProxyAgent) continue;
      const dispatcher = new undici.EnvHttpProxyAgent();
      fetchImpl = (url, opts = {}) => undici.fetch(url, { ...opts, dispatcher });
      proxyOn = true;
      console.log(`[net] 出网走代理 ${proxy}`);
      return true;
    } catch { /* 换下一个路径 */ }
  }
  console.log('[net] 检测到代理环境变量，但未找到 undici，出网将直连');
  return false;
}

export const netInfo = () => ({ proxy: proxyOn });
const pfetch = (...args) => fetchImpl(...args);
const b64u = b => new Uint8Array(Buffer.from(b, 'base64'));
const blobOf = (b64, mime) => new Blob([b64u(b64)], { type: mime });
const b64Of = async blob => Buffer.from(await blob.arrayBuffer()).toString('base64');

/* ---------- 手写 multipart：Buffer 直拼，规避 FormData 与外部 undici 的版本差异 ---------- */
function multipart(fields) {
  const b = '----nhi' + crypto.randomBytes(14).toString('hex');
  const parts = [];
  for (const f of fields) {
    parts.push(Buffer.from(
      `--${b}\r\nContent-Disposition: form-data; name="${f.name}"` +
      (f.filename ? `; filename="${f.filename}"` : '') + `\r\n` +
      (f.mime ? `Content-Type: ${f.mime}\r\n` : '') + `\r\n`
    ));
    parts.push(f.buf != null ? f.buf : Buffer.from(String(f.value)));
    parts.push(Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${b}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${b}` };
}

/* ---------- 临时图床链：tmpfiles → uguu(48h) → litterbox(24h) → imgbb(站长key)
 * 全部匿名可用、无需注册；任何一个挂了自动换下一个。
 * 单个图床 25s 超时，同时受外层 signal（tryOn 的整链预算）约束，避免串行拖死整个请求。 */
const sig = (signal, ms) => (signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms));

async function uploadTmpfiles(buf, signal) {
  const { body, contentType } = multipart([{ name: 'file', filename: 'photo.jpg', buf, mime: 'image/jpeg' }]);
  const res = await pfetch('https://tmpfiles.org/api/v1/upload', { method: 'POST', headers: { 'Content-Type': contentType }, body, signal: sig(signal, 25000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json().catch(() => null);
  const url = j && j.data && j.data.url;
  if (!url) throw new Error('返回异常');
  return url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
}

async function uploadUguu(buf, signal) {
  const { body, contentType } = multipart([{ name: 'files[]', filename: 'photo.jpg', buf, mime: 'image/jpeg' }]);
  const res = await pfetch('https://uguu.se/upload.php', { method: 'POST', headers: { 'Content-Type': contentType }, body, signal: sig(signal, 25000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json().catch(() => null);
  const url = j && j.files && j.files[0] && j.files[0].url;
  if (!url) throw new Error('返回异常');
  return url;
}

async function uploadLitterbox(buf, signal) {
  const { body, contentType } = multipart([
    { name: 'reqtype', value: 'fileupload' },
    { name: 'time', value: '24h' },
    { name: 'fileToUpload', filename: 'photo.jpg', buf, mime: 'image/jpeg' }
  ]);
  const res = await pfetch('https://litterbox.catbox.moe/resources/internals/api.php', { method: 'POST', headers: { 'Content-Type': contentType }, body, signal: sig(signal, 25000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const t = (await res.text()).trim();
  if (!/^https:\/\//.test(t)) throw new Error('返回异常');
  return t;
}

async function uploadImgbb(buf, key, signal) {
  const { body, contentType } = multipart([{ name: 'image', filename: 'photo.jpg', buf, mime: 'image/jpeg' }]);
  const res = await pfetch('https://api.imgbb.com/1/upload?key=' + encodeURIComponent(key), { method: 'POST', headers: { 'Content-Type': contentType }, body, signal: sig(signal, 25000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json().catch(() => null);
  const url = j && j.data && (j.data.url || j.data.display_url);
  if (!url) throw new Error('返回异常');
  return url;
}

async function uploadTemp(blob, keys, signal) {
  const buf = Buffer.from(await blob.arrayBuffer());
  const hosts = [
    ['tmpfiles', () => uploadTmpfiles(buf, signal)],
    ['uguu', () => uploadUguu(buf, signal)],
    ['litterbox', () => uploadLitterbox(buf, signal)]
  ];
  if (keys && keys.imgbb) hosts.push(['imgbb', () => uploadImgbb(buf, keys.imgbb, signal)]);
  const errs = [];
  for (const [name, fn] of hosts) {
    // 外层已中止（用户取消 / 整链超时）时立即停止，不再尝试下一个图床
    if (signal && signal.aborted) throw new AIError('Timeout', '生成超时');
    try { return await fn(); } catch (e) {
      if (signal && signal.aborted) throw new AIError('Timeout', '生成超时');
      errs.push(name + '：' + ((e.cause && e.cause.message) || e.message));
    }
  }
  throw new AIError('Network', '临时图床都连不上（' + errs.join('；') + '）');
}

/* ---------- 供应商注册表 ---------- */
/* 每个 edit/verify 均接收 ctx = { keys, settings }，密钥只在服务端内存中出现 */

const pollinations = {
  id: 'pollinations',
  label: 'Pollinations（免密钥）',
  requiresKey: false,
  docsUrl: 'https://pollinations.ai/',
  notes: '开箱即用、无需注册，匿名约 6 秒 1 张（画质中等）。站长可选配置 Token：自动升级 kontext 高保真编辑，不再排队。',
  _nextFreeAt: 0,
  async _throttle(ms = 6000) {
    const now = Date.now();
    const wait = Math.max(0, this._nextFreeAt - now);
    this._nextFreeAt = now + wait + ms;
    await new Promise(r => setTimeout(r, wait));
  },
  async edit({ imageBlob, prompt, width, height, signal, ctx }) {
    const imageUrl = await uploadTemp(imageBlob, ctx.keys, signal);
    await this._throttle();
    const token = String((ctx.keys && ctx.keys.pollinations) || '').trim();
    /* 有 Token → kontext 高保真；匿名 → 默认模型 + image 参考（实测可用） */
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
      `?image=${encodeURIComponent(imageUrl)}` +
      (token ? `&model=kontext&token=${encodeURIComponent(token)}` : '') +
      `&width=${width}&height=${height}&nologo=true&private=true&referrer=nail-hair-inspo`;
    const res = await pfetch(url, { signal });
    if (res.status === 429) throw new AIError('RateLimit', 'Pollinations 匿名限流，稍等几秒再试');
    if (res.status === 401 || res.status === 403) throw new AIError('Quota', 'Pollinations Token 无效或已过期');
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (/content|safety|blocked/i.test(text)) throw new AIError('Content', '内容审核未通过');
      throw new AIError('Network', `Pollinations ${res.status}`);
    }
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) throw new AIError('Network', 'Pollinations 返回非图片');
    return blob;
  }
};

const gemini = {
  id: 'gemini',
  label: 'Gemini（Google）',
  requiresKey: true,
  keyShape: { key: 'Gemini API Key' },
  docsUrl: 'https://aistudio.google.com/',
  notes: '人像保真度最好的引擎之一，免费层约每天 20–50 张（以官方为准）。',
  async edit({ imageBlob, prompt, signal, ctx }) {
    const key = ctx.keys.gemini;
    const b64 = await b64Of(imageBlob);
    const res = await pfetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: b64 } }] }]
        })
      }
    );
    if (res.status === 429) throw new AIError('RateLimit', 'Gemini 免费额度或频率不足');
    if (res.status === 401 || res.status === 403) throw new AIError('Quota', 'Gemini 密钥无效或无权限');
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      if (/safety|blocked/i.test(t)) throw new AIError('Content', 'Gemini 内容审核未通过');
      throw new AIError('Network', `Gemini ${res.status}`);
    }
    const j = await res.json();
    const cand = j.candidates && j.candidates[0];
    const finish = cand && cand.finishReason;
    if (finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT' || finish === 'IMAGE_SAFETY') {
      throw new AIError('Content', 'Gemini 安全策略拦截');
    }
    const parts = (cand && cand.content && cand.content.parts) || [];
    const imgPart = parts.find(p => (p.inline_data || p.inlineData));
    if (!imgPart) throw new AIError('Content', 'Gemini 未返回图片（可能被安全策略拦截）');
    const inline = imgPart.inline_data || imgPart.inlineData;
    return blobOf(inline.data, inline.mime_type || inline.mimeType || 'image/png');
  },
  async verify(ctx) {
    // 用当前稳定文本模型做轻量外呼验证密钥；模型名需与官方现行列表一致，否则会 404
    const res = await pfetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${encodeURIComponent(ctx.keys.gemini)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }] })
      }
    );
    if (res.status === 429) throw new AIError('RateLimit', '密钥有效，但已达频率上限');
    if (res.status === 401 || res.status === 403) throw new AIError('Quota', '密钥无效（' + res.status + '）');
    if (res.status === 404) throw new AIError('Quota', '验证模型不存在（404），可能需更新服务端模型配置');
    if (!res.ok) throw new AIError('Network', 'Gemini 验证失败（' + res.status + '）');
    return '密钥有效';
  }
};

const siliconflow = {
  id: 'siliconflow',
  label: 'SiliconFlow 硅基流动',
  requiresKey: true,
  keyShape: { key: 'SiliconFlow API Key' },
  docsUrl: 'https://cloud.siliconflow.cn/',
  notes: '国内直连稳定，照片 base64 直传不经图床，中文描述友好。注册送额度，每张约 3 分钱。',
  async edit({ imageBlob, prompt, width, height, signal, ctx }) {
    const b64 = await b64Of(imageBlob);
    const res = await pfetch('https://api.siliconflow.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + ctx.keys.siliconflow, 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({ model: 'Qwen/Qwen-Image-Edit', prompt, image: `data:image/jpeg;base64,${b64}`, size: `${width}x${height}` })
    });
    if (res.status === 429) throw new AIError('RateLimit', 'SiliconFlow 限流');
    if (res.status === 401 || res.status === 403) throw new AIError('Quota', 'SiliconFlow 密钥无效或额度不足');
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      if (/content|sensitive/i.test(t)) throw new AIError('Content', 'SiliconFlow 内容审核未通过');
      throw new AIError('Network', `SiliconFlow ${res.status}`);
    }
    const j = await res.json();
    return await pickImage(j, signal);
  },
  async verify(ctx) {
    const res = await pfetch('https://api.siliconflow.com/v1/user/info', { headers: { 'Authorization': 'Bearer ' + ctx.keys.siliconflow } });
    if (!res.ok) throw new AIError('Quota', '密钥无效（' + res.status + '）');
    const j = await res.json().catch(() => null);
    const bal = j && j.data && j.data.chargeBalance != null ? `，余额 ${j.data.chargeBalance}` : '';
    return '密钥有效' + bal;
  }
};

const huggingface = {
  id: 'huggingface',
  label: 'HuggingFace',
  requiresKey: true,
  keyShape: { key: 'HF Access Token' },
  docsUrl: 'https://huggingface.co/docs/inference-providers',
  notes: '免费账户每月 credits 很少，仅作末位备选（Qwen-Image-Edit via router）。',
  async edit({ imageBlob, prompt, width, height, signal, ctx }) {
    const b64 = await b64Of(imageBlob);
    const res = await pfetch('https://router.huggingface.co/v1/images/generations', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + ctx.keys.huggingface, 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({ model: 'Qwen/Qwen-Image-Edit', prompt, image: `data:image/jpeg;base64,${b64}`, size: `${width}x${height}` })
    });
    if (res.status === 429) throw new AIError('RateLimit', 'HuggingFace 限流');
    if (res.status === 401 || res.status === 403) throw new AIError('Quota', 'HuggingFace 密钥无效或 credits 不足');
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      if (/content|safety/i.test(t)) throw new AIError('Content', 'HuggingFace 内容审核未通过');
      throw new AIError('Network', `HuggingFace ${res.status}`);
    }
    const j = await res.json();
    return await pickImage(j, signal);
  },
  async verify(ctx) {
    const res = await pfetch('https://huggingface.co/api/whoami-v2', { headers: { 'Authorization': 'Bearer ' + ctx.keys.huggingface } });
    if (!res.ok) throw new AIError('Quota', '密钥无效（' + res.status + '）');
    const j = await res.json().catch(() => null);
    return '密钥有效' + (j && j.name ? `（${j.name}）` : '');
  }
};

const cloudflare = {
  id: 'cloudflare',
  label: 'Cloudflare Workers AI',
  requiresKey: true,
  keyShape: { accountId: 'Account ID', token: 'API Token' },
  docsUrl: 'https://developers.cloudflare.com/workers-ai/',
  notes: '每天 10,000 Neurons 免费额度；服务端直连无跨域问题。画质偏基础，作备选。',
  async edit({ imageBlob, prompt, signal, ctx }) {
    const cf = ctx.keys.cloudflare || {};
    const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cf.accountId || '')}`;
    const b64 = await b64Of(imageBlob);
    const res = await pfetch(`${base}/ai/run/@cf/runwayml/stable-diffusion-v1-5-img2img`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + (cf.token || ''), 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({ prompt, image: b64, num_steps: 20 })
    });
    if (res.status === 429) throw new AIError('RateLimit', 'Cloudflare 限流');
    if (res.status === 401 || res.status === 403) throw new AIError('Quota', 'Cloudflare 密钥无效');
    if (!res.ok) throw new AIError('Network', `Cloudflare ${res.status}`);
    const type = res.headers.get('content-type') || '';
    if (type.startsWith('image/')) return res.blob();
    const j = await res.json().catch(() => null);
    const msg = j && j.errors && j.errors[0];
    throw new AIError('Network', (msg && (msg.message || msg.code)) || 'Cloudflare 返回异常');
  },
  async verify(ctx) {
    const cf = ctx.keys.cloudflare || {};
    const res = await pfetch('https://api.cloudflare.com/client/v4/user/tokens/verify', { headers: { 'Authorization': 'Bearer ' + (cf.token || '') } });
    if (!res.ok) throw new AIError('Quota', 'Token 无效（' + res.status + '）');
    const j = await res.json().catch(() => null);
    if (j && j.success) return 'Token 有效';
    throw new AIError('Quota', 'Token 校验失败');
  }
};

async function pickImage(j, signal) {
  const item = j && j.data && j.data[0];
  if (!item) throw new AIError('Network', '引擎返回为空');
  if (item.url) {
    const r = await pfetch(item.url, { signal });
    if (!r.ok) throw new AIError('Network', '结果图片下载失败');
    return r.blob();
  }
  if (item.b64_json) return blobOf(item.b64_json, 'image/png');
  throw new AIError('Network', '返回里没有图片');
}

export const providers = [pollinations, gemini, siliconflow, cloudflare, huggingface];
export const byId = id => providers.find(p => p.id === id) || null;

export function hasKey(provider, keys) {
  if (!provider.requiresKey) return true;
  const k = keys[provider.id];
  if (typeof k === 'string') return !!k.trim();
  if (k && typeof k === 'object') return !!(k.token && k.token.trim());
  return false;
}

/* 站长可配首选；其余按注册顺序补齐；跳过没 key 的 */
export function buildChain(keys, preferred = 'auto') {
  const ready = providers.filter(p => hasKey(p, keys));
  if (preferred && preferred !== 'auto') {
    const first = byId(preferred);
    if (first && hasKey(first, keys)) return [first, ...ready.filter(p => p !== first)];
  }
  return ready;
}

/* 主链路：逐个尝试，Content 类不降级（结果可能不适合展示）
 * 超时预算必须小于 Vercel 函数上限（60s）：单引擎 40s、整链 55s。
 * 否则引擎慢时平台先杀函数返回 504 HTML，前端只能拿到非 JSON → 误报「网络不太顺畅」。 */
const TIMEOUT_MS = 40000;
const TOTAL_DEADLINE_MS = 55000;
export async function tryOn({ imageBlob, prompt, width, height, ctx, onEngine }) {
  const chain = buildChain(ctx.keys, ctx.settings.preferred);
  if (!chain.length) throw new AIError('Quota', '站长还没有配置任何可用引擎');

  const t0 = Date.now();
  let lastErr = null;
  for (let i = 0; i < chain.length; i++) {
    const provider = chain[i];
    if (onEngine) onEngine({ index: i + 1, total: chain.length, provider });
    const remaining = TOTAL_DEADLINE_MS - (Date.now() - t0);
    if (remaining <= 0) {
      lastErr = new AIError('Timeout', '生成超时');
      break;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error('timeout')), Math.min(TIMEOUT_MS, remaining));
    try {
      const blob = await provider.edit({ imageBlob, prompt, width, height, signal: ctrl.signal, ctx });
      return { blob, provider };
    } catch (err) {
      lastErr = normalizeError(err);
      if (ctrl.signal.aborted) lastErr = new AIError('Timeout', '生成超时');
      if (lastErr.type === 'Content') throw lastErr;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr || new AIError('Network', '所有引擎都失败了');
}

export const randomId = () => crypto.randomUUID();
