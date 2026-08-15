# 莓好灵感屋 · AI 试美甲 / 试发色 / 试发型

拍一张照片，AI 帮你免费预览美甲款式、发色和发型效果。基于零依赖的 Node.js 服务端，内置多引擎降级链、限流与简单的管理后台。

## 功能特性

- 美甲试戴：上传手部照片，试戴猫眼、法式、碎钻等精选款式
- 美发试戴：上传头部照片，试换发色（如蜜桃棕、雾霾蓝）与发型（如锁骨发）
- 关键点检测预处理：生成前用 MediaPipe 识别手部（手指数量、左右手、光照方向）与面部（脸型、朝向），把结构信息注入 prompt，让 AI 更准地理解手部与脸型；检测失败时静默降级，不影响生成
- 灵感库：内置 52 款精选灵感，用户端按美甲 / 美发分类浏览
- 我的：记录试戴历史，展示每用户每日剩余额度
- 多 AI 引擎：支持 Pollinations、Gemini、SiliconFlow、Cloudflare、HuggingFace 等，服务端自动降级
- 管理后台：口令登录，可配置引擎、密钥、每日额度、公告、封禁用户与查看统计
- 移动端优先的响应式界面，底部 Tab 导航

## 技术栈

- 服务端：纯 Node.js（内置 `http` 模块，零第三方依赖，`server.mjs` 为入口）
- 前端：原生 ES Module + 原生 CSS（无构建步骤，无框架）
- 关键点检测：MediaPipe Tasks Vision（`@mediapipe/tasks-vision`），运行时按需从 CDN 动态加载 WASM 与模型，不打包、不 `npm install`；首次使用时下载，之后走浏览器缓存，离线/加载失败自动降级
- 数据存储：本地单文件 `server/data.json`（原子写入：临时文件 + rename）；部署到 Vercel 时自动切换为 Vercel KV（零依赖、仅 `fetch` 的 Upstash Redis REST）
- 出网：默认 `global fetch`；检测到 `HTTPS_PROXY` 等环境变量时自动切换为 `undici` 代理通道

## 目录结构

```
nail-hair-inspo/
├── server.mjs              # 本地启动入口（薄封装，调用 server/app.mjs）
├── server/
│   ├── app.mjs             # 请求处理核心（本地与 Vercel 共用的 handler）
│   ├── store.mjs           # 数据持久化（本地文件 / Vercel KV 双后端）
│   ├── providers.mjs       # AI 引擎适配层（降级链 + 临时图床 + 代理）
│   ├── cache.mjs           # 结果缓存（pHash 去重；Vercel 上仅内存态）
│   ├── device.mjs          # IP / User-Agent 解析
│   ├── userLearning.mjs    # 用户画像与推荐算法
│   └── data.json           # 运行时数据（本地首启自动生成，不入库）
├── api/
│   └── [...path].js        # Vercel Serverless 函数入口（接管 /api/*）
├── vercel.json             # Vercel 部署配置（rewrite + 函数超时）
├── index.html              # 用户端页面
├── admin.html              # 管理后台页面
├── js/
│   ├── main.js             # 用户端入口：路由注册、引擎徽章
│   ├── admin.js            # 管理后台入口
│   ├── router.js           # 前端哈希路由
│   ├── ai/                 # 前端 AI 注册与调用（providers/、api.js、registry.js、errors.js、landmarks.js 关键点检测）
│   ├── pages/              # 页面模块（home / nails / hair / mine）
│   ├── data/               # 灵感数据与提示词（inspirations.js、prompts.js）
│   ├── store/              # 客户端存储（db.js、settings.js）
│   ├── capture/            # 拍照 / 截图相关
│   └── ui/                 # UI 组件
├── css/                    # tokens / base / components / pages / admin 样式
└── assets/                 # favicon.svg、og-cover.jpg
```

## 快速开始

要求 Node.js 18 及以上版本（无需 `npm install`，无依赖）。

```bash
# 启动服务（默认端口 3000，可用 PORT 环境变量修改）
node server.mjs
```

启动后：

- 用户端：http://localhost:3000/
- 管理后台：http://localhost:3000/admin

首次启动时，管理后台默认口令为 `admin123`，请登录后立即在后台修改。仅当 `server/data.json` 尚不存在时才会使用默认口令；数据文件一旦生成，口令即以其为准。

## 部署到 Vercel

