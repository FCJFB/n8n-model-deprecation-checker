# Scanner week 1: data table, detector, static page

Spec: `docs/superpowers/plans/2026-10-21-n8n-model-scanner-design.md` (sections 1.1, 1.4, 2.2, 2.3, 2.5). Where this plan and the spec disagree, the spec wins.

Global constraints:
- Plain ES2020 JavaScript, no build step, no dependencies. `detect.js` must run unchanged in a browser `<script>` and inside an n8n Code node, so no `import`/`require`/`export` statements at top level; expose via `globalThis.n8nModelScan = { MODELS, DEFAULTS, scanWorkflow, summarize }`.
- Tests: `node --test` over `test/*.test.js`, which load `detect.js` with `vm.runInThisContext` and read the global. Fixtures are inline objects in the test files.
- Every data entry has a `source` URL. Nothing marked `[unverified]` in the spec is hard-coded as fact; it is reported as `inferred` or `unknown`.
- Commit after each task with the Co-Authored-By line from the session.

## Task 1: Model data table

Produces `models.js` defining `globalThis.n8nModelScan.MODELS` (array) and `.DEFAULTS` (object). Consumed by Task 2.

Entry shape: `{ id, kind: 'snapshot'|'alias'|'prefix', provider: 'openai'|'anthropic'|'azure-openai', shutdown: 'YYYY-MM-DD', replacement, note, source, azureShutdown? }`.

Content, from spec 1.1, source `https://developers.openai.com/api/docs/deprecations` unless stated:
- 2027-01-14, replacement `gpt-6-luna`: snapshots `gpt-4o-2024-08-06`, `gpt-4o-2024-11-20`, `gpt-4o-mini-2024-07-18`, `gpt-4.1-2025-04-14`, `gpt-4.1-mini-2025-04-14`; aliases `gpt-4o`, `gpt-4o-mini`, `gpt-4.1`, `gpt-4.1-mini` with note `alias; OpenAI lists only dated snapshots, verify target snapshot`; prefix `ft:gpt-4o`, `ft:gpt-4o-mini`, `ft:gpt-4.1`, `ft:gpt-4.1-mini` (fine-tunes). All carry `azureShutdown: '2027-04-14'`, source `https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/model-retirement-schedule`.
- 2026-10-23: `gpt-4o-2024-05-13`, `gpt-4.1-nano`, `gpt-4.1-nano-2025-04-14`, `gpt-3.5-turbo`, `gpt-3.5-turbo-0125`, `gpt-4`, `gpt-4-0613`, `gpt-4-turbo`, `gpt-4-1106-preview`, `o1`, `o1-pro`, `o3-mini`, `o4-mini` → replacement `gpt-5.6-sol / -terra / -luna`; `gpt-image-1` → `gpt-image-2.5`.
- 2026-12-01: `gpt-image-1-mini`, `gpt-image-1.5`, `chatgpt-image-latest` → `gpt-image-2.5`.
- 2026-12-11: `gpt-5`, `gpt-5-2025-08-07`, `gpt-5-mini`, `gpt-5-nano`, `gpt-5-pro`, `o3`, `o3-pro` → `gpt-5.6`.
- 2027-01-06: `tts-1`, `tts-1-hd`, prefix `gpt-4o-mini-tts` → `gpt-realtime-2.1-mini`.
- 2027-01-20: prefix `gpt-4o-audio`, `gpt-4o-realtime`, `gpt-4o-mini-audio`, `gpt-4o-mini-realtime`; ids `gpt-audio`, `gpt-realtime` → `gpt-audio-1.5 / gpt-realtime-2.1`.
- 2027-02-26: `whisper-1`, prefix `gpt-4o-transcribe`, `gpt-4o-mini-transcribe` → `gpt-transcribe`.
- 2027-04-01: `gpt-5.1`, `gpt-5.3-codex`, `gpt-5.4-nano` → `gpt-6-sol / gpt-6-luna`.
- Anthropic, source `https://platform.claude.com/docs/en/about-claude/model-deprecations`: `claude-sonnet-4-5-20250929` and alias `claude-sonnet-4-5` → 2026-11-30, replacement `claude-sonnet-5-5`.

`DEFAULTS` keys are `"<nodeType>@<typeVersion>"` or `"<nodeType>"` (any version), values are model ids. Only defaults the spec states without `[unverified]`:
- `n8n-nodes-base.openAi` → `gpt-3.5-turbo`
- `@n8n/n8n-nodes-langchain.lmOpenAi` → `gpt-3.5-turbo-instruct`
- `@n8n/n8n-nodes-langchain.openAiAssistant` → `gpt-3.5-turbo-1106`
- `@n8n/n8n-nodes-langchain.lmChatOpenRouter` → `openai/gpt-4.1-mini`
- `@n8n/n8n-nodes-langchain.lmChatVercelAiGateway` → `openai/gpt-4o`
- `@n8n/n8n-nodes-langchain.lmChatAnthropic@1.3` → `claude-sonnet-4-5-20250929`

