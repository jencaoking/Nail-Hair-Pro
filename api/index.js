/* Vercel Serverless 函数入口（兼容两种调用约定）
 *
 * Vercel 对裸 `export default` 函数默认仍按传统 Node (req, res) 签名调用
 * （仅在设置 useWebApi / runtime 时才会以 Web fetch 签名调用），因此这里
 * 同时兼容两种约定：
 *   1. Web fetch 签名：request 是标准 Request（url 为完整 URL、headers 有 entries()）
 *   2. 传统 Node 签名：request 是 IncomingMessage，第二个参数是 ServerResponse
 * 二者都转成 server/app.mjs 的 Node 风格 (req, res) handler 处理，
 * 处理完成后 flush 数据到 Vercel KV（Upstash Redis）。
 * 任何异常都保证返回 JSON（绝不放空响应），避免前端 res.json() 解析失败。 */
import { Readable } from 'node:stream';
import { handler } from '../server/app.mjs';
import * as store from '../server/store.mjs';

/* 判断参数是否为 Web 标准 Request（而非 Node IncomingMessage） */
function isWebRequest(x) {
  return !!x
    && typeof x === 'object'
    && typeof x.url === 'string' && /^https?:/i.test(x.url)
    && x.headers && typeof x.headers.entries === 'function';
}

/* Web Request → Node 风格 req */
function toNodeReq(request) {
  const url = new URL(request.url);
  // request.body 是 Web ReadableStream；GET 等无 body 时用空流
  const req = request.body
    ? Readable.fromWeb(request.body)
    : Readable.from([]);
  req.method = request.method;
  req.url = url.pathname + url.search;
  req.headers = Object.fromEntries(request.headers.entries());
  // 兼容 server 代码中读取的 socket.remoteAddress（Vercel 不提供，置占位）
  req.socket = { remoteAddress: request.headers.get('x-forwarded-for') || 'unknown' };
  return req;
}

/* 构造一个 Node 风格 res，交给 server/app.mjs 使用 */
function toNodeRes() {
  let status = 200;
  const headers = {};
  let body = null;
  const res = {
    writeHead(code, h) {
      status = code;
      if (h) Object.assign(headers, h);
      return res;
    },
    setHeader(k, v) { headers[k] = v; return res; },
    getHeader(k) { return headers[k]; },
    end(chunk) {
      body = chunk == null ? null : (typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      res.finished = true;
    },
    // serveStatic 在 Vercel 上不会触发（静态托管由平台接管），但保留 pipe 兼容
    pipe() { return res; }
  };
  return { res, finalize: () => {
    // 兜底：handler 未写任何响应（异常路径）时返回 JSON 500，而不是空响应
    if (body == null) {
      return new Response(JSON.stringify({ ok: false, message: '服务内部错误' }), {
        status: status >= 400 ? status : 500,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
      });
    }
    const ct = headers['Content-Type'] || (body.length >= 0 ? 'application/octet-stream' : 'text/plain');
    const out = new Response(new Uint8Array(body), { status, headers: { ...headers, 'Content-Type': ct } });
    return out;
  } };
}

export default async function (request) {
  // 传统 Node 签名调用时，第二个参数就是 ServerResponse（放在 arguments 中取）
  const legacyRes = typeof arguments[1] === 'object' && arguments[1] !== null
    && typeof arguments[1].writeHead === 'function' ? arguments[1] : null;

  try {
    if (!legacyRes && isWebRequest(request)) {
      // 约定 1：Web fetch 签名 (request) → Response
      const req = toNodeReq(request);
      const { res, finalize } = toNodeRes();
      try {
        await handler(req, res);
      } catch (e) {
        console.error('[api]', e);
      } finally {
        await store.flush().catch(() => {});
      }
      return finalize();
    }

    // 约定 2：传统 Node (req, res) —— request 本身已是 IncomingMessage
    const res = legacyRes || toNodeRes().res;
    try {
      await handler(request, res);
    } catch (e) {
      console.error('[api]', e);
      // 异常且尚未写响应时，补一个 JSON 500
      if (!res.finished && typeof res.writeHead === 'function') {
        try {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, message: '服务内部错误' }));
        } catch { /* 响应已不可写，忽略 */ }
      }
    } finally {
      await store.flush().catch(() => {});
    }
    return legacyRes ? undefined : toNodeRes().finalize();
  } catch (e) {
    // 连入参都识别失败（理论不应发生）：确保仍是 JSON 响应
    console.error('[api]', e);
    return new Response(JSON.stringify({ ok: false, message: '服务内部错误' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
}
