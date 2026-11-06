let profiles = {};
let activeId = null;
let currentHost = null; // host of the active browser tab, if it's an http(s) page

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function newDomain(host = '', enabled = true) {
  return { id: uid(), host, enabled };
}

// Bring older formats up to `domains: [{ id, host, enabled }]`:
// a single `domain` string, or `domains` as an array of plain strings.
function migrateProfile(p) {
  if (!Array.isArray(p.domains)) {
    p.domains = String(p.domain ?? '').split(/[\s,]+/).filter(Boolean);
  }
  p.domains = p.domains.map(d =>
    typeof d === 'string' ? newDomain(d) : { ...d, id: d.id || uid() }
  );
  delete p.domain;
  return p;
}

function profileLabel(p) {
  if (p.name) return p.name;
  const hosts = (p.domains || []).map(d => d.host.trim()).filter(Boolean);
  if (hosts.length === 0) return 'Untitled';
  return hosts.length > 1 ? `${hosts[0]} +${hosts.length - 1}` : hosts[0];
}

// The <all_urls> host permission lets the popup read the active tab's URL
// without the broader "tabs" permission.
async function loadCurrentHost() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = new URL(tab?.url ?? '');
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      currentHost = url.hostname.toLowerCase();
    }
  } catch {
    currentHost = null;
  }
}

async function loadState() {
  const data = await chrome.storage.local.get(['profiles', 'activeId']);
  profiles = data.profiles || {};
  Object.values(profiles).forEach(migrateProfile);
  activeId = data.activeId || null;
  if (activeId && !profiles[activeId]) activeId = null;
  if (!activeId) {
    const ids = Object.keys(profiles);
    if (ids.length) activeId = ids[0];
  }
}

function save() {
  chrome.storage.local.set({ profiles, activeId });
}

function render() {
  const root = document.getElementById('root');
  const ids = Object.keys(profiles);

  let html = buildProfilesBar(ids);
  html += `<div class="profile-content">`;

  if (ids.length === 0) {
    html += buildEmptyState();
  } else if (activeId && profiles[activeId]) {
    html += buildProfileMeta(profiles[activeId]);
    html += buildDomainsSection(profiles[activeId]);
    html += buildHeadersSection(profiles[activeId]);
  }

  html += `</div>`;
  root.innerHTML = html;
  attachListeners();
}

function buildProfilesBar(ids) {
  let html = `<div class="profiles-bar">`;
  for (const id of ids) {
    const p = profiles[id];
    const label = esc(profileLabel(p));
    const active = id === activeId ? ' active' : '';
    const disabled = !p.enabled ? ' tab-disabled' : '';
    html += `
      <div class="profile-tab${active}${disabled}" data-action="select-profile" data-id="${id}">
        <span class="profile-tab-dot ${p.enabled ? 'dot-on' : 'dot-off'}"></span>
        <span class="profile-tab-label" title="${label}">${label}</span>
        <button class="profile-tab-delete" data-action="delete-profile" data-id="${id}" title="Delete profile">×</button>
      </div>`;
  }
  if (ids.length > 0) {
    html += `<button class="btn-copy-profile" data-action="copy-profile">Copy Profile</button>`;
  }
  html += `<button class="btn-add-profile" data-action="add-profile">+ Profile</button>`;
  html += `</div>`;
  return html;
}

function buildEmptyState() {
  return `
    <div class="empty-state">
      <svg class="empty-icon" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="8" width="32" height="5" rx="2" fill="currentColor"/>
        <rect x="4" y="18" width="32" height="5" rx="2" fill="currentColor"/>
        <rect x="4" y="28" width="18" height="5" rx="2" fill="currentColor"/>
        <circle cx="32" cy="30" r="6" fill="currentColor"/>
        <path d="M32 27v6M29 30h6" stroke="var(--bg)" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
      <div class="empty-title">No profiles yet</div>
      <div class="empty-desc">Create a profile to start injecting custom headers into requests for a specific domain.</div>
      <button class="btn-primary" data-action="add-profile">+ Create Profile</button>
    </div>`;
}

