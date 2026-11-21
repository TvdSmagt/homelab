// Custom cards for the Nest Hub screen (homeassistant/dashboards/nest_hub.yaml), no dependencies.
//   custom:homelab-energy-flow-card   power widget: animated solar / grid / house flow, energy score badge,
//                                     thin 12-hour graph of solar vs house power, today's totals
//   custom:homelab-climate-card       all Tado rooms: current and target temperature, - / + buttons, hot water
//   custom:homelab-rain-card          rain forecast for the next 2 hours (sensor.rain_forecast)
// Plus a pixel shift against image retention, active on the Nest Hub (Cast receiver) only.
// Served as /local/homelab-energy-card.js (homeassistant/www is mounted at /config/www).
// Bump ?v= in configuration.yaml (lovelace: resources) after a change, the Nest caches it.

const NL = 'nl-NL';
const fmt = (v, d = 1) =>
  v == null || Number.isNaN(v) ? '–' : v.toLocaleString(NL, { minimumFractionDigits: d, maximumFractionDigits: d });
const power = (w) => (w >= 1000 ? `${fmt(w / 1000, 1)} kW` : `${Math.round(w)} W`);

function value(hass, id) {
  const s = id && hass.states[id];
  if (!s) return null;
  const v = parseFloat(s.state);
  return Number.isNaN(v) ? null : v;
}

function watts(hass, id) {
  const v = value(hass, id);
  if (v == null) return null;
  return hass.states[id].attributes.unit_of_measurement === 'kW' ? v * 1000 : v;
}

function moreInfo(el, entityId) {
  el.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }));
}

const scoreColor = (v) => (v == null ? 'var(--c-muted)' : v >= 70 ? '#34b47c' : v >= 45 ? '#f0a830' : '#e0605e');

const COLORS = `
  --c-solar: #f5a623;
  --c-grid: #9b7fd4;
  --c-export: #34b47c;
  --c-home: #3d8fe0;
  --c-heat: #e8743b;
  --c-muted: var(--secondary-text-color, #8a8a8a);
`;

// ── Power widget ────────────────────────────────────────────────────────────────────────────────
class HomelabEnergyFlowCard extends HTMLElement {
  setConfig(config) {
    this._c = {
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
      graph_hours: 12,
      ...config,
    };
  }

