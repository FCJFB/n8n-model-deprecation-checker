// Retiring-model data table. Plain script: runs in a browser and in an n8n Code node.
// Sources are the vendors' own deprecation pages, checked 2026-10-21.
(function () {
  var OPENAI = 'https://developers.openai.com/api/docs/deprecations';
  var AZURE = 'https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/model-retirement-schedule';
  var ANTHROPIC = 'https://platform.claude.com/docs/en/about-claude/model-deprecations';
  var ALIAS_NOTE = 'alias; OpenAI lists only dated snapshots, verify target snapshot';

  var MODELS = [];
  function add(kind, ids, shutdown, replacement, extra) {
    ids.forEach(function (id) {
      var e = { id: id, kind: kind, provider: 'openai', shutdown: shutdown, replacement: replacement, note: '', source: OPENAI };
      for (var k in extra) e[k] = extra[k];
      MODELS.push(e);
    });
  }

  // 2027-01-14 wave (announced 2026-10-14), Azure retires the family 2027-04-14.
  var jan = { azureShutdown: '2027-04-14', azureSource: AZURE };
  add('snapshot', ['gpt-4o-2024-08-06', 'gpt-4o-2024-11-20', 'gpt-4o-mini-2024-07-18', 'gpt-4.1-2025-04-14', 'gpt-4.1-mini-2025-04-14'], '2027-01-14', 'gpt-6-luna', jan);
  add('alias', ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini'], '2027-01-14', 'gpt-6-luna', { azureShutdown: '2027-04-14', azureSource: AZURE, note: ALIAS_NOTE });
  add('prefix', ['ft:gpt-4o', 'ft:gpt-4o-mini', 'ft:gpt-4.1', 'ft:gpt-4.1-mini'], '2027-01-14', 'gpt-6-luna', { azureShutdown: '2027-04-14', azureSource: AZURE, note: 'fine-tune; gpt-6-luna has no fine-tuning' });

  // 2026-10-23 wave (announced 2026-04-22).
  add('snapshot', ['gpt-4o-2024-05-13', 'gpt-4.1-nano-2025-04-14', 'gpt-3.5-turbo-0125', 'gpt-4-0613', 'gpt-4-1106-preview', 'o1-pro'], '2026-10-23', 'gpt-5.6-sol / -terra / -luna');
  add('alias', ['gpt-4.1-nano', 'gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo', 'o1', 'o3-mini', 'o4-mini'], '2026-10-23', 'gpt-5.6-sol / -terra / -luna');
  add('alias', ['gpt-image-1'], '2026-10-23', 'gpt-image-2.5');

  add('alias', ['gpt-image-1-mini', 'gpt-image-1.5', 'chatgpt-image-latest'], '2026-12-01', 'gpt-image-2.5');
  add('snapshot', ['gpt-5-2025-08-07'], '2026-12-11', 'gpt-5.6');
  add('alias', ['gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5-pro', 'o3', 'o3-pro'], '2026-12-11', 'gpt-5.6');
  add('alias', ['tts-1', 'tts-1-hd'], '2027-01-06', 'gpt-realtime-2.1-mini');
  add('prefix', ['gpt-4o-mini-tts'], '2027-01-06', 'gpt-realtime-2.1-mini');
  add('prefix', ['gpt-4o-audio', 'gpt-4o-realtime', 'gpt-4o-mini-audio', 'gpt-4o-mini-realtime'], '2027-01-20', 'gpt-audio-1.5 / gpt-realtime-2.1');
  add('alias', ['gpt-audio', 'gpt-realtime'], '2027-01-20', 'gpt-audio-1.5 / gpt-realtime-2.1');
  add('alias', ['whisper-1'], '2027-02-26', 'gpt-transcribe');
  add('prefix', ['gpt-4o-transcribe', 'gpt-4o-mini-transcribe'], '2027-02-26', 'gpt-transcribe');
  add('alias', ['gpt-5.1', 'gpt-5.3-codex', 'gpt-5.4-nano'], '2027-04-01', 'gpt-6-sol / gpt-6-luna');

  // Anthropic.
  var anth = { provider: 'anthropic', source: ANTHROPIC };
  add('snapshot', ['claude-sonnet-4-5-20250929'], '2026-11-30', 'claude-sonnet-5-5', anth);
  add('alias', ['claude-sonnet-4-5'], '2026-11-30', 'claude-sonnet-5-5', { provider: 'anthropic', source: ANTHROPIC, note: 'alias; verify target snapshot' });

  // Defaults n8n does not write into the export (returnDefaults=false). Only versions
  // the spec states as verified; key "<type>@<typeVersion>" wins over "<type>".
  var DEFAULTS = {
    'n8n-nodes-base.openAi': 'gpt-3.5-turbo',
    '@n8n/n8n-nodes-langchain.lmOpenAi': 'gpt-3.5-turbo-instruct',
    '@n8n/n8n-nodes-langchain.openAiAssistant': 'gpt-3.5-turbo-1106',
    '@n8n/n8n-nodes-langchain.lmChatOpenRouter': 'openai/gpt-4.1-mini',
    '@n8n/n8n-nodes-langchain.lmChatVercelAiGateway': 'openai/gpt-4o',
    '@n8n/n8n-nodes-langchain.lmChatAnthropic@1.3': 'claude-sonnet-4-5-20250929',
  };

  globalThis.n8nModelScan = globalThis.n8nModelScan || {};
  globalThis.n8nModelScan.MODELS = MODELS;
  globalThis.n8nModelScan.DEFAULTS = DEFAULTS;
})();
