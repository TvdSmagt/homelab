// Full-screen ambient home screen for the Nest Hub: one custom element in a panel view
// (homeassistant/dashboards/nest_hub.yaml), no Home Assistant cards and no dependencies.
// Designed at 1024 x 600 (the Nest Hub) and scaled to fit any other screen.
//
//   background   live sky: colour follows the real sun elevation, glow where the sun is, stars at night,
//                drifting clouds by weather condition, falling rain when the radar says it rains now
//   left         clock, weather now (animated icon, moon phase at night, wind in Bft), day arc with
//                sunrise / sunset, rain next 2 hours (Buienradar / KNMI radar), solar harvest vs forecast
//   centre       energy: animated solar / grid / house flow, energy score (tap for the breakdown),
//                thin 12-hour graph of solar vs house power, today's totals
//   right        all Tado rooms with - / + (debounced, Tado has API limits), lights, scenes
//
// On the Cast receiver (or with ?kiosk in the URL) it covers the whole screen and shifts a few pixels
// every 5 minutes against burn-in. Served as /local/homelab-ambient-panel.js; bump ?v= in
// configuration.yaml (lovelace: resources) after a change, the Nest caches it. Docs: docs/nest-display.md.

const NL = 'nl-NL';
const W = 1024;
const H = 600;

const DEFAULTS = {
  solar: 'sensor.6fz463602f_pv_output_actual',
  import: 'sensor.electricity_meter_power_consumption',
  export: 'sensor.electricity_meter_power_production',
  house: 'sensor.house_power',
  score: 'sensor.energy_score_today',
  self_consumption: 'sensor.self_consumption_today',
  price: 'sensor.price_timing_score_today',
  solar_today: 'sensor.solar_energy_today',
  import_today: 'sensor.grid_import_today',
  export_today: 'sensor.grid_export_today',
  gas_today: 'sensor.gas_today',
  cost_today: 'sensor.fixed_cost_today',
  forecast_today: 'sensor.solar_forecast_today',
  forecast_tomorrow: 'sensor.solar_forecast_tomorrow',
  weather: 'weather.forecast_home',
  rain: 'sensor.rain_forecast',
  outdoor: 'sensor.koekelberg25_outdoor_temperature',
  hot_water: 'water_heater.warm_water_warm_water',
  rooms: [
    { entity: 'climate.woonkamer_woonkamer', name: 'Woonkamer' },
    { entity: 'climate.beneden_beneden', name: 'Beneden' },
    { entity: 'climate.bibliotheek_bibliotheek', name: 'Bibliotheek' },
    { entity: 'climate.kleine_kamer_kleine_kamer', name: 'Kleine kamer' },
  ],
  lights: [
    { entity: 'light.woonkamer_woonkamer', name: 'Woonkamer' },
    { entity: 'light.keuken_keuken', name: 'Keuken' },
    { entity: 'light.eetkamer_eetkamer', name: 'Eetkamer' },
    { entity: 'light.bibliotheek_bibliotheek', name: 'Bibliotheek' },
  ],
  scenes: [
    { entity: 'scene.beneden_relax', name: 'Relax', icon: 'mdi:sofa' },
    { entity: 'scene.beneden_dimmed', name: 'Gedimd', icon: 'mdi:weather-night' },
    { entity: 'scene.beneden_bright', name: 'Fel', icon: 'mdi:white-balance-sunny' },
    { off: 'light.beneden', name: 'Uit', icon: 'mdi:power' },
  ],
  graph_hours: 12,
  temp_step: 0.5,
};

// ── Small helpers ───────────────────────────────────────────────────────────────────────────────
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmt = (v, d = 1) =>
  v == null || Number.isNaN(v) ? '–' : v.toLocaleString(NL, { minimumFractionDigits: d, maximumFractionDigits: d });
const power = (w) => (w >= 1000 ? `${fmt(w / 1000, 1)} kW` : `${Math.round(w)} W`);
const hhmm = (d) => d.toLocaleTimeString(NL, { hour: '2-digit', minute: '2-digit' });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function num(hass, id) {
  const s = id && hass.states[id];
  if (!s) return null;
  const v = parseFloat(s.state);
  return Number.isNaN(v) ? null : v;
}
function watts(hass, id) {
  const v = num(hass, id);
  if (v == null) return null;
  return hass.states[id].attributes.unit_of_measurement === 'kW' ? v * 1000 : v;
}
const scoreColor = (v) => (v == null ? 'var(--muted)' : v >= 70 ? 'var(--export)' : v >= 45 ? '#f0b030' : '#ff6b6b');

