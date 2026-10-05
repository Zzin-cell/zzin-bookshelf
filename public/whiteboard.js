/* ----------------------------------------------------------------
   Whiteboard — 自实现白板模块(va 对应 vanilla)
   - 元素: 文字 / 笔记卡片 / 表格(后续)
   - 拖拽 + 调整大小(8 个方向)
   - 选中 / 删除 / 连线
   - 笔记卡片拖入: renderBook 里调用 wbCreateNote
   - 持久化: localStorage `book.<slug>.whiteboard`
   - 缩放: 视图固定 1:1(默认),可按住 Ctrl + 滚轮缩放(后续)

   API(由 app.js 调用):
     wbInit(stageEl, slug, {onChange})  — 初始化白板到 stage 容器
     wbCreateNote(x, y, text, chapter) — 创建笔记节点(笔记卡片拖入用)
     wbClear()                          — 清空白板
     wbExportJSON() / wbImportJSON(json) — 备份 / 恢复
   ---------------------------------------------------------------- */

const WB_KEY = (slug) => `book.${slug}.whiteboard`;

const wb = {
  stage: null,
  slug: "",
  elements: [],   // { id, type:'text'|'note'|'table', x, y, w, h, content, chapter?, rows?, cols?, rowData? }
  lines: [],       // { id, fromId, toId, label }
  selectedId: null,
  drag: null,      // { kind:'move'|'resize', id, startX, startY, origX, origY, origW, origH, handle }
  connect: null,   // { fromId }
  onChange: null,
};

function uid(prefix = "el") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function wbPersist() {
  const payload = {
    elements: wb.elements,
    lines: wb.lines,
    v: 1,
  };
  try {
    localStorage.setItem(WB_KEY(wb.slug), JSON.stringify(payload));
  } catch (_) { /* ignore quota */ }
}

function wbLoad() {
  try {
    const raw = localStorage.getItem(WB_KEY(wb.slug));
    if (!raw) return;
    const data = JSON.parse(raw);
    wb.elements = Array.isArray(data.elements) ? data.elements : [];
    wb.lines = Array.isArray(data.lines) ? data.lines : [];
  } catch (_) { /* ignore */ }
}

function wbRender() {
  if (!wb.stage) return;
  wb.stage.innerHTML = "";
  wb.stage.style.position = "relative";
  wb.stage.style.overflow = "auto";

  // SVG 连线层(z-index 0)
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "wb-svg");
  Object.assign(svg.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "0",
  });
  wb.stage.appendChild(svg);

  // 节点层(z-index 1)
  const layer = document.createElement("div");
  Object.assign(layer.style, {
    position: "relative",
    zIndex: "1",
    width: "100%",
    height: "100%",
    minWidth: "2000px",
    minHeight: "1200px",
  });
  wb.stage.appendChild(layer);

  // 画线
  for (const line of wb.lines) wbDrawLine(svg, line);

  // 画节点
  for (const el of wb.elements) wbDrawElement(layer, el);

  if (wb.onChange) wb.onChange();
}

