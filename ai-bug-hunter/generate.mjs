import fs from 'node:fs/promises';
import path from 'node:path';

const username = process.env.GITHUB_USER || process.argv[2];
const token = process.env.GITHUB_TOKEN;
const outDir = process.env.OUT_DIR || path.resolve('dist');
// GitHub's profile page buckets days in the visitor's timezone. Without this header the API
// (and therefore a bot token in Actions) uses UTC, which shifts day boundaries and totals.
const timeZone = process.env.TIMEZONE || 'UTC';

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
      'time-zone': timeZone,
      'user-agent': 'github-ai-bug-hunter'
    },
    body: JSON.stringify({ query, variables: { login: username } })
  });
  if (!res.ok) throw new Error(`GitHub GraphQL failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors.map(e => e.message).join('; '));
  const calendar = json.data?.user?.contributionsCollection?.contributionCalendar;
  if (!calendar) throw new Error(`Could not load contribution calendar for ${username}`);
  return calendar;
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LEVEL = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
const n2 = v => +v.toFixed(2);
const k5 = v => Math.max(0, Math.min(1, v)).toFixed(5);

// Deterministic pseudo-random so light/dark and repeated builds stay stable.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Turn [t0, t1, ...] into strictly increasing keyTimes in [0,1].
function keyTimes(times, duration) {
  const out = [];
  let prev = -1;
  for (const t of times) {
    let k = t / duration;
    if (k <= prev) k = prev + 0.00001;
    k = Math.min(k, 1);
    out.push(k);
    prev = k;
  }
  out[0] = 0;
  out[out.length - 1] = 1;
  return out.map(k => k.toFixed(5)).join(';');
}

const THEMES = {
  light: {
    bg: '#ffffff', bg2: '#f6f8fa', border: '#d0d7de', empty: '#ebedf0', text: '#57606a', title: '#1f2328',
    green: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
    red: ['#ebedf0', '#ff9f97', '#ff6b5e', '#e8402f', '#b3261e'],
    metal1: '#e6edf3', metal2: '#9aa4ae', metal3: '#5c6670', outline: '#3d444d',
    eye: '#0ea5e9', flash: '#ffffff', track: '#e6e8eb', particle: '#8b949e'
  },
  dark: {
    bg: '#0d1117', bg2: '#161b22', border: '#30363d', empty: '#161b22', text: '#8b949e', title: '#e6edf3',
    green: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
    red: ['#161b22', '#7a2020', '#a52a2a', '#d9362b', '#ff5c4d'],
    metal1: '#c9d1d9', metal2: '#7d8590', metal3: '#484f58', outline: '#22272e',
    eye: '#38bdf8', flash: '#ffffff', track: '#21262d', particle: '#c9d1d9'
  }
};

function robotShape(T) {
  return `
<g id="bot" filter="url(#glow)" transform="scale(__SCALE__)">
  <ellipse cx="0" cy="18" rx="10" ry="3" fill="url(#spot)"/>
  <g class="bob">
    <path d="M-7 2 L-11 6 M7 2 L11 6 M-3 8 L-4 11 M3 8 L4 11" class="rLine"/>
    <rect x="-7" y="-1" width="14" height="9" rx="3" fill="url(#bodyG)" class="rStroke"/>
    <rect x="-4.5" y="1.5" width="9" height="4" rx="1" fill="${T.metal3}" opacity=".55"/>
    <circle cx="0" cy="3.5" r="1.4" class="eye"><animate attributeName="opacity" values=".5;1;.5" dur="2.2s" repeatCount="indefinite"/></circle>
    <rect x="-1.5" y="-4" width="3" height="3.2" fill="${T.metal3}"/>
    <rect x="-8" y="-13" width="16" height="10" rx="4" fill="url(#headG)" class="rStroke"/>
    <rect x="-6" y="-11" width="12" height="5.2" rx="2.6" fill="${T.outline}"/>
    <circle cx="-3" cy="-8.4" r="1.5" class="eye"/>
    <circle cx="3" cy="-8.4" r="1.5" class="eye"/>
    <g class="eyeFlash" opacity="0">
      <circle cx="-3" cy="-8.4" r="2.4" fill="${T.flash}"/>
      <circle cx="3" cy="-8.4" r="2.4" fill="${T.flash}"/>
      <animate attributeName="opacity" values="__FLASH_VALUES__" keyTimes="__FLASH_TIMES__" dur="__DUR__s" repeatCount="indefinite"/>
    </g>
    <path d="M0 -13 L0 -17" class="rLine"/>
    <circle cx="0" cy="-18.4" r="1.6" fill="#ff5c4d"><animate attributeName="opacity" values="1;.2;1" dur=".9s" repeatCount="indefinite"/></circle>
    <animateTransform attributeName="transform" type="translate" values="0 0;0 -2;0 0" dur="1.7s" repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1"/>
  </g>
  <path d="M0 8 L-2.6 11.5 L1.8 12.4 L0 16.5" class="zap" opacity="0">
    <animate attributeName="opacity" values="__FLASH_VALUES__" keyTimes="__FLASH_TIMES__" dur="__DUR__s" repeatCount="indefinite"/>
  </path>
</g>`;
}

const generatedAt = new Intl.DateTimeFormat('en-CA', {
  timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short'
}).format(new Date()).replace(',', '');

function buildSvg(calendar, mode) {
  const T = THEMES[mode];
  const weeks = calendar.weeks;
  const cols = weeks.length;
  const rows = 7;
  const cell = 13, gap = 3, pitch = cell + gap;
  const padX = 24, headerH = 76, footerH = 42;
  const gridW = cols * pitch - gap;
  const gridH = rows * pitch - gap;
  const width = padX * 2 + gridW;
  const height = headerH + gridH + footerH;
  const gx = padX, gy = headerH;
  const cx = c => gx + c * pitch + cell / 2;
  const cy = r => gy + r * pitch + cell / 2;

  // ---- Targets: only cells with contributions, swept column by column in a serpentine.
  const targets = [];
  let down = true;
  weeks.forEach((w, c) => {
    const infected = w.contributionDays
      .filter(d => d.contributionCount > 0)
      .sort((a, b) => a.weekday - b.weekday);
    if (!infected.length) return;
    if (!down) infected.reverse();
    for (const d of infected) targets.push({ c, r: d.weekday, level: LEVEL[d.contributionLevel] || 1 });
    down = !down;
  });

  // ---- Timeline: the robot flies straight to each bug, pauses to zap it, then continues.
  const SPEED = 260;     // px per second
  const DWELL = 0.10;    // seconds spent zapping a cell
  const MAX_ACTIVE = 38; // seconds; long histories get sped up to fit
  const MIN_ACTIVE = 14; // seconds; sparse histories get slowed down so the flight is watchable
  const HOLD = 2.8;      // seconds to show the "all clear" state before looping
  const ROBOT_SCALE = 1.15;
  const ROBOT_LIFT = 19;  // robot floats this far above the cell it is fixing (zap tip lands on the cell)
  const midY = gy + gridH / 2;
  const startPos = [gx - 50, midY];
  const exitPos = [width + 50, midY];

  const frames = [{ t: 0, x: startPos[0], y: startPos[1] }];
  const visits = [];
  let t = 0, px = startPos[0], py = startPos[1];
  for (const tg of targets) {
    const x = cx(tg.c), y = cy(tg.r) - ROBOT_LIFT;
    t += Math.max(0.03, Math.hypot(x - px, y - py) / SPEED);
    frames.push({ t, x, y });
    visits.push(t);
    t += DWELL;
    frames.push({ t, x, y });
    px = x; py = y;
  }
  const scale = t > MAX_ACTIVE ? MAX_ACTIVE / t : t < MIN_ACTIVE && t > 0 ? MIN_ACTIVE / t : 1;
  for (const f of frames) f.t *= scale;
  for (let i = 0; i < visits.length; i++) visits[i] *= scale;
  t *= scale;
  const lastVisit = visits.length ? visits[visits.length - 1] : 0;
  const exitT = t + Math.hypot(exitPos[0] - px, exitPos[1] - py) / SPEED;
  frames.push({ t: exitT, x: exitPos[0], y: exitPos[1] });
  const duration = n2(exitT + HOLD);
  frames.push({ t: duration - 0.05, x: exitPos[0], y: exitPos[1] });
  frames.push({ t: duration, x: startPos[0], y: startPos[1] }); // teleport home while invisible

  let minStep = Infinity;
  for (let i = 1; i < visits.length; i++) minStep = Math.min(minStep, visits[i] - visits[i - 1]);
  const flashLen = Math.min(0.12, (isFinite(minStep) ? minStep : 1) * 0.55);
  const fadeLen = Math.min(0.16, (isFinite(minStep) ? minStep : 1) * 0.8);

  const robotMove = `<animateTransform attributeName="transform" type="translate" calcMode="linear" dur="${duration}s" repeatCount="indefinite" values="${frames.map(f => `${n2(f.x)} ${n2(f.y)}`).join(';')}" keyTimes="${keyTimes(frames.map(f => f.t), duration)}"/>`;
  const robotFade = `<animate attributeName="opacity" calcMode="linear" dur="${duration}s" repeatCount="indefinite" values="0;1;1;0;0;0" keyTimes="${keyTimes([0, 0.35, t + 0.1, exitT, duration - 0.05, duration], duration)}"/>`;

  // Eye flash + zap bolt fire at every visit.
  const flashV = ['0'], flashT = [0];
  for (const v of visits) {
    flashV.push('0', '1', '0');
    flashT.push(v - 0.005, v, v + flashLen);
  }
  flashV.push('0'); flashT.push(duration);
  const robot = robotShape(T)
    .replaceAll('__FLASH_VALUES__', flashV.join(';'))
    .replaceAll('__FLASH_TIMES__', keyTimes(flashT, duration))
    .replaceAll('__DUR__', String(duration))
    .replaceAll('__SCALE__', String(ROBOT_SCALE));

  // ---- Cells
  let cells = '', infected = '', bursts = '';
  weeks.forEach((w, c) => {
    for (const d of w.contributionDays) {
      const r = d.weekday, x = gx + c * pitch, y = gy + r * pitch;
      const lv = LEVEL[d.contributionLevel] || 0;
      if (d.contributionCount === 0) {
        cells += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="${T.empty}"/>`;
        continue;
      }
      const L = Math.max(1, lv);
      const idx = targets.findIndex(tg => tg.c === c && tg.r === r);
      const v = visits[idx];
      cells += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="${T.empty}">` +
        `<animate attributeName="fill" values="${T.empty};${T.empty};${T.green[L]};${T.green[L]}" keyTimes="${keyTimes([0, v, v + fadeLen, duration], duration)}" dur="${duration}s" repeatCount="indefinite"/></rect>`;
      const delay = -((c * 0.13 + r * 0.21) % 1.4).toFixed(2);
      infected += `<g><animate attributeName="opacity" values="1;1;0;0" keyTimes="${keyTimes([0, v, v + fadeLen, duration], duration)}" dur="${duration}s" repeatCount="indefinite"/>` +
        `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="${T.red[L]}" class="inf" style="animation-delay:${delay}s"/>` +
        `<circle cx="${n2(x + cell / 2)}" cy="${n2(y + cell / 2)}" r="1.6" fill="${T.outline}" opacity=".55"/></g>`;
      bursts += `<circle cx="${n2(x + cell / 2)}" cy="${n2(y + cell / 2)}" r="3" fill="none" stroke="${T.green[4]}" stroke-width="1.6" opacity="0">` +
        `<animate attributeName="r" values="2;2;13;13" keyTimes="${keyTimes([0, v, v + 0.4, duration], duration)}" dur="${duration}s" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="0;0;1;0;0" keyTimes="${keyTimes([0, v, v + 0.04, v + 0.4, duration], duration)}" dur="${duration}s" repeatCount="indefinite"/></circle>`;
    }
  });

  // ---- Header: title, live progress bar, "all clear" badge
  const barW = 150, barH = 6, barX = width - padX - barW, barY = 26;
  const progV = ['0'], progT = [0];
  visits.forEach((v, i) => { progV.push(n2(barW * (i + 1) / visits.length)); progT.push(v); });
  progV.push(String(barW)); progT.push(duration);
  const progress = `
