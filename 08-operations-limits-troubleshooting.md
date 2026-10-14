# 08. Operations, limits and troubleshooting

## 1. Limits

| Limit | Value | Applies to | Fuuz handling | Source |
|---|---|---|---|---|
| Flow bot operations | **25 per 300 seconds per connection** | Post card as Flow bot, other Flow bot actions | Sender caps at 20 per workflow per 5 minutes; the rest wait | [Teams connector](https://learn.microsoft.com/en-us/connectors/teams/) (DOCUMENTED); 429 retries VERIFIED |
| Other non-GET Teams connector operations | 300 per 300 seconds per connection | Create team / channel, Graph POST | Provisioning at 20 ensures per 5 minutes | DOCUMENTED |
| All Teams connector calls | 100 per 60 seconds per connection | List teams, List channels, everything | One router run makes about 4 to 8 calls; keep bursts small | DOCUMENTED |
| Message size | about 28 KB | One card post | Text clipped; cards 2 to 4 KB | DOCUMENTED |
| Channels per team | 1,000 including deleted | Router workflow | Split into numbered teams at 900 | DOCUMENTED |
| Channel name | 50 characters, restricted characters | Router workflow | `teamsSafe` | DOCUMENTED |
| Mentions | 20 users and 20 tags per message | Not used | | DOCUMENTED |
| First post to a new team | about 5 minutes | Router workflow | Pre-provision (chapter 07) | VERIFIED |
| Flow bot in GCC / GCC High / DoD | Not supported | All | Post as User | DOCUMENTED |

## 2. Where to look

| Question | Look at |
|---|---|
| Did Fuuz try to send? | The send log: `NotificationQueue` rows (status, httpStatus, error, sentAt); Andon reference: `AndonAlertLedger` (delivery `teams`, status) |
| Did the workflow receive it? | Power Automate > the flow > **Run history**: a run at that time. Match `fuuz.eventKey` in the trigger outputs |
| Why did it not arrive? | The failed step in that run, and its output |
| Did anything fail in Fuuz? | Flow execution log for the detector, enqueue and sender (failed-only). The post flow logs events but no payloads |

[Screenshot: Power Automate run history with one failed run expanded to the Post card step showing 403]

## 3. Troubleshooting table

| Symptom | Likely cause | Fix |
|---|---|---|
| Run fails at Post card with **403 BotNotInConversationRoster** (after 429 retries) | Workflows app not installed in that team; or a GCC-type tenant | Install the app (chapter 06, section 3). GCC: post as User |
| Run fails at Post card: recipient not found | `fuuz.recipient` is not a Teams user's UPN (sign-in differs from e-mail, guest, external) | Set `teamsUpn` (MES) or correct the user's e-mail in Fuuz |
| Card arrives as raw JSON or the step fails on the card | Card not stringified | `string(triggerBody()?['attachments']?[0]?['content'])` |
| Graph step returns 400 / not found, URI shows `variables(...)` literally | URI typed as text, not as an expression | Re-enter as an expression; code view must show `@concat(...)` |
| Graph step rejected before sending | Path not allowed by the Teams connector (e.g. `/appCatalogs`, `/users/{id}/teamwork`) | Use an allowed path, or the HTTP-with-Entra approach (chapter 06, section 5b) |
| Two teams with the same name | Parallel creation race, or the service account was not a member of the existing team so List joined teams missed it | Chapter 07, section 5; add the service account to existing teams |
| Card posted but nobody sees it | Private team with no members; channel hidden | Add members; show the channel (chapter 07, section 3) |
| Fuuz send log `sent` (202) but no card | Any failure inside the workflow | Run history; 202 is not delivery |
| Fuuz error "teams webhook not configured" | Connection URL empty or placeholder | Paste the URL (chapter 03) |
| Fuuz error "teams webhook connection missing or inactive" | Connection inactive, renamed or deleted | Reactivate or recreate with the exact name |
| Fuuz HTTP 401 / 403 / 404 from the trigger | URL rotated, trigger deleted, workflow turned off | Copy the current URL into the Connection; turn the workflow on |
| Fuuz HTTP 429 | Throttled at the trigger | Nothing; retried or sent with the next card |
| Flow deploy refused: "data must NOT have additional properties" | Extra key in a node's data (e.g. `transform` on tryCatch) | Lint with `nodeSchema.cjs` |
| Detector runs fail: "Cannot query field X on type Y" | A field selected that the model does not have | Schema check before deploy (chapter 04, section 7) |
| Teams recipients get e-mail but no Teams card | Recipient query does not select the Teams custom fields | Add `teamsTarget teamsUpn` to the selection |
| A recipient with Teams configured no longer gets e-mail | A rule treats Teams as a replacement for e-mail instead of an addition | Make delivery methods additive (chapter 04, section 6); remove a method only explicitly |
| Recipients get the same e-mail twice | The app's alert flow sends e-mail and a platform-level "send e-mail for this notification channel" switch is also on | Turn the platform switch off; keep one sender per method (chapter 04, section 6) |
| I get no notification for cards in my own alert channel (others do) | The workflow posts **as User** on your connection. Teams does not notify you about your own messages | Post as **Flow bot** (chapter 02, section 2 notes); if User is unavoidable, run it on a dedicated service account |
| Channel post run shows **Failed** with several Post card attempts, one per team; cards never reach a team the workflow just created | Team was filled from the "Id" in **List joined teams** dynamic content, so the designer wrapped Post card in a hidden **For each** over every joined team | Set Team to `variables('teamId')`; in Code view confirm `groupId` is `@variables('teamId')` and no `Foreach` wraps the post (chapter 02, section 4.7) |
| Post card step lost its Team, Channel or card after an edit | Changing **Post as** between User and Flow bot clears Team, Channel and Adaptive Card | Re-enter all three before saving; check Code view |
| Workflow turned itself off | Owner left, or repeated failures | Turn it on; add a co-owner |
| First card to a new area very late | Normal: team and channel creation | Pre-provision |

## 4. Runbook: rotate a workflow URL

1. In the workflow, delete the trigger and add **When a Teams webhook request is received** again (**Anyone**). Re-point every expression that referenced the trigger if the designer lost them, then **Save**. The old URL stops working.
2. In Fuuz, **Integration > Connections >** the Connection: paste the new URL, **Save**.
3. Send a test (walkthrough 04). Queued cards in `retry` recover on their next attempt.

Rotate only when a URL may have leaked, or on the customer's own schedule.

## 5. Runbook: pause all Teams posts

| App | Action |
|---|---|
| Queue pattern | Set the live switch (`teamsLive` in `teamsNotificationSettings`) to `false`. Queued rows wait; old ones expire |
| Andon reference | Set `notificationTeams.enabled = false`. Teams recipients are skipped and logged; e-mail and SMS continue |
| Either | Turn the workflow off in Power Automate. Fuuz then gets 4xx and records failures |

## 6. Health checks (weekly)

- [ ] Each workflow has two owners and is On
- [ ] Run history: failures in the last 7 days reviewed
- [ ] Send log: rows in `retry` / `dead`; reasons understood
- [ ] Connections: active; payload logging still off
- [ ] New sites or areas: Sync run, members added
- [ ] Platform-level "send e-mail for this notification channel" switch still **off** where the app sends e-mail itself (no duplicate e-mails)
- [ ] Every Post card step still posts as **Flow bot**