function buildProfileMeta(p) {
  const id = activeId;
  return `
    <div class="profile-meta">
      <div class="field-row">
        <span class="field-label">Name</span>
        <input class="field-input" data-field="name" data-id="${id}" type="text"
          value="${esc(p.name)}" placeholder="My Profile" spellcheck="false">
        <label class="toggle" title="${p.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}">
          <input type="checkbox" data-action="toggle-enabled" data-id="${id}" ${p.enabled ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>`;
}

function buildDomainsSection(p) {
  const id = activeId;
  let html = `<div class="domains-section"><div class="section-heading">Domains</div>`;

  if (!p.domains || p.domains.length === 0) {
    html += `<div class="no-headers">No domains configured.</div>`;
  } else {
    html += `<div class="headers-list">`;
    for (const d of p.domains) {
      html += `
        <div class="header-row${d.enabled ? '' : ' row-off'}">
          <input class="domain-check" type="checkbox" data-action="toggle-domain"
            data-profile-id="${id}" data-domain-id="${d.id}" ${d.enabled ? 'checked' : ''}
            title="${d.enabled ? 'Sending headers — click to stop' : 'Not sending headers — click to send'}">
          <input class="header-input domain" data-field="domain-host"
            data-profile-id="${id}" data-domain-id="${d.id}"
            type="text" value="${esc(d.host)}" placeholder="my.website.test"
            spellcheck="false" autocomplete="off">
          <button class="btn-delete-header" data-action="delete-domain"
            data-profile-id="${id}" data-domain-id="${d.id}" title="Remove">×</button>
        </div>`;
    }
    html += `</div>`;
  }

  html += `<div class="domain-actions">`;
  html += `<button class="btn-add-header" data-action="add-domain" data-id="${id}">+ Add Domain</button>`;
  if (currentHost) {
    const already = (p.domains || []).some(d => d.host.trim().toLowerCase() === currentHost);
    html += already
      ? `<button class="btn-add-header" disabled title="The current site is already in this profile">✓ ${esc(currentHost)}</button>`
      : `<button class="btn-add-header" data-action="add-current-domain" data-id="${id}"
           title="Add the current tab's site to this profile">+ Add ${esc(currentHost)}</button>`;
  }
  html += `</div></div>`;
  return html;
}

function buildHeadersSection(p) {
  const id = activeId;
  let html = `<div class="headers-section"><div class="section-heading">Request Headers</div>`;

  if (!p.headers || p.headers.length === 0) {
    html += `<div class="no-headers">No headers configured.</div>`;
  } else {
    html += `<div class="headers-list">`;
    for (const h of p.headers) {
      html += `
        <div class="header-row">
          <input class="header-input name" data-field="header-name"
            data-profile-id="${id}" data-header-id="${h.id}"
            type="text" value="${esc(h.name)}" placeholder="Header-Name"
            spellcheck="false" autocomplete="off">
          <span class="sep">:</span>
          <input class="header-input value" data-field="header-value"
            data-profile-id="${id}" data-header-id="${h.id}"
            type="text" value="${esc(h.value)}" placeholder="value"
            spellcheck="false" autocomplete="off">
          <button class="btn-delete-header" data-action="delete-header"
            data-profile-id="${id}" data-header-id="${h.id}" title="Remove">×</button>
        </div>`;
    }
    html += `</div>`;
  }

  html += `<button class="btn-add-header" data-action="add-header" data-id="${id}">+ Add Header</button>`;
  html += `</div>`;
  return html;
}

function attachListeners() {
  const root = document.getElementById('root');

  root.querySelectorAll('[data-field]').forEach(input => {
    input.addEventListener('input', handleFieldInput);
    input.addEventListener('blur', save);
  });

  root.querySelectorAll('[data-action="toggle-enabled"]').forEach(cb => {
    cb.addEventListener('change', e => {
      const id = e.target.dataset.id;
      if (profiles[id]) {
        profiles[id].enabled = e.target.checked;
        save();
        render();
      }
    });
  });

  root.querySelectorAll('[data-action="toggle-domain"]').forEach(cb => {
    cb.addEventListener('change', e => {
      const { profileId, domainId } = e.target.dataset;
      const d = profiles[profileId]?.domains.find(x => x.id === domainId);
      if (d) {
        d.enabled = e.target.checked;
        save();
        render();
      }
    });
  });
}

