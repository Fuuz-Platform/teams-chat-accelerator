# 01. Concepts

This chapter defines the moving parts. Read it once before you build anything.

> **Scope and disclaimer.** This pattern was built and tested end to end in production for an **Andon (production alert)** scenario in the Fuuz MES. Your team can implement the same approach for **any type of event in the Fuuz platform**: any model data change, a flow or workflow step, a schedule, a threshold or calculated condition, an integration message, and so on. Items not proven in production are marked **TO VERIFY**. Microsoft Teams and Power Automate behaviour, limits and licensing can change; validate them in your own tenant before go-live.

## 1. The two halves

| Half | Lives in | Owned by | Job |
|---|---|---|---|
| **Fuuz side** | The customer's Fuuz tenant | The Fuuz app team | Decide *when* to notify, *whom*, and *what the card says*. Post one HTTPS request per card |
| **Teams side** | The customer's Microsoft 365 tenant (Power Automate environment) | The customer's Microsoft 365 or Teams admin | Receive the request, find or create the place to post, post the card |

The halves meet at one URL. Fuuz never signs in to Microsoft 365, and Power Automate never calls Fuuz.

## 2. Microsoft terms

| Term | Meaning here |
|---|---|
| **Workflows (app)** | The Teams app that hosts Power Automate flows inside Teams. It was called "Power Automate" in Teams before. Its bot is the **Flow bot**. In the reference Fuuz tenant its catalog id is `c3a1996d-db0f-4857-a6ea-7aabf0266b00` (VERIFIED). In other tenants, look it up (chapter 06, section 2) |
| **Workflow** | A Power Automate cloud flow. A workflow built from Teams is a normal cloud flow; you can open it at make.powerautomate.com |
| **When a Teams webhook request is received** | The Microsoft Teams connector trigger (`TeamsIncomingWebhookTrigger`). It gives the workflow an HTTPS URL. Fuuz POSTs to it |
| **Who can trigger the flow?** | A trigger setting. Fuuz needs **Anyone**, because a server cannot present a Microsoft Entra token. The `sig=` query parameter in the URL is then the only protection, so the URL is a secret |
| **Post card in a chat or channel** | The Teams connector action (`PostCardToConversation`) that posts an Adaptive Card. **Post as**: Flow bot or User. **Post in**: Channel, Group chat, or Chat with Flow bot |
| **Flow bot** | The bot identity of the Workflows app. A post "as Flow bot" shows as coming from Workflows, not from a person |
| **Send a Microsoft Graph HTTP request** | A Teams connector action (`HttpRequest`) that calls Graph as the connection's account. It accepts only some paths (chapter 06, section 1) |
| **Run history** | The per-run log of a workflow in Power Automate. It is the only place a Teams-side failure appears |

## 3. Fuuz terms

| Term | Meaning here |
|---|---|
| **Connection** | A Fuuz Integration > Connections row using the **HTTP** connector. Its URL is the full workflow URL. Request and response payload logging stay **off** |
| **Post flow** | An Integration flow that reads the Connection, POSTs one body, and answers `{ status, error }`. Every node has input, output and error logging off. Examples: `teamsAndonPost` (reference), `teamsAlertsPost`, `teamsDmPost` |
| **Card renderer** | A JSONata function (`TEAMS_CARD_FN` in `teams-shared/cards.cjs`) that turns a small *spec* into the full message envelope |
| **Detector** | A flow with a **dataChanges** trigger on a model. It decides whether a change is worth a card |
| **Queue / send log** | A model, one row per card (generic name: `NotificationQueue`). The row is the dedupe key, the retry state and the audit record at once |
| **Sender** | A flow triggered by a new queue row. It claims the row, renders the card, calls the post flow and records the answer |
| **Settings row** | An `ApplicationConfiguration` row (MES: `notificationTeams`) or a generic `teamsNotificationSettings` row holding switches and parameters. Assign each ApplicationConfiguration row to the module that owns it |

## 4. The payload contract

