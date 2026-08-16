/* Vercel Serverless 函数入口（Web 标准 fetch 签名，2026 年官方约定）
 * 把 Request 适配成 server/app.mjs 的 Node 风格 (req, res) handler，
 * 处理完成后 flush 数据到 Vercel KV（Upstash Redis）。 */
import { Readable } from 'node:stream';
import { handler } from '../server/app.mjs';
import * as store from '../server/store.mjs';

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
    const ct = headers['Content-Type'] || (body && body.length >= 0 ? 'application/octet-stream' : 'text/plain');
    const out = new Response(body ? new Uint8Array(body) : null, { status, headers: { ...headers, 'Content-Type': ct } });
    return out;
  } };
}

export default async function (request) {
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