function handleFieldInput(e) {
  const { field, id, profileId, headerId, domainId } = e.target.dataset;
  const pid = id || profileId;
  if (!profiles[pid]) return;

  if (field === 'name') {
    profiles[pid].name = e.target.value;
    refreshTabLabel(pid);
  } else if (field === 'domain-host') {
    const d = profiles[pid].domains.find(x => x.id === domainId);
    if (d) d.host = e.target.value;
    if (!profiles[pid].name) refreshTabLabel(pid);
  } else if (field === 'header-name') {
    const h = profiles[pid].headers.find(x => x.id === headerId);
    if (h) h.name = e.target.value;
  } else if (field === 'header-value') {
    const h = profiles[pid].headers.find(x => x.id === headerId);
    if (h) h.value = e.target.value;
  }
}

function refreshTabLabel(id) {
  const p = profiles[id];
  const el = document.querySelector(`.profile-tab[data-id="${id}"] .profile-tab-label`);
  if (el) {
    el.textContent = profileLabel(p);
    el.title = profileLabel(p);
  }
}

function handleClick(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, id, profileId, headerId, domainId } = el.dataset;

  if (action === 'select-profile') {
    if (activeId === id) return;
    activeId = id;
    save();
    render();
    return;
  }

  if (action === 'delete-profile') {
    e.stopPropagation();
    delete profiles[id];
    if (activeId === id) {
      const ids = Object.keys(profiles);
      activeId = ids.length ? ids[0] : null;
    }
    save();
    render();
    return;
  }

  if (action === 'add-profile') {
    const newId = uid();
    profiles[newId] = { name: '', domains: [], enabled: true, headers: [] };
    activeId = newId;
    save();
    render();
    setTimeout(() => document.querySelector('[data-field="name"]')?.focus(), 0);
    return;
  }

  if (action === 'copy-profile') {
    const sourceId = activeId && profiles[activeId] ? activeId : Object.keys(profiles)[0];
    const source = sourceId ? profiles[sourceId] : null;
    if (!source) return;

    const newId = uid();
    profiles[newId] = {
      name: source.name ? `${source.name} Copy` : '',
      domains: (source.domains || []).map(d => newDomain(d.host, d.enabled !== false)),
      enabled: source.enabled !== false,
      headers: (source.headers || []).map(h => ({
        id: uid(),
        name: h.name || '',
        value: h.value || ''
      }))
    };

    activeId = newId;
    save();
    render();
    return;
  }

  if (action === 'delete-domain') {
    if (profiles[profileId]) {
      profiles[profileId].domains = profiles[profileId].domains.filter(d => d.id !== domainId);
      save();
      render();
    }
    return;
  }

  if (action === 'add-domain') {
    if (profiles[id]) {
      profiles[id].domains = profiles[id].domains || [];
      profiles[id].domains.push(newDomain());
      save();
      render();
      setTimeout(() => {
        const inputs = document.querySelectorAll('.header-input.domain');
        inputs[inputs.length - 1]?.focus();
      }, 0);
    }
    return;
  }

  if (action === 'add-current-domain') {
    const p = profiles[id];
    if (p && currentHost && !p.domains.some(d => d.host.trim().toLowerCase() === currentHost)) {
      p.domains.push(newDomain(currentHost));
      save();
      render();
    }
    return;
  }

  if (action === 'delete-header') {
    if (profiles[profileId]) {
      profiles[profileId].headers = profiles[profileId].headers.filter(h => h.id !== headerId);
      save();
      render();
    }
    return;
  }

  if (action === 'add-header') {
    if (profiles[id]) {
      profiles[id].headers = profiles[id].headers || [];
      profiles[id].headers.push({ id: uid(), name: '', value: '' });
      save();
      render();
      setTimeout(() => {
        const inputs = document.querySelectorAll('.header-input.name');
        inputs[inputs.length - 1]?.focus();
      }, 0);
    }
  }
}

// #root persists across renders (only its innerHTML is replaced), so the
// delegated click handler must be attached exactly once.
document.getElementById('root').addEventListener('click', handleClick);

Promise.all([loadState(), loadCurrentHost()]).then(render);
