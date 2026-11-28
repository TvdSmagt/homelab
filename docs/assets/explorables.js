// Explorables for the docs site: interactive widgets that show how the setup behaves.
// Use in Markdown with <div data-xp="NAME"></div>; NAME is a key of W below. No dependencies.
// The numbers and texts mirror the real config (packages, health.jinja): change them together.
(() => {
  'use strict';

  // ---------- helpers ----------
  const h = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'on') for (const [ev, f] of Object.entries(v)) e.addEventListener(ev, f);
      else if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else e.setAttribute(k, v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
    return e;
  };
  const nl = (x, d = 1) => x.toFixed(d).replace('.', ',');           // Dutch decimals, as on the panel
  const signed = (x, d = 1) => (x > 0 ? '+' : x < 0 ? '−' : '') + nl(Math.abs(x), d);
  const eur = (x, d = 3) => '€ ' + x.toFixed(d).replace('.', ',');
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const box = (root, title) => { root.classList.add('xp'); if (title) root.append(h('div', { class: 'xp-h' }, title)); return root; };

  function slider(parent, label, o, on) {
    const val = h('span', { class: 'xp-v' });
    const inp = h('input', { type: 'range', min: o.min, max: o.max, step: o.step, value: o.value });
    const row = h('label', { class: 'xp-sl' }, h('span', {}, label), inp, val);
    const s = {
      get v() { return +inp.value; },
      set v(x) { inp.value = x; val.textContent = o.fmt(+inp.value); },
      row,
    };
    inp.addEventListener('input', () => { val.textContent = o.fmt(+inp.value); on(); });
    val.textContent = o.fmt(+inp.value);
    parent.append(row);
    return s;
  }
  function seg(parent, label, options, value, on) {
    const row = h('div', { class: 'xp-row' }, label ? h('span', { class: 'xp-l' }, label) : null);
    const s = { v: value, btns: {} };
    for (const [k, text] of options) {
      const b = h('button', { class: 'xp-chip', type: 'button', on: { click: () => { s.set(k); on(); } } }, text);
      s.btns[k] = b; row.append(b);
    }
    s.set = (k) => { s.v = k; for (const [kk, b] of Object.entries(s.btns)) b.classList.toggle('on', kk === k); };
    s.set(value); s.row = row;
    parent.append(row);
    return s;
  }
  function check(parent, label, value, on) {
    const inp = h('input', { type: 'checkbox' }); inp.checked = value;
    inp.addEventListener('change', on);
    parent.append(h('label', { class: 'xp-ck' }, inp, ' ', label));
    return { get v() { return inp.checked; }, set v(x) { inp.checked = x; } };
  }
  // A Status-slide item as the panel draws it.
  const item = (level, title, detail) =>
    h('div', { class: 'xp-item ' + level }, h('b', {}, title), h('div', {}, detail));
  const badge = (cls, text) => h('span', { class: 'xp-b ' + cls }, text);
  const bars = (rows, max) => h('div', { class: 'xp-bars' }, rows.map(([label, v, cls, txt]) =>
    h('div', { class: 'xp-bar' }, h('span', {}, label),
      h('div', {}, h('i', { class: cls || '', style: `width:${clamp(v / max, 0, 1) * 100}%` })), h('span', {}, txt))));

  const W = {};

  // ---------- Home: what still works when something is down ----------
  W.stack = (root) => {
    box(root, 'What still works when ... is down? Click a part to switch it off.');
    const comps = [
      ['pi', 'home-pi (power, SD card)'], ['ha', 'Home Assistant'], ['mq', 'Mosquitto'], ['gr', 'Grott'],
      ['ca', 'Caddy'], ['mt', 'otbr + Matter'], ['net', 'Internet'], ['tado', 'Tado cloud'], ['lg', 'LG ThinQ cloud'],
      ['hue', 'Hue Bridge'],
    ];
    const names = Object.fromEntries(comps);
    const onPi = ['ha', 'mq', 'gr', 'ca', 'mt'];
    // [feature, requires, partial: [[part, text]]]
    const feats = [
      ['Heating on its Tado schedule', [], [['tado', 'keeps running: valves and thermostat do not need the cloud']]],
      ['Hue lights with the wall switches', ['hue'], []],
      ['Lights and heating from HA / the Nest Hub', ['pi', 'ha'], [['hue', 'lights stop'], ['tado', 'heating controls stop']]],
      ['Nest Hub screen', ['pi', 'ha', 'ca', 'net'], [['tado', 'Klimaat slide without rooms'], ['lg', 'no airco row']]],
      ['Electricity and gas from the P1 meter', ['pi', 'ha'], []],
      ['Solar production in HA', ['pi', 'gr', 'mq', 'ha'], []],
      ['Growatt app / portal', ['pi', 'gr', 'net'], []],
      ['Solar heating with the airco', ['pi', 'ha', 'lg'], []],
      ['Dynamic prices, weather, rain, contract compare', ['pi', 'ha', 'net'], []],
      ['Status slide (health monitor)', ['pi', 'ha', 'ca', 'net'], [['tado', 'shows "Tado onbereikbaar"'], ['hue', 'shows "Hue Bridge onbereikbaar"']]],
      ['Matter plugs (none yet)', ['pi', 'ha', 'mt'], []],
      ['These docs', ['pi', 'ca'], []],
    ];
    const down = new Set();
    const chips = h('div', { class: 'xp-row' });
    const out = h('div', { class: 'xp-list' });
    const why = { gr: 'Grott is the proxy between the datalogger and Growatt', ca: 'the Nest loads HA over HTTPS via Caddy' };
    for (const [id, label] of comps) {
      chips.append(h('button', { class: 'xp-chip', type: 'button', on: { click: (e) => {
        down.has(id) ? down.delete(id) : down.add(id); e.target.classList.toggle('down'); render();
      } } }, label));
    }
    const reset = h('button', { class: 'xp-chip ghost', type: 'button', on: { click: () => {
      down.clear(); chips.querySelectorAll('.down').forEach((b) => b.classList.remove('down')); render();
    } } }, 'reset');
    chips.append(reset);
    root.append(chips, out);
    function render() {
      const eff = new Set(down);
      if (eff.has('pi')) onPi.forEach((c) => eff.add(c));
      if (eff.has('net')) { eff.add('tado'); eff.add('lg'); }
      out.replaceChildren();
      for (const [name, req, partial] of feats) {
        const miss = req.filter((c) => eff.has(c));
        const part = partial.filter(([c]) => eff.has(c));
        let st, note;
        if (miss.length) {
          st = badge('bad', 'stops');
          note = 'because ' + miss.map((c) => names[c]).join(', ') + (miss.length > 1 ? ' are' : ' is') + ' down'
            + (why[miss[0]] && miss[0] !== 'pi' ? ' (' + why[miss[0]] + ')' : '');
        } else if (part.length) {
          const keeps = part[0][1].startsWith('keeps');
          st = badge(keeps ? 'ok' : 'part', keeps ? 'works' : 'partly');
          note = part.map(([, t]) => t).join('; ');
        } else { st = badge('ok', 'works'); note = ''; }
        out.append(h('div', { class: 'xp-li' }, st, h('span', {}, name), h('small', {}, note)));
      }
    }
    render();
  };

  // ---------- HA setup: where does it live, how to load it ----------
  W.config = (root) => {
    box(root, 'I want to change ...');
    const C = {
      template: ['A template sensor', 'homeassistant/packages/<feature>.yaml, under template:', 'call template/reload', 'git'],
      auto: ['An automation or script', 'homeassistant/packages/<feature>.yaml, under automation: / script:', 'call automation/reload  # or script/reload', 'git', 'The UI editor shows it read-only.'],
      helper: ['A helper (input_boolean, input_number, ...)', 'homeassistant/packages/<feature>.yaml', 'call input_number/reload  # same per input_* domain', 'git (definition); the value lives in .storage', 'No initial: in YAML, so a value set in the UI survives restarts.'],
      stats: ['A statistics or REST sensor', 'homeassistant/packages/<feature>.yaml, under sensor: / rest:', 'call statistics/reload  # or rest/reload', 'git'],
      macro: ['A Jinja macro', 'homeassistant/custom_templates/<name>.jinja', 'call homeassistant/reload_custom_templates\ncall template/reload', 'git'],
      pkg: ['A new package, utility_meter or integration sensor', 'homeassistant/packages/<feature>.yaml', 'docker exec homeassistant python3 -m homeassistant --script check_config --config /config\ndocker restart homeassistant', 'git', 'These cannot be reloaded. Without the check, a typo drops the whole package.'],
      card: ['A custom card (www/*.js)', 'homeassistant/www/<card>.js', 'scripts/deploy-panel.sh', 'git', 'Bumps ?v= so the Nest Hub and browsers do not use the cached file. Preview first: scripts/panel-preview.sh'],
      dash: ['A YAML dashboard', 'homeassistant/dashboards/<name>.yaml', 'refresh the browser; on the Nest: call script/turn_on \'{"entity_id":"script.nest_hub_restart_dashboard"}\'', 'git'],
      integ: ['An integration or device', 'UI: Settings → Devices & services', 'loads at once', 'tar backup of data/homeassistant', 'Not in git. Write it down in Integrations.'],
      rename: ['An entity id or name', 'UI: the entity\'s settings', 'at once', 'tar backup of data/homeassistant', 'Packages refer to entity ids: renaming one breaks them. Renaming a device (e.g. a Tado valve) is safe and shows on the Status slide.'],
      core: ['configuration.yaml', 'data/homeassistant/configuration.yaml (owned by root, not in git)', 'docker exec homeassistant python3 -m homeassistant --script check_config --config /config\ndocker restart homeassistant', 'tar backup of data/homeassistant', 'Only wires in the repo folders, card resources and YAML dashboards.'],
    };
    const out = h('div', { class: 'xp-out' });
    const s = seg(root, '', Object.entries(C).map(([k, v]) => [k, v[0]]), 'template', render);
    s.row.classList.add('wrap');
    root.append(out);
    function render() {
      const [, where, load, backup, note] = C[s.v];
      out.replaceChildren(h('dl', { class: 'xp-dl' },
        h('dt', {}, 'Where'), h('dd', {}, h('code', {}, where)),
        h('dt', {}, 'Load it'), h('dd', {}, h('pre', {}, h('code', {}, load))),
        h('dt', {}, 'Backed up by'), h('dd', {}, backup),
        note ? [h('dt', {}, 'Mind'), h('dd', {}, note)] : null));
    }
    render();
  };

  // ---------- HA setup: entity ids from names ----------
  W.naming = (root) => {
    box(root, 'Which entity ids will it get?');
    const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const mk = (label, v) => { const i = h('input', { type: 'text', value: v, on: { input: render } }); root.append(h('label', { class: 'xp-sl' }, h('span', {}, label), i, h('span'))); return i; };
    const zone = mk('Tado zone', 'Woonkamer'), room = mk('Hue room', 'Keuken'), dev = mk('Hue switch name', 'Keuken switch'), pkg = mk('Package sensor name', 'Home health');
    const out = h('pre', { class: 'xp-pre' }); root.append(out);
    function render() {
      const z = slug(zone.value), r = slug(room.value), d = slug(dev.value), p = slug(pkg.value);
      out.textContent = [
        `climate.${z}_${z}`, `sensor.${z}_${z}_temperature`, `sensor.${z}_${z}_heating`,
        `sensor.${r}_${d}_battery`, `event.${r}_${d}_button_1`, `sensor.${p}`,
      ].join('\n');
    }
    render();
  };

  // ---------- Health monitor: does the room warm up? ----------
  W.heating = (root) => {
    box(root, 'Room check: when does the Status slide speak up?');
    const presets = {
      normal: ['Heating normally', 80, 0.8, 19.2, 20, true],
      raised: ['Target just raised', 30, 0.1, 18.0, 20, true],
      keep: ['Holding the target', 55, 0.05, 20.0, 20, true],
      window: ['Window open', 95, 0.0, 17.5, 20, true],
      boiler: ['Boiler in fault', 100, -0.2, 18.0, 20, false],
    };
    const p = seg(root, '', Object.entries(presets).map(([k, v]) => [k, v[0]]), 'window', () => load(p.v));
    const dem = slider(root, 'Heating demand, 2 h average', { min: 0, max: 100, step: 5, value: 95, fmt: (x) => x + ' %' }, free);
    const rise = slider(root, 'Temperature rise in 2 h', { min: -0.5, max: 1.5, step: 0.05, value: 0, fmt: (x) => signed(x, 2) + ' °' }, free);
    const cur = slider(root, 'Room now', { min: 15, max: 22, step: 0.1, value: 17.5, fmt: (x) => nl(x) + ' °' }, free);
    const tgt = slider(root, 'Target', { min: 15, max: 23, step: 0.5, value: 20, fmt: (x) => nl(x) + ' °' }, free);
    const gas = check(root, 'Gas meter moved in the last 3 h', true, free);
    const svg = h('div', { class: 'xp-svg' }), conds = h('div', { class: 'xp-row' }), out = h('div', { class: 'xp-items' });
    root.append(svg, conds, out);
    function load(k) { const v = presets[k]; dem.v = v[1]; rise.v = v[2]; cur.v = v[3]; tgt.v = v[4]; gas.v = v[5]; render(); }
    function free() { p.set(null); render(); }
    function render() {
      const c1 = dem.v >= 50, c2 = cur.v <= tgt.v - 0.3, c3 = rise.v < 0.3;
      conds.replaceChildren(
        badge(c1 ? 'bad' : 'ok', 'demand ≥ 50 %'), badge(c2 ? 'bad' : 'ok', '≥ 0,3° below target'),
        badge(c3 ? 'bad' : 'ok', 'rose < 0,3°'), h('small', {}, 'all three red = problem'));
      out.replaceChildren();
      if (c1 && c2 && c3) out.append(item('warn', 'Woonkamer warmt niet op',
        `Al 2 uur warmtevraag (gemiddeld ${dem.v} %), maar ${nl(cur.v)}° bij doel ${nl(tgt.v)}° (${signed(rise.v)}° in 2 uur). Raam open, kraan vast, lucht in de radiator?`));
      if (c1 && !gas.v) out.append(item('warn', 'CV-ketel brandt niet',
        '1 kamer vraagt al 2 uur warmte, maar de gasmeter staat al 3 uur stil. Kijk op de ketel: storingscode, waterdruk (1,5-2 bar).'));
      if (!out.children.length) out.append(h('div', { class: 'xp-item ok' }, h('b', {}, 'Nothing listed'), h('div', {}, 'The Status slide stays hidden.')));
      // 2-hour sketch: temperature line, target, demand as a band
      const lo = Math.min(cur.v - Math.max(rise.v, 0), tgt.v) - 0.7, hi = Math.max(cur.v, tgt.v, cur.v - rise.v) + 0.5;
      const y = (t) => 8 + (1 - (t - lo) / (hi - lo)) * 70;
      svg.innerHTML = `<svg viewBox="0 0 300 110" role="img" aria-label="2 hour sketch">
        <rect x="0" y="${98 - dem.v * 0.12}" width="300" height="${dem.v * 0.12}" class="dem"/><text x="150" y="96" text-anchor="middle">demand ${dem.v} %</text>
        <line x1="0" x2="300" y1="${y(tgt.v)}" y2="${y(tgt.v)}" class="tgt"/>
        <line x1="0" x2="300" y1="${y(cur.v - rise.v)}" y2="${y(cur.v)}" class="cur"/>
        <text x="4" y="${y(tgt.v) - 3}">target ${nl(tgt.v)}°</text>
        <text x="296" y="${y(cur.v) + 12}" text-anchor="end">${nl(cur.v)}°</text>
        <text x="4" y="108">−2 h</text><text x="296" y="108" text-anchor="end">now</text></svg>`;
    }
    load('window');
  };

  // ---------- Health monitor: batteries and offline devices ----------
  W.battery = (root) => {
    box(root, 'Batteries and offline devices');
    const D = {
      dimmer: ['Hue dimmer (RWL021)', 'hue', 'CR2450'], tap: ['Hue tap dial (RDM002)', 'hue', 'CR2032'],
      wall: ['Hue wall module (RDM001)', 'hue', 'CR2450'], valve: ['Tado valve (VA02)', 'tado', '2× AA', 'Radiatorkraan'],
      thermo: ['Tado thermostat (RU01)', 'tado', '3× AAA', 'Thermostaat'],
    };
    const d = seg(root, '', Object.entries(D).map(([k, v]) => [k, v[0]]), 'dimmer', render);
    const pct = slider(root, 'Battery now', { min: 0, max: 100, step: 1, value: 2, fmt: (x) => x + ' %' }, render);
    const old = slider(root, 'A week ago', { min: 0, max: 100, step: 1, value: 5, fmt: (x) => x + ' %' }, render);
    const low = h('div'); root.append(low);
    const lowC = check(low, 'Tado reports battery low', true, render);
    const ren = check(low, 'Renamed in HA ("Kraan woonkamer")', false, render);
    const off = slider(root, 'Offline for', { min: 0, max: 60, step: 1, value: 0, fmt: (x) => x + ' min' }, render);
    const out = h('div', { class: 'xp-items' }); root.append(out);
    const since = (m) => { const t = new Date(Date.now() - m * 60000), z = (n) => String(n).padStart(2, '0');
      return `${z(t.getDate())}-${z(t.getMonth() + 1)} ${z(t.getHours())}:${z(t.getMinutes())}`; };
    function render() {
      const [, kind, cell, kname] = D[d.v], hue = kind === 'hue';
      pct.row.hidden = old.row.hidden = !hue; low.hidden = hue;
      out.replaceChildren();
      if (hue) {
        const name = 'Keuken switch';
        if (off.v >= 10) out.append(item('warn', `${name} geen verbinding`, `Sinds ${since(off.v)}. Meestal is de batterij leeg: ${cell}. Anders te ver van een lamp of de bridge.`));
        else if (pct.v <= 5) {
          const dd = pct.v - old.v;
          const tr = dd === 0 ? `Afgelopen week gelijk gebleven (${pct.v} %). ` : `Afgelopen week ${signed(dd, 0)} % (${old.v} → ${pct.v} %). `;
          out.append(item('info', `${name}: batterij ${pct.v} %`, `${tr}Nieuwe batterij: ${cell}.`));
        }
      } else {
        const label = ren.v ? 'Kraan woonkamer' : kname, serial = ren.v ? '' : (d.v === 'valve' ? 'VA0000000000' : 'RU0000000000') + ' · ';
        if (off.v >= 10) out.append(item('warn', `${label} geen verbinding`, `${serial}Sinds ${since(off.v)}. Meestal lege batterijen (${cell}, alkaline), anders te ver van de bridge.`));
        if (lowC.v) out.append(item('info', `${label}: batterij bijna leeg`, `${serial}Vervangen door ${cell} (alkaline, geen oplaadbare).`));
      }
      if (!out.children.length) out.append(h('div', { class: 'xp-item ok' }, h('b', {}, 'Not listed'),
        h('div', {}, off.v > 0 ? 'Offline counts only after 10 minutes, so restarts and blips stay quiet.' : hue ? 'Hue batteries are listed at 5 % or less.' : 'Nothing to report.')));
    }
    render();
  };

  // ---------- Solar heating: what the automation does next ----------
  W.solar = (root) => {
    box(root, 'Solar heating: what happens next?');
    const grid = slider(root, 'Grid, 5-min average', { min: -2500, max: 1500, step: 50, value: -900, fmt: (x) => x < 0 ? `export ${-x} W` : `import ${x} W` }, render);
    const dt = slider(root, 'Room (Tado) vs target', { min: -2, max: 0.5, step: 0.1, value: -1.2, fmt: (x) => signed(x) + ' °' }, render);
    const sun = check(root, 'Sun above the horizon', true, render);
    const ac = seg(root, 'Airco', [['off', 'off'], ['low', 'on solar · low'], ['medium', 'on solar · medium'], ['high', 'on solar · high'], ['manual', 'on by hand']], 'off', render);
    const det = h('div', { class: 'xp-det' }, h('div', { class: 'xp-l' }, 'Thresholds (helpers in the UI, defaults shown)')); root.append(det);
    const start = slider(det, 'Start at export >', { min: 300, max: 3000, step: 100, value: 600, fmt: (x) => x + ' W' }, render);
    const stop = slider(det, 'Stop at import >', { min: 0, max: 2000, step: 100, value: 500, fmt: (x) => x + ' W' }, render);
    const up = slider(det, 'Fan up at export >', { min: 200, max: 3000, step: 100, value: 700, fmt: (x) => x + ' W' }, render);
    const maxf = seg(det, 'Max fan', [['low', 'low'], ['medium', 'medium'], ['high', 'high']], 'medium', render);
    const line = h('div', { class: 'xp-svg' }), out = h('div', { class: 'xp-items' });
    root.append(line, out);
    const F = ['low', 'medium', 'high'];
    function render() {
      const g = grid.v, ex = -g, res = [];
      if (ac.v === 'off') {
        const miss = [];
        if (!(ex > start.v)) miss.push(`export above ${start.v} W`);
        if (!sun.v) miss.push('sun up');
        if (!(dt.v < -0.5)) miss.push('room more than 0,5° below target');
        if (!miss.length) {
          res.push(['ok', 'Starts after 2 minutes', 'Heat, target 19 °C, fan low.']);
          const steady = g + 600, peak = g + 1300;
          res.push([steady > stop.v ? 'warn' : 'info', `Then the grid shows about ${steady > 0 ? 'import' : 'export'} ${Math.abs(steady)} W`,
            `The airco draws ~0,6 kW steady and up to ~1,3 kW in the first 10 minutes (then ${peak > 0 ? 'import ' + peak : 'export ' + -peak} W). `
            + (steady > stop.v ? `That stays above the stop threshold, so it would switch off again after 10 minutes.` : 'The stop threshold needs 10 minutes of import, so the first peak does not stop it.')]);
        } else res.push(['info', 'Stays off', 'Missing: ' + miss.join(', ') + '.']);
      } else if (ac.v === 'manual') {
        res.push(['info', 'Left alone', 'The automation only switches off what it switched on (input_boolean.solar_heating_active).']);
      } else {
        const stops = [];
        if (g > stop.v) stops.push(`import above ${stop.v} W for 10 minutes`);
        if (dt.v >= 0) stops.push('room at target for 5 minutes');
        if (!sun.v) stops.push('sunset');
        if (stops.length) res.push(['warn', 'Switches off', 'After ' + stops.join(', or ') + '.']);
        else if (ex > up.v && F.indexOf(ac.v) < F.indexOf(maxf.v)) res.push(['ok', 'Fan one step up', `Within 10 minutes: ${ac.v} → ${F[F.indexOf(ac.v) + 1]} (still export above ${up.v} W).`]);
        else if (g > 0 && ac.v !== 'low') res.push(['info', 'Fan back to low', 'The house imports.']);
        else res.push(['ok', 'Keeps running', ex > up.v ? `Fan already at the maximum (${maxf.v}).` : 'Nothing to change.']);
      }
      out.replaceChildren(...res.map(([l, t, dd]) => item(l, t, dd)));
      // number line −2500 … +1500 W
      const x = (w) => 10 + ((w + 2500) / 4000) * 580;
      const mk = (w, cls, txt, yy) => `<line x1="${x(w)}" x2="${x(w)}" y1="18" y2="42" class="${cls}"/><text x="${x(w)}" y="${yy}" text-anchor="middle" class="${cls}">${txt}</text>`;
      line.innerHTML = `<svg viewBox="0 0 600 62" role="img" aria-label="grid power line">
        <rect x="${x(-2500)}" y="26" width="${x(0) - x(-2500)}" height="8" class="exp"/><rect x="${x(0)}" y="26" width="${x(1500) - x(0)}" height="8" class="imp"/>
        ${mk(-start.v, 'm1', 'start', 12)}${mk(-up.v, 'm2', 'fan up', 56)}${mk(stop.v, 'm3', 'stop', 12)}
        <circle cx="${x(g)}" cy="30" r="6" class="now"/>
        <text x="${x(-2500)}" y="56">export</text><text x="${x(1500)}" y="56" text-anchor="end">import</text></svg>`;
    }
    render();
  };

  // ---------- Solar heating: airco vs gas per kWh of heat ----------
  W.cop = (root) => {
    box(root, 'Is heating with the airco cheaper than gas?');
    const cop = slider(root, 'Airco COP', { min: 1, max: 5, step: 0.1, value: 3, fmt: (x) => nl(x) }, render);
    const t = seg(root, 'Electricity costs', [['now', '€ 0,277 (import, or export with net metering)'], ['2027', '€ 0,01 (surplus from 2027)']], 'now', render);
    const out = h('div'); root.append(out);
    const gas = 1.51574 / 8.8;
    function render() {
      const e = t.v === 'now' ? 0.27695 : 0.01, a = e / cop.v;
      out.replaceChildren(bars([['Airco', a, a < gas ? 'ok' : 'bad', eur(a) + ' /kWh'], ['Gas (HR, 8,8 kWh/m³)', gas, '', eur(gas) + ' /kWh']], 0.3),
        h('p', {}, `Break-even COP: ${nl(e / gas, 2)}. ` + (a < gas ? `Saves ${Math.round((1 - a / gas) * 100)} % per kWh of heat.` : 'Gas is cheaper.')));
    }
    render();
  };

  // ---------- Smart meter: fixed vs dynamic price ----------
  W.price = (root) => {
    box(root, 'Fixed or dynamic: what does this hour cost?');
    const k = seg(root, '', [['e', 'Electricity'], ['g', 'Gas']], 'e', () => { m.v = k.v === 'e' ? 0.1 : 0.45; render(); });
    const m = slider(root, 'Market price (excl. VAT)', { min: -0.05, max: 1.0, step: 0.005, value: 0.1, fmt: (x) => eur(x) }, render);
    const y = seg(root, 'Export', [['2026', '2026, net metering'], ['2027', 'from 2027']], '2026', render);
    const out = h('div'); root.append(out);
    function render() {
      const e = k.v === 'e', mk = e ? 0.02 : 0.05, tax = e ? 0.11085 : 0.7268, fx = e ? 0.27695 : 1.51574, u = e ? 'kWh' : 'm³';
      const dyn = (m.v + mk) * 1.21 + tax, be = (fx - tax) / 1.21 - mk;
      y.row.hidden = !e;
      const rows = [['Dynamic', dyn, dyn < fx ? 'ok' : 'bad', eur(dyn) + ' /' + u], ['Fixed', fx, '', eur(fx) + ' /' + u]];
      let ex = null;
      if (e) {
        const dx = y.v === '2026' ? m.v * 1.21 + tax : m.v * 1.21, fxx = y.v === '2026' ? fx : 0.01;
        ex = h('p', {}, `Export earns ${eur(fxx)} fixed, ${eur(dx)} dynamic` + (y.v === '2027' && m.v < 0 ? ' (negative: you pay to export).' : '.'));
      }
      out.replaceChildren(bars(rows, e ? 0.6 : 2.2), h('p', {}, `Dynamic is cheaper below a market price of ${eur(be)} per ${u}. All-in = (market + ${eur(mk)}) × 1,21 + energy tax ${eur(tax)}.`), ex);
    }
    render();
  };

  // ---------- Nest Hub: energy score ----------
  W.score = (root) => {
    box(root, 'Energy score (last 24 hours)');
    const sol = slider(root, 'Solar produced', { min: 0, max: 20, step: 0.1, value: 6, fmt: (x) => nl(x) + ' kWh' }, render);
    const self = slider(root, 'Of which used in the house', { min: 0, max: 100, step: 1, value: 45, fmt: (x) => x + ' %' }, render);
    const spread = slider(root, 'Dearest − cheapest hour', { min: 0, max: 30, step: 0.5, value: 12, fmt: (x) => nl(x) + ' ct' }, render);
    const pos = slider(root, 'Grid import was bought at', { min: 0, max: 100, step: 1, value: 40, fmt: (x) => x === 0 ? 'the cheapest hour' : x === 100 ? 'the dearest hour' : x + ' % of the way up' }, render);
    const out = h('div'); root.append(out);
    function render() {
      const sp = spread.v / 100, paid = pos.v / 100 * sp;
      const timing = clamp(50 + 100 * (sp / 2 - paid) / Math.max(sp, 0.03), 0, 100);
      const has = sol.v >= 0.1, tot = has ? (self.v + timing) / 2 : timing;
      out.replaceChildren(bars([
        ['Eigen zon zelf gebruikt', has ? self.v : 0, '', has ? self.v + ' %' : 'not counted (< 0,1 kWh)'],
        ['Slim getimed (prijs)', timing, '', Math.round(timing) + ' %'],
        ['Score', tot, tot >= 50 ? 'ok' : 'bad', String(Math.round(tot))]], 100),
        h('p', {}, sp < 0.03 ? 'Prices are less than 3 ct apart: timing hardly matters, so it stays near 50.' : 'Timing: 100 = everything bought at the cheapest hour, 0 = at the dearest.'));
    }
    render();
  };

  // ---------- Nest Hub: the slides ----------
  W.slides = (root) => {
    box(root);
    const base = root.dataset.base || '../assets/slides/';
    const S = {
      nu: ['Nu', 'Clock, weather now, day arc, rain next 2 h, solar today vs forecast.'],
      energie: ['Energie', 'Solar / grid / house flow, energy score, dynamic price per hour with the cheapest 3-hour block.'],
      vandaag: ['Vandaag', 'Solar vs house power over 24 h, score per hour, price bars, today\'s totals and cost.'],
      verleden: ['Verleden', 'Last 7 days: fixed vs dynamic contract, score per day, usage per day incl. gas.'],
      weer: ['Weer', 'Next 12 hours and next days (met.no), rain next 2 h (Buienradar).'],
      klimaat: ['Klimaat', 'Tado rooms with − / +, hot water, gas per hour and day, airco downstairs with AUTO.'],
      lampen: ['Lampen', 'Lights (tap toggles) and scenes. Not in the rotation.'],
      status: ['Status', 'What is wrong. Only shown when there is something to list; see Health monitor.'],
    };
    const img = h('img', { class: 'xp-shot', alt: '' }), cap = h('p');
    const s = seg(root, '', Object.entries(S).map(([k, v]) => [k, v[0]]), 'energie', render);
    root.append(img, cap);
    function render() { img.src = base + s.v + '.webp'; img.alt = 'Slide ' + S[s.v][0]; cap.textContent = S[s.v][1]; }
    render();
  };

  // ---------- Nest Hub: when is it on screen? ----------
  W.cast = (root) => {
    box(root, 'Is the dashboard on the Nest Hub?');
    const t = slider(root, 'Time', { min: 0, max: 24, step: 0.25, value: 12, fmt: (x) => `${String(Math.floor(x) % 24).padStart(2, '0')}:${String(Math.round((x % 1) * 60)).padStart(2, '0')}` }, render);
    const other = check(root, 'Something else plays (music, a timer, "Hey Google")', false, render);
    const out = h('div', { class: 'xp-items' }); root.append(out);
    function render() {
      const on = t.v >= 7 && t.v < 22.5;
      out.replaceChildren(!on ? item('info', 'Off', 'Stopped at 22:30, back at 07:00. The Nest shows its own screen.')
        : other.v ? item('info', 'Left alone', 'The automation only casts when nothing else plays; the dashboard returns within 5 minutes after it stops.')
          : item('ok', 'Shown', 'Recast every 5 minutes if it dropped. Every 5 minutes the layout shifts a few pixels (burn-in).'));
    }
    render();
  };

  const init = () => document.querySelectorAll('[data-xp]:not(.xp)').forEach((r) => {
    const f = W[r.dataset.xp];
    if (f) { try { f(r); } catch (e) { r.textContent = 'Explorable failed: ' + e.message; } }
  });
  if (window.document$ && window.document$.subscribe) window.document$.subscribe(init);
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
