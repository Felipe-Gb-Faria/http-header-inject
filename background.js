async function rebuildRules() {
  const { profiles = {} } = await chrome.storage.local.get('profiles');

  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existingRules.map(r => r.id);

  const addRules = [];
  let ruleId = 1;

  for (const profile of Object.values(profiles)) {
    if (!profile.enabled || !profile.domain || !profile.domain.trim()) continue;

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
        requestDomains: [profile.domain.toLowerCase().trim()],
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
