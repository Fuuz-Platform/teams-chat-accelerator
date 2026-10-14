'use strict';
/* teams-shared tests. Run from the repository root: npm install && npm test */
const test = require('node:test');
const assert = require('node:assert/strict');
const jsonata = require('jsonata');
const L = require('../links.cjs');
const { teamsSendJsonata } = require('../send.cjs');
const { teamsPostFlow, quiet } = require('../post.cjs');
const { nodeDataProblems } = require('../nodeSchema.cjs');

const CASES = [
  [{ tenantId: 'example' }, 'https://example.fuuz.app', '/quality/nonconformance', { id: 'NC-2291' }, 'https://example.fuuz.app/quality/nonconformance?id=NC-2291&tenant=example'],
  [{ tenantId: 'plant', appUrl: 'https://mes.example.com/' }, null, '/andon/andonBoard', { andon: 'AR 1&2', ack: '1', empty: '' }, 'https://mes.example.com/andon/andonBoard?andon=AR%201%262&ack=1&tenant=plant'],
  [{ tenantId: 't' }, 'https://h.io/', '/r', {}, 'https://h.io/r?tenant=t'],
  [{ tenantId: 't' }, 'https://h.io', '/r', { tenant: 'evil' }, 'https://h.io/r?tenant=t'],
  [{ tenant: 't2', host: 'https://x.example.com:8443/app?z=1' }, '', '/r', { a: 1 }, 'https://x.example.com:8443/r?a=1&tenant=t2'],
  [{}, 'https://example.fuuz.app', '/x', { a: 1 }, ''],
  [{ tenantId: 't' }, '', '/x', {}, ''],
  [{ tenantId: 't', appUrl: 'http://insecure.example.com' }, null, '/x', {}, ''],
  [{ tenantId: 't' }, 'https://h.io', 'relative', {}, ''],
  [null, 'https://h.io', '/x', {}, ''],
];

test('links: tenant LAST and always present; JS and JSONata give the same link on every case', async () => {
  for (const [meta, override, route, params, want] of CASES) {
    assert.equal(L.appLink(L.appBase(meta, override), route, params), want, 'JS ' + JSON.stringify([meta, override, route, params]));
    const expr = L.appLinkJsonata('$appLink($appBase($meta, $override), $route, $params)');
    const got = await jsonata(expr).evaluate({}, { meta, override, route, params });
    assert.equal(got, want, 'JSONata ' + JSON.stringify([meta, override, route, params]));
  }
});

test('links: the ES5 functions survive toString into a fresh scope (how a JS node embeds them)', () => {
  const src = L.APP_LINK_CONSTS + '\n' + L.APP_LINK_FNS.map((f) => f.toString()).join('\n') + '\nreturn appLink(appBase({ tenantId: "t" }, "https://h.io"), "/r", { a: 1 });';
  assert.equal(new Function(src)(), 'https://h.io/r?a=1&tenant=t');
});

test('send: renders the card envelope and posts it through the post flow, answering { status, error }', async () => {
  const posted = [];
  const spec = { label: 'X', style: 'attention', headline: 'SEV1 ANDON - Test', facts: [{ title: 'Unit', value: 'U1' }], actions: [{ title: 'Open', url: 'https://h.io/r?tenant=t' }], fuuz: { target: 'dm', recipient: 'a@example.com', teamName: null, teamDescription: null, channelName: null, autoCreate: false } };
  const r = await jsonata(teamsSendJsonata('teamsAlertsPost', 'spec')).evaluate({ spec }, { executeFlow: async (id, p) => { posted.push([id, p]); return { status: 202, error: null }; } });
  assert.deepEqual(r, { status: 202, error: null });
  assert.equal(posted[0][0], 'teamsAlertsPost');
  const body = posted[0][1].body;
  assert.deepEqual(Object.keys(body).sort(), ['attachments', 'fuuz', 'type']);
  assert.equal(body.attachments[0].contentType, 'application/vnd.microsoft.card.adaptive');
  assert.equal(body.attachments[0].content.version, '1.4');
  assert.deepEqual(body.fuuz, spec.fuuz, 'the routing is passed through unchanged');
  assert.throws(() => teamsSendJsonata('bad id"); $evil(', 'spec'));
});

