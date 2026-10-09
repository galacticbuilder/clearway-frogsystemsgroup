# Clearway administrator policy guide

Clearway supports browser extension managed storage policies through `storage.managed`. The schema is in `managed_schema.json`; example policy values are in `policy-examples.json`.

## Supported controls

- `filteringEnabled`: enable or disable Clearway filtering (managed policy takes precedence over the popup).
- `blockYouTube`: block YouTube and its subdomains.
- `blockGames`: block the demo game domains in the service worker.
- `blockDomains`: extra domains, including `*.example.org` (domain matching covers the apex and subdomains).
- `allowDomains`: domain exceptions, higher priority than domain and URL blocks.
- `blockedUrlFilters`: Declarative Net Request URL filter expressions, e.g. `||youtube.com/shorts/`.
- `blockedUrlKeywords`: text matched in the URL itself, e.g. `unblocked-games`. This does not scan page body text.
- `enablePageKeywordBlocking` + `pageKeywords`: best-effort page text inspection; when a term is found in title, headings, URL or the initial body text sample, Clearway displays a restriction overlay. It can produce false positives and is not tamper-proof.

## Managed storage policy deployment

Chrome and Edge extension IDs are assigned by the browser store or by the extension's packaging/signing process. A locally loaded unpacked extension may have a different ID on each machine, so do not deploy a registry policy until you know the stable extension ID.

### Chrome (Windows)

For a packaged/published extension, configure managed storage under:

`HKLM\Software\Policies\Google\Chrome\3rdparty\extensions\<EXTENSION_ID>\policy`

The Chrome policy system expects values that match `managed_schema.json`. Use the supported Chrome ADMX/Cloud Management mechanisms for your organisation and verify the result at `chrome://policy`.

### Microsoft Edge (Windows)

Use:

`HKLM\Software\Policies\Microsoft\Edge\3rdparty\extensions\<EXTENSION_ID>\policy`

Verify browser policies at `edge://policy`.

### Group Policy extension deployment

Use the browser's extension management policy to force-install the Clearway extension on managed devices. In Chrome this is normally managed through the Chrome ADMX policy `ExtensionInstallForcelist`; Edge uses its corresponding `ExtensionInstallForcelist` policy or `ExtensionSettings` with `installation_mode: force_installed`. For store-hosted extensions, use the store's published extension ID and official update URL. A local unpacked extension is for development, not production rollout.

For Edge's `ExtensionSettings` JSON, see Microsoft's [official guide](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-manage-extensions-ref-guide). For Chrome's managed storage schema, see [Chrome extension storage documentation](https://developer.chrome.com/docs/extensions/reference/api/storage#property-managed).

## Important deployment notes

- This repository's `policy-examples.json` is the logical policy object. It is not the same as the browser-wide `ExtensionSettings` object used to force-install extensions.
- The sample `.reg` files are templates. Replace the placeholder extension ID and review registry data types before deployment. `clearway-gpo-example.reg` demonstrates Chrome managed storage; `clearway-edge-policy-example.reg` demonstrates the equivalent Edge policy path.
- `blockDomains`, `allowDomains`, URL filters and keywords are browser extension policies, not native browser URLBlocklist policies.
- Native Chrome/Edge URL blocklist policies can block host/path patterns independently of Clearway and may display a browser-native block page rather than Clearway branding.
- Keyword/page-content checks are not equivalent to full category filtering. For reliable school-wide controls, pair the extension with managed DNS, endpoint or gateway filtering.
- Keep an allowlist for essential learning platforms and test with a small pilot group before broad rollout.
