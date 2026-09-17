import fs from 'node:fs/promises';
import path from 'node:path';

const username = process.env.GITHUB_USER || process.argv[2];
const token = process.env.GITHUB_TOKEN;
const outDir = process.env.OUT_DIR || path.resolve('dist');

if (!username) {
  console.error('Missing GitHub username. Set GITHUB_USER or pass it as the first argument.');
  process.exit(1);
}

if (!token) {
  console.error('Missing GITHUB_TOKEN.');
  process.exit(1);
}

const query = `
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
            contributionLevel
            weekday
          }
        }
      }
    }
  }
}`;

async function fetchCalendar() {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'user-agent': 'github-ai-bug-hunter'
    },
    body: JSON.stringify({ query, variables: { login: username } })
  });

  if (!res.ok) {
    throw new Error(`GitHub GraphQL failed: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors.map(e => e.message).join('; '));
  }

  const calendar = json.data?.user?.contributionsCollection?.contributionCalendar;
  if (!calendar) throw new Error(`Could not load contribution calendar for ${username}`);
  return calendar;
}

function esc(s) {
  return String(s).replace(/[&<>\"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
}

const levelClass = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4
};

function robotSvg(cx, cy, scale = 1) {
  return `
  <g transform="translate(${cx} ${cy}) scale(${scale})" class="robot">
    <rect x="-6" y="-5" width="12" height="9" rx="2" class="robotBody"/>
    <rect x="-4" y="-8" width="8" height="3" rx="1.5" class="robotHead"/>
    <circle cx="-2" cy="-6.5" r="0.8" class="robotEye"/>
    <circle cx="2" cy="-6.5" r="0.8" class="robotEye"/>
    <path d="M0 -8 L0 -10 M0 -10 L2 -11" class="robotLine"/>
    <path d="M-7 -2 L-10 0 M7 -2 L10 0 M-3 4 L-5 8 M3 4 L5 8" class="robotLine"/>
    <path d="M-2 0 Q0 2 2 0" class="robotMouth"/>
  </g>`;
}

function bugSvg(x, y, cls, idx, beginSec, duration) {
  const t1 = Math.max(0, Math.min(0.999, beginSec / duration));
  const t2 = Math.max(t1, Math.min(0.9995, (beginSec + 0.18) / duration));
  return `
  <g class="bugWrap ${cls}" data-i="${idx}">
    <animate attributeName="opacity" values="1;1;0;0" keyTimes="0;${t1.toFixed(5)};${t2.toFixed(5)};1" dur="${duration}s" repeatCount="indefinite"/>
    <g transform="translate(${x + 6.5} ${y + 6.5})">
      <ellipse rx="3.2" ry="3.6" class="bugBody"/>
      <circle cy="-3.6" r="2.1" class="bugHead"/>
      <path d="M-4 -1 L-6 -3 M4 -1 L6 -3 M-4 1 L-6 3 M4 1 L6 3 M-1.5 -5.4 L-3 -7 M1.5 -5.4 L3 -7" class="bugLine"/>
      <circle cx="-0.8" cy="-4" r="0.45" class="bugEye"/><circle cx="0.8" cy="-4" r="0.45" class="bugEye"/>
    </g>
  </g>`;
}

function buildSvg(calendar, dark = false) {
  const weeks = calendar.weeks;
  const cols = weeks.length;
  const rows = 7;
  const cell = 14;
  const gap = 3;
  const pitch = cell + gap;
  const padX = 20;
  const padY = 22;
  const width = padX * 2 + cols * pitch - gap;
  const height = padY * 2 + rows * pitch - gap + 30;

  // Snake-scan every visible cell. The robot advances at a steady speed.
  const path = [];
  for (let c = 0; c < cols; c++) {
    const rowOrder = c % 2 === 0 ? [...Array(rows).keys()] : [...Array(rows).keys()].reverse();
    for (const r of rowOrder) path.push({ c, r });
  }

  const stepSec = 0.065;
  const duration = Math.max(10, path.length * stepSec + 2.0);
  const visitTime = new Map();
  path.forEach((p, i) => visitTime.set(`${p.c}:${p.r}`, i * stepSec));

  const moveValues = path.map(({c, r}) => {
    const x = padX + c * pitch + cell / 2;
    const y = padY + r * pitch + cell / 2;
    return `${x},${y}`;
  }).join(';');

  let cells = '';
  let bugs = '';
  let sparkles = '';

  for (let c = 0; c < cols; c++) {
    const days = weeks[c].contributionDays;
    for (const day of days) {
      const r = day.weekday;
      const x = padX + c * pitch;
      const y = padY + r * pitch;
      const level = levelClass[day.contributionLevel] ?? 0;
      const visit = visitTime.get(`${c}:${r}`) ?? 0;
      cells += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" class="cell l${level}"/>`;
      if (day.contributionCount > 0) {
        bugs += bugSvg(x, y, `l${level}`, `${c}-${r}`, visit, duration);
        const st1 = Math.max(0, Math.min(0.999, visit / duration));
        const st2 = Math.max(st1, Math.min(0.9993, (visit + 0.10) / duration));
        const st3 = Math.max(st2, Math.min(0.9996, (visit + 0.24) / duration));
        sparkles += `<g class="spark" transform="translate(${x + cell/2} ${y + cell/2})"><animate attributeName="opacity" values="0;0;1;0;0" keyTimes="0;${st1.toFixed(5)};${st2.toFixed(5)};${st3.toFixed(5)};1" dur="${duration}s" repeatCount="indefinite"/><path d="M0 -5 V5 M-5 0 H5 M-3.5 -3.5 L3.5 3.5 M3.5 -3.5 L-3.5 3.5"/></g>`;
      }
    }
  }

  const theme = dark ? {
    bg: '#0d1117', border: '#30363d', empty: '#161b22', text: '#8b949e',
    greens: ['#161b22','#0e4429','#006d32','#26a641','#39d353'], robot: '#ffd33d', robot2: '#f5c400'
  } : {
    bg: '#ffffff', border: '#d0d7de', empty: '#ebedf0', text: '#57606a',
    greens: ['#ebedf0','#9be9a8','#40c463','#30a14e','#216e39'], robot: '#f2cc00', robot2: '#d4a900'
  };

  const style = `
  :root{--bg:${theme.bg};--border:${theme.border};--empty:${theme.empty};--text:${theme.text};--g1:${theme.greens[1]};--g2:${theme.greens[2]};--g3:${theme.greens[3]};--g4:${theme.greens[4]};--robot:${theme.robot};--robot2:${theme.robot2};}
  .bg{fill:var(--bg)} .cell{stroke:var(--border);stroke-width:.7}.cell.l0{fill:var(--empty)}.cell.l1{fill:var(--g1)}.cell.l2{fill:var(--g2)}.cell.l3{fill:var(--g3)}.cell.l4{fill:var(--g4)}
  .bugBody,.bugHead{fill:#2da44e}.bugLine{fill:none;stroke:#0f5d2e;stroke-width:1;stroke-linecap:round}.bugEye{fill:#0d1117}
  .bugWrap.l2 .bugBody,.bugWrap.l2 .bugHead{fill:#26a641}.bugWrap.l3 .bugBody,.bugWrap.l3 .bugHead{fill:#218b45}.bugWrap.l4 .bugBody,.bugWrap.l4 .bugHead{fill:#196c2e}
  .spark{opacity:0}.spark path{stroke:var(--robot);stroke-width:1.2;stroke-linecap:round;fill:none}
  .runner{animation:move ${duration}s linear infinite}.robotBody{fill:var(--robot)}.robotHead{fill:var(--robot2)}.robotEye{fill:#111}.robotLine{fill:none;stroke:var(--robot);stroke-width:1.6;stroke-linecap:round}.robotMouth{fill:none;stroke:#111;stroke-width:1;stroke-linecap:round}.robot{filter:drop-shadow(0 1px 1px rgba(0,0,0,.35))}
  @keyframes move{0%{offset-distance:0%}100%{offset-distance:100%}}
  .caption{fill:var(--text);font:600 12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.sub{fill:var(--text);font:10px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  `;

  // Use animateMotion for broad SVG compatibility, with discrete keyPoints-like timing via values.
  const robot = `<g class="runner">${robotSvg(0, 0, 1.05)}<animateTransform attributeName="transform" type="translate" dur="${duration}s" repeatCount="indefinite" values="${moveValues}" calcMode="linear"/></g>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
<title id="title">${esc(username)} AI Bug Hunter contribution animation</title>
<desc id="desc">A yellow AI robot moves through the GitHub contribution grid and removes green software bugs.</desc>
<style>${style}</style>
<rect class="bg" x="0" y="0" width="${width}" height="${height}" rx="10"/>
<text x="${padX}" y="14" class="caption">AI Bug Hunter</text>
<text x="${width - padX}" y="14" text-anchor="end" class="sub">${calendar.totalContributions} contributions</text>
${cells}
${bugs}
${sparkles}
${robot}
<text x="${padX}" y="${height - 10}" class="sub">🤖 fixing bugs across ${esc(username)}'s contribution history</text>
</svg>`;
}

const calendar = await fetchCalendar();
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, 'github-ai-bug-hunter.svg'), buildSvg(calendar, false));
await fs.writeFile(path.join(outDir, 'github-ai-bug-hunter-dark.svg'), buildSvg(calendar, true));
console.log(`Generated AI Bug Hunter SVGs for ${username} in ${outDir}`);
