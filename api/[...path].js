/* Vercel Serverless 函数入口（catch-all，接管 /api/* 全部请求）
 * 复用 server/app.mjs 的 handler；请求处理完成后 flush 数据到 Vercel KV。 */
import { handler } from '../server/app.mjs';
import * as store from '../server/store.mjs';

export default async function apiHandler(req, res) {
  try {
    await handler(req, res);
  } finally {
    await store.flush().catch(() => {});
  }
}
