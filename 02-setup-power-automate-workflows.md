# 02. Set up the Power Automate workflows

**Who does this:** the customer's Microsoft 365 or Teams administrator, or an integrator with a service account in the customer's tenant.
**Time:** 15 minutes for the DM and fixed-channel workflows; 45 minutes for the router workflow.
**Result:** one to three workflows, each with a trigger URL that you paste into a Fuuz Connection (chapter 03).

The code-view definitions of all three are in [templates/power-automate/](templates/power-automate/). Build in the designer, then compare your code view with the template.

---

## 1. Before you start

| Check | Why | Status |
|---|---|---|
| **A service account** with a Teams licence, for example `svc-fuuz-teams@customer.com`. Not a personal account | A workflow belongs to its creator and stops when that account is disabled. Posts "as User" show this account | VERIFIED practice |
| **Commercial Microsoft 365 tenant** | The Flow bot is not supported in GCC, GCC High or DoD. There, use **Post as: User** | DOCUMENTED |
| **Workflows app allowed** in Teams admin center > Teams apps > Manage apps (status "Allowed") | Flow bot actions require it | DOCUMENTED |
| **Licence** | The webhook trigger and the Teams connector are standard (no premium licence). The HTTP-with-Entra and generic HTTP actions in chapter 06, section 4b, are premium | DOCUMENTED |
| **The service account is a member (or owner) of every existing team you post to** | "List joined teams" only sees teams the account has joined. A team it has not joined looks missing, and the router workflow creates a second team with the same name | VERIFIED behaviour of the action; the twin is a design consequence |

## 2. Workflow A: Direct messages (`dm`)

Use this when Fuuz sends cards to named people.

1. In Teams, open **Workflows** (left rail, **... > Workflows**), then **Create > Create from blank**. You can also start at make.powerautomate.com > **Create > Instant cloud flow > Skip**.
   [Screenshot: Workflows app home with the "Create" tab selected]
2. **Trigger:** search for **When a Teams webhook request is received** and add it.
   - **Who can trigger the flow?** **Anyone**.
   [Screenshot: trigger card with "Who can trigger the flow?" set to Anyone]
3. **Action:** **+ New step** > **Post card in a chat or channel** (Microsoft Teams).
   - **Post as:** `Flow bot`
   - **Post in:** `Chat with Flow bot`
   - **Recipient:** select the field, open the **Expression** tab (fx), paste, then **Add**:
     ```
     triggerBody()?['fuuz']?['recipient']
     ```
   - **Adaptive Card:** expression:
     ```
     string(triggerBody()?['attachments']?[0]?['content'])
     ```
   [Screenshot: Post card action with the four fields filled, expressions shown as purple tokens]
4. Name it `Fuuz <App> - Direct messages` (top left) and **Save**.
5. Open the trigger again. Copy the **HTTP URL** only into the Fuuz Connection (chapter 03). Do not paste it into chat, e-mail or a ticket.

**Notes**
- Use the **expression**, not the dynamic-content picker. Picking `attachments` from dynamic content wraps the action in an **Apply to each** loop.
- The router workflow needs `string()` around the card (VERIFIED). A fixed-target workflow may accept the object as is, but use `string()` everywhere for consistency.
- The recipient must be a licensed Teams user in the same tenant. Guests and external addresses fail in the run history.
- Whether a person who has never opened Workflows receives the Flow bot chat without any install step: see chapter 06, section 5.

## 3. Workflow B: One fixed channel

Use this for a function-wide channel such as **Quality Alerts** or **Maintenance Alerts**.

1. Create the channel by hand: the team's **... > Add channel**, name e.g. `Quality Alerts`, type **Standard**. Not Private: the Flow bot cannot post in private channels (DOCUMENTED).
2. **Install the Workflows app in that team once:** the team's **... > Manage team > Apps > Get more apps**, search **Workflows**, **Add**. Without it, every post fails with **403 BotNotInConversationRoster** (VERIFIED). Chapter 06, section 3 shows how to do this from a workflow instead.
   [Screenshot: Manage team > Apps tab listing "Workflows"]
3. In **Workflows**, **Create from blank** (or use the template "Send webhook alerts to a channel" and check every setting below).
4. **Trigger:** **When a Teams webhook request is received**, **Anyone**.
5. **Action:** **Post card in a chat or channel**:
   - **Post as:** `Flow bot`
   - **Post in:** `Channel`
   - **Team:** pick the team
   - **Channel:** `Quality Alerts`
   - **Adaptive Card:** `string(triggerBody()?['attachments']?[0]?['content'])`
6. Name it `Fuuz <App> - <Channel>` and **Save**. Copy the URL to the Fuuz Connection.

## 4. Workflow C: Router (`dm` / `channel` / `ensure`) with find-or-create

Use this when Fuuz derives the team and channel from data (one channel per work unit, per line, per site). This is the "Fuuz Andon - Teams" shape (VERIFIED in production for the Andon reference implementation).

The steps below use a **Condition** on `target`. A **Switch** works equally well.

### 4.1 Trigger and variables

1. **Trigger:** **When a Teams webhook request is received**, **Anyone**.
2. **Initialize variable**: name `teamId`, type String, value empty.
3. **Initialize variable**: name `channelId`, type String, value empty.

### 4.2 The `dm` branch

4. **Condition** `Is DM`: expression `triggerBody()?['fuuz']?['target']` **is equal to** `dm`.
5. **If yes:** **Post card in a chat or channel**: Flow bot, **Chat with Flow bot**, Recipient `triggerBody()?['fuuz']?['recipient']`, Adaptive Card `string(triggerBody()?['attachments']?[0]?['content'])`. Nothing else in this branch.

