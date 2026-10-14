# 09. Security

## 1. Threat model in one table

| Asset | Risk | Control |
|---|---|---|
| Workflow trigger URL (contains `sig=`) | Anyone holding it can post into Teams as the Flow bot, and (router workflow) create teams | Store only in the Fuuz Connection; never in chat, e-mail, tickets, docs, repos or logs. Rotate on suspicion (chapter 08) |
| Card content | Sensitive data in a channel with a mixed audience | Content rules per recipient; content-free cards for restricted records; deep links instead of data |
| Routing (`fuuz` object) | A user steering a card to another person or team | Build routing server-side from Fuuz rows only, never from request input |
| Service account | A disabled account stops every workflow; a compromised one can post anywhere | Dedicated account, co-owners, MFA / conditional access per customer policy |
| Graph permissions | Over-broad app permissions | Prefer the Teams connector (delegated, no new consent). Any app registration is separate, least-privileged and owned by IT |

## 2. The URL is a secret

- The trigger uses **Who can trigger: Anyone** because Fuuz cannot present an Entra token. The `sig=` parameter is the only authentication.
- In Fuuz it lives only in the Connection's URL field. Restrict **Integration > Connections** to administrators; the URL is visible there.
- Connection request and response payload logging: **off** (explicitly `false`).
- The post flow: every node logs no input, output or errors. Its answer is `{ status, error }` with URLs, `/powerautomate/` paths and `sig=` replaced. Deploy tools refuse a post flow that is not quiet.
- Tools that set or check the URL print only "set (n chars)", the host, or a fingerprint.
- Never paste the URL into a support ticket. Share the flow id instead.

## 3. Content rules

- **Minimum content.** A card says what happened and links to Fuuz. The Fuuz screen enforces access when the person clicks.
- **Restricted records.** For a recipient without clearance, send a content-free card: a fixed headline, a fixed line, and a link with ids only. Decide clearance per recipient; **fail closed** (if the clearance read fails, everyone gets the content-free card). In a channel with a mixed audience, restricted records always get the content-free card.
- **Defence in depth.** The renderer drops subtitle, facts, excerpt and extra links when `redacted` is true.
- **Stored queue rows** hold the already-redacted content and carry the record's `restricted` stamp, so row-level filtering applies to the send log too.
- **No self-notifications** and **domain allow-lists** for DMs (e.g. only the customer's own domains) prevent mis-addressed cards to outside addresses.

## 4. Links

- Links carry ids, never data. The tenant parameter is last (chapter 03).
- Action links (`&ack=1`) only open a confirmation; the action happens on the user's click inside Fuuz, as that user. Link prefetchers cannot acknowledge anything.

## 5. Identity and permissions

| Component | Runs as | Permissions |
|---|---|---|
| Fuuz detectors / sender | The flow's caller (flows run as the caller, including System flows). Triggered flows run under the platform's trigger identity | Data grants for every model the flow reads and writes |
| Fuuz post flow | The calling flow's identity | Read the Connection; run the sub-flow |
| Power Automate workflow | The connection's account (service account) | Teams connector: delegated, the account's own Teams rights. Team owner for app installs |
| Optional user-install app (chapter 06, 5b) | Application | `TeamsAppInstallation.ReadWriteForUser.All` only, admin-consented, separate registration, secret in Key Vault |

## 6. Ownership and continuity

- Build workflows under the service account and add at least one co-owner (an admin or a security group).
- Document the workflow ids, Connection names and the Workflows app id in the customer runbook.
- Turn on failure notifications to the owners.

## 7. Data residency and tenancy

- Cards travel Fuuz > Power Automate (customer tenant) > Teams. Nothing is stored by Fuuz outside the customer's own Fuuz tenant except the send log.
- Each Fuuz app keeps its own Connections and settings per tenant; shared code is packaged at build time, so no tenant depends on another at runtime.
- GCC, GCC High and DoD tenants: the Flow bot is not available; use Post as User and review the Graph endpoints for the national cloud.
