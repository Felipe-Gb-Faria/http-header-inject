async function rebuildRules() {
  const { profiles = {} } = await chrome.storage.local.get('profiles');

  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existingRules.map(r => r.id);

  const addRules = [];
  let ruleId = 1;

  for (const profile of Object.values(profiles)) {
    if (!profile.enabled) continue;

    // Current format: `domains: [{ host, enabled }]` — unchecked entries are skipped.
    // Older formats: `domains` as plain strings, or a single `domain` string.
    const rawDomains = Array.isArray(profile.domains)
      ? profile.domains
      : String(profile.domain ?? '').split(/[\s,]+/);
    const domains = [...new Set(
      rawDomains
        .filter(d => typeof d === 'string' || d?.enabled !== false)
        .map(d => String(typeof d === 'string' ? d : d?.host ?? '').trim().toLowerCase())
        .filter(Boolean)
    )];
    if (domains.length === 0) continue;

    const validHeaders = (profile.headers || []).filter(
      h => h.name && h.name.trim() && h.value !== undefined && h.value !== null
    );
    if (validHeaders.length === 0) continue;

    addRules.push({
      id: ruleId++,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: validHeaders.map(h => ({
          header: h.name.trim(),
          operation: 'set',
          value: String(h.value)
        }))
      },
      condition: {
        requestDomains: domains,
        resourceTypes: [
          'main_frame', 'sub_frame', 'stylesheet', 'script', 'image',
          'font', 'object', 'xmlhttprequest', 'ping', 'media', 'websocket', 'other'
        ]
      }
    });
  }

  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'profiles' in changes) rebuildRules();
});

chrome.runtime.onStartup.addListener(rebuildRules);
chrome.runtime.onInstalled.addListener(rebuildRules);
