/* 莓好灵感屋 · 本地启动入口
 * 启动：node server.mjs   （默认 3000 端口，PORT 环境变量可改）
 * 请求处理逻辑已抽到 server/app.mjs（本地与 Vercel Serverless 共用）。
 * Vercel 部署入口见 api/[...path].js，此处仅用于本地开发。 */
import http from 'node:http';
import { handler, ready } from './server/app.mjs';
import * as store from './server/store.mjs';

const PORT = Number(process.env.PORT || 3000);
const boot = await ready();   // 本地 ESM 支持顶层 await，提前初始化以便打印首启提示

http.createServer(handler).listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log(`  莓好灵感屋 已启动 → http://localhost:${PORT}`);
  console.log(`  用户端     → http://localhost:${PORT}/`);
  console.log(`  管理后台   → http://localhost:${PORT}/admin`);
  if (boot.firstRun) {
    console.log(`  初始管理口令：${store.DEFAULT_PASSWORD}（登录后台后请立即修改）`);
  }
  console.log('');
});