Every Fuuz Teams request has this shape. The JSON Schema is [templates/fuuz/payload-contract.schema.json](templates/fuuz/payload-contract.schema.json).

```json
{
  "type": "message",
  "attachments": [
    {
      "contentType": "application/vnd.microsoft.card.adaptive",
      "contentUrl": null,
      "content": { "type": "AdaptiveCard", "version": "1.4", "body": [], "actions": [] }
    }
  ],
  "fuuz": {
    "target": "dm",
    "recipient": "jane.doe@customer.com",
    "teamName": null,
    "teamDescription": null,
    "channelName": null
  }
}
```

| Field | Rule |
|---|---|
| `type`, `attachments[]` | The format Microsoft documents for the webhook trigger. Send exactly one attachment. An `ensure` request sends `attachments: []` |
| `attachments[0].content` | The Adaptive Card as a JSON **object**. The workflow converts it to a string with `string(...)` before it posts (VERIFIED: posting the raw object fails in the router workflow) |
| `fuuz` | Extra top-level object. The trigger passes it through untouched in `triggerBody()` |
| `fuuz.target` | `dm`, `channel` or `ensure` |
| `fuuz.recipient` | `dm` only. The person's Microsoft 365 sign-in name (UPN). Usually, but not always, their e-mail |
| `fuuz.teamName`, `fuuz.channelName` | `channel` and `ensure` only. Matched **exactly** against `displayName`. A miss **creates** |
| `fuuz.teamDescription` | Used only when the workflow creates a team. Optional |
| `fuuz.autoCreate` | Legacy field. **Ignored**: the router workflow always creates. Some Fuuz builds still send it; leave it out of new builds |
| `fuuz.eventKey`, `fuuz.kind` | Optional. Shown in the run history so you can match a run to a Fuuz send-log row |

A **fixed-target** workflow (one DM workflow, or one workflow per fixed channel) reads only what it needs and ignores the rest. Send the full `fuuz` object anyway, with the real team and channel names, so every request has the same shape and a later move to the router workflow needs no Fuuz change.

**Name rules** (enforced by `teamsSafe` in Fuuz before sending):
- Channel names: at most 50 characters; none of `# % & * { } / \ : < > ? + |`, quotes, or a leading or trailing dot or dash.
- Team names: Teams allows 256 characters; keep them to 80 for readability.
- Build names from **codes**, never from editable descriptions. A renamed description would create a second channel (chapter 07).

## 5. What "202 Accepted" means

The webhook trigger answers **202** as soon as the run is queued. Everything after that (find the team, create the channel, post) happens later, and a failure there **never reaches Fuuz** (VERIFIED in production: posts into a team without the Workflows app answered 202 to Fuuz and failed inside the workflow).

Consequences:
- Treat 202 as "accepted", not "delivered". Record it as `sent` in the send log, and say so in the UI.
- Turn on the workflow's failure notification to its owner (chapter 08).
- Include `fuuz.eventKey` so a failed run can be traced to its Fuuz row.
- The only way to see a delivery problem is the workflow's **Run history** in Power Automate.

A Teams bot (chapter 06, section 6) gives a real delivery answer. Workflows does not.

## 6. Identity and who the card is "from"

| Post as | Shows as | Notes |
|---|---|---|
| Flow bot | "Workflows" | Recommended for alerts. Needs the Workflows app in the team or chat (chapter 06). Not available in GCC, GCC High or DoD tenants (DOCUMENTED) |
| User | The workflow connection's account (a service account) | Works where Flow bot does not. Every post is attributed to that account, so use a dedicated service account, not a person |

## 7. Where the delays come from

| Situation | Time to the card | Why |
|---|---|---|
| Team and channel exist | seconds | Post only |
| New channel in an existing team | about 2 minutes | The workflow waits 2 minutes after creating a channel |
| New team and new channel | about 5 minutes | Create team, wait 3 minutes, install the Workflows app, create the channel, wait 2 minutes |

The waits are VERIFIED as necessary: without them the first post to a brand-new team fails or retries. Pre-provisioning (chapter 07) moves this delay out of the alert path.
