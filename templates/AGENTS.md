# App Publishing

This project uses app-publish-mcp for App Store and Google Play management.

When asked to update app store listings, submit builds, manage screenshots, or handle reviews:
- Use the app-publish-mcp tools (prefixed `apple_` for iOS, `google_` for Android)
- Do not manually call App Store Connect or Google Play APIs
- Always check current listing before making changes
- For Google Play, always create an edit session first (`google_create_edit`), make changes, then commit (`google_commit_edit`)
- For iOS submissions, ensure build is assigned and review info is set before submitting

## MCP Config

```json
{
  "mcpServers": {
    "app-publish-mcp": {
      "command": "npx",
      "args": ["-y", "app-publish-mcp"],
      "env": {
        "APPLE_KEY_ID": "YOUR_KEY_ID",
        "APPLE_ISSUER_ID": "YOUR_ISSUER_ID",
        "APPLE_P8_PATH": "/path/to/AuthKey.p8",
        "GOOGLE_SERVICE_ACCOUNT_PATH": "/path/to/service-account.json"
      }
    }
  }
}
```
