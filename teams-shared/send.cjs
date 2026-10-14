'use strict';
/*
 * teams-shared/send.cjs: the "render one card and post it" step. Package it into your app at BUILD time; each app keeps its own
 * config (its post flow id, its Connection, its host and tenant). The contract and the Power Automate workflow shape are the same
 * everywhere:
 *
 *   body = { "type": "message",
 *            "attachments": [ { "contentType": "application/vnd.microsoft.card.adaptive", "contentUrl": null, "content": <AdaptiveCard 1.4> } ],
 *            "fuuz": { "target": "dm" | "channel" | "ensure", "recipient", "teamName", "teamDescription", "channelName", "autoCreate" } }
 *   rendered by cards.cjs (TEAMS_CARD_FN), posted by the post flow built with post.cjs (teamsPostFlow) -> { status, error }.
 *
 * teamsSendJsonata(postFlowId, specExpr) -> a JSONata expression whose value is the post flow's answer { status, error } (202 = accepted).
 *   The caller decides what a non-202 means (raise into a per-recipient catch, or record the failure on a queue row).
 * The `fuuz` routing inside the spec is the caller's job and must be built server-side from its own rows (never taken from a request).
 */
const { teamsCardJsonata } = require('./cards.cjs');

const teamsSendJsonata = (postFlowId, specExpr) => {
  if (!/^[A-Za-z][A-Za-z0-9_]{1,80}$/.test(postFlowId)) throw new Error('teamsSendJsonata: bad post flow id ' + postFlowId);
  return `( $card := ${teamsCardJsonata(specExpr)};
  $executeFlow("${postFlowId}", { "body": $card }) )`;
};

module.exports = { teamsSendJsonata };