test('post: one builder per Connection; every node logs no input, output or errors', () => {
  for (const c of [{ connectionName: 'teamsAlertsWebhook', flowName: 'teamsAlertsPost' }, { connectionName: 'teamsDmWebhook', flowName: 'teamsDmPost' }]) {
    const f = teamsPostFlow(c)('v1', 1);
    assert.ok(quiet(f), c.flowName);
    assert.equal(f.nodes.find((n) => n.type === 'http').data.connectionName, c.connectionName);
    assert.ok(f.nodes.find((n) => n.id === 'n_cred').data.query.includes('name: { _eq: "' + c.connectionName + '" }'), 'by name by default');
  }
  const byId = teamsPostFlow({ connectionId: 'conn-123', connectionName: 'teamsAlertsWebhook', flowName: 'teamsAlertsPost', lookup: 'id' })('v1', 1);
  assert.ok(byId.nodes.find((n) => n.id === 'n_cred').data.query.includes('id: { _eq: "conn-123" }'), 'by id when asked');
});

test('node schema: every node the builders emit carries only the data keys the platform accepts', () => {
  for (const lookup of ['id', 'name']) {
    const f = teamsPostFlow({ connectionId: 'conn-123', connectionName: 'teamsAlertsWebhook', flowName: 'teamsAlertsPost', lookup })('v1', 1);
    assert.deepEqual(nodeDataProblems(f.nodes, { name: 'post/' + lookup, strict: true }), []);
    const t = f.nodes.find((n) => n.type === 'tryCatch');
    assert.deepEqual(Object.keys(t.data).sort(), ['catchNextNodes', 'tryNextNodes']);
  }
  /* the shape the platform rejects at deploy is caught */
  assert.deepEqual(nodeDataProblems([{ id: 'n_try', type: 'tryCatch', data: { tryNextNodes: ['a'], catchNextNodes: ['b'], transform: '' } }], { name: 'x' }), ['x: n_try (tryCatch) data must NOT have additional property "transform"']);
  assert.match(nodeDataProblems([{ id: 'n', type: 'newThing', data: {} }], { strict: true })[0], /no data schema/);
});

test('withTenant / tenantLinks add the tenant LAST to app links only; JS and JSONata give the same text', async () => {
  const H = 'https://example.fuuz.app';
  const cases = [
    ['withTenant', ['https://example.fuuz.app/a/b', 'example', false], 'https://example.fuuz.app/a/b?tenant=example'],
    ['withTenant', ['https://example.fuuz.app/a/b?x=1#top', 't', false], 'https://example.fuuz.app/a/b?x=1&tenant=t#top'],
    ['withTenant', ['https://example.fuuz.app/a?x=1&amp;y=2', 't', true], 'https://example.fuuz.app/a?x=1&amp;y=2&amp;tenant=t'],
    ['withTenant', ['https://example.fuuz.app/a?tenant=t', 'other', false], 'https://example.fuuz.app/a?tenant=t'],
    ['withTenant', ['https://example.fuuz.app/a', '', false], ''],
    ['withTenant', ['', 't', false], ''],
    ['tenantLinks', ['<a href="https://example.fuuz.app/quality/nc?id=1&amp;line=2">record</a>', H, 't1', true], '<a href="https://example.fuuz.app/quality/nc?id=1&amp;line=2&amp;tenant=t1">record</a>'],
    ['tenantLinks', ['Open https://example.fuuz.app/x. Then (https://example.fuuz.app/y?z=1).', H, 't1', false], 'Open https://example.fuuz.app/x?tenant=t1. Then (https://example.fuuz.app/y?z=1&tenant=t1).'],
    ['tenantLinks', ['KB https://support.example.com/kb, look-alike https://example.fuuz.app.evil.com/y, root https://example.fuuz.app', H, 't1', false], 'KB https://support.example.com/kb, look-alike https://example.fuuz.app.evil.com/y, root https://example.fuuz.app?tenant=t1'],
    ['tenantLinks', ['twice https://example.fuuz.app/a?tenant=t1', H, 't1', false], 'twice https://example.fuuz.app/a?tenant=t1'],
    ['tenantLinks', ['no tenant https://example.fuuz.app/a', H, '', false], 'no tenant https://example.fuuz.app/a'],
  ];
  for (const [fn, args, want] of cases) {
    assert.equal(L[fn](...args), want, 'JS ' + fn + ' ' + JSON.stringify(args));
    const got = await jsonata(L.tenantLinkJsonata(`$${fn}($a[0], $a[1], $a[2], $a[3])`)).evaluate({}, { a: args });
    assert.equal(got, want, 'JSONata ' + fn + ' ' + JSON.stringify(args));
  }
  const src = L.APP_LINK_CONSTS + '\n' + L.APP_LINK_FNS.map((f) => f.toString()).join('\n') + '\nreturn tenantLinks("x https://h.io/r y", "https://h.io", "t", false);';
  assert.equal(new Function(src)(), 'x https://h.io/r?tenant=t y', 'ES5 embedding');
});
