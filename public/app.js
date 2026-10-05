/* ----------------------------------------------------------------
   张紫宁书库 — SPA logic
   - fetch data/books.json + data/about.json
   - hash routing:  #/ · #/recommend · #/about
   - home · recommend · about (bookshelf / book detail / more module 已被移除)
   ---------------------------------------------------------------- */

const DATA_URL = "data/books.json";
const ABOUT_URL = "data/about.json";
const app = document.getElementById("app");

const state = {
  books: [],
  about: null,
  aboutEffective: null,
};

// ---------- utils ----------

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function formatDate(s) {
  if (!s || s === "1970-01-01") return "";
  return s.replace(/-/g, ".");
}

function pillCategory(category) {
  if (!category) return "未分类";
  const parts = category.split(/[-—]/);
  return parts[0] || category;
}

function isFinished(book) {
  return book.readingStatus === "4" || /^100%$/.test(book.progress || "");
}

function renderHeaderStats(books) {
  const totalNotes = books.reduce((s, b) => s + (b.noteCount || 0), 0);
  const finished = books.filter(isFinished).length;
  return { totalNotes, finished, total: books.length };
}

function setActiveNav(name) {
  document.querySelectorAll(".nav-links a").forEach(a => {
    a.classList.toggle("active", a.dataset.link === name);
  });
}

function coverOrFallback(book, klass = "book-cover") {
  const fallback = `<div class="book-cover-fallback">${escapeHtml(book.title.slice(0, 8))}</div>`;
  return book.cover
    ? `<div class="${klass}"><img src="${escapeHtml(book.cover)}" alt="${escapeHtml(book.title)}" loading="lazy" onerror="this.style.display='none';this.parentElement.insertAdjacentHTML('beforeend', this.dataset.fallback||'')" data-fallback="${escapeHtml(fallback)}" /></div>`
    : `<div class="${klass}">${fallback}</div>`;
}

function bookHref(book) {
  return `#/book/${encodeURIComponent(book.slug)}`;
}

// ---------- view: HOME ----------

// Curated quotes pool (≈12). Each: { text, book, chapter }
const QUOTES_POOL = [
  { text: "彼等亦如吾侪之只能见己之影像，与他人之影像。其所以能见之者，以火光射于孔中相向之屋壁耳。", book: "什么是舆论", chapter: "文前" },
  { text: "唯一值得恐惧的是恐惧本身——那种没有理由、毫无根据的恐惧，会让我们畏缩不前，把我们转变成懦夫。", book: "炉边谈话", chapter: "1 · 谈银行危机（1933年3月12日）" },
  { text: "时间是投资者的朋友，也是企业的朋友；但时间不是短线交易者的朋友。", book: "共同基金常识", chapter: "译者序" },
  { text: "你的每一个行动都受三个要素驱动：动机、能力和提示。三者同时到位，行为就会发生。", book: "福格行为模型", chapter: "前言" },
  { text: "空口袋站不直。一个人如果连饭都吃不饱，他很难坚持诚实。", book: "穷理查智慧书", chapter: "编者的话" },
  { text: "你的消费习惯是被设计出来的。一百年前的百货公司把逛街变成一种娱乐，发明了你今天以为理所当然的「顾客」。", book: "制造消费者", chapter: "前言" },
  { text: "在这里，一个人不知道他该相信什么。每个人都想要什么，没人知道代价是什么。", book: "光荣与梦想", chapter: "正文" },
  { text: "一个国家凭什么存在，从来都是被「逼」出来的。压力把泥土夯实，把人聚成国。", book: "光荣与梦想", chapter: "正文" },
  { text: "在远古的流言里，权威被敬畏、传统被尊重、未来被服从；这正是权力的起源。", book: "权力密码", chapter: "前言" },
  { text: "我们真正恐惧的，是恐惧这种情绪本身——它的扩散速度，远比病毒更快。", book: "炉边谈话", chapter: "导言" },
  { text: "道德只是个名词，真正的力量是规则；规则解释不清时，再去谈道德。", book: "制造消费者", chapter: "第一章" },
  { text: "经济学第一课的三个真相：第一，永动机不存在；第二，资源是稀缺的；第三，人是要算账的。", book: "米塞斯的经济学课", chapter: "推荐序" },
];

