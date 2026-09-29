// functions/api/more/articles.js — POST creates / overwrites a note.
//
// Body: { category, title, body, tags?, password }
//
// Commits the file to <vaultPath>/<category>/<slug>.md on the configured
// branch via the GitHub Contents API. The CF Pages build re-runs on the
// resulting commit so the new article appears within ~30 seconds.

import {
  getConfig,
  jsonResponse,
  preflight,
  checkPassword,
  slugify,
  isSafePath,
  getFileSha,
  putFile,
  buildArticleContent,
  todayIsoDate,
} from "../../_shared.js";

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
  const title = (body.title || "").trim();
  const text = (body.body || "").toString();
  const tags = Array.isArray(body.tags)
    ? body.tags
    : body.tags
    ? [body.tags]
    : [];

  if (!category || !title || !text.trim()) {
    return jsonResponse(400, { ok: false, error: "category/title/body 不能为空" });
  }

  const catSlug = slugify(category);
  const articleSlug = slugify(title);
  const filePath = `${cfg.vaultPath}/${catSlug}/${articleSlug}.md`;
  if (!isSafePath(cfg.vaultPath, filePath)) {
    return jsonResponse(400, { ok: false, error: "invalid path" });
  }

  let sha = null;
  try {
    sha = await getFileSha(env, filePath);
  } catch (e) {
    return jsonResponse(500, { ok: false, error: e.message });
  }

  const content = buildArticleContent({
    title,
    date: todayIsoDate(),
    tags,
    body: text,
  });
  // btoa needs a binary string; encode utf-8 first.
  const contentBase64 = btoa(unescape(encodeURIComponent(content)));

  const message = sha
    ? `feat(more): update ${articleSlug}`
    : `feat(more): create ${articleSlug}`;

  try {
    await putFile(env, filePath, contentBase64, message, sha);
    return jsonResponse(200, {
      ok: true,
      path: filePath,
      category: catSlug,
      slug: articleSlug,
      updated: sha ? "updated" : "created",
    });
  } catch (e) {
    return jsonResponse(500, { ok: false, error: e.message });
  }
}

export async function onRequestOptions() {
  return preflight();
}