  getCardSize() {
    return 7;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._root) this._build();
    this._update();
    if (!this._histAt || Date.now() - this._histAt > 5 * 60 * 1000) this._loadHistory();
  }

  _build() {
    this._root = this.attachShadow({ mode: 'open' });
    this._root.innerHTML = `
      <style>
        :host { ${COLORS} }
        ha-card { padding: 14px 14px 12px; overflow: hidden; }
        .head { display: flex; align-items: center; gap: 12px; }
        .badge { width: 42px; height: 42px; border-radius: 50%; display: grid; place-items: center;
                 background: var(--accent); color: #fff; flex: none; transition: background .6s;
                 box-shadow: 0 0 0 5px color-mix(in srgb, var(--accent) 20%, transparent); }
        .htext { flex: 1; min-width: 0; }
        .title { font-size: 18px; font-weight: 600; line-height: 1.2; color: var(--accent); transition: color .6s; }
        .sub { font-size: 12px; color: var(--c-muted); margin-top: 2px; }
        .score { flex: none; display: flex; flex-direction: column; align-items: center; cursor: pointer;
                 color: var(--sc); line-height: 1; }
        .score .ring { display: flex; align-items: center; gap: 3px; padding: 5px 9px; border-radius: 16px;
                       background: color-mix(in srgb, var(--sc) 16%, transparent); }
        .score ha-icon { --mdc-icon-size: 18px; }
        .score b { font-size: 17px; }
        .score span { font-size: 10px; color: var(--c-muted); margin-top: 3px; }
        .flow { position: relative; aspect-ratio: 300 / 168; margin: 4px 0 34px; }
        .flow svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
        .line { fill: none; stroke-width: 3; opacity: .16; }
        .dots { fill: none; stroke-width: 6; stroke-linecap: round; stroke-dasharray: 0 16;
                animation: flow var(--d, 2s) linear infinite; opacity: 0; transition: opacity .8s; }
        .dots.on { opacity: 1; }
        @keyframes flow { to { stroke-dashoffset: -32; } }
        .solar { stroke: var(--c-solar); } .export { stroke: var(--c-export); } .grid { stroke: var(--c-grid); }
        .node { position: absolute; transform: translate(-50%, -50%); width: 58px; height: 58px; border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                background: var(--card-background-color, #fff); border: 3px solid var(--nc); color: var(--nc); }
        .node ha-icon { --mdc-icon-size: 24px; }
        .node.glow { box-shadow: 0 0 18px color-mix(in srgb, var(--nc) 55%, transparent); }
        .val { position: absolute; transform: translateX(-50%); font-size: 13px; font-weight: 600; white-space: nowrap;
               color: var(--primary-text-color); text-align: center; }
        .lbl { display: block; font-size: 11px; font-weight: 400; color: var(--c-muted); }
        .graph { margin: 0 0 10px; }
        .graph svg { display: block; width: 100%; height: 40px; }
        .g-solar { fill: color-mix(in srgb, var(--c-solar) 35%, transparent); stroke: var(--c-solar); stroke-width: 1.5; }
        .g-house { fill: none; stroke: var(--c-home); stroke-width: 1.8; }
        .g-base { stroke: var(--divider-color, rgba(127,127,127,.3)); stroke-width: 1; }
        .legend { display: flex; justify-content: space-between; font-size: 10px; color: var(--c-muted); margin-top: 2px; }
        .legend i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin: 0 3px 0 8px; vertical-align: -1px; }
        .today { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
        .chip { background: var(--secondary-background-color, rgba(127,127,127,.08)); border-radius: 10px;
                padding: 5px 8px; display: flex; align-items: center; gap: 6px; min-width: 0; }
        .chip ha-icon { --mdc-icon-size: 18px; color: var(--ic); flex: none; }
        .chip b { font-size: 13px; display: block; white-space: nowrap; }
        .chip span { font-size: 10px; color: var(--c-muted); display: block; }
      </style>
      <ha-card>
        <div class="head">
          <div class="badge"><ha-icon id="hicon"></ha-icon></div>
          <div class="htext"><div class="title" id="title"></div><div class="sub" id="sub"></div></div>
          <div class="score" id="score">
            <div class="ring"><ha-icon id="sicon" icon="mdi:leaf"></ha-icon><b id="snum">–</b></div>
            <span>energiescore</span>
          </div>
        </div>
        <div class="flow">
          <svg viewBox="0 0 300 168">
            <path class="line solar"  d="M150 56 C150 104 190 126 224 126"/>
            <path class="line export" d="M150 56 C150 104 110 126 76 126"/>
            <path class="line grid"   d="M76 140 L224 140"/>
            <path id="f-sh" class="dots solar"  d="M150 56 C150 104 190 126 224 126"/>
            <path id="f-sg" class="dots export" d="M150 56 C150 104 110 126 76 126"/>
            <path id="f-gh" class="dots grid"   d="M76 140 L224 140"/>
          </svg>
          <div class="node" id="n-solar" style="left:50%;top:17%;--nc:var(--c-solar)"><ha-icon icon="mdi:solar-power-variant"></ha-icon></div>
          <div class="node" id="n-grid"  style="left:15%;top:79%;--nc:var(--c-grid)"><ha-icon icon="mdi:transmission-tower"></ha-icon></div>
          <div class="node" id="n-home"  style="left:85%;top:79%;--nc:var(--c-home)"><ha-icon icon="mdi:home-lightning-bolt"></ha-icon></div>
          <div class="val" id="v-solar" style="left:70%;top:8%"></div>
          <div class="val" id="v-grid"  style="left:15%;top:98%"></div>
          <div class="val" id="v-home"  style="left:85%;top:98%"></div>
        </div>
        <div class="graph">
          <svg viewBox="0 0 300 40" preserveAspectRatio="none">
            <line class="g-base" x1="0" y1="39.5" x2="300" y2="39.5" vector-effect="non-scaling-stroke"/>
            <path id="g-solar" class="g-solar" vector-effect="non-scaling-stroke"/>
            <path id="g-house" class="g-house" vector-effect="non-scaling-stroke"/>
          </svg>
          <div class="legend"><span id="g-from"></span>
            <span><i style="background:var(--c-solar)"></i>zon<i style="background:var(--c-home)"></i>huis <b id="g-peak"></b></span>
            <span>nu</span></div>
        </div>
        <div class="today" id="today"></div>
      </ha-card>`;
    const $ = (id) => this._root.getElementById(id);
    this._el = {
      hicon: $('hicon'), title: $('title'), sub: $('sub'), card: this._root.querySelector('ha-card'),
      score: $('score'), snum: $('snum'), sicon: $('sicon'),
      sh: $('f-sh'), sg: $('f-sg'), gh: $('f-gh'),
      nSolar: $('n-solar'), nGrid: $('n-grid'), nHome: $('n-home'),
      vSolar: $('v-solar'), vGrid: $('v-grid'), vHome: $('v-home'), today: $('today'),
      gSolar: $('g-solar'), gHouse: $('g-house'), gPeak: $('g-peak'), gFrom: $('g-from'),
    };
    this._el.gFrom.textContent = `${this._c.graph_hours} uur geleden`;
    this._el.score.addEventListener('click', () => moreInfo(this, this._c.score));
  }

  _flow(el, w) {
    const on = w >= 15;
    el.classList.toggle('on', on);
    if (!on) return;
    // Faster dots for more power: ~2 s at 20 W, ~0.6 s at 1 kW and above.
    const d = Math.max(0.5, Math.min(2.2, 3 - Math.log10(Math.max(w, 10)) * 0.8)).toFixed(1);
    if (el.dataset.d !== d) {
      el.dataset.d = d;
      el.style.setProperty('--d', `${d}s`);
    }
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
      this._drawGraph(start.getTime(), end.getTime(), series);
    } catch (err) {
      console.warn('homelab-energy-flow-card: history failed', err);
    } finally {
      this._loading = false;
    }
  }

  _drawGraph(t0, t1, [solarPts, housePts]) {
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
          const v = Number.isNaN(pts[j][1]) ? 0 : pts[j][1]; // unavailable (solar at night) = 0
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
    const x = (b) => ((b / (N - 1)) * 300).toFixed(1);
    const y = (v) => (39 - (Math.max(v, 0) / peak) * 36).toFixed(1);
    const line = (vals) => vals.map((v, b) => `${b ? 'L' : 'M'}${x(b)} ${y(v)}`).join(' ');
    this._el.gSolar.setAttribute('d', `${line(solar)} L300 39 L0 39 Z`);
    this._el.gHouse.setAttribute('d', line(house));
    this._el.gPeak.textContent = `· piek ${power(Math.max(...solar, ...house))}`;
  }

  _update() {
    const h = this._hass;
    const c = this._c;
    const e = this._el;
    const solar = Math.max(watts(h, c.solar) ?? 0, 0); // Grott is unavailable at night: 0 W
    const imp = Math.max(watts(h, c.import) ?? 0, 0);
    const exp = Math.max(watts(h, c.export) ?? 0, 0);
    const house = Math.max(solar + imp - exp, 0);
    const solarToHouse = Math.max(solar - exp, 0);

    this._flow(e.sh, solarToHouse);
    this._flow(e.sg, exp);
    this._flow(e.gh, imp);
    e.nSolar.classList.toggle('glow', solar >= 15);
    e.nGrid.classList.toggle('glow', imp >= 15 || exp >= 15);
    e.nGrid.style.setProperty('--nc', exp >= 15 ? 'var(--c-export)' : 'var(--c-grid)');
    e.vSolar.innerHTML = `${power(solar)}<span class="lbl">zon</span>`;
    e.vGrid.innerHTML = exp >= 15 ? `${power(exp)}<span class="lbl">terug</span>` : `${power(imp)}<span class="lbl">van net</span>`;
    e.vHome.innerHTML = `${power(house)}<span class="lbl">huis</span>`;

    let accent, icon, title, sub;
    if (exp >= 30) {
      accent = 'var(--c-export)'; icon = 'mdi:transmission-tower-export';
      title = 'We leveren terug';
      sub = `${power(exp)} naar het net, zon levert ${power(solar)}`;
    } else if (solar >= 30) {
      const share = house > 0 ? Math.min(100, Math.round((solarToHouse / house) * 100)) : 100;
      accent = 'var(--c-solar)'; icon = 'mdi:solar-power-variant';
      if (imp < 30) {
        title = 'Op eigen zonnestroom';
        sub = `zon dekt het hele verbruik van ${power(house)}`;
      } else {
        title = 'Zon helpt mee';
        sub = `${share}% van het verbruik komt van de zon`;
      }
    } else {
      accent = 'var(--c-grid)'; icon = 'mdi:transmission-tower-import';
      title = 'Stroom van het net';
      sub = `het huis gebruikt ${power(house)}`;
    }
    e.card.style.setProperty('--accent', accent);
    if (e.hicon.getAttribute('icon') !== icon) e.hicon.setAttribute('icon', icon);
    e.title.textContent = title;
    e.sub.textContent = sub;

    // Energy score badge: leaf colour by score, tap for details (history of the score sensor).
    const score = value(h, c.score);
    const sc = value(h, c.self_consumption);
    const pr = value(h, c.price);
    e.score.style.setProperty('--sc', scoreColor(score));
    e.snum.textContent = score == null ? '–' : Math.round(score);
    const icon2 = score == null || score < 45 ? 'mdi:leaf-off' : 'mdi:leaf';
    if (e.sicon.getAttribute('icon') !== icon2) e.sicon.setAttribute('icon', icon2);
    e.score.title = `Eigen zon benut ${sc == null ? '–' : `${Math.round(sc)}%`}, slim getimed ${pr == null ? '–' : `${Math.round(pr)}%`}`;

    const sT = value(h, c.solar_today), iT = value(h, c.import_today), xT = value(h, c.export_today);
    const use = sT != null && iT != null && xT != null ? sT - xT + iT : null;
    const chips = [
      ['mdi:solar-power-variant', 'var(--c-solar)', `${fmt(sT)} kWh`, 'zon'],
      ['mdi:home-lightning-bolt', 'var(--c-home)', `${fmt(use)} kWh`, 'verbruik'],
      ['mdi:transmission-tower-import', 'var(--c-grid)', `${fmt(iT)} kWh`, 'van net'],
      ['mdi:transmission-tower-export', 'var(--c-export)', `${fmt(xT)} kWh`, 'terug'],
      ['mdi:fire', 'var(--c-heat)', `${fmt(value(h, c.gas_today), 2)} m³`, 'gas'],
      ['mdi:cash', 'var(--c-muted)', `€ ${fmt(value(h, c.cost_today), 2)}`, 'kosten'],
    ];
    const html = chips
      .map(([i, col, v, l]) => `<div class="chip" style="--ic:${col}"><ha-icon icon="${i}"></ha-icon><div><b>${v}</b><span>${l} vandaag</span></div></div>`)
      .join('');
    if (this._todayHtml !== html) {
      this._todayHtml = html;
      e.today.innerHTML = html;
    }
  }
}