function renderHome() {
  setActiveNav("home");
  const stats = renderHeaderStats(state.books);
  const featured = pickFeatured(state.books, 4);

  app.innerHTML = `
    <section class="hero" aria-label="简介">
      <h1 class="hero-title">张紫宁</h1>
      <p class="hero-sub">一点有意思的书</p>
      <div class="hero-cta">
        <a class="btn btn-primary" href="#/recommend">编辑推荐</a>
        <a class="btn btn-outline" href="#/about">关于这个库</a>
      </div>
    </section>

    <hr class="hero-divider" aria-hidden="true" />

    <section class="hero-content" aria-label="藏书数据">
      <div class="page-stats">
        <div><span class="num">${stats.total}</span><span class="lbl">藏书</span></div>
        <div><span class="num">${stats.totalNotes.toLocaleString()}</span><span class="lbl">笔记</span></div>
        <div><span class="num">${stats.finished}</span><span class="lbl">已读完</span></div>
        <div><span class="num">${stats.totalNotes > 0 ? Math.round(stats.totalNotes / stats.total) : 0}</span><span class="lbl">平均笔记/本</span></div>
      </div>

      <section class="quotes-rotator" id="quotes-rotator" aria-label="书中名言轮播">
        <span class="quotes-label">书中名言</span>
        <div class="quotes-stage" id="quotes-stage">
          ${QUOTES_POOL.map((q, i) => `
            <div class="quote-slide ${i === 0 ? "is-active" : ""}" data-i="${i}">
              <p class="quote-text">${escapeHtml(q.text)}</p>
              <small class="quote-src">— 《${escapeHtml(q.book)}》 · ${escapeHtml(q.chapter)}</small>
            </div>
          `).join("")}
        </div>
        <span class="quotes-counter" id="quotes-counter">1 / ${QUOTES_POOL.length}</span>
      </section>

      <section class="featured">
        <div class="section-head">
          <h2>编辑推荐</h2>
          <p class="lead">已读完 + 笔记密度高 + 跟金融财经/认知相关 —— 这四本最先翻。</p>
        </div>
        <div class="featured-grid">
          ${featured.map(renderFeaturedCard).join("")}
        </div>
        <div style="text-align:center;margin-top:24px">
          <a class="btn btn-ghost" href="#/recommend">看全部推荐 →</a>
        </div>
      </section>
    </section>
  `;

  // Quote rotator: vertical slide every 3s, pause on hover.
  startQuoteRotator();
}

function pickFeatured(books, n) {
  return books
    .filter(b => isFinished(b) || (b.noteCount || 0) >= 20)
    .sort((a, b) => (b.noteCount || 0) - (a.noteCount || 0))
    .slice(0, n);
}

function renderFeaturedCard(book) {
  const reason = pickReason(book);
  return `
    <a class="featured-card" href="${bookHref(book)}">
      ${coverOrFallback(book, "cover-wrap")}
      <p class="reason">${escapeHtml(reason.label)}</p>
      <h3 class="title">${escapeHtml(book.title)}</h3>
      <p class="author">${escapeHtml(book.author)}</p>
      <p class="why">${escapeHtml(reason.text)}</p>
    </a>
  `;
}

function pickReason(book) {
  if (isFinished(book)) {
    return { label: "已读完", text: `${book.noteCount} 条划线 · 进度 100%` };
  }
  if ((book.noteCount || 0) >= 100) {
    return { label: "笔记密度高", text: `${book.noteCount} 条划线 / ${(book.chapters||[]).length} 章` };
  }
  if ((book.noteCount || 0) >= 20) {
    return { label: "在读", text: `${book.noteCount} 条划线 · ${escapeHtml(book.progress || "0%")}` };
  }
  return { label: "待读", text: `已加入书架` };
}

// ---------- quote rotator ----------

