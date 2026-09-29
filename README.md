# 张紫宁 · 一点有意思的书

公开站: `https://<your-project>.pages.dev` (部署完填上) ·
数据流: Obsidian vault → GitHub → Cloudflare Pages → 公网

---

## 架构

```
[Obsidian vault (你本地)]
   │  Obsidian Git 插件(自动 commit + push)
   ▼
[GitHub repo: Zzin-cell/zzin-bookshelf]  ← vault/ 子目录是镜像
   │
   ├─── push trigger ───►  [Cloudflare Pages]
   │                            │
   │                            ├─ npm run build (Node 24)
   │                            │     ├─ parse_books.mjs   →  public/data/books.json
   │                            │     └─ parse_more.mjs    →  public/data/more.json
   │                            └─ Pages Functions (Worker):
   │                                  ├─ POST /api/more/articles
   │                                  ├─ POST /api/more/articles/delete
   │                                  ├─ POST /api/more/categories
   │                                  └─ POST /api/more/categories/delete
   │                                          │  password 验证 + GitHub API 写
   ▼                                          ▼
[公网 SPA]  ←──── 弹密码框,密码对就改 ────┘
```

**核心好处**:
- 你的机器关机/断网,公网写操作**完全照常**(Worker 走 GitHub API,不依赖你)
- 数据 source of truth 在 Obsidian vault(本地编辑)+ GitHub(云端共享)+ 公网(展示)
- 老 mcode 部署站点(`n68fftk1cyinq` / `wbhzjfjs3qjf9`)暂时保留作回退,新主站是 CF Pages

---

## 项目结构

```
weread-bookshelf/
├── public/                       ← 静态资源 + data/ (CF Pages 部署根)
│   ├── index.html
│   ├── app.js                    ← SPA 逻辑(hash routing + ⚙ 设置 + 删除分类)
│   ├── styles.css
│   ├── assets/
│   └── data/
│       ├── books.json            ← parse_books.mjs 生成
│       └── more.json             ← parse_more.mjs 生成
├── functions/                    ← Cloudflare Pages Functions
│   ├── _shared.js                ← 密码 + GitHub API + 安全网
│   └── api/more/
│       ├── articles.js
│       ├── articles/delete.js
│       ├── categories.js
│       └── categories/delete.js
├── scripts/
│   ├── parse_books.mjs           ← Node 版(替代原 parse_books.py)
│   ├── parse_more.mjs            ← Node 版(替代原 parse_more.py)
│   ├── parse_books.py            ← 旧 Python 版,留作参考
│   ├── parse_more.py             ← 旧 Python 版,留作参考
│   └── serve.py                  ← 本地 dev server(留作工具)
├── vault/                        ← Obsidian Git 镜像到这里(运行时不创建)
├── wrangler.toml                 ← CF Pages 配置
├── _headers / _redirects         ← CF Pages 响应头/路由
├── package.json / package-lock.json
└── README.md
```

---

## 首次部署到 Cloudflare Pages(一次)

### 1. 安装 wrangler CLI(本地)

```bash
npm install -g wrangler
wrangler --version
```

### 2. 登录 Cloudflare

```bash
wrangler login
```

浏览器会打开让你授权。授权完 wrangler 就有 deploy 权限了。

### 3. 创建 Pages 项目

```bash
wrangler pages project create zzin-bookshelf --production-branch main --compatibility-date 2024-09-01
```

### 4. 让 Pages 知道怎么 build

在 Cloudflare Dashboard:
1. Workers & Pages → zzin-bookshelf → Settings → Builds
2. **Build command**: `npm run build`
3. **Build output directory**: `public`
4. **Root directory**: `(留空)`
5. **Environment variables**(Production + Preview 都要):
   - `NODE_VERSION` = `24`(可选 — CF Pages 默认 20+,但 build 有兼容问题就用 24)
6. 保存

### 5. 配置 Secrets(Worker 用)

```bash
wrangler pages secret put SITE_PASSWORD --project-name zzin-bookshelf
# 提示时输入 zzin0715(或你自定义的密码)

wrangler pages secret put GITHUB_TOKEN --project-name zzin-bookshelf
# 提示时粘贴 GitHub PAT(repo scope)

# 可选(已有默认值):
wrangler pages secret put GITHUB_REPO --project-name zzin-bookshelf
# 提示时输入 Zzin-cell/zzin-bookshelf

wrangler pages secret put GITHUB_BRANCH --project-name zzin-bookshelf
# 提示时输入 main

wrangler pages secret put VAULT_PATH --project-name zzin-bookshelf
# 提示时输入 vault/more
```

