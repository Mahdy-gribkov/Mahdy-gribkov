// Generates the profile's stats + top-languages cards as committed SVGs.
//
// Why this exists: the README previously pulled these cards from a live third-party
// service (github-readme-stats-sigma-five.vercel.app) whose token died, so the cards
// broke after a few months and showed "Something went wrong". This generator renders
// the same information from the GitHub GraphQL API using ONLY the built-in Actions
// GITHUB_TOKEN (no PAT to expire) and writes static SVGs that are committed to the
// repo. The README references those files, so it can never depend on a live service
// at read time again. A failed run is loud in the Actions tab, not a broken image.
//
// Brand: Mahdy personal theme. Accent #d4943a on background #0c0b0e, text #e0c9a6.

import { writeFileSync, mkdirSync } from "node:fs";

const LOGIN = process.env.PROFILE_LOGIN || "medy-gribkov";
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error("Missing GITHUB_TOKEN. In Actions this is provided automatically; set it locally to preview.");
  process.exit(1);
}

// Brand tokens (single source for both cards).
const C = {
  bg: "#0c0b0e",
  accent: "#d4943a",
  text: "#e0c9a6",
  muted: "#8a7f6f",
  border: "rgba(212,148,58,0.28)",
};
const FONT = "'Segoe UI', Ubuntu, system-ui, sans-serif";

// Markup/data languages that dominate byte counts from templates and vendored files
// and misrepresent the actual stack. Hidden so the card shows real programming langs.
const HIDDEN_LANGS = new Set(["HTML", "CSS", "SCSS", "Less"]);
const LANG_LIMIT = 6;

async function gql(query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GitHub GraphQL ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(`GitHub GraphQL errors: ${JSON.stringify(json.errors)}`);
  return json.data;
}