let _quoteTimer = null;
let _quoteIdx = 0;
function startQuoteRotator() {
  const stage = document.getElementById("quotes-stage");
  const counter = document.getElementById("quotes-counter");
  const root = document.getElementById("quotes-rotator");
  if (!stage || !counter || !root) return;
  const total = QUOTES_POOL.length;
  if (total <= 1) return;

  function show(i) {
    _quoteIdx = (i + total) % total;
    stage.querySelectorAll(".quote-slide").forEach((el, idx) => {
      el.classList.toggle("is-active", idx === _quoteIdx);
    });
    counter.textContent = `${_quoteIdx + 1} / ${total}`;
  }

  function tick() { show(_quoteIdx + 1); }

  // Pause on hover.
  let paused = false;
  root.addEventListener("mouseenter", () => { paused = true; });
  root.addEventListener("mouseleave", () => { paused = false; });

  if (_quoteTimer) clearInterval(_quoteTimer);
  _quoteTimer = setInterval(() => { if (!paused) tick(); }, 3000);
  show(0);
}

// ---------- view: BOOKSHELF (simple list) ----------

function renderBooks() {
  setActiveNav("books");
  const stats = renderHeaderStats(state.books);

  // Sort by lastReadDate desc, fallback to title.
  const sorted = [...state.books].sort((a, b) => {
    const da = a.lastReadDate || "";
    const db = b.lastReadDate || "";
    if (da !== db) return db.localeCompare(da);
    return (a.title || "").localeCompare(b.title || "");
  });

  app.innerHTML = `
    <div class="section-head" style="margin-bottom:24px">
      <h2>书架</h2>
      <p class="lead">共 ${stats.total} 本 · 已读完 ${stats.finished} 本 · 点击任意一本进入「书 + 白板」视图,把笔记拖进白板组织思路。</p>
    </div>
    <div class="featured-grid">
      ${sorted.map(b => {
        const reason = pickReason(b);
        return `
          <a class="featured-card" href="${bookHref(b)}">
            ${coverOrFallback(b, "cover-wrap")}
            <p class="reason">${escapeHtml(reason.label)}</p>
            <h3 class="title">${escapeHtml(b.title)}</h3>
            <p class="author">${escapeHtml(b.author)}</p>
            <p class="why">${escapeHtml(reason.text)}</p>
          </a>
        `;
      }).join("")}
    </div>
  `;
}

// ---------- view: BOOK DETAIL (left = notes, right = whiteboard) ----------

