# 05. Adaptive Cards and styling

All Fuuz Teams cards are **Adaptive Card 1.4**, built by one renderer (`teams-shared/cards.cjs`). Card templates are in [templates/cards/](templates/cards/).

## 1. Version and supported features

| Item | Rule | Source |
|---|---|---|
| Schema version | `"version": "1.4"`. Teams renders up to 1.6 for bot-sent cards on desktop and mobile, but 1.4 is what we have verified through Workflows "Post card" on desktop, web and mobile | Teams [cards reference](https://learn.microsoft.com/en-us/microsoftteams/platform/task-modules-and-cards/cards/cards-reference) (DOCUMENTED 1.6); 1.4 VERIFIED |
| Actions | `Action.OpenUrl` only | `Action.Submit` is not supported through incoming webhooks (DOCUMENTED). `Action.Execute` needs a bot of your own (chapter 06, section 6) |
| Action `style` | `"positive"` is sent but Teams ignores positive / destructive styling | DOCUMENTED; harmless |
| Size | Under about **28 KB** for the whole message, or the post fails with "Request Entity too large" | DOCUMENTED (Teams connector). Fuuz cards are 2 to 4 KB |
| Images | Public HTTPS, PNG / JPEG / GIF, at most 1024 x 1024, no redirects, no SVG. Host on a CDN | DOCUMENTED |
| `fallbackText` | Always set. It is what notifications and screen readers show | Practice |

## 2. Layout

```
+--------------------------------------------------------------+
| [Fuuz logo 84px]                         MES - Andon raised  |  header ColumnSet
+--------------------------------------------------------------+
| SEV1 ANDON - Machine breakdown                (bold, Medium) |  Container style=attention, bleed
| AR-00072 at WU-RF03, LINE-RF                  (subtle)       |
+--------------------------------------------------------------+
| Work unit   WU-RF03                                          |  FactSet
| Area        AREA-ROLLFORM                                    |
| Severity    Critical (1)                                     |
| Raised at   Oct 9, 2026 2:19 PM EDT                          |
+--------------------------------------------------------------+
| "Excerpt text, up to 6 lines"                                |  Container style=emphasis (optional)
| You get this because ...                      (small, subtle)|  optional
+--------------------------------------------------------------+
| [ Open Andon ]  [ Acknowledge ]                              |  Action.OpenUrl
+--------------------------------------------------------------+
```

- **Header:** a two-column ColumnSet: the logo (`width: 84px`, `altText: "Fuuz"`) and a right-aligned small subtle label naming the app and event.
- **Headline block:** for alerts, a `Container` with a `style` that carries the severity colour, `bleed: true`. For plain notices (assignment DMs), no container.
- **Facts:** a `FactSet`. Drop empty values. Titles at most 30 characters, values at most 160.
- **Buttons:** the first is the main action. Keep to two or three.

## 3. Severity colours

Teams maps Container styles to theme colours, so they work in light, dark and high-contrast themes without hard-coded hex values.

| Fuuz meaning | Container `style` | Example |
|---|---|---|
| Critical / severity 1 / raised | `attention` (red) | "SEV1 ANDON - Machine breakdown" |
| Warning / severity 2 / escalated | `warning` (amber) | "Escalated: AR-00072 open 30 min" |
| Resolved / won | `good` (green) | "Resolved: AR-00072" |
| Information | `accent` or `emphasis` | Test cards, digests |
| Plain notice | none | Record assigned to you |

Do not rely on colour alone: put the severity word in the headline ("SEV1", "Escalated", "Resolved").

## 4. Text rules

- Clip: headline 140, subtitle 200, fact value 160, excerpt 600 characters (6 lines). A 60 KB comment still yields a card under 3 KB (VERIFIED by test).
- Format times in the **recipient's** or the site's time zone, with the zone abbreviation.
- Plain text only. Avoid Markdown tables and HTML.
- When text sits inside a JSONata string literal in a flow, keep it free of single quotes and backticks, or escape it.
- Name people by display name, never by e-mail, in channel cards.

## 5. Buttons and deep links

- `Action.OpenUrl` to a Fuuz screen, built with `appLink` (tenant last, chapter 03).
- **Open** button: the record. **Acknowledge** button: the same URL with `&ack=1` before the tenant. The screen asks for confirmation; it never acknowledges just because the link was opened.
- No link when the host or tenant is unknown: the renderer drops an action whose URL is empty, because Teams refuses an empty OpenUrl.

## 6. Restricted variant

For a record the recipient is not cleared to see, send a **content-free** card: a fixed headline ("A restricted item was assigned to you"), one explanatory line, and one link carrying ids only. The renderer itself drops subtitle, facts, excerpt and extra links whenever `redacted` is true, so a mistake upstream cannot leak content (chapter 09).

## 7. Preview and test

1. **Offline preview:** `teams-shared/preview/render.cjs` renders the card JSON with the Adaptive Cards JS renderer and a Teams-like host config, light and dark, to PNG. Review previews before deploying a card change.
   [Screenshot: andon-raised-sev1 card rendered light and dark side by side]
2. **Designer:** paste the `content` object into the [Adaptive Cards Designer](https://adaptivecards.microsoft.com/designer) with host app "Microsoft Teams", light and dark.
3. **Real Teams:** send through the workflow and check on desktop, web and the mobile app, in light and dark themes. Mobile is narrower: check that facts wrap and buttons fit.
4. **Accessibility:** every image has `altText`; meaning is never colour-only.

## 8. Card JSON checklist

- [ ] `type: "AdaptiveCard"`, `version: "1.4"`, `$schema` set
- [ ] `fallbackText` set
- [ ] Only `Action.OpenUrl`, each with a non-empty `https` URL ending in `tenant=<tenant>`
- [ ] No content from restricted records for uncleared recipients
- [ ] Whole message under 28 KB (aim for under 5 KB)
- [ ] Logo URL public on a CDN, no redirect
- [ ] Checked light and dark
