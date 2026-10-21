# n8n retiring-model scanner + paid migration check: Stage 1 design and plan

Date: 2026-10-21. Status: design and implementation plan, no product code yet.
Deadline the plan is built around: OpenAI API shutdown of GPT-4o / GPT-4o mini / GPT-4.1 / GPT-4.1 mini on **2027-01-14** (85 days). A smaller batch shuts down on **2026-10-23** (2 days).

---

## 0. What changed after verification (read this first)

1. **A free open-source scanner already exists, but it is blind to the January wave.** `larik15/n8n-sunset` (MIT, npm 0.2.0, created 2026-10-01, 0 stars, 488 downloads in its launch month) scans exports and live instances for model shutdowns. Its data file is dated 2026-10-06, so it has **no entry for the 2026-10-14 notice**: `gpt-4o`, `gpt-4o-mini`, `gpt-4.1`, `gpt-4.1-mini` and their snapshots are not flagged, and `gpt-4o` is even listed as a recommended replacement. It is Node-only (cannot run in a browser or an n8n Cloud Code node), has no graph context, no execution data, no report. Its author sells fixes "from $150" (forum post 2026-10-08, 56 views, 1 reply). We do not rebuild from zero: we port its MIT data file as a seed with attribution, extend it, and write a small browser-safe detector. We differentiate on delivery (n8n template + paste-in page) and on the paid product (proof the swap is safe, not the fix). See 1.5 and 2.1.
2. **pinData cannot stub nodes in a replay.** n8n applies pinned data only in `manual` and `evaluation` runs. The CLI (`n8n execute`) runs in `cli` mode and ignores it; production runs ignore it too. The migration check stubs by **rewriting the workflow JSON** instead (replace side-effect nodes with Code nodes of the same name that emit the recorded items). See section 3.
3. **There is a second, nearer deadline.** `gpt-4o-2024-05-13`, `gpt-4.1-nano`, `o1`, `o3-mini`, `o4-mini`, `gpt-3.5-turbo`, `gpt-4`, `gpt-image-1` leave the API on **2026-10-23**. Workflows using them start failing on Friday. That is the launch moment: ship the paste-in page by Oct 23.
4. **Payments: Stripe, not Lemon Squeezy or Paddle** (both prohibit services). **Hetzner's AVV is not automatic**; accept it once in the account. The template library has **no rule against linking to a paid service**.
5. **n8n Cloud trial accounts have no API access**, Cloud Starter keeps executions 7 days (2,500 max). The migration check must record executions the day the agency says yes, and some workflows have "save successful executions" off.

---

## 1. Verified facts (with sources)

Method: researched 2026-10-21 by five Opus subagents via official docs, the n8n `master` source (commit `e228ee96`), the OpenAI deprecations page and the n8n-sunset repository. Nothing was tested against a live n8n instance. Items marked **[unverified]** must be checked before being hard-coded.

### 1.1 OpenAI deprecation notice

Source: https://developers.openai.com/api/docs/deprecations (no blog post exists; the API changelog has no entry for Oct 14).

| Model IDs | Announced | Shutdown | OpenAI's replacement |
|---|---|---|---|
| gpt-4o-2024-08-06, gpt-4o-2024-11-20, gpt-4o-mini-2024-07-18, gpt-4.1-2025-04-14, gpt-4.1-mini-2025-04-14, plus fine-tunes of them | 2026-10-14 | **2027-01-14** | gpt-6-luna |
| gpt-4o-2024-05-13, gpt-4.1-nano, gpt-3.5-turbo(-0125), gpt-4(-0613), gpt-4-turbo, gpt-4-1106-preview, o1, o1-pro, o3-mini, o4-mini, gpt-image-1 | 2026-04-22 | **2026-10-23** | gpt-5.6-sol / -terra / -luna, gpt-image-2.5-* |
| gpt-image-1-mini, gpt-image-1.5, chatgpt-image-latest | 2026-06-02 | 2026-12-01 | gpt-image-2.5-* |
| gpt-5(-2025-08-07), gpt-5-mini, gpt-5-nano, gpt-5-pro, o3, o3-pro | 2026-06-11 | 2026-12-11 | gpt-5.6-* |
| tts-1, tts-1-hd, gpt-4o-mini-tts-* | 2026-10-01 | 2027-01-06 | gpt-realtime-2.1-mini |
| gpt-4o-audio / gpt-4o-realtime families, gpt-audio, gpt-realtime | 2026-07-20 | 2027-01-20 | gpt-audio-1.5 / gpt-realtime-2.1 |
| whisper-1, gpt-4o(-mini)-transcribe* | 2026-08-26 | 2027-02-26 | gpt-transcribe / gpt-live-transcribe |
| gpt-5.1, gpt-5.3-codex, gpt-5.4-nano | 2026-10-01 | 2027-04-01 | gpt-6-sol / gpt-6-luna |