function renderBook(slug) {
  const book = state.books.find(b => b.slug === slug || b.id === slug);
  setActiveNav("books");
  if (!book) {
    app.innerHTML = `
      <div class="empty-state">
        没有找到这本书。
        <div style="margin-top:14px"><a class="btn btn-ghost" href="#/books">← 返回书架</a></div>
      </div>`;
    return;
  }

  const fallback = `<div class="book-cover-fallback" style="font-size:30px;padding:40px 16px;">${escapeHtml(book.title.slice(0, 12))}</div>`;
  const cover = book.cover
    ? `<img src="${escapeHtml(book.cover)}" alt="${escapeHtml(book.title)}" onerror="this.style.display='none';this.parentElement.insertAdjacentHTML('beforeend', this.dataset.fallback||'')" data-fallback="${escapeHtml(fallback)}" />`
    : fallback;

  const chaptersTotal = book.chapters.length;
  const allNotes = book.chapters.flatMap(c => (c.notes || []).map(n => ({ ...n, chapter: c.chapter, chapterUid: c.chapterUid })));

  app.innerHTML = `
    <div class="book-workspace">
      <aside class="book-left">
        <div class="book-left-toolbar">
          <a class="btn btn-ghost" href="#/books">← 返回书架</a>
          <button class="btn btn-ghost" id="left-collapse" type="button" title="收起整个左侧(白板仍保留)">⟨ 收起</button>
          <button class="btn btn-ghost" id="intro-collapse" type="button" title="只看标题 + 收起简介(笔记仍显示)">▾ 简介</button>
        </div>
        <div class="book-left-body">
          <div class="book-intro" id="book-intro">
            <div class="book-cover-large">${cover}</div>
            <h1>${escapeHtml(book.title)}</h1>
            <div class="author">${escapeHtml(book.author)}</div>
            <dl class="meta-list">
              <dt>分类</dt><dd>${escapeHtml(book.category || "—")}</dd>
              <dt>出版社</dt><dd>${escapeHtml(book.publisher || "—")}</dd>
              <dt>出版</dt><dd>${escapeHtml(book.publishDate || "—")}</dd>
              <dt>笔记</dt><dd>${book.noteCount} 条 (本人 ${allNotes.filter(n => n.is_mine).length} 条)</dd>
              <dt>进度</dt><dd>${isFinished(book) ? "已读完" : escapeHtml(book.progress || "0%")}</dd>
            </dl>
            ${book.summary ? `<p class="summary-text">${escapeHtml(book.summary)}</p>` : ""}
            ${book.pcUrl ? `<a class="btn btn-primary" href="${escapeHtml(book.pcUrl)}" target="_blank" rel="noopener">在微信读书打开 ↗</a>` : ""}
          </div>
          <div class="book-notes">
            <div class="section-head" style="margin: 18px 0 12px">
              <h2 style="font-size:18px">高亮笔记 · ${allNotes.length} 条</h2>
              <p class="lead" style="font-size:13px">拖拽笔记卡片到右侧白板,在那里组织你的思路。</p>
            </div>
            <div class="notes-board" id="notes-board">
              ${allNotes.map((n, i) => `
                <article class="note-card" draggable="true" data-note-idx="${i}" data-note-text="${escapeHtml(n.text)}" data-note-chapter="${escapeHtml(n.chapter)}">
                  <p class="note-text">${escapeHtml(n.text)}</p>
                  <div class="note-meta">
                    <span>📖 ${escapeHtml(n.chapter)}</span>
                    ${n.is_mine ? `<span>⏱ ${escapeHtml((n.ts || '').slice(0, 16))}</span>` : `<span>大众共读</span>`}
                    ${n.count ? `<span>🔥 ${n.count} 人</span>` : ""}
                  </div>
                </article>
              `).join("")}
            </div>
          </div>
        </div>
      </aside>
      <section class="book-whiteboard" id="book-whiteboard">
        <div class="whiteboard-toolbar">
          <span>📋 思路白板</span>
          <span class="whiteboard-hint">从左侧拖笔记卡片 → 在此组织 · 双击节点可删除/连线</span>
          <div class="whiteboard-actions">
            <button class="btn btn-ghost" type="button" id="wb-add-text" title="新建文字节点">＋ 文字</button>
            <button class="btn btn-ghost" type="button" id="wb-add-table" title="新建 3×3 表格">＋ 表格</button>
            <button class="btn btn-ghost" type="button" id="wb-export" title="导出当前白板为 JSON">导出</button>
            <button class="btn btn-ghost" type="button" id="wb-import" title="导入 JSON 覆盖当前白板">导入</button>
            <button class="btn btn-ghost" type="button" id="wb-clear" title="清空白板">清空</button>
          </div>
        </div>
        <div class="whiteboard-stage" id="whiteboard-stage"></div>
      </section>
    </div>
  `;

  // 收起/展开左侧模块
  document.getElementById("left-collapse")?.addEventListener("click", () => {
    document.querySelector(".book-workspace")?.classList.toggle("left-collapsed");
    const btn = document.getElementById("left-collapse");
    if (btn) btn.textContent = document.querySelector(".book-workspace")?.classList.contains("left-collapsed") ? "⟩ 展开" : "⟨ 收起";
  });

  // 收起/展开简介(笔记仍显示)
  document.getElementById("intro-collapse")?.addEventListener("click", () => {
    document.getElementById("book-intro")?.classList.toggle("is-collapsed");
    const btn = document.getElementById("intro-collapse");
    if (btn) btn.textContent = document.getElementById("book-intro")?.classList.contains("is-collapsed") ? "▴ 简介" : "▾ 简介";
  });

  // 初始化白板(whiteboard.js 必须在此之前加载)
  const stage = document.getElementById("whiteboard-stage");
  WB.init(stage, book.slug);

  // 工具栏:新建文字 / 表格
  document.getElementById("wb-add-text")?.addEventListener("click", () => {
    const r = stage.getBoundingClientRect();
    WB.createText(60, 60);
  });
  document.getElementById("wb-add-table")?.addEventListener("click", () => {
    WB.createTable(80, 80, 3, 3);
  });
  document.getElementById("wb-clear")?.addEventListener("click", () => WB.clear());
  document.getElementById("wb-export")?.addEventListener("click", () => {
    const json = WB.exportJSON();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${book.slug}-whiteboard.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
  document.getElementById("wb-import")?.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const ok = WB.importJSON(String(reader.result || ""));
        if (!ok) alert("JSON 解析失败,白板未改动");
      };
      reader.readAsText(file);
    });
    input.click();
  });

  // 笔记卡片 → 拖入白板 → 创建 note 节点
  // HTML5 drag-and-drop
  stage.addEventListener("dragover", (ev) => {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = "copy";
  });
  stage.addEventListener("drop", (ev) => {
    ev.preventDefault();
    const text = ev.dataTransfer.getData("text/x-note-text");
    const chapter = ev.dataTransfer.getData("text/x-note-chapter");
    if (!text) return;
    WB.dropNoteFromCard(text, chapter, ev.clientX, ev.clientY);
  });

  document.querySelectorAll(".note-card[draggable]").forEach((card) => {
    card.addEventListener("dragstart", (ev) => {
      const text = card.dataset.noteText || "";
      const chapter = card.dataset.noteChapter || "";
      ev.dataTransfer.setData("text/x-note-text", text);
      ev.dataTransfer.setData("text/x-note-chapter", chapter);
      ev.dataTransfer.effectAllowed = "copy";
    });
  });
}

