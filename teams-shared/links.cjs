'use strict';
/*
 * teams-shared/links.cjs: the deep-link builder for links that open a Fuuz screen (Teams cards, e-mails, reminders). Package it
 * into your app at BUILD time (embedded as text in a JS node, or as a JSONata lambda in a transform). Per-tenant values (host,
 * tenant) come from that tenant's own runtime metadata, never from a hard-coded value.
 *
 * RULE: every link MUST carry the tenant, LAST:
 *   https://<host>/<app>/<route>?<params>&tenant=<tenantName>      (?tenant=<tenantName> alone when there are no other params)
 *   e.g. https://example.fuuz.app/quality/nonconformance?id=NC-2291&tenant=example
 * A link without its tenant can open the wrong tenant for a user who belongs to several, so it is never sent.
 * Host and tenant come from the tenant / screen metadata; a setting may OVERRIDE the host only.
 *
 *   appBase(meta, override) -> { host, tenant, source } | null
 *     meta      in a flow $state.metadata (tenantId); the host is read from the first of APP_HOST_KEYS that is set (TO VERIFY which
 *               key your platform version provides; set an override when none is); in a screen, the screen metadata.
 *     override  a settings value (e.g. an appUrl setting): used ONLY when set, and wins over the metadata host.
 *     null when no https host is known.
 *   appLink(base, route, params) -> "https://host/<app>/<route>?k=v...&tenant=<id>" | ""
 *     route     "/andon/andonBoard" (app + route, starting with /; anything else gives "")
 *     params    { andon: "AR-00009", ack: "1" } (values URL-encoded, order kept; empty values dropped; a "tenant" param is ignored)
 *     ""        when the host OR the tenant is unknown: a link without its tenant is never sent.
 *
 * Forms:
 *   APP_LINK_FNS + APP_LINK_CONSTS    ES5 source for javascriptTransform nodes (fn.toString())
 *   APP_LINK_JSONATA                  the same rules as a JSONata block defining $appBase($meta, $override) and $appLink($base, $route, $params),
 *                                     for JSONata transforms and cards. appLinkJsonata(expr) wraps an expression that uses them.
 * The JS and JSONata forms are proven equal on the same cases (test/teamsShared.test.cjs).
 */

var APP_HOST_KEYS = ['appUrl', 'appHost', 'origin', 'host', 'url', 'baseUrl'];

function appBase(meta, override) {
  var m = meta || {};
  var tenant = typeof m.tenantId === 'string' && m.tenantId !== '' ? m.tenantId : typeof m.tenant === 'string' && m.tenant !== '' ? m.tenant : '';
  var host = '';
  var source = '';
  var o = typeof override === 'string' ? override.replace(/^\s+|\s+$/g, '').replace(/\/+$/, '') : '';
  if (o !== '') { host = o; source = 'setting'; }
  else {
    for (var i = 0; i < APP_HOST_KEYS.length; i++) {
      var v = m[APP_HOST_KEYS[i]];
      if (typeof v === 'string' && v !== '') { host = v.replace(/\/+$/, ''); source = 'metadata.' + APP_HOST_KEYS[i]; break; }
    }
  }
  /* the host only: an https origin (a path or query in the value is dropped; the tenant is added by appLink) */
  var mm = /^(https:\/\/[A-Za-z0-9.\-]+(:\d+)?)(\/.*)?$/.exec(host);
  if (!mm) return null;
  return { host: mm[1], tenant: tenant, source: source };
}

function appLink(base, route, params) {
  if (!base || !base.host || !base.tenant) return '';
  /* a route must be a platform path starting with /; anything else = no link (never a link to the wrong place) */
  if (typeof route !== 'string' || !/^\/[A-Za-z0-9_\-\/]*$/.test(route)) return '';
  var q = [];
  var p = params || {};
  for (var k in p) {
    if (!Object.prototype.hasOwnProperty.call(p, k) || k === 'tenant') continue;
    var v = p[k];
    if (v === null || v === undefined || String(v) === '') continue;
    q.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
  }
  q.push('tenant=' + encodeURIComponent(base.tenant));
  return base.host + route + '?' + q.join('&');
}

/* Helpers for builders that already assemble their URLs (e-mails, cards): add the tenant LAST to a
 * finished URL, or to every link to the app host inside a finished text / HTML body.
 *   withTenant(url, tenant, html) -> url + "?tenant=" | "&tenant=" (before any #fragment; "&amp;" when html); "" when url or tenant is missing
 *                                    (no link without its tenant); unchanged when the url already carries a tenant param.
 *   tenantLinks(text, host, tenant, html) -> text with withTenant applied to every URL that starts with host (exactly, then / ? # or end);
 *                                    other URLs (support KB, maps, unsubscribe pages) untouched; trailing . , ; : ) kept outside the URL.
 *                                    Unchanged text when host or tenant is missing (a finished body is not cut up; the caller has no tenant). */
function withTenant(url, tenant, html) {
  if (typeof url !== 'string' || url === '' || typeof tenant !== 'string' || tenant === '') return '';
  var i = url.indexOf('#');
  var frag = i >= 0 ? url.slice(i) : '';
  var u = i >= 0 ? url.slice(0, i) : url;
  if (/[?&](amp;)?tenant=/.test(u)) return url;
  return u + (u.indexOf('?') >= 0 ? (html ? '&amp;' : '&') : '?') + 'tenant=' + encodeURIComponent(tenant) + frag;
}

