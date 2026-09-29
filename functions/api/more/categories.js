// functions/api/more/categories.js — POST creates an empty category dir.
//
// Body: { name, password }
//
// Categories in Obsidian are just directories holding notes. We commit a
// placeholder `.gitkeep` so Git actually creates the directory on the
// remote. The frontend doesn't need a real note inside for the category
// to render in the "更多" page — the build pipeline picks up the dir as
// soon as the user adds their first article.

import {
  getConfig,
  jsonResponse,
  preflight,
  checkPassword,
  slugify,
  isSafePath,
  getFileSha,
  putFile,
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

  const name = (body.name || "").trim();
  if (!name) {
    return jsonResponse(400, { ok: false, error: "name is required" });
  }

  const catSlug = slugify(name);
  const filePath = `${cfg.vaultPath}/${catSlug}/.gitkeep`;
  if (!isSafePath(cfg.vaultPath, filePath)) {
    return jsonResponse(400, { ok: false, error: "invalid path" });
  }

  let sha = null;
  try {
    sha = await getFileSha(env, filePath);
  } catch (e) {
    return jsonResponse(500, { ok: false, error: e.message });
  }

  const content = "# placeholder so git tracks this empty directory\n";
  const contentBase64 = btoa(unescape(encodeURIComponent(content)));
  const message = sha
    ? `chore(more): touch category ${catSlug}`
    : `feat(more): create category ${catSlug}`;

  try {
    await putFile(env, filePath, contentBase64, message, sha);
    return jsonResponse(200, { ok: true, category: catSlug });
  } catch (e) {
    return jsonResponse(500, { ok: false, error: e.message });
  }
}

export async function onRequestOptions() {
  return preflight();
}