// ── Climate: all Tado rooms ─────────────────────────────────────────────────────────────────────
// - / + change the target by 0.5 °C. Presses are collected for 2 s and sent as one call per room,
// because Tado limits the number of API calls per day.
class HomelabClimateCard extends HTMLElement {
  setConfig(config) {
    this._c = {
      title: 'Klimaat',
      rooms: [
        { entity: 'climate.woonkamer_woonkamer', name: 'Woonkamer' },
        { entity: 'climate.beneden_beneden', name: 'Beneden' },
        { entity: 'climate.bibliotheek_bibliotheek', name: 'Bibliotheek' },
        { entity: 'climate.kleine_kamer_kleine_kamer', name: 'Kleine kamer' },
      ],
      hot_water: 'water_heater.warm_water_warm_water',
      outdoor: 'sensor.koekelberg25_outdoor_temperature',
      step: 0.5,
      ...config,
    };
    this._pending = {};
    this._timers = {};
  }

  getCardSize() {
    return 5;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._root) this._build();
    this._update();
  }

  _build() {
    this._root = this.attachShadow({ mode: 'open' });
    this._root.innerHTML = `
      <style>
        :host { ${COLORS} }
        ha-card { padding: 12px 14px 8px; }
        .top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px; }
        .top b { font-size: 16px; }
        .top span { font-size: 12px; color: var(--c-muted); }
        .row { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 10px; padding: 5px 0;
               border-top: 1px solid var(--divider-color, rgba(127,127,127,.2)); }
        .row:first-child { border-top: none; }
        .name { min-width: 0; cursor: pointer; }
        .name b { display: block; font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .name span { display: flex; align-items: center; gap: 3px; font-size: 11px; color: var(--c-muted); }
        .name ha-icon { --mdc-icon-size: 13px; }
        .heat .name span { color: var(--c-heat); }
        .cur { font-size: 20px; font-weight: 600; min-width: 52px; text-align: right; }
        .heat .cur { color: var(--c-heat); }
        .ctl { display: flex; align-items: center; gap: 4px; }
        button { width: 34px; height: 34px; border-radius: 50%; border: none; font-size: 20px; line-height: 1;
                 background: var(--secondary-background-color, rgba(127,127,127,.12)); color: var(--primary-text-color);
                 cursor: pointer; padding: 0; }
        button:active { background: color-mix(in srgb, var(--c-home) 35%, transparent); }
        button:disabled { opacity: .3; }
        .tgt { min-width: 44px; text-align: center; font-size: 14px; color: var(--c-muted); }
        .tgt.pend { color: var(--c-home); font-weight: 600; }
        .water { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--c-muted); padding: 6px 0 2px;
                 border-top: 1px solid var(--divider-color, rgba(127,127,127,.2)); }
        .water ha-icon { --mdc-icon-size: 16px; }
      </style>
      <ha-card>
        <div class="top"><b>${this._c.title}</b><span id="outdoor"></span></div>
        <div id="rows"></div>
        <div class="water" id="water"></div>
      </ha-card>`;
    this._root.getElementById('rows').addEventListener('click', (ev) => {
      const btn = ev.target.closest('button');
      if (btn && !btn.disabled) {
        this._step(btn.dataset.entity, Number(btn.dataset.dir));
        return;
      }
      const name = ev.target.closest('.name');
      if (name) moreInfo(this, name.dataset.entity);
    });
  }

  _target(id) {
    const s = this._hass.states[id];
    const actual = s ? s.attributes.temperature : null;
    const p = this._pending[id];
    if (p) {
      // Keep showing the new target until Tado reports it, at most 60 s after sending.
      if (actual === p.value || (p.sent && Date.now() - p.sent > 60000)) delete this._pending[id];
      else return p.value;
    }
    return actual;
  }

  _step(id, dir) {
    const cur = this._target(id);
    if (cur == null) return;
    const v = Math.min(25, Math.max(5, Math.round((cur + dir * this._c.step) * 2) / 2));
    this._pending[id] = { value: v, sent: null };
    clearTimeout(this._timers[id]);
    this._timers[id] = setTimeout(() => {
      this._hass.callService('climate', 'set_temperature', { entity_id: id, temperature: v });
      if (this._pending[id]) this._pending[id].sent = Date.now();
    }, 2000);
    this._update();
  }

  _update() {
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
        return `<div class="row${heating ? ' heat' : ''}">
          <div class="name" data-entity="${entity}"><b>${name || a.friendly_name}</b><span>${status}</span></div>
          <div class="cur">${fmt(a.current_temperature, 1)}°</div>
          <div class="ctl">
            <button data-entity="${entity}" data-dir="-1"${off ? ' disabled' : ''} aria-label="lager">−</button>
            <div class="tgt${this._pending[entity] ? ' pend' : ''}">${off ? 'uit' : `${fmt(tgt, 1)}°`}</div>
            <button data-entity="${entity}" data-dir="1"${off ? ' disabled' : ''} aria-label="hoger">+</button>
          </div></div>`;
      })
      .join('');
    if (rows !== this._rowsHtml) {
      this._rowsHtml = rows;
      this._root.getElementById('rows').innerHTML = rows;
    }
    const w = h.states[this._c.hot_water];
    const water = w ? `<ha-icon icon="mdi:water-boiler"></ha-icon>Warm water ${w.state === 'off' ? 'uit' : 'aan'}` : '';
    if (water !== this._waterHtml) {
      this._waterHtml = water;
      this._root.getElementById('water').innerHTML = water;
    }
    const out = value(h, this._c.outdoor);
    this._root.getElementById('outdoor').textContent = out == null ? '' : `buiten ${fmt(out, 1)}°`;
  }
}