// ── Sun and moon (after SunCalc, Vladimir Agafonkin, BSD) ─────────────────────────────────────────
const RAD = Math.PI / 180;
const OBL = RAD * 23.4397;
const toDays = (ms) => ms / 86400000 - 0.5 + 2440588 - 2451545;
const fromJ = (j) => new Date((j + 0.5 - 2440588) * 86400000);
function sunCore(d) {
  const M = RAD * (357.5291 + 0.98560028 * d);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  return { M, L, dec: Math.asin(Math.sin(L) * Math.sin(OBL)), ra: Math.atan2(Math.sin(L) * Math.cos(OBL), Math.cos(L)) };
}
function sunElevation(date, lat, lon) {
  const d = toDays(date.valueOf());
  const { dec, ra } = sunCore(d);
  const phi = RAD * lat;
  const H0 = RAD * (280.16 + 360.9856235 * d) + RAD * lon - ra;
  return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H0)) / RAD;
}
function sunTimes(date, lat, lon) {
  const lw = RAD * -lon;
  const phi = RAD * lat;
  const n = Math.round(toDays(date.valueOf()) - 0.0009 - lw / (2 * Math.PI));
  const ds = 0.0009 + lw / (2 * Math.PI) + n;
  const { M, L, dec } = sunCore(ds);
  const noon = 2451545 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const cosW = (Math.sin(-0.833 * RAD) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  if (cosW < -1 || cosW > 1) return null;
  const a = 0.0009 + (Math.acos(cosW) + lw) / (2 * Math.PI) + n;
  const set = 2451545 + a + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  return { rise: fromJ(noon - (set - noon)), set: fromJ(set) };
}
// 0 = new moon, 0.5 = full moon.
function moonPhase(date) {
  const f = ((date.valueOf() / 86400000 + 2440587.5 - 2451550.1) / 29.530588853) % 1;
  return f < 0 ? f + 1 : f;
}
function moonPath(f, r) {
  const k = Math.cos(2 * Math.PI * f);
  const rx = (Math.abs(k) * r).toFixed(2);
  return f < 0.5
    ? `M0 ${-r}A${r} ${r} 0 0 1 0 ${r}A${rx} ${r} 0 0 ${k > 0 ? 0 : 1} 0 ${-r}Z`
    : `M0 ${-r}A${r} ${r} 0 0 0 0 ${r}A${rx} ${r} 0 0 ${k > 0 ? 1 : 0} 0 ${-r}Z`;
}

// ── Sky colours by sun elevation: [elevation, top, bottom, glow] ─────────────────────────────────
const SKY = [
  [-18, [5, 7, 15], [10, 14, 32], [40, 40, 90]],
  [-9, [9, 14, 40], [38, 30, 70], [110, 60, 110]],
  [-3, [20, 28, 70], [96, 52, 84], [240, 120, 80]],
  [3, [28, 46, 96], [120, 80, 96], [250, 160, 90]],
  [12, [22, 56, 104], [50, 96, 140], [255, 200, 120]],
  [35, [16, 58, 110], [44, 104, 156], [255, 228, 170]],
];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgba = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;
function skyAt(elev) {
  if (elev <= SKY[0][0]) return SKY[0].slice(1);
  for (let i = 1; i < SKY.length; i++) {
    if (elev <= SKY[i][0]) {
      const [e0, ...a] = SKY[i - 1];
      const [e1, ...b] = SKY[i];
      const t = (elev - e0) / (e1 - e0);
      return a.map((c, j) => mix(c, b[j], t));
    }
  }
  return SKY[SKY.length - 1].slice(1);
}

// ── Weather: label, icon kind, cloud cover for the sky ───────────────────────────────────────────
const WEATHER = {
  'clear-night': ['Helder', 'sun', 0],
  sunny: ['Zonnig', 'sun', 0],
  partlycloudy: ['Half bewolkt', 'partly', 0.35],
  cloudy: ['Bewolkt', 'cloud', 0.75],
  fog: ['Mist', 'fog', 0.6],
  rainy: ['Regen', 'rain', 0.8],
  pouring: ['Stortregen', 'rain', 0.9],
  lightning: ['Onweer', 'storm', 0.9],
  'lightning-rainy': ['Onweer en regen', 'storm', 0.9],
  snowy: ['Sneeuw', 'snow', 0.8],
  'snowy-rainy': ['Natte sneeuw', 'snow', 0.85],
  hail: ['Hagel', 'snow', 0.85],
  windy: ['Winderig', 'wind', 0.2],
  'windy-variant': ['Winderig en bewolkt', 'wind', 0.55],
  exceptional: ['Uitzonderlijk weer', 'cloud', 0.6],
};
const RAINY = new Set(['rainy', 'pouring', 'lightning-rainy', 'snowy-rainy']);

const CLOUD = 'M20 46H46A9 9 0 0 0 46 28A13 13 0 0 0 21 25A10.5 10.5 0 0 0 20 46Z';
function sunSvg(cx, cy, r) {
  let rays = '';
  for (let i = 0; i < 8; i++) {
    const c = Math.cos((i * Math.PI) / 4);
    const s = Math.sin((i * Math.PI) / 4);
    rays += `<line x1="${(cx + c * (r + 4)).toFixed(1)}" y1="${(cy + s * (r + 4)).toFixed(1)}" x2="${(cx + c * (r + 9)).toFixed(1)}" y2="${(cy + s * (r + 9)).toFixed(1)}"/>`;
  }
  return `<g class="sun"><circle class="halo" cx="${cx}" cy="${cy}" r="${r + 7}"/><g class="rays" style="transform-origin:${cx}px ${cy}px">${rays}</g><circle cx="${cx}" cy="${cy}" r="${r}"/></g>`;
}
const moonSvg = (cx, cy, r, f) =>
  `<g class="moon" transform="translate(${cx} ${cy})"><circle class="halo" r="${r + 6}"/><circle class="dark" r="${r}"/><path class="lit" d="${moonPath(f, r)}"/></g>`;
const cloudSvg = (dx, dy, cls = '') => `<g transform="translate(${dx} ${dy})"><g class="cl ${cls}"><path d="${CLOUD}"/></g></g>`;
function weatherSvg(kind, night, f) {
  const lum = night ? moonSvg(21, 21, 9, f) : sunSvg(21, 21, 8);
  const under = (items) => cloudSvg(0, -6) + items;
  let body;
  switch (kind) {
    case 'sun': body = night ? moonSvg(32, 32, 15, f) : sunSvg(32, 32, 12); break;
    case 'partly': body = lum + cloudSvg(6, 8); break;
    case 'rain': body = under([22, 32, 42].map((x, i) => `<line class="drop" style="animation-delay:${i * 0.37}s" x1="${x}" y1="45" x2="${x - 2}" y2="51"/>`).join('')); break;
    case 'snow': body = under([22, 32, 42].map((x, i) => `<circle class="flake" style="animation-delay:${i * 0.7}s" cx="${x}" cy="47" r="2.2"/>`).join('')); break;
    case 'storm': body = under('<path class="bolt" d="M34 38L26 50H32L29 60L40 46H34L37 38Z"/>'); break;
    case 'fog': body = cloudSvg(0, -8) + [42, 49, 56].map((y, i) => `<line class="fogl" style="animation-delay:-${i * 1.6}s" x1="${14 + i * 3}" y1="${y}" x2="${50 - i * 3}" y2="${y}"/>`).join(''); break;
    case 'wind': body = '<g class="windl"><path d="M8 26H38a6 6 0 1 0-6-6"/><path d="M8 36H47a6 6 0 1 1-6 6"/><path d="M8 46H30"/></g>'; break;
    default: body = cloudSvg(-7, -3, 'back') + cloudSvg(3, 3);
  }
  return `<svg viewBox="0 0 64 64">${body}</svg>`;
}
const BFT = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118];
const COMPASS = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'];

