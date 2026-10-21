# SDD ledger — plan: docs/superpowers/plans/2026-10-21-scanner-week1.md
Setup: Ruling: branch stage1-scanner off master instead of a git worktree — fresh single-purpose repo, nothing else to isolate from — cost if wrong: none.
Setup: Ruling: author models.js from spec 1.1 directly instead of downloading n8n-sunset's registry — avoids running untrusted code/data, spec table already has every relevant id; credit n8n-sunset in page footer — cost if wrong: obscure old snapshot ids missing from the table.
Pre-flight: Task1 produces MODELS/DEFAULTS on globalThis.n8nModelScan → Task2 consumes same global: consistent. Task2 produces scanWorkflow/summarize → Task3 consumes via <script> order models.js then detect.js: consistent.
Task 1: complete (commits 2db8841..e1af8fe, tests: node --test → ℹ duration_ms 237.1763)
Task 2: Ruling: Azure deployment names that match no table entry are not reported — spec 2.2 rule 1 is ambiguous, unmatched names would flag every Azure node as noise — cost if wrong: an Azure deployment named freely (e.g. 'prod-chat') running gpt-4o is missed.
Task 2: complete (commits e1af8fe..3facdc0, tests: node --test → ℹ duration_ms 265.669)
Task 3: complete (commits 3facdc0..b32cd47, tests: node --test → ℹ duration_ms 382.2964)
Final review: fresh reviewer (Opus, per user instruction) on d8f6dca..b32cd47.
Final: fixed ID regex missed gpt-image-*/gpt-audio/gpt-realtime — fix1 RED→GREEN, suite 30/30
Final: fixed dated snapshots of retiring aliases not matched — fix2 RED→GREEN, suite 30/30
Final: fixed malformed workflow aborts whole scan — fix3 RED→GREEN, suite 30/30
Final: fixed non-workflow input shows "No retiring models found" — fix4 + page test RED→GREEN, suite 30/30
Final: fixed unmatched Azure deployments silently skipped (reverses Task 2 ruling; reviewer was right, the unknown bucket exists for this) and added Azure dates for o-series and gpt-4o-2024-05-13 — fix5 RED→GREEN, suite 30/30
Final: fixed OpenAI node image-analyze gpt-4o fallback missing — fix6 RED→GREEN, suite 30/30
Final: fixed (re-graded Important) footer falsely claimed data seeded from n8n-sunset — page test RED→GREEN, suite 30/30
Final: Ruling: Render-report tab, Stripe and template links — deferred by plan to week 2, not needed for Friday's page — cost if wrong: footer offer has only a mailto until then.
Final: Ruling: Gemini rows, Bedrock/Vertex ids, HTTP v1/v2 body fields, non-languageModel sub-node types, Anthropic defaults for other versions — out of spec scope, reported as not found rather than wrong — cost if wrong: misses on rare node shapes.
Final: Ruling: .claude/launch.json uses npx -y serve — dev tooling only, downloads a package on first run; acceptable on the developer's machine — cost if wrong: none for users.
Final: minor (deferred): comment stripping eats '#' inside Python strings and some JS edge cases
Final: minor (deferred): bare identifiers like `const o1 = 1` in Code nodes count as findings
Final: minor (deferred): ft:gpt-4.1 prefix also claims ft:gpt-4.1-nano fine-tunes; Azure fine-tune date is Oct 2027 not Apr 2027
Final: minor (deferred): headline counts findings not nodes, includes disabled nodes, no "(Azure)" label
Final: minor (deferred): page uses UTC date; 00:00–02:00 CEST on a deadline day shows urgent instead of broken
Final: minor (deferred): opts.today must be a string; summarize throws on findings without workflow
Final: minor (deferred): file-drop path stringifies then re-parses; no .catch on f.text()
Final: minor (deferred): page duplicates summarize's sort/columns; summarize builds full markdown even when unused
Final: minor (deferred): PREFIXES() recomputed per lookup
Final: minor (deferred): drop zone not keyboard-reachable
Final: minor (deferred): openai/ gateway note lost in HTTP and Code paths