Steps:
1. Write `test/models.test.js`: asserts MODELS has an entry with id `gpt-4o-2024-08-06` and shutdown `2027-01-14`; alias `gpt-4o` exists with kind `alias`; every entry has non-empty `id`, `shutdown` matching `/^\d{4}-\d{2}-\d{2}$/`, `source` starting with `https://`; no duplicate ids; `DEFAULTS['n8n-nodes-base.openAi'] === 'gpt-3.5-turbo'`.
2. Run `node --test`. Expected: fails, `models.js` missing.
3. Write `models.js`.
4. Run `node --test`. Expected: all pass.
5. Commit `Add retiring-model data table`.

## Task 2: detect.js

Produces `detect.js` defining `scanWorkflow(wf, opts)` and `summarize(findings)` on the same global. Loads after `models.js`. Consumed by Task 3 and the template.

`scanWorkflow(wf, { today = '2026-10-21', instance = '' })` accepts a single workflow export (object with `nodes`, `connections`, optional `name`, `id`, `active`, `updatedAt`), an array of them, or an API page `{ data: [...] }`. Returns `Finding[]` with the schema in spec 2.3: `instance, workflowId, workflow, active, updatedAt, node, nodeType, typeVersion, nodeDisabled, usedBy, location, model, confidence ('explicit'|'inferred'|'dynamic'|'mentioned'), provider, shutdown, daysLeft, replacement, severity ('broken'|'urgent'|'scheduled'|'info'|'unknown'), sources, note`. Skips `pinData` and sticky notes.

Rules (spec 2.2):
1. Known LLM nodes, param paths from spec 1.4. Type → path: `lmChatOpenAi` → `model`; `openAi` (LangChain app node) → `modelId`, `model`, `options.modelId`; `n8n-nodes-base.openAi` → `model`, `chatModel`; `lmOpenAi` → `model`; `lmChatAzureOpenAi` → `model` (report as `azure-openai` deployment name, confidence `explicit`, note `Azure deployment; verify which model it runs`, use `azureShutdown` when the name matches a table entry); `lmChatOpenRouter` → `model`; `embeddingsOpenAi` → `model`; `lmChatAnthropic` → `model`; `lmChatGoogleGemini` → `modelName`; `openAiAssistant` → `model`; `lmChatVercelAiGateway` → `model`. Unwrap resource locator `{__rl:true, value}` (fall back to `cachedResultName`). Value starting with `=` → extract literals with the id regex, confidence `explicit` if one matches the table, else one finding with `confidence: 'dynamic'`, `severity: 'unknown'`, `model: <expression>`. Param absent → `DEFAULTS` lookup (`type@version` then `type`); hit → confidence `inferred`; miss for `lmChatOpenAi` → finding `confidence: 'inferred'`, `severity: 'unknown'`, `model: '(default, not in export)'`, note `default depends on n8n version; open the node to see it`.
   The LangChain `openAi` app node with `resource: 'audio'` and `operation: 'transcribe'|'translate'` → finding `whisper-1`, confidence `inferred`, note `hard-coded in node`.
2. HTTP nodes (`n8n-nodes-base.httpRequest`, `n8n-nodes-base.httpRequestTool`, `@n8n/n8n-nodes-langchain.toolHttpRequest`): url (string or expression) matching `api.openai.com|openrouter.ai|api.anthropic.com|generativelanguage.googleapis.com|openai.azure.com|/openai/deployments/` → regex `jsonBody`, `body`, `bodyParameters.parameters[].value`, `jsonQuery`, `queryParameters.parameters[].value` for ids, confidence `explicit`. Azure URL: capture `/deployments/([^/?]+)/`, report deployment name with the Azure note. Expression URL with no provider literal and an `openAiApi` credential → scan the same fields.
3. `n8n-nodes-base.code` (`jsCode`, `pythonCode`), `@n8n/n8n-nodes-langchain.code` and `toolCode` (`code.execute.code`, `code.supplyData.code`), `n8n-nodes-base.set` (`assignments.assignments[].value`, `fields.values[].stringValue|value`, `values.string[].value`, `jsonOutput`): strip `//` and `#` line comments and `/* */` blocks, regex quoted literals, confidence `mentioned`.
4. Matching: exact `snapshot`/`alias` id; `prefix` entries by `startsWith`; strip `openai/` prefix first and add note `gateway; shutdown depends on provider`. Id regex: `/(ft:[\w.:-]+|gpt-[0-9][\w.-]*|chatgpt-[\w.-]+|o[134](?:-[\w-]+)?|claude-[\w.-]+|gemini-[\w.-]+|whisper-1|tts-1(?:-hd)?|dall-e-[23]|text-embedding-[\w-]+)/g`, candidates trimmed of trailing punctuation.
5. Graph: for every node name, follow `wf.connections[name].ai_languageModel[*][*]` → `usedBy` = target `node`; target `index === 1` → append ` (fallback)`.
6. Severity from `shutdown` vs `today`: `<= today` → `broken`; `<= today + 30d` → `urgent`; else `scheduled`; `nodeDisabled` → `info` regardless. `daysLeft` = whole days, may be negative.

