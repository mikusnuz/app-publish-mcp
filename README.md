**English** | [한국어](README.ko.md) | [中文](README.zh.md) | [日本語](README.ja.md)

# app-publish-mcp

[![npm version](https://img.shields.io/npm/v/app-publish-mcp)](https://www.npmjs.com/package/app-publish-mcp)

A unified [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server for **App Store Connect** and **Google Play Console**. Manage app listings, screenshots, releases, reviews and submissions — all from your AI assistant.

## Publishing Boundary

You provide a release-ready, correctly signed Android `.aab` / `.apk` or Apple `.ipa`. The MCP handles supported store-side work from upload through metadata, testing, review submission, and release. It does not compile the app, own signing keys, or replace Xcode, Gradle, or CI.

The first release of a new app still requires manual setup in App Store Connect or Play Console, including developer enrollment, agreements, app records where required, API access, signing, tax and banking details, and policy, privacy, or content declarations. For an existing, fully configured Android app, a signed AAB is usually enough to let the MCP run the update workflow. A Google edit commit only commits the requested changes; store review, managed publishing, or a staged rollout can delay public availability.

## When to Use

Use this MCP when you need to:

- **"Update my app's App Store description and keywords"** — modify version localizations, app info localizations
- **"Upload new screenshots for iPhone 16 Pro"** — create screenshot sets and upload images
- **"Submit a new version for review"** — create version, assign build, set review info, submit
- **"Check the status of my app review"** — list versions and check review state
- **"Respond to a user review on Google Play"** — list reviews and reply
- **"Create a phased release on Google Play"** — create edit, create release on a track, commit
- **"Manage TestFlight beta testers"** — create groups, invite testers, manage access
- **"Set up in-app purchases"** — create and manage IAPs and subscription groups on both platforms
- **"Register a new device for development"** — manage devices, certificates, and provisioning profiles

## Features

### Apple App Store Connect (86 tools)
| Category | Tools |
|----------|-------|
| App Management | `apple_list_apps`, `apple_get_next_page`, `apple_get_app`, `apple_update_app`, `apple_get_app_info`, `apple_update_category` |
| Bundle IDs | `apple_list_bundle_ids`, `apple_create_bundle_id` |
| Bundle ID Capabilities | `apple_list_bundle_id_capabilities`, `apple_enable_capability`, `apple_disable_capability` |
| Versions | `apple_list_versions`, `apple_create_version`, `apple_update_version` |
| Version Localizations | `apple_list_version_localizations`, `apple_create_version_localization`, `apple_update_version_localization` |
| App Info Localizations | `apple_list_app_info_localizations`, `apple_update_app_info_localization` |
| Screenshots | `apple_list_screenshot_sets`, `apple_create_screenshot_set`, `apple_upload_screenshot`, `apple_delete_screenshot` |
| Builds | `apple_list_builds`, `apple_get_build_upload`, `apple_wait_for_build_upload`, `apple_delete_build_upload`, `apple_upload_build`, `apple_set_build_encryption`, `apple_assign_build` |
| Age Rating | `apple_get_age_rating`, `apple_update_age_rating` |
| Review Info | `apple_update_review_detail` |
| Submission | `apple_submit_for_review`, `apple_cancel_submission` |
| Release | `apple_release_version`, `apple_get_phased_release`, `apple_create_phased_release`, `apple_update_phased_release`, `apple_delete_phased_release` |
| Pricing & Availability | `apple_get_pricing`, `apple_list_app_price_points`, `apple_set_price`, `apple_list_availability`, `apple_create_availability`, `apple_update_territory_availability` |
| Customer Reviews | `apple_list_reviews`, `apple_respond_to_review` |
| Certificates | `apple_list_certificates`, `apple_create_certificate`, `apple_revoke_certificate` |
| Provisioning Profiles | `apple_list_profiles`, `apple_create_profile`, `apple_delete_profile` |
| Devices | `apple_list_devices`, `apple_register_device`, `apple_update_device` |
| TestFlight Beta Groups | `apple_list_beta_groups`, `apple_create_beta_group`, `apple_delete_beta_group`, `apple_add_beta_testers_to_group`, `apple_remove_beta_testers_from_group` |
| TestFlight Beta Testers | `apple_list_beta_testers`, `apple_invite_beta_tester`, `apple_delete_beta_tester` |
| In-App Purchases | `apple_list_iap`, `apple_create_iap`, `apple_get_iap`, `apple_delete_iap` |
| Subscription Groups | `apple_list_subscription_groups`, `apple_create_subscription_group`, `apple_delete_subscription_group` |
| Accessibility Declarations | `apple_list_accessibility_declarations`, `apple_create_accessibility_declaration`, `apple_update_accessibility_declaration`, `apple_delete_accessibility_declaration` |
| Price Points | `apple_get_subscription_price_points`, `apple_get_iap_price_points` |
| Offer Codes | `apple_list_subscription_offer_codes`, `apple_get_subscription_offer_code`, `apple_create_subscription_offer_code`, `apple_list_iap_offer_codes`, `apple_get_iap_offer_code`, `apple_create_iap_offer_code` |
| Win-Back Offers | `apple_list_win_back_offers`, `apple_get_win_back_offer` |

`apple_get_pricing` follows all manual and automatic price pages. `apple_set_price` submits the complete manual price schedule, so include every current or future manual entry that must remain; omitted entries may be removed from the schedule.

Apple provisioning resources — Bundle IDs, capabilities, certificates, profiles, and devices — require a Team API key with suitable access. Individual API keys can be used for supported App Store Connect publishing operations, but not for those provisioning resources. TestFlight internal testers are members of your App Store Connect team, not Apple employees.

### Google Play Console (49 tools)
| Category | Tools |
|----------|-------|
| Edit Lifecycle | `google_create_edit`, `google_get_edit`, `google_commit_edit`, `google_validate_edit`, `google_delete_edit` |
| App Details | `google_get_details`, `google_update_details` |
| Store Listing | `google_list_listings`, `google_get_listing`, `google_update_listing`, `google_delete_listing` |
| Country Availability | `google_get_country_availability` |
| Testers | `google_get_testers`, `google_update_testers` |
| Images | `google_list_images`, `google_upload_image`, `google_delete_image`, `google_delete_all_images` |
| Tracks & Releases | `google_list_tracks`, `google_get_track`, `google_create_release`, `google_promote_release`, `google_halt_release`, `google_list_release_statuses` |
| Bundle / APK | `google_list_bundles`, `google_upload_bundle`, `google_list_apks`, `google_upload_apk` |
| Data Safety | `google_update_data_safety` |
| Reviews¹ | `google_list_reviews`, `google_get_review`, `google_reply_to_review` |
| In-App Products | `google_list_iap`, `google_get_iap`, `google_create_iap`, `google_update_iap`, `google_delete_iap` |
| Subscriptions | `google_list_subscriptions`, `google_get_subscription`, `google_create_subscription`, `google_activate_subscription_base_plan`, `google_deactivate_subscription_base_plan` |
| One-time Products² | `google_list_one_time_products`, `google_get_one_time_product`, `google_create_one_time_product`, `google_update_one_time_product`, `google_delete_one_time_product`, `google_activate_purchase_option`, `google_deactivate_purchase_option` |

¹ If `google_list_reviews` returns an empty array for an app that has visible reviews in Play Console, first check that the linked service account has the **"Reply to reviews"** account permission (Play Console → Users and permissions) — the API does not raise a distinct error for a missing permission, it just returns no results. Also note the endpoint only surfaces recent reviews; use `pageToken` to page through more.

² One-time Products (`monetization.onetimeproducts`) is Google Play's newer purchase model for buy/rent items, distinct from the older `inappproducts` API. Inspect each returned purchase-option state and use the dedicated activate/deactivate tools to change it.

### Prompts (2)
| Prompt | Description |
|--------|-------------|
| `app_release_checklist` | Guided checklist from signed artifact upload through review, release, and publishing-status checks for iOS and/or Android |
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
4. Note the **Key ID** and, for team keys, the **Issuer ID**. For an individual key, set `APPLE_KEY_TYPE=INDIVIDUAL` and omit the issuer ID.
5. Use a Team API key with suitable access for Bundle ID, certificate, profile, capability, or device tools.

### 3. Google Credentials

Enable the **Google Play Android Developer API**, then choose one authentication method:

- **Service account:** Create one in [Google Cloud Console](https://console.cloud.google.com/), download its JSON key, then invite its email and grant the needed app permissions in Play Console under **Users and permissions**.
- **OAuth:** Create a Desktop OAuth client, then run:

```bash
app-publish-mcp auth google --client-id=YOUR_ID --client-secret=YOUR_SECRET
```

The OAuth command stores the refresh token in `~/.app-publish-mcp/google.json`; the server loads it automatically. You can instead set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REFRESH_TOKEN` explicitly.

### 4. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```
APPLE_KEY_ID=YOUR_KEY_ID
APPLE_KEY_TYPE=TEAM
APPLE_ISSUER_ID=YOUR_ISSUER_ID
APPLE_P8_PATH=/path/to/AuthKey.p8
GOOGLE_SERVICE_ACCOUNT_PATH=/path/to/service-account.json
```

The server automatically loads `.env` from the package/project root. Environment variables supplied by the shell or MCP host take precedence. For OAuth variables, see `.env.example`.

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
        "APPLE_KEY_TYPE": "TEAM",
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
1. apple_list_apps → get the app ID
2. apple_create_version / apple_update_version and localization tools → prepare version 1.1.0, release settings, and metadata
3. apple_upload_build → upload the signed IPA and wait for import
   (or resume with apple_get_build_upload / apple_wait_for_build_upload)
   If an ambiguous commit error retains a buildUploadId, inspect it with apple_get_build_upload; when it is AWAITING_UPLOAD or FAILED, delete it with apple_delete_build_upload before uploading again.
4. apple_set_build_encryption → answer export-compliance encryption for the imported build
   (`true` can still require a manual encryption declaration, supporting documents, and appEncryptionDeclaration linkage in App Store Connect.)
5. apple_assign_build → attach the imported build to the version
6. apple_update_review_detail and apple_get_age_rating → verify review metadata
7. apple_submit_for_review → submit for App Review
8. For an update (not a first version), optionally configure a seven-day phased release before release.
9. After approval, use apple_release_version only for PENDING_DEVELOPER_RELEASE; then monitor or manage any phased release.
```

### Release an Android app

```
1. google_create_edit → start an edit (or google_get_edit to verify a resumed edit)
2. google_list_bundles / google_list_apks → reuse an artifact already in the edit when possible
3. google_upload_bundle / google_upload_apk → upload only when the artifact is missing
4. Listing tools and google_update_data_safety → apply reviewed store changes as needed
5. google_create_release → create the target-track release with the exact versionCodes set
6. google_validate_edit → check for errors
7. google_commit_edit → commit changes for Play processing
8. google_list_release_statuses → inspect review and publishing state after commit
```

Committing an edit does not guarantee immediate public availability. Google Play review, managed publishing, and staged rollout settings still apply.

### Manage Google Play in-app products

```
1. google_list_iap → list all products
2. google_create_iap → create a new managed product
3. google_update_iap → update price or description
4. google_delete_iap → remove a product
```

### Create a Google Play subscription

```
1. google_create_subscription → create the subscription with listings and a
   base plan (billing period, grace period, regional pricing in micros).
   The base plan is created in DRAFT state.
2. google_activate_subscription_base_plan → flip the base plan to ACTIVE so
   it becomes purchasable in the Play Store.
3. google_deactivate_subscription_base_plan → pause sales without deleting
   the plan.
4. There is no supported subscription archive operation. Keep all base plans
   deactivated when retiring a previously published subscription.
```

Example arguments for `google_create_subscription`:

```jsonc
{
  "packageName": "com.example.app",
  "productId": "com.example.app.pro_monthly",
  "listings": [
    {
      "languageCode": "en-US",
      "title": "Pro Monthly",
      "description": "Unlock all premium features.",
      "benefits": ["Ad-free", "Cloud sync", "Priority support"]
    }
  ],
  "basePlans": [
    {
      "basePlanId": "pro-monthly",
      "autoRenewing": {
        "billingPeriodDuration": "P1M",
        "gracePeriodDuration": "P3D",
        "accountHoldDuration": "P30D"
      },
      "regionalConfigs": [
        { "regionCode": "US", "priceMicros": "3990000", "currency": "USD" },
        { "regionCode": "TR", "priceMicros": "99000000", "currency": "TRY" }
      ]
    }
  ]
}
```

Prices are given in **micros** (1 USD = 1,000,000 micros) and converted to
the Play API's `Money` shape (`units` + `nanos`) internally. `regionsVersion`
defaults to `2022/02`, which the Play API currently requires when regional
pricing is supplied.

## License

MIT
