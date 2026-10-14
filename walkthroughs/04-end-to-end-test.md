# Walkthrough 04: End-to-end test

> **Scope and disclaimer.** This pattern was built and tested end to end in production for an **Andon (production alert)** scenario; the steps below apply to it and to any other event you build. Your team can implement the same approach for any type of event in the Fuuz platform (any model data change, a flow or workflow step, a schedule, a threshold, and so on). Steps not proven in production are marked **TO VERIFY**. Microsoft Teams and Power Automate behaviour, limits and licensing can change; validate them in your own tenant.

Use this after any new workflow, any URL rotation, and before every go-live. Each step isolates one layer, so a failure points at its cause.

| Step | Tests | Pass |
|---|---|---|
| 1 | The workflow alone | Card in Teams; run history green |
| 2 | Fuuz Connection and post flow | `{ status: 202 }`; card in Teams |
| 3 | Card renderer and links | Buttons open the right Fuuz screen with `tenant=` last |
| 4 | The event path (detector, queue, sender) | Send-log row `sent`; card in Teams |
| 5 | Negative cases | No card where none is expected |
| 6 | Failure path | Failures visible; nothing secret logged |

## Step 1. The workflow alone

1. Copy [templates/fuuz/test-request-body.json](../templates/fuuz/test-request-body.json). Set `fuuz.recipient` to your UPN (for `dm`), or `teamName` / `channelName` to an existing test team and channel (for `channel`).
2. In Power Automate: the flow > **Test > Manually**, then trigger it by POSTing the body from a trusted HTTP client on your own machine. Do not paste the URL into shared tools.
3. Open **Run history**: every step green. The card is in Teams.
   [Screenshot: run history, all steps green]
4. Router only: repeat with a **new** team name to exercise create, app install and waits (about 5 minutes). Then archive the test team.

## Step 2. Fuuz Connection and post flow

1. In Fuuz, run the post flow (e.g. `teamsAndonPost`) with payload `{ "body": <the same test body> }`.
2. Expect the response `{ "status": 202, "error": null }` and the card in Teams.
3. Check the flow's execution log: events only, no input, output or error payloads.

## Step 3. Card and links

1. Trigger the real card path in test mode (MES: Andon Alerts > **Send test**; Notification Channels > **Send test**).
2. In Teams, check light and dark themes, desktop and mobile.
3. Click every button: the Fuuz screen opens on the right record; the URL ends `tenant=<tenant>`; Acknowledge asks before acting.

## Step 4. The event path

1. Cause one real event (a test Andon; a test record moved into a watched status; a test record assigned to someone else with the pilot redirect on).
2. Expect the send-log row (`AndonAlertLedger` / `NotificationQueue`) with status `sent` and HTTP 202 within seconds.
3. **A person confirms the card is visible in Teams.** 202 is not delivery.

## Step 5. Negative cases

| Case | Expected |
|---|---|
| Same event re-delivered or repeated within the dedupe window | No second card |
| Your own change | No DM to you |
| Status saved again without a change | No card |
| Event not listed in `channelEvents` / `dmEvents` | No card; the enqueue reason says why |
| Live switch off | Nothing queued or posted |

## Step 6. Failure path

1. Deactivate the Connection; trigger one card. Expect a send failure "missing or inactive" in Fuuz, other delivery methods unaffected, no URL in any log. Reactivate.
2. Optional: turn the workflow off; trigger one card. Expect a 4xx recorded in Fuuz. Turn it back on.
3. Optional (router): post to an existing team without the Workflows app. Expect 403 BotNotInConversationRoster in the run history and 202 in Fuuz. This proves your team has monitoring for silent failures.

## Step 7. Record

Write down: workflow names and ids, Connection names, Workflows app id, test date, who confirmed each card. Clean up test records, queue rows and test teams.
