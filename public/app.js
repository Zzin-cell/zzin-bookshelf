/* ----------------------------------------------------------------
   张紫宁书库 — SPA logic
   - fetch data/books.json
   - hash routing:  #/ · #/books · #/recommend · #/book/:slug · #/about
   - bookshelf · book detail w/ hot-notes · recommend picks · about
   ---------------------------------------------------------------- */

const DATA_URL = "data/books.json";
const ABOUT_URL = "data/about.json";
const app = document.getElementById("app");

const state = {
  books: [],
  about: null,
  takes: null,
  filter: { q: "", category: "all", status: "all" },
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

function filterBooks(books, f) {
  const q = f.q.trim().toLowerCase();
  return books.filter(b => {
    if (f.category !== "all" && pillCategory(b.category) !== f.category) return false;
    if (f.status === "finished" && !isFinished(b)) return false;
    if (f.status === "unfinished" && isFinished(b)) return false;
    if (q) {
      const hay = [b.title, b.author, b.summary, b.category].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function categories(books) {
  const set = new Set(books.map(b => pillCategory(b.category)));
  return ["all", ...[...set].filter(Boolean).sort()];
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

// ---------- view: HOME (MiniMax-style centered hero) ----------

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
    <section class="page-stats" aria-label="藏书数据">
      <div><span class="num">${stats.total}</span><span class="lbl">藏书</span></div>
      <div><span class="num">${stats.totalNotes.toLocaleString()}</span><span class="lbl">笔记</span></div>
      <div><span class="num">${stats.finished}</span><span class="lbl">已读完</span></div>
      <div><span class="num">${stats.totalNotes > 0 ? Math.round(stats.totalNotes / stats.total) : 0}</span><span class="lbl">平均笔记/本</span></div>
    </section>

    <section class="hero">
      <h1 class="hero-title">张紫宁</h1>
      <p class="hero-sub">一点有意思的书</p>
      <div class="hero-cta">
        <a class="btn btn-primary" href="#/books">浏览书架 · ${stats.total} 本</a>
        <a class="btn btn-dark" href="#/recommend">编辑推荐</a>
        <a class="btn btn-outline" href="#/about">关于这个库</a>
      </div>
    </section>

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
  `;

  // Quote rotator: vertical slide every 5s, pause on hover.
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

function pickHeroQuote(books) {
  for (const b of books) {
    for (const c of (b.chapters || [])) {
      const mine = (c.notes || []).find(n => n.is_mine);
      if (mine) {
        return { text: mine.text, book: b.title, chapter: c.chapter };
      }
    }
  }
  return { text: "读书是给自己的礼物。", book: "", chapter: "" };
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

// ---------- view: BOOKS (the bookshelf) ----------

function bookBucket(book) {
  const cat = pillCategory(book.category);
  return { key: cat || "未分类", label: cat || "未分类", emoji: "🗂" };
}

function renderBooks() {
  setActiveNav("books");
  const stats = renderHeaderStats(state.books);
  const cats = categories(state.books);

  // Pre-compute group counts (over all books, not just filtered)
  const allGroups = {};
  for (const b of state.books) {
    const k = bookBucket(b).key;
    (allGroups[k] = allGroups[k] || []).push(b);
  }

  app.innerHTML = `
    <div style="margin-bottom:24px">
      <div class="section-head">
        <h2>书架</h2>
        <p class="lead">全部 ${stats.total} 本 · 已读完 ${stats.finished} 本 · 共 ${stats.totalNotes.toLocaleString()} 条笔记</p>
      </div>
    </div>

    <section class="filters">
      <div class="field">
        <label for="q">搜索</label>
        <input id="q" type="search" placeholder="书名 / 作者 / 笔记关键字" value="${escapeHtml(state.filter.q)}" />
      </div>
      <div class="field">
        <label for="cat">分类</label>
        <select id="cat">
          ${cats.map(c => `<option value="${escapeHtml(c)}" ${state.filter.category === c ? "selected" : ""}>${c === "all" ? "全部" : escapeHtml(c)}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label for="status">状态</label>
        <select id="status">
          <option value="all" ${state.filter.status === "all" ? "selected" : ""}>全部</option>
          <option value="finished" ${state.filter.status === "finished" ? "selected" : ""}>已读完</option>
          <option value="unfinished" ${state.filter.status === "unfinished" ? "selected" : ""}>在读 / 弃读</option>
        </select>
      </div>
      <span class="count" id="count">0 / 0</span>
    </section>

    <div id="grouped-bookshelf">${renderGroupedShelf()}</div>
  `;

  document.getElementById("q").addEventListener("input", e => {
    state.filter.q = e.target.value;
    refreshBooksGrid();
  });
  document.getElementById("cat").addEventListener("change", e => {
    state.filter.category = e.target.value;
    refreshBooksGrid();
  });
  document.getElementById("status").addEventListener("change", e => {
    state.filter.status = e.target.value;
    refreshBooksGrid();
  });

  refreshBooksGrid();
}

function renderGroupedShelf() {
  const filtered = filterBooks(state.books, state.filter);
  const groups = {};
  for (const b of filtered) {
    const k = bookBucket(b).key;
    (groups[k] = groups[k] || []).push(b);
  }
  const total = filtered.length;

  // Order: by count desc, then label asc.
  const ordered = Object.entries(groups).sort((a, b) => {
    if (b[1].length !== a[1].length) return b[1].length - a[1].length;
    return a[0].localeCompare(b[0], "zh-Hans-CN");
  });

  return ordered.map(([key, items]) => `
    <details class="shelf-group" data-bucket="${escapeHtml(key)}" open>
      <summary class="shelf-group-head">
        <span class="shelf-label">${escapeHtml(key)}</span>
        <span class="shelf-count">${items.length} 本</span>
      </summary>
      <div class="bookshelf">
        ${items.map(renderBookCard).join("")}
      </div>
    </details>
  `).join("") + `
    <div class="shelf-empty" ${total ? 'style="display:none"' : ""}><div class="empty-state">没有匹配的书。换个关键词试试。</div></div>
  `;
}

function refreshBooksGrid() {
  const filtered = filterBooks(state.books, state.filter);
  document.getElementById("count").textContent = `${filtered.length} / ${state.books.length}`;
  document.getElementById("grouped-bookshelf").outerHTML =
    `<div id="grouped-bookshelf">${renderGroupedShelf()}</div>`;
}

function renderBookCard(book) {
  const fallback = `<div class="book-cover-fallback">${escapeHtml(book.title.slice(0, 8))}</div>`;
  const cover = book.cover
    ? `<img src="${escapeHtml(book.cover)}" alt="${escapeHtml(book.title)}" loading="lazy" onerror="this.style.display='none';this.parentElement.insertAdjacentHTML('beforeend', this.dataset.fallback||'')" data-fallback="${escapeHtml(fallback)}" />`
    : fallback;
  const finished = isFinished(book);
  const prog = finished ? "已读完" : `进度 ${escapeHtml(book.progress || "0%")}`;
  return `
    <a class="book-card" href="${bookHref(book)}" data-slug="${escapeHtml(book.slug)}">
      <div class="book-cover">${cover}</div>
      <div class="book-meta">
        <div class="book-title">${escapeHtml(book.title)}</div>
        <div class="book-author">${escapeHtml(book.author)}</div>
      </div>
      <div class="book-foot">
        <span class="book-tag">${escapeHtml(pillCategory(book.category))}</span>
        <span class="book-progress ${finished ? "finished" : ""}">${prog}</span>
      </div>
    </a>
  `;
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
        <p class="lead">按"已读完 → 笔记密度高 → 最近翻过"三档分。点进任意一本看完整章节概要 + 我的笔记 + 大众热门笔记。</p>
      </div>
    </div>

    ${renderRecommendSection("已读完", "完整读完了 · 最有发言权", finished, "已读完")}
    ${renderRecommendSection("笔记密度高", "划线 20 条以上 · 重点章节都有 AI 概要", heavy, "笔记密度高")}
    ${renderRecommendSection("最近翻过", "刚加入 · 还在读", fresh, "在读")}
  `;
}

function renderRecommendSection(title, desc, books, reasonLabel) {
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

// ---------- view: BOOK DETAIL ----------

function renderBook(slug) {
  const book = state.books.find(b => b.slug === slug || b.id === slug);
  setActiveNav("");
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
  const withSummary = book.chapters.filter(c => (c.summary || "").trim().length > 0).length;
  const mineNotes = book.chapters.reduce((s, c) => s + (c.notes || []).filter(n => n.is_mine).length, 0);

  const hotNotes = collectHotNotes(book, 8);

  app.innerHTML = `
    <div style="margin-bottom:18px">
      <a class="btn btn-ghost" href="#/books">← 返回书架</a>
    </div>
    <div class="book-detail">
      <aside class="left">
        <div class="cover-large">${cover}</div>
        <h1>${escapeHtml(book.title)}</h1>
        <div class="author">${escapeHtml(book.author)}</div>
        <dl class="meta-list">
          <dt>分类</dt><dd>${escapeHtml(book.category || "—")}</dd>
          <dt>出版社</dt><dd>${escapeHtml(book.publisher || "—")}</dd>
          <dt>出版</dt><dd>${escapeHtml(book.publishDate || "—")}</dd>
          <dt>ISBN</dt><dd>${escapeHtml(book.isbn || "—")}</dd>
          <dt>笔记</dt><dd>${book.noteCount} 条 (本人 ${mineNotes} 条)</dd>
          <dt>书评</dt><dd>${book.reviewCount || 0} 条</dd>
          <dt>进度</dt><dd>${isFinished(book) ? "已读完" : escapeHtml(book.progress || "0%")}</dd>
          <dt>阅读时间</dt><dd>${escapeHtml(book.readingTime || "—")}</dd>
        </dl>
        ${book.pcUrl ? `<div class="actions"><a class="btn btn-primary" href="${escapeHtml(book.pcUrl)}" target="_blank" rel="noopener">在微信读书打开 ↗</a></div>` : ""}

        ${hotNotes.length ? `
          <section class="hot-notes">
            <h4>🔥 这本书里大众最热的笔记</h4>
            <ol>
              ${hotNotes.map(n => `
                <li>
                  <span>${escapeHtml(n.text)}</span>
                  <small class="hot-meta">${escapeHtml(n.book)} · ${escapeHtml(n.chapter)} · ${n.count} 人共读</small>
                </li>
              `).join("")}
            </ol>
          </section>
        ` : ""}
      </aside>

      <section>
        <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:14px;margin-bottom:14px">
          <div>
            <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:4px">章节目录</div>
            <h2 style="margin:0;font-family:var(--font-serif);font-size:22px;font-weight:500;letter-spacing:-.01em">${chaptersTotal} 章 · ${withSummary} 章含 AI 概要</h2>
          </div>
          <div style="display:flex;gap:8px">
            <button id="expand-all" class="btn btn-ghost">全部展开</button>
            <button id="collapse-all" class="btn btn-ghost">全部收起</button>
          </div>
        </div>

        ${book.summary ? `<p class="summary-text">${escapeHtml(book.summary)}</p>` : ""}

        <div class="chapters-list" id="chapters-list" style="margin-top:18px">
          ${book.chapters.map((c, idx) => renderChapterCard(c, idx)).join("")}
        </div>
      </section>
    </div>
  `;

  document.querySelectorAll(".chapter-head").forEach(btn => {
    btn.addEventListener("click", () => {
      btn.closest(".chapter-card").classList.toggle("open");
    });
  });
  document.getElementById("expand-all").addEventListener("click", () => {
    document.querySelectorAll(".chapter-card").forEach(c => c.classList.add("open"));
  });
  document.getElementById("collapse-all").addEventListener("click", () => {
    document.querySelectorAll(".chapter-card").forEach(c => c.classList.remove("open"));
  });

  // Wire "my take" in-place edits (per chapter).
  function persistTake(uid, value) {
    try {
      const cur = JSON.parse(localStorage.getItem("book.takes") || "{}");
      cur[uid] = value;
      localStorage.setItem("book.takes", JSON.stringify(cur));
      state.takes = cur;
    } catch (_) {}
  }
  document.querySelectorAll(".my-take-body").forEach(el => {
    el.addEventListener("blur", () => {
      const sec = el.closest(".my-take");
      const uid = sec && sec.dataset.takeUid;
      if (!uid) return;
      persistTake(uid, el.innerText.trim());
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); el.blur(); }
    });
  });
}

function collectHotNotes(book, n) {
  const all = [];
  for (const c of book.chapters || []) {
    for (const note of c.notes || []) {
      if ((note.count || 0) > 0) {
        all.push({
          text: note.text,
          count: note.count,
          chapter: c.chapter,
          book: book.title,
        });
      }
    }
  }
  all.sort((a, b) => b.count - a.count);
  return all.slice(0, n);
}

function renderChapterCard(chapter, idx) {
  const summary = (chapter.summary || "").trim();
  const mine = (chapter.notes || []).filter(n => n.is_mine);
  const total = chapter.notes ? chapter.notes.length : 0;
  const uid = chapter.chapterUid;
  const initialTake = (state.takes && state.takes[uid]) || "";
  return `
    <article class="chapter-card" data-cidx="${idx}" data-cuid="${escapeHtml(uid)}">
      <button class="chapter-head" aria-expanded="false">
        <h3>${escapeHtml(chapter.chapter)}</h3>
        <div class="right">
          <span class="pill">${total} 笔记 · 本人 ${mine.length}</span>
          <span class="chapter-toggle">▾</span>
        </div>
      </button>
      <div class="chapter-body">
        <div class="summary-block ${summary ? "" : "empty"}">
          <span class="summary-label">本章逻辑</span>
          ${summary ? escapeHtml(summary) : "（暂无概要，待 AI 生成）"}
        </div>
        <div class="notes-section">
          <h4>笔记 · ${total} 条</h4>
          ${(chapter.notes || []).map(renderNote).join("") || `<div class="empty-state" style="padding:18px">本章没有笔记。</div>`}
        </div>
        <section class="my-take" data-take-uid="${escapeHtml(uid)}">
          <div class="my-take-label">张紫宁解读</div>
          <div class="my-take-body" contenteditable="plaintext-only" spellcheck="false" data-placeholder="在这里写下你对这个章节的私人理解、疑问、灵感……">${escapeHtml(initialTake)}</div>
        </section>
      </div>
    </article>
  `;
}

function renderNote(n) {
  const cls = n.is_mine ? "mine" : (n.count >= 100 ? "hot" : "");
  return `
    <div class="note-item ${cls}">
      <p class="text">${escapeHtml(n.text)}</p>
      <div class="meta">
        ${n.ts ? `<span>⏱ ${escapeHtml(n.ts.replace("T", " ").slice(0, 16))}</span>` : `<span>大众共读</span>`}
        ${n.count ? `<span class="count">🔥 ${n.count} 人</span>` : ""}
      </div>
    </div>
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
  // Build the grid anchored to today (right-most column ends on today's weekday).
  const dow = today.getDay(); // 0=Sun..6=Sat
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      // col=cols-1, row=dow -> today
      const offsetFromToday = (cols - 1 - col) * 7 + (dow - row);
      if (offsetFromToday < 0) continue; // future pad
      const dateMs = today.getTime() - offsetFromToday * 86400000;
      const key = new Date(dateMs).toISOString().slice(0, 10);
      const lvl = level(counts.get(key));
      const x = 4 + col * (cell + gap);
      const y = 4 + row * (cell + gap);
      svg += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2" ry="2" fill="${colors[lvl]}" data-date="${key}" data-count="${counts.get(key) || 0}"><title>${key} · ${counts.get(key) || 0} 条笔记</title></rect>`;
    }
  }
  // week labels removed per user request (was Mon/Wed/Fri)
  svg += `</svg>`;
  return { svg, total: counts, max, days };
}

function renderAbout() {
  setActiveNav("about");
  const stats = renderHeaderStats(state.books);
  let about = state.about || { name: "张紫宁", displayName: "张紫宁", avatar: "assets/avatar.svg", bio: "", bio_long: "", intro: "", links: {} };
  // Merge local edits stored in localStorage.
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
  // Links textarea
  const linksTa = app.querySelector('textarea[data-field="links"]');
  if (linksTa) {
    linksTa.addEventListener("blur", () => {
      try {
        const obj = JSON.parse(linksTa.value || "{}");
        persistField("links", obj);
      } catch {
        // keep raw text
        persistField("links_raw", linksTa.value);
      }
    });
  }

  // Export JSON button (removed per user request — keeping helper available via console)
  // Use: buildAboutJson(state.aboutEffective) in DevTools to export manually.

  // Download avatar as PNG (removed per user request)
  // Use the helper below in DevTools if you need to export.
  // function downloadAvatarNow() { ... }
}

function buildAboutJson(base) {
  // Try to parse links_raw if present.
  let links = base.links || {};
  if (base.links_raw) {
    try { links = JSON.parse(base.links_raw); } catch { /* keep last good */ }
  }
  const out = {
    name: base.name || "张紫宁",
    displayName: base.displayName || base.name || "张紫宁",
    handle: base.handle || "",
    avatar: base.avatar || "assets/avatar.svg",
    bio: base.bio || "",
    bio_long: base.bio_long || "",
    intro: base.intro || "",
    links: links,
    vault_path: base.vault_path || "",
    deploy_mode: "auto"
  };
  return JSON.stringify(out, null, 2);
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
  if (parts[0] === "books") return renderBooks();
  if (parts[0] === "recommend") return renderRecommend();
  if (parts[0] === "about") return renderAbout();
  if (parts[0] === "book" && parts[1]) return renderBook(decodeURIComponent(parts[1]));
  renderHome();
}

// ---------- boot ----------

async function boot() {
  try {
    const [booksRes, aboutRes] = await Promise.all([
      fetch(DATA_URL),
      fetch(ABOUT_URL).catch(() => null),
    ]);
    state.books = await booksRes.json();
    if (aboutRes && aboutRes.ok) {
      try { state.about = await aboutRes.json(); } catch (_) { state.about = null; }
    }
    // Local "my takes" (in-place edit on chapters)
    try { state.takes = JSON.parse(localStorage.getItem("book.takes") || "{}"); } catch (_) { state.takes = {}; }
    route();
    window.addEventListener("hashchange", route);
  } catch (e) {
    app.innerHTML = `<div class="empty-state">数据加载失败：${escapeHtml(String(e))}</div>`;
  }
}

boot();