- Policy wording: "At least 6 months" for generally available models. 92 days is below policy; no reason is given.
- **Bare aliases (`gpt-4o`, `gpt-4o-mini`, `gpt-4.1`, `gpt-4.1-mini`) are not listed** on the page. **[unverified]** which snapshot each alias resolves to after 2027-01-14. The scanner treats aliases as retiring on 2027-01-14 and says "alias; verify target snapshot".
- `text-embedding-ada-002`: no OpenAI deprecation listed (Azure: 2028-02-09).
- **Azure OpenAI** has its own schedule (https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/model-retirement-schedule): gpt-4o, 4o-mini, 4.1, 4.1-mini retire **2027-04-14** (fine-tunes Oct 2027); gpt-4o-2024-05-13 on 2026-12-09; o1, o3, o3-mini, o4-mini on 2026-11-19.
- Successor behaviour (https://developers.openai.com/api/docs/guides/latest-model, https://developers.openai.com/api/docs/models/gpt-6-luna): gpt-6-luna reasons by default (effort none to max, model page says default medium); with reasoning on, `temperature`, `top_p`, `logprobs` must be removed; **tool calling on Chat Completions works only with `reasoning_effort: "none"`**; `prompt_cache_retention` renamed to `prompt_cache_options.ttl`; no fine-tuning; 1.05M context, 128k output. Pricing per 1M tokens: luna $0.10 in / $0.50 out vs gpt-4o $2.50 / $10, gpt-4.1 $2 / $8. These are exactly the things a blind model swap gets wrong, which is the paid product's pitch.
- ChatGPT is unaffected (those models left ChatGPT on 2026-02-13).
- Other vendors in the window: Anthropic `claude-sonnet-4-5-20250929` retires 2026-11-30, replacement claude-sonnet-5-5 (https://platform.claude.com/docs/en/about-claude/model-deprecations). Gemini 2.0 flash family "earliest shutdown" 2026-06-01 (https://ai.google.dev/gemini-api/docs/deprecations). Scanner v1 includes the Anthropic date; Gemini as info only.

### 1.2 n8n public REST API

Sources: https://docs.n8n.io/api/, https://docs.n8n.io/api/authentication/, https://docs.n8n.io/api/pagination/, https://docs.n8n.io/hosting/configuration/environment-variables/executions/, https://docs.n8n.io/deploy/use-n8n-cloud/configure-cloud/manage-your-data, spec files under `packages/cli/src/public-api/v1/handlers/*/spec/paths/*.generated.yml`.

- Base `/api/v1`, header `X-N8N-API-KEY`. Available on Cloud Starter, Pro, Enterprise and on all self-hosted editions. **Not available on the Cloud free trial.** Disabled by `N8N_PUBLIC_API_DISABLED=true`. Scopes exist only on Enterprise; otherwise a key has full access.
- `GET /workflows?limit=250&cursor=...&active=true&excludePinnedData=true` returns full `nodes[]` (`parameters`, `type`, `typeVersion`, `disabled`, credential names only), `connections`, `settings`, `active`/`activeVersionId`, `updatedAt`, `tags`, `pinData` unless excluded. Max page 250, paginate via `nextCursor`. Secrets are never returned.
- `GET /executions?workflowId=X&status=success&limit=N&includeData=true` returns `startedAt`, `stoppedAt`, `status`, `mode`, `workflowVersionId`, and with `includeData` the run `data` plus `workflowData` ("the workflow as it was saved when the execution ran"). Per-node outputs are expected at `data.resultData.runData[nodeName][].data.main[outputIndex][]` as `{json, binary?, pairedItem}` **[unverified against a live response; the public spec types `data` loosely]**. `dataTooLargeToDisplay: true` means `data` is empty; `ignoreDataSizeLimit=true` overrides.
- Retention, self-hosted defaults: prune on, `EXECUTIONS_DATA_MAX_AGE` 336 h (14 days), max 10,000, save-on-success `all`; per-workflow `settings.saveDataSuccessExecution` may be `none`. Cloud: Starter 7 days / 2,500; Pro 30 days / 25,000; Enterprise unlimited / 50,000.
- **No "run workflow" endpoint in the public API** (every spec file checked). Alternatives: webhook trigger; CLI `n8n execute --id <id> --rawOutput`, which prints the full `IRun` JSON including `runData`; the internal editor route `POST /rest/workflows/:id/run` (cookie auth, manual mode). `--file` was removed from the CLI: import first with `n8n import:workflow --input=...`. `n8n import:credentials` and `n8n export:credentials --all --decrypted` exist. CLI execute requires the start node to be a Manual Trigger, Execute Workflow Trigger or Manual Chat Trigger, otherwise "Missing node to start execution".
- `POST /audit` (security audit) exists; `POST /workflows/{id}/activate` exists (deprecated on master in favour of `/publish`); `POST /executions/{id}/retry` re-runs a past execution in place.

### 1.3 pinData

Sources: https://docs.n8n.io/data/data-pinning/; `packages/cli/src/workflow-runner.ts` (`resolvePinData` returns pins only when `executionMode` is `manual` or `evaluation`); `packages/cli/src/commands/execute.ts` (mode `cli`).

- Stored top-level in the workflow JSON as `pinData: { "<node name>": [ {json: ...}, ... ] }`.
- Ignored in production, webhook, trigger **and `cli`** runs. Honoured in manual runs from the editor and in evaluation runs (where the runner injects the dataset row as the trigger's pin and drops the workflow's other pins **[reading of source, untested]**).
- Cannot pin: nodes with more than one main output, binary output, AI sub-nodes, Loop Over Items, Sticky Note. Frontend size limit 12 MB (frontend check only).
- `master` accepts `pinData` on `POST/PUT /workflows` **[older 1.x unverified]**.
- Consequence: pinData is useless for CLI replay. Rewriting nodes is the robust path and also covers node types that cannot be pinned.

### 1.4 Where model names live in workflow JSON

Source: n8n `master` at `e228ee96` (2026-10-21), paths relative to `packages/@n8n/nodes-langchain/nodes/` unless stated. All paths under `node.parameters`. `RL` = resource locator `{"__rl":true,"mode":"list"|"id","value":"gpt-4o","cachedResultName":"gpt-4o"}`; any value may be an expression string starting with `=`.

| Node type | typeVersion | Path | Shape | Default if absent |
|---|---|---|---|---|
| `@n8n/n8n-nodes-langchain.lmChatOpenAi` | 1, 1.1 / 1.2, 1.3 | `model` | string / RL | `gpt-5-mini` on current source; older releases differ **[unverified per release]** |
| `@n8n/n8n-nodes-langchain.openAi` (OpenAI app node), text (v1 `message`, v2 `response`), image analyze, assistant | 1–1.8, 2–2.3 | `modelId` (assistant update: `options.modelId`) | RL | none; image analyze falls back to `gpt-4o` in code |
| same node, image generate / edit / audio generate | per version | `model` or `modelId` | string / RL | `dall-e-3`, `gpt-image-1-mini`, `gpt-image-1`, `tts-1` |
| same node, audio transcribe / translate | all | hard-coded | – | `whisper-1` (retires 2027-02-26) |
| `n8n-nodes-base.openAi` (legacy, hidden) | 1 / 1.1 | `model` / `chatModel` | string | `gpt-3.5-turbo` |
| `@n8n/n8n-nodes-langchain.lmOpenAi` | 1 | `model` | RL | `gpt-3.5-turbo-instruct` |
| `@n8n/n8n-nodes-langchain.lmChatAzureOpenAi` | 1 / 1.1 | `model` (deployment name) | string / RL | '' |
| `@n8n/n8n-nodes-langchain.lmChatOpenRouter` | 1 | `model` (`provider/model`) | string | `openai/gpt-4.1-mini` |
| `@n8n/n8n-nodes-langchain.embeddingsOpenAi` | 1 / 1.1+ | `model` | string | `text-embedding-ada-002` / `text-embedding-3-small` |
| `@n8n/n8n-nodes-langchain.lmChatAnthropic` | 1–1.6 | `model` | string / RL | per version; 1.3 = `claude-sonnet-4-5-20250929` |
| `@n8n/n8n-nodes-langchain.lmChatGoogleGemini` | 1–1.2 | `modelName` | string with `models/` prefix | `models/gemini-2.5-flash` |
| `@n8n/n8n-nodes-langchain.openAiAssistant` (legacy) | 1, 1.1 | `model` | string | `gpt-3.5-turbo-1106` |
| `@n8n/n8n-nodes-langchain.lmChatVercelAiGateway` | – | `model` | string | `openai/gpt-4o` |
| `n8n-nodes-base.httpRequest`, `httpRequestTool`, `@n8n/n8n-nodes-langchain.toolHttpRequest` | 3–4.5 | `url`; `jsonBody` (string, often `={...}`); `bodyParameters.parameters[].{name,value}`; `body` (raw); `jsonQuery`; `queryParameters` | strings | – |
| `n8n-nodes-base.code` | 1, 2 | `jsCode` / `pythonCode` | string | – |
| `@n8n/n8n-nodes-langchain.code`, `toolCode` | 1 | `code.execute.code`, `code.supplyData.code` | string | – |
| `n8n-nodes-base.set` (Edit Fields) | 3.3+ / 3–3.2 / 1–2 / raw | `assignments.assignments[].value` / `fields.values[]` / `values.string[].value` / `jsonOutput` | string | – |

Facts that shape the rules:
- **Defaults are not saved in the export** (`getNodeParameters` with `returnDefaults=false`, `packages/workflow/src/node-helpers.ts` L916–927). A model left at its default is simply missing from the JSON, so the scanner must infer from type + typeVersion and flag the result as "inferred". n8n-sunset documents the same behaviour.
- The AI Agent node (`@n8n/n8n-nodes-langchain.agent`, versions 1–3.1) has **no model parameter**. The model comes from a sub-node connected via `connections["<sub-node name>"].ai_languageModel[*][*].node`; `index: 1` is the agent's fallback model. The scanner reports the parent agent or chain for every sub-node.
- From `lmChatOpenAi` v1.1 the base URL lives in the credential, which the export does not contain, so OpenRouter-via-OpenAI-credential cannot be detected. Reported as a known limit.
- Disabled flag is `disabled: true`. Skip `pinData` when scanning (API responses inside it contain `"model": "gpt-4o-..."` and cause false positives).
- Top-level export shape: `id, name, active, isArchived, nodes[], connections, settings, staticData, pinData, versionId, activeVersionId, meta, tags`.

### 1.5 Existing open-source tools (do we duplicate?)

| Project | What it is | Model detection? |
|---|---|---|
| `blucca/n8n-check` (MIT, npm `@blucca/n8n-check`, active Oct 2026) | Regression checks: export + JSON case file with fixtures, HTTP mocks, assertions, run in a pinned n8n Docker container (2.41.7); JUnit output; GitHub Action | No |
| `jamesshannon/n8n-workflow-testing` | A fork of n8n containing only design docs (1,183-line PRD) for an HTTP-boundary test harness; no code; explicitly rejects replaying stored executions | No |
| **`larik15/n8n-sunset`** (MIT, npm 0.2.0, created 2026-10-01, last commit 2026-10-10) | CLI and ESM library; scans exports or live instance (`--from-api`, pages `GET /workflows?limit=250&excludePinnedData=true`) for OpenAI/Anthropic/Gemini shutdowns, deprecated endpoints, n8n 3.0 removals; `data/sunset-registry.json` (132 OpenAI models, 22 Anthropic, 66 Gemini, 11 model defaults, dated 2026-10-06); exit 1 within 30 days; staleness check | **Yes, partially** |
| OnePathToFreedom/n8n-publish-check, vhmns14/n8n-lint, msmurad21/n8n-audit, avalux-io/n8n-template-import-auditor | Secrets/PII, deprecated node types, reliability lint | No |

n8n-sunset in detail (source read at commit `6e340f5`):
- Finding schema is good and worth copying: `category, ruleId, severity, message, replacement, verification, sources[], model, locations[], workflow, workflowId, workflowActive, node, nodeType, nodeDisabled, date, daysUntil, status, withinWindow`.
- Matching: exact IDs, listed aliases, dated snapshots for families with `matchDatedSnapshots`, `openai/` prefix warnings, quoted literals in Code nodes (comments stripped), HTTP Request with literal `api.openai.com` URL or expression URL plus OpenAI credential.
- **Gaps**: the 2026-10-14 notice is absent, so `gpt-4o*` and `gpt-4.1*` are not flagged and `gpt-4o` appears as a recommended replacement; the 2026-10-23 batch is complete. No default inference for `lmChatOpenAi` or OpenAI embeddings (only Anthropic, audio, image). Azure skipped entirely. No `connections` resolution. No execution data. Terminal table or JSON only. Not browser-safe: the package root re-exports `cli.ts` (`node:fs` etc.) and `exports` only exposes `"."`, so a bundler cannot reach the clean modules (`scan.ts`, `rules/*`, `walk.ts`, `dates.ts`). Cannot load in an n8n Cloud Code node.
- Author `larik15`: account created 2026-08-30, 0 followers; README and forum post offer "fixed-price migrations, from $150" (https://community.n8n.io/t/319697).

**Decision: port the data file as a seed (MIT notice kept, attribution in README and sticky note), extend it, write our own ~300-line browser-safe detector.** Copying `scan.ts` and `rules/*` into our repo is the fallback if the edge cases take longer than a day.

### 1.6 Channels and compliance

- **Template library**: register at https://creators.n8n.io/register, submit from the dashboard; guidelines https://n8n.notion.site/Template-submission-guidelines-9959894476734da3b402c90b124b1f77 and sticky-note rules https://n8n.notion.site/Sticky-note-guidelines-for-templates-2aa5b6e0c94f8058b0aefddd02655887. New creators: one template in review at a time; three approvals make you verified. Mandatory yellow overview sticky note (100–300 words, "How it works" + "Setup"); no hard-coded keys, no personal IDs, descriptive node names, about 200-word Markdown description, title "Verb + thing + where", no emoji. No rule against linking a paid service or against templates calling the n8n API (verified by absence). Review time unpublished; forum reports range from hours to days.
- **Forum**: guidelines contain only "no spam, no cross-posting". Tool posts live in *Built with n8n* (https://community.n8n.io/c/built-with-n8n/15), for-hire posts in *Jobs*. Threads to reply in: Workflow Unit Testing (https://community.n8n.io/t/workflow-unit-testing-with-test-cases/254023, 6 posts), Test Harness proposal (https://community.n8n.io/t/core-fr-proposal-workflow-test-harness-format/306721, 8 posts), Test before production (https://community.n8n.io/t/how-do-you-test-a-workflow-edit-before-it-touches-production/313427, 8 posts), monitoring thread (https://community.n8n.io/t/how-do-you-monitor-n8n-workflows-in-production-and-detect-failures-early/300723, 25 posts), the fresh gpt-image-1 thread (https://community.n8n.io/t/openai-gpt-image-1-shuts-down-23-oct-fix-for-the-n8n-openai-edit-image-node/322768). **No GPT-4o/4.1 thread exists yet.** We open it.
- **experts.n8n.io**: 49 partners on partnerpage.io, filters by country, services, budget; about 9 with DACH signals (SVA, FastRocket, ennoia, Exxeta, cimt, relyon, AiAdvisors, Hyperstack Studio, Telekom Geschäftskunden); **no emails or websites on profiles**, contact only via lead form. Company names are visible, so websites are found by hand. Too small alone; extend via LinkedIn ("n8n Agentur", "n8n automation agency"), forum *Jobs* posters, Upwork n8n profiles.
- **r/n8n**: rules **not verified** (Reddit blocked for the agent). A reported April 2026 rule change bans self-promotion and requires a "Workflow" flair with the code included. Read the sidebar by hand; post as a workflow with the JSON attached, not as a product.
- **GDPR**: for execution data Felix is a processor (sub-processor of the agency, which needs its client's authorisation under Art. 28(2) and (4)); an AVV under Art. 28(3) is required and may be electronic. Templates: Bitkom AVV v1.2 (https://www.bitkom.org/sites/main/files/2023-01/20230113Bitkom-Mustervertragsanlage-AVV.pdf), EU Commission Art. 28 clauses (https://eur-lex.europa.eu/eli/dec_impl/2021/915/oj), DSK Kurzpapier 13. The free scan needs no AVV: inside the agency's instance (template) or in the browser (page) no data reaches us.
- **Tax** (not advice): Kleinunternehmer §19 UStG limits €25,000 previous year / €100,000 current year since 2025 (https://www.gesetze-im-internet.de/ustg_1980/__19.html). B2B services to other EU countries are reverse charge (§3a(2) UStG); have a Steuerberater confirm invoice wording for a Kleinunternehmer. Fees from Stripe Ireland trigger §13b reverse charge on the buying side.
- **Payments**: Stripe payment link, 1.5% + €0.25 on EEA cards, no monthly fee (https://stripe.com/de/pricing). Lemon Squeezy (https://docs.lemonsqueezy.com/help/getting-started/prohibited-products) and Paddle (https://paddle.com/support/aup) prohibit services.
- **Hetzner**: CX23 (2 vCPU, 4 GB) €5.49/month ex VAT and IPv4 since June 2026. AVV at https://accounts.hetzner.com/account/dpa must be accepted manually. Not needed for Stage 1 (see 4.1).

---

## 2. Scanner design (free, lead magnet)

### 2.1 Positioning against n8n-sunset

Same category, three real differences: (1) our data covers the January wave, which n8n-sunset currently misses entirely; (2) no terminal needed: an n8n workflow the agency imports and runs inside its own instance, and a page where anyone pastes an export; (3) a per-client printable report with "is this workflow even running" data. We credit n8n-sunset in the README and sticky note. The paid product does not compete with "fixes from $150": it sells the **evidence that the fix is safe**, which an agency forwards to its client. Option to keep open: offer larik15 a two-way referral (he fixes, we verify), and send him a pull request with the Oct 14 data as goodwill.

### 2.2 One detection module, two shells

Build one dependency-free JavaScript file, `detect.js` (plain ES2020, no imports, about 300 lines plus data), that runs unchanged inside an n8n Code node and in a browser. Everything else is a thin shell around it.

```
detect.js
  MODELS                 data table: { id, aliases[], provider, shutdown, replacement, sources[], note, azureShutdown? }
  DEFAULTS               { "<type>@<typeVersion>": model } for nodes whose default is not saved
  scanWorkflow(wf, opts) -> Finding[]
  summarize(findings)    -> { byDeadline, counts, markdown }
```

**Inputs**
- Template shell: instance URL + n8n API key (one n8n credential per instance; a Set node holds a list of instances so an agency scans its fleet in one run). Pulls `GET /workflows` with pagination and `excludePinnedData=true`.
- Page shell: paste or drop one or more workflow exports (single workflow, the array from "export all", or an API page). Nothing leaves the browser. The page also accepts the template's findings JSON and renders it as a printable report (2.5).

**Detection rules** (per node; skip `pinData` and sticky notes; record `disabled`)
1. **Known LLM nodes** (table 1.4): read the parameter at the path; unwrap RL `value`; if the value is an expression, extract any model-id literal, else mark `dynamic`. If the parameter is absent, look up `DEFAULTS["type@typeVersion"]` and mark `inferred`.
2. **HTTP Request / HTTP Request Tool / toolHttpRequest**: if `url` matches `api.openai.com|openrouter.ai|api.anthropic.com|generativelanguage.googleapis.com|openai.azure.com|/openai/deployments/`, or the URL is an expression and the node has an OpenAI credential, regex `jsonBody`, `body`, `bodyParameters.parameters[].value`, `jsonQuery`, `queryParameters` for model ids. Azure: report the deployment name from `/deployments/<name>/` with "verify which model this deployment runs; Azure date 2027-04-14 for the gpt-4o/4.1 family".
3. **Code / LangChain Code / Tool Code / Edit Fields**: regex source and values for quoted model-id literals (comments stripped). Confidence `mentioned`.
4. **Model-id matching**: exact ids and dated snapshots from `MODELS`; bare aliases (`gpt-4o`, `gpt-4o-mini`, `gpt-4.1`, `gpt-4.1-mini`, `o1`, `o3-mini`, `o4-mini`, `gpt-3.5-turbo`, `gpt-4`, `gpt-4-turbo`, `whisper-1`, `tts-1`, `gpt-image-1`, `claude-sonnet-4-5*`) get the snapshot's date and the note "alias; verify target snapshot"; `ft:gpt-4o-...` fine-tunes via prefix; `openai/<id>` (OpenRouter, Vercel gateway) via prefix strip with the note "gateway; shutdown depends on provider".
5. **Graph context**: for sub-nodes, follow `connections[nodeName].ai_languageModel` to the parent agent or chain; report `usedBy`, and `fallback` when index is 1.
6. **Severity**: `shutdown <= today` → `broken`; within 30 days → `urgent`; otherwise `scheduled`. Disabled nodes → `info`. Dynamic expressions without a literal → `unknown` (listed so the agency checks by hand).

**Enrichment (template shell only; one or two API calls per flagged workflow)**: `active`, `updatedAt`, `GET /executions?workflowId=X&limit=1` → `lastRunAt`, `lastRunStatus`; optionally `startedAfter` = 7 days ago, `limit=250`, to count recent runs. This is what n8n-sunset lacks and what an agency account manager asks first: "is this one even running?"

### 2.3 Output format

Finding (JSON, one object per node hit; schema borrowed from n8n-sunset with our additions):

```json
{
  "instance": "https://client.app.n8n.cloud",
  "workflowId": "abc", "workflow": "Lead enrichment", "active": true,
  "updatedAt": "2026-09-30T10:00:00Z", "lastRunAt": "2026-10-20T07:12:00Z", "lastRunStatus": "success",
  "node": "OpenAI Chat Model", "nodeType": "@n8n/n8n-nodes-langchain.lmChatOpenAi", "typeVersion": 1.2,
  "nodeDisabled": false, "usedBy": "AI Agent", "location": "parameters.model.value",
  "model": "gpt-4o", "confidence": "explicit",
  "provider": "openai", "shutdown": "2027-01-14", "daysLeft": 85,
  "replacement": "gpt-6-luna", "severity": "scheduled",
  "sources": ["https://developers.openai.com/api/docs/deprecations"],
  "note": "alias; OpenAI lists only dated snapshots. Successor reasons by default: remove temperature; tool calls on Chat Completions need reasoning_effort none."
}
```

Table (sorted by shutdown date, then workflow): Workflow · Active · Last run · Node · Used by · Model · Found as (explicit / inferred / dynamic / mentioned) · Shutdown · Days left · Replacement · Note. Above it: counts per deadline ("3 nodes break on Oct 23, 11 on Jan 14, 2 on Apr 14 (Azure)") and the data-table date. In the template the last node outputs the findings as items plus one summary item with the Markdown; users wire it to email, Slack or Sheets themselves. The page shows the table, "Download JSON" and "Print / Save as PDF" (print CSS; one text field for the agency's name or logo URL).

### 2.4 Which to build first and why

**Page first (Oct 21–23), template second (Oct 24–28).**
- The Oct 23 shutdown is in two days. The page needs no review queue, no API access (so it works for Cloud-trial users and for people who will not hand over a key), and no hosting beyond a static file.
- The template is the lasting distribution channel (library SEO, "import and run") but review time is unknown and new creators get one template in review at a time. It also needs the enrichment logic and sticky notes. Submit it in week 2; link the page from its sticky note and the template from the page.
- Both share `detect.js`, so the second shell is plumbing.

### 2.5 The page in one paragraph

A single static `index.html` plus `detect.js`, hosted on GitHub Pages first (static, nothing is uploaded, so EU hosting is not an issue; move to the Hetzner box when one exists). Textarea and file drop → table → JSON download → print. A second tab "Render report" accepts the template's findings JSON so template users get the same printable report. Footer: Impressum, link to the template, link to n8n-sunset, one line "Need proof the swap is safe before Jan 14? Migration check, €149 per instance" with Stripe link and mailto. No backend, no analytics beyond a privacy-friendly counter if any.

### 2.6 Out of scope for the scanner

API-key mode on the hosted page (CORS and trust; the template covers key mode). Credential-level base URLs. Community nodes. Gemini dates (info only). Auto-fixing workflows (larik15's business and a liability for us). Fleet dashboards.

---

## 3. Paid migration check (sketch, €149 per client instance)

Promise: "We swap the model, replay your real recent executions against the new model with every side effect stubbed, and give you a pass/fail report you can forward to your client." Manual-with-scripts in Stage 1: Felix runs it; the scripts exist so the third check takes an hour, not a day.

### 3.1 Inputs from the agency
- API key for the client instance (or, for agencies that cannot share one, a self-host path: they run `node export-bundle.js` from our repo, producing one zip of flagged workflows plus recent executions; deferred until an agency asks).
- Target model and settings (default from our table: gpt-6-luna; `reasoning_effort: none` for tool-calling workflows on Chat Completions).
- An OpenAI key for the replay (theirs, so cost and data residency stay with them).
- Signed AVV (Bitkom template, prefilled). Stripe payment before delivery.

### 3.2 Record
For each flagged workflow: `GET /executions?workflowId&status=success&includeData=true&limit=10`; keep the last N (default 5) whose `runData` covers every node from the trigger through the LLM node and its consumers. Save as `recordings/<wf>/<execId>.json` together with `workflowData` from the same response, so the replay uses the version that actually ran. Workflows with saving off or no runs in the retention window get the verdict `not replayable` (still useful: the workflow is idle or unobservable).

### 3.3 Replay by rewriting (not pinData)
Build one **replay variant** per recorded execution:
1. Replace the trigger node with a Manual Trigger feeding a **Code node that carries the original trigger's name** and returns the recorded trigger items. Expressions like `$('Webhook').item.json.x` keep working because the name is unchanged.
2. Replace every **side-effect node** (anything not on an allowlist of pure nodes: Set, Code, IF, Switch, Merge, Filter, Split Out, Aggregate, Sort, Limit, Remove Duplicates, Date & Time, Crypto, Markdown, HTML, XML, Rename Keys, Compare Datasets, No Op) with a Code node of the same name returning that execution's recorded output items. Covers HTTP Request, databases, CRMs, email, Execute Workflow, Respond to Webhook (becomes a sink). Wait nodes are removed.
3. Keep the **LLM nodes live** (agent, chains, OpenAI app node and their model sub-nodes). Swap the model parameter to the target; apply successor-specific parameter changes (drop `temperature` when reasoning is on, set `reasoning_effort` where the node version supports it).
4. Agent **tools** with side effects (HTTP tool, Gmail tool, ...) are not stubbed in v1; such workflows get `partial` and an explanation. (Deferred: a Code Tool that replays recorded tool results by argument hash.)
5. Import the variants into a **disposable n8n Docker container** (image pinned to the client's version, fresh SQLite, `N8N_ENCRYPTION_KEY` set, one imported OpenAI credential), run `n8n execute --id <variant> --rawOutput`, store the `IRun` JSON. First customers: Docker Desktop on Felix's machine; data stays in Germany and is deleted after delivery. Hetzner only when checks outgrow an evening.
6. Run each variant **three times**: old model (baseline A), old model again (baseline B, measures the workflow's own nondeterminism), new model (candidate). Before 2027-01-14 the old model still answers, which is exactly why the check must be sold now.

### 3.4 Diff
- **Deterministic nodes downstream of an LLM node**: structural diff of output items (A vs candidate), ignoring keys matching `/(^|_)(id|uuid|timestamp|createdAt|updatedAt|date|time)$/i`, ISO-date-shaped values, and a per-workflow ignore list. Mismatch = FAIL candidate.
- **LLM node outputs**: hard checks first (valid JSON if a downstream node parses it, same top-level keys, same tool-call sequence and argument keys, length within 0.5x–2x, same language), then **Claude as judge** (Sonnet-class) with the node's prompt and the A, B and candidate outputs: "Is the candidate acceptable where B is acceptable relative to A? Score 1–5, cite the difference." B calibrates the judge: differences no larger than A-vs-B are noise.
- **Cost and latency**: token usage from the node output, old vs new, per execution.
- Verdict per workflow: PASS / PASS WITH NOTES (judge 4, or cost change over 2x) / FAIL (hard check or judge ≤ 2) / PARTIAL (unstubbed tools) / NOT REPLAYABLE.

### 3.5 PDF
HTML template → PDF via headless Chromium (Playwright); agency name or logo field for white-label.
1. Cover: client instance hostname, n8n version, date, old → new model, who ran it.
2. Summary table: workflow · active · executions replayed · verdict.
3. Per workflow: nodes touched, parameter changes applied, side-by-side excerpt of the worst diff, judge note, cost delta.
4. Required manual changes (for example "remove temperature in node X", "tool-calling workflow Y needs reasoning_effort none").
5. Method and limits (what was stubbed, what was not, retention window), data handling (deleted after 7 days, AVV reference).

### 3.6 Deferred (explicitly not in Stage 1)
Tool stubbing; binary data; sub-workflow recursion beyond stubbing; Wait and loop workflows; Evaluations integration; the self-host export CLI (until asked); automated intake portal; subscription (Stage 2 gate: 5 paid checks by 2026-12-15); Azure-specific replays; Anthropic and Gemini swaps (same pipeline, later).

---

## 4. Implementation plan

### 4.1 Stack (what Felix already knows, nothing new)
- `detect.js`: plain JavaScript, no build step, no dependencies. Tests: `test.js` with `node:test` over 8 fixture exports (RL value, inferred default, expression, HTTP body, Code node, disabled node, Azure URL, sub-node → agent mapping).
- Page: one `index.html` on GitHub Pages (later Hetzner nginx). No framework.
- Template: n8n workflow JSON (Manual Trigger → Set instances → Loop → HTTP Request paginated → Code with `detect.js` inlined → HTTP executions → Code summarize).
- Migration check: Node 22, five scripts in one repo (`record.js`, `rewrite.js`, `run.js` with Docker Compose, `diff.js`, `judge.js` + `report.js`), Claude API for the judge, Playwright for PDF. Docker Desktop locally.
- Money and legal: Stripe payment link, Bitkom AVV, Impressum page, one Steuerberater question on reverse-charge wording.

### 4.2 Ordered tasks with estimates (one person; d = focused day)

| # | Task | Est. | Target date |
|---|---|---|---|
| 1 | Model data table: seed from n8n-sunset's `sunset-registry.json` (MIT notice), add the Oct 14 notice, bare-alias rule, Azure dates, Anthropic sonnet-4-5, `lmChatOpenAi` and embeddings defaults; every entry has a source URL | 0.5 d | Oct 21 |
| 2 | `detect.js` walker + rules 1–6 + 8 fixtures + tests | 1.5 d | Oct 22 |
| 3 | Static page: paste/drop → table → JSON → print; Impressum; links | 1 d | Oct 23 |
| 4 | **Launch 1**: open the GPT-4o/4.1 thread and a Built with n8n post ("these models stop today; paste your export to see what else breaks on Jan 14"), replies in the 5 threads (1.6), LinkedIn DE/EN post, r/n8n only after reading the rules | 0.5 d | Oct 23–24 |
| 5 | Template workflow: pagination, inlined `detect.js`, enrichment calls, multi-instance Set node, sticky notes per guidelines, screenshots; submit at creators.n8n.io | 1.5 d | Oct 27–28 |
| 6 | "Render report" tab on the page for the template's findings JSON; cross-links | 0.5 d | Oct 28 |
| 7 | Sales kit: Stripe link (€149), AVV from Bitkom template, 3-line cold email DE/EN, one-paragraph offer on the page | 1 d | Oct 29–30 |
| 8 | Prospect list of 60: experts.n8n.io (49 partners, find websites by hand), LinkedIn search, forum Jobs posters, Upwork; track in a sheet | 1 d | Oct 30–31 |
| 9 | Cold email, 20 agencies per week: "free scan of one client instance, run our template or send an export; we reply with the table" | ongoing | Nov 3, 10, 17 |
| 10 | Migration check: `record.js` (API pull, selection of replayable executions); verify the real `runData` shape here | 1 d | Nov 4 |
| 11 | `rewrite.js` (trigger and side-effect substitution, model swap, parameter fixes) + fixtures | 1.5 d | Nov 5–6 |
| 12 | `run.js`: Docker Compose with pinned n8n, import credential and variants, `execute --rawOutput`, collect runs; A/B/candidate loop | 1.5 d | Nov 10–11 |
| 13 | `diff.js` (structural diff with ignore rules) + `judge.js` (Claude) + verdict logic | 2 d | Nov 12–13 |
| 14 | `report.js`: HTML → PDF, logo field, method and limits text | 1 d | Nov 17 |
| 15 | Dogfood on own instance with 5 synthetic workflows (agent with tools, chain, HTTP to OpenAI, Code with model string, sub-workflow); fix what breaks | 1 d | Nov 18 |
| 16 | Deliver paid checks by hand plus scripts; log time per check and every manual step | – | Nov 19 → Dec 12 |
| 17 | Weekly countdown post (Tuesdays): days left plus one concrete, anonymised finding from scans, DE and EN | 1 h/week | Oct 27, Nov 3, 10, 17, 24, Dec 1, 8, 15, Jan 5, 12 |
| 18 | **Gate**: at least 5 paid checks? → design Stage 2 subscription; else keep selling the one-off through Jan 13 | 0.5 d | Dec 15 |
| 19 | Pre-book January slots during change-freeze weeks (most agencies freeze production Dec 18 – Jan 4) | – | Dec 15–19 |
| 20 | Last-call deliveries; Jan 15 "did something break?" post; keep the table current for Jan 20 (audio), Feb 26 (whisper), Apr 1 (gpt-5.1), Apr 14 (Azure) | – | Jan 5–20 |

Build total about 15 focused days spread over 6 weeks, leaving the rest for selling and delivering.

### 4.3 First-week deliverable (by Fri 2026-10-24)
- `detect.js` with tests passing on 8 fixtures; data table with sources.
- Public page live: paste an export, get the table with the Oct 23 and Jan 14 hits, download JSON, print.
- GPT-4o/4.1 thread opened, Built with n8n post, replies in the 5 threads, LinkedIn post.
- Template workflow drafted (submission on Oct 27–28 is week 2).

### 4.4 Risks and how the plan handles them
- **n8n-sunset updates its data and wins the free-tool mindshare**: acceptable; our free tool only needs to generate scan requests from agencies, and its traction so far is one reply. Credit it, send the data upstream, do not fight it.
- **Nobody pays before the Dec 15 gate**: the migration-check build (tasks 10–15, 8 days) starts only after the page, template and first 20 emails are out, so a dead market costs at most two weeks of build.
- **Alias semantics unknown**: the page says "alias; verify" and links the OpenAI page; a call to `GET /v1/models` on Jan 14 settles it.
- **runData shape or CLI behaviour differs from the source reading**: task 10 verifies the shape on day one of the build; task 15 dogfoods before any delivery promise. If `n8n execute` proves awkward, fall back to the internal `POST /rest/workflows/:id/run` in the disposable container, which runs in manual mode and honours pins.
- **Retention**: Cloud Starter keeps 7 days; record the day the agency says yes, before payment clears if needed.
- **Christmas freeze**: sell January slots in advance; the deadline itself supplies urgency.
- **Default-model inference is wrong for some n8n versions**: findings are marked `inferred`; the template can read the instance version from the editor's `/rest/settings` later if needed. Not in v1.

---

## 5. Open questions for Felix
1. Does the existing `n8n-sorter` project hold anything reusable (API client, Docker setup)? Not inspected in this session.
2. Kleinunternehmer status for 2026, yes or no? Changes invoice wording, not the plan.
3. Contact larik15 (n8n-sunset) with the Oct 14 data and a referral offer before launching, or after?

## 6. Housekeeping
A research subagent left a sparse clone of the n8n repository at `C:\n8nscan\n8n` (outside this session's folders) because of Windows path-length limits. It is safe to delete; the removal was blocked by a safety check in this session, so it is left for Felix.
