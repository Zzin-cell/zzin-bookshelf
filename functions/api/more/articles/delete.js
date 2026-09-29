// functions/api/more/articles/delete.js — POST deletes a single article.
//
// Body: { category, slug, password }
//
// Uses GitHub Contents API DELETE — needs the file's current blob sha.
// Empty category directories are left in place; the next build / commit
// cleans them up naturally.

import {
  getConfig,
  jsonResponse,
  preflight,
  checkPassword,
  isSafePath,
  getFileSha,
  deleteFile,
} from "../../../_shared.js";

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

  const category = (body.category || "").trim();
  const slug = (body.slug || "").trim();
  if (!category || !slug) {
    return jsonResponse(400, { ok: false, error: "category/slug required" });
  }

  const filePath = `${cfg.vaultPath}/${category}/${slug}.md`;
  if (!isSafePath(cfg.vaultPath, filePath)) {
    return jsonResponse(400, { ok: false, error: "invalid path" });
  }

  let sha;
  try {
    sha = await getFileSha(env, filePath);
  } catch (e) {
    return jsonResponse(500, { ok: false, error: e.message });
  }
  if (!sha) {
    return jsonResponse(404, { ok: false, error: `not found: ${filePath}` });
  }

  try {
    await deleteFile(env, filePath, `chore(more): delete ${slug}`, sha);
    return jsonResponse(200, { ok: true, deleted: filePath });
  } catch (e) {
    return jsonResponse(500, { ok: false, error: e.message });
  }
}

export async function onRequestOptions() {
  return preflight();
}