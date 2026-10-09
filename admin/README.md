# ClearWay administrator policy guide

ClearWay supports organisation-specific managed storage policies for Chrome and Edge. Configure a separate policy for each school/organisation through its managed browser deployment. Do not use one shared configuration when schools need different restrictions.

## Per-organisation controls

- `organizationName`, `supportUrl`: branding and support link shown on the restriction page.
- `enabledCategories`: category keys selected by the school, for example `games`, `gambling`, `social-media`, `adult`, `streaming`, `anonymisers`, `malware`.
- `categoryFeedUrls`: HTTPS JSON feeds. Each feed uses `{ "schemaVersion": 1, "categories": { "games": ["games.example"], "gambling": ["casino.example"] } }`. Only categories in `enabledCategories` are added to the block rules. See [category-feed-example.json](category-feed-example.json).
- `categoryLookupApiUrl`: optional HTTPS API endpoint called after a page begins loading. ClearWay sends only the hostname as a `domain` query parameter. Return JSON such as `{ "blocked": true, "category": "games", "reason": "Games category is restricted" }`. The returned category must be present in `enabledCategories`. This is best-effort page-level enforcement, not a pre-navigation network block; API errors fail open.
- `blacklistDomains` / `blockDomains`: organisation-specific domain blacklist. Entries may be `example.org` or `*.example.org`.
- `whitelistDomains` / `allowDomains`: organisation-specific exceptions. These have higher rule priority than ClearWay's domain and URL rules.
- `blockedKeywords` / `blockedUrlKeywords`: keywords matched against URLs, not page text.
- `categoryKeywords`: page-text rules formatted as `category|keyword`. A rule is enabled only when its category is selected.
- `pageKeywords` with `enablePageKeywordBlocking`: best-effort inspection of title, headings, URL and an initial body-text sample. It may produce false positives and can be bypassed by page changes.
- `blockYouTubeEntirely`: separate switch for blocking YouTube (and its common short-link/embed domains).
- `blockedYouTubeVideoIds`: selectively blocks listed video IDs in YouTube watch, Shorts and youtu.be URLs when entire-YouTube blocking is off.
- `blockYouTube`: legacy compatibility switch; prefer `blockYouTubeEntirely`.
- `blockGames`: convenience switch for the built-in Roblox, Poki and CrazyGames domains.

When an organisation policy is configured using organisation/category/list fields, ClearWay does not merge the demonstration `blocklist.json` domains into that organisation's policy. With no organisation policy configured, the bundled/central list is used as a development fallback.

## Category feeds and data sources

The category feed is a simple integration format, not a supplied commercial classification database. Point `categoryFeedUrls` at a source you operate or are licensed to use. Feed providers may have different terms, update cadences, formats and coverage; convert them to ClearWay's JSON format before use. The example feed contains demonstration domains only.

For an API lookup, the endpoint must be implemented and operated by your organisation or filtering provider. ClearWay does not ship a categorisation API or a massive licensed domain database. Since the extension's API lookup occurs after the page starts loading, use a managed DNS filter, secure web gateway or endpoint filtering agent for reliable pre-navigation enforcement and for browsers/apps outside the extension.

## Chrome and Edge managed policy deployment

Chrome and Edge extension IDs are assigned by the store or packaging/signing process. A locally loaded unpacked extension may have a different ID on each machine; do not deploy registry policies until you know the stable extension ID.

Chrome managed storage is configured under:

`HKLM\\Software\\Policies\\Google\\Chrome\\3rdparty\\extensions\\<EXTENSION_ID>\\policy`

Edge managed storage is configured under:

`HKLM\\Software\\Policies\\Microsoft\\Edge\\3rdparty\\extensions\\<EXTENSION_ID>\\policy`

Use the browser's ADMX/enterprise management mechanism and verify policy application at `chrome://policy` or `edge://policy`. Force-install the extension through the appropriate extension management policy on school-managed devices. Local unpacked installs are for development, not production rollout.

See [Chrome managed storage](https://developer.chrome.com/docs/extensions/reference/api/storage#property-managed) and Microsoft's [Edge extension management guide](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-manage-extensions-ref-guide).

## Deployment and privacy notes

- Each organisation should receive its own policy and category feed/API configuration.
- The API lookup sends the visited hostname to the configured endpoint. Make this clear in your privacy notice and ensure the endpoint is authorised and protected appropriately.
- Never put API secrets in extension-managed settings that are readable by client-side extension code. Prefer an authenticated gateway or a narrowly scoped endpoint.
- Test allowlist precedence carefully: a whitelisted domain bypasses ClearWay domain and URL rules for that domain.
- Use a pilot group before wider rollout. The current browser extension has not been validated as a complete secure web gateway.
