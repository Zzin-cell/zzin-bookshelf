#!/usr/bin/env node
// parse_books.mjs — Node port of parse_books.py.
//
// Reads WeRead (微信读书) Obsidian notes from the vault root and emits
// data/books.json (mirrored to public/data/books.json for CF Pages).
//
// Designed to be byte-compatible with the Python version on real-world
// input — same field set, same chapter ordering, same is_mine heuristic.
// Differences vs Python:
//   - emoji codepoints are inlined as literals in regexes (more readable
//     than \U0001XXXXX escapes)
//   - one-line chapter titles inside `# 高亮划线` get the title from the
//     most recent H2/H3 header, exactly like Python did
//
// Run with: node scripts/parse_books.mjs

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const VAULT_DIR = process.env.OBSIDIAN_VAULT
  ? path.resolve(process.env.OBSIDIAN_VAULT)
  : path.resolve('C:/Users/MR/Documents/Obsidian Vault');
const OUTPUT = path.join(ROOT, 'data', 'books.json');
const PUBLIC_OUTPUT = path.join(ROOT, 'public', 'data', 'books.json');

const H_RE = /^#{2,3}\s+(?<title>.+?)\s*$/;
const HL_START_RE = />\s*[📌🔥]+\s*\[(?<text>[^\]]*)\]\(<?weread:\/\/.*?chapterUid=(?<uid>\d+).*?\)/;
const TS_RE = />\s*⏱\s*(?<ts>\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/;
const COUNT_RE = />\s*[🔥📊]\s*\d+\s*人共读/;

const SKIP_HEADERS = new Set(['读书笔记', '本书评论', '高亮划线']);

function parseFrontmatter(text) {
  const m = /^---\s*\n(.*?)\n---\s*\n/s.exec(text);
  if (!m) return {};
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!line.includes(':')) continue;
    const idx = line.indexOf(':');
    const k = line.slice(0, idx).trim();
    let v = line.slice(idx + 1).trim();
    // Match Python's `v.strip().strip('"')` — only strips a single pair of
    // outer double-quotes; doesn't touch the inside.
    if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
      v = v.slice(1, -1);
    }
    fm[k] = v;
  }
  return fm;
}

function parseMetadata(body) {
  const meta = {};
  const m = /# 元数据\s*\n(.*?)(?=# )/s.exec(body);
  if (!m) return meta;
  const fieldMap = {
    '简介': 'summary',
    '出版时间': 'publishDate',
    'ISBN': 'isbn',
    '字数': 'wordCount',
    '分类': 'category',
    '出版社': 'publisher',
    'PC地址': 'pcUrl',
  };
  for (const rawLine of m[1].split(/\r?\n/)) {
    // Lines are '> - 字段：值'. Strip both the leading '> ' and whitespace.
    let stripped = rawLine.replace(/^>\s*/, '').trimStart();
    for (const [k, v] of Object.entries(fieldMap)) {
      const prefix = `- ${k}：`;
      if (stripped.startsWith(prefix)) {
        const value = stripped.split('：', 2)[1].trim();
        if (value) meta[v] = value;
        break;
      }
    }
  }
  return meta;
}

