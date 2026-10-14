# teams-shared

The Fuuz side of the Teams integration as code: one card renderer, one post-flow builder, one deep-link builder, a node-shape lint, and an offline card preview. Package these into your Fuuz app at **build time**: the functions are embedded as text in flow nodes (JSONata in transforms, ES5 in JS nodes). Nothing here runs as a separate service, and no app or tenant calls another at runtime.

| File | What it gives you | Guide |
|---|---|---|
| [`cards.cjs`](cards.cjs) | `TEAMS_CARD_FN`: a JSONata lambda that turns a small spec into the full webhook body (Adaptive Card 1.4 plus the `fuuz` routing object). `teamsCardJsonata(specExpr)` wraps it for a transform node | [05](../05-adaptive-cards-styling.md) |
| [`post.cjs`](post.cjs) | `teamsPostFlow({ connectionName, flowName })`: builds the quiet Integration flow that reads the Connection and POSTs one body. Every node logs no input, output or errors; failures come back as `{ status, error }` with URLs stripped | [03](../03-fuuz-connection-and-flows.md) |
| [`send.cjs`](send.cjs) | `teamsSendJsonata(postFlowId, specExpr)`: render a card and post it through your post flow, in one transform | [03](../03-fuuz-connection-and-flows.md), [04](../04-patterns-data-change-driven.md) |
| [`connection.cjs`](connection.cjs) | The Connection row to create by script (empty URL, payload logging off) and the queries to find it by id or name | [03](../03-fuuz-connection-and-flows.md), [09](../09-security.md) |
| [`links.cjs`](links.cjs) | `appBase` / `appLink`: deep links with the tenant parameter always present and always last, in JS and JSONata forms that are tested to agree. `withTenant` / `tenantLinks` add the tenant to links in finished text | [03](../03-fuuz-connection-and-flows.md) |
| [`nodeSchema.cjs`](nodeSchema.cjs) | `nodeDataProblems(nodes)`: the data keys each node type accepts. Run it before every deploy; one extra key rejects the whole flow | [03](../03-fuuz-connection-and-flows.md), [04](../04-patterns-data-change-driven.md) |
| [`preview/`](preview/) | Renders webhook bodies to PNG, light and dark, with the Adaptive Cards renderer and a Teams-like host config | [05](../05-adaptive-cards-styling.md) |

## Use

Node 22 or later, from the repository root:

```bash
npm install
npm test
```

Build a post flow and lint it before you deploy it:

```js
const { teamsPostFlow, quiet } = require('./teams-shared/post.cjs');
const { nodeDataProblems } = require('./teams-shared/nodeSchema.cjs');

const flow = teamsPostFlow({ connectionName: 'teamsAlertsWebhook', flowName: 'teamsAlertsPost' })('<VERSION_ID>', '1.0.0');
if (!quiet(flow) || nodeDataProblems(flow.nodes, { strict: true }).length) throw new Error('fix the flow before deploying');
```

The flow finds its Connection **by name** by default, so an admin can create the Connection in the Fuuz UI and paste the workflow URL there; the URL never passes through code. Pass `lookup: 'id', connectionId` for a Connection you created by script.

Render a card and post it from a transform node in your event flow:

```js
const { teamsSendJsonata } = require('./teams-shared/send.cjs');
const expr = teamsSendJsonata('teamsAlertsPost', '$.spec');   // the transform returns { status, error }; 202 = accepted
```

Preview cards offline before anyone sees them in Teams:

```bash
npx playwright install chromium
node teams-shared/preview/render.cjs <samples.json> preview-out
```

`samples.json` is `[{ "name", "label", "body" }]`, where `body` is a webhook body such as the files in [templates/cards/](../templates/cards/).

## Marks

Statements follow the guide's marks. The post flow, card renderer, links and node-shape lint run in production in the Andon reference. Two values are **TO VERIFY** in your tenant: the built-in HTTP connector id in `connection.cjs`, and which `$state.metadata` key carries the app host (`APP_HOST_KEYS` in `links.cjs`; set a host override when none does).