<text x="${barX}" y="18" class="label">BUGS FIXED</text>
<rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="3" fill="${T.track}"/>
<rect x="${barX}" y="${barY}" width="0" height="${barH}" rx="3" fill="url(#barG)"><animate attributeName="width" calcMode="linear" values="${progV.join(';')}" keyTimes="${keyTimes(progT, duration)}" dur="${duration}s" repeatCount="indefinite"/></rect>
<g opacity="0">
  <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="${keyTimes([0, lastVisit + 0.4, lastVisit + 0.9, duration - 0.06, duration], duration)}" dur="${duration}s" repeatCount="indefinite"/>
  <rect x="${barX + barW - 78}" y="${barY + barH + 6}" width="78" height="16" rx="8" fill="${T.green[3]}"/>
  <text x="${barX + barW - 39}" y="${barY + barH + 17.5}" text-anchor="middle" class="badge">✓ ALL CLEAR</text>
</g>`;

  // ---- Ambient particles
  const rand = rng(1337);
  let particles = '';
  for (let i = 0; i < 18; i++) {
    const x = n2(rand() * width), y = n2(rand() * height), r = n2(0.6 + rand() * 1.1);
    const dur = n2(2 + rand() * 3), beg = n2(-rand() * 4);
    particles += `<circle cx="${x}" cy="${y}" r="${r}" fill="${T.particle}" opacity=".18"><animate attributeName="opacity" values=".05;.35;.05" dur="${dur}s" begin="${beg}s" repeatCount="indefinite"/></circle>`;
  }

  const style = `
