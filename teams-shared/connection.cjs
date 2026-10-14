'use strict';
/*
 * teams-shared/connection.cjs: the Teams webhook Connection row. One Connection per workflow: HTTP connector, URL EMPTY (an admin
 * pastes the full workflow URL into the Connection in the Fuuz UI, so the secret never passes through code or a repository),
 * request / response payload logging OFF, Content-Type JSON. If the API refuses an empty URL, the placeholder
 * https://not-set.invalid is used and the post flow treats it as "not configured" (nothing is posted).
 * Never print a URL: show() reports "set (<n> chars)".
 */
/* The platform's built-in "HTTP" connector. TO VERIFY in your tenant: query connector { id name } and confirm the id. */
const HTTP_CONNECTOR_ID = '05e0b880-7b0d-4ca1-9b8f-30126ffd305a';
const PLACEHOLDER = 'https://not-set.invalid';

const isEmpty = (u) => u == null || String(u).trim() === '' || String(u).trim() === PLACEHOLDER;
const show = (u) => (isEmpty(u) ? (u === PLACEHOLDER ? 'placeholder (not set)' : 'empty') : `set (${String(u).length} chars)`);

/** the create payload of one Connection (your id / name) */
const teamsConnectionRow = ({ id, name }, placeholder = false) => ({
  id, name, connectorId: HTTP_CONNECTOR_ID, active: true, url: placeholder ? PLACEHOLDER : '',
  options: { Headers: { 'Content-Type': 'application/json' } }, credentials: {}, requestPayloadLogging: false, responsePayloadLogging: false,
});

/** a live Connection has the shape this file creates (the URL may since have been pasted) */
const teamsConnectionOk = (h) => !!h && h.connectorId === HTTP_CONNECTOR_ID && h.requestPayloadLogging === false && h.responsePayloadLogging === false;

const FIELDS = 'id name active url connectorId requestPayloadLogging responsePayloadLogging';
const READ = 'query($i:[String!]){ connection(first:5, where:{ id:{_in:$i} }){ edges{ node{ ' + FIELDS + ' } } } }';
/* by NAME: a Connection created in the Fuuz UI gets a generated id; an app that references it by name must find it by name (never create a twin) */
const READ_BY_NAME = 'query($n:[String!]){ connection(first:5, where:{ name:{_in:$n} }){ edges{ node{ ' + FIELDS + ' } } } }';
const CREATE = 'mutation($p:[ConnectionCreatePayloadInput!]!){ createConnection(payload:$p){ id } }';
const DELETE = 'mutation($p:[ConnectionDeletePayloadInput!]!){ deleteConnection(payload:$p){ id } }';

module.exports = { HTTP_CONNECTOR_ID, PLACEHOLDER, isEmpty, show, teamsConnectionRow, teamsConnectionOk, READ, READ_BY_NAME, CREATE, DELETE };
