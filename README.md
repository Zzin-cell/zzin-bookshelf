# 张紫宁 · 一点有意思的书

公开站(老 mcode): `https://wbhzjfjs3qjf9.space.mcode.cn`
数据流: Obsidian vault → 本地解析 → 静态站 → 公网

---

## 架构

```
[Obsidian vault (你本地)]
        │
        ▼ parse_books.py  (本地跑一次)
data/books.json
        │
        ▼ mcode website_deploy (我做的)
public/data/books.json
        │
        ▼ mcode CDN
公网静态站
```

**3 个页面:**
- **首页** `/` — hero + 藏书统计 + 名言轮播 + 编辑推荐
- **推荐** `/#/recommend` — 按 已读完 / 笔记密度高 / 最近翻过 三档分
- **关于** `/#/about` — 头像 / 自介 / 12 周笔记活动热图(可 contentEditable inline 编辑,本地 localStorage 保存)

---

## 项目目录

```
weread-bookshelf/
├── public/                       ← 静态站点根(mcode deploy 这个目录)
│   ├── index.html                ← SPA shell + 顶部 nav(首页/推荐/关于)
│   ├── styles.css
│   ├── app.js                    ← SPA logic(router + 3 个 view + about inline 编辑)
│   ├── assets/                   ← logo、avatar、css 图
│   └── data/
│       ├── books.json            ← 读书笔记数据(由你手工提供 JSON)
│       └── about.json            ← 关于页内容(手工维护)
├── scripts/
│   ├── serve.py                  ← 本地静态 dev server(纯 GET,不写 obsidian)
│   └── check_about.py            ← 调试 about.json 结构
├── README.md
└── .gitignore
```

---

## 本地开发

### 启动本地 dev server

```bash
python scripts\serve.py
# 或:python -m http.server 8765 -d public(完全等价)
```

打开 `http://127.0.0.1:8765/` 即可看到完整站点。

### 数据说明

- `public/data/books.json` — 读书笔记(books 数组)。站点只是**读取**,不再自动从 Obsidian vault 解析。如想添加书数据,直接编辑这个文件(JSON 数组,结构跟 [data/books.json 备份](https://github.com/Zzin-cell/zzin-bookshelf) 一致)。
- `public/data/about.json` — 关于页内容。可在站点 UI 内 **contenteditable inline 编辑**,自动保存到浏览器 `localStorage.about.edits`(不跨设备)。

---

## 公网部署

跟我说"mcode deploy"或"重新部署"即可。每次公开发布会跟你确认一次(即使是覆盖更新)。

---

## 当你新增一本书时

1. 编辑 `public/data/books.json`,手动添加 book 对象(JSON 数组)
2. 跟我说"mcode deploy"→ 我跟你确认 → 公网刷新

---

## 已知限制

- **纯静态站**:公网 mcode 静态托管,任何写操作(用户评论、关于页 inline 编辑等)只能本地保存到浏览器 localStorage,不持久化到服务器
- **关于页编辑**:`contenteditable` 写操作只存到 `localStorage.about.edits`,不跨设备同步
- **Obsidian Vault** 是单数据源,公网数据是 `git` 历史快照