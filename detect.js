// Scans n8n workflow exports for retiring LLM model ids. Plain script, no dependencies:
// runs in a browser <script> and inside an n8n Code node. Load models.js first.
(function () {
  const S = (globalThis.n8nModelScan = globalThis.n8nModelScan || {});
  const LC = '@n8n/n8n-nodes-langchain.';
  const ID_RE = /\b(ft:[\w.:-]+|gpt-[\w.-]+|chatgpt-[\w.-]+|o[134](?:-[\w-]+)?|claude-[\w.-]+|gemini-[\w.-]+|whisper-1|tts-1(?:-hd)?|dall-e-[23]|text-embedding-[\w-]+)/g;
  const PROVIDER_URL = /api\.openai\.com|openrouter\.ai|api\.anthropic\.com|generativelanguage\.googleapis\.com|openai\.azure\.com|\/openai\/deployments\//;
  const AZURE_DEPLOYMENT = /\/deployments\/([^/?#]+)/;

  // Known LLM node types → parameter paths where the model id lives (spec 1.4).
  const LLM = {
    [LC + 'lmChatOpenAi']: ['model'],
    [LC + 'openAi']: ['modelId', 'model', 'options.modelId'],
    'n8n-nodes-base.openAi': ['model', 'chatModel'],
    [LC + 'lmOpenAi']: ['model'],
    [LC + 'lmChatAzureOpenAi']: ['model'],
    [LC + 'lmChatOpenRouter']: ['model'],
    [LC + 'embeddingsOpenAi']: ['model'],
    [LC + 'lmChatAnthropic']: ['model'],
    [LC + 'lmChatGoogleGemini']: ['modelName'],
    [LC + 'openAiAssistant']: ['model'],
    [LC + 'lmChatVercelAiGateway']: ['model'],
  };
  const HTTP = ['n8n-nodes-base.httpRequest', 'n8n-nodes-base.httpRequestTool', LC + 'toolHttpRequest'];
  // v3+ fields first, then the v1/v2 names (bodyParametersJson etc.) still common in older templates.
  const HTTP_FIELDS = ['jsonBody', 'body', 'bodyParameters.parameters[].value', 'jsonQuery', 'queryParameters.parameters[].value', 'bodyParametersJson', 'queryParametersJson', 'bodyParametersUi.parameter[].value'];
  const TEXT = {
    'n8n-nodes-base.code': ['jsCode', 'pythonCode'],
    [LC + 'code']: ['code.execute.code', 'code.supplyData.code'],
    [LC + 'toolCode']: ['code.execute.code', 'code.supplyData.code'],
    'n8n-nodes-base.set': ['assignments.assignments[].value', 'fields.values[].stringValue', 'fields.values[].value', 'values.string[].value', 'jsonOutput'],
  };

  // Walks a dotted path; "[]" iterates an array. Returns [{loc, value}].
  function get(obj, path) {
    let out = [{ loc: 'parameters', value: obj }];
    for (const seg of path.split('.')) {
      const next = [];
      const key = seg.replace(/\[\]$/, '');
      const many = key !== seg;
      for (const { loc, value } of out) {
        if (value == null || typeof value !== 'object') continue;
        const v = value[key];
        if (v === undefined) continue;
        if (many) {
          if (Array.isArray(v)) v.forEach((x, i) => next.push({ loc: loc + '.' + key + '[' + i + ']', value: x }));
        } else next.push({ loc: loc + '.' + key, value: v });
      }
      out = next;
    }
    return out;
  }

  const PREFIXES = () => S.MODELS.filter((e) => e.kind === 'prefix').sort((a, b) => b.id.length - a.id.length);
  function lookup(id) {
    let note = '';
    if (id.startsWith('openai/')) {
      id = id.slice(7);
      note = 'gateway; shutdown depends on provider';
    }
    let entry = S.MODELS.find((e) => e.kind !== 'prefix' && e.id === id) || PREFIXES().find((e) => id.startsWith(e.id));
    if (!entry) {
      // Dated snapshot of a listed alias, e.g. o3-mini-2025-01-31 or gpt-3.5-turbo-1106.
      const base = id.replace(/-(\d{4}-\d{2}-\d{2}|\d{4})$/, '');
      if (base !== id) {
        entry = S.MODELS.find((e) => e.kind === 'alias' && e.id === base);
        if (entry) note = [note, 'dated snapshot, date taken from alias; verify'].filter(Boolean).join('; ');
      }
    }
    return entry ? { entry, id, note } : null;
  }
  function extract(text) {
    const seen = new Set();
    const hits = [];
    for (const m of text.match(ID_RE) || []) {
      const id = m.replace(/[.:]+$/, '');
      if (seen.has(id)) continue;
      seen.add(id);
      const r = lookup(id);
      if (r) hits.push(r);
    }
    return hits;
  }
  function stripComments(text, python) {
    return python ? text.replace(/#.*$/gm, '') : text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[\s;{(])\/\/.*$/gm, '$1');
  }

  function days(from, to) {
    const d = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
    return Math.round((d(to) - d(from)) / 864e5);
  }

  function scanOne(wf, opts, out) {
    const today = opts.today || new Date().toISOString().slice(0, 10);
    const usedBy = {};
    const conns = wf.connections && typeof wf.connections === 'object' ? wf.connections : {};
    for (const src in conns) {
      const list = (conns[src] || {}).ai_languageModel;
      for (const links of Array.isArray(list) ? list : []) {
        for (const l of Array.isArray(links) ? links : []) {
          if (!l || !l.node) continue;
          usedBy[src] = (usedBy[src] ? usedBy[src] + ', ' : '') + l.node + (l.index === 1 ? ' (fallback)' : '');
        }
      }
    }

    for (const node of Array.isArray(wf.nodes) ? wf.nodes : []) {
      if (!node || typeof node !== 'object') continue;
      out.scanned.nodes++;
      if (node.type === 'n8n-nodes-base.stickyNote') continue;
      const p = node.parameters || {};
      const seen = new Set();
      const emit = (loc, model, confidence, hit, extra) => {
        const key = loc + '|' + model;
        if (seen.has(key)) return;
        seen.add(key);
        const e = hit && hit.entry;
        const f = {
          instance: opts.instance || '',
          workflowId: wf.id || '', workflow: wf.name || '', active: !!wf.active,
          updatedAt: wf.updatedAt || '', lastRunAt: wf.lastRunAt || '', lastRunStatus: wf.lastRunStatus || '',
          node: node.name, nodeType: node.type, typeVersion: node.typeVersion, nodeDisabled: !!node.disabled,
          usedBy: usedBy[node.name] || '', location: loc, model, confidence,
          provider: e ? e.provider : '', shutdown: e ? e.shutdown : '', daysLeft: null,
          replacement: e ? e.replacement : '', severity: 'unknown',
          sources: e ? [e.source] : [], note: [e && e.note, hit && hit.note].filter(Boolean).join('; '),
        };
        Object.assign(f, extra);
        if (f.shutdown) {
          f.daysLeft = days(today, f.shutdown);
          f.severity = f.daysLeft <= 0 ? 'broken' : f.daysLeft <= 30 ? 'urgent' : 'scheduled';
        }
        if (f.nodeDisabled) f.severity = 'info';
        out.push(f);
      };
      const azure = (hit) => {
        const e = hit.entry;
        return e.azureShutdown
          ? { provider: 'azure-openai', shutdown: e.azureShutdown, sources: [e.azureSource], note: 'Azure deployment; verify which model it runs' }
          : { provider: 'azure-openai', note: 'Azure deployment; Azure retirement date differs from OpenAI, verify' };
      };
      const scanText = (paths, confidence, python) => {
        for (const path of paths) {
          for (const { loc, value } of get(p, path)) {
            if (typeof value !== 'string') continue;
            for (const hit of extract(python === undefined ? value : stripComments(value, python))) emit(loc, hit.id, confidence, hit);
          }
        }
      };

      if (LLM[node.type]) {
        let found = false;
        for (const path of LLM[node.type]) {
          for (let { loc, value } of get(p, path)) {
            if (value && typeof value === 'object' && value.__rl) {
              loc += '.value';
              value = value.value || value.cachedResultName;
            }
            if (typeof value !== 'string' || !value) continue;
            found = true;
            const isAzure = node.type === LC + 'lmChatAzureOpenAi';
            if (value.startsWith('=')) {
              const hits = extract(value);
              if (hits.length) hits.forEach((hit) => emit(loc, hit.id, 'explicit', hit, isAzure ? azure(hit) : {}));
              else emit(loc, value, 'dynamic', null, { note: 'expression; check at runtime' });
            } else {
              const hit = lookup(value);
              if (hit) emit(loc, hit.id, 'explicit', hit, isAzure ? azure(hit) : {});
              else if (isAzure) emit(loc, value, 'dynamic', null, { provider: 'azure-openai', note: 'Azure deployment name; open it in Azure to see which model it runs' });
            }
          }
        }
        if (!found) {
          const def = S.DEFAULTS[node.type + '@' + node.typeVersion] || S.DEFAULTS[node.type];
          const hit = def && lookup(def);
          if (hit) emit('parameters (default)', hit.id, 'inferred', hit, { note: 'default, not in export' + (hit.note ? '; ' + hit.note : '') });
          else if (!def && (node.type === LC + 'lmChatOpenAi' || (node.type === LC + 'openAi' && (p.resource || 'text') === 'text'))) emit('parameters (default)', '(default, not in export)', 'inferred', null, { note: 'default depends on n8n version; open the node to see it' });
        }
        if (node.type === LC + 'openAi' && p.resource === 'audio' && (p.operation === 'transcribe' || p.operation === 'translate')) {
          emit('parameters.operation', 'whisper-1', 'inferred', lookup('whisper-1'), { note: 'hard-coded in node' });
        }
        if (node.type === LC + 'openAi' && p.resource === 'image' && p.operation === 'analyze' && !found) {
          emit('parameters (default)', 'gpt-4o', 'inferred', lookup('gpt-4o'), { note: 'hard-coded fallback in node when no model is set' });
        }
      } else if (HTTP.includes(node.type)) {
        const url = typeof p.url === 'string' ? p.url : '';
        const hasCred = !!(node.credentials && node.credentials.openAiApi);
        if (PROVIDER_URL.test(url) || (url.startsWith('=') && hasCred)) {
          const dep = url.match(AZURE_DEPLOYMENT);
          const hit = dep && lookup(dep[1]);
          if (hit) emit('parameters.url', hit.id, 'explicit', hit, azure(hit));
          const before = out.length;
          scanText(HTTP_FIELDS, 'explicit');
          if (out.length === before && !hit) emit('parameters.url', '(not in this node)', 'dynamic', null, { note: 'calls an LLM API but the model is set upstream or at runtime; check the node that builds the request' });
        }
      } else if (TEXT[node.type]) {
        for (const path of TEXT[node.type]) scanText([path], 'mentioned', path === 'pythonCode');
      }
    }
  }

  function scanWorkflow(input, opts) {
    opts = opts || {};
    const list = Array.isArray(input) ? input : input && Array.isArray(input.data) ? input.data : [input];
    const out = [];
    out.scanned = { workflows: 0, nodes: 0 }; // non-array property on the result: how much was actually looked at
    for (const wf of list) {
      if (!wf || typeof wf !== 'object' || !Array.isArray(wf.nodes)) continue;
      out.scanned.workflows++;
      scanOne(wf, opts, out);
    }
    return out;
  }

  const COLS = ['Workflow', 'Active', 'Last run', 'Node', 'Used by', 'Model', 'Found as', 'Shutdown', 'Days left', 'Replacement', 'Note'];
  function summarize(findings) {
    const counts = {};
    let unknown = 0;
    for (const f of findings) {
      if (f.shutdown) counts[f.shutdown] = (counts[f.shutdown] || 0) + 1;
      else unknown++;
    }
    const sorted = findings.slice().sort((a, b) => (a.shutdown || '9999').localeCompare(b.shutdown || '9999') || a.workflow.localeCompare(b.workflow));
    const lines = Object.keys(counts).sort().map((d) => counts[d] + (counts[d] === 1 ? ' node breaks on ' : ' nodes break on ') + d);
    if (unknown) lines.push(unknown + ' need a manual check (dynamic or unknown model)');
    const cell = (v) => String(v == null ? '' : v).replace(/\|/g, '\\|').replace(/\n/g, ' ');
    const rows = sorted.map((f) => [f.workflow, f.active ? 'yes' : 'no', f.lastRunAt ? f.lastRunAt.slice(0, 10) + (f.lastRunStatus ? ' ' + f.lastRunStatus : '') : '', f.node + (f.nodeDisabled ? ' (disabled)' : ''), f.usedBy, f.model, f.confidence, f.shutdown || '?', f.daysLeft == null ? '' : f.daysLeft, f.replacement, f.note]);
    const table = ['| ' + COLS.join(' | ') + ' |', '|' + COLS.map(() => '---').join('|') + '|'].concat(rows.map((r) => '| ' + r.map(cell).join(' | ') + ' |'));
    return { counts, total: findings.length, markdown: lines.join('\n') + '\n\n' + table.join('\n') };
  }

  S.scanWorkflow = scanWorkflow;
  S.summarize = summarize;
})();
