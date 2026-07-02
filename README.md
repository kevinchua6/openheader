# OpenHeader

A lightweight Chrome extension to modify HTTP request and response headers and filter requests by URL patterns.

## Features

- ✏️ **Modify Headers** — Add, remove, or override request and response headers
- 🔍 **URL Filtering** — Filter headers by URL patterns using regex or simple string matching
- 💾 **Persistent Storage** — Your rules are saved locally and survive browser restarts
- 🎨 **Clean Interface** — Simple, intuitive popup UI for managing headers
- ⚡ **Lightweight** — Minimal performance impact on browsing

## Installation

Install directly from the Chrome Web Store:

**[OpenHeader on the Chrome Web Store](https://chromewebstore.google.com/detail/openheader/dbemfnngokmgenphnpddlfmdefmjijje)**

## Usage

### Basic Setup

1. Click the **OpenHeader** icon in your Chrome toolbar
2. Add a new header rule:
   - Enter a **URL pattern** (e.g., `api.example.com`, `.*\.github\.com.*`)
   - Enter the **header name** (e.g., `Authorization`, `X-Custom-Header`)
   - Enter the **header value**
   - Choose the type: **Request** or **Response**
3. Click **Add** to enable the rule
4. Rules are saved automatically

### URL Pattern Examples

- **Exact domain:** `example.com`
- **Any subdomain:** `.*\.example\.com`
- **All HTTPS:** `https://.*`
- **Specific path:** `api\.example\.com/v1/.*`

### Managing Rules

- **Enable/Disable** — Toggle the checkbox next to each rule
- **Delete** — Click the delete button to remove a rule
- **Edit** — Modify any rule in place

## Permissions

This extension requires:

- `storage` — To save your header rules locally
- `tabs` — To read the current tab URL
- `declarativeNetRequest` — To modify request headers
- `declarativeNetRequestWithHostAccess` — To modify response headers

**Your data is stored locally and never sent to external servers.**

## Troubleshooting

### Extension doesn't appear in toolbar

- Make sure Developer mode is enabled in `chrome://extensions`
- Try refreshing the extension (click the refresh icon)

### Headers not being modified

- Check that your URL pattern matches the target site
- Verify the rule is enabled (checkbox is checked)
- Some sites may have security policies preventing header modifications

## Support

Found a bug or have a feature request? [Open an issue](issues) on GitHub.

## License

MIT

---

**Note:** This is an unofficial clone inspired by the ModHeader extension created due to its increasing number of ads. See the original [ModHeader](https://modheader.com) for more information.
