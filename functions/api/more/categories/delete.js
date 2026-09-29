// functions/api/more/categories/delete.js — POST deletes an entire
// category (every note under it).
//
// Body: { name, password }
//
// GitHub's Contents API only deletes one file at a time, so we list every
// .md (and the .gitkeep) under <vaultPath>/<name>/ and issue a DELETE for
// each. Each delete is its own commit so individual failures don't take
// the whole category down.

import {
  getConfig,
  jsonResponse,
  preflight,
  checkPassword,
  slugify,
  isSafePath,
  githubFetch,
  deleteFile,
} from "../../../_shared.js";

async function listCategoryFiles(env, dirPath) {
  const cfg = getConfig(env);
  const path = `/repos/${cfg.repo}/contents/${encodeURI(dirPath)}?ref=${encodeURIComponent(cfg.branch)}`;
  const res = await githubFetch(env, "GET", path);
  if (res.status === 404) return [];
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`github GET ${res.status}: ${t.slice(0, 200)}`);
  }
  const arr = await res.json();
  if (!Array.isArray(arr)) return [arr];
  return arr;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const cfg = getConfig(env);
  if (!cfg.githubToken) {
    return jsonResponse(500, { ok: false, error: "GITHUB_TOKEN not configured on server" });
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return jsonResponse(400, { ok: false, error: "invalid JSON body" });
  }
  if (!checkPassword(body.password, cfg.password)) {
    return jsonResponse(401, { ok: false, error: "密码错误" });
  }

  const name = (body.name || "").trim();
  if (!name) {
    return jsonResponse(400, { ok: false, error: "name is required" });
  }

  const catSlug = slugify(name);
  const dirPath = `${cfg.vaultPath}/${catSlug}`;
  if (!isSafePath(cfg.vaultPath, dirPath)) {
    return jsonResponse(400, { ok: false, error: "invalid path" });
  }

  let files;
  try {
    files = await listCategoryFiles(env, dirPath);
  } catch (e) {
    return jsonResponse(500, { ok: false, error: e.message });
  }
  if (files.length === 0) {
    return jsonResponse(404, { ok: false, error: `分类不存在: ${dirPath}` });
  }

  const results = [];
  for (const f of files) {
    if (f.type !== "file") continue; // skip subdirs for now (defensive)
    try {
      await deleteFile(env, f.path, `chore(more): delete ${catSlug}/${f.name}`, f.sha);
      results.push({ path: f.path, ok: true });
    } catch (e) {
      results.push({ path: f.path, ok: false, error: e.message });
    }
  }
  const allOk = results.every((r) => r.ok);
  return jsonResponse(allOk ? 200 : 207, {
    ok: allOk,
    deleted: dirPath,
    files: results,
  });
}

export async function onRequestOptions() {
  return preflight();
}