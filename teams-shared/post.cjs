'use strict';
/*
 * teams-shared/post.cjs: the "post one card to a Teams Workflows webhook" flow builder.
 *
 * teamsPostFlow({ connectionName, connectionId?, flowName, lookup })(versionId, number) -> one Integration flow:
 *   lookup 'name' (default): the Connection is found by its name, whatever id the Fuuz UI gave it when an admin created it.
 *   lookup 'id': the Connection is found by connectionId (for Connections created by script with a known id).
 *   request { body } -> read the Connection (id, active, url, credentials) -> webhook = the Connection's FULL URL as pasted in the
 *   Fuuz UI (or a host-only url + credentials.webhookPath) -> HTTP POST body -> { status: 202, error: null }
 *   not configured / inactive / any failure -> { status, error } with every URL and sig= stripped (STRIP); NOTHING is posted when the
 *   Connection is missing, inactive or empty (HOOK raises inside the try).
 *   EVERY node runs with input, output and error logging off: the URL, the card body and the recipient never reach the logs, and the
 *   URL is never returned or written anywhere.
 */
/* the platform's per-node debug switches, all off */
const DEBUG = { breakpointEnabled: false, publishSubscribeClient: false, publishToMFGx: false };
const LOG = { executionMetrics: true, executionStarted: true, executionSucceeded: true, executionFailed: true, enableTraceLogging: false };
/* nodes that carry the webhook path or a card body: no input / output / error payloads in the logs */
const QUIET = { ...LOG, logInput: false, logOutput: false, logErrors: false };
const N = (id, name, type, data, quiet) => ({ id, name, type, data, debug: { ...DEBUG }, logging: { ...(quiet ? QUIET : LOG) } });

const HOOK = `( $n := $.c.edges.node[0];
  $u := $type($n.url) = "string" ? $trim($n.url) : "";
  $p := $n.credentials.webhookPath;
  $host := $exists($match($u, /^https:\\/\\/[^\\/?#\\s]+\\/?$/));
  $full := $not($host) and $exists($match($u, /^https:\\/\\/[^\\/?#\\s]+[\\/?]\\S+$/));
  $legacy := $host and $type($p) = "string" and $substring($p, 0, 1) = "/";
  $not($n.active = true) ? $error("teams webhook connection missing or inactive")
    : $full ? { "hook": { "shape": "full", "path": "" } }
    : $legacy ? { "hook": { "shape": "path", "path": $p } }
    : $error("teams webhook not configured") )`;
const STRIP = `( $m := $type($state.lastError.message) = "string" ? $state.lastError.message : "post failed";
  $code := $match($m, /\\b([45][0-9][0-9])\\b/);
  { "out": { "status": $code ? $number($code[0].groups[0]) : null,
    "error": $substring($replace($replace($replace($m, /sig=[^&\\s"]+/, "sig=[redacted]"), /https?:\\/\\/[^\\s"]+/, "[url]"), /\\/powerautomate\\/[^\\s"]+/, "[path]"), 0, 300) } } )`;
const teamsPostFlow = ({ connectionId, connectionName, flowName, lookup = 'name' }) => (vid, number) => ({
  id: vid, name: flowName, type: 'Integration', version: number,
  nodes: [
    N('n_req', 'Request { body }', 'request', { nextNodes: ['n_stash'] }, true),
    N('n_stash', 'Stash Body', 'mergeContext', { transform: '{ "body": $.body }', nextNodes: ['n_try'] }, true),
    N('n_try', 'Try', 'tryCatch', { tryNextNodes: ['n_cred'], catchNextNodes: ['n_err'] }, true),
    N('n_cred', 'Read The Webhook Connection (secret)', 'query', { api: 'application', query: `query { c: connection(first: 1, where: { ${lookup === 'name' ? 'name' : 'id'}: { _eq: "${lookup === 'name' ? connectionName : connectionId}" } }) { edges { node { id active url credentials } } } }`, variablesTransform: '{}', nextNodes: ['n_hook'] }, true),
    N('n_hook', 'Full URL Or Host + Path (secret; raises when not configured)', 'mergeContext', { transform: HOOK, nextNodes: ['n_http'] }, true),
    N('n_http', `POST (${connectionName})`, 'http', { connectionName, httpMethod: 'post', httpPathTransform: '$state.context.hook.path', httpDataTransform: '$state.context.body', returnErrors: false, nextNodes: ['n_ok'] }, true),
    N('n_ok', 'Accepted', 'mergeContext', { transform: '{ "out": { "status": 202, "error": null } }', nextNodes: ['n_resp'] }, true),
    N('n_err', 'Failed: Status Only, URL Stripped', 'mergeContext', { transform: STRIP, nextNodes: ['n_resp'] }, true),
    N('n_resp', 'Respond { status, error }', 'response', { responseTransform: '$state.context.out' }, true),
  ],
});

/** true when every node logs no input, output or errors. Check it before you deploy the flow. */
const quiet = (flow) => flow.nodes.every((n) => n.logging && n.logging.logInput === false && n.logging.logOutput === false && n.logging.logErrors === false);

module.exports = { teamsPostFlow, HOOK, STRIP, QUIET, LOG, DEBUG, N, quiet };