// ── Rain forecast, next 2 hours (Buienradar / KNMI radar) ──────────────────────────────────────
class HomelabRainCard extends HTMLElement {
  setConfig(config) {
    this._c = { entity: 'sensor.rain_forecast', ...config };
  }

  getCardSize() {
    return 3;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._root) this._build();
    const s = hass.states[this._c.entity];
    const raw = s ? s.state : '';
    if (raw !== this._raw) {
      this._raw = raw;
      this._update(raw);
    }
  }

  _build() {
    this._root = this.attachShadow({ mode: 'open' });
    this._root.innerHTML = `
      <style>
        :host { ${COLORS} --c-rain: #3d8fe0; }
        ha-card { padding: 12px 14px 10px; }
        .head { display: flex; align-items: center; gap: 10px; }
        .head ha-icon { --mdc-icon-size: 26px; color: var(--ri); flex: none; }
        .title { font-size: 16px; font-weight: 600; line-height: 1.2; }
        .sub { font-size: 12px; color: var(--c-muted); }
        .chart { position: relative; height: 64px; margin-top: 10px; display: flex; align-items: flex-end; gap: 2px;
                 border-bottom: 1px solid var(--divider-color, rgba(127,127,127,.3)); }
        .chart i { flex: 1; border-radius: 3px 3px 0 0; background: var(--c-rain); min-height: 2px; opacity: .9;
                   transition: height .8s ease; }
        .chart i.dry { background: var(--secondary-background-color, rgba(127,127,127,.15)); }
        .axis { display: flex; justify-content: space-between; font-size: 11px; color: var(--c-muted); margin-top: 3px; }
      </style>
      <ha-card>
        <div class="head"><ha-icon id="icon"></ha-icon>
          <div><div class="title" id="title">Regenverwachting</div><div class="sub" id="sub"></div></div></div>
        <div class="chart" id="chart"></div>
        <div class="axis"><span>nu</span><span>+30</span><span>+60</span><span>+90</span><span>+2 uur</span></div>
      </ha-card>`;
  }

  _update(raw) {
    const $ = (id) => this._root.getElementById(id);
    const [start, list] = (raw || '').split('|');
    const mm = (list || '').split(',').map(parseFloat).filter((v) => !Number.isNaN(v));
    const card = this._root.querySelector('ha-card');
    if (!start || mm.length === 0) {
      $('icon').setAttribute('icon', 'mdi:weather-cloudy-alert');
      $('title').textContent = 'Regenverwachting';
      $('sub').textContent = 'geen gegevens van Buienradar';
      $('chart').innerHTML = '';
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
      icon = 'mdi:weather-partly-cloudy'; title = 'Droog de komende 2 uur';
      sub = `tot ${at(mm.length)} geen regen verwacht`;
    } else if (first === 0) {
      const dry = mm.findIndex((v) => !wet(v));
      icon = 'mdi:weather-pouring';
      title = dry === -1 ? `${kind(peak)[0].toUpperCase()}${kind(peak).slice(1)} de komende 2 uur` : `Het regent, droog rond ${at(dry)}`;
      sub = `tot ${fmt(peak, 1)} mm/u`;
    } else {
      icon = 'mdi:weather-rainy';
      title = `${kind(peak)[0].toUpperCase()}${kind(peak).slice(1)} om ${at(first)}`;
      sub = `over ${first * 5} min, tot ${fmt(peak, 1)} mm/u`;
    }
    card.style.setProperty('--ri', first === -1 ? 'var(--c-solar)' : 'var(--c-rain)');
    $('icon').setAttribute('icon', icon);
    $('title').textContent = title;
    $('sub').textContent = sub;
    // Square-root scale up to 5 mm/h, so drizzle is visible and showers do not flatten the rest.
    $('chart').innerHTML = mm
      .map((v) => `<i class="${wet(v) ? '' : 'dry'}" style="height:${wet(v) ? Math.max(8, Math.min(100, Math.sqrt(v / 5) * 100)) : 3}%"></i>`)
      .join('');
  }
}