### 6. 触发首次 deploy

Dashboard → zzin-bookshelf → Deployments → Create deployment → 选 `main` 分支

或者本地 push 触发:
```bash
git push origin main
```

CF Pages 自动检测 push 触发 build。Build 日志在 Dashboard。

**首次 build 时 `vault/` 还不存在(因为 Obsidian Git 还没配置),所以会输出空 placeholder。** 这是预期的 — 装完 Obsidian Git 同步一次后就有了。

---

## 配置 Obsidian Git 插件(把 vault 同步到 GitHub)

### 1. 装插件

Obsidian → Settings → Community plugins → Browse → 搜 "Git" → 装 [Obsidian Git](https://github.com/denolehov/obsidian-git) → Enable

### 2. 配置

Obsidian Git settings:
- **Vault backup directory**: 留空(用默认 vault root)
- **Automatic backup interval**: 5 分钟(或你喜欢的频率)
- **Custom remote**: 不填(默认 `origin`)
- **Authentication**: **Personal access token** (把刚才 GitHub PAT 同一个填进去)

### 3. 首次 commit + push

打开 Obsidian 命令面板(Ctrl+P)→ "Git: Create backup" 或 "Git: Push"

第一次会让你确认 commit message,默认 "Obsidian backup <timestamp>" 即可。

之后 vault 里任何 .md 改动,Obsidian Git 会自动 commit + push 到 `Zzin-cell/zzin-bookshelf` 的 `vault/` 目录。

**重要约定**:Obsidian Git 推送的 vault 根目录 = repo 里的 `vault/` 子目录。所以 build 时:
- `vault/*.md` → `parse_books.mjs` 读(vault 根的 .md 是读书笔记)
- `vault/more/**/*.md` → `parse_more.mjs` 读(more/ 子目录是更多模块)

---

## 本地开发

### 一次性设置

```bash
npm install
```

### 跑 build(本地)

```bash
# 用默认 Windows obsidian vault 路径
npm run build

# 或者用自定义路径
OBSIDIAN_VAULT=D:/path/to/vault npm run build
```

输出:
- `data/books.json` + `public/data/books.json`
- `data/more.json` + `public/data/more.json`

### 本地起 dev server

```bash
python scripts/serve.py
```

访问 `http://localhost:8765/` — 这是 mcode 部署用的同一套(serve.py 既托管 public/ 又提供 /api/more/* 后端)。

### wrangler 本地 preview(模拟 CF Pages + Functions)

```bash
# 先建一个 .dev.vars 文件,内容:
#   SITE_PASSWORD=zzin0715
#   GITHUB_TOKEN=<你的 GitHub PAT>

wrangler pages dev ./public
```

访问 `http://localhost:8788/` — 这个 mode 会运行 Pages Functions,你可以本地端到端测试 Worker 后端。

---

## 怎么生成 GitHub PAT

1. https://github.com/settings/tokens → "Generate new token (classic)"
2. Note: "zzin-bookshelf CF Pages Worker"
3. Expiration: No expiration(或者按你偏好)
4. Scopes: 勾 **`repo`** (Full control of private repositories)
5. Generate token → 复制 token(只显示一次)

把 token 给 wrangler secret(`wrangler pages secret put GITHUB_TOKEN`),**不要 commit 到 git**。

---

## CF Pages 自动 build 触发

每次 push 到 `main` 分支,CF Pages 自动:
1. 跑 `npm run build`
2. 把生成的文件 deploy 到公网
3. Worker 函数从 `functions/` 目录自动加载

也就是说你的工作流:
- 在 Obsidian 写文章 → Obsidian Git 自动 push → CF Pages 自动 build → 公网更新

---

## 已知问题 / 注意

- **AI 概要生成**:CF Pages build environment 没有 LLM 凭据,books_with_summaries.json 的生成仍需要本地跑 `python scripts/build_summaries.py` 后 commit 到 repo。
- **build 延迟**:GitHub push → CF Pages build 通常 30-60 秒,公网更新有短暂延迟。
- **首次 build**:`vault/` 不存在时会输出空 placeholder(这是 fallback 行为,不报错)。装完 Obsidian Git 同步一次后正常。
- **密码**:`zzin0715` 是默认值,生产环境建议改(`wrangler pages secret put SITE_PASSWORD` 设新值)。
- **公开 vault**:repo 是公开的,意味着 vault 内容(包括读书笔记评论)会公网可见。