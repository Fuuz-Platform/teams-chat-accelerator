# 06. Bots and app installation (no manual steps for users)

**Requirement:** the Flow bot must be present wherever Fuuz posts **without any user adding it by hand**. The Power Automate workflows install it themselves, or an administrator does it once for everyone.

**Why it matters:** a Flow bot post into a team where the Workflows app is not installed fails with **403 `BotNotInConversationRoster`**. The first attempts show as 429 retries in the run history, then the 403 (VERIFIED). Because the webhook already answered 202, Fuuz never sees this failure.

## Summary of cases

| Where the card goes | How the bot gets there | Status |
|---|---|---|
| A team the workflow **creates** | Workflow: Graph `POST /teams/{id}/installedApps` after Create a team and a 3-minute wait | **VERIFIED** in production |
| An **existing** team | Workflow: the same call, guarded (check first, or treat 409 as success) | **TO VERIFY** (the call shape is verified; the guard and the response for an already-installed app are not) |
| A **group chat** | Workflow: Graph install into the chat | **TO VERIFY** (the connector's path rules may not allow it; see section 4) |
| A **1:1 chat** with the Flow bot | (a) admin pre-install by policy, (b) Graph install for the user, (c) post as a user instead | **TO VERIFY** for all three. Recommendation in section 5 |

---

## 1. The tool: "Send a Microsoft Graph HTTP request"

This Microsoft Teams connector action calls Graph **as the workflow connection's account** (delegated). No app registration and no premium licence are needed. It accepts only some paths:

- First segment: `/teams`, `/me`, `/users`
- Second segment: `channels`, `chats`, `installedApps`, `messages`, `pinnedMessages`, `onlineMeetings`

Paths such as `/appCatalogs/...` and `/users/{id}/teamwork/installedApps` are **rejected** (VERIFIED). Source: [Teams connector reference](https://learn.microsoft.com/en-us/connectors/teams/).

Always enter the URI as an **expression** (code view shows `"@concat(...)"` or `"@{...}"`). Plain text containing `variables('teamId')` is sent literally (VERIFIED pitfall).

## 2. Find the Workflows app id in a new tenant

In the reference (Fuuz) tenant the Workflows app's catalog id is `c3a1996d-db0f-4857-a6ea-7aabf0266b00` (VERIFIED). Microsoft store apps usually have the same catalog id in every tenant, but **confirm it in each customer tenant** (TO VERIFY per tenant).

Steps (one-time, in any test workflow):
1. Install Workflows by hand in one team (team **... > Manage team > Apps > Get more apps > Workflows > Add**), or pick a team where Workflows already posts.
2. Add **Send a Microsoft Graph HTTP request**: Method GET, URI
   ```
   https://graph.microsoft.com/v1.0/teams/<TEAM_ID>/installedApps?$expand=teamsApp
   ```
3. Run it. In the output, find the entry whose `teamsApp.displayName` is `Workflows` and copy `teamsApp.id`. Use that value as `<WORKFLOWS_APP_ID>` everywhere in this kit.
   [Screenshot: run history output with teamsApp.displayName "Workflows" and its id highlighted]

Alternative for a Graph-capable admin: Graph Explorer, `GET https://graph.microsoft.com/v1.0/appCatalogs/teamsApps?$filter=displayName eq 'Workflows'` (requires AppCatalog read consent).

## 3. Teams

### 3.1 New team created by the workflow (VERIFIED)

Inside the router workflow (chapter 02, section 4.3), right after **Create a team**:
1. **Set variable** `teamId` = `body('Create_a_team')?['newTeamId']`
2. **Delay** 3 minutes
3. **Send a Microsoft Graph HTTP request**: POST, URI `@concat('https://graph.microsoft.com/v1.0/teams/', variables('teamId'), '/installedApps')`, body `{"teamsApp@odata.bind":"https://graph.microsoft.com/v1.0/appCatalogs/teamsApps/<WORKFLOWS_APP_ID>"}`

The connection account created the team, so it is the owner and may install apps. Graph reference: [Add app to team](https://learn.microsoft.com/en-us/graph/api/team-post-installedapps).

### 3.2 Existing team (TO VERIFY)

A team created by hand, or by an earlier workflow version, may lack the app. Add a guarded install to the "team found" branch (or run it once per team from a maintenance workflow).

**Option A: check, then install (recommended).**
1. **Send a Microsoft Graph HTTP request** `Get installed Workflows`: GET, URI
   ```
   @concat('https://graph.microsoft.com/v1.0/teams/', variables('teamId'), '/installedApps?$expand=teamsApp&$filter=teamsApp/id eq ''<WORKFLOWS_APP_ID>''')
   ```
2. **Condition**: `length(body('Get_installed_Workflows')?['value'])` is equal to `0`.
   - If yes: the POST from 3.1 (no delay needed for an existing team).

**Option B: install and accept "already installed".**
1. The POST from 3.1.
2. A following step with **Configure run after: is successful, has failed**, so the workflow continues.
3. Optionally, a Condition on `outputs('Install_Workflows_app')?['statusCode']` to tell `201` and `409` (assumed "already installed") from real errors. **TO VERIFY** that Graph answers 409 Conflict for an app that is already installed.

**Also TO VERIFY:** the connection account must be allowed to install apps in that team. If it is only a member and the team restricts app installs to owners, make the service account an owner of every team Fuuz posts to.

## 4. Group chats (TO VERIFY)

Graph installs an app in a chat with `POST /chats/{chat-id}/installedApps` ([Add app to chat](https://learn.microsoft.com/en-us/graph/api/chat-post-installedapps)). The Teams connector's Graph action requires the first segment to be `/teams`, `/me` or `/users`, so `/chats/...` is likely **rejected**. Try in this order:

1. **Through the connector, via `/me`:**
   - Get or create the chat: **Create a chat** (members = semicolon-separated UPNs, Title = a topic). Save its id: `body('Create_a_chat')?['id']` (TO VERIFY the field name).
   - **Send a Microsoft Graph HTTP request**: POST, URI `@concat('https://graph.microsoft.com/v1.0/me/chats/', variables('chatId'), '/installedApps')`, the same body as 3.1.
   - Then **Post card in a chat or channel**: Flow bot, **Group chat**, the chat id.
   - **TO VERIFY:** that Graph accepts `/me/chats/{id}/installedApps` and the connector accepts the path.
2. **If the connector rejects it:** use the HTTP-with-Entra approach of section 5(b) with `POST https://graph.microsoft.com/v1.0/chats/{chat-id}/installedApps` and the application permission `TeamsAppInstallation.ReadWriteForChat.All` (DOCUMENTED; least-privileged "Self" variants only install the calling app itself, not Workflows).
3. **If neither is possible:** post to the group chat **as User** (the service account), which needs no bot (section 5(c)).

## 5. 1:1 chats with the Flow bot

"Post card in a chat or channel" with **Post in: Chat with Flow bot** posts into the recipient's personal chat with the Workflows app. Microsoft documents only that the Workflows app must be **allowed** in the Teams admin center. Whether a user who has never opened Workflows always receives the chat, or the post fails until the app is personally available to them, is **TO VERIFY** in each tenant (test with a user who has never used Workflows; see walkthrough 04).

Make it independent of user action with one of these:

### (a) Admin pre-installs Workflows for the target users (RECOMMENDED)

One-time admin step, no code, no new permissions, no user action.

1. Teams admin center > **Teams apps > Manage apps**: find **Workflows**, confirm status **Allowed**.
2. Pre-install it for the people Fuuz will DM:
   - **Tenants with app-centric management:** **Manage apps > Workflows > Install for users** (or the equivalent "Installation" setting), choose the group. See [Install apps for users](https://learn.microsoft.com/en-us/microsoftteams/install-teams-apps).
   - **Other tenants:** **Teams apps > Setup policies**: edit **Global (Org-wide default)** or create a policy (e.g. "Fuuz alert recipients"), under **Installed apps** add **Workflows**, optionally pin it, **Save**, then assign the policy to a security group that contains every DM recipient. See [App setup policies](https://learn.microsoft.com/en-us/microsoftteams/teams-app-setup-policies).
   [Screenshot: Setup policy with Workflows under Installed apps]
3. Wait. Microsoft says policy changes "can take a few hours" (DOCUMENTED). **TO VERIFY:** how long until a newly added group member has the app.
4. Keep group membership in step with Fuuz recipients (e.g. a dynamic group on department, or add people when they are added as recipients).

Why recommended: it covers every user at once, survives staff changes when a dynamic group is used, and needs no Graph permission beyond what Teams admins already hold.

### (b) The workflow installs Workflows for the user through Graph (TO VERIFY)

Graph: `POST /users/{user-id | upn}/teamwork/installedApps` ([Install app for user](https://learn.microsoft.com/en-us/graph/api/userteamwork-post-installedapps)). Installing an app **other than the caller itself** needs `TeamsAppInstallation.ReadWriteForUser` (delegated) or `TeamsAppInstallation.ReadWriteForUser.All` (application) (DOCUMENTED). The Teams connector's Graph action **rejects** `/teamwork` paths (VERIFIED), so use one of these:

**b1. App registration + the HTTP action (premium) (preferred within option b)**
1. Entra admin center > **App registrations > New registration**: `Fuuz Teams Installer`, single tenant. A separate registration, never one that holds other Fuuz permissions.
2. **API permissions > Microsoft Graph > Application > `TeamsAppInstallation.ReadWriteForUser.All`**, then **Grant admin consent**.
3. **Certificates & secrets**: create a secret (or a certificate). Store it in Azure Key Vault.
4. In the router workflow, in the `dm` branch **before** Post card, add a **Scope** `Ensure Workflows for user`:
   1. **Azure Key Vault > Get secret** (Secure outputs on).
   2. **HTTP** (premium) `Get user installs`: GET
      ```
      https://graph.microsoft.com/v1.0/users/@{encodeUriComponent(triggerBody()?['fuuz']?['recipient'])}/teamwork/installedApps?$expand=teamsApp&$filter=teamsApp/id eq '<WORKFLOWS_APP_ID>'
      ```
      Authentication **Active Directory OAuth**: Tenant `<TENANT_ID>`, Audience `https://graph.microsoft.com`, Client ID `<CLIENT_ID>`, Credential type Secret, Secret = the Key Vault output. Secure inputs and outputs on.
   3. **Condition** `length(body('Get_user_installs')?['value'])` is equal to `0`: if yes, **HTTP** POST `https://graph.microsoft.com/v1.0/users/<same>/teamwork/installedApps`, body `{"teamsApp@odata.bind":"https://graph.microsoft.com/v1.0/appCatalogs/teamsApps/<WORKFLOWS_APP_ID>"}`, same authentication; then **Delay** 1 minute (TO VERIFY whether a wait is needed).
5. Set the Post card step to **run after** the Scope **is successful or has failed**, so a failed install never blocks the post attempt.

Snippet: [templates/power-automate/snippet-install-workflows-for-user.json](templates/power-automate/snippet-install-workflows-for-user.json).

**b2. "HTTP with Microsoft Entra ID" connector (delegated).** The preauthorized connector runs as the signed-in connection user through a Microsoft first-party app; whether that app may obtain `TeamsAppInstallation.ReadWriteForUser` is **TO VERIFY** and unlikely. The newer non-preauthorized version lets an admin consent specific scopes ([connector reference](https://learn.microsoft.com/en-us/connectors/webcontents/)); **TO VERIFY**. Both are premium.

Costs of option b: a premium licence for the workflow owner, a new Graph application permission that IT must approve, and a secret to rotate.

### (c) Post as a user instead of the Flow bot (fallback)

No bot is involved, so nothing has to be installed.

1. **Create a chat** (Teams connector): Members = `triggerBody()?['fuuz']?['recipient']` (the connection's account is added as the creator), Title optional.
2. **Post card in a chat or channel**: **Post as: User**, **Post in: Group chat**, Group chat = `body('Create_a_chat')?['id']`, Adaptive Card = `string(triggerBody()?['attachments']?[0]?['content'])`.

**TO VERIFY:** whether "Create a chat" with one other member returns the existing 1:1 chat or creates a new group chat each time (if it creates a new chat each time, store chat ids per recipient and reuse them). Cards appear as sent by the service account, and user-posted actions count against that account's limits.

### Recommendation

1. **Use (a)** for DMs: pre-install Workflows for a security group of Fuuz alert recipients. Verify with one never-used account before go-live.
2. Keep **(c)** as the documented fallback for GCC tenants (where the Flow bot is not supported) and for tenants whose admins will not pre-install apps.
3. Use **(b)** only where (a) is refused and a premium licence and a new Graph permission are acceptable.

## 6. Beyond Workflows: a Fuuz Teams bot (design only)

A registered bot removes the Workflows limits: a real delivery answer (201 with an activity id), cards updated in place, `Action.Execute` buttons that write back to Fuuz, and no 25-per-5-minutes Flow bot cap. It needs a Teams app package, an Azure Bot / Entra registration, an admin install through setup policies, and an inbound endpoint that validates Bot Framework tokens. Fuuz request flows cannot validate RS256 tokens natively today, so this needs a small validating proxy or platform support. The Fuuz side (detectors, queue, renderer) stays the same; only the post flow changes. Not built.
