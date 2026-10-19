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
- **"Upload new screenshots for iPhone 16 Pro"** — upload to the Asset Library and place images on the version localization
- **"Submit a new version for review"** — create version, assign build, set review info, submit
- **"Check the status of my app review"** — list versions and check review state
- **"Respond to a user review on Google Play"** — list reviews and reply
- **"Create a phased release on Google Play"** — create edit, create release on a track, commit
- **"Manage TestFlight beta testers"** — create groups, invite testers, manage access
- **"Set up in-app purchases"** — create and manage IAPs and subscription groups on both platforms
- **"Register a new device for development"** — manage devices, certificates, and provisioning profiles

## Features

### Apple App Store Connect (135 tools)

| Category | Tools |
|----------|-------|
| App Management | `apple_list_apps`, `apple_get_next_page`, `apple_get_app`, `apple_update_app`, `apple_get_app_info`, `apple_update_category` |
| Bundle IDs | `apple_list_bundle_ids`, `apple_create_bundle_id` |
| Bundle ID Capabilities | `apple_list_bundle_id_capabilities`, `apple_enable_capability`, `apple_disable_capability` |
| Versions | `apple_list_versions`, `apple_create_version`, `apple_update_version` |
| Version Localizations | `apple_list_version_localizations`, `apple_create_version_localization`, `apple_update_version_localization` |
| App Info Localizations | `apple_list_app_info_localizations`, `apple_update_app_info_localization` |
| Asset Library | `apple_get_asset_library`, `apple_get_asset_specs`, `apple_list_assets`, `apple_get_asset`, `apple_wait_for_asset`, `apple_upload_asset`, `apple_list_asset_placements`, `apple_delete_asset` |
| Asset Placements | `apple_list_placements`, `apple_create_placement`, `apple_reorder_placements`, `apple_delete_placement` |
| Legacy Screenshots (deprecated) | `apple_list_screenshot_sets`, `apple_create_screenshot_set`, `apple_upload_screenshot`, `apple_delete_screenshot` |
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
| Custom Product Pages | `apple_list_custom_product_pages`, `apple_get_custom_product_page`, `apple_create_custom_product_page`, `apple_update_custom_product_page`, `apple_delete_custom_product_page`, `apple_list_custom_product_page_versions`, `apple_create_custom_product_page_version`, `apple_update_custom_product_page_version`, `apple_list_custom_product_page_localizations`, `apple_create_custom_product_page_localization`, `apple_update_custom_product_page_localization`, `apple_delete_custom_product_page_localization` |
| Product Page Optimization | `apple_list_experiments`, `apple_get_experiment`, `apple_create_experiment`, `apple_update_experiment`, `apple_delete_experiment`, `apple_list_experiment_treatments`, `apple_create_experiment_treatment`, `apple_update_experiment_treatment`, `apple_delete_experiment_treatment`, `apple_list_treatment_localizations`, `apple_create_treatment_localization`, `apple_delete_treatment_localization` |
| Sales & Finance Reports | `apple_get_sales_report`, `apple_get_finance_report` |
| App Analytics Reports | `apple_list_analytics_report_requests`, `apple_create_analytics_report_request`, `apple_list_analytics_reports`, `apple_list_analytics_report_instances`, `apple_list_analytics_report_segments`, `apple_download_analytics_report` |
| Review submission workflow | `apple_list_review_submissions`, `apple_get_review_submission`, `apple_create_review_submission`, `apple_add_review_submission_item`, `apple_submit_review_submission` |

`apple_get_pricing` follows all manual and automatic price pages. `apple_set_price` submits the complete manual price schedule, so include every current or future manual entry that must remain; omitted entries may be removed from the schedule.

Apple provisioning resources — Bundle IDs, capabilities, certificates, profiles, and devices — require a Team API key with suitable access. Individual API keys can be used for supported App Store Connect publishing operations, but not for those provisioning resources. TestFlight internal testers are members of your App Store Connect team, not Apple employees.

