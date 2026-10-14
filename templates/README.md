# Templates

Every file uses `<PLACEHOLDER>` values. Replace them before use. Keys starting with `_` are notes; remove them before you reuse a block. No file here contains a real webhook URL, secret or tenant id.

## power-automate/ (code-view review templates)

Build workflows in the Power Automate designer, then compare your code view (**...** > **Peek code**, or a solution export) with these. They are not import packages: connector parameter keys can differ slightly between exports; the expressions are the part to copy exactly.

| File | Shape | Status |
|---|---|---|
| `fuuz-teams-router.workflow.json` | `dm` / `channel` / `ensure`, find-or-create, Workflows app install in new teams, 3 and 2 minute waits | VERIFIED shape |
| `fuuz-teams-dm.workflow.json` | Fixed `dm` | VERIFIED shape |
| `fuuz-teams-fixed-channel.workflow.json` | One fixed channel | VERIFIED shape |
| `snippet-install-workflows-existing-team.json` | Guarded install into an existing team | TO VERIFY |
| `snippet-install-workflows-for-user.json` | Personal-scope install through Graph with an app registration (premium HTTP) | TO VERIFY |
| `snippet-group-chat.json` | Create a group chat, install Workflows in it, post | TO VERIFY |

## fuuz/

| File | What |
|---|---|
| `payload-contract.schema.json` | JSON Schema of the request body (draft-07) |
| `test-request-body.json` | A test card for `dm` (edit `fuuz` for `channel`) |
| `ensure-request-body.json` | A provisioning request (no card) |
| `notificationTeams.applicationConfiguration.json` | Andon reference settings row (team / channel naming, provisioning) with its JSON Schema |
| `notification-queue.model.json` | `NotificationQueue`: queue and send-log model fields and indices |
| `user-notification-preference.model.json` | `UserNotificationPreference`: per-user channel choice |
| `teamsNotificationSettings.applicationConfiguration.json` | Generic switches: live, events lists, DM domain allow-list, pilot redirect, caps, `appUrl` |
| `post-flow.nodes.json` | The quiet post flow, node by node |

## cards/

Full message envelopes (card plus `fuuz` routing) as the shared renderer produces them, plus `card-spec.example.json`, the input the renderer takes.

| File | Use |
|---|---|
| `andon-raised-sev1-channel.json` | Critical alert (red `attention` block), Open and Acknowledge |
| `andon-escalated-sev2-channel.json` | Escalation (amber `warning` block) |
| `andon-resolved-channel.json` | Resolution (green `good` block), note excerpt, no Acknowledge |
| `andon-test-dm.json` | Test card to a person |
| `record-state-change-channel.json` | Generic: a record entered a watched status (walkthrough 02) |
| `record-assigned-dm.json` | Generic: a record was assigned to you, with a "why" line (walkthrough 03) |
| `restricted-content-free-dm.json` | Content-free card for a restricted record |

To preview: paste `attachments[0].content` into the [Adaptive Cards Designer](https://adaptivecards.microsoft.com/designer) with host app Microsoft Teams, light and dark.
