// Full-screen ambient home screen for the Nest Hub: one custom element in a panel view
// (homeassistant/dashboards/nest_hub.yaml), no Home Assistant cards and no dependencies.
// Designed at 1024 x 600 (the Nest Hub) and scaled to fit any other screen.
//
// A looping carousel of full-screen slides, each showing one subject in large type so it reads from across
// the room. A bar at the bottom shows the time and has a button per slide; swipe left / right to step.
// The carousel advances on its own every `rotate` seconds and pauses for `resume_after` seconds after a touch.
//
//   background   live sky: colour follows the real sun elevation, glow where the sun is, stars at night,
//                drifting clouds by weather condition, falling rain when the radar says it rains now
//   Nu           big clock, weather now (animated icon, moon phase, wind in Bft), day arc, rain and solar summary
//   Energie      animated solar / grid / house flow, the energy score (last 24 h) with its two parts, and the
//                dynamic electricity price per hour (today, from 18:00 until 18:00 tomorrow) with the cheapest
//                block marked
//   Vandaag      one 24-hour graph: solar vs house power (left axis), the energy score over the preceding 24 hours
//                with its two parts (right axis) and the dynamic price per hour as tinted bars behind; today's totals
//   Verleden     the last 7 days: fixed vs dynamic contract (since the start and per day), the energy score per
//                day with its two parts, and usage per day (solar, import, export, gas)
//   Weer         forecast for the next 12 hours and the next days (weather entity, subscribed over the websocket),
//                and the rain next 2 hours (Buienradar / KNMI radar) as a graph at the bottom
//   Klimaat      all Tado rooms with big - / + (debounced, Tado has API limits), hot water, and gas use
//                per hour (last 24 h) and per day (last 7 days) from the recorder's long-term statistics; a row
//                for the airco downstairs with power, an AUTO toggle (heat on solar surplus,
//                packages/solar_heating.yaml) and - / + for its target
//   Lampen       lights and scenes
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
  gas: 'sensor.gas_meter_gas_consumption', // meter reading (m³), its long-term statistics feed the gas graph
  gas_price: 1.51574, // EUR per m³ incl. VAT, fixed contract (packages/energy_contract.yaml)
  // Dynamic electricity prices: EnergyZero market prices (yesterday - tomorrow) and the all-in formula of
  // sensor.dynamic_electricity_price in packages/energy_contract.yaml: (market + markup) x VAT + energy tax.
  prices: 'sensor.energyzero_electricity_prices',
  price_now: 'sensor.dynamic_electricity_price',
  price_markup: 0.02,
  price_vat: 1.21,
  price_tax: 0.11085,
  price_evening: 18, // price graph: today 00-24 until this hour, then this hour to the same hour tomorrow
  cheap_hours: 3, // length of the cheapest block marked in the price graph
  // Energy score over the last 24 hours, from the recorder's 5-minute statistics of these totals.
  solar_total: 'sensor.6fz463602f_generated_energy_total',
  import_total: 'sensor.electricity_import_total',
  export_total: 'sensor.electricity_export_total',
  // Verleden: cost on both contracts (packages/energy_contract.yaml, counted from contract_since), days shown.
  fixed_total: 'sensor.fixed_contract_total_cost',
  dynamic_total: 'sensor.dynamic_contract_total_cost',
  contract_since: '2026-11-21',
  past_days: 7,
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
  // Airco row on Klimaat (null hides it). `auto` switches the solar surplus heating on/off; while that has the
  // airco on (`active`), - / + change `target` (the automation passes it on), otherwise the airco's own setpoint.
  airco: {
    entity: 'climate.airco_beneden',
    name: 'Airco beneden',
    auto: 'input_boolean.solar_heating_enabled',
    active: 'input_boolean.solar_heating_active',
    target: 'input_number.solar_heating_target',
  },
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
  graph_hours: 24,
  forecast_hours: 12, // Weer: hours in the hourly row
  temp_step: 0.5,
  // carousel
  start: 'nu', // slide shown first
  rotate: 20, // seconds per slide, 0 = no auto-rotation
  resume_after: 90, // seconds without a touch before the rotation continues
  rotate_slides: ['nu', 'energie', 'vandaag', 'verleden', 'weer', 'klimaat'], // Lampen only by button or swipe
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
// Energy score parts, see _loadScore. Self consumption from solar and export (kWh); price timing from the import
// (kWh), what it cost at the hour prices (EUR) and the hour prices in the period.
const selfUse = (so, ex) => (so >= 0.1 ? clamp(((so - ex) / so) * 100, 0, 100) : null);
function priceTiming(kwh, cost, prices) {
  if (kwh < 0.2 || !prices.length) return null;
  const hi = Math.max(...prices);
  const lo = Math.min(...prices);
  return clamp(50 + (100 * ((hi + lo) / 2 - cost / kwh)) / Math.max(hi - lo, 0.03), 0, 100);
}
const avgOf = (vals) => {
  const v = vals.filter((x) => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
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

// ── Slides: order is the loop order; `ac` colours the active button ─────────────────────────────
const SLIDES = [
  { id: 'nu', name: 'Nu', icon: 'mdi:clock-outline', ac: '#ffd56b' },
  { id: 'energie', name: 'Energie', icon: 'mdi:lightning-bolt', ac: '#3fd68f' },
  { id: 'vandaag', name: 'Vandaag', icon: 'mdi:chart-areaspline', ac: '#5aaeff' },
  { id: 'verleden', name: 'Verleden', icon: 'mdi:history', ac: '#c3a6ff' },
  { id: 'weer', name: 'Weer', icon: 'mdi:weather-partly-rainy', ac: '#6fb8ff' },
  { id: 'klimaat', name: 'Klimaat', icon: 'mdi:thermostat', ac: '#ff8a4c' },
  { id: 'lampen', name: 'Lampen', icon: 'mdi:lightbulb-group', ac: '#ffc46b' },
];
const GW = 940; // graph viewBox
const GH = 200;
const gy = (f) => GH - 2 - f * (GH - 14); // graph y of a fraction of the axis (0 = bottom, 1 = top guide)

// ── Styles ──────────────────────────────────────────────────────────────────────────────────────
const STYLE = `
:host { display: block; position: relative; overflow: hidden; height: calc(100vh - var(--header-height, 56px));
  min-height: 320px; background: #05070f; color: var(--text); user-select: none; -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent; -webkit-font-smoothing: antialiased;
  font-family: Outfit, Roboto, 'Segoe UI', system-ui, sans-serif;
  --solar: #ffb938; --grid: #a98bff; --export: #3fd68f; --home: #5aaeff; --heat: #ff8a4c; --rain: #6fb8ff;
  --text: #f4f6fb; --muted: rgba(232, 238, 255, .66); --faint: rgba(232, 238, 255, .13);
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
.stage { position: absolute; left: 50%; top: 50%; width: ${W}px; height: ${H}px;
  transform: translate(-50%, -50%) translate(var(--sx, 0px), var(--sy, 0px)) scale(var(--k, 1));
  transition: transform 3s ease-in-out; }
.glass { background: var(--glass); border: 1px solid var(--edge); border-radius: 26px; position: relative; }
.press { transition: transform .15s, background .4s, border-color .4s; }
.press:active { transform: scale(.97); }
.label { font-size: 15px; font-weight: 500; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }

/* carousel */
.slides { position: absolute; left: 0; top: 0; width: ${W}px; height: 512px; overflow: hidden; touch-action: none; }
.slide { position: absolute; inset: 0; padding: 22px 24px 4px; display: flex; flex-direction: column; gap: 14px;
  visibility: hidden; transform: translate3d(100%, 0, 0); will-change: transform;
  transition: transform .65s cubic-bezier(.2, .8, .2, 1); }
.slide.on { visibility: visible; }
.shead { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; padding: 0 6px; flex: none; }
.shead h2 { margin: 0; font-size: 32px; font-weight: 300; letter-spacing: -.01em; }
.shead > span { font-size: 19px; color: var(--muted); display: flex; align-items: center; gap: 14px; white-space: nowrap; }
.shead ha-icon { --mdc-icon-size: 21px; margin-right: 4px; }

/* bottom bar */
.nav { position: absolute; left: 16px; right: 16px; bottom: 12px; height: 76px; display: flex; align-items: center;
  gap: 6px; padding: 0 8px 0 20px; border-radius: 28px; background: rgba(7, 11, 26, .62); border: 1px solid var(--edge); }
.ntime { font-size: 34px; font-weight: 300; font-variant-numeric: tabular-nums; min-width: 104px; letter-spacing: -.01em; }
.nb { flex: 1; height: 62px; border-radius: 22px; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 3px; color: var(--muted); position: relative; overflow: hidden;
  transition: background .4s, color .4s, transform .15s; }
.nb:active { transform: scale(.94); }
.nb ha-icon { --mdc-icon-size: 27px; transition: color .4s; }
.nb span { font-size: 15.5px; font-weight: 500; }
.nb.on { background: rgba(255, 255, 255, .13); color: var(--text); }
.nb.on ha-icon { color: var(--ac); }
.nb::after { content: ''; position: absolute; left: 24%; right: 24%; bottom: 4px; height: 3px; border-radius: 2px;
  background: var(--ac); opacity: 0; transform: scaleX(0); transform-origin: left; }
.nb.on.run::after { opacity: .9; animation: prog var(--rot, 20s) linear forwards; }
.nb.on.hold::after { opacity: .35; transform: scaleX(1); }
@keyframes prog { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.bd { position: absolute; display: none; top: 7px; left: calc(50% + 9px); width: 11px; height: 11px; border-radius: 6px;
  background: var(--bc, var(--ac)); box-shadow: 0 0 10px var(--bc, var(--ac)); font-style: normal; }
.bd.dot { display: block; }
.bd.n { display: block; width: auto; min-width: 21px; height: 21px; top: 2px; padding: 0 6px; border-radius: 11px;
  font-size: 13px; font-weight: 600; line-height: 21px; text-align: center; color: #0b0f1e; box-shadow: none; }

/* ── Nu ── */
.nu { flex: 1; display: grid; grid-template-columns: 1fr 404px; gap: 20px; min-height: 0; }
.nleft { display: flex; flex-direction: column; justify-content: center; padding-left: 8px; min-width: 0; }
.greet { font-size: 24px; color: var(--muted); display: flex; align-items: center; gap: 10px; }
.greet .off { width: 12px; height: 12px; border-radius: 50%; background: #ff6b6b; display: none; }
.greet .off.on { display: inline-block; }
.time { font-size: 176px; font-weight: 200; line-height: .9; letter-spacing: -.045em; margin-left: -8px;
  font-variant-numeric: tabular-nums; text-shadow: 0 6px 40px rgba(0, 0, 0, .3); white-space: nowrap; }
.time .c { animation: colon 2s ease-in-out infinite; }
@keyframes colon { 50% { opacity: .3; } }
.date { font-size: 30px; font-weight: 300; color: var(--muted); margin-top: 12px; }
.nweather { padding: 18px 22px 14px; display: flex; flex-direction: column; min-height: 0; }
.wrow { display: flex; align-items: center; gap: 12px; }
.wicon { width: 112px; height: 112px; flex: none; margin: -10px -4px -10px -10px; }
.wicon svg { width: 100%; height: 100%; overflow: visible; }
.temp { font-size: 88px; font-weight: 200; line-height: 1; letter-spacing: -.03em; }
.cond { font-size: 23px; margin-top: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wmeta { display: flex; gap: 22px; font-size: 19px; color: var(--muted); margin-top: 6px; white-space: nowrap; }
.wmeta ha-icon { --mdc-icon-size: 21px; vertical-align: -4px; margin-right: 5px; opacity: .85; }
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
.arc { margin-top: auto; }
.arc svg { display: block; width: 100%; height: auto; overflow: visible; }
.arc .hz { stroke: var(--faint); stroke-width: 1; }
.arc .bg { fill: none; stroke: rgba(255, 255, 255, .18); stroke-width: 1.5; stroke-dasharray: 2 5; stroke-linecap: round; }
.arc .fg { fill: none; stroke: url(#arcg); stroke-width: 2.5; stroke-linecap: round; }
.arc .dot { fill: #ffd56b; } .arc .glw { fill: rgba(255, 205, 90, .22); }
.arcl { display: flex; justify-content: space-between; font-size: 17px; color: var(--muted); margin-top: 4px; white-space: nowrap; }
.arcl ha-icon { --mdc-icon-size: 19px; vertical-align: -3px; margin-right: 3px; }
.strip { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; height: 124px; flex: none; }
.tile { padding: 14px 16px 14px 18px; display: flex; align-items: center; gap: 14px; min-width: 0; text-align: left; }
.tile .ti { --mdc-icon-size: 40px; color: var(--ti, var(--rain)); flex: none; }
.tile .tt { flex: 1; min-width: 0; }
.tile b { display: block; font-size: 24px; font-weight: 500; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tile b em { font-style: normal; font-size: 17px; font-weight: 400; color: var(--muted); }
.tile small { display: block; font-size: 16.5px; color: var(--muted); margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vleg { display: flex; gap: 16px; font-size: 13.5px; color: var(--muted); margin-bottom: 4px; }
.vleg i { display: inline-block; width: 14px; height: 3px; border-radius: 2px; margin-right: 6px; vertical-align: 4px; }
.hbar { height: 9px; border-radius: 5px; background: rgba(255, 255, 255, .1); overflow: hidden; margin-top: 8px; }
.hbar i { display: block; height: 100%; width: 0; border-radius: 5px; background: linear-gradient(90deg, #ff9a3c, #ffd56b);
  transition: width 1.5s ease; }

/* ── Energie ── */
.ehead { display: flex; align-items: center; gap: 16px; padding: 0 6px; flex: none; }
.ebadge { width: 58px; height: 58px; border-radius: 50%; flex: none; display: grid; place-items: center; color: #0b0f1e;
  background: var(--accent); transition: background 1s; box-shadow: 0 0 28px color-mix(in srgb, var(--accent) 45%, transparent); }
.ebadge ha-icon { --mdc-icon-size: 32px; }
.etitle { font-size: 34px; font-weight: 400; line-height: 1.1; color: var(--accent); transition: color 1s; }
.esub { font-size: 19px; color: var(--muted); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ebody { flex: 1; display: grid; grid-template-columns: 458px 1fr; gap: 18px; min-height: 0; align-items: center; }
.fwrap { position: relative; width: 458px; height: 328px; }
.flow { position: absolute; left: 0; top: 0; width: 352px; height: 252px; transform: scale(1.3); transform-origin: 0 0; }
.eright { align-self: stretch; display: flex; flex-direction: column; gap: 12px; min-height: 0; margin-bottom: 8px; }
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
.mid { position: absolute; left: 176px; top: 102px; transform: translateX(-50%); text-align: center; }
.mid b { display: block; font-size: 36px; font-weight: 300; line-height: 1; letter-spacing: -.01em; }
.mid span { font-size: 11.5px; color: var(--muted); }
.escore { padding: 14px 20px 14px; text-align: left; flex: none; }
.srow { display: flex; align-items: center; gap: 20px; margin-top: 4px; }
.sbig { display: flex; align-items: center; gap: 6px; color: var(--sc); transition: color 1s; flex: none; }
.sbig ha-icon { --mdc-icon-size: 36px; }
.sbig b { font-size: 64px; font-weight: 300; line-height: 1; letter-spacing: -.03em; }
.prows { flex: 1; display: flex; flex-direction: column; gap: 9px; min-width: 0; }
.prow > div:first-child { display: flex; justify-content: space-between; align-items: baseline; font-size: 16px; white-space: nowrap; }
.prow b { font-size: 18px; font-weight: 500; }
.prow .hbar { margin-top: 4px; height: 7px; }
.eprice { flex: 1; min-height: 0; padding: 14px 20px 10px; display: flex; flex-direction: column; text-align: left; }
.pbig { display: flex; align-items: baseline; gap: 10px; white-space: nowrap; margin-top: 2px; }
.pbig b { font-size: 40px; font-weight: 300; line-height: 1.05; color: var(--pc, var(--text)); }
.pbig span { font-size: 16px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; }
.pcheap { color: var(--export); }
.pbars { flex: 1; min-height: 0; display: flex; align-items: flex-end; gap: 2px; margin-top: 8px; position: relative;
  border-bottom: 1px solid var(--faint); }
.pbars i { flex: 1; min-height: 3px; border-radius: 3px 3px 0 0; background: var(--bc); position: relative; z-index: 1;
  transition: height 1s ease; }
.pbars i.past { opacity: .3; }
.pbars i.now { box-shadow: 0 0 0 2px #fff; }
.pbars i.na { background: rgba(255, 255, 255, .08); height: 3px !important; }
.pbars .cheap { position: absolute; top: -4px; bottom: 0; border-radius: 8px 8px 0 0; background: rgba(63, 214, 143, .13);
  border: 1px solid rgba(63, 214, 143, .45); border-bottom: 0; }
.pbars .cheap span { position: absolute; left: 50%; top: 3px; transform: translateX(-50%); font-size: 13px; font-weight: 600;
  color: var(--export); white-space: nowrap; }

/* ── Vandaag ── */
.legend i { display: inline-block; width: 11px; height: 11px; border-radius: 50%; margin: 0 6px 0 4px; }
.gcard { flex: 1; min-height: 0; padding: 16px 18px 10px; display: flex; flex-direction: column; }
.gcard .vleg { flex: none; margin: 0 46px 6px; gap: 18px; font-size: 14.5px; }
.gcard .vleg em { font-style: normal; margin-left: auto; }
.gplot { flex: 1; min-height: 0; position: relative; margin: 0 46px; }
.gplot svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; overflow: visible; }
.gy { position: absolute; top: 0; bottom: 0; width: 42px; font-size: 13.5px; }
.gy span { position: absolute; transform: translateY(-50%); white-space: nowrap; }
.gy.l { left: -46px; text-align: right; color: var(--muted); } .gy.l span { right: 0; }
.gy.r { right: -46px; color: var(--sc, var(--muted)); } .gy.r span { left: 0; }
.g-price rect { opacity: .13; }
.vleg i.dash { background: repeating-linear-gradient(90deg, var(--dc) 0 3px, transparent 3px 6px) !important; }
.g-score { fill: none; stroke: var(--sc, var(--muted)); stroke-width: 3.5; stroke-linejoin: round; stroke-linecap: round; }
.g-part { fill: none; stroke-width: 2; stroke-dasharray: 2 5; stroke-linecap: round; opacity: .85; }
.g-part.sc { stroke: var(--solar); }
.g-part.pr { stroke: var(--grid); }
.vsn { color: var(--muted); } .vsn b { font-size: 30px; font-weight: 400; color: var(--sc, var(--muted)); margin-left: 4px; }
.g-solar { fill: url(#gsolar); stroke: var(--solar); stroke-width: 2.5; }
.g-house { fill: none; stroke: var(--home); stroke-width: 3; }
.g-hpeak { fill: var(--home); opacity: .28; }
.g-base { stroke: var(--faint); stroke-width: 1; }
.g-guide { stroke: rgba(255, 255, 255, .07); stroke-width: 1; stroke-dasharray: 3 6; }
.gaxis { display: flex; justify-content: space-between; font-size: 16px; color: var(--muted); margin: 6px 46px 0; }
.chips { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; flex: none; }
.chip { background: var(--glass); border: 1px solid var(--edge); border-radius: 20px; padding: 10px 12px; display: flex;
  align-items: center; gap: 10px; min-width: 0; }
.chip ha-icon { --mdc-icon-size: 26px; color: var(--ic); flex: none; }
.chip b { font-size: 24px; font-weight: 400; display: block; white-space: nowrap; line-height: 1.15; }
.chip span { font-size: 15px; color: var(--muted); display: block; white-space: nowrap; }

/* ── Verleden ── */
.ptop { display: grid; grid-template-columns: 372px 1fr; gap: 14px; height: 218px; flex: none; }
.pcard { padding: 14px 20px 10px; display: flex; flex-direction: column; text-align: left; min-width: 0; min-height: 0; }
.pcard .vleg { margin: 0; }
.cbig { display: flex; align-items: baseline; gap: 10px; margin-top: 2px; white-space: nowrap; }
.cbig b { font-size: 44px; font-weight: 300; line-height: 1.05; color: var(--cc, var(--text)); }
.cbig span { font-size: 18px; color: var(--cc, var(--muted)); }
.csub { font-size: 15px; color: var(--muted); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cdays { flex: 1; min-height: 0; display: flex; gap: 4px; margin-top: 6px; }
.cdays > div, .sdays > div { flex: 1; display: flex; flex-direction: column; align-items: center; min-width: 0; }
.cz { flex: 1; width: 100%; position: relative; }
.cz::before { content: ''; position: absolute; left: -2px; right: -2px; top: 50%; border-top: 1px solid var(--faint); }
.cz i { position: absolute; left: 20%; right: 20%; min-height: 2px; background: var(--bc); transition: height 1s ease; }
.cz i.up { bottom: 50%; border-radius: 4px 4px 0 0; }
.cz i.dn { top: 50%; border-radius: 0 0 4px 4px; }
.cdays em, .sdays em { font-style: normal; font-size: 12.5px; color: var(--muted); white-space: nowrap; }
.cdays span, .sdays span, .ufoot span { font-size: 14px; color: var(--muted); margin-top: 3px; white-space: nowrap; }
.cdays .now span, .sdays .now span, .ufoot .now { color: var(--text); font-weight: 500; }
.sdays { flex: 1; min-height: 0; display: flex; gap: 10px; margin-top: 8px; }
.sdays b { font-size: 23px; font-weight: 400; line-height: 1.1; color: var(--sc); }
.sbars { flex: 1; min-height: 0; width: 100%; display: flex; align-items: flex-end; justify-content: center; gap: 3px;
  border-bottom: 1px solid var(--faint); margin-top: 3px; }
.sbars i { width: 22%; min-height: 2px; border-radius: 4px 4px 0 0; transition: height 1s ease; }
.sbars .t { width: 40%; background: var(--sc); }
.sbars .s { background: var(--solar); opacity: .8; }
.sbars .p { background: var(--grid); opacity: .8; }
.puse { flex: 1; }
.udays { flex: 1; min-height: 0; display: flex; gap: 16px; margin-top: 6px; }
.udays > div { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.ubars { flex: 1; min-height: 0; display: flex; gap: 4px; border-bottom: 1px solid var(--faint); }
.ubars > div { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; min-width: 0; }
.ubars em { font-style: normal; font-size: 12.5px; color: var(--muted); white-space: nowrap; margin-bottom: 2px; }
.ubars i { width: 100%; min-height: 2px; border-radius: 4px 4px 0 0; background: var(--bc); transition: height 1s ease; }
.ufoot { display: flex; justify-content: space-between; align-items: baseline; }
.ufoot em { font-style: normal; font-size: 14px; color: var(--heat); white-space: nowrap; }

/* ── Weer ── */
.wcard { padding: 12px 20px 10px; display: flex; flex-direction: column; text-align: left; min-height: 0; }
.fh { height: 150px; flex: none; }
.fd { height: 154px; flex: none; }
.wnow { font-size: 17px; color: var(--muted); }
.fcols { flex: 1; min-height: 0; display: flex; margin-top: 4px; }
.fcols > div { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: space-between;
  white-space: nowrap; }
.fcols > div + div { border-left: 1px solid rgba(255, 255, 255, .05); }
.fcols svg { width: 50px; height: 50px; overflow: visible; display: block; }
.fcols svg * { animation: none !important; }
.fcols em { font-style: normal; font-size: 16px; color: var(--muted); }
.fcols .now em { color: var(--text); font-weight: 500; }
.fcols b { font-size: 27px; font-weight: 300; line-height: 1; }
.fcols b small { font-size: 19px; color: var(--muted); margin-left: 6px; }
.fcols .mm { font-size: 14px; color: var(--rain); min-height: 17px; }
.fd .fcols svg { width: 44px; height: 44px; }
.trng { flex: none; width: 64%; height: 5px; border-radius: 3px; background: rgba(255, 255, 255, .09); position: relative; }
.trng i { position: absolute; top: 0; bottom: 0; border-radius: 3px; background: linear-gradient(90deg, #6fb8ff, #ffb938); }
.rcard { flex: 1; min-height: 0; padding: 12px 20px 8px; display: flex; flex-direction: column; text-align: left; }
.rtop2 { display: flex; align-items: center; gap: 12px; white-space: nowrap; }
.rtop2 ha-icon { --mdc-icon-size: 26px; color: var(--ri, var(--rain)); }
.rtitle { font-size: 20px; font-weight: 500; color: var(--ri, var(--rain)); }
.rsub { font-size: 16px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; }
.bars { flex: 1; min-height: 0; display: flex; align-items: flex-end; gap: 3px; border-bottom: 1px solid var(--faint);
  position: relative; padding-right: 56px; margin-top: 8px; }
.bars u { position: absolute; left: 0; right: 0; border-top: 1px dashed rgba(255, 255, 255, .1); text-decoration: none; }
.bars u::after { content: attr(data-l); position: absolute; right: 0; top: -9px; font-size: 13px; color: var(--muted); }
.bars i { flex: 1; border-radius: 4px 4px 0 0; min-height: 3px; background: linear-gradient(180deg, #8fd0ff, #3d8fe0);
  transition: height 1s ease; }
.bars i.dry { background: rgba(255, 255, 255, .12); }
.raxis { display: flex; justify-content: space-between; font-size: 14px; color: var(--muted); margin-top: 3px; padding-right: 56px; }

/* ── Klimaat ── */
.kbody { flex: 1; display: grid; grid-template-columns: 1fr 392px; gap: 14px; min-height: 0; }
.rlist { display: grid; grid-auto-rows: minmax(0, 1fr); gap: 8px; min-height: 0; }
.room { padding: 4px 10px 4px 22px; border-radius: 22px; display: grid; grid-template-columns: 1fr auto auto; align-items: center;
  gap: 14px; min-width: 0; transition: background 1s, border-color 1s; }
.room.heat { background: linear-gradient(100deg, rgba(255, 138, 76, .3), rgba(255, 138, 76, .05) 70%), var(--glass);
  border-color: rgba(255, 138, 76, .35); }
.rtop { text-align: left; min-width: 0; }
.rtop b { display: block; font-size: 23px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rtop span { display: flex; align-items: center; gap: 5px; font-size: 16px; color: var(--muted); margin-top: 1px; }
.rtop ha-icon { --mdc-icon-size: 18px; }
.heat .rtop span { color: var(--heat); }
.cur { font-size: 44px; font-weight: 200; line-height: 1; letter-spacing: -.03em; white-space: nowrap; }
.heat .cur { color: var(--heat); }
.ctl { display: flex; align-items: center; gap: 4px; }
.ctl button { width: 50px; height: 50px; border-radius: 50%; font-size: 32px; font-weight: 300; line-height: 1;
  background: rgba(255, 255, 255, .1); border: 1px solid var(--edge); display: grid; place-items: center; }
.ctl button:active { background: rgba(90, 174, 255, .45); }
.ctl button:disabled { opacity: .25; }
.tgt { min-width: 72px; text-align: center; font-size: 23px; transition: color .3s; }
.tgt small { display: block; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.tgt.pend { color: var(--home); font-weight: 600; }
.gas { padding: 16px 20px 12px; display: flex; flex-direction: column; text-align: left; min-height: 0; }
.gtop { display: flex; align-items: baseline; justify-content: space-between; }
.gbig { display: flex; align-items: baseline; gap: 10px; margin-top: 2px; white-space: nowrap; }
.gbig b { font-size: 46px; font-weight: 300; line-height: 1.05; color: var(--heat); }
.gbig span { font-size: 17px; color: var(--muted); }
.gsub { font-size: 14px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); margin-top: 10px; }
.gh { height: 88px; display: flex; align-items: flex-end; gap: 2px; margin-top: 6px; border-bottom: 1px solid var(--faint); }
.gh i { flex: 1; min-height: 2px; border-radius: 3px 3px 0 0; background: linear-gradient(180deg, #ffb27a, #e8642c);
  transition: height 1s ease; }
.gh i.z { background: rgba(255, 255, 255, .12); }
.ghx { display: flex; justify-content: space-between; font-size: 14px; color: var(--muted); margin-top: 4px; }
.gd { flex: 1; min-height: 0; display: flex; gap: 8px; margin-top: 6px; }
.gd > div { flex: 1; display: flex; flex-direction: column; align-items: center; min-width: 0; }
/* The bar area on its own, so the bar height is a share of it and not of the column with the labels. */
.gd b { flex: 1; min-height: 0; width: 100%; position: relative; margin-top: 20px; border-bottom: 1px solid var(--faint); }
.gd em { position: absolute; left: 0; right: 0; bottom: calc(var(--h) + 3px); text-align: center; font-style: normal;
  font-size: 14px; color: var(--muted); white-space: nowrap; transition: bottom 1s ease; }
.gd i { position: absolute; left: 0; right: 0; bottom: 0; height: var(--h); min-height: 2px; border-radius: 5px 5px 0 0;
  background: rgba(255, 138, 76, .45); transition: height 1s ease; }
.gd .now i { background: linear-gradient(180deg, #ffb27a, #e8642c); }
.gd .now em, .gd .now span { color: var(--text); }
.gd span { font-size: 15px; color: var(--muted); margin-top: 4px; }
#water.on ha-icon { color: var(--heat); }
.room.ac { grid-template-columns: 1fr auto auto auto; }
.room.ac.heat .rtop span { color: var(--heat); }
.acb { height: 50px; border-radius: 25px; background: rgba(255, 255, 255, .1); border: 1px solid var(--edge);
  display: grid; place-items: center; color: var(--muted); transition: background .3s, color .3s, border-color .3s; }
.acb ha-icon { --mdc-icon-size: 26px; }
.acb.pwr { width: 50px; }
.acb.auto { padding: 0 14px; font-size: 17px; font-weight: 600; letter-spacing: .08em; }
.acb.on { background: rgba(255, 138, 76, .85); border-color: rgba(255, 178, 122, .9); color: #2a1200; }
.acb.auto.on { background: rgba(255, 210, 90, .85); border-color: rgba(255, 228, 140, .9); color: #2a1f00; }
.acb.pend { opacity: .6; }
.acb:disabled { opacity: .25; }

/* ── Lampen ── */
.lgrid { flex: 1; display: grid; gap: 14px; min-height: 0; }
.lt { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 14px 10px;
  text-align: center; min-width: 0; }
.lt .i { width: 90px; height: 90px; border-radius: 50%; display: grid; place-items: center; flex: none; margin-bottom: 6px;
  background: rgba(255, 255, 255, .08); color: var(--muted); transition: all .5s; }
.lt .i ha-icon { --mdc-icon-size: 48px; }
.lt b { display: block; max-width: 100%; font-size: 23px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lt small { display: block; font-size: 17px; color: var(--muted); }
.lt.on { background: linear-gradient(160deg, rgba(255, 196, 107, .34), rgba(255, 196, 107, .07)), var(--glass);
  border-color: rgba(255, 196, 107, .4); }
.lt.on .i { background: #ffc46b; color: #2a1a00; box-shadow: 0 0 36px rgba(255, 196, 107, .6); }
.lt.pend { opacity: .65; }
.lt:disabled { opacity: .35; }
.scenes { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; height: 104px; flex: none; }
.sc { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; }
.sc ha-icon { --mdc-icon-size: 34px; color: var(--muted); transition: color .3s; }
.sc span { font-size: 19px; color: var(--muted); }
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
    // The Weer slide was called Regen; keep older configs working.
    const rn = (id) => (id === 'regen' ? 'weer' : id);
    this._c.start = rn(this._c.start);
    if (Array.isArray(this._c.rotate_slides)) this._c.rotate_slides = this._c.rotate_slides.map(rn);
    this._fc = {};
    this._pendingTemp = {};
    this._tempTimers = {};
    this._pendingLight = {};
    this._pendingAc = {};
    this._cache = {};
    this._hideT = {};
    this._idx = 0;
    this._holdUntil = 0;
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
    if (!this._gasAt || Date.now() - this._gasAt > 15 * 60 * 1000) this._loadGas();
    if (!this._scoreAt || Date.now() - this._scoreAt > 5 * 60 * 1000) this._loadScore();
    if (!this._pastAt || Date.now() - this._pastAt > 15 * 60 * 1000) this._loadPast();
    if (!this._fcSubs) this._subForecast();
  }

  connectedCallback() {
    if (this._root) this._start();
    if (this._hass && !this._fcSubs) this._subForecast();
  }

  disconnectedCallback() {
    clearInterval(this._clockT);
    clearInterval(this._skyT);
    clearInterval(this._shiftT);
    clearTimeout(this._autoT);
    cancelAnimationFrame(this._rainRaf);
    this._rainRaf = null;
    if (this._ro) this._ro.disconnect();
    this._running = false;
    this._unsubForecast();
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
    const nav = SLIDES.map((s, i) => `<button class="nb" data-act="nav" data-i="${i}" style="--ac:${s.ac}">
        <ha-icon icon="${s.icon}"></ha-icon><span>${s.name}</span><em class="bd" id="bd-${s.id}"></em></button>`).join('');
    const slide = (id, html) => `<section class="slide" id="s-${id}">${html}</section>`;

    this._root = this.attachShadow({ mode: 'open' });
    this._root.innerHTML = `<style>${STYLE}</style>
      <div class="sky" id="sky"></div>
      <div class="stars">${stars}</div>
      <div class="clouds"><i></i><i></i><i></i><i></i></div>
      <canvas id="rainfx"></canvas>
      <div class="stage" id="stage" style="--rot:${c.rotate}s">
        <div class="slides" id="slides">
        ${slide('nu', `
          <div class="nu">
            <div class="nleft">
              <div class="greet"><span id="greet"></span><i class="off" id="offline" title="geen verbinding met Home Assistant"></i></div>
              <div class="time" id="time"></div>
              <div class="date" id="date"></div>
            </div>
            <div class="glass nweather press" data-act="info" data-entity="${c.weather}">
              <div class="wrow">
                <div class="wicon" id="wicon"></div>
                <div class="temp" id="temp">–</div>
              </div>
              <div class="cond" id="cond"></div>
              <div class="wmeta" id="wmeta"></div>
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
          </div>
          <div class="strip">
            <button class="glass tile press" id="nr" data-act="go" data-go="weer">
              <ha-icon class="ti" id="nr-icon" icon="mdi:weather-partly-cloudy"></ha-icon>
              <div class="tt"><b id="nr-title">Regen</b><small id="nr-sub"></small></div>
            </button>
            <button class="glass tile press" data-act="go" data-go="vandaag" style="--ti:var(--solar)">
              <ha-icon class="ti" icon="mdi:solar-power-variant"></ha-icon>
              <div class="tt"><b><span id="hnow">–</span> <em id="hfc"></em></b>
                <div class="hbar"><i id="hbar"></i></div><small id="hnext"></small></div>
            </button>
          </div>`)}

        ${slide('energie', `
          <div class="ehead" id="energy">
            <div class="ebadge"><ha-icon id="eicon"></ha-icon></div>
            <div style="min-width:0"><div class="etitle" id="etitle"></div><div class="esub" id="esub"></div></div>
          </div>
          <div class="ebody">
            <div class="fwrap"><div class="flow">
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
            </div></div>
            <div class="eright">
              <button class="glass escore press" id="score" data-act="info" data-entity="${c.score}">
                <div class="label">Energiescore · laatste 24 uur</div>
                <div class="srow">
                  <div class="sbig"><ha-icon id="sicon" icon="mdi:leaf"></ha-icon><b id="snum">–</b></div>
                  <div class="prows">
                    <div class="prow"><div><span>Eigen zon zelf gebruikt</span><b id="p-sc">–</b></div><div class="hbar"><i id="pb-sc"></i></div></div>
                    <div class="prow"><div><span>Slim getimed (prijs)</span><b id="p-pr">–</b></div><div class="hbar"><i id="pb-pr"></i></div></div>
                  </div>
                </div>
              </button>
              <button class="glass eprice press" data-act="info" data-entity="${c.price_now}">
                <div class="gtop"><span class="label">Stroomprijs dynamisch</span><span class="label pcheap" id="pr-cheap"></span></div>
                <div class="pbig"><b id="pr-now">–</b><span id="pr-sub"></span></div>
                <div class="pbars" id="pr-bars"></div>
                <div class="ghx" id="pr-x"></div>
              </button>
            </div>
          </div>`)}

        ${slide('vandaag', `
          <div class="shead"><h2>Vandaag</h2>
            <button class="vsn press" id="vs" data-act="go" data-go="energie">energiescore <b id="vs-num">–</b></button></div>
          <div class="glass gcard" id="gcard">
            <div class="vleg"><span><i style="background:var(--solar)"></i>zon</span><span><i style="background:var(--home)"></i>huis</span><span><i style="background:var(--home);opacity:.35;height:9px;vertical-align:1px"></i>piek per 5 min</span><span><i style="background:var(--sc)"></i>score</span><span><i class="dash" style="--dc:var(--solar)"></i>zon zelf gebruikt</span><span><i class="dash" style="--dc:var(--grid)"></i>slim getimed</span><span><i style="background:linear-gradient(90deg,hsl(140,70%,55%),hsl(0,70%,55%));opacity:.6;height:9px;vertical-align:1px"></i><span id="g-plab">prijs p/u</span></span><em id="g-peak"></em></div>
            <div class="gplot">
              <svg viewBox="0 0 ${GW} ${GH}" preserveAspectRatio="none">
                <defs><linearGradient id="gsolar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb938" stop-opacity=".6"/><stop offset="1" stop-color="#ffb938" stop-opacity=".04"/></linearGradient></defs>
                <g id="g-price" class="g-price"></g>
                <line class="g-guide" x1="0" y1="${gy(0.5)}" x2="${GW}" y2="${gy(0.5)}" vector-effect="non-scaling-stroke"/>
                <line class="g-guide" x1="0" y1="${gy(1)}" x2="${GW}" y2="${gy(1)}" vector-effect="non-scaling-stroke"/>
                <line class="g-base" x1="0" y1="${GH - 0.5}" x2="${GW}" y2="${GH - 0.5}" vector-effect="non-scaling-stroke"/>
                <path id="g-solar" class="g-solar" vector-effect="non-scaling-stroke"/>
                <path id="g-hpeak" class="g-hpeak"/>
                <path id="g-house" class="g-house" vector-effect="non-scaling-stroke"/>
                <g id="g-score"></g>
              </svg>
              <div class="gy l" id="gyl"></div><div class="gy r" id="gyr"></div>
            </div>
            <div class="gaxis" id="gaxis"></div>
          </div>
          <div class="chips" id="chips"></div>`)}

        ${slide('verleden', `
          <div class="shead"><h2>Verleden</h2><span id="past-sub">laatste ${c.past_days} dagen</span></div>
          <div class="ptop">
            <button class="glass pcard press" id="con-card" data-act="info" data-entity="${c.dynamic_total}">
              <span class="label">Vast vs dynamisch</span>
              <div class="cbig"><b id="con-big">–</b><span id="con-what"></span></div>
              <div class="csub" id="con-sub"></div>
              <div class="csub" id="con-sub2"></div>
              <div class="cdays" id="con-days"></div>
            </button>
            <div class="glass pcard">
              <div class="gtop"><span class="label">Energiescore per dag</span>
                <span class="vleg"><span><i style="background:var(--muted)"></i>totaal</span><span><i style="background:var(--solar)"></i>zon zelf gebruikt</span><span><i style="background:var(--grid)"></i>slim getimed</span></span></div>
              <div class="sdays" id="past-score"></div>
            </div>
          </div>
          <div class="glass pcard puse">
            <div class="gtop"><span class="label">Verbruik per dag</span>
              <span class="vleg"><span><i style="background:var(--solar)"></i>zon</span><span><i style="background:var(--grid)"></i>afgenomen</span><span><i style="background:var(--export)"></i>teruggeleverd</span><span style="color:var(--heat)">gas m³</span></span></div>
            <div class="udays" id="past-use"></div>
          </div>`)}

        ${slide('weer', `
          <button class="glass wcard fh press" data-act="info" data-entity="${c.weather}">
            <div class="gtop"><span class="label">Komende uren</span><span class="wnow" id="w-now"></span></div>
            <div class="fcols" id="fc-h"></div>
          </button>
          <button class="glass wcard fd press" data-act="info" data-entity="${c.weather}">
            <span class="label">Komende dagen</span>
            <div class="fcols" id="fc-d"></div>
          </button>
          <button class="glass rcard press" data-act="info" data-entity="${c.rain}">
            <div class="rtop2"><span class="label">Regen · 2 uur</span><ha-icon id="ricon" icon="mdi:weather-partly-cloudy"></ha-icon>
              <span class="rtitle" id="rtitle">Regenverwachting</span><span class="rsub" id="rsub"></span></div>
            <div class="bars" id="bars"></div>
            <div class="raxis" id="raxis"></div>
          </button>`)}

        ${slide('klimaat', `
          <div class="shead"><h2>Klimaat</h2><span><span id="outdoor"></span><span id="water"></span></span></div>
          <div class="kbody">
            <div class="rlist" id="rooms"></div>
            <button class="glass gas press" data-act="info" data-entity="${c.gas}">
              <div class="gtop"><span class="label">Gas</span><span class="label" id="gas-cost"></span></div>
              <div class="gbig"><b id="gas-today">–</b><span id="gas-cmp"></span></div>
              <div class="gsub">Per uur, laatste 24 uur</div>
              <div class="gh" id="gas-h"></div>
              <div class="ghx" id="gas-hx"></div>
              <div class="gsub">Per dag</div>
              <div class="gd" id="gas-d"></div>
            </button>
          </div>`)}

        ${slide('lampen', `
          <div class="shead"><h2>Lampen</h2><span id="lcount"></span></div>
          <div class="lgrid" id="lgrid" style="grid-template-columns:repeat(${Math.min(4, c.lights.length) || 1}, 1fr)"></div>
          <div class="scenes">${scenes}</div>`)}
        </div>
        <nav class="nav"><div class="ntime" id="ntime"></div>${nav}</nav>
      </div>
      <div class="veil" id="veil"></div>`;

    const $ = (id) => this._root.getElementById(id);
    this._el = new Proxy({}, { get: (o, k) => o[k] || (o[k] = $(k)) });
    this._navs = [...this._root.querySelectorAll('.nb')];
    this._idx = clamp(SLIDES.findIndex((s) => s.id === c.start), 0, SLIDES.length - 1);
    this._place(this._idx, 0, 0, false);
    this._slide(this._idx).classList.add('on');
    this._nav();

    this._root.addEventListener('click', (ev) => this._onClick(ev));
    this._root.addEventListener('pointerdown', () => this._hold(), true);
    const sl = this._el.slides;
    sl.addEventListener('pointerdown', (ev) => this._onDown(ev));
    sl.addEventListener('pointermove', (ev) => this._onMove(ev));
    sl.addEventListener('pointerup', (ev) => this._onUp(ev, false));
    sl.addEventListener('pointercancel', (ev) => this._onUp(ev, true));
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
    this._arm();
  }

  _fit() {
    const w = this.clientWidth;
    const h = this.clientHeight;
    if (!w || !h) return;
    this._k = Math.min(w / W, h / H);
    this._el.stage.style.setProperty('--k', this._k.toFixed(4));
    const cv = this._el.rainfx;
    cv.width = Math.round(w);
    cv.height = Math.round(h);
  }

  // ── carousel ──
  // Slides sit side by side only while they move: the current one at 0, the incoming one at ±100%.
  // That makes the loop endless in both directions without cloning slides.
  _slide(i) {
    return this._el[`s-${SLIDES[i].id}`];
  }

  _place(i, pct, px = 0, anim = true) {
    const el = this._slide(i);
    el.style.transition = anim ? '' : 'none';
    el.style.transform = `translate3d(calc(${pct}% + ${px.toFixed(1)}px), 0, 0)`;
  }

  _show(i) {
    clearTimeout(this._hideT[i]);
    this._slide(i).classList.add('on');
  }

  _hideLater(i) {
    clearTimeout(this._hideT[i]);
    this._hideT[i] = setTimeout(() => {
      if (i !== this._idx && !this._drag) this._slide(i).classList.remove('on');
    }, 720);
  }

  _go(to, dir) {
    const n = SLIDES.length;
    to = ((to % n) + n) % n;
    const from = this._idx;
    if (to === from) {
      this._arm();
      return;
    }
    if (!dir) dir = to > from ? 1 : -1;
    this._place(to, dir * 100, 0, false);
    this._show(to);
    void this._slide(to).offsetWidth; // commit the start position before animating
    this._place(to, 0);
    this._place(from, -dir * 100);
    this._idx = to;
    this._hideLater(from);
    this._nav();
    this._arm();
  }

  _nav() {
    this._navs.forEach((b, i) => b.classList.toggle('on', i === this._idx));
  }

  // Auto-advance; a touch holds it for `resume_after` seconds. The active button shows the countdown.
  _arm() {
    clearTimeout(this._autoT);
    this._navs.forEach((b) => b.classList.remove('run', 'hold'));
    const rot = Number(this._c.rotate);
    if (!rot || !this._running) return;
    const nb = this._navs[this._idx];
    const wait = this._holdUntil - Date.now();
    if (wait > 0) {
      nb.classList.add('hold');
      this._autoT = setTimeout(() => this._arm(), wait);
      return;
    }
    void nb.offsetWidth; // restart the progress animation
    nb.classList.add('run');
    this._autoT = setTimeout(() => this._go(this._nextAuto(), 1), rot * 1000);
  }

  _hold() {
    this._holdUntil = Date.now() + Number(this._c.resume_after) * 1000;
    if (this._running) this._arm();
  }

  _nextAuto() {
    const n = SLIDES.length;
    const list = this._c.rotate_slides;
    for (let k = 1; k <= n; k++) {
      const i = (this._idx + k) % n;
      const id = SLIDES[i].id;
      if (Array.isArray(list) && !list.includes(id)) continue;
      return i;
    }
    return this._idx;
  }

  // Swipe: the current slide follows the finger with both neighbours next to it.
  _onDown(ev) {
    if (ev.button > 0 || this._ptr) return;
    this._ptr = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, lx: ev.clientX, lt: ev.timeStamp, v: 0 };
  }

  _onMove(ev) {
    const p = this._ptr;
    if (!p || ev.pointerId !== p.id) return;
    const k = this._k || 1;
    const dx = (ev.clientX - p.x) / k;
    if (!this._drag) {
      const ax = Math.abs(ev.clientX - p.x);
      const ay = Math.abs(ev.clientY - p.y);
      if (ay > 24 && ay > ax) {
        this._ptr = null;
        return;
      }
      if (ax < 14) return;
      this._drag = true;
      try {
        this._el.slides.setPointerCapture(p.id);
      } catch (e) {
        /* not supported: the drag still works while the finger stays on the slides */
      }
      const n = SLIDES.length;
      p.prev = (this._idx - 1 + n) % n;
      p.next = (this._idx + 1) % n;
      this._show(p.prev);
      this._show(p.next);
    }
    const dt = ev.timeStamp - p.lt;
    if (dt > 0) {
      p.v = (ev.clientX - p.lx) / k / dt;
      p.lx = ev.clientX;
      p.lt = ev.timeStamp;
    }
    this._place(this._idx, 0, dx, false);
    this._place(p.prev, -100, dx, false);
    this._place(p.next, 100, dx, false);
  }

  _onUp(ev, cancel) {
    const p = this._ptr;
    if (!p || ev.pointerId !== p.id) return;
    this._ptr = null;
    if (!this._drag) return;
    this._drag = false;
    this._dragEnd = Date.now();
    const dx = cancel ? 0 : (ev.clientX - p.x) / (this._k || 1);
    const fast = Date.now() - p.lt < 120 ? p.v : 0;
    let dir = 0;
    if (dx < -170 || (dx < -40 && fast < -0.35)) dir = 1;
    else if (dx > 170 || (dx > 40 && fast > 0.35)) dir = -1;
    const cur = this._idx;
    if (dir === 0) {
      this._place(cur, 0);
      this._place(p.prev, -100);
      this._place(p.next, 100);
      this._hideLater(p.prev);
      this._hideLater(p.next);
    } else {
      const to = dir === 1 ? p.next : p.prev;
      const other = dir === 1 ? p.prev : p.next;
      this._place(to, 0);
      this._place(cur, -dir * 100);
      this._place(other, dir === 1 ? -100 : 100);
      this._idx = to;
      this._hideLater(cur);
      this._hideLater(other);
      this._nav();
    }
    this._arm();
  }

  _badge(id, show, text, color) {
    const b = this._el[`bd-${id}`];
    const cls = !show ? 'bd' : text != null && text !== '' ? 'bd n' : 'bd dot';
    if (b.className !== cls) b.className = cls;
    const t = show && text != null ? String(text) : '';
    if (b.textContent !== t) b.textContent = t;
    if (color && b.dataset.c !== color) {
      b.dataset.c = color;
      b.style.setProperty('--bc', color);
    }
  }

  // ── interaction ──
  _onClick(ev) {
    if (Date.now() - (this._dragEnd || 0) < 400) return; // the end of a swipe is not a tap
    const t = ev.target.closest('[data-act]');
    if (!t || t.disabled) return;
    const act = t.dataset.act;
    if (act === 'climate') this._step(t.dataset.entity, Number(t.dataset.dir));
    else if (act === 'ac-power') this._acPower();
    else if (act === 'ac-auto') this._acAuto();
    else if (act === 'ac-step') this._acStep(Number(t.dataset.dir));
    else if (act === 'light') this._toggleLight(t.dataset.entity);
    else if (act === 'scene') this._scene(t, Number(t.dataset.i));
    else if (act === 'nav') this._go(Number(t.dataset.i));
    else if (act === 'go') this._go(SLIDES.findIndex((s) => s.id === t.dataset.go));
    else if (act === 'info') this._moreInfo(t.dataset.entity);
  }

  _moreInfo(entityId) {
    if (!entityId) return;
    this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }));
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

  // ── airco ──
  // Optimistic state per control ('power', 'auto'), like the lights: shown until HA agrees or 15 s pass
  // (the LG cloud can take a few seconds).
  _acState(key, actual) {
    const p = this._pendingAc[key];
    if (p) {
      if (actual === p.to || Date.now() - p.at > 15000) delete this._pendingAc[key];
      else return p.to;
    }
    return actual;
  }

  _acPower() {
    const a = this._c.airco;
    const s = this._hass.states[a.entity];
    if (!s || s.state === 'unavailable') return;
    const on = this._acState('power', s.state !== 'off');
    this._pendingAc.power = { to: !on, at: Date.now() };
    if (on) this._hass.callService('climate', 'turn_off', { entity_id: a.entity });
    else this._hass.callService('climate', 'set_hvac_mode', { entity_id: a.entity, hvac_mode: 'heat' });
    this._rooms();
  }

  _acAuto() {
    const a = this._c.airco;
    const s = this._hass.states[a.auto];
    if (!s) return;
    const on = this._acState('auto', s.state === 'on');
    this._pendingAc.auto = { to: !on, at: Date.now() };
    this._hass.callService('input_boolean', on ? 'turn_off' : 'turn_on', { entity_id: a.auto });
    this._rooms();
  }

  // Which setpoint - / + change: the solar target while the automation runs the airco or the airco is off,
  // the airco's own setpoint when someone switched it on by hand.
  _acTargetEntity() {
    const a = this._c.airco;
    const s = this._hass.states[a.entity];
    const manual = s && s.state !== 'off' && s.state !== 'unavailable' && this._hass.states[a.active]?.state !== 'on';
    return manual || !this._hass.states[a.target] ? a.entity : a.target;
  }

  _acTarget() {
    const id = this._acTargetEntity();
    const s = this._hass.states[id];
    if (!s) return { id, value: null };
    const actual = id.startsWith('input_number.') ? Number(s.state) : s.attributes.temperature;
    const p = this._pendingTemp[id];
    if (p) {
      if (actual === p.value || (p.sent && Date.now() - p.sent > 60000)) delete this._pendingTemp[id];
      else return { id, value: p.value };
    }
    return { id, value: actual == null || Number.isNaN(actual) ? null : actual };
  }

  _acStep(dir) {
    const { id, value } = this._acTarget();
    const s = this._hass.states[id];
    if (value == null || !s) return;
    const isNum = id.startsWith('input_number.');
    const lo = isNum ? Number(s.attributes.min) : s.attributes.min_temp ?? 16;
    const hi = isNum ? Number(s.attributes.max) : s.attributes.max_temp ?? 30;
    const v = clamp(Math.round((value + dir * this._c.temp_step) * 2) / 2, lo, hi);
    this._pendingTemp[id] = { value: v, sent: null };
    clearTimeout(this._tempTimers[id]);
    this._tempTimers[id] = setTimeout(() => {
      if (isNum) this._hass.callService('input_number', 'set_value', { entity_id: id, value: v });
      else this._hass.callService('climate', 'set_temperature', { entity_id: id, temperature: v });
      if (this._pendingTemp[id]) this._pendingTemp[id].sent = Date.now();
    }, 2000);
    this._rooms();
  }

  _acRow() {
    const a = this._c.airco;
    const h = this._hass;
    const s = a && h.states[a.entity];
    if (!s) return '';
    const na = s.state === 'unavailable';
    const on = !na && this._acState('power', s.state !== 'off');
    const autoS = h.states[a.auto];
    const auto = !!autoS && this._acState('auto', autoS.state === 'on');
    const solar = on && h.states[a.active]?.state === 'on';
    const { id, value } = this._acTarget();
    const fan = { low: 'laag', medium: 'middel', high: 'hoog', auto: 'auto' }[s.attributes.fan_mode];
    const fanTxt = on && fan ? ` · ${fan}` : '';
    const status = na
      ? 'onbereikbaar'
      : solar
        ? `<ha-icon icon="mdi:solar-power-variant"></ha-icon>op zon${fanTxt}`
        : on
          ? `<ha-icon icon="mdi:fire"></ha-icon>handmatig${fanTxt}`
          : auto ? 'uit · wacht op zon' : 'uit';
    return `<div class="glass room ac${on ? ' heat' : ''}">
      <div class="rtop press" data-act="info" data-entity="${a.entity}"><b>${a.name || s.attributes.friendly_name}</b><span>${status}</span></div>
      <button class="acb auto press${auto ? ' on' : ''}${this._pendingAc.auto ? ' pend' : ''}" data-act="ac-auto"${autoS ? '' : ' disabled'} aria-label="automatisch">AUTO</button>
      <button class="acb pwr press${on ? ' on' : ''}${this._pendingAc.power ? ' pend' : ''}" data-act="ac-power"${na ? ' disabled' : ''} aria-label="aan / uit"><ha-icon icon="mdi:power"></ha-icon></button>
      <div class="ctl">
        <button class="press" data-act="ac-step" data-dir="-1"${value == null ? ' disabled' : ''} aria-label="lager">−</button>
        <div class="tgt${this._pendingTemp[id] ? ' pend' : ''}"><small>doel</small>${value == null ? '–' : `${fmt(value, 1)}°`}</div>
        <button class="press" data-act="ac-step" data-dir="1"${value == null ? ' disabled' : ''} aria-label="hoger">+</button>
      </div></div>`;
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
    this._forecastRender();
    this._harvest();
    this._gasRender();
    this._priceRender();
    this._scoreRender();
    this._pastRender();
    this._el.offline.classList.toggle('on', this._hass.connected === false);
  }

  _clock() {
    const now = new Date();
    const hm = hhmm(now);
    if (hm === this._hm) return;
    this._hm = hm;
    this._el.time.innerHTML = hm.replace(':', '<span class="c">:</span>');
    this._el.ntime.textContent = hm;
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
      bft != null ? `<span><ha-icon icon="mdi:weather-windy"></ha-icon>${bft} Bft ${dir}</span>` : '',
      a.humidity != null ? `<span><ha-icon icon="mdi:water-percent"></ha-icon>${Math.round(a.humidity)}%</span>` : '',
    ].join('');
    this._set('wmeta', this._el.wmeta, meta);
    const cond = w.state;
    if (cond !== this._cond) {
      this._cond = cond;
      this._sky();
    }
  }

  // ── Weer: hourly and daily forecast ──
  // Weather entities no longer carry the forecast as an attribute; the frontend subscribes to it over the
  // websocket and gets a new list each time the integration updates (met.no: about every 30 minutes).
  _subForecast() {
    const conn = this._hass && this._hass.connection;
    const id = this._c.weather;
    if (!conn || !conn.subscribeMessage || !id || !this.isConnected) return;
    this._fcSubs = ['hourly', 'daily'].map((type) =>
      conn
        .subscribeMessage((msg) => {
          this._fc[type] = Array.isArray(msg.forecast) ? msg.forecast : [];
          this._cache.fc = null;
          this._forecastRender();
        }, { type: 'weather/subscribe_forecast', forecast_type: type, entity_id: id })
        .catch(() => null));
  }

  _unsubForecast() {
    if (!this._fcSubs) return;
    this._fcSubs.forEach((p) => p.then((un) => un && un()).catch(() => {}));
    this._fcSubs = null;
  }

  _forecastRender() {
    const w = this._hass.states[this._c.weather];
    const e = this._el;
    const hourly = this._fc.hourly || (w && w.attributes.forecast) || [];
    const daily = this._fc.daily || [];
    const now = new Date();
    const hourKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
    const key = `${hourKey}|${w ? w.state + w.attributes.temperature : ''}|${this._fc.hourly ? this._fc.hourly.length : '-'}|${this._fc.daily ? this._fc.daily.length : '-'}`;
    if (key === this._cache.fc) return;
    this._cache.fc = key;
    const lat = this._hass.config && this._hass.config.latitude;
    const lon = this._hass.config && this._hass.config.longitude;
    const isNight = (d) => (typeof lat === 'number' && typeof lon === 'number' ? sunElevation(d, lat, lon) < -0.833 : d.getHours() < 7 || d.getHours() >= 18);
    const icon = (cond, night, d) => weatherSvg((WEATHER[cond] || [0, 'cloud'])[1], night, moonPhase(d));
    const mm = (v) => (v != null && v >= 0.1 ? `${fmt(v, v < 10 ? 1 : 0)} mm` : '');

    if (w) {
      const a = w.attributes;
      const label = (WEATHER[w.state] || [w.state])[0];
      e['w-now'].textContent = `${a.temperature == null ? '–' : `${fmt(a.temperature, 0)}°`} · ${label}`;
    }

    // Hours from the current one on.
    const h0 = new Date(now);
    h0.setMinutes(0, 0, 0);
    const hours = hourly.filter((f) => new Date(f.datetime) >= h0).slice(0, this._c.forecast_hours);
    this._set('fc-h', e['fc-h'], hours.length
      ? hours.map((f, i) => {
        const d = new Date(f.datetime);
        return `<div class="${i === 0 ? 'now' : ''}"><em>${i === 0 ? 'nu' : `${String(d.getHours()).padStart(2, '0')}:00`}</em>${icon(f.condition, isNight(d), d)}
          <b>${f.temperature == null ? '–' : `${fmt(f.temperature, 0)}°`}</b><span class="mm">${mm(f.precipitation)}</span></div>`;
      }).join('')
      : '<div><em>geen uurverwachting</em></div>');

    // Days from today on; the bar shows each day's low - high on the scale of the whole week.
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const days = daily.filter((f) => new Date(f.datetime) >= today).slice(0, 7);
    const lows = days.map((f) => (f.templow != null ? f.templow : f.temperature)).filter((v) => v != null);
    const highs = days.map((f) => f.temperature).filter((v) => v != null);
    const lo = Math.min(...lows);
    const span = Math.max(1, Math.max(...highs) - lo);
    this._set('fc-d', e['fc-d'], days.length
      ? days.map((f, i) => {
        const d = new Date(f.datetime);
        const ds = new Date(d);
        ds.setHours(0, 0, 0, 0);
        const n = Math.round((ds - today) / 86400e3);
        const name = n === 0 ? 'vandaag' : n === 1 ? 'morgen' : d.toLocaleDateString(NL, { weekday: 'long' });
        const cond = f.condition === 'clear-night' ? 'sunny' : f.condition; // met.no gives today's night condition
        const low = f.templow != null ? f.templow : null;
        const x0 = (((low != null ? low : f.temperature) - lo) / span) * 100;
        const x1 = ((f.temperature - lo) / span) * 100;
        return `<div class="${n === 0 ? 'now' : ''}"><em>${name}</em>${icon(cond, false, d)}
          <b>${f.temperature == null ? '–' : `${fmt(f.temperature, 0)}°`}${low != null ? `<small>${fmt(low, 0)}°</small>` : ''}</b>
          <span class="trng"><i style="left:${x0.toFixed(0)}%;width:${Math.max(4, x1 - x0).toFixed(0)}%"></i></span>
          <span class="mm">${mm(f.precipitation)}</span></div>`;
      }).join('')
      : '<div><em>geen dagverwachting</em></div>');
  }

  _rain() {
    const s = this._hass.states[this._c.rain];
    const raw = s ? s.state : '';
    const cond = this._hass.states[this._c.weather] ? this._hass.states[this._c.weather].state : '';
    const key = `${raw}|${cond}`;
    if (key === this._cache.rain) return;
    this._cache.rain = key;
    const e = this._el;
    const head = (icon, title, sub, color) => {
      e.ricon.setAttribute('icon', icon);
      e['nr-icon'].setAttribute('icon', icon);
      e.rtitle.textContent = title;
      e['nr-title'].textContent = title;
      e.rsub.textContent = sub;
      e['nr-sub'].textContent = sub;
      e['s-weer'].style.setProperty('--ri', color);
      e.nr.style.setProperty('--ti', color);
    };
    const [start, list] = (raw || '').split('|');
    const mm = (list || '').split(',').map(parseFloat).filter((v) => !Number.isNaN(v));
    if (!start || mm.length === 0) {
      head('mdi:weather-cloudy-alert', 'Regenverwachting', 'geen gegevens van Buienradar', 'var(--muted)');
      e.bars.innerHTML = '';
      e.raxis.innerHTML = '';
      this._badge('weer', false);
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
    head(icon, title, sub, first === -1 ? 'var(--solar)' : 'var(--rain)');
    this._badge('weer', first !== -1, null, 'var(--rain)');
    // Square-root scale up to 5 mm/h: drizzle stays visible and a shower does not flatten the rest.
    // Guide lines at 0.5 / 2 / 5 mm/h (31% / 63% / 100% on the square-root scale).
    e.bars.innerHTML = '<u style="bottom:31%" data-l="licht"></u><u style="bottom:63%" data-l="matig"></u><u style="bottom:100%" data-l="zwaar"></u>' + mm
      .map((v) => `<i class="${wet(v) ? '' : 'dry'}" style="height:${wet(v) ? Math.max(8, Math.min(100, Math.sqrt(v / 5) * 100)).toFixed(0) : 2}%"></i>`)
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
    e.hfc.textContent = fc == null ? '' : `van ${fmt(fc)}`;
    e.hbar.style.width = `${fc ? clamp((now || 0) / fc, 0, 1) * 100 : 0}%`;
    let next = '';
    if (tm != null) {
      const more = fc != null && tm > fc * 1.25 ? ' · meer zon' : fc != null && tm < fc * 0.75 ? ' · minder zon' : '';
      next = `Morgen ${fmt(tm)} kWh${more}`;
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
    // The P1 values are summed per direction over the phases, so one phase can import while another exports.
    // The meter registers (what the supplier bills) net the phases, so show the net flow.
    const net = Math.max(watts(h, c.import) ?? 0, 0) - Math.max(watts(h, c.export) ?? 0, 0);
    const imp = Math.max(net, 0);
    const exp = Math.max(-net, 0);
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
    e['s-energie'].style.setProperty('--accent', accent);
    if (e.eicon.getAttribute('icon') !== icon) e.eicon.setAttribute('icon', icon);
    e.etitle.textContent = title;
    e.esub.textContent = sub;
    this._badge('energie', true, null, accent);

    const s24 = this._score24;
    const score = s24 ? s24.score : num(h, c.score);
    const sc = s24 ? s24.sc : num(h, c.self_consumption);
    const pr = s24 ? s24.pr : num(h, c.price);
    e.score.style.setProperty('--sc', scoreColor(score));
    e.snum.textContent = score == null ? '–' : Math.round(score);
    const sicon = score == null || score < 45 ? 'mdi:leaf-off' : 'mdi:leaf';
    if (e.sicon.getAttribute('icon') !== sicon) e.sicon.setAttribute('icon', sicon);
    e['p-sc'].textContent = sc == null ? 'nog < 0,1 kWh' : `${Math.round(sc)}%`;
    e['p-pr'].textContent = pr == null ? 'nog te weinig' : `${Math.round(pr)}%`;
    e['pb-sc'].style.width = `${sc ?? 0}%`;
    e['pb-pr'].style.width = `${pr ?? 0}%`;

    const sT = num(h, c.solar_today);
    const iT = num(h, c.import_today);
    const xT = num(h, c.export_today);
    const use = sT != null && iT != null && xT != null ? sT - xT + iT : null;
    const chips = [
      ['mdi:solar-power-variant', 'var(--solar)', `${fmt(sT)} kWh`, 'opgewekt'],
      ['mdi:home-lightning-bolt', 'var(--home)', `${fmt(use)} kWh`, 'verbruikt'],
      ['mdi:transmission-tower-import', 'var(--grid)', `${fmt(iT)} kWh`, 'van het net'],
      ['mdi:transmission-tower-export', 'var(--export)', `${fmt(xT)} kWh`, 'teruggeleverd'],
      ['mdi:fire', 'var(--heat)', `${fmt(num(h, c.gas_today), 2)} m³`, 'gas'],
    ];
    this._set('chips', e.chips, chips
      .map(([i, col, v, l]) => `<div class="chip" style="--ic:${col}"><ha-icon icon="${i}"></ha-icon><div><b>${v}</b><span>${l}</span></div></div>`)
      .join(''));
  }

  // Solar and house power for the Vandaag graph from the recorder's 5-minute statistics (mean per 5 minutes):
  // ~290 points per sensor for 24 hours instead of thousands of raw states. HA keeps those 10 days by default.
  async _loadHistory() {
    if (this._loading || !this._hass.callWS) return;
    this._loading = true;
    this._histAt = Date.now();
    try {
      const t1 = Date.now();
      const t0 = t1 - this._c.graph_hours * 3600 * 1000;
      const ids = [this._c.solar, this._c.house];
      const res = await this._hass.callWS({
        type: 'recorder/statistics_during_period',
        start_time: new Date(t0).toISOString(),
        statistic_ids: ids,
        period: '5minute',
        types: ['mean', 'max'],
      });
      // [time, value] per 5 minutes; the newest period is written a few minutes after it ends, so end with the
      // value right now. House also gets the highest value of each 5 minutes, for the peak band.
      const pts = (id, k) => (res[id] || [])
        .filter((r) => typeof r[k] === 'number')
        .map((r) => [(typeof r.start === 'number' ? r.start : Date.parse(r.start)) + 150000, r[k]])
        .concat([[t1, Math.max(watts(this._hass, id) ?? 0, 0)]]);
      const series = [pts(ids[0], 'mean'), pts(ids[1], 'mean'), pts(ids[1], 'max')];
      // Right after a Home Assistant restart the recorder can answer empty: keep the old graph, try again soon.
      if (ids.every((id) => !(res[id] || []).length)) this._histAt = Date.now() - 4.5 * 60 * 1000;
      else {
        this._pow = { t0, t1, series };
        this._graph();
      }
    } catch (err) {
      this._histAt = Date.now() - 4.5 * 60 * 1000; // retry in 30 s
      console.warn('homelab-ambient-panel: power statistics failed', err);
    } finally {
      this._loading = false;
    }
  }

  // The Vandaag graph: solar (area) and house power (line) on the left axis, the energy score over the preceding
  // 24 hours at each hour with its two parts on the right axis (0-100), and the price per hour as tinted bars behind
  // (green = cheapest hour of the window, red = dearest; no axis, the range is in the legend).
  _graph() {
    const P = this._pow;
    if (!P) return;
    const { t0, t1 } = P;
    const e = this._el;
    const N = Math.round((t1 - t0) / 300000); // one point per 5-minute statistic
    const bucket = (pts) => {
      const out = [];
      let j = 0;
      let last = null;
      for (let b = 0; b < N; b++) {
        const end = t0 + ((b + 1) * (t1 - t0)) / N;
        let sum = 0;
        let n = 0;
        while (j < pts.length && pts[j][0] <= end) {
          if (pts[j][0] > end - (t1 - t0) / N) { sum += pts[j][1]; n += 1; }
          last = pts[j][1];
          j += 1;
        }
        out.push(n ? sum / n : last ?? 0);
      }
      return out;
    };
    const [solar, house, houseMax] = P.series.map(bucket);
    const peak = houseMax.map((v, b) => Math.max(v, house[b])); // the live point has no max of its own
    const max = Math.max(...solar, ...peak);
    const top = max <= 500 ? 500 : Math.ceil(max / 1000) * 1000; // axis top in whole kW, so the middle label is round too
    const x = (t) => (((t - t0) / (t1 - t0)) * GW).toFixed(1);
    const xb = (b) => ((b / (N - 1)) * GW).toFixed(1);
    const yp = (v) => gy(clamp(v / top, 0, 1)).toFixed(1);
    const line = (vals) => vals.map((v, b) => `${b ? 'L' : 'M'}${xb(b)} ${yp(v)}`).join('');
    e['g-solar'].setAttribute('d', `${line(solar)}L${GW} ${GH}L0 ${GH}Z`);
    e['g-house'].setAttribute('d', line(house));
    // Peak band: from the 5-minute mean up to the 5-minute max, so short peaks (kettle, oven) stay visible.
    const back = house.map((v, b) => `L${xb(b)} ${yp(v)}`).reverse().join('');
    e['g-hpeak'].setAttribute('d', `${line(peak)}${back}Z`);
    e['g-peak'].textContent = `piek ${power(max)}`;
    const pos = (f) => `top:${((gy(f) / GH) * 100).toFixed(2)}%`;
    e.gyl.innerHTML = [0.5, 1].map((f) => `<span style="${pos(f)}">${power(top * f)}</span>`).join('');
    e.gyr.innerHTML = [0.5, 1].map((f) => `<span style="${pos(f)}">${f * 100}</span>`).join('');
    const ticks = [0, 0.25, 0.5, 0.75].map((q) => `<span>${hhmm(new Date(t0 + q * (t1 - t0)))}</span>`);
    e.gaxis.innerHTML = `${ticks.join('')}<span>nu</span>`;

    // Price per hour behind the lines.
    const hp = this._hourP || [];
    const known = hp.filter((h) => h.p != null).map((h) => h.p);
    let bars = '';
    if (known.length) {
      const lo = Math.min(...known);
      const hi = Math.max(...known);
      const floor = Math.max(0, lo - (hi - lo) * 0.6);
      for (const { t, p } of hp) {
        if (p == null || t + 3600000 <= t0 || t >= t1) continue;
        const f = hi - lo < 0.005 ? 0.5 : (p - lo) / (hi - lo);
        const h = (0.08 + ((p - floor) / (hi - floor || 1)) * 0.92) * (GH - 14);
        const xa = Math.max(t, t0);
        const xe = Math.min(t + 3600000, t1);
        bars += `<rect x="${x(xa)}" width="${Math.max(x(xe) - x(xa) - 2, 0.5).toFixed(1)}" y="${(GH - h).toFixed(1)}" height="${h.toFixed(1)}" fill="hsl(${Math.round(140 - f * 140)}, 70%, 55%)"/>`;
      }
      e['g-plab'].textContent = `prijs p/u € ${fmt(lo, 2)}–${fmt(hi, 2)}`;
    }
    e['g-price'].innerHTML = bars;

    // Score lines, broken where a value is missing. Each point sits at the end of its 24-hour window. The first
    // points lie before t0: the line starts at t0, interpolated from the last point before it.
    const pts = this._scorePts || [];
    const T0 = this._scoreT0;
    const ys = (v) => gy(clamp(v / 100, 0, 1)).toFixed(1);
    const series = (k, cls) => {
      let out = '';
      let run = [];
      const flush = () => {
        if (run.length > 1) out += `<path class="${cls}" d="${run.map(([t, v], i) => `${i ? 'L' : 'M'}${x(t)} ${ys(v)}`).join('')}" vector-effect="non-scaling-stroke"/>`;
        run = [];
      };
      let prev = null;
      pts.forEach((p, i) => {
        const t = Math.min(T0 + (i + 1) * 3600000, t1);
        const v = p == null ? null : p[k];
        if (v == null) flush();
        else if (t >= t0) {
          if (!run.length && prev && prev[0] < t0) run.push([t0, prev[1] + ((v - prev[1]) * (t0 - prev[0])) / (t - prev[0])]);
          run.push([t, v]);
        }
        prev = v == null ? null : [t, v];
      });
      flush();
      return out;
    };
    e['g-score'].innerHTML = T0 ? series('sc', 'g-part sc') + series('pr', 'g-part pr') + series('score', 'g-score') : '';
  }

  // Gas per day from the recorder's long-term statistics of the meter reading; per hour from the readings themselves.
  // The P1 gas meter reports once an hour, around the full hour but a few seconds before or after it (05:59:55,
  // 07:00:02). The hourly statistics then put two readings in one hour and none in the next: an empty bar next to a
  // double one. So each reading counts as the meter at the nearest full hour, and the difference between two
  // readings is the gas of the hour(s) in between (spread evenly when a reading is missing). The current hour has
  // no end reading yet, so its bar stays empty until the next full hour.
  async _loadGas() {
    if (this._gasLoading || !this._hass.callWS || !this._c.gas) return;
    this._gasLoading = true;
    this._gasAt = Date.now();
    try {
      const id = this._c.gas;
      const h0 = new Date();
      h0.setMinutes(0, 0, 0);
      h0.setHours(h0.getHours() - 23);
      const d0 = new Date();
      d0.setHours(0, 0, 0, 0);
      d0.setDate(d0.getDate() - 6);
      const ask = (start, period) => this._hass.callWS({
        type: 'recorder/statistics_during_period',
        start_time: start.toISOString(),
        statistic_ids: [id],
        period,
        types: ['change'],
      });
      const [hist, dr] = await Promise.all([
        this._hass.callWS({
          type: 'history/history_during_period',
          start_time: new Date(h0.getTime() - 2 * 3600000).toISOString(),
          entity_ids: [id],
          minimal_response: true,
          no_attributes: true,
          significant_changes_only: false,
        }),
        ask(d0, 'day'),
      ]);
      const H = 3600000;
      const hourVals = new Array(24).fill(0);
      const reads = (hist[id] || [])
        .map((r) => [Math.round(((r.lu ?? r.lc) * 1000) / H) * H, parseFloat(r.s)])
        .filter(([, v]) => !Number.isNaN(v));
      for (let k = 1; k < reads.length; k++) {
        const [ta, va] = reads[k - 1];
        const [tb, vb] = reads[k];
        const d = vb - va;
        if (!(d > 0)) continue; // same reading again, or a meter reset
        const n = Math.max(1, (tb - ta) / H); // hours between the two readings
        for (let j = 0; j < n; j++) {
          const i = Math.round((tb - (j + 1) * H - h0.getTime()) / H); // the hour that ends j hours before tb
          if (i >= 0 && i < 24) hourVals[i] += d / n;
        }
      }
      const slots = (rows, t0, n, next) => {
        const out = new Array(n).fill(0);
        const starts = [];
        let t = new Date(t0);
        for (let i = 0; i < n; i++) {
          starts.push(t.getTime());
          t = next(t);
        }
        for (const r of rows || []) {
          const ms = typeof r.start === 'number' ? r.start : Date.parse(r.start);
          const i = starts.findIndex((s, k) => ms >= s && (k === n - 1 || ms < starts[k + 1]));
          if (i >= 0 && typeof r.change === 'number') out[i] += Math.max(r.change, 0);
        }
        return { starts, vals: out };
      };
      this._gasData = {
        hours: { starts: Array.from({ length: 24 }, (_, i) => h0.getTime() + i * H), vals: hourVals },
        days: slots(dr[id], d0, 7, (t) => { const d = new Date(t); d.setDate(d.getDate() + 1); return d; }),
      };
      this._cache.gas = null;
      this._gasRender();
    } catch (err) {
      this._gasAt = Date.now() - 14.5 * 60 * 1000; // retry in 30 s
      console.warn('homelab-ambient-panel: gas statistics failed', err);
    } finally {
      this._gasLoading = false;
    }
  }

  _gasRender() {
    const today = num(this._hass, this._c.gas_today);
    const g = this._gasData;
    const key = `${today}|${g ? g.hours.vals.join() + g.days.vals.join() : ''}`;
    if (key === this._cache.gas) return;
    this._cache.gas = key;
    const e = this._el;
    e['gas-today'].textContent = `${fmt(today, 2)} m³`;
    const yest = g ? g.days.vals[5] : null;
    e['gas-cmp'].textContent = yest ? `vandaag · gisteren ${fmt(yest, 1)}` : 'vandaag';
    const price = this._c.gas_price;
    e['gas-cost'].textContent = today != null && price != null ? `≈ € ${fmt(today * price, 2)}` : '';
    if (!g) return;
    const hv = g.hours.vals;
    const hmax = Math.max(0.2, ...hv);
    e['gas-h'].innerHTML = hv
      .map((v) => `<i class="${v > 0.005 ? '' : 'z'}" style="height:${v > 0.005 ? Math.max(4, (v / hmax) * 100).toFixed(0) : 2}%"></i>`)
      .join('');
    const hl = [0, 6, 12, 18].map((i) => `<span>${hhmm(new Date(g.hours.starts[i]))}</span>`);
    e['gas-hx'].innerHTML = `${hl.join('')}<span>nu</span>`;
    const dv = g.days.vals.slice();
    if (today != null) dv[6] = today; // the live daily counter is ahead of the statistics
    const dmax = Math.max(0.5, ...dv);
    e['gas-d'].innerHTML = dv
      .map((v, i) => {
        const day = i === 6 ? 'nu' : new Date(g.days.starts[i]).toLocaleDateString(NL, { weekday: 'short' }).replace('.', '');
        const h = Math.max(2, (v / dmax) * 100).toFixed(0);
        return `<div class="${i === 6 ? 'now' : ''}"><b style="--h:${h}%"><em>${fmt(v, 1)}</em><i></i></b><span>${day}</span></div>`;
      })
      .join('');
  }

  // Dynamic all-in price per hour from the EnergyZero list (market prices yesterday - tomorrow, UTC hours).
  _hourPrices() {
    const c = this._c;
    const s = this._hass.states[c.prices];
    const out = new Map();
    for (const p of (s && s.attributes.Prices) || []) {
      const t = Date.parse(p.readingDate);
      if (!Number.isNaN(t) && typeof p.price === 'number') out.set(t, (p.price + c.price_markup) * c.price_vat + c.price_tax);
    }
    return out;
  }

  // Price per hour for 24 hours: today 00:00-24:00, and from 18:00 (price_evening) 18:00 to 18:00 tomorrow, when
  // tomorrow's prices are known (EnergyZero has them around 14:00-15:00). Current hour outlined, past hours dimmed,
  // and the cheapest block of `cheap_hours` from now on.
  _priceRender() {
    const c = this._c;
    const now = new Date();
    const t0 = new Date(now);
    t0.setHours(now.getHours() >= c.price_evening ? c.price_evening : 0, 0, 0, 0);
    const hours = [];
    for (let i = 0; i < 24; i++) {
      const d = new Date(t0);
      d.setHours(t0.getHours() + i);
      hours.push(d.getTime());
    }
    const cur = hours.findIndex((t, i) => now.getTime() >= t && (i === 23 || now.getTime() < hours[i + 1]));
    const ps = this._hass.states[c.prices];
    const key = `${t0.getTime()}|${cur}|${ps ? ps.last_updated : ''}`;
    if (key === this._cache.price) return;
    this._cache.price = key;
    const map = this._hourPrices();
    const vals = hours.map((t) => (map.has(t) ? map.get(t) : null));
    const known = vals.filter((v) => v != null);
    const e = this._el;
    if (!known.length) {
      e['pr-now'].textContent = '–';
      e['pr-sub'].textContent = 'geen prijzen van EnergyZero';
      e['pr-bars'].innerHTML = '';
      return;
    }
    const lo = Math.min(...known);
    const hi = Math.max(...known);
    const avg = known.reduce((a, b) => a + b, 0) / known.length;
    // Colour from green (cheapest of the window) via yellow to red (most expensive).
    const col = (v) => {
      const f = hi - lo < 0.005 ? 0.5 : (v - lo) / (hi - lo);
      return `hsl(${Math.round(140 - f * 140)}, 70%, 55%)`;
    };
    // Cheapest block of n hours that has not started yet (the current hour counts).
    const n = c.cheap_hours;
    let best = -1;
    let bestAvg = Infinity;
    for (let i = Math.max(cur, 0); i + n <= 24; i++) {
      const w = vals.slice(i, i + n);
      if (w.some((v) => v == null)) continue;
      const a = w.reduce((x, y) => x + y, 0) / n;
      if (a < bestAvg - 1e-9) { bestAvg = a; best = i; }
    }
    const pNow = cur >= 0 ? vals[cur] : null;
    e['pr-now'].textContent = pNow == null ? '–' : `€ ${fmt(pNow, 2)}`;
    e['pr-now'].parentElement.style.setProperty('--pc', pNow == null ? 'var(--text)' : col(pNow));
    e['pr-sub'].textContent = `per kWh nu · gem. € ${fmt(avg, 2)} · ${fmt(lo, 2)}–${fmt(hi, 2)}`;
    const hh = (t) => String(new Date(t).getHours()).padStart(2, '0');
    e['pr-cheap'].textContent = best < 0 ? '' : best === cur ? `nu goedkoopst · € ${fmt(bestAvg, 2)}` : `goedkoopst ${hh(hours[best])}–${hh(hours[best] + n * 3600000)} uur`;
    const floor = Math.max(0, lo - (hi - lo) * 0.6); // bars start a bit below the cheapest hour, so differences show
    const bars = vals.map((v, i) => {
      if (v == null) return '<i class="na"></i>';
      const h = 8 + ((v - floor) / (hi - floor || 1)) * 92;
      return `<i class="${i < cur ? 'past' : ''}${i === cur ? ' now' : ''}" style="height:${h.toFixed(0)}%;--bc:${col(v)}"></i>`;
    });
    const band = best < 0 ? '' : `<div class="cheap" style="left:calc(${(best / 24) * 100}% - 2px);width:calc(${(n / 24) * 100}% + 2px)"><span>goedkoop</span></div>`;
    e['pr-bars'].innerHTML = band + bars.join('');
    e['pr-x'].innerHTML = [0, 6, 12, 18].map((i) => `<span>${hh(hours[i])}</span>`).join('') + `<span>${hh(hours[0])}</span>`;
  }

  // Energy score over the last 24 hours instead of since midnight, and the same score at every hour of the last
  // 24 hours for the graph on the Vandaag slide. Same two parts as the HA sensors in packages/nest_display.yaml:
  //   self consumption  (solar - export) / solar, when solar >= 0.1 kWh
  //   price timing      50 + 100 x (midpoint - paid per kWh) / (dearest - cheapest hour, at least € 0.03), with
  //                     midpoint = (dearest + cheapest) / 2: 100 = all import at the cheapest hour, 0 = all at the
  //                     dearest; on a flat day (prices < 3 ct apart) it stays near 50. Hour prices are the dynamic
  //                     all-in prices in the window; paid = import of each hour x that hour's price / total import
  //                     (not the cost counter: it can jump, e.g. when created)
  // From the 5-minute statistics, bucketed per hour, so the current hour counts too.
  async _loadScore() {
    if (this._scoreLoading || !this._hass.callWS) return;
    this._scoreLoading = true;
    this._scoreAt = Date.now();
    try {
      const c = this._c;
      const hNow = new Date();
      hNow.setMinutes(0, 0, 0);
      const B = 50; // buckets: 49 full hours and the current one
      const NP = 26; // score points: 24 hours of graph plus 2, so the line reaches the graph's left edge
      const H0 = hNow.getTime() - (B - 1) * 3600000;
      const ids = [c.solar_total, c.import_total, c.export_total];
      const [sums, means] = await Promise.all([
        this._hass.callWS({ type: 'recorder/statistics_during_period', start_time: new Date(H0).toISOString(),
          statistic_ids: ids, period: '5minute', types: ['change'] }),
        this._hass.callWS({ type: 'recorder/statistics_during_period', start_time: new Date(H0).toISOString(),
          statistic_ids: [c.price_now], period: 'hour', types: ['mean'] }),
      ]);
      const idx = (r) => Math.floor(((typeof r.start === 'number' ? r.start : Date.parse(r.start)) - H0) / 3600000);
      const bucket = (id) => {
        const out = new Array(B).fill(null);
        for (const r of sums[id] || []) {
          const i = idx(r);
          if (i >= 0 && i < B && typeof r.change === 'number') out[i] = (out[i] || 0) + r.change;
        }
        return out;
      };
      const [solar, imp, exp] = ids.map(bucket);
      const price = new Array(B).fill(null);
      for (const r of means[c.price_now] || []) {
        const i = idx(r);
        if (i >= 0 && i < B && typeof r.mean === 'number') price[i] = r.mean;
      }
      const list = this._hourPrices();
      for (let i = 0; i < B; i++) if (list.has(H0 + i * 3600000)) price[i] = list.get(H0 + i * 3600000);
      const win = (end) => {
        let so = 0, ex = 0, im = 0, ip = 0, co = 0, n = 0;
        const ps = [];
        for (let i = end - 23; i <= end; i++) {
          if (i < 0 || imp[i] == null) continue;
          n += 1;
          so += Math.max(solar[i] || 0, 0);
          ex += Math.max(exp[i] || 0, 0);
          if (price[i] == null) continue;
          ps.push(price[i]);
          ip += Math.max(imp[i], 0);
          co += Math.max(imp[i], 0) * price[i];
        }
        if (n < 12) return null; // not enough history yet
        const sc = selfUse(so, ex);
        const pr = priceTiming(ip, co, ps);
        return { sc, pr, score: avgOf([sc, pr]), hours: n, avg: avgOf(ps), paid: ip > 0 ? co / ip : null };
      };
      const points = [];
      for (let end = B - NP; end < B; end++) {
        const w = win(end);
        points.push(w);
      }
      this._hourP = price.map((p, i) => ({ t: H0 + i * 3600000, p }));
      this._score24 = win(B - 1);
      this._scorePts = points;
      this._scoreT0 = H0 + (B - NP) * 3600000;
      this._cache.score = null;
      this._scoreRender();
      this._energy();
    } catch (err) {
      this._scoreAt = Date.now() - 4.5 * 60 * 1000; // retry in 30 s
      console.warn('homelab-ambient-panel: score statistics failed', err);
    } finally {
      this._scoreLoading = false;
    }
  }

  // Score number in the Vandaag header; the score lines are drawn in the Vandaag graph.
  _scoreRender() {
    const s = this._score24;
    const score = s ? s.score : num(this._hass, this._c.score);
    const pts = this._scorePts || [];
    const key = `${score}|${pts.map((p) => (p ? `${p.score},${p.sc},${p.pr}` : '')).join()}`;
    if (key === this._cache.score) return;
    this._cache.score = key;
    const e = this._el;
    e.vs.style.setProperty('--sc', scoreColor(score));
    e.gcard.style.setProperty('--sc', scoreColor(score));
    e['vs-num'].textContent = score == null ? '–' : Math.round(score);
    this._graph();
  }

  // Verleden: per day for the last `past_days` days (today included), from the recorder's hourly long-term
  // statistics: usage, the energy score of that day (same two parts as above, over the calendar day) and the cost
  // on both contracts. Hourly statistics are written after each hour, so today's numbers lag up to an hour; the
  // usage of today comes from the live daily counters instead.
  async _loadPast() {
    if (this._pastLoading || !this._hass.callWS) return;
    this._pastLoading = true;
    this._pastAt = Date.now();
    try {
      const c = this._c;
      const D = c.past_days;
      const d0 = new Date();
      d0.setHours(0, 0, 0, 0);
      d0.setDate(d0.getDate() - (D - 1));
      const starts = [];
      for (let i = 0; i <= D; i++) {
        const d = new Date(d0);
        d.setDate(d0.getDate() + i);
        starts.push(d.getTime());
      }
      const keys = { so: c.solar_total, im: c.import_total, ex: c.export_total, gas: c.gas, fx: c.fixed_total, dy: c.dynamic_total };
      const ask = (ids, types) => this._hass.callWS({ type: 'recorder/statistics_during_period', start_time: d0.toISOString(),
        statistic_ids: ids, period: 'hour', types });
      const [sums, means] = await Promise.all([ask(Object.values(keys), ['change']), ask([c.price_now], ['mean'])]);
      const ms = (r) => (typeof r.start === 'number' ? r.start : Date.parse(r.start));
      const price = new Map();
      for (const r of means[c.price_now] || []) if (typeof r.mean === 'number') price.set(ms(r), r.mean);
      for (const [t, p] of this._hourPrices()) price.set(t, p);
      const days = starts.slice(0, D).map((t) => ({ t, so: null, im: null, ex: null, gas: null, fx: null, dy: null, n: 0, ip: 0, co: 0, ps: [] }));
      for (const [k, id] of Object.entries(keys)) {
        for (const r of sums[id] || []) {
          const t = ms(r);
          const i = starts.findIndex((s, j) => j < D && t >= s && t < starts[j + 1]);
          if (i < 0 || typeof r.change !== 'number') continue;
          const d = days[i];
          // Costs can go down (export credit); energy only up.
          const v = k === 'fx' || k === 'dy' ? r.change : Math.max(r.change, 0);
          d[k] = (d[k] || 0) + v;
          if (k !== 'im') continue;
          d.n += 1;
          const p = price.get(t);
          if (p == null) continue;
          d.ps.push(p);
          d.ip += v;
          d.co += v * p;
        }
      }
      this._past = days.map(({ ip, co, ps, ...d }) => ({ ...d, pr: priceTiming(ip, co, ps) }));
      this._cache.past = null;
      this._pastRender();
    } catch (err) {
      this._pastAt = Date.now() - 14.5 * 60 * 1000; // retry in 30 s
      console.warn('homelab-ambient-panel: past statistics failed', err);
    } finally {
      this._pastLoading = false;
    }
  }

  _pastRender() {
    const h = this._hass;
    const c = this._c;
    const fxNow = num(h, c.fixed_total);
    const dyNow = num(h, c.dynamic_total);
    const live = { so: num(h, c.solar_today), im: num(h, c.import_today), ex: num(h, c.export_today), gas: num(h, c.gas_today) };
    const key = JSON.stringify([this._past, fxNow, dyNow, live]);
    if (key === this._cache.past) return;
    this._cache.past = key;
    const e = this._el;
    const D = c.past_days;

    // Contract: the total since the start from the live sensors, per day from the statistics.
    const since = new Date(`${c.contract_since}T00:00`);
    if (fxNow != null && dyNow != null) {
      const diff = fxNow - dyNow;
      const nd = (Date.now() - since.getTime()) / 86400000;
      e['con-card'].style.setProperty('--cc', diff >= 0 ? 'var(--export)' : '#ff6b6b');
      e['con-big'].textContent = `€ ${fmt(Math.abs(diff), 2)}`;
      e['con-what'].textContent = diff >= 0 ? 'dynamisch goedkoper' : 'dynamisch duurder';
      e['con-sub'].textContent = `vast € ${fmt(fxNow, 2)} · dynamisch € ${fmt(dyNow, 2)}`;
      const from = Number.isNaN(nd) ? '' : `sinds ${since.toLocaleDateString(NL, { day: 'numeric', month: 'long' })}`;
      e['con-sub2'].textContent = nd >= 1 ? `${from} · ≈ € ${fmt((Math.abs(diff) / nd) * 30.4, 0)} per maand` : from;
    }
    const p = this._past;
    if (!p) return;
    const wd = (t) => new Date(t).toLocaleDateString(NL, { weekday: 'short' }).replace('.', '');
    const last = D - 1;
    const diffs = p.map((d) => (d.fx != null && d.dy != null ? d.fx - d.dy : null));
    const dmax = Math.max(0.2, ...diffs.map((v) => Math.abs(v || 0)));
    e['con-days'].innerHTML = diffs
      .map((v, i) => {
        const bar = v == null ? '' : `<i class="${v >= 0 ? 'up' : 'dn'}" style="height:${Math.max(2, (Math.abs(v) / dmax) * 46).toFixed(0)}%;--bc:${v >= 0 ? 'var(--export)' : '#ff6b6b'}"></i>`;
        const lbl = v == null ? '' : `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v), 2)}`;
        return `<div class="${i === last ? 'now' : ''}"><em>${lbl}</em><div class="cz">${bar}</div><span>${wd(p[i].t)}</span></div>`;
      })
      .join('');

    // Score per day; today's self consumption from the live counters. A day needs 12 hours of data (today 3).
    const pct = (v) => `${v == null ? 0 : Math.max(2, v).toFixed(0)}%`;
    e['past-score'].innerHTML = p
      .map((d, i) => {
        const today = i === last;
        const ok = d.n >= (today ? 3 : 12);
        const sc = ok ? selfUse(today && live.so != null ? live.so : d.so || 0, today && live.ex != null ? live.ex : d.ex || 0) : null;
        const pr = ok ? d.pr : null;
        const s = avgOf([sc, pr]);
        const bars = s == null ? '' : `<i class="t" style="height:${pct(s)}"></i><i class="s" style="height:${pct(sc)}"></i><i class="p" style="height:${pct(pr)}"></i>`;
        return `<div class="${today ? 'now' : ''}" style="--sc:${scoreColor(s)}"><b>${s == null ? '–' : Math.round(s)}</b>
          <div class="sbars">${bars}</div><span>${today ? 'vandaag' : wd(d.t)}</span></div>`;
      })
      .join('');

    // Usage per day: solar, import, export on one kWh scale, gas as a number.
    const use = p.map((d, i) => (i === last ? { ...d, ...Object.fromEntries(Object.entries(live).filter(([, v]) => v != null)) } : d));
    const umax = Math.max(1, ...use.flatMap((d) => [d.so || 0, d.im || 0, d.ex || 0]));
    const col = (v, bc) => `<div><em>${v == null ? '' : fmt(v, 1)}</em><i style="height:${v == null ? 0 : Math.max(2, (v / umax) * 80).toFixed(0)}%;--bc:${bc}"></i></div>`;
    e['past-use'].innerHTML = use
      .map((d, i) => {
        const dt = new Date(d.t).toLocaleDateString(NL, { weekday: 'short', day: 'numeric' }).replace('.', '');
        return `<div><div class="ubars">${col(d.so, 'var(--solar)')}${col(d.im, 'var(--grid)')}${col(d.ex, 'var(--export)')}</div>
          <div class="ufoot"><span class="${i === last ? 'now' : ''}">${i === last ? 'vandaag' : dt}</span><em>${d.gas == null ? '' : fmt(d.gas, 1)}</em></div></div>`;
      })
      .join('');
  }

  _rooms() {
    const h = this._hass;
    let heatingN = 0;
    const rows = this._c.rooms
      .map(({ entity, name }) => {
        const s = h.states[entity];
        if (!s) return '';
        const a = s.attributes;
        const tgt = this._target(entity);
        const off = s.state === 'off' || tgt == null;
        const heating = a.hvac_action === 'heating';
        if (heating) heatingN += 1;
        const status = heating
          ? '<ha-icon icon="mdi:fire"></ha-icon>verwarmt'
          : off ? 'uit' : a.current_humidity != null ? `${Math.round(a.current_humidity)}% vocht` : '';
        return `<div class="glass room${heating ? ' heat' : ''}">
          <div class="rtop press" data-act="info" data-entity="${entity}"><b>${name || a.friendly_name}</b><span>${status}</span></div>
          <div class="cur">${fmt(a.current_temperature, 1)}°</div>
          <div class="ctl">
            <button class="press" data-act="climate" data-entity="${entity}" data-dir="-1"${off ? ' disabled' : ''} aria-label="lager">−</button>
            <div class="tgt${this._pendingTemp[entity] ? ' pend' : ''}"><small>doel</small>${off ? 'uit' : `${fmt(tgt, 1)}°`}</div>
            <button class="press" data-act="climate" data-entity="${entity}" data-dir="1"${off ? ' disabled' : ''} aria-label="hoger">+</button>
          </div></div>`;
      })
      .join('');
    this._set('rooms', this._el.rooms, rows + this._acRow());
    this._badge('klimaat', heatingN > 0, heatingN, 'var(--heat)');
    const w = h.states[this._c.hot_water];
    const won = w && w.state !== 'off';
    this._el.water.classList.toggle('on', !!won);
    this._set('water', this._el.water, w ? `<ha-icon icon="mdi:water-boiler"></ha-icon>warm water ${won ? 'aan' : 'uit'}` : '');
    const out = num(h, this._c.outdoor);
    this._set('outdoor', this._el.outdoor, out == null ? '' : `<ha-icon icon="mdi:thermometer"></ha-icon>buiten ${fmt(out, 1)}°`);
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
        return `<button class="glass lt press${isOn ? ' on' : ''}${this._pendingLight[entity] ? ' pend' : ''}" data-act="light" data-entity="${entity}"${na ? ' disabled' : ''}>
          <span class="i"><ha-icon icon="mdi:${isOn ? 'lightbulb-on' : 'lightbulb-outline'}"></ha-icon></span>
          <b>${name}</b><small>${label}</small></button>`;
      })
      .join('');
    this._set('lights', this._el.lgrid, tiles);
    this._el.lcount.textContent = on ? `${on} aan` : 'alles uit';
    this._badge('lampen', on > 0, on, '#ffc46b');
  }
}

customElements.define('homelab-ambient-panel', HomelabAmbientPanel);
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'homelab-ambient-panel',
  name: 'Homelab ambient panel',
  description: 'Full-screen home screen for the Nest Hub (put it in a panel view)',
});