### Google Play Console (53 tools)
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
| Android Vitals³ | `google_query_vitals`, `google_list_vitals_anomalies`, `google_search_vitals_error_issues`, `google_search_vitals_error_reports` |
| One-time Products² | `google_list_one_time_products`, `google_get_one_time_product`, `google_create_one_time_product`, `google_update_one_time_product`, `google_delete_one_time_product`, `google_activate_purchase_option`, `google_deactivate_purchase_option` |

¹ The [Reviews API](https://developers.google.com/android-publisher/reply-to-reviews) returns only production-app reviews with comments created or modified within the last 7 days. Ratings without comments and alpha/beta feedback are excluded. `pageToken` does not extend that window; export CSV from Play Console for older history. Check **Reply to reviews** permission when troubleshooting, but an empty result alone does not prove a permission problem.

² One-time Products (`monetization.onetimeproducts`) is Google Play's newer purchase model for buy/rent items, distinct from the older `inappproducts` API. Inspect each returned purchase-option state and use the dedicated activate/deactivate tools to change it.

³ Vitals use the [Play Developer Reporting API](https://developers.google.com/play/developer/reporting). Enable it in the service account's Cloud project and grant the account **View app information** in Play Console. Saved OAuth tokens created before this scope was added need `app-publish-mcp auth google` again.

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
2. Create an API Key with **App Manager** role (reports need a second key, see [Keys and roles](#keys-and-roles))
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

Optional:
```
APPLE_VENDOR_NUMBER=YOUR_VENDOR_NUMBER   # sales and finance reports
APPLE_REPORTS_KEY_ID=REPORTS_KEY_ID      # key for Sales/Finance/Analytics reports
APPLE_REPORTS_P8_PATH=/path/to/AuthKey_REPORTS.p8
APPLE_ADMIN_KEY_ID=ADMIN_KEY_ID          # analytics requests and finance/reporting fallback
APPLE_ADMIN_P8_PATH=/path/to/AuthKey_ADMIN.p8
APP_PUBLISH_READ_ONLY=true               # register only read tools (list/get/search/query/download, no Google edit creation or deletion)
```

See [Keys and roles](#keys-and-roles) for the extra keys and [Safety](#safety) for read-only mode.

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

## Keys and roles

Apple decides what an API key may do by its role, so one key is often not enough. A key that can run the listing gets `403` on reports, and a reports key cannot change the listing.

### Which Apple role does what

| Job | Works with | Fails with |
|-----|-----------|------------|
| Listing, screenshots and visuals, custom product pages, A/B tests, versions, review submission, TestFlight, pricing | App Manager, Admin | Sales and Reports, Finance |
| Bundle IDs, capabilities, certificates, profiles, devices | Team key with suitable access (Admin covers it) | Individual keys |
| `apple_get_sales_report` | Sales and Reports, Finance, Admin | App Manager (`403`) |
| `apple_get_finance_report` | Finance, Admin | Sales and Reports, App Manager (`403`) |
| Reading App Analytics reports | Sales and Reports, Finance, Admin | App Manager (`403`) |
| `apple_create_analytics_report_request` | Admin | Sales and Reports, App Manager (`403`) |

Apple documents the analytics and sales rows in [Analytics Reports](https://developer.apple.com/documentation/analytics-reports). Check the key role and app access before using a report endpoint.

### Several keys on one server

Set the main key as usual and add optional keys. Each request picks its key by API; the server never retries a refused request with a stronger key.

| Request | Key used |
|---------|----------|
| Everything except reports | Main key (`APPLE_KEY_ID`, `APPLE_P8_PATH`) |
| Sales reports, reading analytics reports | `APPLE_REPORTS_*`, else `APPLE_ADMIN_*`, else the main key |
| Finance reports | `APPLE_ADMIN_*`, else `APPLE_REPORTS_*`, else the main key |
| Creating or deleting an analytics report request | `APPLE_ADMIN_*`, else the main key |

`APPLE_REPORTS_ISSUER_ID`, `APPLE_ADMIN_ISSUER_ID` and the matching `*_KEY_TYPE` default to the main key's values. `apple_get_sales_report` and `apple_get_finance_report` also need `APPLE_VENDOR_NUMBER` (App Store Connect → Payments and Financial Reports).

### Recipe: App Analytics without a permanent Admin key

1. Main key: **App Manager**.
2. Create a **Sales and Reports** key and set `APPLE_REPORTS_KEY_ID` / `APPLE_REPORTS_P8_PATH`.
3. Create a temporary **Admin** key, set `APPLE_ADMIN_KEY_ID` / `APPLE_ADMIN_P8_PATH`, restart the server and call `apple_create_analytics_report_request` once per app (`ONGOING`).
4. Revoke the Admin key in App Store Connect and remove the `APPLE_ADMIN_*` variables. The request keeps producing reports, and the Sales and Reports key reads them.

Apple generates the first report instances a day or two later and keeps each instance for 35 days. Download them with `apple_list_analytics_reports` → `apple_list_analytics_report_instances` → `apple_download_analytics_report`.

### Google

One service account covers publishing and vitals. Enable the **Google Play Android Developer API** for publishing and the **Google Play Developer Reporting API** for vitals, and grant the account the needed app permissions in Play Console. Vitals need **View app information**.

### Troubleshooting

| Response | Usually means |
|----------|---------------|
| `401 NOT_AUTHORIZED` | Wrong Key ID, Issuer ID or `.p8`, or a revoked key. Tokens are issued 60 seconds in the past, to tolerate modest clock skew; keep the system clock synchronized. |
| `403 FORBIDDEN_ERROR` "The API key in use does not allow this request" | The key's role cannot do this. Check the role table and add `APPLE_REPORTS_*` or `APPLE_ADMIN_*`. |
| `404 NOT_FOUND` on sales or finance reports | No data for that date or region, e.g. a free app has no finance report. |
| `400 PARAMETER_ERROR` on sales reports | Wrong vendor number, or a `reportSubType` / `version` that does not fit the `reportType`. |
| Google vitals return no rows | Google has no vitals data for the app in that window, which is common for new or low-traffic apps. |

## Safety

Most tools change real store data. Know which ones before you let an assistant call them.

**Reach users or start Apple review**
- `apple_submit_for_review`, `apple_release_version`, `apple_create_phased_release` / `apple_update_phased_release`
- `apple_update_experiment` with `started=true` starts a product page test that real visitors see
- `google_commit_edit` publishes everything in the edit; `google_create_release`, `google_promote_release` and `google_halt_release` take effect on commit

**Money and availability**
- `apple_set_price` (replaces the whole manual price schedule), `apple_create_availability`, `apple_update_territory_availability`
- Creating, changing, activating or deactivating in-app purchases, subscriptions, base plans, one-time products and offer codes

**Public text**
- `apple_respond_to_review` and `google_reply_to_review` post replies everyone can read

**Cannot be undone**
- Every `apple_delete_*` tool, `google_delete_listing`, `google_delete_all_images`, `google_delete_iap`, `google_delete_one_time_product`
- `apple_revoke_certificate`: builds signed with that certificate stop installing

**Recommendations**
- Run a separate read-only server for monitoring and reports: `APP_PUBLISH_READ_ONLY=true`. It registers store-read tools, asset polling and Google edit validation. It excludes Google edit creation and deletion: creating a new edit can invalidate that user's existing release draft. For edit-scoped reads supply an existing editId explicitly; the server never creates or cleans it up in this mode. Any value except empty, `0`, `false`, `no` or `off` turns it on. Report tools that take `outputPath` still write that local file, never over an existing one unless `overwrite=true`.
- Give each key the smallest role that does the job, and revoke temporary Admin keys after use.
- On Google Play, change things inside an edit, check them with `google_validate_edit`, then commit; `google_delete_edit` discards the edit.
- Keep your MCP client's tool approval on for write tools.

**Tested against mocks only:** the write tools for custom product pages and product page optimization follow Apple's OpenAPI 4.5.1 schema and are covered by tests, but have not yet been run against a live account. Try them on a test app first.

## Usage Examples

### Submit assets, custom pages or product page tests

Use `apple_create_review_submission` to create a draft (or `apple_list_review_submissions` to find one), then `apple_add_review_submission_item` for an image/video, custom product page **version**, or v2 experiment. Inspect `apple_get_review_submission`, then pass its complete review item IDs to `apple_submit_review_submission`. Adding items does not submit them; only the last step starts App Review. An interrupted call preserves the submission ID for inspection/retry. Apple controls review eligibility: a first app release needs an app version in the submission; assets assigned to a submitted page/test/version are reviewed with that item. Existing `apple_submit_for_review` still handles app-version releases.

Report downloads are limited to 32 MiB per response and 64 MiB of decompressed/merged text. Analytics segments are checked against Apple's MD5 when provided; signed URLs are never returned in failures. Saved reports use exclusive creation unless `overwrite=true`.

Build uploads use a supported MD5 transfer checksum and retain the optional local `expectedSha256` artifact-integrity check. This does not imply that Apple's documented SHA-256 checksum algorithm is unsupported.

### Upload and arrange Apple screenshots or preview videos

1. `apple_get_asset_library(appId)` returns the app's library ID. Use `apple_get_asset_specs` to select the current spec, compatible placement type and placement group; do not guess device dimensions or group identifiers.
2. `apple_upload_asset` takes `assetLibraryId`, `mediaType` (`IMAGE` or `VIDEO`), `filePath`, and `expectedSpecId`. It validates the file extension/size against Apple's specs, uploads all parts, commits, and waits for processing by default. Videos also accept `previewFrameTimeCode`.
3. If processing times out or fails, retain the returned asset ID and inspect it with `apple_get_asset` / `apple_wait_for_asset`. Do not blindly upload a duplicate. `waitForProcessing=false` returns sooner, but a ready asset is required for placement.
4. `apple_create_placement` links the asset to a `localizationId` using the selected `placementType` and `placementGroup`. The default `targetType` is `appStoreVersionLocalizations`; custom product pages, experiment treatments, and in-app events are also supported. Repeating the same placement reuses it.
5. Read `apple_list_placements`, then pass **all** placement IDs in the desired group order to `apple_reorder_placements`. In-app events do not support this ordering endpoint.
6. `apple_delete_placement` removes a placement only. `apple_list_asset_placements` shows everywhere an asset is used; `apple_delete_asset` refuses to delete an asset still in use.

Apple deprecated the legacy screenshot endpoints in [App Store Connect API 4.5.1](https://developer.apple.com/documentation/appstoreconnectapi/app-store-connect-api-4-5-1-release-notes). The four existing screenshot tools remain for compatibility; Apple has not announced their shutdown date. Use the [Asset Library workflow](https://developer.apple.com/documentation/appstoreconnectapi/migrating-to-the-app-asset-library) for new work. Korea age-rating overrides now also support `ALL` and `TWELVE_PLUS`.

### Header and search visuals, custom product pages, A/B tests

The App Store product page header and the search results visual are Asset Library placements (`PRODUCT_PAGE_HEADER_ASSET`, `APP_STORE_SEARCH_RESULTS_ASSET`). Pick the spec with `apple_get_asset_specs(placementType=...)`, upload with `apple_upload_asset`, then `apple_create_placement`. The same placements work on custom product page localizations (`apple_create_custom_product_page` → `apple_list_custom_product_page_localizations`) and on test treatments (`apple_create_experiment` → `apple_create_experiment_treatment` → `apple_create_treatment_localization`).

### Store analytics

`apple_create_analytics_report_request` asks Apple to start generating App Analytics reports; the first instances appear after 1–2 days. Then `apple_list_analytics_reports` → `apple_list_analytics_report_instances` → `apple_download_analytics_report` (pass `outputPath` to keep the full file). `apple_get_sales_report` returns daily units and proceeds. On Android, `google_query_vitals` returns crash/ANR rates for the latest 28 days by default.

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