async function fetchProfile() {
  const data = await gql(
    `query($login:String!){
      user(login:$login){
        followers{ totalCount }
        repositories(first:100, ownerAffiliations:OWNER, isFork:false){
          totalCount
          nodes{
            stargazerCount
            languages(first:10, orderBy:{field:SIZE, direction:DESC}){
              edges{ size node{ name color } }
            }
          }
        }
        contributionsCollection{
          totalCommitContributions
          totalPullRequestContributions
          contributionCalendar{
            weeks{ contributionDays{ contributionCount date } }
          }
        }
      }
    }`,
    { login: LOGIN }
  );
  const u = data.user;
  const repos = u.repositories.nodes;
  const stars = repos.reduce((s, r) => s + r.stargazerCount, 0);

  const bytes = new Map();
  const colors = new Map();
  for (const r of repos) {
    for (const e of r.languages.edges) {
      const name = e.node.name;
      if (HIDDEN_LANGS.has(name)) continue;
      bytes.set(name, (bytes.get(name) || 0) + e.size);
      colors.set(name, e.node.color || C.accent);
    }
  }
  const ranked = [...bytes.entries()].sort((a, b) => b[1] - a[1]).slice(0, LANG_LIMIT);
  const total = ranked.reduce((s, [, v]) => s + v, 0) || 1;
  const languages = ranked.map(([name, size]) => ({
    name,
    color: colors.get(name),
    pct: (100 * size) / total,
  }));

  const weeks = u.contributionsCollection.contributionCalendar.weeks.map((w) =>
    w.contributionDays.map((d) => d.contributionCount)
  );

  return {
    stars,
    repos: u.repositories.totalCount,
    followers: u.followers.totalCount,
    commits: u.contributionsCollection.totalCommitContributions,
    prs: u.contributionsCollection.totalPullRequestContributions,
    languages,
    weeks,
  };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function statsCard(p) {
  const rows = [
    ["Total stars earned", p.stars],
    ["Commits (past year)", p.commits],
    ["Total PRs", p.prs],
    ["Public repositories", p.repos],
    ["Followers", p.followers],
  ];
  const W = 480;
  const H = 60 + rows.length * 34 + 20;
  const items = rows
    .map(([label, value], i) => {
      const y = 78 + i * 34;
      return `
    <text x="30" y="${y}" fill="${C.text}" font-size="15">${esc(label)}</text>
    <text x="${W - 30}" y="${y}" fill="${C.accent}" font-size="15" font-weight="700" text-anchor="end">${esc(value)}</text>`;
    })
    .join("");
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="GitHub statistics">
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14" fill="${C.bg}" stroke="${C.border}"/>
  <text x="30" y="42" fill="${C.accent}" font-size="19" font-weight="700" font-family="${FONT}">Medy Gribkov's GitHub Stats</text>
  <g font-family="${FONT}">${items}
  </g>
</svg>`;
}

function langsCard(p) {
  const W = 360;
  const rowH = 30;
  const H = 60 + p.languages.length * rowH + 16;
  const barX = 150;
  const barW = W - barX - 60;
  const rows = p.languages
    .map((l, i) => {
      const y = 70 + i * rowH;
      const w = Math.max(4, (barW * l.pct) / 100);
      return `
    <text x="26" y="${y + 4}" fill="${C.text}" font-size="13">${esc(l.name)}</text>
    <rect x="${barX}" y="${y - 9}" width="${barW}" height="8" rx="4" fill="rgba(224,201,166,0.12)"/>
    <rect x="${barX}" y="${y - 9}" width="${w.toFixed(1)}" height="8" rx="4" fill="${l.color}"/>
    <text x="${W - 24}" y="${y + 4}" fill="${C.muted}" font-size="12" text-anchor="end">${l.pct.toFixed(1)}%</text>`;
    })
    .join("");
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Most used languages">
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14" fill="${C.bg}" stroke="${C.border}"/>
  <text x="26" y="40" fill="${C.accent}" font-size="17" font-weight="700" font-family="${FONT}">Most Used Languages</text>
  <g font-family="${FONT}">${rows}
  </g>
</svg>`;
}

// Contribution heatmap in the brand's amber intensity ramp (faint to peak), the same
// data GitHub draws natively, rendered on-brand as a committed static SVG.
function graphCard(p) {
  const CELL = 11, GAP = 3, STEP = CELL + GAP;
  const padX = 22, padTop = 46, padBottom = 16;
  const cols = p.weeks.length;
  const W = padX * 2 + cols * STEP - GAP;
  const H = padTop + 7 * STEP - GAP + padBottom;
  const max = Math.max(1, ...p.weeks.flat());
  const ramp = ["rgba(224,201,166,0.10)", "#4d3a18", "#856429", "#bd8b38", "#d4943a"];
  const level = (c) => (c === 0 ? 0 : Math.min(4, 1 + Math.floor(((c / max) * 3.999))));
  let cells = "";
  p.weeks.forEach((week, x) => {
    week.forEach((count, y) => {
      cells += `<rect x="${padX + x * STEP}" y="${padTop + y * STEP}" width="${CELL}" height="${CELL}" rx="2" fill="${ramp[level(count)]}"/>`;
    });
  });
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Contribution graph">
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14" fill="${C.bg}" stroke="${C.border}"/>
  <text x="${padX}" y="30" fill="${C.accent}" font-size="17" font-weight="700" font-family="${FONT}">Contribution Graph</text>
  ${cells}
</svg>`;
}

const p = await fetchProfile();
mkdirSync("dist", { recursive: true });
writeFileSync("dist/github-stats.svg", statsCard(p));
writeFileSync("dist/github-langs.svg", langsCard(p));
writeFileSync("dist/github-graph.svg", graphCard(p));
console.log("Wrote dist/github-stats.svg, dist/github-langs.svg, dist/github-graph.svg");
console.log(`stars=${p.stars} commits=${p.commits} prs=${p.prs} repos=${p.repos} followers=${p.followers}`);
console.log("langs:", p.languages.map((l) => `${l.name} ${l.pct.toFixed(1)}%`).join(", "));