function parseHighlights(body) {
  const m = /# 高亮划线\s*\n/.exec(body);
  if (!m) return [];
  const start = m.index + m[0].length;
  const lines = body.slice(start).split(/\r?\n/);

  // Pass 1: collect chapter headers (H2/H3).
  const headers = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('# ') && !line.startsWith('## ')) break;
    const h = H_RE.exec(line);
    if (!h) continue;
    const title = h.groups.title.trim();
    if (SKIP_HEADERS.has(title)) continue;
    headers.push([i, title]);
  }

  // Build chapterUid → header title map (most recent header wins for any
  // highlight after it).
  const chapters = new Map(); // uid -> { chapterUid, chapter, notes }
  let curTitle = null;
  let nextIdx = 0;

  function headerForLine(lineIdx) {
    while (nextIdx < headers.length && headers[nextIdx][0] <= lineIdx) {
      curTitle = headers[nextIdx][1];
      nextIdx += 1;
    }
    return curTitle;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('# ') && !line.startsWith('## ')) break;
    const cur = headerForLine(i);
    const startMatch = HL_START_RE.exec(line);
    if (!startMatch) continue;
    const text = startMatch.groups.text.trim();
    const uid = parseInt(startMatch.groups.uid, 10);

    let ts = '';
    let count = 0;
    const upper = Math.min(i + 4, lines.length);
    for (let j = i; j < upper; j++) {
      const tm = TS_RE.exec(lines[j]);
      if (tm) ts = tm.groups.ts.trim();
      const cm = COUNT_RE.exec(lines[j]);
      if (cm) {
        const nMatch = /(\d+)\s*人共读/.exec(lines[j]);
        if (nMatch) count = parseInt(nMatch[1], 10);
      }
    }

    if (!chapters.has(uid)) {
      chapters.set(uid, {
        chapterUid: uid,
        chapter: cur || `章节 ${chapters.size + 1}`,
        notes: [],
      });
    } else {
      const ch = chapters.get(uid);
      if (cur && ch.chapter.startsWith('章节')) {
        ch.chapter = cur;
      }
    }
    chapters.get(uid).notes.push({
      text,
      ts,
      count,
      is_mine: Boolean(ts), // user note if has timestamp; else crowd-highlight
    });
  }

  const ordered = [...chapters.values()].sort((a, b) => a.chapterUid - b.chapterUid);
  ordered.forEach((c, idx) => {
    c.index = idx;
    c.noteCount = c.notes.length;
  });
  return ordered;
}

async function parseOne(mdPath) {
  const text = await fs.readFile(mdPath, 'utf8');
  const fm = parseFrontmatter(text);
  if (fm.doc_type !== 'weread-highlights-reviews') return null;

  // body = everything after the second "---" line
  const parts = text.split('---');
  const body = parts.length >= 3 ? parts.slice(2).join('---') : '';

  const meta = parseMetadata(body);
  const chapters = parseHighlights(body);

  return {
    id: fm.bookId || path.basename(mdPath, '.md'),
    slug: path.basename(mdPath, '.md'),
    title: fm.title || '',
    author: fm.author || '',
    cover: fm.cover || '',
    isbn: fm.isbn || '',
    category: meta.category || '',
    publisher: meta.publisher || '',
    publishDate: meta.publishDate || '',
    pcUrl: meta.pcUrl || '',
    summary: meta.summary || '',
    wordCount: meta.wordCount || '',
    noteCount: parseInt(fm.noteCount || 0, 10) || 0,
    reviewCount: parseInt(fm.reviewCount || 0, 10) || 0,
    progress: fm.progress || '',
    readingTime: fm.readingTime || '',
    readingDate: fm.readingDate || '',
    lastReadDate: fm.lastReadDate || '',
    readingStatus: fm.readingStatus || '',
    chapters,
  };
}

async function main() {
  const entries = await fs.readdir(VAULT_DIR, { withFileTypes: true });
  const mdFiles = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.md'))
    .map((e) => path.join(VAULT_DIR, e.name))
    .sort();
  const books = [];
  for (const p of mdFiles) {
    try {
      const b = await parseOne(p);
      if (b) books.push(b);
    } catch (e) {
      console.error(`[err] ${path.basename(p)}: ${e.message}`);
    }
  }
  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, JSON.stringify(books, null, 2), 'utf8');
  await fs.mkdir(path.dirname(PUBLIC_OUTPUT), { recursive: true });
  await fs.writeFile(PUBLIC_OUTPUT, JSON.stringify(books, null, 2), 'utf8');

  const chapterTotal = books.reduce((s, b) => s + b.chapters.length, 0);
  const notesInFiles = books.reduce((s, b) => s + b.noteCount, 0);
  const notesParsed = books.reduce(
    (s, b) => s + b.chapters.reduce((c, ch) => c + ch.noteCount, 0),
    0
  );
  console.log(`books=${books.length}  chapters=${chapterTotal}  notes_in_files=${notesInFiles}  notes_parsed=${notesParsed}`);
  for (const b of books) {
    const chs = b.chapters.slice(0, 5).map((c) => c.chapter.slice(0, 18)).join(', ');
    console.log(`  ${b.slug.slice(0, 30).padEnd(30)}  ch=${String(b.chapters.length).padStart(3)}  notes=${String(b.noteCount).padStart(4)}  | ${chs}`);
  }
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().then((code) => process.exit(code)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { parseFrontmatter, parseMetadata, parseHighlights, parseOne };