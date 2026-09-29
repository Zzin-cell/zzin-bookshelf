#!/usr/bin/env node
// parse_more.mjs — Node port of parse_more.py.
//
// Reads Obsidian vault at C:/Users/MR/Documents/Obsidian Vault/more/
// and emits data/more.json (and public/data/more.json). Mirrors every
// non-.md asset into public/data/more/ so relative image refs in
// obsidian notes resolve under CF Pages / mcode / etc.
//
// This is the build-time counterpart of the previous Python script —
// CF Pages runs `npm run build` which executes this via Node (Cloudflare
// Pages does not include a Python runtime). The Python version is
// kept under scripts/parse_more.py as a reference; once Node output
// is verified equivalent, the Python one can be retired.

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import matter from 'gray-matter';
import { marked } from 'marked';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const VAULT_MORE = path.resolve(
  process.env.OBSIDIAN_VAULT || 'C:/Users/MR/Documents/Obsidian Vault',
  'more'
);
const DATA_JSON = path.join(ROOT, 'data', 'more.json');
const PUBLIC_JSON = path.join(ROOT, 'public', 'data', 'more.json');

const SLUG_RE = /[\\\/:*?"<>|]+/g;

// python-markdown's toc extension generates an id for every heading by
// slugifying its text. The empty-string fallback is "_<index>" (see
// `header_id_func` defaults). Replicate that behavior here so we stay
// byte-comparable with the Python build artifact for the simple cases
// the existing frontend cares about.
function slugifyHeading(text, idx) {
  const stripped = text.replace(/[`*_~\[\]]/g, '').trim();
  const s = stripped
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fff-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return s || `_${idx}`;
}

function configureMarked() {
  // python-markdown's `toc` extension adds `id="..."` to every heading;
  // marked has no built-in equivalent so we attach a small renderer.
  // marked v18's heading() receives a token object ({tokens, depth}) —
  // not the (text, level, raw) signature from older versions.
  const renderer = new marked.Renderer();
  let idx = 0;
  renderer.heading = function ({ tokens, depth }) {
    // Reconstruct the raw heading text from the inline tokens so we can
    // match python-markdown's slugification.
    const raw = tokens
      .map((t) => (t.text != null ? t.text : t.raw || ''))
      .join('');
    const id = slugifyHeading(raw, idx);
    idx += 1;
    const inner = this.parser.parseInline(tokens);
    return `<h${depth} id="${id}">${inner}</h${depth}>\n`;
  };
  marked.setOptions({
    gfm: true,
    breaks: false,
    renderer,
  });
  // Reset module-level state so consecutive runs (e.g. tests) start clean.
  marked.use({ renderer });
}

function parseFrontmatter(text) {
  // YAML-ish: only supports `key: value` per line, comments with #.
  // gray-matter handles full YAML so the result is a superset; we still
  // coerce string values the same way the Python script did.
  const parsed = matter(text);
  const fm = parsed.data || {};
  // Normalize date-ish fields to plain strings like the Python version
  // (which used .partition(":") and stripped quotes).
  const out = {};
  for (const [k, v] of Object.entries(fm)) {
    if (v instanceof Date) {
      // YYYY-MM-DD
      const y = v.getUTCFullYear();
      const m = String(v.getUTCMonth() + 1).padStart(2, '0');
      const d = String(v.getUTCDate()).padStart(2, '0');
      out[k] = `${y}-${m}-${d}`;
    } else if (typeof v === 'string') {
      out[k] = v.trim().replace(/^["']|["']$/g, '');
    } else if (Array.isArray(v)) {
      out[k] = v;
    } else if (v == null) {
      out[k] = '';
    } else {
      out[k] = String(v);
    }
  }
  return [out, parsed.content];
}

export function slugify(s) {
  return (
    s
      .trim()
      .replace(SLUG_RE, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'untitled'
  );
}

function mdToHtml(body) {
  return marked.parse(body);
}

const IMG_SRC_RE = /(<img\b[^>]*?\bsrc=")([^"]+)("[^>]*>)/gi;

export function rewriteImageSrcs(html, categoryKey) {
  return html.replace(IMG_SRC_RE, (full, prefix, src, suffix) => {
    if (/^(https?:|\/\/|data:)/i.test(src)) return full;
    if (src.startsWith('/')) return full;
    let cleaned = src;
    if (cleaned.startsWith('./')) cleaned = cleaned.slice(2);
    return `${prefix}/data/more/${categoryKey}/${cleaned}${suffix}`;
  });
}

function extractDescription(body, maxLen = 120) {
  for (const raw of body.split(/\r?\n/)) {
    let s = raw.trim();
    if (!s || s.startsWith('#') || s.startsWith('```')) continue;
    s = s.replace(/\*\*(.+?)\*\*/g, '$1');
    s = s.replace(/\*(.+?)\*/g, '$1');
    s = s.replace(/`([^`]+)`/g, '$1');
    s = s.replace(/\[(.+?)\]\(.+?\)/g, '$1');
    if (s.length > maxLen) s = s.slice(0, maxLen - 1) + '…';
    return s;
  }
  return '';
}

function fmtEmoji(name) {
  const keywords = [
    ['极客', '📺'], ['课程', '📺'], ['技术', '🛠'],
    ['感悟', '💭'], ['思考', '💭'], ['动手', '✍️'], ['实操', '✍️'],
    ['读书', '📚'], ['笔记', '📝'], ['项目', '🧪'], ['demo', '🧪'],
    ['经验', '🧠'], ['总结', '🧠'], ['复盘', '🔁'],
    ['review', '📖'], ['geo', '🌍'],
  ];
  for (const [k, v] of keywords) {
    if (name.includes(k)) return v;
  }
  return '📄';
}

async function exists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  configureMarked();

  if (!(await exists(VAULT_MORE))) {
    await fs.mkdir(path.dirname(DATA_JSON), { recursive: true });
    await fs.writeFile(DATA_JSON, '[]', 'utf8');
    await fs.mkdir(path.dirname(PUBLIC_JSON), { recursive: true });
    await fs.writeFile(PUBLIC_JSON, '[]', 'utf8');
    console.log(`[parse_more] ${VAULT_MORE} missing → empty placeholder written`);
    return 0;
  }

  const out = [];
  const catDirs = (await fs.readdir(VAULT_MORE, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  for (const catLabel of catDirs) {
    const catDir = path.join(VAULT_MORE, catLabel);
    const categoryKey = slugify(catLabel);
    const articles = [];
    const mdFiles = (await fs.readdir(catDir, { withFileTypes: true }))
      .filter((d) => d.isFile() && d.name.toLowerCase().endsWith('.md'))
      .map((d) => d.name)
      .sort();
    for (const fname of mdFiles) {
      const mdPath = path.join(catDir, fname);
      const text = await fs.readFile(mdPath, 'utf8');
      const [fm, body] = parseFrontmatter(text);
      const stem = fname.replace(/\.md$/i, '');
      const title = fm.title || fm['标题'] || stem;
      const summary =
        fm.summary || fm['简介'] || fm.description || extractDescription(body);
      const updatedAt = fm.updated || fm.date || fm.updatedAt || '';
      const tagStr = (fm.tags || fm.tag || '').trim();
      const tags = tagStr
        ? tagStr
            .split(/[,，]\s*/)
            .map((t) => t.trim())
            .filter(Boolean)
        : [];
      const stat = await fs.stat(mdPath);
      let htmlBody = mdToHtml(body);
      htmlBody = rewriteImageSrcs(htmlBody, categoryKey);
      articles.push({
        slug: slugify(stem),
        title,
        summary,
        tags,
        updatedAt,
        mtime: Math.floor(stat.mtimeMs / 1000),
        sizeBytes: stat.size,
        html: htmlBody,
        srcPath: path
          .relative(path.resolve(VAULT_MORE, '..', '..'), mdPath)
          .replace(/\//g, path.sep),
      });
    }
    out.push({
      category: catLabel,
      categoryKey,
      categoryEmoji: fmtEmoji(catLabel),
      articles,
    });
  }

  await fs.mkdir(path.dirname(DATA_JSON), { recursive: true });
  await fs.writeFile(DATA_JSON, JSON.stringify(out, null, 2), 'utf8');
  await fs.mkdir(path.dirname(PUBLIC_JSON), { recursive: true });
  await fs.writeFile(PUBLIC_JSON, JSON.stringify(out, null, 2), 'utf8');
  const sizeKb = Math.floor((await fs.stat(PUBLIC_JSON)).size / 1024);
  const nArts = out.reduce((s, c) => s + c.articles.length, 0);
  console.log(`[parse_more] ${out.length} categories · ${nArts} articles → ${path.relative(ROOT, PUBLIC_JSON)} (${sizeKb} KB)`);

  // Mirror non-.md assets.
  const assetsRoot = path.join(path.dirname(PUBLIC_JSON), 'more');
  let copied = 0;
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(p);
        continue;
      }
      if (!e.isFile()) continue;
      if (path.extname(e.name).toLowerCase() === '.md') continue;
      const rel = path.relative(VAULT_MORE, p);
      const dst = path.join(assetsRoot, rel);
      await fs.mkdir(path.dirname(dst), { recursive: true });
      const srcStat = await fs.stat(p);
      let needsCopy = true;
      try {
        const dstStat = await fs.stat(dst);
        if (dstStat.mtimeMs >= srcStat.mtimeMs) needsCopy = false;
      } catch { /* missing → copy */ }
      if (needsCopy) {
        await fs.copyFile(p, dst);
        copied += 1;
      }
    }
  }
  await walk(VAULT_MORE);
  if (copied) console.log(`[parse_more] mirrored ${copied} asset file(s) → ${path.relative(ROOT, assetsRoot)}/`);
  return 0;
}

// Re-exports for potential unit tests / external use.
export {
  parseFrontmatter,
  mdToHtml,
  extractDescription,
  fmtEmoji,
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().then((code) => process.exit(code)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}