function tenantLinks(text, host, tenant, html) {
  if (typeof text !== 'string' || typeof host !== 'string' || host === '' || typeof tenant !== 'string' || tenant === '') return text;
  var h = host.replace(/\/+$/, '');
  return text.replace(/https?:\/\/[^\s"'<>]+/g, function (m) {
    var tail = /[.,;:)]+$/.exec(m);
    var t = tail ? tail[0] : '';
    var core = m.slice(0, m.length - t.length);
    var next = core.charAt(h.length);
    if (core.slice(0, h.length) !== h || (next !== '' && next !== '/' && next !== '?' && next !== '#')) return m;
    return withTenant(core, tenant, html) + t;
  });
}

var APP_LINK_FNS = [appBase, appLink, withTenant, tenantLinks];
var APP_LINK_CONSTS = 'var APP_HOST_KEYS = ' + JSON.stringify(APP_HOST_KEYS) + ';';

/* JSONata twin. $encodeUrlComponent = encodeURIComponent. */
var APP_LINK_JSONATA = `$appBase := function($meta, $override) { (
    $m := $type($meta) = "object" ? $meta : {};
    $tenant := $type($m.tenantId) = "string" and $m.tenantId != "" ? $m.tenantId : $type($m.tenant) = "string" and $m.tenant != "" ? $m.tenant : "";
    $o := $type($override) = "string" ? $replace($trim($override), /\\/+$/, "") : "";
    $hostKeys := ${JSON.stringify(APP_HOST_KEYS)};
    $first := $filter($hostKeys, function($k) { $type($lookup($m, $k)) = "string" and $lookup($m, $k) != "" })[0];
    $host := $o != "" ? $o : $first ? $replace($lookup($m, $first), /\\/+$/, "") : "";
    $source := $o != "" ? "setting" : $first ? "metadata." & $first : "";
    $mm := $match($host, /^(https:\\/\\/[A-Za-z0-9.\\-]+(:\\d+)?)(\\/.*)?$/);
    $exists($mm) and $host != "" ? { "host": $mm[0].groups[0], "tenant": $tenant, "source": $source } : null
  ) };
  $appLink := function($base, $route, $params) { (
    $ok := $type($base) = "object" and $type($base.host) = "string" and $base.host != "" and $type($base.tenant) = "string" and $base.tenant != ""
      and $type($route) = "string" and $exists($match($route, /^\\/[A-Za-z0-9_\\-\\/]*$/));
    $p := $type($params) = "object" ? $params : {};
    $q := $append(
      [$filter($keys($p), function($k) { $k != "tenant" and $exists($lookup($p, $k)) and $lookup($p, $k) != null and $string($lookup($p, $k)) != "" }).(
        $encodeUrlComponent($) & "=" & $encodeUrlComponent($string($lookup($p, $)))
      )],
      ["tenant=" & ($ok ? $encodeUrlComponent($base.tenant) : "")]
    );
    $ok ? $base.host & $route & "?" & $join($q, "&") : ""
  ) };`;

/* JSONata twins of withTenant / tenantLinks (JSONata cannot build a regex at run time: every http(s) URL is matched, the host is compared) */
var TENANT_LINK_JSONATA = `$withTenant := function($url, $tenant, $html) { (
    $ok := $type($url) = "string" and $url != "" and $type($tenant) = "string" and $tenant != "";
    $hasFrag := $ok and $contains($url, "#");
    $frag := $hasFrag ? "#" & $substringAfter($url, "#") : "";
    $u := $hasFrag ? $substringBefore($url, "#") : $url;
    $not($ok) ? ""
      : $exists($match($u, /[?&](amp;)?tenant=/)) ? $url
      : $u & ($contains($u, "?") ? ($html = true ? "&amp;" : "&") : "?") & "tenant=" & $encodeUrlComponent($tenant) & $frag
  ) };
  $tenantLinks := function($text, $host, $tenant, $html) { (
    $h := $type($host) = "string" ? $replace($host, /\\/+$/, "") : "";
    ($type($text) = "string" and $h != "" and $type($tenant) = "string" and $tenant != "")
      ? $replace($text, /https?:\\/\\/[^\\s"'<>]+/, function($m) { (
          $tl := $match($m.match, /[.,;:\\)]+$/);
          $t := $exists($tl) ? $tl[0].match : "";
          $core := $substring($m.match, 0, $length($m.match) - $length($t));
          $next := $substring($core, $length($h), 1);
          ($substring($core, 0, $length($h)) = $h and ($next = "" or $next in ["/", "?", "#"])) ? $withTenant($core, $tenant, $html) & $t : $m.match
        ) })
      : $text
  ) };`;

/** wrap a JSONata expression that uses $appBase / $appLink: appLinkJsonata('$appLink($appBase($state.metadata, null), "/x", { "a": 1 })') */
var appLinkJsonata = function (expr) { return '( ' + APP_LINK_JSONATA + '\n  ' + expr + ' )'; };

/** wrap a JSONata expression that uses $withTenant / $tenantLinks (and $appBase / $appLink) */
var tenantLinkJsonata = function (expr) { return '( ' + APP_LINK_JSONATA + '\n  ' + TENANT_LINK_JSONATA + '\n  ' + expr + ' )'; };

module.exports = { APP_HOST_KEYS, appBase, appLink, withTenant, tenantLinks, APP_LINK_FNS, APP_LINK_CONSTS, APP_LINK_JSONATA, TENANT_LINK_JSONATA, appLinkJsonata, tenantLinkJsonata };
