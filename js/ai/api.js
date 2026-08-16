/* AI 统一入口（服务端代理版）
 * 浏览器不再直连任何引擎、不持有密钥：统一 POST /api/tryon
 * 接口签名与旧版一致，nails.js / hair.js 无需改动 */
import { AIError, normalizeError } from './errors.js';
import { blobToBase64 } from '../capture/preprocess.js';
import { getClientId } from '../store/settings.js';

/**
 * @param {object} opts
 * @param {Blob} opts.imageBlob 输入照片（JPEG）
 * @param {string} opts.prompt 试戴 prompt
 * @param {number} opts.width / opts.height 期望输出尺寸
 * @param {string} [opts.cat] 分类（nail / hairColor / hairStyle），供服务端研究数据记录
 * @param {string} [opts.engine] 用户指定引擎 id（auto 或已配置引擎；服务端校验后生效）
 * @param {AbortSignal} [opts.signal] 用户取消
 * @param {function} [opts.onEngine] ({index,total,provider}) 引擎进度回调
 * @param {string} [opts.phash] 输入图片感知哈希（16 位 hex，用于服务端缓存去重）
 * @returns {Promise<{blob:Blob, provider:{id:string,label:string}}>}
 */
export async function tryOn({ imageBlob, prompt, width, height, cat, engine, signal, onEngine, phash }) {
  const b64 = await blobToBase64(imageBlob);
  if (onEngine) onEngine({ index: 1, total: 1, provider: { id: 'server', label: '魔法引擎' } });

  let res;
  try {
    res = await fetch('/api/tryon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        clientId: getClientId(),
        image: `data:image/jpeg;base64,${b64}`,
        prompt,
        width,
        height,
        cat: cat || null,
        engine: engine && engine !== 'auto' ? engine : null,
        phash: phash || null
      })
    });
  } catch (err) {
    if (signal && signal.aborted) throw new AIError('UserCancel', '已取消');
    throw new AIError('ServerDown', '生成服务没有响应');
  }

  if (signal && signal.aborted) throw new AIError('UserCancel', '已取消');

  // 成功 = 二进制图片响应（Content-Type: image/*），元数据在响应头；
  // 失败 = JSON（{ ok:false, error:{type,message} }）。先按 Content-Type 分流。
  const ct = res.headers.get('content-type') || '';
  if (ct.startsWith('image/')) {
    const blob = await res.blob();
    const provider = {
      id: res.headers.get('x-provider-id') || '',
      label: decodeURIComponent(res.headers.get('x-provider-label') || '')
    };
    return { blob, provider, cached: res.headers.get('x-cached') === '1' };
  }

  let j = null;
  try { j = await res.json(); } catch { /* 非结构化响应（平台错误页 504/413 等） */ }

  if (!res.ok || !j || !j.ok) {
    // 平台级错误页：Vercel 超时(504/408) / 请求体过大(413) / 其它非 JSON
    if (!j) {
      if (res.status === 413) throw new AIError('TooLarge', '照片太大了，压缩一下再试');
      if (res.status === 504 || res.status === 408) throw new AIError('Timeout', '生成超时了，请稍后重试');
      throw new AIError('ServerDown', `服务返回 ${res.status}，请稍后重试`);
    }
    const type = (j && j.error && j.error.type) || 'Network';
    if (res.status === 401) throw new AIError('Network', '请求被拒绝');
    throw new AIError(type, (j && j.error && j.error.message) || `服务返回 ${res.status}`);
  }

  // 兜底：兼容旧版仍返回 JSON 成功（内嵌 data URL）的情况
  if (j.image) {
    const blob = await (await fetch(j.image)).blob();
    return { blob, provider: j.provider, cached: !!j.cached };
  }
  throw new AIError('Network', '服务返回异常');
}

export { normalizeError };