function wbDrawLine(svg, line) {
  const from = wb.elements.find(e => e.id === line.fromId);
  const to = wb.elements.find(e => e.id === line.toId);
  if (!from || !to) return;
  const x1 = from.x + from.w / 2;
  const y1 = from.y + from.h / 2;
  const x2 = to.x + to.w / 2;
  const y2 = to.y + to.h / 2;

  // 定义箭头 marker(双向)
  const defs = svg.querySelector("defs") || (() => {
    const d = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    svg.appendChild(d);
    return d;
  })();
  if (!defs.querySelector("#wb-arrow-end")) {
    [
      ["end", x2, y2, x1, y1],
    ].forEach(() => {});
    const markerEnd = document.createElementNS("http://www.w3.org/2000/svg", "marker");
    markerEnd.setAttribute("id", "wb-arrow-end");
    markerEnd.setAttribute("markerWidth", "10");
    markerEnd.setAttribute("markerHeight", "10");
    markerEnd.setAttribute("refX", "8");
    markerEnd.setAttribute("refY", "5");
    markerEnd.setAttribute("orient", "auto");
    markerEnd.setAttribute("markerUnits", "strokeWidth");
    const pathE = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pathE.setAttribute("d", "M0,0 L10,5 L0,10 z");
    pathE.setAttribute("fill", "#5b7fbf");
    markerEnd.appendChild(pathE);
    defs.appendChild(markerEnd);
  }
  if (!defs.querySelector("#wb-arrow-start")) {
    const markerStart = document.createElementNS("http://www.w3.org/2000/svg", "marker");
    markerStart.setAttribute("id", "wb-arrow-start");
    markerStart.setAttribute("markerWidth", "10");
    markerStart.setAttribute("markerHeight", "10");
    markerStart.setAttribute("refX", "2");
    markerStart.setAttribute("refY", "5");
    markerStart.setAttribute("orient", "auto-start-reverse");
    markerStart.setAttribute("markerUnits", "strokeWidth");
    const pathS = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pathS.setAttribute("d", "M10,0 L0,5 L10,10 z");
    pathS.setAttribute("fill", "#5b7fbf");
    markerStart.appendChild(pathS);
    defs.appendChild(markerStart);
  }

  // 线本身
  const ln = document.createElementNS("http://www.w3.org/2000/svg", "line");
  ln.setAttribute("x1", x1);
  ln.setAttribute("y1", y1);
  ln.setAttribute("x2", x2);
  ln.setAttribute("y2", y2);
  ln.setAttribute("stroke", "#5b7fbf");
  ln.setAttribute("stroke-width", "2");
  ln.setAttribute("stroke-linecap", "round");
  if (line.bidirectional) {
    ln.setAttribute("marker-end", "url(#wb-arrow-end)");
    ln.setAttribute("marker-start", "url(#wb-arrow-start)");
  } else {
    ln.setAttribute("marker-end", "url(#wb-arrow-end)");
  }
  svg.appendChild(ln);

  // 端点小圆点(只在单向连线显示,双向会被箭头替代)
  if (!line.bidirectional) {
    for (const [cx, cy] of [[x1, y1], [x2, y2]]) {
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("cx", cx);
      dot.setAttribute("cy", cy);
      dot.setAttribute("r", "4");
      dot.setAttribute("fill", "#5b7fbf");
      svg.appendChild(dot);
    }
  }

  // 线中点文字标注
  if (line.label) {
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", midX);
    text.setAttribute("y", midY - 6);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("fill", "#2d4ba6");
    text.setAttribute("font-size", "12");
    text.setAttribute("font-family", "var(--font-mono, monospace)");
    text.setAttribute("style", "paint-order:stroke; stroke:#fff; stroke-width:4px; stroke-linejoin:round;");
    text.textContent = line.label;
    text.style.pointerEvents = "auto";
    text.style.cursor = "pointer";
    text.addEventListener("dblclick", () => {
      const next = prompt("连线标注", line.label || "");
      if (next != null) {
        line.label = next;
        wbPersist();
        wbRender();
      }
    });
    svg.appendChild(text);
  }
}

function wbDrawElement(layer, el) {
  const node = document.createElement("div");
  node.dataset.id = el.id;
  node.className = "wb-element wb-" + el.type + (wb.selectedId === el.id ? " is-selected" : "");
  Object.assign(node.style, {
    position: "absolute",
    left: el.x + "px",
    top: el.y + "px",
    width: el.w + "px",
    minHeight: el.h + "px",
    zIndex: "1",
  });

  if (el.type === "text") {
    node.innerHTML = `<div class="wb-text-content" contenteditable="true">${escapeHtml(el.content || "")}</div>`;
    node.querySelector(".wb-text-content").addEventListener("blur", (ev) => {
      el.content = ev.target.innerText.trim();
      wbPersist();
    });
  } else if (el.type === "note") {
    node.innerHTML = `
      <div class="wb-note-source">📖 ${escapeHtml(el.chapter || "")}</div>
      <div class="wb-note-content" contenteditable="true">${escapeHtml(el.content || "")}</div>
    `;
    node.querySelector(".wb-note-content").addEventListener("blur", (ev) => {
      el.content = ev.target.innerText.trim();
      wbPersist();
    });
    node.querySelector(".wb-note-source").addEventListener("dblclick", () => {
      const next = prompt("笔记来源(章节)", el.chapter || "");
      if (next != null) { el.chapter = next; wbPersist(); wbRender(); }
    });
  } else if (el.type === "table") {
    const rows = el.rows || 3;
    const cols = el.cols || 3;
    if (!el.cells) {
      el.cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ type: "text", text: "" })));
    }
    node.innerHTML = `<table class="wb-table-grid"><tbody>${el.cells.map((row, ri) =>
      `<tr>${row.map((cell, ci) => wbRenderTableCell(el, ri, ci, cell)).join("")}</tr>`
    ).join("")}</tbody></table>`;
    // 绑定 cell drag-and-drop 接收
    node.querySelectorAll("td").forEach((td) => {
      const ri = parseInt(td.dataset.row, 10);
      const ci = parseInt(td.dataset.col, 10);
      wbBindTableCellDrop(td, el.id, ri, ci);
    });
  }

  // 选中 / 拖拽 / resize 把手
  wbWireElementHandlers(node, el);

  // resize 把手(8 角 + 4 边)
  if (el.type !== "table") {
    for (const handle of ["nw","n","ne","e","se","s","sw","w"]) {
      const h = document.createElement("div");
      h.className = `wb-resize wb-resize-${handle}`;
      h.dataset.handle = handle;
      node.appendChild(h);
    }
  }

  layer.appendChild(node);
}

