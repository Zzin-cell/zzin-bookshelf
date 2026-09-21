# 读书笔记 — weread-bookshelf

公开站：[n68fftk1cyinq.space.mcode.cn](https://n68fftk1cyinq.space.mcode.cn) · 数据流：微信读书 → Obsidian → 本仓库 → 公网

---

## 数据流

```
微信读书 划线 / 想法
        │
        ▼  Weread 插件（你已经在用的 Obsidian 同步）
Obsidian vault\*.md
        │
        ▼  parse_books.py
data/books.json
        │
        ▼  build_summaries.py + LLM
data/books_with_summaries.json
        │
        ▼  website_deploy
公网 URL
```

---

## 三种使用方式

### 1. 本地实时（推荐日常）

双击 `watcher.bat`。这会启动一个常驻进程，监听 `C:\Users\MR\Documents\Obsidian Vault\*.md`，一旦有书笔记变化就自动重新解析 → 写入 `public/data/books.json`。

- 笔记本地访问 `http://localhost:8765/`（需要本地起 server）就能看到最新内容
- 不依赖任何外部服务、不调 LLM、不花 token
- 关闭窗口 = 停止监听
- 日志在 `data/watcher.log`

### 2. 重新生成 AI 概要

watcher 不调 LLM（避免每次 vault 变化都花钱）。想刷新 AI 概要时：

```bash
python scripts/build_summaries.py
```

这会扫描哪些章节需要新的概要，把待办写到 `data/_todo_summaries.json`。然后跟我说 **"build summaries"** 或 **"重新生成概要"**，我会读这个待办清单自己生成 AI 概要。

### 3. 部署到公网

跟我说 **"deploy"** 或 **"重新部署"** 即可。每次公开发布都会跟你确认一次（即使是覆盖更新）。

---

## 项目结构

```
weread-bookshelf/
├── scripts/
│   ├── parse_books.py        ← vault → data/books.json
│   ├── build_summaries.py    ← diff → 待生成概要列表
│   └── watcher.py            ← 监听 vault → 自动解析
├── data/
│   ├── books.json             ← 解析后的原始数据（无 AI 概要）
│   ├── books_with_summaries.json  ← 含 AI 概要的最终数据
│   └── watcher.log            ← watcher 运行日志
├── public/                    ← 静态站点（直接打开 index.html 也能跑）
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── data/books.json        ← 公网用的是这个
├── watcher.bat                ← 双击启动 watcher
└── README.md
```

---

## 当你新增一本书时

1. 微信读书里划线 → Weread 插件会自动同步到 `C:\Users\MR\Documents\Obsidian Vault\` 下的一本书 `.md`
2. 如果 watcher 在跑：几秒内 `public/data/books.json` 自动更新（本地刷新即可）
3. 如果想公网也更新：跟我说 "build summaries" → 等我说 "准备好了" → 你说 "deploy" → 我跟你确认 → 公网刷新

---

## 已知限制

- **AI 概要不自动重生成**：vault 改了就重生成太贵。手动触发。
- **deploy 不会自动跑**：每次公开发布都跟你确认一次。
- **图片是远程 URL**：用的是微信读书 CDN，如果对方改防盗链，封面会失效。
- **搜索范围**：当前搜索只匹配书名 / 作者 / 简介 / 分类，没匹配笔记文本（要的话我加上）。