.title{fill:${T.title};font:700 15px -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;letter-spacing:.2px}
.sub,.label,.legend{fill:${T.text};font:600 10px -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
.label{letter-spacing:1.2px;font-size:9px}
.badge{fill:#fff;font:700 9px -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;letter-spacing:.6px}
.rStroke{stroke:${T.outline};stroke-width:.9}
.rLine{fill:none;stroke:${T.metal2};stroke-width:1.8;stroke-linecap:round}
.eye{fill:${T.eye}}
.zap{fill:none;stroke:${T.eye};stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.inf{animation:inf 1.4s ease-in-out infinite}
@keyframes inf{0%,100%{opacity:1}50%{opacity:.55}}
`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
<title id="title">${esc(username)} AI Bug Hunter contribution animation</title>
<desc id="desc">A gray AI robot flies across the GitHub contribution grid. Days with contributions start red as bugs and turn green once the robot fixes them.</desc>
<defs>
  <linearGradient id="bgG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${T.bg}"/><stop offset="1" stop-color="${T.bg2}"/></linearGradient>
  <linearGradient id="bodyG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${T.metal1}"/><stop offset="1" stop-color="${T.metal2}"/></linearGradient>
  <linearGradient id="headG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${T.metal1}"/><stop offset="1" stop-color="${T.metal2}"/></linearGradient>
  <linearGradient id="barG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${T.green[2]}"/><stop offset="1" stop-color="${T.green[4]}"/></linearGradient>
  <radialGradient id="spot"><stop offset="0" stop-color="${T.eye}" stop-opacity=".45"/><stop offset="1" stop-color="${T.eye}" stop-opacity="0"/></radialGradient>
  <filter id="glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="1.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<style>${style}</style>
<rect x="0" y="0" width="${width}" height="${height}" rx="12" fill="url(#bgG)" stroke="${T.border}"/>
${particles}
<text x="${padX}" y="24" class="title">AI Bug Hunter</text>
<text x="${padX}" y="40" class="sub">${esc(username)} · ${calendar.totalContributions} contributions in the last year · ${targets.length} bugs to fix</text>
${progress}
<g>${cells}</g>
<g>${infected}</g>
<g>${bursts}</g>
<g>${robotFade}${robotMove}${robot}</g>
<g class="legend">
  <rect x="${padX}" y="${height - 21}" width="10" height="10" rx="2" fill="${T.red[3]}"/><text x="${padX + 15}" y="${height - 12.5}" class="legend">bug</text>
  <rect x="${padX + 48}" y="${height - 21}" width="10" height="10" rx="2" fill="${T.green[3]}"/><text x="${padX + 63}" y="${height - 12.5}" class="legend">fixed</text>
  <text x="${width - padX}" y="${height - 12.5}" text-anchor="end" class="legend">updated ${generatedAt} · github.com/${esc(username)}</text>
</g>
<rect x="0" y="0" width="${width}" height="${height}" rx="12" fill="${T.bg}" opacity="0"><animate attributeName="opacity" values=".95;0;0;.95" keyTimes="0;0.025;0.985;1" dur="${duration}s" repeatCount="indefinite"/></rect>
</svg>`;
}

const calendar = await fetchCalendar();
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, 'github-ai-bug-hunter.svg'), buildSvg(calendar, 'light'));
await fs.writeFile(path.join(outDir, 'github-ai-bug-hunter-dark.svg'), buildSvg(calendar, 'dark'));
console.log(`Generated AI Bug Hunter SVGs for ${username} in ${outDir}`);
