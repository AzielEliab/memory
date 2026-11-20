/**
 * memory download landing.
 * Author: Aziel Eliab only. Apache-2.0. Forks always allowed.
 * Version 0.1.0 matches package.json. No invented release.
 */

export const VERSION = "0.1.0";
export const AUTHOR = "Aziel Eliab";
export const PRODUCT = "memory";
export const HOST = "https://memory-download-tracker.vibelock.workers.dev";
export const GITHUB_REPO = "https://github.com/AzielEliab/memory";
export const DEFAULT_ASSET = "memory-0.1.0.tar.gz";
export const DESCRIPTION =
  "AKM-TRIAD-1.0 append-only ChainLock learn ledger with a derived Belief List and 3-of-4 triad scoring. Posterior is calibrated belief.";

export const THEME = {
  dark: {
    bg: "#12110e",
    ink: "#f6f1e7",
    muted: "#d4cbbd",
    line: "#3c362c",
    card: "#1c1a16",
    btnBg: "#f6f1e7",
    btnInk: "#1a1408",
    focus: "#ffe08a",
  },
  light: {
    bg: "#f7f4ee",
    ink: "#1c1914",
    muted: "#3f382e",
    line: "#d5ccbf",
    card: "#fffdf8",
    btnBg: "#1c1914",
    btnInk: "#f7f4ee",
    focus: "#5c4510",
  },
};

const LICENSE = "https://www.apache.org/licenses/LICENSE-2.0";
const CATALOG = "https://aziel-runtime.vibelock.workers.dev/";
const HOW_TO_CITE =
  "Eliab, Aziel. (2026). memory 0.1.0 (AKM-TRIAD-1.0) [Software]. Apache-2.0. https://github.com/AzielEliab/memory";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, MCP-Protocol-Version, mcp-session-id, User-Agent, Authorization",
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function css() {
  const d = THEME.dark;
  const l = THEME.light;
  return `
    :root { color-scheme: dark light; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: ${d.bg}; color: ${d.ink}; }
    a { color: inherit; }
    .wrap { max-width: 44rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
    h1 { font-size: 2.4rem; margin: 0 0 0.5rem; }
    .lede { color: ${d.muted}; font-size: 1.1rem; line-height: 1.45; }
    .dl { display: inline-block; margin: 1rem 0; padding: 0.75rem 1.2rem; background: ${d.btnBg}; color: ${d.btnInk}; text-decoration: none; border-radius: 0.4rem; font-weight: 700; }
    .section { margin-top: 2rem; padding: 1rem 1.1rem; background: ${d.card}; border: 1px solid ${d.line}; border-radius: 0.6rem; }
    .quiet, .os { color: ${d.muted}; }
    .skip { position: absolute; left: -999px; }
    .skip:focus { left: 1rem; top: 1rem; background: ${d.btnBg}; color: ${d.btnInk}; padding: 0.4rem 0.6rem; }
    a:focus-visible, .dl:focus-visible { outline: 3px solid ${d.focus}; outline-offset: 3px; }
    pre { overflow: auto; padding: 0.8rem; background: ${d.bg}; border-radius: 0.4rem; }
    @media (prefers-color-scheme: light) {
      body { background: ${l.bg}; color: ${l.ink}; }
      .lede, .quiet, .os { color: ${l.muted}; }
      .dl { background: ${l.btnBg}; color: ${l.btnInk}; }
      .section { background: ${l.card}; border-color: ${l.line}; }
      pre { background: ${l.bg}; }
      a:focus-visible, .dl:focus-visible { outline-color: ${l.focus}; }
    }
  `;
}

export function citePayload() {
  return {
    author: AUTHOR,
    title: "memory",
    spec: "AKM-TRIAD-1.0",
    version: VERSION,
    homepage: HOST + "/",
    github: GITHUB_REPO,
    download: HOST + "/download",
    stats: HOST + "/stats",
    install: HOST + "/install.sh",
    openapi: HOST + "/openapi.json",
    skill: HOST + "/v1/skill",
    mcp: HOST + "/mcp",
    catalog: CATALOG,
    license: "Apache-2.0",
    license_url: LICENSE,
    forks: "always allowed",
    one_line: DESCRIPTION,
    asset: DEFAULT_ASSET,
    how_to_cite: HOW_TO_CITE,
    zenodo_status: "no_doi_invented",
    belief_is_not_truth: true,
    note: "Version 0.1.0 is package.json. The archive is built from this repository. GitHub Releases has no asset. Identity is Aziel Eliab only. Forks are always allowed. Posterior is calibrated belief, not truth.",
  };
}