`summarize(findings)` → `{ counts: { [shutdown]: n }, total, markdown }` where markdown is a table sorted by shutdown then workflow with columns Workflow · Active · Node · Used by · Model · Found as · Shutdown · Days left · Replacement · Note, preceded by one line per deadline like `3 nodes break on 2026-10-23`.

Steps:
1. Write `test/detect.test.js` with 8 inline fixtures, one `test()` each: (a) `lmChatOpenAi` v1.2 with RL `gpt-4o` → explicit, alias note, usedBy `AI Agent` via connections; (b) `lmChatAnthropic` v1.3 without `model` → inferred `claude-sonnet-4-5-20250929`, shutdown 2026-11-30; (c) `lmChatOpenAi` with `={{ $json.model }}` → dynamic, severity unknown; (d) `httpRequest` to `https://api.openai.com/v1/chat/completions` with `jsonBody` `={"model":"gpt-4o-2024-08-06"}` → explicit; (e) `code` node with `const m = "gpt-4.1-mini"; // gpt-4o in a comment` → exactly one finding `gpt-4.1-mini`, mentioned; (f) disabled `lmChatOpenAi` with `gpt-4o-mini` → severity `info`; (g) `httpRequest` to `https://x.openai.azure.com/openai/deployments/gpt-4o/chat/completions` → provider `azure-openai`, shutdown `2027-04-14`; (h) sub-node connected at `index: 1` → usedBy ends with `(fallback)`. Plus: `pinData` containing `"model":"gpt-4o"` produces no finding; `today: '2026-10-24'` makes an `o3-mini` finding `broken`; `summarize` on fixture set returns `counts['2027-01-14'] >= 1` and markdown containing `| Workflow |`.
2. Run `node --test`. Expected: detect tests fail, `scanWorkflow` undefined.
3. Write `detect.js`.
4. Run `node --test`. Expected: all pass.
5. Commit `Add workflow scanner detect.js`.

## Task 3: Static page

Produces `index.html` (no framework) loading `models.js` then `detect.js`. Consumed by nobody in code; it is the launch deliverable.

Behaviour: textarea plus file drop zone (multiple `.json`); on input, parse JSON (accept single export, array, or `{data:[...]}`; on parse error show the message inline), call `scanWorkflow` with today's date, render `summarize().markdown` as an HTML table (not raw markdown) with the deadline lines above it, show "Download JSON" (findings) and "Print" buttons. Print CSS hides inputs and buttons. One text field "Report title" printed as the heading. Footer: `Impressum` link to `impressum.html` (placeholder file with "TODO: Impressum" so the link works), link `https://github.com/larik15/n8n-sunset` with text `Data seeded from n8n-sunset (MIT) and extended`, one line `Need proof the swap is safe before Jan 14? Migration check, €149 per instance.` with `mailto:felix@quyre.de`. Nothing leaves the browser; say so above the textarea. Keep CSS under 60 lines, system font, works at 400px width.

Steps:
1. Write `test/page.test.js`: reads `index.html`, asserts it references `models.js` before `detect.js`, contains `id="input"`, `id="results"`, `id="download"`, `mailto:felix@quyre.de`, and a `@media print` block; asserts `impressum.html` exists.
2. Run `node --test`. Expected: page test fails, file missing.
3. Write `index.html` and `impressum.html`.
4. Run `node --test`. Expected: all pass.
5. Open `index.html` in the browser pane, paste fixture (a) from Task 2 as JSON, confirm one row with `gpt-4o` and the 2027-01-14 deadline line renders. Expected: row visible, no console errors.
6. Commit `Add static scanner page`.

## Review Focus

- A workflow export from an older n8n 1.x where `model` is a plain string, not a resource locator.
- A Code node with the model id inside a template literal or Python f-string.
- An HTTP Request node whose body is `={{ JSON.stringify({model: 'gpt-4o'}) }}`.
- Large exports (500 workflows) pasted into the page: no freeze, no quadratic work in `summarize`.
- Dates: `today` at a deadline boundary and negative `daysLeft`.
