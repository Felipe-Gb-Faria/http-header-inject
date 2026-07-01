# HTTP Header Inject

A Chrome extension that injects custom request headers for configured domains.

## What it does

Configure profiles — each tied to a single domain — with any number of header/value pairs. Every outgoing HTTP request to that domain will carry those headers, transparently, before leaving the machine. Useful for passing auth tokens, feature flags, or environment overrides to internal APIs without touching application code.

## Installation

This extension is not published to the Chrome Web Store. Load it manually:

1. Open `chrome://extensions`
2. Enable **Developer mode** (toggle, top-right)
3. Click **Load unpacked** and select this folder

## Usage

Click the extension icon to open the popup.

- **New Profile** — create a profile for a domain (e.g. `api.myapp.internal`)
- **Domain** — exact host to match; subdomains are included (e.g. `myapp.internal` also matches `api.myapp.internal`)
- **Toggle** — enable or disable a profile without deleting it
- **Add Header** — add a `Header-Name: value` pair to inject
- Changes are saved immediately; rules take effect on the next request

## Technical notes

Built with vanilla JS, no dependencies. Uses Manifest V3 and [`declarativeNetRequest`](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest) dynamic rules for header injection — one rule per enabled profile. Profiles are persisted in `chrome.storage.local`.

Required permissions: `declarativeNetRequest`, `storage`, `<all_urls>` (host access needed to modify headers for arbitrary domains).

### Regenerating icons

If you need to rebuild the extension icons:

```sh
node generate-icons.js
```

Requires Node.js, no npm install needed.