// ---------- table cell helpers ----------

function wbRenderTableCell(el, rowIdx, colIdx, cell) {
  if (cell && cell.type === "note") {
    return `<td data-row="${rowIdx}" data-col="${colIdx}" class="wb-cell wb-cell-note" title="笔记模块 · 双击移除">
      <div class="wb-cell-note-source">📖 ${escapeHtml(cell.chapter || "")}</div>
      <div class="wb-cell-note-text">${escapeHtml(cell.text || "")}</div>
      <div class="wb-cell-clear-hint">× 双击移除</div>
    </td>`;
  }
  const txt = (cell && cell.text) || "";
  return `<td data-row="${rowIdx}" data-col="${colIdx}" contenteditable="true" class="wb-cell">${escapeHtml(txt)}</td>`;
}

function wbBindTableCellDrop(td, tableId, rowIdx, colIdx) {
  td.addEventListener("dragover", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    ev.dataTransfer.dropEffect = "copy";
    td.classList.add("is-drop-target");
  });
  td.addEventListener("dragleave", () => td.classList.remove("is-drop-target"));
  td.addEventListener("drop", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    td.classList.remove("is-drop-target");
    const text = ev.dataTransfer.getData("text/x-note-text");
    const chapter = ev.dataTransfer.getData("text/x-note-chapter");
    if (!text) return;
    wbPutIntoCell(tableId, rowIdx, colIdx, { type: "note", text, chapter });
  });
  td.addEventListener("dblclick", () => {
    const cell = wbGetCell(tableId, rowIdx, colIdx);
    if (cell && cell.type === "note") {
      if (confirm("清除此模块?回到空白文本框。")) {
        wbPutIntoCell(tableId, rowIdx, colIdx, { type: "text", text: "" });
      }
    }
  });
  td.addEventListener("blur", () => {
    if (td.isContentEditable) {
      wbSetCellText(tableId, rowIdx, colIdx, td.innerText);
    }
  });
}

function wbGetCell(tableId, r, c) {
  const tbl = wb.elements.find(e => e.id === tableId);
  if (!tbl || !tbl.cells || !tbl.cells[r]) return null;
  return tbl.cells[r][c] || null;
}

function wbPutIntoCell(tableId, r, c, value) {
  const tbl = wb.elements.find(e => e.id === tableId);
  if (!tbl || !tbl.cells || !tbl.cells[r]) return false;
  tbl.cells[r][c] = value;
  wbPersist();
  wbRender();
  return true;
}

function wbSetCellText(tableId, r, c, text) {
  const cell = wbGetCell(tableId, r, c);
  if (!cell || cell.type !== "text") return;
  cell.text = text.trim();
  wbPersist();
}