本项目已改造为 Vercel Serverless Functions 架构：前端静态托管，后端 `/api/*` 由 `api/[...path].js` 单个 catch-all 函数处理，数据存储自动从本地文件切换为 Vercel KV。

### 前置条件

1. 注册 Vercel 账号，安装 CLI：`npm i -g vercel`
2. 在 Vercel 控制台创建 KV 数据库（Storage → KV → Create），记下 REST 连接信息

### 步骤

1. 在 Vercel 项目设置（Settings → Environment Variables）配置环境变量：
   - `KV_REST_API_URL`：Vercel KV 的 REST URL（形如 `https://xxx.upstash.io`）
   - `KV_REST_API_TOKEN`：Vercel KV 的 REST Token
   - 各 AI 引擎密钥（可选，也可登录管理后台填写）：`GEMINI_API_KEY`、`SILICONFLOW_API_KEY`、`CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`、`HUGGINGFACE_API_KEY`、`POLLINATIONS_API_KEY`、`IMGBB_API_KEY`
2. 部署：
   - 方式一（CLI）：项目根执行 `vercel` 按提示导入，或 `vercel deploy --prod`
   - 方式二（Git 集成）：推送到 GitHub，在 Vercel 导入仓库自动部署
3. 部署完成后访问站点，管理后台位于 `https://你的域名/admin`，首次登录口令 `admin123`，登录后请立即修改。

### 注意事项

- 函数超时：AI 生成较慢，Hobby 计划函数最大 60 秒（已在 `vercel.json` 配置 `maxDuration: 60`）；Pro 计划可提高到 300 秒。若频繁超时，建议升级 Pro 或在后台改用更快的引擎。
- 请求体限制：Vercel 函数请求体上限约 4.5MB。前端已将图片压缩到最长边 896px、质量 0.82（约数百 KB），base64 后远小于上限，正常使用无碍。
- 管理会话与结果缓存为内存态，函数冷启动/实例切换后失效（后台需重新登录；缓存 miss 只是少命中，不影响正确性）。
- 密钥既可配在 Vercel 环境变量，也可登录管理后台填写（写入 KV），两者等价，服务端永不下发原文。

## 环境变量

- `PORT`：HTTP 监听端口，默认 `3000`
- `HTTPS_PROXY` / `HTTP_PROXY`（及其小写形式）：当存在时，服务端出网请求自动改用 undici 代理通道（用于沙箱 / 内网环境）

## 配置 API 密钥

所有密钥均在管理后台填写并保存在服务端（永不下发到浏览器）。进入 `/admin` 登录后，在「密钥」区域按需填写：

- `pollinations`：可选，Pollinations Token（解锁 kontext 等能力）
- `gemini`：Google Gemini API Key
- `siliconflow`：SiliconFlow API Key
- `cloudflare`：对象包含 `accountId` 与 `token`
- `huggingface`：HuggingFace API Key
- `imgbb`：用于托管中间图片的图床密钥

填写后可使用后台的「验证」按钮测试引擎可用性。服务端会按已配置且可用的引擎构建自动降级链（可在设置中指定首选 `auto` 或某个具体引擎）。

## 主要 API

- `GET /api/config?clientId=...`：用户端配置，返回可用引擎列表、今日额度、公告等
- `POST /api/tryon`：用户生成入口，请求体含 `clientId`、`image`（data URL）、`prompt`、可选 `width`/`height`；内置限流、封禁与引擎降级
- `POST /api/admin/login`：管理登录，返回 Bearer token
- `GET /api/admin/overview`：总览统计与引擎状态
- `GET/POST /api/admin/keys`：读取脱敏密钥 / 写入密钥
- `POST /api/admin/keys/verify`：验证某引擎密钥可用性
- `GET/POST /api/admin/users`、`/users/block`：用户列表与封禁
- `GET /api/admin/events`：最近事件流
- `POST /api/admin/settings`：修改每日额度、首选引擎、公告
- `POST /api/admin/password`：修改管理员口令

管理接口需在请求头携带 `Authorization: Bearer <token>`。

## 说明与限制

- 管理会话保存在内存中，服务重启后失效，需重新登录
- 每用户每日生成上限默认 20 次，可在后台调整（范围 1–500）
- 上传图片支持 PNG / JPEG / WebP，请求体上限 15MB
- 本项目仅供个人 / 演示用途，未包含用户注册、支付或第三方账号体系
