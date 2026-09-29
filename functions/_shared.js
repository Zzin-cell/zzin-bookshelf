// functions/_shared.js — Helpers shared by all /api/more/* endpoints.
//
// All write endpoints follow the same pattern:
//   1. Parse JSON body
//   2. Verify the caller-supplied SITE_PASSWORD
//   3. Validate paths so a buggy / malicious caller can't escape the vault
//   4. Hit GitHub Contents API to commit / delete files under vault/more/

const DEFAULT_PASSWORD = "zzin0715";
const DEFAULT_REPO = "Zzin-cell/zzin-bookshelf";
const DEFAULT_BRANCH = "main";
const DEFAULT_VAULT_PATH = "vault/more";

export function getConfig(env) {
  return {
    password: env.SITE_PASSWORD || DEFAULT_PASSWORD,
    githubToken: env.GITHUB_TOKEN || "",
    repo: env.GITHUB_REPO || DEFAULT_REPO,
    branch: env.GITHUB_BRANCH || DEFAULT_BRANCH,
    vaultPath: (env.VAULT_PATH || DEFAULT_VAULT_PATH).replace(/\/+$/, ""),
  };
}

export function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}

export function preflight() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export function checkPassword(provided, expected) {
  return (provided || "").trim() === expected;
}

export function slugify(s) {
  return (
    s
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "untitled"
  );
}

// True iff `filePath` (with / separator) is exactly `vaultPath` or sits
// inside it — i.e. the path can never reach a parent directory.
export function isSafePath(vaultPath, filePath) {
  const root = vaultPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const target = filePath.replace(/\\/g, "/");
  return target === root || target.startsWith(root + "/");
}

export async function githubFetch(env, method, path, body) {
  const cfg = getConfig(env);
  const url = `https://api.github.com${path}`;
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    Authorization: `Bearer ${cfg.githubToken}`,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return res;
}

export async function getFileSha(env, repoPath) {
  const cleanPath = repoPath.replace(/^\/+/, "");
  const cfg = getConfig(env);
  const path = `/repos/${cfg.repo}/contents/${encodeURI(cleanPath)}?ref=${encodeURIComponent(cfg.branch)}`;
  const res = await githubFetch(env, "GET", path);
  if (res.status === 404) return null;
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`github GET ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = await res.json();
  return json.sha || null;
}

export async function putFile(env, repoPath, contentBase64, message, sha) {
  const cfg = getConfig(env);
  const cleanPath = repoPath.replace(/^\/+/, "");
  const path = `/repos/${cfg.repo}/contents/${encodeURI(cleanPath)}`;
  const body = { message, content: contentBase64, branch: cfg.branch };
  if (sha) body.sha = sha;
  const res = await githubFetch(env, "PUT", path, body);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`github PUT ${res.status}: ${t.slice(0, 200)}`);
  }
  return await res.json();
}

export async function deleteFile(env, repoPath, message, sha) {
  const cfg = getConfig(env);
  const cleanPath = repoPath.replace(/^\/+/, "");
  const path = `/repos/${cfg.repo}/contents/${encodeURI(cleanPath)}`;
  const body = { message, sha, branch: cfg.branch };
  const res = await githubFetch(env, "DELETE", path, body);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`github DELETE ${res.status}: ${t.slice(0, 200)}`);
  }
  return await res.json();
}

// HTML-entity-encode `<`, `>`, `&` so user text is safe to drop into a
// frontmatter block.
function xmlEscape(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildArticleContent({ title, date, tags, body }) {
  const safeTitle = xmlEscape(title);
  const fm = ["---", `title: ${safeTitle}`, `date: ${date}`];
  if (tags && tags.length) {
    fm.push(`tags: ${tags.map((t) => xmlEscape(String(t).trim())).filter(Boolean).join(", ")}`);
  }
  fm.push("---", "");
  return fm.join("\n") + "\n" + body.replace(/\r\n/g, "\n").replace(/\n+$/, "") + "\n";
}

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}