/* Vercel Serverless 函数入口（接管 /api/* 全部请求）
 * 复用 server/app.mjs 的 handler；请求处理完成后 flush 数据到 Vercel KV。
 * 文件名用 index.js（而非 [...path].js）以确保被 vercel.json 的 "api/*.js" glob 命中，
 * 避免 catch-all 文件名在某些 Vercel 版本下不被展开、导致 /api/* 无函数接管而 404。 */
import { handler } from '../server/app.mjs';
import * as store from '../server/store.mjs';

export default async function apiHandler(req, res) {
  try {
    await handler(req, res);
  } finally {
    await store.flush().catch(() => {});
  }
}
