'use strict';
/*
 * teams-shared/cards.cjs: the Microsoft Teams card renderer. Every Fuuz app that posts to a Teams Workflows webhook renders its
 * cards here, so the card shape exists once.
 *
 * TEAMS_CARD_FN is a JSONata lambda: spec -> the exact body POSTed to a "When a Teams webhook request is received" workflow:
 *   { "type": "message",
 *     "attachments": [ { "contentType": "application/vnd.microsoft.card.adaptive", "contentUrl": null, "content": <AdaptiveCard 1.4> } ],
 *     "fuuz": <spec.fuuz, as given: the routing the workflow reads (recipient, target, teamName, channelName, ...)> }
 * Adaptive Card 1.4 only (Workflows "Post card in a chat or channel" as Flow bot); actions are Action.OpenUrl only
 * (Action.Submit is not supported through webhooks).
 *
 * spec = {
 *   label, labelColor?            the right-hand header text (beside the Fuuz logo) and its colour ("Default" | "Warning" | ...)
 *   style?                        null = plain card; "attention" | "warning" | "accent" | "good" | "emphasis" = the headline and
 *                                 subtitle sit in a Container of that style (a severity colour)
 *   headline, subtitle?           clipped to 140 / 200 characters
 *   facts?: [{ title, value }]    empty values dropped; titles 30, values 160 characters
 *   excerpt?                      an emphasis Container, 600 characters, 6 lines
 *   why?                          a small subtle line at the end ("You get this because ...")
 *   actions: [{ title, url, style? }]   Action.OpenUrl, in order (the first is usually style "positive")
 *   fallbackText?                 defaults to the clipped headline
 *   fuuz: { ... }                 passed through unchanged
 * }
 * The caller keeps every content rule that is its own (a restricted variant, severity wording): this file only renders.
 * Text must be single-quote free and backtick free where it sits inside a JSON string (the callers' contract).
 */

const LOGO = 'https://fuuz-news.b-cdn.net/brand/email/fuuz-logo-horizontal-on-midnight-320w.png';

const TEAMS_CARD_FN = `function($s) { (
  $clip := function($t, $max) { $length($string($t)) > $max ? $substring($string($t), 0, $max - 1) & "…" : $string($t) };
  $facts := [$filter($s.facts, function($f) { $exists($f.value) and $f.value != "" })];
  $header := {
    "type": "ColumnSet",
    "columns": [
      { "type": "Column", "width": "auto", "verticalContentAlignment": "Center",
        "items": [ { "type": "Image", "url": "${LOGO}", "width": "84px", "altText": "Fuuz" } ] },
      { "type": "Column", "width": "stretch", "verticalContentAlignment": "Center",
        "items": [ { "type": "TextBlock", "text": $s.label, "horizontalAlignment": "Right",
                     "size": "Small", "isSubtle": true, "wrap": true, "color": $s.labelColor ? $s.labelColor : "Default" } ] }
    ]
  };
  $head := [ { "type": "TextBlock", "text": $clip($s.headline, 140), "size": "Medium", "weight": "Bolder", "wrap": true, "spacing": "Medium" } ];
  $sub := $s.subtitle ? [ { "type": "TextBlock", "text": $clip($s.subtitle, 200), "isSubtle": true, "wrap": true, "spacing": "Small" } ] : [];
  $top := $s.style
    ? [ { "type": "Container", "style": $s.style, "bleed": true, "spacing": "Medium", "items": $append($head, $sub) } ]
    : $append($head, $sub);
  $body := $append($append($append($append(
    [ $header ], $top),
    ($count($facts) ? [ { "type": "FactSet", "spacing": "Medium",
        "facts": [$map($facts, function($f) { { "title": $clip($f.title, 30), "value": $clip($f.value, 160) } })] } ] : [])),
    ($s.excerpt ? [ { "type": "Container", "style": "emphasis", "spacing": "Medium", "bleed": false,
        "items": [ { "type": "TextBlock", "text": $clip($s.excerpt, 600), "wrap": true, "maxLines": 6 } ] } ] : [])),
    ($s.why ? [ { "type": "TextBlock", "text": $s.why, "size": "Small", "isSubtle": true, "wrap": true, "spacing": "Medium" } ] : []));
  /* an action without a URL (e.g. a link dropped because the run had no tenant) is left out: Teams refuses an empty OpenUrl */
  $actions := [$map($filter($s.actions, function($a) { $type($a.url) = "string" and $a.url != "" }), function($a) { $merge([ { "type": "Action.OpenUrl", "title": $a.title, "url": $a.url }, ($a.style ? { "style": $a.style } : {}) ]) })];
  {
    "type": "message",
    "attachments": [ {
      "contentType": "application/vnd.microsoft.card.adaptive",
      "contentUrl": null,
      "content": {
        "type": "AdaptiveCard",
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "version": "1.4",
        "fallbackText": $s.fallbackText ? $s.fallbackText : $clip($s.headline, 140),
        "body": $body,
        "actions": $actions
      }
    } ],
    "fuuz": $s.fuuz
  }
) }`;

/** A complete JSONata expression: evaluates `specExpr` (a JSONata expression over the flow's input) and renders it. */
const teamsCardJsonata = (specExpr) => `( $teamsCard := ${TEAMS_CARD_FN}; $teamsCard(${specExpr}) )`;

module.exports = { LOGO, TEAMS_CARD_FN, teamsCardJsonata };