// ---------- view: RECOMMEND ----------

function renderRecommend() {
  setActiveNav("recommend");

  const finished = state.books.filter(isFinished).sort((a, b) => (b.noteCount || 0) - (a.noteCount || 0));
  const heavy = state.books.filter(b => !isFinished(b) && (b.noteCount || 0) >= 20).sort((a, b) => (b.noteCount || 0) - (a.noteCount || 0));
  const fresh = state.books.filter(b => !isFinished(b) && (b.noteCount || 0) < 20).sort((a, b) => (b.lastReadDate || "").localeCompare(a.lastReadDate || "")).slice(0, 3);

  app.innerHTML = `
    <div style="margin-bottom:32px">
      <div class="section-head">
        <h2>编辑推荐</h2>
        <p class="lead">按"已读完 → 笔记密度高 → 最近翻过"三档分。</p>
      </div>
    </div>

    ${renderRecommendSection("已读完", "完整读完了 · 最有发言权", finished, "已读完")}
    ${renderRecommendSection("笔记密度高", "划线 20 条以上 · 重点章节都有 AI 概要", heavy, "笔记密度高")}
    ${renderRecommendSection("最近翻过", "刚加入 · 还在读", fresh, "在读")}
  `;
}

function renderRecommendSection(title, desc, books) {
  if (!books.length) return "";
  return `
    <section class="featured" style="margin-top: 16px">
      <div class="section-head">
        <h2 style="font-size: 22px">${escapeHtml(title)}</h2>
        <p class="lead">${escapeHtml(desc)}</p>
      </div>
      <div class="featured-grid">
        ${books.map(b => renderFeaturedCard(b)).join("")}
      </div>
    </section>
  `;
}

// ---------- view: ABOUT ----------

function buildActivityHeatmap(books, days = 84) {
  // days = 84 = 12 weeks × 7 days (GitHub-style contribution graph)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startMs = today.getTime() - (days - 1) * 86400000;
  const counts = new Map();
  for (const b of books || []) {
    for (const c of b.chapters || []) {
      for (const n of c.notes || []) {
        if (!n.is_mine || !n.ts) continue;
        const d = new Date(n.ts.slice(0, 10) + "T00:00:00");
        const ms = d.getTime();
        if (ms < startMs || ms > today.getTime()) continue;
        const key = n.ts.slice(0, 10);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
  }
  const max = Math.max(1, ...counts.values());
  // 5 levels: 0 / 1-25% / 25-50% / 50-75% / 75-100%
  function level(n) {
    if (!n) return 0;
    const r = n / max;
    if (r <= 0.25) return 1;
    if (r <= 0.5) return 2;
    if (r <= 0.75) return 3;
    return 4;
  }
  const colors = ["#ebe7df", "#dceed9", "#9bd680", "#5fa946", "#2f7a26"];
  const cell = 12, gap = 3;
  const cols = 12;
  const rows = 7;
  const width = cols * (cell + gap) - gap + 8;
  const height = rows * (cell + gap) - gap + 16;
  let svg = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" aria-label="最近 ${days} 天的笔记活动">`;
  const dow = today.getDay();
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const offsetFromToday = (cols - 1 - col) * 7 + (dow - row);
      if (offsetFromToday < 0) continue;
      const dateMs = today.getTime() - offsetFromToday * 86400000;
      const key = new Date(dateMs).toISOString().slice(0, 10);
      const lvl = level(counts.get(key));
      const x = 4 + col * (cell + gap);
      const y = 4 + row * (cell + gap);
      svg += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2" ry="2" fill="${colors[lvl]}" data-date="${key}" data-count="${counts.get(key) || 0}"><title>${key} · ${counts.get(key) || 0} 条笔记</title></rect>`;
    }
  }
  svg += `</svg>`;
  return { svg, total: counts, max, days };
}

