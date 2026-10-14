'use strict';
/*
 * teams-shared/preview/render.cjs: renders workflow bodies (the exact JSON your app POSTs) to PNG, light and dark, with the official
 * Adaptive Cards JS renderer (npm adaptivecards) in headless Chromium (npm playwright) and the Teams-like host config
 * (hostconfig.cjs). Local review only: real Teams applies its own host config.
 *
 *   npm install
 *   npx playwright install chromium
 *   node teams-shared/preview/render.cjs <samples.json> <outDir> [--via "Fuuz"]
 *     samples.json = [ { name, label, body } ]   (body = the webhook body: { type, attachments: [{ content }], fuuz })
 *
 * Remote requests are not fetched: images get the local logo asset (offline review), anything else is aborted.
 * Writes <outDir>/<name>-<light|dark>.png and <name>.json (the body) and prints each body size (Teams limit ~28 KB) and renderer warnings.
 */
const fs = require('fs');
const path = require('path');
const { hostConfig } = require('./hostconfig.cjs');

function page(card, theme, label, via, AC) {
  const hc = hostConfig(theme);
  const p = hc._page;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;background:${p.bg};font-family:${hc.fontFamily};color:${p.fg}}
  .shell{width:520px;padding:20px 24px}
  .meta{display:flex;gap:8px;align-items:center;margin:0 0 6px 0;font-size:12px;color:${p.subtle}}
  .bot{width:32px;height:32px;border-radius:50%;background:#5B5FC7;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:12px}
  .bubble{background:${p.card};border:1px solid ${p.border};border-radius:6px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.12)}
  .ac-pushButton{border:1px solid ${p.border}!important;border-radius:4px!important;background:${p.card}!important;color:${p.fg}!important;font-weight:600!important;font-size:14px!important;padding:5px 12px!important;min-height:32px}
  .ac-pushButton.style-positive,.ac-pushButton.primary{background:${p.accent}!important;color:#fff!important;border-color:${p.accent}!important}
  a{color:${p.accent}}
  .label{font-size:11px;color:${p.subtle};margin-top:8px}
  </style><script src="file://${AC}/adaptivecards.min.js"></script></head><body><div class="shell">
  <div class="meta"><div class="bot">WF</div><b style="color:${p.fg}">Workflows</b><span>via ${via}</span></div>
  <div class="bubble" id="card"></div><div class="label">${label} - ${theme} (local render, Teams-like host config)</div></div>
  <script>
    const ac = new AdaptiveCards.AdaptiveCard();
    ac.hostConfig = new AdaptiveCards.HostConfig(${JSON.stringify(hc)});
    ac.parse(${JSON.stringify(card)});
    const errs = []; try { ac.validateProperties && ac.validateProperties().failures.forEach(f => f.errors.forEach(e => errs.push(e.message))); } catch (e) {}
    window.__errs = errs;
    document.getElementById('card').appendChild(ac.render());
  </script></body></html>`;
}

const AC_DEFAULT = path.join(__dirname, '..', '..', 'node_modules', 'adaptivecards', 'dist');

async function render({ samples, out: outArg, via = 'Fuuz', AC = process.env.AC_DIST || AC_DEFAULT, chromium }) {
  const out = path.resolve(outArg);
  if (!AC || !fs.existsSync(path.join(AC, 'adaptivecards.min.js'))) throw new Error('run npm install, or set AC_DIST to the adaptivecards dist folder');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 568, height: 400 }, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  /* no network in a review sandbox: a remote image (the card logo) is served from the local brand asset instead of fetched, never left hanging */
  const logo = [path.join(__dirname, '..', '..', 'site', 'assets', 'logo-horizontal-on-midnight.svg')].find((p) => fs.existsSync(p));
  await pg.route(/^https?:/, (route) => (logo && route.request().resourceType() === 'image' ? route.fulfill({ path: logo, contentType: 'image/svg+xml' }) : route.abort()));
  const report = [];
  for (const s of samples) {
    const body = JSON.stringify(s.body);
    fs.writeFileSync(path.join(out, s.name + '.json'), JSON.stringify(s.body, null, 2));
    for (const theme of ['light', 'dark']) {
      const f = path.join(out, `${s.name}-${theme}.png`);
      const html = path.join(out, `.${s.name}-${theme}.html`);
      fs.writeFileSync(html, page(s.body.attachments[0].content, theme, s.label, via, AC));
      await pg.goto('file://' + html, { waitUntil: 'networkidle' });
      const errs = await pg.evaluate(() => window.__errs);
      await (await pg.$('.shell')).screenshot({ path: f });
      fs.unlinkSync(html);
      report.push({ file: path.basename(f), kb: +(Buffer.byteLength(body) / 1024).toFixed(1), warnings: errs });
    }
  }
  await browser.close();
  return report;
}

module.exports = { render, page };

if (require.main === module) {
  const [samplesFile, out] = process.argv.slice(2);
  const vi = process.argv.indexOf('--via');
  const via = vi > 0 ? process.argv[vi + 1] : 'Fuuz';
  const { chromium } = require('playwright');
  render({ samples: JSON.parse(fs.readFileSync(samplesFile, 'utf8')), out, via, chromium })
    .then((r) => r.forEach((x) => console.log(`${x.file}  body ${x.kb} KB  renderer warnings: ${x.warnings.length ? x.warnings.join('; ') : 'none'}`)))
    .catch((e) => { console.error(e.message); process.exit(1); });
}
