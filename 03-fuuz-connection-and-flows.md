# 03. The Fuuz Connection and flows

**Who does this:** the Fuuz app builder (flows) and a Fuuz administrator (pasting the URL).
**Result:** a Connection that holds the workflow URL, a quiet post flow, and a send step that renders and posts a card.

Reference implementation: `fuuz/accelerators/teams-shared/` (`connection.cjs`, `post.cjs`, `cards.cjs`, `send.cjs`, `links.cjs`, `nodeSchema.cjs`). Each Fuuz app **packages** these at build time (function text embedded in nodes, JSONata in transforms). Apps never call each other at runtime, and one tenant never depends on another.

---

## 1. The Connection (one per workflow)

| Field | Value |
|---|---|
| Name (and id, if you create it by script) | e.g. `teamsAndonWebhook` (reference), `teamsAlertsWebhook`, `teamsDmWebhook` |
| Connector | **HTTP** |
| URL | The workflow's full trigger URL, from `https://` to the end of `...&sig=...` |
| Username / Password | empty (no Basic auth) |
| Headers | `Content-Type: application/json` |
| Request payload logging | **off** (`false`, not empty) |
| Response payload logging | **off** (`false`, not empty) |
| Active | on |

### 1.1 Create it in the Fuuz UI

1. **Integration > Connections > New**.
   [Screenshot: the Connections list with the New button]
2. Choose connector **HTTP**, name it, and leave the URL empty for now if the workflow does not exist yet.
3. Set both payload-logging switches **off** and save. A switch that was never touched can be stored as `null`; the reference deploy tool refused to go on until both were explicitly `false` (VERIFIED). Toggle them on and off once if in doubt.
4. When the workflow exists, paste its URL into **URL** and save. Nobody else needs to see it.

If you script the Connection (`teams-shared/connection.cjs`), create it with an empty URL. If the API refuses an empty URL, use the placeholder `https://not-set.invalid`; the post flow treats it as "not configured" and posts nothing.

### 1.2 Reference by name

A Connection created in the UI gets a generated id. The reference post flow finds its Connection **by name** (`lookup: 'name'`), so whoever creates it in the UI does not have to match an id. Never create a second Connection with the same name.

## 2. The post flow

One Integration flow per Connection. It does one thing: read the Connection, POST the body, answer `{ status, error }`. Built by `teamsPostFlow({ connectionId, connectionName, flowName, lookup })` in `teams-shared/post.cjs`.

| # | Node | Type | Purpose |
|---|---|---|---|
| 1 | Request `{ body }` | request | Input: `{ "body": <the message envelope> }` |
| 2 | Stash Body | mergeContext | `{ "body": $.body }` |
| 3 | Try | tryCatch | `tryNextNodes` / `catchNextNodes` only. **No `transform` key**: the platform schema rejects it with "data must NOT have additional properties" (VERIFIED) |
| 4 | Read the webhook Connection | query | `connection(first:1, where:{ name: { _eq: "<name>" } }) { edges { node { id active url credentials } } }` |
| 5 | Check the URL | mergeContext | Raises "teams webhook connection missing or inactive" or "teams webhook not configured" **before** any HTTP call. Accepts a full https URL with a path and query |
| 6 | POST | http | `connectionName: <name>`, method post, path `""`, data `$state.context.body`, `returnErrors: false`. With path `""` the stored URL is posted unchanged (VERIFIED) |
| 7 | Accepted | mergeContext | `{ "out": { "status": 202, "error": null } }` |
| 8 | Failed (catch) | mergeContext | `{ "out": { "status": <4xx/5xx or null>, "error": <message with every URL, /powerautomate/ path and sig= replaced> } }`, clipped to 300 characters |
| 9 | Respond | response | `$state.context.out` |

**Every node** has `logInput: false`, `logOutput: false`, `logErrors: false`. Execution metrics and started / succeeded / failed events may stay on; they carry no payload. The deploy tools refuse a post flow that is not fully quiet (`quiet(flow)` in `post.cjs`).