// Small deterministic random for the star field, so it does not jump on reload.
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Styles ──────────────────────────────────────────────────────────────────────────────────────
const STYLE = `
:host { display: block; position: relative; overflow: hidden; height: calc(100vh - var(--header-height, 56px));
  min-height: 320px; background: #05070f; color: var(--text); user-select: none; -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent; -webkit-font-smoothing: antialiased;
  font-family: Outfit, Roboto, 'Segoe UI', system-ui, sans-serif;
  --solar: #ffb938; --grid: #a98bff; --export: #3fd68f; --home: #5aaeff; --heat: #ff8a4c; --rain: #6fb8ff;
  --text: #f4f6fb; --muted: rgba(232, 238, 255, .62); --faint: rgba(232, 238, 255, .13);
  --glass: rgba(7, 11, 26, .46); --edge: rgba(255, 255, 255, .09); --stars: 0; --clouds: 0; --cloudc: 200, 208, 224; }
:host(.full) { position: fixed; left: 0; top: 0; width: 100vw; height: 100vh; z-index: 9; }
* { box-sizing: border-box; }
button { font: inherit; color: inherit; background: none; border: 0; padding: 0; margin: 0; cursor: pointer;
  -webkit-tap-highlight-color: transparent; }
ha-icon { display: inline-flex; }

/* sky layers */
.sky, .stars, .clouds, canvas, .veil { position: absolute; inset: 0; pointer-events: none; }
.sky { transition: opacity 2s; }
.stars { opacity: var(--stars); transition: opacity 30s; }
.stars i { position: absolute; border-radius: 50%; background: #fff; }
.stars i.tw { animation: twinkle 5s ease-in-out infinite alternate; }
@keyframes twinkle { from { opacity: 1; } to { opacity: .2; } }
.clouds { opacity: var(--clouds); transition: opacity 30s; overflow: hidden; }
.clouds i { position: absolute; left: 0; will-change: transform; width: 75%; height: 55%; border-radius: 50%;
  background: radial-gradient(closest-side, rgba(var(--cloudc), .5), rgba(var(--cloudc), 0));
  animation: cloud linear infinite; }
.clouds i:nth-child(1) { top: -14%; animation-duration: 310s; animation-delay: -60s; }
.clouds i:nth-child(2) { top: 18%; height: 45%; animation-duration: 420s; animation-delay: -250s; }
.clouds i:nth-child(3) { top: 46%; animation-duration: 360s; animation-delay: -140s; }
.clouds i:nth-child(4) { top: 2%; width: 55%; animation-duration: 520s; animation-delay: -400s; }
@keyframes cloud { from { transform: translateX(-85%); } to { transform: translateX(150%); } }
canvas { width: 100%; height: 100%; opacity: 0; transition: opacity 4s; }
canvas.on { opacity: 1; }
.veil { background: #000; opacity: 0; transition: opacity 60s; }

/* stage: fixed 1024 x 600 design, scaled to the screen */
.stage { position: absolute; left: 50%; top: 50%; width: ${W}px; height: ${H}px; padding: 16px;
  display: grid; grid-template-columns: 270px 384px 314px; gap: 12px;
  transform: translate(-50%, -50%) translate(var(--sx, 0px), var(--sy, 0px)) scale(var(--k, 1));
  transition: transform 3s ease-in-out; }
.col { display: flex; flex-direction: column; gap: 12px; min-height: 0; }
.glass { background: var(--glass); border: 1px solid var(--edge); border-radius: 22px; position: relative; }
.press { transition: transform .15s, background .3s; }
.press:active { transform: scale(.95); }
.label { font-size: 11px; font-weight: 500; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }

/* clock */
.clock { padding: 2px 6px 0; position: relative; }
.greet { font-size: 15px; color: var(--muted); display: flex; align-items: center; gap: 6px; }
.greet .off { width: 8px; height: 8px; border-radius: 50%; background: #ff6b6b; display: none; }
.greet .off.on { display: inline-block; }
.time { font-size: 98px; font-weight: 200; line-height: .92; letter-spacing: -.035em; margin-left: -4px;
  font-variant-numeric: tabular-nums; text-shadow: 0 4px 30px rgba(0,0,0,.25); }
.time .c { animation: colon 2s ease-in-out infinite; }
@keyframes colon { 50% { opacity: .3; } }
.date { font-size: 18px; font-weight: 300; color: var(--muted); margin-top: 4px; }

/* weather */
.weather { padding: 12px 14px 8px; cursor: pointer; }
.wrow { display: flex; align-items: center; gap: 10px; }
.wicon { width: 66px; height: 66px; flex: none; margin: -6px -2px -6px -6px; }
.wicon svg { width: 100%; height: 100%; overflow: visible; }
.temp { font-size: 38px; font-weight: 300; line-height: 1; }
.cond { font-size: 14px; color: var(--muted); margin-top: 3px; white-space: nowrap; }
.wmeta { margin-left: auto; text-align: right; font-size: 12px; color: var(--muted); line-height: 1.55; white-space: nowrap; }
.wmeta ha-icon { --mdc-icon-size: 14px; vertical-align: -2px; margin-right: 2px; opacity: .8; }
.sun circle { fill: #ffc94a; } .sun .halo { fill: rgba(255, 201, 74, .16); }
.rays line { stroke: #ffc94a; stroke-width: 3; stroke-linecap: round; }
.rays { animation: spin 50s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.moon .halo { fill: rgba(243, 237, 216, .08); } .moon .dark { fill: rgba(255, 255, 255, .09); } .moon .lit { fill: #f3edd8; }
.cl path { fill: #e9eef8; } .cl.back path { fill: #8e9ab3; }
.cl { animation: bob 7s ease-in-out infinite alternate; }
.cl.back { animation-duration: 9s; animation-direction: alternate-reverse; }
@keyframes bob { from { transform: translateX(-1.5px); } to { transform: translateX(1.5px); } }
.drop { stroke: var(--rain); stroke-width: 2.6; stroke-linecap: round; animation: fall 1.1s linear infinite; }
.flake { fill: #fff; animation: fall 2.4s linear infinite; }
@keyframes fall { 0% { transform: translateY(-3px); opacity: 0; } 25% { opacity: 1; } 100% { transform: translateY(9px); opacity: 0; } }
.bolt { fill: #ffd85a; animation: flash 5s infinite; }
@keyframes flash { 0%, 86%, 100% { opacity: .25; } 88%, 93% { opacity: 1; } 90% { opacity: .3; } }
.fogl { stroke: #cfd6e4; stroke-width: 3; stroke-linecap: round; animation: bob 5s ease-in-out infinite alternate; }
.windl path { fill: none; stroke: #dfe6f2; stroke-width: 3; stroke-linecap: round; stroke-dasharray: 50 14;
  animation: dash 3s linear infinite; }
@keyframes dash { to { stroke-dashoffset: -64; } }
.arc { margin-top: 6px; }
.arc svg { display: block; width: 100%; height: 50px; overflow: visible; }
.arc .hz { stroke: var(--faint); stroke-width: 1; }
.arc .bg { fill: none; stroke: rgba(255, 255, 255, .16); stroke-width: 1.5; stroke-dasharray: 2 5; stroke-linecap: round; }
.arc .fg { fill: none; stroke: url(#arcg); stroke-width: 2.5; stroke-linecap: round; }
.arc .dot { fill: #ffd56b; } .arc .glw { fill: rgba(255, 205, 90, .22); }
.arcl { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--muted); margin-top: 1px; }
.arcl ha-icon { --mdc-icon-size: 14px; vertical-align: -2px; margin-right: 2px; }

/* rain */
.rain { padding: 11px 14px 9px; flex: 1; display: flex; flex-direction: column; }
.rhead { display: flex; align-items: center; gap: 9px; }
.rhead ha-icon { --mdc-icon-size: 22px; color: var(--ri, var(--rain)); }
.rtitle { font-size: 15px; font-weight: 500; line-height: 1.2; }
.rsub { font-size: 12px; color: var(--muted); }
.bars { flex: 1; min-height: 42px; max-height: 96px; margin-top: 10px; display: flex; align-items: flex-end; gap: 2px;
  border-bottom: 1px solid var(--faint); position: relative; padding-right: 34px; }
.bars u { position: absolute; left: 0; right: 0; border-top: 1px dashed rgba(255, 255, 255, .08); text-decoration: none; }
.bars u::after { content: attr(data-l); position: absolute; right: 0; top: -7px; font-size: 9.5px; color: var(--muted); opacity: .7; }
.bars i { flex: 1; border-radius: 3px 3px 0 0; min-height: 2px; background: linear-gradient(180deg, #8fd0ff, #3d8fe0);
  transition: height 1s ease; }
.bars i.dry { background: rgba(255, 255, 255, .1); }
.raxis { display: flex; justify-content: space-between; font-size: 10.5px; color: var(--muted); margin-top: 3px; padding-right: 34px; }

/* solar harvest */
.harvest { padding: 11px 14px 12px; display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; align-items: center; }
.harvest > ha-icon { --mdc-icon-size: 26px; color: var(--solar); grid-row: span 2; }
.hline { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.hline b { font-size: 17px; font-weight: 500; } .hline span { font-size: 12px; color: var(--muted); white-space: nowrap; }
.hbar { height: 6px; border-radius: 3px; background: rgba(255, 255, 255, .1); overflow: hidden; }
.hbar i { display: block; height: 100%; width: 0; border-radius: 3px; background: linear-gradient(90deg, #ff9a3c, #ffd56b);
  transition: width 1.5s ease; }
.hnext { grid-column: 2; font-size: 11.5px; color: var(--muted); margin-top: 3px; }

/* energy */
.energy { padding: 15px 16px 14px; display: flex; flex-direction: column; }
.ehead { display: flex; align-items: center; gap: 12px; }
.ebadge { width: 44px; height: 44px; border-radius: 50%; flex: none; display: grid; place-items: center; color: #0b0f1e;
  background: var(--accent); transition: background 1s; box-shadow: 0 0 22px color-mix(in srgb, var(--accent) 45%, transparent); }
.ebadge ha-icon { --mdc-icon-size: 24px; }
.etext { flex: 1; min-width: 0; }
.etitle { font-size: 20px; font-weight: 500; line-height: 1.15; color: var(--accent); transition: color 1s; }
.esub { font-size: 12.5px; color: var(--muted); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.score { flex: none; display: flex; flex-direction: column; align-items: center; color: var(--sc); line-height: 1; }
.score .pill { display: flex; align-items: center; gap: 4px; padding: 6px 10px 6px 8px; border-radius: 18px;
  background: color-mix(in srgb, var(--sc) 17%, transparent); border: 1px solid color-mix(in srgb, var(--sc) 35%, transparent); }
.score ha-icon { --mdc-icon-size: 18px; }
.score b { font-size: 18px; font-weight: 600; }
.score span { font-size: 10px; color: var(--muted); margin-top: 4px; letter-spacing: .02em; }
.pop { position: absolute; right: 12px; top: 72px; width: 250px; padding: 13px 14px; border-radius: 18px; z-index: 3;
  background: rgba(10, 14, 30, .96); border: 1px solid var(--edge); box-shadow: 0 18px 40px rgba(0, 0, 0, .45);
  opacity: 0; transform: translateY(-6px) scale(.98); pointer-events: none; transition: opacity .25s, transform .25s; }
.pop.on { opacity: 1; transform: none; pointer-events: auto; }
.pop p { margin: 0 0 10px; font-size: 12px; color: var(--muted); line-height: 1.4; }
.prow { margin-top: 9px; font-size: 13px; }
.prow div { display: flex; justify-content: space-between; } .prow b { font-weight: 600; }
.prow .hbar { margin-top: 5px; }

.flow { position: relative; width: 352px; height: 252px; margin: 12px auto 0; }
.flow svg { position: absolute; inset: 0; overflow: visible; }
.ln { fill: none; stroke-width: 3; opacity: .14; transition: opacity 1s; }
.ln.on { opacity: .32; }
.dots { fill: none; stroke-width: 7; stroke-linecap: round; stroke-dasharray: 0 18; opacity: 0; transition: opacity 1s;
  animation: flow var(--d, 2s) linear infinite; }
.dots.on { opacity: 1; }
@keyframes flow { to { stroke-dashoffset: -36; } }
.s-solar { stroke: var(--solar); } .s-export { stroke: var(--export); } .s-grid { stroke: var(--grid); }
.node { position: absolute; width: 64px; height: 64px; margin: -32px 0 0 -32px; border-radius: 50%; display: grid;
  place-items: center; color: var(--nc); background: rgba(8, 12, 28, .9); border: 2.5px solid var(--nc);
  transition: color 1s, border-color 1s, box-shadow 1s; }
.node ha-icon { --mdc-icon-size: 28px; }
.node::after { content: ''; position: absolute; inset: -3px; border-radius: 50%; border: 2px solid var(--nc); opacity: 0; }
.node.on { box-shadow: 0 0 26px color-mix(in srgb, var(--nc) 50%, transparent); }
.node.on::after { animation: ring 2.8s ease-out infinite; }
@keyframes ring { from { transform: scale(1); opacity: .55; } to { transform: scale(1.5); opacity: 0; } }
.val { position: absolute; font-size: 15px; font-weight: 500; white-space: nowrap; line-height: 1.2; }
.val small { display: block; font-size: 11.5px; font-weight: 400; color: var(--muted); }
.mid { position: absolute; left: 176px; top: 104px; transform: translateX(-50%); text-align: center; }
.mid b { display: block; font-size: 34px; font-weight: 300; line-height: 1; letter-spacing: -.01em; }
.mid span { font-size: 11.5px; color: var(--muted); }

.graph { margin-top: 12px; }
.graph svg { display: block; width: 100%; height: 60px; }
.g-solar { fill: url(#gsolar); stroke: var(--solar); stroke-width: 1.5; }
.g-house { fill: none; stroke: var(--home); stroke-width: 1.8; }
.g-base { stroke: var(--faint); stroke-width: 1; }
.legend { display: flex; justify-content: space-between; font-size: 10.5px; color: var(--muted); margin-top: 3px; }
.legend i { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin: 0 3px 0 8px; }
.chips { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: auto; }
.chip { background: rgba(255, 255, 255, .05); border-radius: 12px; padding: 8px 9px; display: flex; align-items: center;
  gap: 7px; min-width: 0; }
.chip ha-icon { --mdc-icon-size: 18px; color: var(--ic); flex: none; }
.chip b { font-size: 13.5px; font-weight: 500; display: block; white-space: nowrap; }
.chip span { font-size: 10.5px; color: var(--muted); display: block; white-space: nowrap; }

/* climate */
.climate { padding: 12px 14px 8px; flex: 1; display: flex; flex-direction: column; }
#rooms { flex: 1; display: flex; flex-direction: column; justify-content: space-around; }
.chead { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 2px; }
.chead span { font-size: 12.5px; color: var(--muted); }
.room { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 8px; padding: 6px 6px 6px 8px;
  margin: 0 -6px 0 -8px; border-radius: 14px; transition: background 1s; }
.room.heat { background: linear-gradient(90deg, rgba(255, 138, 76, .2), rgba(255, 138, 76, 0) 85%); }
.rname { min-width: 0; }
.rname b { display: block; font-size: 14.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rname span { display: flex; align-items: center; gap: 3px; font-size: 11px; color: var(--muted); }
.rname ha-icon { --mdc-icon-size: 13px; }
.heat .rname span { color: var(--heat); }
.cur { font-size: 22px; font-weight: 300; min-width: 48px; text-align: right; }
.heat .cur { color: var(--heat); }
.ctl { display: flex; align-items: center; gap: 3px; }
.ctl button { width: 33px; height: 33px; border-radius: 50%; font-size: 19px; line-height: 1;
  background: rgba(255, 255, 255, .08); display: grid; place-items: center; }
.ctl button:active { background: rgba(90, 174, 255, .4); }
.ctl button:disabled { opacity: .25; }
.tgt { min-width: 40px; text-align: center; font-size: 14px; color: var(--muted); transition: color .3s; }
.tgt.pend { color: var(--home); font-weight: 600; }
.water { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); padding: 6px 0 2px;
  border-top: 1px solid var(--faint); margin-top: 4px; }
.water ha-icon { --mdc-icon-size: 15px; }
.water.on ha-icon { color: var(--heat); }

/* lights */
.lights { padding: 11px 12px 12px; }
.lhead { display: flex; justify-content: space-between; align-items: baseline; margin: 0 2px 8px; }
.lhead span { font-size: 12.5px; color: var(--muted); }
.lgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
.lt { display: flex; align-items: center; gap: 9px; padding: 7px 9px; border-radius: 14px; text-align: left;
  background: rgba(255, 255, 255, .05); min-width: 0; }
.lt .i { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; flex: none;
  background: rgba(255, 255, 255, .07); color: var(--muted); transition: all .5s; }
.lt .i ha-icon { --mdc-icon-size: 19px; }
.lt b { display: block; font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lt small { display: block; font-size: 11px; color: var(--muted); }
.lt.on { background: linear-gradient(135deg, rgba(255, 196, 107, .24), rgba(255, 196, 107, .07)); }
.lt.on .i { background: #ffc46b; color: #2a1a00; box-shadow: 0 0 16px rgba(255, 196, 107, .55); }
.lt.pend { opacity: .65; }
.lt:disabled { opacity: .35; }

/* scenes */
.scenes { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; }
.sc { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 9px 0 8px; border-radius: 16px; }
.sc ha-icon { --mdc-icon-size: 21px; color: var(--muted); transition: color .3s; }
.sc span { font-size: 11.5px; color: var(--muted); }
.sc.flash { background: rgba(255, 196, 107, .28); border-color: rgba(255, 196, 107, .5); }
.sc.flash ha-icon { color: #ffc46b; }
`;