function sitemapXml() {
  const paths = ["/", "/download", "/stats", "/install.sh", "/v1/skill", "/v1/health", "/openapi.json", "/mcp", "/cite.json", "/llms.txt"];
  const urls = paths.map((p) => `  <url><loc>${HOST}${p === "/" ? "/" : p}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
  <url><loc>${GITHUB_REPO}</loc></url>
</urlset>
`;
}

function robotsTxt() {
  return `User-agent: *
Allow: /

Sitemap: ${HOST}/sitemap.xml
`;
}

function llmsTxt() {
  return `# memory

Author: Aziel Eliab
Spec: AKM-TRIAD-1.0
One-line: ${DESCRIPTION}
Version: ${VERSION}
GitHub: ${GITHUB_REPO}
Homepage: ${HOST}/
Download: ${HOST}/download
Stats: ${HOST}/stats
Asset: ${DEFAULT_ASSET} (source archive from this repository; package.json ${VERSION})
Install: ${HOST}/install.sh
OpenAPI: ${HOST}/openapi.json
Skill: ${HOST}/v1/skill
MCP: ${HOST}/mcp
Catalog: ${CATALOG}
Cite: ${HOST}/cite.json
Local: node src/cli.js serve then http://127.0.0.1:8788
Counts: project|owner|repo|branch|fork. /v1 and /mcp do not increment.
Posterior: calibrated belief, not truth.
Ledger: append-only. Rewrite and delete stay refused.
Identity: Aziel Eliab only
License: Apache-2.0
Forks: always allowed
DOI: none invented.
`;
}

export function handleSeoRoutes(request, url) {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const headers = { ...corsHeaders(), "Cache-Control": "private, no-store" };
  if (url.pathname === "/cite.json") {
    return new Response(JSON.stringify(citePayload(), null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
    });
  }
  if (url.pathname === "/sitemap.xml") {
    return new Response(sitemapXml(), {
      status: 200,
      headers: { "Content-Type": "application/xml; charset=utf-8", ...headers },
    });
  }
  if (url.pathname === "/robots.txt") {
    return new Response(robotsTxt(), {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8", ...headers },
    });
  }
  if (url.pathname === "/llms.txt" || url.pathname === "/ai.txt") {
    return new Response(llmsTxt(), {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8", ...headers },
    });
  }
  return null;
}

function breakdownList(stats) {
  const rows = stats.breakdown || [];
  if (!rows.length) return "<li>No downloads yet.</li>";
  return rows
    .map((b) => `<li><code>${escapeHtml(b.owner)}/${escapeHtml(b.repo)}</code> branch <code>${escapeHtml(b.branch)}</code> fork=${escapeHtml(b.fork)} → ${escapeHtml(b.count)}</li>`)
    .join("");
}

export function renderHome(stats) {
  const downloads = Number(stats.downloads != null ? stats.downloads : stats.total) || 0;
  const views = Number(stats.views) || 0;
  const n = downloads.toLocaleString("en-US");
  const downloadWord = downloads === 1 ? "download" : "downloads";
  const gh = stats.github || {};
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>memory</title>
<meta name="description" content="${escapeHtml(DESCRIPTION)}">
<meta name="author" content="${AUTHOR}">
<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="${THEME.dark.bg}" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="${THEME.light.bg}" media="(prefers-color-scheme: light)">
<link rel="canonical" href="${HOST}/">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>${css()}</style>
</head>
<body>
  <a class="skip" href="#download">Skip to download</a>
  <div class="wrap">
    <header class="hero">
      <h1>memory</h1>
      <p class="lede">${escapeHtml(DESCRIPTION)}</p>
      <a class="dl" id="download" href="/download">Download</a>
      <p class="os" id="os-line">Node.js 20 or newer. One source archive, version ${VERSION}.</p>
    </header>
    <main>
      <section class="section" aria-labelledby="features-heading">
        <h2 id="features-heading">Features</h2>
        <ul class="features">
          <li>
            <h3>Append-only learn ledger</h3>
            <p>ChainLock stamps are hash-linked. Verify fails closed when the chain breaks. Rewrite and delete stay refused.</p>
          </li>
          <li>
            <h3>Derived Belief List</h3>
            <p><code>rebuild-index</code> reconstructs every node from the learn ledger. The index is a cache.</p>
          </li>
          <li>
            <h3>3-of-4 triad</h3>
            <p>Suitability selects three of E, C, P, and B. Fewer than three adequate channels returns TRIAD_INCOMPLETE.</p>
          </li>
          <li>
            <h3>Posterior is belief</h3>
            <p>The Beta-Bernoulli posterior is calibrated belief. It does not authorize an action and it is not truth.</p>
          </li>
        </ul>
      </section>
      <section class="section" aria-labelledby="count-heading">
        <h2 id="count-heading">Counted downloads</h2>
        <p class="countline">${escapeHtml(n)} ${downloadWord} on this Worker, summed across branches and forks. Views ${escapeHtml(views)}.</p>
        <p class="quiet">Archive ${escapeHtml(DEFAULT_ASSET)}. Version ${VERSION} is the version in package.json. Stars ${escapeHtml(gh.stars || 0)} · forks ${escapeHtml(gh.forks || 0)}.</p>
        <pre id="install-cmd">curl -fsSL -A 'Mozilla/5.0' ${HOST}/install.sh | bash</pre>
        <details>
          <summary>Per owner, repo, branch, and fork</summary>
          <ul>${breakdownList(stats)}</ul>
        </details>
      </section>
    </main>
    <footer>
      <p>Apache-2.0 · forks always allowed · ${AUTHOR} · memory ${VERSION} · AKM-TRIAD-1.0</p>
      <p><a href="${GITHUB_REPO}">GitHub</a> · <a href="/stats">Stats</a> · <a href="/v1/skill">Skill</a> · <a href="/openapi.json">OpenAPI</a> · <a href="/mcp">MCP</a> · <a href="/count">Count</a></p>
    </footer>
  </div>
</body>
</html>
`;
}