### 4.3 The team (If no: `channel` or `ensure`)

6. **List joined teams** (Microsoft Teams).
7. **Filter array** `Filter teams`:
   - **From:** `body('List_joined_teams')?['value']`
   - **Condition** (edit in advanced mode): `@equals(item()?['displayName'], triggerBody()?['fuuz']?['teamName'])`
8. **Condition** `Team found`: `length(body('Filter_teams'))` **is greater than** `0`.
   - **If yes:** **Set variable** `teamId` = `first(body('Filter_teams'))?['id']`.
   - **If no:**
     1. **Create a team**: Team name `triggerBody()?['fuuz']?['teamName']`; Description `coalesce(triggerBody()?['fuuz']?['teamDescription'], triggerBody()?['fuuz']?['teamName'])`; Visibility **Private**.
     2. **Set variable** `teamId` = `body('Create_a_team')?['newTeamId']` (VERIFIED field name).
     3. **Delay** 3 minutes. A brand-new team is not ready for apps, channels or bot posts at once (VERIFIED).
     4. **Send a Microsoft Graph HTTP request** (Microsoft Teams connector) `Install Workflows app`:
        - **URI:** switch the field to an expression and enter
          ```
          concat('https://graph.microsoft.com/v1.0/teams/', variables('teamId'), '/installedApps')
          ```
          In code view it must read `"@concat(...)"`. Typed as plain text without the `@`, the URI is sent literally and the step breaks without an obvious error (VERIFIED pitfall).
        - **Method:** POST
        - **Body:**
          ```json
          { "teamsApp@odata.bind": "https://graph.microsoft.com/v1.0/appCatalogs/teamsApps/<WORKFLOWS_APP_ID>" }
          ```
          `<WORKFLOWS_APP_ID>` is `c3a1996d-db0f-4857-a6ea-7aabf0266b00` in the reference Fuuz tenant (VERIFIED). Confirm it in yours (chapter 06, section 2).
        - **Content-Type:** `application/json`
        [Screenshot: Send a Microsoft Graph HTTP request with URI as an expression token, Method POST and the body]

### 4.4 The channel

9. **List channels**: Team = `variables('teamId')`.
10. **Filter array** `Filter channels`:
    - **From:** `body('List_channels')?['value']`
    - **Condition:** `@equals(item()?['displayName'], triggerBody()?['fuuz']?['channelName'])`
11. **Condition** `Channel found`: `length(body('Filter_channels'))` **is greater than** `0`.
    - **If yes:** **Set variable** `channelId` = `first(body('Filter_channels'))?['id']`.
    - **If no:**
      1. **Create a channel**: Team = `variables('teamId')`, Name = `triggerBody()?['fuuz']?['channelName']`, Membership type **Standard**.
      2. **Set variable** `channelId` = `body('Create_a_channel')?['id']` (VERIFIED field name).
      3. **Delay** 2 minutes (VERIFIED).

### 4.5 Post (only for `channel`)

12. **Condition** `Is channel`: `triggerBody()?['fuuz']?['target']` **is equal to** `channel`.
    - **If yes:** **Post card in a chat or channel**: Post as **Flow bot**, Post in **Channel**, Team = `variables('teamId')` (custom value), Channel = `variables('channelId')` (custom value), Adaptive Card = `string(triggerBody()?['attachments']?[0]?['content'])`.
    - **If no:** nothing (this was an `ensure`).
13. Name it `Fuuz <App> - Teams` and **Save**.

[Screenshot: the collapsed router workflow showing the Is DM condition, the team block, the channel block and the final Is channel condition]

### 4.6 Things that matter

- **Exact names.** `displayName` comparison is exact and case-sensitive in `equals`. Fuuz must send the same string every time (chapter 07).
- **Twin teams.** Two runs that both miss a new team during its 3-minute wait both create it. Teams allows duplicate display names. Avoid it by pre-provisioning (chapter 07). Setting the trigger's **Concurrency control** to 1 also prevents it, but queues every alert behind a 5-minute creation run, so it is not recommended for alerts.
- **Existing teams.** The install step above runs only for a team the workflow creates. For an existing team, install the app once by hand or add the guarded step in chapter 06, section 3.
- **Hidden channels.** Teams hides new channels from members by default. Members must "Show" the channel, or the team owner can set it to show for everyone (chapter 07).
- **Membership.** A team created by the workflow is **private** and has only the service account as owner. Adding people is the customer's Teams administrator's job (chapter 07).

## 5. On every workflow

1. **Add a co-owner.** make.powerautomate.com > **My flows** > the flow > **Share** > add an admin or a security group. A workflow stops when its only owner leaves.
2. **Failure alerts.** In the flow's details, make sure the owner receives failure notifications. Optionally add a parallel branch that runs after a failed post (**Configure run after: has failed**) and posts a short text to an admin channel.
3. **Note the flow id** (from the URL in Power Automate) in your runbook. You need it to find the run history.
4. **Rotation.** To replace a leaked URL, delete the trigger and add it again; that gives a new URL. Paste it into the Fuuz Connection (chapter 08).

## 6. Test the workflow on its own

In Power Automate, open the flow > **Test** > **Manually** > **Run flow**, or POST the body in [templates/fuuz/test-request-body.json](templates/fuuz/test-request-body.json) from any HTTP client you trust. Change `fuuz.recipient` to your own UPN. Then open **Run history** and confirm every step is green.