// ── The panel ───────────────────────────────────────────────────────────────────────────────────
class HomelabAmbientPanel extends HTMLElement {
  static getStubConfig() {
    return {};
  }

  setConfig(config) {
    this._c = { ...DEFAULTS, ...config };
    this._pendingTemp = {};
    this._tempTimers = {};
    this._pendingLight = {};
    this._cache = {};
  }

  getCardSize() {
    return 12;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._root) this._build();
    if (!this._skyAt) this._sky();
    this._update();
    if (!this._histAt || Date.now() - this._histAt > 5 * 60 * 1000) this._loadHistory();
  }

  connectedCallback() {
    if (this._root) this._start();
  }

  disconnectedCallback() {
    clearInterval(this._clockT);
    clearInterval(this._skyT);
    clearInterval(this._shiftT);
    cancelAnimationFrame(this._rainRaf);
    this._rainRaf = null;
    if (this._ro) this._ro.disconnect();
    this._running = false;
  }

  // ── build ──
  _build() {
    const full = location.host === 'cast.home-assistant.io' || /CrKey/.test(navigator.userAgent) || /[?&]kiosk\b/.test(location.search);
    if (full) this.classList.add('full');
    this._full = full;
    window.__homelabPanel = true; // tells the pixel shift in homelab-energy-card.js to leave <body> alone
    if (!document.getElementById('homelab-font')) {
      const l = document.createElement('link');
      l.id = 'homelab-font';
      l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;500;600&display=swap';
      document.head.appendChild(l);
    }

    const r = rng(7);
    let stars = '';
    for (let i = 0; i < 70; i++) {
      const s = (0.6 + r() * 1.6).toFixed(1);
      stars += `<i class="${r() < 0.35 ? 'tw' : ''}" style="left:${(r() * 100).toFixed(2)}%;top:${(r() * 62).toFixed(2)}%;width:${s}px;height:${s}px;opacity:${(0.35 + r() * 0.65).toFixed(2)};animation-delay:-${(r() * 5).toFixed(1)}s"></i>`;
    }
    const c = this._c;
    const scenes = c.scenes
      .map((s, i) => `<button class="sc glass press" data-act="scene" data-i="${i}"><ha-icon icon="${s.icon}"></ha-icon><span>${s.name}</span></button>`)
      .join('');

    this._root = this.attachShadow({ mode: 'open' });
    this._root.innerHTML = `<style>${STYLE}</style>
      <div class="sky" id="sky"></div>
      <div class="stars">${stars}</div>
      <div class="clouds"><i></i><i></i><i></i><i></i></div>
      <canvas id="rainfx"></canvas>
      <div class="stage" id="stage">
        <section class="col">
          <div class="clock">
            <div class="greet"><span id="greet"></span><i class="off" id="offline" title="geen verbinding met Home Assistant"></i></div>
            <div class="time" id="time"></div>
            <div class="date" id="date"></div>
          </div>
          <div class="glass weather press" data-act="info" data-entity="${c.weather}">
            <div class="wrow">
              <div class="wicon" id="wicon"></div>
              <div><div class="temp" id="temp">–</div><div class="cond" id="cond"></div></div>
              <div class="wmeta" id="wmeta"></div>
            </div>
            <div class="arc">
              <svg viewBox="0 0 252 50">
                <defs><linearGradient id="arcg" x1="0" x2="1"><stop offset="0" stop-color="#ff8a4c"/><stop offset="1" stop-color="#ffd56b"/></linearGradient></defs>
                <line class="hz" x1="0" y1="46" x2="252" y2="46"/>
                <path class="bg" d="M14 46Q126 -20 238 46"/>
                <path class="fg" id="arcfg"/>
                <g id="arcsun"><circle class="glw" r="9"/><circle class="dot" r="4.5"/></g>
              </svg>
              <div class="arcl"><span id="rise"></span><span id="daylen"></span><span id="set"></span></div>
            </div>
          </div>
          <div class="glass rain press" data-act="info" data-entity="${c.rain}">
            <div class="rhead"><ha-icon id="ricon" icon="mdi:weather-partly-cloudy"></ha-icon>
              <div><div class="rtitle" id="rtitle">Regenverwachting</div><div class="rsub" id="rsub"></div></div></div>
            <div class="bars" id="bars"></div>
            <div class="raxis" id="raxis"></div>
          </div>
          <div class="glass harvest press" data-act="info" data-entity="${c.solar_today}">
            <ha-icon icon="mdi:solar-power-variant"></ha-icon>
            <div class="hline"><b id="hnow">–</b><span id="hfc"></span></div>
            <div class="hbar"><i id="hbar"></i></div>
            <div class="hnext" id="hnext"></div>
          </div>
        </section>

        <section class="glass energy" id="energy">
          <div class="ehead">
            <div class="ebadge"><ha-icon id="eicon"></ha-icon></div>
            <div class="etext"><div class="etitle" id="etitle"></div><div class="esub" id="esub"></div></div>
            <button class="score press" id="score" data-act="score">
              <span class="pill"><ha-icon id="sicon" icon="mdi:leaf"></ha-icon><b id="snum">–</b></span>
              <span>energiescore</span>
            </button>
          </div>
          <div class="pop" id="pop" data-act="score">
            <p>Hoe slim we vandaag met stroom omgaan: eigen zonnestroom zelf gebruiken, en van het net halen als het goedkoop is.</p>
            <div class="prow"><div><span>Eigen zon zelf gebruikt</span><b id="p-sc">–</b></div><div class="hbar"><i id="pb-sc"></i></div></div>
            <div class="prow"><div><span>Slim getimed (prijs)</span><b id="p-pr">–</b></div><div class="hbar"><i id="pb-pr"></i></div></div>
          </div>
          <div class="flow">
            <svg viewBox="0 0 352 252" width="352" height="252">
              <path class="ln s-solar" id="l-sh" d="M197 71Q262 96 276 163"/>
              <path class="ln s-export" id="l-sg" d="M155 71Q90 96 76 163"/>
              <path class="ln s-grid" id="l-gh" d="M90 188L262 188"/>
              <path class="dots s-solar" id="f-sh" d="M197 71Q262 96 276 163"/>
              <path class="dots s-export" id="f-sg" d="M155 71Q90 96 76 163"/>
              <path class="dots s-grid" id="f-gh" d="M90 188L262 188"/>
            </svg>
            <div class="node" id="n-solar" style="left:176px;top:46px;--nc:var(--solar)"><ha-icon icon="mdi:solar-power-variant"></ha-icon></div>
            <div class="node" id="n-grid" style="left:56px;top:188px;--nc:var(--grid)"><ha-icon icon="mdi:transmission-tower"></ha-icon></div>
            <div class="node" id="n-home" style="left:296px;top:188px;--nc:var(--home)"><ha-icon icon="mdi:home-lightning-bolt"></ha-icon></div>
            <div class="val" id="v-solar" style="left:218px;top:22px"></div>
            <div class="val" id="v-grid" style="left:56px;top:224px;transform:translateX(-50%);text-align:center"></div>
            <div class="val" id="v-home" style="left:296px;top:224px;transform:translateX(-50%);text-align:center"></div>
            <div class="mid"><b id="m-house">–</b><span>verbruik nu</span></div>
          </div>
          <div class="graph">
            <svg viewBox="0 0 352 38" preserveAspectRatio="none">
              <defs><linearGradient id="gsolar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb938" stop-opacity=".55"/><stop offset="1" stop-color="#ffb938" stop-opacity=".05"/></linearGradient></defs>
              <line class="g-base" x1="0" y1="37.5" x2="352" y2="37.5" vector-effect="non-scaling-stroke"/>
              <path id="g-solar" class="g-solar" vector-effect="non-scaling-stroke"/>
              <path id="g-house" class="g-house" vector-effect="non-scaling-stroke"/>
            </svg>
            <div class="legend"><span>${c.graph_hours} uur geleden</span>
              <span><i style="background:var(--solar)"></i>zon<i style="background:var(--home)"></i>huis <span id="g-peak"></span></span>
              <span>nu</span></div>
          </div>
          <div class="chips" id="chips"></div>
        </section>

        <section class="col">
          <div class="glass climate">
            <div class="chead"><span class="label">Klimaat</span><span id="outdoor"></span></div>
            <div id="rooms"></div>
            <div class="water" id="water"></div>
          </div>
          <div class="glass lights">
            <div class="lhead"><span class="label">Lampen</span><span id="lcount"></span></div>
            <div class="lgrid" id="lgrid"></div>
          </div>
          <div class="scenes">${scenes}</div>
        </section>
      </div>
      <div class="veil" id="veil"></div>`;

    const $ = (id) => this._root.getElementById(id);
    this._el = new Proxy({}, { get: (o, k) => o[k] || (o[k] = $(k)) });
    this._root.addEventListener('click', (ev) => this._onClick(ev));
    if (this.isConnected) this._start();
  }

  _start() {
    if (this._running) return;
    this._running = true;
    this._clock();
    this._clockT = setInterval(() => this._clock(), 1000);
    this._skyT = setInterval(() => this._sky(), 60 * 1000);
    // Burn-in guard: move the whole layout a few pixels every 5 minutes in a slow loop.
    const steps = [[0, 0], [3, 1], [4, 4], [1, 5], [-2, 3], [-4, 0], [-3, -3], [0, -4], [3, -2]];
    let i = 0;
    this._shiftT = setInterval(() => {
      if (!this._full) return;
      i = (i + 1) % steps.length;
      this._el.stage.style.setProperty('--sx', `${steps[i][0]}px`);
      this._el.stage.style.setProperty('--sy', `${steps[i][1]}px`);
    }, 5 * 60 * 1000);
    this._ro = new ResizeObserver(() => this._fit());
    this._ro.observe(this);
    this._fit();
    if (this._rainLevel) this._rainLoop();
  }

  _fit() {
    const w = this.clientWidth;
    const h = this.clientHeight;
    if (!w || !h) return;
    this._el.stage.style.setProperty('--k', Math.min(w / W, h / H).toFixed(4));
    const cv = this._el.rainfx;
    cv.width = Math.round(w);
    cv.height = Math.round(h);
  }

  // ── interaction ──
  _onClick(ev) {
    const t = ev.target.closest('[data-act]');
    if (!t || t.disabled) return;
    const act = t.dataset.act;
    if (act === 'climate') this._step(t.dataset.entity, Number(t.dataset.dir));
    else if (act === 'light') this._toggleLight(t.dataset.entity);
    else if (act === 'scene') this._scene(t, Number(t.dataset.i));
    else if (act === 'score') this._togglePop();
    else if (act === 'info') this._moreInfo(t.dataset.entity);
  }

  _moreInfo(entityId) {
    if (!entityId) return;
    this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }));
  }

  _togglePop(force) {
    const on = force ?? !this._el.pop.classList.contains('on');
    this._el.pop.classList.toggle('on', on);
    clearTimeout(this._popT);
    if (on) this._popT = setTimeout(() => this._togglePop(false), 10000);
  }

  _scene(btn, i) {
    const s = this._c.scenes[i];
    if (!s) return;
    if (s.off) this._hass.callService('light', 'turn_off', { entity_id: s.off });
    else this._hass.callService('scene', 'turn_on', { entity_id: s.entity });
    btn.classList.add('flash');
    setTimeout(() => btn.classList.remove('flash'), 1400);
  }

  _toggleLight(id) {
    const s = this._hass.states[id];
    if (!s) return;
    const to = this._lightState(id) === 'on' ? 'off' : 'on';
    this._pendingLight[id] = { to, at: Date.now() };
    this._hass.callService('light', to === 'on' ? 'turn_on' : 'turn_off', { entity_id: id });
    this._lights();
  }

  _lightState(id) {
    const s = this._hass.states[id];
    const p = this._pendingLight[id];
    if (p) {
      if ((s && s.state === p.to) || Date.now() - p.at > 8000) delete this._pendingLight[id];
      else return p.to;
    }
    return s ? s.state : 'unavailable';
  }

  // - / + collect presses for 2 s and send one call per room (Tado limits API calls per day).
  _target(id) {
    const s = this._hass.states[id];
    const actual = s ? s.attributes.temperature : null;
    const p = this._pendingTemp[id];
    if (p) {
      if (actual === p.value || (p.sent && Date.now() - p.sent > 60000)) delete this._pendingTemp[id];
      else return p.value;
    }
    return actual;
  }

  _step(id, dir) {
    const cur = this._target(id);
    if (cur == null) return;
    const v = clamp(Math.round((cur + dir * this._c.temp_step) * 2) / 2, 5, 25);
    this._pendingTemp[id] = { value: v, sent: null };
    clearTimeout(this._tempTimers[id]);
    this._tempTimers[id] = setTimeout(() => {
      this._hass.callService('climate', 'set_temperature', { entity_id: id, temperature: v });
      if (this._pendingTemp[id]) this._pendingTemp[id].sent = Date.now();
    }, 2000);
    this._rooms();
  }

  // ── rendering ──
  _set(key, el, html) {
    if (this._cache[key] === html) return;
    this._cache[key] = html;
    el.innerHTML = html;
  }

  _update() {
    this._energy();
    this._rooms();
    this._lights();
    this._weather();
    this._rain();
    this._harvest();
    this._el.offline.classList.toggle('on', this._hass.connected === false);
  }

  _clock() {
    const now = new Date();
    const hm = hhmm(now);
    if (hm === this._hm) return;
    this._hm = hm;
    this._el.time.innerHTML = hm.replace(':', '<span class="c">:</span>');
    this._el.date.textContent = cap(now.toLocaleDateString(NL, { weekday: 'long', day: 'numeric', month: 'long' }));
    const h = now.getHours();
    this._el.greet.textContent = h < 6 ? 'Goedenacht' : h < 12 ? 'Goedemorgen' : h < 18 ? 'Goedemiddag' : 'Goedenavond';
    // A soft dim after 21:00 (the screen goes off at 22:30).
    this._el.veil.style.opacity = h >= 21 || h < 7 ? '0.25' : '0';
  }

  // Sky colour, sun glow, stars, clouds and the day arc. Runs every minute.
  _sky() {
    const hass = this._hass;
    if (!hass || !this._root) return;
    this._skyAt = Date.now();
    const now = new Date();
    const lat = hass.config && hass.config.latitude;
    const lon = hass.config && hass.config.longitude;
    const sunAttr = hass.states['sun.sun'] && hass.states['sun.sun'].attributes;
    let elev = sunAttr && typeof sunAttr.elevation === 'number' ? sunAttr.elevation : 20;
    let times = null;
    if (typeof lat === 'number' && typeof lon === 'number') {
      elev = sunElevation(now, lat, lon);
      const noon = new Date(now);
      noon.setHours(12, 0, 0, 0);
      times = sunTimes(noon, lat, lon);
    }
    const frac = times ? (now - times.rise) / (times.set - times.rise) : 0.5;
    const night = elev < -0.833;
    this._sun = { elev, times, frac, night };

    const w = hass.states[this._c.weather];
    const cond = w ? w.state : 'sunny';
    this._cond = cond;
    const cloud = (WEATHER[cond] || [0, 0, 0.3])[2];
    const [top, bot, glow] = skyAt(elev);
    const dayF = clamp((elev + 6) / 14, 0, 1);
    const grey = mix([16, 20, 30], [62, 72, 88], dayF);
    const t2 = mix(top, grey, cloud * 0.7);
    const b2 = mix(bot, mix(grey, [92, 100, 116], dayF * 0.6), cloud * 0.7);
    const gx = 8 + clamp(frac, 0, 1) * 84;
    const gy = clamp(80 - elev * 1.4, 28, 110);
    const ga = clamp((elev + 10) / 14, 0, 1) * (1 - cloud * 0.75) * 0.6;
    this._el.sky.style.background = `radial-gradient(ellipse 58% 80% at ${gx.toFixed(1)}% ${gy.toFixed(1)}%, ${rgba(glow, ga)}, ${rgba(glow, 0)} 70%), linear-gradient(180deg, ${rgba(t2)}, ${rgba(b2)})`;
    this.style.background = rgba(b2);
    this.style.setProperty('--stars', (clamp((-elev - 4) / 8, 0, 1) * (1 - cloud)).toFixed(2));
    this.style.setProperty('--clouds', (cloud * 0.9).toFixed(2));
    this.style.setProperty('--cloudc', mix([46, 52, 68], [205, 212, 228], dayF).join(','));

    // Day arc: quadratic curve from sunrise (left) to sunset (right), the sun sits at today's progress.
    if (times) {
      const P0 = [14, 46];
      const P1 = [126, -20];
      const P2 = [238, 46];
      const t = clamp(frac, 0, 1);
      const q = (a, b, c) => (1 - t) ** 2 * a + 2 * (1 - t) * t * b + t ** 2 * c;
      const bx = q(P0[0], P1[0], P2[0]);
      const by = q(P0[1], P1[1], P2[1]);
      const cx = P0[0] + (P1[0] - P0[0]) * t;
      const cy = P0[1] + (P1[1] - P0[1]) * t;
      const up = frac > 0 && frac < 1;
      this._el.arcfg.setAttribute('d', up ? `M${P0[0]} ${P0[1]}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}` : '');
      this._el.arcsun.setAttribute('transform', `translate(${bx.toFixed(1)} ${by.toFixed(1)})`);
      this._el.arcsun.style.display = up ? '' : 'none';
      const len = Math.round((times.set - times.rise) / 60000);
      this._el.rise.innerHTML = `<ha-icon icon="mdi:weather-sunset-up"></ha-icon>${hhmm(times.rise)}`;
      this._el.set.innerHTML = `<ha-icon icon="mdi:weather-sunset-down"></ha-icon>${hhmm(times.set)}`;
      const left = Math.round((times.set - now) / 60000);
      this._el.daylen.textContent = !up
        ? `${Math.floor(len / 60)}u ${len % 60}m daglicht`
        : left < 60 ? `nog ${left} min licht` : `nog ${Math.floor(left / 60)}u ${left % 60}m licht`;
    }
    if (this._hass) this._weather();
  }

  _weather() {
    const w = this._hass.states[this._c.weather];
    if (!w) return;
    const a = w.attributes;
    const night = this._sun ? this._sun.night : false;
    const [label, kind] = WEATHER[w.state] || [w.state, 'cloud'];
    const f = moonPhase(new Date());
    this._set('wicon', this._el.wicon, weatherSvg(kind, night, f));
    this._el.temp.textContent = a.temperature == null ? '–' : `${fmt(a.temperature, 0)}°`;
    const feels = a.apparent_temperature;
    this._el.cond.textContent = feels != null && Math.abs(feels - a.temperature) >= 2 ? `${label} · voelt ${fmt(feels, 0)}°` : label;
    let kmh = a.wind_speed;
    if (kmh != null && a.wind_speed_unit === 'm/s') kmh *= 3.6;
    const bi = kmh == null ? null : BFT.findIndex((t) => kmh < t);
    const bft = bi == null ? null : bi === -1 ? 12 : bi;
    const dir = typeof a.wind_bearing === 'number' ? COMPASS[Math.round(a.wind_bearing / 45) % 8] : '';
    const meta = [
      bft != null ? `<div><ha-icon icon="mdi:weather-windy"></ha-icon>${bft} Bft ${dir}</div>` : '',
      a.humidity != null ? `<div><ha-icon icon="mdi:water-percent"></ha-icon>${Math.round(a.humidity)}%</div>` : '',
    ].join('');
    this._set('wmeta', this._el.wmeta, meta);
    const cond = w.state;
    if (cond !== this._cond) {
      this._cond = cond;
      this._sky();
    }
  }

  _rain() {
    const s = this._hass.states[this._c.rain];
    const raw = s ? s.state : '';
    const cond = this._hass.states[this._c.weather] ? this._hass.states[this._c.weather].state : '';
    const key = `${raw}|${cond}`;
    if (key === this._cache.rain) return;
    this._cache.rain = key;
    const e = this._el;
    const [start, list] = (raw || '').split('|');
    const mm = (list || '').split(',').map(parseFloat).filter((v) => !Number.isNaN(v));
    if (!start || mm.length === 0) {
      e.ricon.setAttribute('icon', 'mdi:weather-cloudy-alert');
      e.rtitle.textContent = 'Regenverwachting';
      e.rsub.textContent = 'geen gegevens van Buienradar';
      e.bars.innerHTML = '';
      e.raxis.innerHTML = '';
      this._setRain(RAINY.has(cond) ? 1 : 0);
      return;
    }
    const [hh, mi] = start.split(':').map(Number);
    const at = (i) => {
      const t = hh * 60 + mi + i * 5;
      return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    };
    const wet = (v) => v >= 0.1;
    const kind = (v) => (v >= 5 ? 'zware regen' : v >= 1 ? 'regen' : 'lichte regen');
    const peak = Math.max(...mm);
    const first = mm.findIndex(wet);
    let icon, title, sub;
    if (first === -1) {
      icon = 'mdi:umbrella-closed-variant'; title = 'Droog de komende 2 uur';
      sub = `tot ${at(mm.length)} geen regen verwacht`;
    } else if (first === 0) {
      const dry = mm.findIndex((v) => !wet(v));
      icon = 'mdi:weather-pouring';
      title = dry === -1 ? `${cap(kind(peak))} de komende 2 uur` : `Het regent, droog rond ${at(dry)}`;
      sub = `tot ${fmt(peak, 1)} mm per uur`;
    } else {
      icon = 'mdi:weather-rainy';
      title = `${cap(kind(peak))} om ${at(first)}`;
      sub = `over ${first * 5} minuten, tot ${fmt(peak, 1)} mm/u`;
    }
    this._root.querySelector('.rain').style.setProperty('--ri', first === -1 ? 'var(--solar)' : 'var(--rain)');
    e.ricon.setAttribute('icon', icon);
    e.rtitle.textContent = title;
    e.rsub.textContent = sub;
    // Square-root scale up to 5 mm/h: drizzle stays visible and a shower does not flatten the rest.
    // Guide lines at 0.5 / 2 / 5 mm/h (31% / 63% / 100% on the square-root scale).
    e.bars.innerHTML = '<u style="bottom:31%" data-l="licht"></u><u style="bottom:63%" data-l="matig"></u><u style="bottom:100%" data-l="zwaar"></u>' + mm
      .map((v) => `<i class="${wet(v) ? '' : 'dry'}" style="height:${wet(v) ? Math.max(10, Math.min(100, Math.sqrt(v / 5) * 100)).toFixed(0) : 4}%"></i>`)
      .join('');
    e.raxis.innerHTML = `<span>nu</span><span>${at(6)}</span><span>${at(12)}</span><span>${at(18)}</span><span>${at(mm.length)}</span>`;
    this._setRain(wet(mm[0]) ? clamp(mm[0], 0.3, 8) : 0);
  }

  // Falling rain over the sky, only while the radar says it rains here now.
  _setRain(level) {
    this._rainLevel = level;
    this._el.rainfx.classList.toggle('on', level > 0);
    if (level > 0 && this._running) this._rainLoop();
  }

  _rainLoop() {
    if (this._rainRaf) return;
    const cv = this._el.rainfx;
    const ctx = cv.getContext('2d');
    let drops = [];
    let last = 0;
    const frame = (ts) => {
      this._rainRaf = requestAnimationFrame(frame);
      if (ts - last < 33) return; // ~30 fps is plenty and easy on the Nest
      const dt = Math.min(0.06, (ts - last) / 1000 || 0.033);
      last = ts;
      const wv = cv.width;
      const hv = cv.height;
      const want = this._rainLevel ? Math.round(40 + Math.sqrt(this._rainLevel) * 55) : 0;
      while (drops.length < want) drops.push({ x: Math.random() * wv, y: Math.random() * hv, l: 10 + Math.random() * 14, v: 520 + Math.random() * 380 });
      if (drops.length > want) drops = drops.slice(0, want);
      ctx.clearRect(0, 0, wv, hv);
      if (!drops.length) {
        cancelAnimationFrame(this._rainRaf);
        this._rainRaf = null;
        return;
      }
      ctx.strokeStyle = 'rgba(175, 205, 255, .34)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (const d of drops) {
        d.y += d.v * dt;
        d.x -= d.v * dt * 0.12;
        if (d.y > hv) { d.y = -d.l; d.x = Math.random() * (wv + 60); }
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + d.l * 0.12, d.y - d.l);
      }
      ctx.stroke();
    };
    this._rainRaf = requestAnimationFrame(frame);
  }

  _harvest() {
    const h = this._hass;
    const c = this._c;
    const now = num(h, c.solar_today);
    const fc = num(h, c.forecast_today);
    const tm = num(h, c.forecast_tomorrow);
    const key = `${now}|${fc}|${tm}`;
    if (key === this._cache.harvest) return;
    this._cache.harvest = key;
    const e = this._el;
    e.hnow.textContent = `${fmt(now)} kWh zon`;
    e.hfc.textContent = fc == null ? '' : `van ${fmt(fc)} verwacht`;
    e.hbar.style.width = `${fc ? clamp((now || 0) / fc, 0, 1) * 100 : 0}%`;
    let next = '';
    if (tm != null) {
      const more = fc != null && tm > fc * 1.25 ? ' · meer zon dan vandaag' : fc != null && tm < fc * 0.75 ? ' · minder zon dan vandaag' : '';
      next = `Morgen ${fmt(tm)} kWh verwacht${more}`;
    }
    e.hnext.textContent = next;
  }

  _flow(id, w) {
    const el = this._el[`f-${id}`];
    const on = w >= 15;
    el.classList.toggle('on', on);
    this._el[`l-${id}`].classList.toggle('on', on);
    if (!on) return;
    // Faster dots for more power: ~2 s at 20 W, ~0.6 s from 1 kW.
    const d = clamp(3 - Math.log10(Math.max(w, 10)) * 0.8, 0.5, 2.2).toFixed(1);
    if (el.dataset.d !== d) {
      el.dataset.d = d;
      el.style.setProperty('--d', `${d}s`);
    }
  }

  _energy() {
    const h = this._hass;
    const c = this._c;
    const e = this._el;
    const solar = Math.max(watts(h, c.solar) ?? 0, 0); // Grott is unavailable at night: 0 W
    const imp = Math.max(watts(h, c.import) ?? 0, 0);
    const exp = Math.max(watts(h, c.export) ?? 0, 0);
    const house = Math.max(solar + imp - exp, 0);
    const solarToHouse = Math.max(solar - exp, 0);
    const share = house > 0 ? Math.min(100, Math.round((solarToHouse / house) * 100)) : 0;

    this._flow('sh', solarToHouse);
    this._flow('sg', exp);
    this._flow('gh', imp);
    e['n-solar'].classList.toggle('on', solar >= 15);
    e['n-grid'].classList.toggle('on', imp >= 15 || exp >= 15);
    e['n-home'].classList.toggle('on', house >= 15);
    e['n-grid'].style.setProperty('--nc', exp >= 15 ? 'var(--export)' : 'var(--grid)');
    this._set('v-solar', e['v-solar'], `${power(solar)}<small>zon</small>`);
    this._set('v-grid', e['v-grid'], exp >= 15 ? `${power(exp)}<small>terug</small>` : `${power(imp)}<small>van net</small>`);
    this._set('v-home', e['v-home'], `huis<small>${solar >= 15 ? `${share}% eigen zon` : 'van het net'}</small>`);
    e['m-house'].textContent = power(house);

    let accent, icon, title, sub;
    if (exp >= 30) {
      accent = 'var(--export)'; icon = 'mdi:transmission-tower-export';
      title = 'We leveren terug';
      sub = `${power(exp)} gaat naar het net`;
    } else if (solar >= 30) {
      accent = 'var(--solar)'; icon = 'mdi:solar-power-variant';
      if (imp < 30) {
        title = 'Op eigen zonnestroom';
        sub = 'de zon dekt het hele verbruik';
      } else {
        title = 'Zon helpt mee';
        sub = `${share}% van het verbruik is zonnestroom`;
      }
    } else {
      accent = 'var(--grid)'; icon = 'mdi:transmission-tower-import';
      title = 'Stroom van het net';
      sub = this._sun && this._sun.night ? 'de zon is onder' : 'te weinig zon op de panelen';
    }
    e.energy.style.setProperty('--accent', accent);
    if (e.eicon.getAttribute('icon') !== icon) e.eicon.setAttribute('icon', icon);
    e.etitle.textContent = title;
    e.esub.textContent = sub;

    const score = num(h, c.score);
    const sc = num(h, c.self_consumption);
    const pr = num(h, c.price);
    e.score.style.setProperty('--sc', scoreColor(score));
    e.snum.textContent = score == null ? '–' : Math.round(score);
    const sicon = score == null || score < 45 ? 'mdi:leaf-off' : 'mdi:leaf';
    if (e.sicon.getAttribute('icon') !== sicon) e.sicon.setAttribute('icon', sicon);
    e['p-sc'].textContent = sc == null ? 'nog geen zon' : `${Math.round(sc)}%`;
    e['p-pr'].textContent = pr == null ? 'nog te weinig' : `${Math.round(pr)}%`;
    e['pb-sc'].style.width = `${sc ?? 0}%`;
    e['pb-pr'].style.width = `${pr ?? 0}%`;

    const sT = num(h, c.solar_today);
    const iT = num(h, c.import_today);
    const xT = num(h, c.export_today);
    const use = sT != null && iT != null && xT != null ? sT - xT + iT : null;
    const chips = [
      ['mdi:home-lightning-bolt', 'var(--home)', `${fmt(use)} kWh`, 'verbruikt'],
      ['mdi:transmission-tower-import', 'var(--grid)', `${fmt(iT)} kWh`, 'van het net'],
      ['mdi:transmission-tower-export', 'var(--export)', `${fmt(xT)} kWh`, 'teruggeleverd'],
      ['mdi:fire', 'var(--heat)', `${fmt(num(h, c.gas_today), 2)} m³`, 'gas'],
      ['mdi:leaf', 'var(--export)', sc == null ? '–' : `${Math.round(sc)}%`, 'zon zelf gebruikt'],
      ['mdi:cash', 'var(--muted)', `€ ${fmt(num(h, c.cost_today), 2)}`, 'kosten'],
    ];
    this._set('chips', e.chips, chips
      .map(([i, col, v, l]) => `<div class="chip" style="--ic:${col}"><ha-icon icon="${i}"></ha-icon><div><b>${v}</b><span>${l}</span></div></div>`)
      .join(''));
  }

  async _loadHistory() {
    if (this._loading || !this._hass.callWS) return;
    this._loading = true;
    this._histAt = Date.now();
    try {
      const end = new Date();
      const start = new Date(end.getTime() - this._c.graph_hours * 3600 * 1000);
      const ids = [this._c.solar, this._c.house];
      const res = await this._hass.callWS({
        type: 'history/history_during_period',
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        entity_ids: ids,
        minimal_response: true,
        no_attributes: true,
        significant_changes_only: false,
      });
      const series = ids.map((id) => (res[id] || []).map((p) => [(p.lu ?? p.lc) * 1000, parseFloat(p.s)]));
      this._graph(start.getTime(), end.getTime(), series);
    } catch (err) {
      console.warn('homelab-ambient-panel: history failed', err);
    } finally {
      this._loading = false;
    }
  }

  _graph(t0, t1, [solarPts, housePts]) {
    const N = 72; // 10-minute buckets over 12 hours
    const bucket = (pts) => {
      const out = [];
      let j = 0;
      let last = 0;
      for (let b = 0; b < N; b++) {
        const end = t0 + ((b + 1) * (t1 - t0)) / N;
        let sum = 0;
        let n = 0;
        while (j < pts.length && pts[j][0] <= end) {
          const v = Number.isNaN(pts[j][1]) ? 0 : pts[j][1];
          sum += v;
          n += 1;
          last = v;
          j += 1;
        }
        out.push(n ? sum / n : last);
      }
      return out;
    };
    const solar = bucket(solarPts);
    const house = bucket(housePts);
    const peak = Math.max(500, ...solar, ...house);
    const x = (b) => ((b / (N - 1)) * 352).toFixed(1);
    const y = (v) => (37 - (Math.max(v, 0) / peak) * 34).toFixed(1);
    const line = (vals) => vals.map((v, b) => `${b ? 'L' : 'M'}${x(b)} ${y(v)}`).join('');
    this._el['g-solar'].setAttribute('d', `${line(solar)}L352 37L0 37Z`);
    this._el['g-house'].setAttribute('d', line(house));
    this._el['g-peak'].textContent = `· piek ${power(Math.max(...solar, ...house))}`;
  }

  _rooms() {
    const h = this._hass;
    const rows = this._c.rooms
      .map(({ entity, name }) => {
        const s = h.states[entity];
        if (!s) return '';
        const a = s.attributes;
        const tgt = this._target(entity);
        const off = s.state === 'off' || tgt == null;
        const heating = a.hvac_action === 'heating';
        const status = heating
          ? '<ha-icon icon="mdi:fire"></ha-icon>verwarmt'
          : off ? 'uit' : a.current_humidity != null ? `${Math.round(a.current_humidity)}% vocht` : '';
        return `<div class="room${heating ? ' heat' : ''}">
          <div class="rname press" data-act="info" data-entity="${entity}"><b>${name || a.friendly_name}</b><span>${status}</span></div>
          <div class="cur">${fmt(a.current_temperature, 1)}°</div>
          <div class="ctl">
            <button class="press" data-act="climate" data-entity="${entity}" data-dir="-1"${off ? ' disabled' : ''} aria-label="lager">−</button>
            <div class="tgt${this._pendingTemp[entity] ? ' pend' : ''}">${off ? 'uit' : `${fmt(tgt, 1)}°`}</div>
            <button class="press" data-act="climate" data-entity="${entity}" data-dir="1"${off ? ' disabled' : ''} aria-label="hoger">+</button>
          </div></div>`;
      })
      .join('');
    this._set('rooms', this._el.rooms, rows);
    const w = h.states[this._c.hot_water];
    const won = w && w.state !== 'off';
    this._el.water.classList.toggle('on', !!won);
    this._set('water', this._el.water, w ? `<ha-icon icon="mdi:water-boiler"></ha-icon>Warm water ${won ? 'aan' : 'uit'}` : '');
    const out = num(h, this._c.outdoor);
    this._el.outdoor.textContent = out == null ? '' : `buiten ${fmt(out, 1)}°`;
  }

  _lights() {
    const h = this._hass;
    let on = 0;
    const tiles = this._c.lights
      .map(({ entity, name }) => {
        const s = h.states[entity];
        const st = this._lightState(entity);
        const isOn = st === 'on';
        if (isOn) on += 1;
        const na = !s || st === 'unavailable';
        const bri = s && isOn && s.attributes.brightness != null && !this._pendingLight[entity] ? Math.round(s.attributes.brightness / 2.55) : null;
        const label = na ? 'onbereikbaar' : isOn ? (bri != null ? `aan · ${bri}%` : 'aan') : 'uit';
        return `<button class="lt press${isOn ? ' on' : ''}${this._pendingLight[entity] ? ' pend' : ''}" data-act="light" data-entity="${entity}"${na ? ' disabled' : ''}>
          <span class="i"><ha-icon icon="mdi:${isOn ? 'lightbulb-on' : 'lightbulb-outline'}"></ha-icon></span>
          <span style="min-width:0"><b>${name}</b><small>${label}</small></span></button>`;
      })
      .join('');
    this._set('lights', this._el.lgrid, tiles);
    this._el.lcount.textContent = on ? `${on} aan` : 'alles uit';
  }
}

customElements.define('homelab-ambient-panel', HomelabAmbientPanel);
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'homelab-ambient-panel',
  name: 'Homelab ambient panel',
  description: 'Full-screen home screen for the Nest Hub (put it in a panel view)',
});
