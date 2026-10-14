'use strict';
/*
 * teams-shared/nodeSchema.cjs: the `data` keys each flow node type may carry. The platform validates node data with
 * additionalProperties: false, so one extra key rejects the whole flow at deploy time (for example `transform: ""` on a tryCatch:
 * "nodes/2/data must NOT have additional properties"). Lint every flow you build with nodeDataProblems() before you deploy it.
 *
 * tryCatch is verified against the platform's own rejection; the other sets are the keys of flows running in production.
 * A type not listed here is reported in strict mode, so a new node type gets its keys added on purpose.
 */
const NEXT = ['nextNodes'];
const NODE_DATA_KEYS = {
  request: [...NEXT],
  schedule: [...NEXT],
  response: ['responseTransform', ...NEXT],
  transform: ['transform', ...NEXT],
  javascriptTransform: ['transform', ...NEXT],
  setContext: ['transform', ...NEXT],
  mergeContext: ['transform', ...NEXT],
  when: ['transform', ...NEXT],
  query: ['api', 'query', 'variablesTransform', ...NEXT],
  mutate: ['api', 'mutation', 'variablesTransform', ...NEXT],
  ifElse: ['transform', 'onTrueNextNodes', 'onFalseNextNodes'],
  tryCatch: ['tryNextNodes', 'catchNextNodes'],
  throwError: ['messageTransform', 'errorInfoTransform'],
  log: ['messageTransform', 'level', 'includeContext', 'includePayload', ...NEXT],
  mutexLock: ['resourceIdTransform', 'lockTTLms', 'lockRetries', 'throwErrorWhenLockNotAcquired', ...NEXT],
  mutexUnlock: [...NEXT],
  mutexUnlockUnused: [...NEXT],
  http: ['connectionName', 'httpMethod', 'httpPathTransform', 'httpDataTransform', 'returnErrors', ...NEXT],
  executeFlow: ['flowId', 'payloadTransform', ...NEXT],
  broadcast: [...NEXT],
  combine: ['executionTimeout', 'payloadCombinationStrategy', 'contextCombinationStrategy', ...NEXT],
  systemEmail: ['emailToTransform', 'emailSubjectTransform', 'emailHtmlTransform', 'useSystemLayout', 'emailAttachments', ...NEXT],
};

/** problems of a node list: unknown data keys (what the platform rejects), and, when strict, node types without a schema here */
function nodeDataProblems(nodes, { name = 'flow', strict = false } = {}) {
  const problems = [];
  for (const n of nodes) {
    const allowed = NODE_DATA_KEYS[n.type];
    if (!allowed) {
      if (strict) problems.push(`${name}: ${n.id} node type ${n.type} has no data schema in teams-shared/nodeSchema.cjs`);
      continue;
    }
    for (const k of Object.keys(n.data || {})) if (!allowed.includes(k)) problems.push(`${name}: ${n.id} (${n.type}) data must NOT have additional property "${k}"`);
  }
  return problems;
}

module.exports = { NODE_DATA_KEYS, nodeDataProblems };
