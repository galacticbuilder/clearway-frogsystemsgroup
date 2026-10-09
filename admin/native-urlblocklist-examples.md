# Native Chrome and Edge URL blocklist policies

Use these policies when you want the browser itself to block navigation independently of Clearway. They are separate from the Clearway extension's managed-storage settings. Native browser policies usually show a browser-managed block page rather than Clearway's branded page.

## Google Chrome

Group Policy path: **Administrative Templates → Google → Google Chrome → Block access to a list of URLs** (`URLBlocklist`).

Example entries for YouTube:

- `youtube.com`
- `[*.]youtube.com`
- `youtu.be`
- `[*.]youtube-nocookie.com`

To block only a specific path, use a path-specific entry supported by Chrome's URL blocklist format, for example `youtube.com/shorts`. Test the exact patterns in your browser version before deployment.

On Windows, the policy is under `HKLM\Software\Policies\Google\Chrome\URLBlocklist`. Each list entry is a numbered value (`1`, `2`, `3`, etc.).

## Microsoft Edge

Group Policy path: **Administrative Templates → Microsoft Edge → Configure the list of blocked URLs** (`URLBlocklist`).

The Edge policy uses the equivalent URL pattern list under `HKLM\Software\Policies\Microsoft\Edge\URLBlocklist`, with numbered values.

## Examples in this repository

- `native-urlblocklist-chrome.json`: JSON array of example patterns for reference / cloud policy entry.
- `native-urlblocklist-edge.json`: same patterns for Edge.
- `native-urlblocklist-chrome.reg`: sample Chrome registry policy.
- `native-urlblocklist-edge.reg`: sample Edge registry policy.

The registry files are demonstrations: review the domains and merge them with your existing policies instead of overwriting a school's live policy. Do not use the catch-all pattern `*` unless you deliberately intend to block all browser URLs and have tested the necessary exceptions.

For Chrome's official URL pattern format, see [Chrome Enterprise URL pattern documentation](https://chromeenterprise.google/intl/en_ca/policies/url-patterns/) and the [URLAllowlist policy reference](https://chromeenterprise.google/intl/en_uk/policies/url-allowlist/).