function wbWireElementHandlers(node, el) {
  // 单击 → 选中
  node.addEventListener("mousedown", (ev) => {
    // 如果点在 contenteditable / resize handle / delete button 上,交给它自己
    if (ev.target.closest(".wb-resize")) {
      wbStartResize(ev, el.id, ev.target.dataset.handle);
      return;
    }
    if (ev.target.closest("[contenteditable]")) {
      // 点击文本框,只设选中,不进入拖拽
      wbSelect(el.id);
      return;
    }
    if (ev.target.closest(".wb-element-action")) return;

    wbSelect(el.id);
    wbStartDrag(ev, el.id);
  });

  // 双击节点 = 编辑 / 删除工具条
  node.addEventListener("dblclick", (ev) => {
    if (ev.target.closest("[contenteditable]")) return;
    wbShowActions(el);
  });
}

function wbSelect(id) {
  wb.selectedId = id;
  wbRender();
}

function wbStartDrag(ev, id) {
  ev.preventDefault();
  const el = wb.elements.find(e => e.id === id);
  if (!el) return;
  wb.drag = {
    kind: "move",
    id,
    startX: ev.clientX,
    startY: ev.clientY,
    origX: el.x,
    origY: el.y,
  };
  const onMove = (mv) => {
    if (!wb.drag) return;
    const dx = mv.clientX - wb.drag.startX;
    const dy = mv.clientY - wb.drag.startY;
    el.x = Math.max(0, wb.drag.origX + dx);
    el.y = Math.max(0, wb.drag.origY + dy);
    wbRender();
  };
  const onUp = () => {
    if (wb.drag) {
      wbPersist();
      wb.drag = null;
    }
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
  };
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

function wbStartResize(ev, id, handle) {
  ev.preventDefault();
  ev.stopPropagation();
  const el = wb.elements.find(e => e.id === id);
  if (!el) return;
  wb.drag = {
    kind: "resize",
    id,
    handle,
    startX: ev.clientX,
    startY: ev.clientY,
    origX: el.x,
    origY: el.y,
    origW: el.w,
    origH: el.h,
  };
  const onMove = (mv) => {
    if (!wb.drag) return;
    const dx = mv.clientX - wb.drag.startX;
    const dy = mv.clientY - wb.drag.startY;
    let { x, y, w, h } = wb.drag;
    if (handle.includes("e")) w = Math.max(60, wb.drag.origW + dx);
    if (handle.includes("w")) { w = Math.max(60, wb.drag.origW - dx); x = wb.drag.origX + (wb.drag.origW - w); }
    if (handle.includes("s")) h = Math.max(40, wb.drag.origH + dy);
    if (handle.includes("n")) { h = Math.max(40, wb.drag.origH - dy); y = wb.drag.origY + (wb.drag.origH - h); }
    el.x = Math.max(0, x);
    el.y = Math.max(0, y);
    el.w = w;
    el.h = h;
    wbRender();
  };
  const onUp = () => {
    if (wb.drag) {
      wbPersist();
      wb.drag = null;
    }
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
  };
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

function wbShowActions(el) {
  const node = wb.stage.querySelector(`[data-id="${el.id}"]`);
  if (!node) return;
  node.querySelector(".wb-element-actions")?.remove();
  const actions = document.createElement("div");
  actions.className = "wb-element-actions wb-element-action";
  Object.assign(actions.style, {
    position: "absolute",
    top: "-30px",
    right: "0",
    display: "flex",
    gap: "4px",
    zIndex: "10",
  });
  actions.innerHTML = `
    <button type="button" data-act="connect" title="从此节点拉一条连线">🔗</button>
    <button type="button" data-act="delete" title="删除节点">✕</button>
  `;
  actions.addEventListener("mousedown", (ev) => ev.stopPropagation());
  actions.addEventListener("click", (ev) => {
    const act = ev.target.closest("button")?.dataset.act;
    if (act === "delete") {
      if (confirm(`删除「${el.content?.slice(0, 20) || el.type}」?`)) wbRemove(el.id);
    } else if (act === "connect") {
      wb.connect = { fromId: el.id };
      wb.stage.style.cursor = "crosshair";
      wb.stage.querySelectorAll(".wb-element").forEach(n => n.classList.add("is-connecting"));
      ev.target.closest("button").textContent = "✓ 点目标节点";
    }
  });
  node.appendChild(actions);
}

function wbRemove(id) {
  wb.elements = wb.elements.filter(e => e.id !== id);
  wb.lines = wb.lines.filter(l => l.fromId !== id && l.toId !== id);
  if (wb.selectedId === id) wb.selectedId = null;
  wbPersist();
  wbRender();
}

function wbCreateText(x, y) {
  const el = { id: uid(), type: "text", x, y, w: 180, h: 60, content: "新建想法" };
  wb.elements.push(el);
  wbPersist();
  wbRender();
  return el.id;
}

function wbCreateNote(x, y, content, chapter) {
  const el = { id: uid(), type: "note", x, y, w: 240, h: 80, content, chapter: chapter || "" };
  wb.elements.push(el);
  wbPersist();
  wbRender();
  return el.id;
}

function wbCreateTable(x, y, rows = 3, cols = 3) {
  const el = {
    id: uid(),
    type: "table",
    x, y,
    w: Math.max(220, cols * 80),
    h: Math.max(80, rows * 32),
    rows, cols,
    cells: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ type: "text", text: "" }))),
  };
  wb.elements.push(el);
  wbPersist();
  wbRender();
  return el.id;
}