// ── Burn-in guard: on the Cast receiver (the Nest Hub) only, shift the whole page a few pixels every
// 5 minutes in a slow loop, so static edges and text do not sit on the same pixels all day.
(() => {
  const isCast = location.host === 'cast.home-assistant.io' || /CrKey/.test(navigator.userAgent);
  if (!isCast || window.__homelabPixelShift) return;
  window.__homelabPixelShift = true;
  const steps = [[0, 0], [3, 1], [4, 4], [1, 5], [-2, 3], [-4, 0], [-3, -3], [0, -4], [3, -2]];
  let i = 0;
  setInterval(() => {
    // The full-screen panel (homelab-ambient-panel.js) shifts its own layout.
    if (window.__homelabPanel) {
      document.body.style.transform = '';
      return;
    }
    i = (i + 1) % steps.length;
    const [x, y] = steps[i];
    document.body.style.transition = 'transform 3s ease-in-out';
    document.body.style.transform = `translate(${x}px, ${y}px)`;
  }, 5 * 60 * 1000);
})();

customElements.define('homelab-energy-flow-card', HomelabEnergyFlowCard);
customElements.define('homelab-climate-card', HomelabClimateCard);
customElements.define('homelab-rain-card', HomelabRainCard);
window.customCards = window.customCards || [];
window.customCards.push(
  { type: 'homelab-energy-flow-card', name: 'Homelab power', description: 'Solar / grid / house flow, score, graph' },
  { type: 'homelab-climate-card', name: 'Homelab climate', description: 'All Tado rooms with - / +' },
  { type: 'homelab-rain-card', name: 'Homelab rain forecast', description: 'Rain next 2 hours (Buienradar)' },
);