**Grants:** the post flow is a sub-flow. It needs the same grant arrangement as the flow that calls it. Flows run as the caller, so the calling user (or the trigger's run identity) must be allowed to read the Connection and run the post flow.

## 3. The send step

`teamsSendJsonata(postFlowId, specExpr)` in `teams-shared/send.cjs` gives a JSONata expression for a transform node:

```
( $card := ( $teamsCard := <TEAMS_CARD_FN>; $teamsCard(<specExpr>) );
  $executeFlow("teamsAndonPost", { "body": $card }) )
```

The value is the post flow's answer. The caller decides what a non-202 means:
- Direct send (Andon reference): raise into the per-recipient catch, so e-mail and SMS for the same alert still go.
- Queue pattern: record the status and error on the `NotificationQueue` row (`sent`, `retry`, `dead`).

The **spec** the renderer takes:

| Key | Meaning |
|---|---|
| `label`, `labelColor` | Small header text right of the logo, e.g. "MES - Andon raised" |
| `style` | `null` for a plain card, or `attention` / `warning` / `good` / `accent` / `emphasis` for a coloured headline block |
| `headline`, `subtitle` | Clipped to 140 and 200 characters |
| `facts` | `[{ title, value }]`, empty values dropped, titles 30 and values 160 characters |
| `excerpt` | Optional quoted text, 600 characters, 6 lines |
| `why` | Optional small line, e.g. "You get this because you own the task" |
| `actions` | `[{ title, url, style }]`, rendered as `Action.OpenUrl`. An action with an empty URL is dropped |
| `fallbackText` | Defaults to the headline |
| `fuuz` | The routing object, passed through unchanged |

**The `fuuz` routing must be built server-side from your own rows** (recipient table, hierarchy codes), never taken from a request a user can shape.

## 4. Deep links

Every link in a card opens a Fuuz screen. `teams-shared/links.cjs` builds them with one rule: **the tenant parameter is always present and always last**.

```
https://<host>/<app>/<route>?<params>&tenant=<tenantId>
https://<host>/<app>/<route>?tenant=<tenantId>          (no other params)
```

Example: `https://mes.customer.com/andon/andonBoard?andon=AR-00072&ack=1&tenant=<tenant>`

| Function | Form | Use |
|---|---|---|
| `appBase(meta, override)` | ES5 (JS nodes) and JSONata (`$appBase`) | Host and tenant. Tenant from `$state.metadata.tenantId`. Host from a configured setting (override) or a metadata key |
| `appLink(base, route, params)` | same | Builds the URL. Returns `""` when the host or tenant is unknown, so no link without its tenant is ever sent |
| `withTenant(url, tenant, html)` | same | Adds `tenant=` last to a finished URL (`&amp;` in HTML) |
| `tenantLinks(text, host, tenant, html)` | same | Adds the tenant to every app link inside a finished text or HTML body |

**Host:** a probe in the reference tenant found **no host key** in `$state.metadata` for System or dataChanges runs (keys: flowId, versionId, deploymentId, tenantId, enterpriseId, version, dataFlowType, logLevelId; VERIFIED). So **always configure the base URL** as a setting (Andon reference: `AndonAlertSetting.appUrl`; generic: `appUrl` in `teamsNotificationSettings`). Treat a metadata host as a bonus, not a source. If neither is set, cards go out with no buttons rather than wrong ones.

**Acknowledge links** carry `&ack=1` before the tenant. The target screen must ask "Acknowledge AR-...?" and never act on page load alone, because Teams and mail scanners may prefetch links.

## 5. Node-shape lint

The platform validates node `data` with `additionalProperties: false`. One extra key rejects the whole flow at deploy time. `teams-shared/nodeSchema.cjs` lists the allowed keys per node type (tryCatch: `tryNextNodes`, `catchNextNodes`; http: `connectionName`, `httpMethod`, `httpPathTransform`, `httpDataTransform`, `returnErrors`, `nextNodes`; and so on). Run `nodeDataProblems(nodes)` in your build tests.

## 6. Configuration per use case (examples)

| | Andon reference (tested) | Generic channel alerts (walkthrough 02) | Generic DMs (walkthrough 03) |
|---|---|---|---|
| Post flow | `teamsAndonPost` | `teamsAlertsPost` | `teamsDmPost` |
| Connection | `teamsAndonWebhook` | `teamsAlertsWebhook` | `teamsDmWebhook` |
| Workflow | "Fuuz Andon - Teams" (router) | "Fuuz - <Function> Alerts" (fixed channel) | "Fuuz - Direct messages" (dm) |
| Routing | `NotificationChannelRecipient` custom fields `teamsTarget` (`channel` / `dm`) and `teamsUpn`, plus the `notificationTeams` settings row | the fixed channel; event list in `teamsNotificationSettings` | the record's assignee, `UserNotificationPreference`, allow-listed domains |
| Host | `AndonAlertSetting.appUrl` | `teamsNotificationSettings.appUrl` | same |

Templates: [templates/fuuz/notificationTeams.applicationConfiguration.json](templates/fuuz/notificationTeams.applicationConfiguration.json), [templates/fuuz/teamsNotificationSettings.applicationConfiguration.json](templates/fuuz/teamsNotificationSettings.applicationConfiguration.json), [templates/fuuz/post-flow.nodes.json](templates/fuuz/post-flow.nodes.json).
