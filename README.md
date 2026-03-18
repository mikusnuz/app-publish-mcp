**English** | [한국어](README.ko.md) | [中文](README.zh.md) | [日本語](README.ja.md)

# app-publish-mcp

[![npm version](https://img.shields.io/npm/v/app-publish-mcp)](https://www.npmjs.com/package/app-publish-mcp)

A unified [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server for **App Store Connect** and **Google Play Console**. Manage app listings, screenshots, releases, reviews and submissions — all from your AI assistant.

## Features

### Apple App Store Connect (56 tools)
| Category | Tools |
|----------|-------|
| App Management | `apple_list_apps`, `apple_get_app`, `apple_get_app_info`, `apple_update_category` |
| Bundle IDs | `apple_list_bundle_ids`, `apple_create_bundle_id` |
| Bundle ID Capabilities | `apple_list_bundle_id_capabilities`, `apple_enable_capability`, `apple_disable_capability` |
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
| Certificates | `apple_list_certificates`, `apple_create_certificate`, `apple_revoke_certificate` |
| Provisioning Profiles | `apple_list_profiles`, `apple_create_profile`, `apple_delete_profile` |
| Devices | `apple_list_devices`, `apple_register_device`, `apple_update_device` |
| TestFlight Beta Groups | `apple_list_beta_groups`, `apple_create_beta_group`, `apple_delete_beta_group`, `apple_add_beta_testers_to_group`, `apple_remove_beta_testers_from_group` |
| TestFlight Beta Testers | `apple_list_beta_testers`, `apple_invite_beta_tester`, `apple_delete_beta_tester` |
| In-App Purchases | `apple_list_iap`, `apple_create_iap`, `apple_get_iap`, `apple_delete_iap` |
| Subscription Groups | `apple_list_subscription_groups`, `apple_create_subscription_group`, `apple_delete_subscription_group` |

### Google Play Console (35 tools)
| Category | Tools |
|----------|-------|
| Edit Lifecycle | `google_create_edit`, `google_commit_edit`, `google_validate_edit`, `google_delete_edit` |
| App Details | `google_get_details`, `google_update_details` |
| Store Listing | `google_list_listings`, `google_get_listing`, `google_update_listing`, `google_delete_listing` |
| Country Availability | `google_get_country_availability` |
| Testers | `google_get_testers`, `google_update_testers` |
| Images | `google_list_images`, `google_upload_image`, `google_delete_image`, `google_delete_all_images` |
| Tracks & Releases | `google_list_tracks`, `google_get_track`, `google_create_release`, `google_promote_release`, `google_halt_release` |
| Bundle / APK | `google_upload_bundle`, `google_upload_apk` |
| Reviews | `google_list_reviews`, `google_get_review`, `google_reply_to_review` |
| In-App Products | `google_list_iap`, `google_get_iap`, `google_create_iap`, `google_update_iap`, `google_delete_iap` |
| Subscriptions | `google_list_subscriptions`, `google_get_subscription`, `google_archive_subscription` |

### Prompts (2)
| Prompt | Description |
|--------|-------------|
| `app_release_checklist` | Guided checklist for releasing an app update — walks through version creation, metadata, build assignment and submission for iOS and/or Android |
| `app_store_optimization` | ASO audit that reviews current listing metadata (title, description, keywords, screenshots, localization) and provides actionable improvement recommendations |

### Resources (2)
| URI | Description |
|-----|-------------|
| `app-publish://config` | Current server configuration — connected accounts, auth methods, tool counts |
| `app-publish://supported-platforms` | All supported tools grouped by platform with descriptions |

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
2. google_update_details → update contact info
3. google_update_listing → update store listing
4. google_upload_bundle → upload .aab file
5. google_create_release → create release on production track
6. google_validate_edit → check for errors
7. google_commit_edit → publish changes
```

### Manage Google Play in-app products

```
1. google_list_iap → list all products
2. google_create_iap → create a new managed product
3. google_update_iap → update price or description
4. google_delete_iap → remove a product
```

## License

MIT
