**English** | [한국어](README.ko.md) | [中文](README.zh.md) | [日本語](README.ja.md)

# app-publish-mcp

A unified [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server for **App Store Connect** and **Google Play Console**. Manage app listings, screenshots, releases, reviews and submissions — all from your AI assistant.

## Features

### Apple App Store Connect (29 tools)
| Category | Tools |
|----------|-------|
| App Management | `apple_list_apps`, `apple_get_app`, `apple_get_app_info`, `apple_update_category` |
| Bundle IDs | `apple_list_bundle_ids`, `apple_create_bundle_id` |
| Versions | `apple_list_versions`, `apple_create_version` |
| Version Localizations | `apple_list_version_localizations`, `apple_create_version_localization`, `apple_update_version_localization` |
| App Info Localizations | `apple_list_app_info_localizations`, `apple_update_app_info_localization` |
| Screenshots | `apple_list_screenshot_sets`, `apple_create_screenshot_set`, `apple_upload_screenshot`, `apple_delete_screenshot` |
| Builds | `apple_list_builds`, `apple_assign_build` |
| Age Rating | `apple_get_age_rating`, `apple_update_age_rating` |
| Review Info | `apple_update_review_detail` |
| Submission | `apple_submit_for_review`, `apple_cancel_submission` |
| Pricing | `apple_get_pricing`, `apple_set_price`, `apple_list_availability` |
| Customer Reviews | `apple_list_reviews`, `apple_respond_to_review` |

### Google Play Console (20 tools)
| Category | Tools |
|----------|-------|
| Edit Lifecycle | `google_create_edit`, `google_commit_edit`, `google_delete_edit` |
| Store Listing | `google_list_listings`, `google_get_listing`, `google_update_listing` |
| Images | `google_list_images`, `google_upload_image`, `google_delete_image`, `google_delete_all_images` |
| Tracks & Releases | `google_list_tracks`, `google_get_track`, `google_create_release`, `google_promote_release`, `google_halt_release` |
| Bundle / APK | `google_upload_bundle`, `google_upload_apk` |
| Reviews | `google_list_reviews`, `google_get_review`, `google_reply_to_review` |

## Setup

### 1. Install

```bash
npm install
npm run build
```

### 2. Apple Credentials

1. Go to [App Store Connect > Keys](https://appstoreconnect.apple.com/access/integrations/api)
2. Create an API Key with **App Manager** role
3. Download the `.p8` file
4. Note the **Key ID** and **Issuer ID**

### 3. Google Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable **Google Play Android Developer API**
3. Create a **Service Account** and download the JSON key
4. In Google Play Console, grant the service account access under **Settings > API access**

### 4. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```
APPLE_KEY_ID=YOUR_KEY_ID
APPLE_ISSUER_ID=YOUR_ISSUER_ID
APPLE_P8_PATH=/path/to/AuthKey.p8
GOOGLE_SERVICE_ACCOUNT_PATH=/path/to/service-account.json
```

### 5. Add to Claude Code

Add to `~/.claude/settings.local.json`:

```json
{
  "mcpServers": {
    "app-publish-mcp": {
      "command": "node",
      "args": ["/path/to/app-publish-mcp/dist/index.js"],
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

## Usage Examples

### Submit an iOS app update

```
1. apple_list_apps → get app ID
2. apple_create_version → create version 1.1.0
3. apple_list_version_localizations → get localization IDs
4. apple_update_version_localization → set whatsNew, description
5. apple_list_builds → find the uploaded build
6. apple_assign_build → attach build to version
7. apple_update_review_detail → set reviewer contact info
8. apple_submit_for_review → submit!
```

### Release an Android app

```
1. google_create_edit → start edit session
2. google_update_listing → update store listing
3. google_upload_bundle → upload .aab file
4. google_create_release → create release on production track
5. google_commit_edit → publish changes
```

## License

MIT