function renderAbout() {
  setActiveNav("about");
  const stats = renderHeaderStats(state.books);
  let about = state.about || { name: "张紫宁", displayName: "张紫宁", avatar: "assets/avatar.svg", bio: "", bio_long: "", intro: "", links: {} };
  try {
    const local = JSON.parse(localStorage.getItem("about.edits") || "null");
    if (local && typeof local === "object") about = { ...about, ...local };
  } catch (_) {}
  state.aboutEffective = about;

  const heat = buildActivityHeatmap(state.books, 84);
  const linkList = about.links || {};
  const linkHtml = Object.entries(linkList).map(([k, v]) => {
    const label = ({douyin: "抖音", wechat_read: "微信读书", weibo: "微博", x: "X", bilibili: "B 站", wechat: "公众号"})[k] || k;
    return `<a class="about-link" href="${escapeHtml(v)}" target="_blank" rel="noopener">${escapeHtml(label)} ↗</a>`;
  }).join("");

  app.innerHTML = `
    <article class="about-card">
      <div class="about-header">
        <div class="about-avatar-wrap" id="avatar-wrap" title="点这里换头像">
          <img class="about-avatar" id="about-avatar-img" src="${escapeHtml(about.avatar)}" alt="${escapeHtml(about.displayName || about.name)}" />
          <span class="about-avatar-hint">📷</span>
        </div>
        <input type="file" id="avatar-input" accept="image/*" style="display:none" />
        <div class="about-id">
          <h1 class="about-name" data-field="displayName" contenteditable="plaintext-only" spellcheck="false">${escapeHtml(about.displayName || about.name)}</h1>
          ${about.handle ? `<p class="about-handle" data-field="handle" contenteditable="plaintext-only" spellcheck="false">@${escapeHtml(about.handle)}</p>` : `<p class="about-handle" data-field="handle" contenteditable="plaintext-only" data-placeholder="@handle" spellcheck="false"></p>`}
          <p class="about-bio" data-field="bio" contenteditable="plaintext-only" spellcheck="false">${escapeHtml(about.bio || "")}</p>
        </div>
      </div>

      <section class="about-block">
        <h2>简介</h2>
        <p data-field="bio_long" contenteditable="plaintext-only" spellcheck="false">${escapeHtml(about.bio_long || "")}</p>
      </section>

      <section class="about-block">
        <h2>自我介绍</h2>
        <p data-field="intro" contenteditable="plaintext-only" spellcheck="false">${escapeHtml(about.intro || "")}</p>
        ${linkHtml ? `<div class="about-links">${linkHtml}</div>` : ""}
      </section>

      <section class="about-block">
        <h2>Obsidian 笔记活动</h2>
        <p class="about-meta">最近 12 周的笔记分布 · ${heat.total && [...heat.total.values()].reduce((a,b)=>a+b,0) || 0} 条本人笔记</p>
        <div class="activity-heatmap">${heat.svg}</div>
        <div class="activity-legend">
          <span>少</span>
          <span class="cell" style="background:#ebe7df"></span>
          <span class="cell" style="background:#dceed9"></span>
          <span class="cell" style="background:#9bd680"></span>
          <span class="cell" style="background:#5fa946"></span>
          <span class="cell" style="background:#2f7a26"></span>
          <span>多</span>
        </div>
      </section>
    </article>
  `;

  // Avatar upload
  const avatarImg = document.getElementById("about-avatar-img");
  const avatarInput = document.getElementById("avatar-input");
  const avatarWrap = document.getElementById("avatar-wrap");
  avatarWrap.addEventListener("click", () => avatarInput.click());
  avatarInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("头像文件请小于 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      avatarImg.src = dataUrl;
      try {
        const cur = JSON.parse(localStorage.getItem("about.edits") || "{}");
        cur.avatar = dataUrl;
        localStorage.setItem("about.edits", JSON.stringify(cur));
        showSaveFlash();
      } catch (_) {}
    };
    reader.readAsDataURL(file);
  });

  // Wire inline edit: persist on blur.
  function persistField(field, value) {
    try {
      const cur = JSON.parse(localStorage.getItem("about.edits") || "{}");
      cur[field] = value;
      localStorage.setItem("about.edits", JSON.stringify(cur));
      showSaveFlash();
    } catch (_) {}
  }
  app.querySelectorAll("[contenteditable][data-field]").forEach(el => {
    el.addEventListener("blur", () => {
      const v = el.innerText.trim();
      persistField(el.dataset.field, v);
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); el.blur(); }
    });
  });
  const linksTa = app.querySelector('textarea[data-field="links"]');
  if (linksTa) {
    linksTa.addEventListener("blur", () => {
      try {
        const obj = JSON.parse(linksTa.value || "{}");
        persistField("links", obj);
      } catch {
        persistField("links_raw", linksTa.value);
      }
    });
  }
}

