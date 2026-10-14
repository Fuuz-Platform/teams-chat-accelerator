# Walkthrough 03: Send a DM to the assigned user

> **Scope and disclaimer.** This pattern was built and tested end to end in production for an **Andon (production alert)** scenario (walkthrough 01), including Teams DMs to named recipients. This walkthrough applies the same approach to a **generic** event; your team can implement it for any type of event in the Fuuz platform (any model data change, a flow or workflow step, a schedule, a threshold, and so on). Steps not proven in production are marked **TO VERIFY**. Microsoft Teams and Power Automate behaviour, limits and licensing can change; validate them in your own tenant.

**Goal:** when a record is assigned to a person (a task, work order, inspection, approval), that person gets a Teams DM with a link to the record. Never for their own change.
**Example model:** `<ModelName>` with an `assigneeUserId` field. Replace it with yours.
**Time:** about 1 hour, plus the admin step for the Workflows app.

## Step 1. Teams side

1. Build **"Fuuz - Direct messages"** (chapter 02, section 2): Flow bot, Chat with Flow bot, Recipient `triggerBody()?['fuuz']?['recipient']`, Adaptive Card `string(triggerBody()?['attachments']?[0]?['content'])`.
2. **Make the Flow bot available to every recipient without user action** (chapter 06, section 5, option a): the Teams admin pre-installs **Workflows** for a security group of the DM recipients by setup policy or app-centric install. Allow a few hours (TO VERIFY timing).
3. Add a co-owner and failure notifications.

Template: [templates/power-automate/fuuz-teams-dm.workflow.json](../templates/power-automate/fuuz-teams-dm.workflow.json).

## Step 2. Fuuz side: Connection and post flow

1. Connection `teamsDmWebhook` (HTTP, URL, payload logging off).
2. Post flow `teamsDmPost`, built with `teams-shared/post.cjs`.
3. Test it alone with your own UPN in [templates/fuuz/test-request-body.json](../templates/fuuz/test-request-body.json).

## Step 3. Who may receive DMs

| Rule | Where |
|---|---|
| Only company addresses | `dmAllowedDomains` in `teamsNotificationSettings` |
| Personal choice | `UserNotificationPreference.channel`: `teams`, `email`, `both`, or empty (= `defaultChannel`). Offer it on a preferences screen; the save flow writes only the caller's row ([template](../templates/fuuz/user-notification-preference.model.json)) |
| Never the actor | Remove the person who made the change (`after.updatedByUserId`, else `createdByUserId`; TO VERIFY that `after` carries `updatedByUserId` for your model) |
| Service users | Skip changes made by imports, syncs and system users |
| Restricted records | Recipients without access get a content-free card ([template](../templates/cards/restricted-content-free-dm.json)) |
| Teams address | The user's e-mail, taken as their UPN. People whose sign-in differs fail in the run history: fix the e-mail or keep a UPN field per user |

## Step 4. The detector

Flow `notifyOn<ModelName>Assigned`, deployed **inactive**:
- Trigger: dataChanges on `<ModelName>`, operations `Create`, `Update`.
- Decide:
  ```
  $op := $opOf($.value.before, $.value.after);
  $b := $.value.before; $a := $.value.after;
  $actor := $a.updatedByUserId ? $a.updatedByUserId : $a.createdByUserId;
  $go := $a.assigneeUserId and ($op = "insert" or $b.assigneeUserId != $a.assigneeUserId) and $a.assigneeUserId != $actor;
  ```
- Enqueue one `recordAssigned` DM, dedupe key `recordAssigned:<ModelName>:<id>:user:<assignee>`. A re-assignment A > B > C within the coalesce window marks B's pending card `superseded`; only C gets one.
- Card: "<actor> assigned you: <title>", due date, priority, status, a "why" line, and **Open record** (tenant last). Template: [templates/cards/record-assigned-dm.json](../templates/cards/record-assigned-dm.json).
- Failed-only logging.

## Step 5. Pilot

1. Set `pilotRedirectUpn` to the pilot user: every DM goes to them with the headline prefixed `[TEST for <real recipient>]`.
2. `dmEvents = ["recordAssigned"]`, activate the detector, `live = true`.
3. Assign a test record to someone else. The pilot user receives the `[TEST for ...]` DM. Check the run history and the queue row.
4. Assign a record to yourself: no DM.
5. Clear `pilotRedirectUpn` when the pilot is accepted.

## Step 6. Verify delivery to a fresh user (TO VERIFY)

Pick an account that has never opened Workflows and is in the pre-install group. Send one DM. If the run history shows a bot or roster error, the pre-install has not reached that user yet (wait, or check the policy assignment), or use option (b) or (c) of chapter 06, section 5.

## Variations

| Variation | Change |
|---|---|
| Comment on a record | Detector on the comment model (insert); recipients = owner, creator, assignee minus the author; merge bursts into "3 new comments on ..." |
| Reminder on a due date | A morning schedule finds records due today and enqueues one DM per person, deduped per record and date |
| Approval requested | DM the approver with an **Open approval** button; the approval itself happens in Fuuz |
