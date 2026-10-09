# Clearway

**Education web filtering by FrogSystems Group**

Clearway is a Chromium Manifest V3 extension for Google Chrome and Microsoft Edge. It retrieves a centrally maintained domain blocklist, caches the last valid copy locally, and installs browser-enforced Declarative Net Request rules.

## Current implementation

- Chrome and Microsoft Edge share one extension package.
- Blocklist is JSON, served from the repository's raw GitHub URL by default.
- Domains are validated and converted to Declarative Net Request rules.
- Last-known-good blocklist is retained if a refresh fails.
- Top-level navigation to blocked domains is redirected to a local Clearway restriction page.
- Subresource requests to blocked domains are blocked by the browser.
- Popup shows filtering status and the last successful update.
- No browsing history or page content is sent to FrogSystems Group.

## Load locally

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
3. Enable **Developer mode**.
4. Select **Load unpacked** and choose the repository folder containing `manifest.json`.
5. Open the extension popup and use **Update blocklist**.

## Blocklist format

The initial source is `blocklist.json` on the repository's default branch:

```json
{
  "schemaVersion": 1,
  "version": "2026.10.09.1",
  "updatedAt": "2026-10-09T00:00:00Z",
  "domains": [
    "example.invalid"
  ]
}
```

Replace the example domain with domains your organisation is authorised to restrict. Entries must be bare DNS names, not URLs, paths, wildcards or IP addresses. Subdomains are included automatically.

The extension fetches the source over HTTPS. If the repository is public, its blocklist is publicly readable. Do not put confidential school information, student information or internal-only domains in a public blocklist.

## Important limitations

A browser extension is not a complete network firewall. It does not filter other browsers, arbitrary applications, or traffic that bypasses the managed browser. For school-wide enforcement and tamper resistance, deploy the extension through browser enterprise policies and combine it with managed DNS or a network/endpoint control.

The extension's DNR rules are browser-enforced while the extension is installed and enabled, but a user who can disable or remove an unmanaged extension can bypass it. Deploy through organisational policies on school-managed devices.

## Licence

Copyright © 2026 FrogSystems Group. All rights reserved. Unless a separate licence is provided, this repository is not licensed for redistribution or commercial reuse.
