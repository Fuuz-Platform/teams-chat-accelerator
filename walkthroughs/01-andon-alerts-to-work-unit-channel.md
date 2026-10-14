# Walkthrough 01: Andon alerts to a work-unit channel

> **Scope and disclaimer.** This pattern was built and tested end to end in production for an **Andon (production alert)** scenario; this walkthrough is that reference implementation. Your team can implement the same approach for any type of event in the Fuuz platform (any model data change, a flow or workflow step, a schedule, a threshold, and so on). Steps not proven in production are marked **TO VERIFY**. Microsoft Teams and Power Automate behaviour, limits and licensing can change; validate them in your own tenant.

**Goal:** when an Andon is raised, escalated or resolved on a work unit, a card appears in that work unit's channel, in the team for its site and area. Selected people also get a DM.
**Reference:** the tested Andon implementation. Flows: `andonAlertNotify`, `resolveAndonRecipients`, `notificationChannelSend`, `teamsAndonPost`, `teamsProvisionTick`.
**Time:** 1 to 2 hours, plus Teams membership work by the customer.

## Prerequisites

- The MES Andon and Notification Channels modules deployed, with alerts enabled.
- Equipment hierarchy with stable **codes** for site, area and work unit.
- A Microsoft 365 service account and a Teams admin contact (chapter 02, section 1).

## Step 1. Build the router workflow (Teams side)

1. Follow chapter 02, section 4 to build **"Fuuz Andon - Teams"** with the `dm` / `channel` / `ensure` branches, the Workflows app install after Create a team, and the 3-minute and 2-minute waits.
   Every Post card step posts as **Flow bot**. In the channel post, Team and Channel are the `teamId` and `channelId` variables, never the "Id" from List joined teams; check Code view for a hidden For each (chapter 02, section 4.7).
2. Confirm the Workflows app id for this tenant (chapter 06, section 2).
3. Add a co-owner and failure notifications.
4. Keep the trigger URL page open.

Compare with [templates/power-automate/fuuz-teams-router.workflow.json](../templates/power-automate/fuuz-teams-router.workflow.json).

## Step 2. Create the Connection (Fuuz side)

1. **Integration > Connections > New**, connector **HTTP**, name `teamsAndonWebhook`.
2. Paste the trigger URL into **URL**. Headers `Content-Type: application/json`. Both payload-logging switches **off**. **Save**.
3. Optional check, if you have the repo tools: `node screens/notificationChannels/tools/createTeamsConnection.mjs` (dry run) should report `EXISTS`, `req=false resp=false`, `URL set (<n> chars)`.

## Step 3. Deploy the Fuuz pieces

In order (each tool dry-runs first and writes a rollback record):
1. Custom fields on `NotificationChannelRecipient`: `teamsTarget`, `teamsUpn` (group "Microsoft Teams").
2. Settings row `notificationTeams` (ApplicationConfiguration, module `configuration`): defaults are team per site and area, channel per work unit, prefix `Andon`, split at 900. Template: [templates/fuuz/notificationTeams.applicationConfiguration.json](../templates/fuuz/notificationTeams.applicationConfiguration.json).
3. Flows: Notification Channels (creates `teamsAndonPost` as an **Integration** flow), then Andon. Confirm the recipient query selects `teamsTarget teamsUpn`.
4. Schedule for `teamsProvisionTick` every 5 minutes (provisioning only).
5. Notification Channels screen (Teams tab).
6. Set `AndonAlertSetting.appUrl` to the MES host, e.g. `https://mes.customer.com`. Without it, cards have no buttons.

## Step 4. Choose recipients

On the Notification Channels screen, for each recipient row that should use Teams:
- **Teams target = "The Andon's own channel"** (`channel`): the alert posts into the channel of the equipment where the Andon was raised. Several channel recipients for the same alert still give **one** post.
- **Teams target = "Direct message"** (`dm`): a DM to the person. Set **Teams sign-in** (`teamsUpn`) when their Microsoft 365 sign-in differs from their e-mail.
- The recipient's usual filters (site, area, line, reason, minimum severity) still apply.
- **Teams is added, not swapped.** A recipient with a Teams target still gets e-mail (and SMS where set). Setting a Teams target never removes another method; if a person wants fewer messages, remove that method on their row explicitly (chapter 04, section 6).
- If the alert flow sends e-mail itself, leave any platform-level "send e-mail for this notification channel" switch off, or recipients can get each e-mail twice.
[Screenshot: recipient edit dialog with the Teams target select]

## Step 5. Pre-provision the teams and channels

1. Notification Channels > **Teams** tab > **Plan**. Review the team and channel counts and warnings.
   [Screenshot: Teams tab plan summary]
2. **Start sync**. Every 5 minutes up to 20 ensures go out. New teams get one ensure first; their other channels follow 5 minutes later.
3. Wait until the tab shows **done** with no errors. A plant with 10 areas and 200 work units takes roughly an hour.
4. Ask the customer's Teams admin to add members to each new private team, and to show the channels.

## Step 6. Test

1. **DM test:** on your own recipient row set the target to `dm`. Andon Alerts > **Send test**. Expect a TEST card in your chat with Workflows within seconds, and `ok` on the screen.
2. **Channel test:** raise a real test Andon on one work unit (severity 1 or 2). The router posts it as Flow bot (VERIFIED in production, 2026-10-14). Expect the card in channel `<unit code>` of team `Andon - <SITE> - <AREA>`. In `AndonAlertLedger`: a `teams` row `sent`; other channel recipients for the same Andon `suppressed` / `duplicate`.
3. **Links:** **Open Andon** ends `?andon=<code>&tenant=<tenant>`. **Acknowledge** adds `&ack=1` and asks before acknowledging.
4. **Escalate** (amber card) and **resolve** (green card, no Acknowledge button).
5. **Failure path:** deactivate the Connection, send a DM test: that recipient fails with "missing or inactive", e-mail and SMS still go, and no URL appears in any log. Reactivate.

## Step 7. Go live

- Remove test recipients, confirm `notificationTeams.enabled = true`.
- Run Sync again whenever equipment is added.
- Weekly health check (chapter 08, section 6).

## Common problems

| Problem | Fix |
|---|---|
| Teams recipients got e-mail but no Teams card | The recipient query does not select the Teams fields |
| First card to a new area took 5 minutes | Run Sync before go-live |
| 403 BotNotInConversationRoster | The team existed before and lacks Workflows; install it (chapter 06, section 3.2) |
| You get no alert for cards in your own work-unit channel | The router posts as User on your connection; switch Post card to **Flow bot** (chapter 01, section 6) |
| Duplicate teams | Two first alerts within 3 minutes in a new area; see chapter 07, section 5 |