function buildAboutJson(base) {
  let links = base.links || {};
  if (base.links_raw) {
    try { links = JSON.parse(base.links_raw); } catch { /* keep last good */ }
  }
  return JSON.stringify({
    name: base.name || "张紫宁",
    displayName: base.displayName || base.name || "张紫宁",
    handle: base.handle || "",
    avatar: base.avatar || "assets/avatar.svg",
    bio: base.bio || "",
    bio_long: base.bio_long || "",
    intro: base.intro || "",
    links,
    vault_path: base.vault_path || "",
    deploy_mode: "auto",
  }, null, 2);
}

function showSaveFlash() {
  let bar = document.getElementById("save-flash");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "save-flash";
    bar.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--ink-deep);color:var(--paper-deep);padding:8px 18px;border-radius:999px;font-size:12px;letter-spacing:0.04em;box-shadow:0 6px 18px rgba(0,0,0,.18);z-index:1000;opacity:0;transition:opacity 200ms ease";
    document.body.appendChild(bar);
  }
  bar.textContent = "✓ 已保存到本浏览器";
  bar.style.opacity = "1";
  clearTimeout(bar._t);
  bar._t = setTimeout(() => { bar.style.opacity = "0"; }, 1600);
}

// ---------- router ----------

function route() {
  const hash = location.hash || "#/";
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts.length === 0) return renderHome();
  if (parts[0] === "books") {
    if (parts[1]) return renderBook(decodeURIComponent(parts[1]));
    return renderBooks();
  }
  if (parts[0] === "recommend") return renderRecommend();
  if (parts[0] === "about") return renderAbout();
  // book detail shortcut
  if (parts[0] === "book" && parts[1]) return renderBook(decodeURIComponent(parts[1]));
  renderHome();
}

// ---------- boot ----------

async function boot() {
  try {
    const [booksRes, aboutRes] = await Promise.all([
      fetch(DATA_URL).catch(() => null),
      fetch(ABOUT_URL).catch(() => null),
    ]);
    if (booksRes && booksRes.ok) {
      try { state.books = await booksRes.json(); } catch (_) { state.books = []; }
    }
    if (aboutRes && aboutRes.ok) {
      try { state.about = await aboutRes.json(); } catch (_) { state.about = null; }
    }
    route();
    window.addEventListener("hashchange", route);
  } catch (e) {
    app.innerHTML = `<div class="empty-state">数据加载失败:${escapeHtml(String(e))}</div>`;
  }
}

boot();