function wbBindStage() {
  wb.stage.addEventListener("click", (ev) => {
    if (wb.connect) {
      const node = ev.target.closest(".wb-element");
      if (node && node.dataset.id !== wb.connect.fromId) {
        const choice = prompt("连线类型:输入 1 = 单向(→),2 = 双向(↔),直接回车 = 单向", "1");
        const isBi = choice === "2";
        wb.lines.push({
          id: uid("ln"),
          fromId: wb.connect.fromId,
          toId: node.dataset.id,
          label: "",
          bidirectional: isBi,
        });
        wb.connect = null;
        wb.stage.style.cursor = "";
        wb.stage.querySelectorAll(".wb-element").forEach(n => n.classList.remove("is-connecting"));
        wbPersist();
        wbRender();
      }
      return;
    }
    if (!ev.target.closest(".wb-element")) {
      wb.selectedId = null;
      wbRender();
    }
  });

  // 键盘 Delete / Backspace 删除选中
  wb.stage.tabIndex = 0;
  wb.stage.addEventListener("keydown", (ev) => {
    if ((ev.key === "Delete" || ev.key === "Backspace") && wb.selectedId) {
      if (ev.target.closest("[contenteditable]")) return;
      ev.preventDefault();
      wbRemove(wb.selectedId);
    }
  });
}

function wbInit(stageEl, slug, opts = {}) {
  wb.stage = stageEl;
  wb.slug = slug;
  wb.elements = [];
  wb.lines = [];
  wb.selectedId = null;
  wb.connect = null;
  wb.drag = null;
  wb.onChange = opts.onChange || null;
  wbLoad();
  wbBindStage();
  wbRender();
}

function wbClear() {
  if (!confirm("清空白板所有内容?此操作无法撤销。")) return;
  wb.elements = [];
  wb.lines = [];
  wbPersist();
  wbRender();
}

function wbExportJSON() {
  return JSON.stringify({ elements: wb.elements, lines: wb.lines, v: 1 }, null, 2);
}

function wbImportJSON(json) {
  try {
    const data = typeof json === "string" ? JSON.parse(json) : json;
    wb.elements = Array.isArray(data.elements) ? data.elements : [];
    wb.lines = Array.isArray(data.lines) ? data.lines : [];
    wbPersist();
    wbRender();
    return true;
  } catch (_) {
    return false;
  }
}

// ------ 拖笔记卡片入白板(从 app.js 调用) ------

function wbDropNoteFromCard(noteText, noteChapter, clientX, clientY) {
  if (!wb.stage) return null;
  const rect = wb.stage.getBoundingClientRect();
  const x = Math.max(0, clientX - rect.left + wb.stage.scrollLeft - 120);
  const y = Math.max(0, clientY - rect.top + wb.stage.scrollTop - 40);
  return wbCreateNote(x, y, noteText, noteChapter);
}

// ------ utilities ------

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// 暴露到全局(因为 script 不是 module)
window.WB = {
  init: wbInit,
  render: wbRender,
  createText: wbCreateText,
  createNote: wbCreateNote,
  createTable: wbCreateTable,
  remove: wbRemove,
  clear: wbClear,
  exportJSON: wbExportJSON,
  importJSON: wbImportJSON,
  dropNoteFromCard: wbDropNoteFromCard,
  state: wb,
};