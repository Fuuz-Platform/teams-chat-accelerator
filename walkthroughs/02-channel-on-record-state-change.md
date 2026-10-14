# Walkthrough 02: Notify a channel when a record changes state

> **Scope and disclaimer.** This pattern was built and tested end to end in production for an **Andon (production alert)** scenario (walkthrough 01). This walkthrough applies the same approach to a **generic** event; your team can implement it for any type of event in the Fuuz platform (any model data change, a flow or workflow step, a schedule, a threshold, and so on). Steps not proven in production are marked **TO VERIFY**. Microsoft Teams and Power Automate behaviour, limits and licensing can change; validate them in your own tenant.

**Goal:** when any record of a chosen model enters a status you care about (for example a work order or inspection goes **On hold** or **Rejected**), one card appears in a fixed function channel such as **Quality Alerts**, within seconds. No polling timer.
**Example model:** `<ModelName>` with a `status` field. Replace it with yours.
**Time:** about 1 hour.

## Step 1. Teams side: fixed-channel workflow

1. Create the channel (Standard) in the function's team, e.g. **Quality Alerts**.
2. Install the **Workflows** app in that team once (team **... > Manage team > Apps > Get more apps > Workflows**), or with the guarded install in chapter 06, section 3.2. Without it, every post fails with 403 BotNotInConversationRoster.
3. Build **"Fuuz - Quality Alerts"** as in chapter 02, section 3. Adaptive Card = `string(triggerBody()?['attachments']?[0]?['content'])`.
4. Add a co-owner and failure notifications.

Template: [templates/power-automate/fuuz-teams-fixed-channel.workflow.json](../templates/power-automate/fuuz-teams-fixed-channel.workflow.json).

## Step 2. Fuuz side: Connection and post flow

1. Connection `teamsAlertsWebhook` (HTTP, URL pasted, payload logging off; chapter 03, section 1).
2. Post flow `teamsAlertsPost`, built with `fuuz/accelerators/teams-shared/post.cjs` (`teamsPostFlow({ connectionName: 'teamsAlertsWebhook', flowName: 'teamsAlertsPost', lookup: 'name' })`).
3. Test the post flow alone with [templates/fuuz/test-request-body.json](../templates/fuuz/test-request-body.json) (target `channel`). Expect `{ status: 202 }` and the card in the channel.

## Step 3. Settings, queue and sender

1. `ApplicationConfiguration` row `teamsNotificationSettings`, assigned to the owning module ([template](../templates/fuuz/teamsNotificationSettings.applicationConfiguration.json)): `live: false`, `channelEvents: []`, `stateChangeStatuses: ["onHold", "rejected"]`, `appUrl`.
2. Model `NotificationQueue` ([template](../templates/fuuz/notification-queue.model.json)).
3. Flow `notificationEnqueue`: applies the events list, dedupe and redaction; upserts the queue row.
4. Flow `notificationSend`: trigger dataChanges on `NotificationQueue` **Create**; mutex `notificationSend`; cap 20 per 5 minutes; claim, render, post through `teamsAlertsPost`, record the answer.

For the simplest case you may skip the queue and call the send step (chapter 03, section 3) directly from the detector, as the Andon reference does. Keep the queue when you need dedupe, retries or a send log.

## Step 4. The detector

Flow `notifyOn<ModelName>StateChange`, deployed **inactive**:
- Trigger: dataChanges on `<ModelName>`, operations `Update` (add `Create` if a record can be created directly in the watched status).
- Decide (pure JSONata):
  ```
  $op := $opOf($.value.before, $.value.after);
  $b := $.value.before; $a := $.value.after;
  $go := $op in ["insert", "update"] and $b.status != $a.status and $a.status in $settings.stateChangeStatuses;
  ```
- Enqueue one `stateChanged` notice for the alerts channel, dedupe key `stateChanged:<ModelName>:<id>:<new status>`, so flapping back and forth does not repeat within the window.
- Card: record type and code, old and new status, who changed it, when, a reason field if you have one, and one **Open record** button built with `appLink` (tenant last). Template: [templates/cards/record-state-change-channel.json](../templates/cards/record-state-change-channel.json).
- Failed-only logging.

Before deploying, check every field the flows select against the **live** schema.

## Step 5. Go live (order matters)

1. `channelEvents = ["stateChanged"]` (only this event can post, even if another detector is switched on by mistake).
2. Activate the detector.
3. `live = true`. Confirm the queue is empty first, so nothing old is released.

Rollback: `live = false` first, then deactivate the detector, then clear `channelEvents`.

## Step 6. Test

1. Change one test record to **On hold**. Expect a `NotificationQueue` row `sent`, HTTP 202 within seconds, and the card in the channel. **A person confirms the card is visible** (202 is not delivery).
2. Save the record again without changing the status: no second card.
3. Change it to a status not in the list: no card.
4. Clean up the test record and its queue row.

## Variations

| Variation | Change |
|---|---|
| Threshold instead of status | Decide on `before.x < limit <= after.x` |
| A channel per site or line | Use the router workflow (chapter 02, section 4) and send `teamName` / `channelName` built from codes (chapter 07) |
| Scheduled digest instead of one card per event | A schedule-triggered flow that reads the period's changes and sends one summary card |
