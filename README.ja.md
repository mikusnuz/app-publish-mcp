[English](README.md) | [한국어](README.ko.md) | [中文](README.zh.md) | **日本語**

# app-publish-mcp

[![npm version](https://img.shields.io/npm/v/app-publish-mcp)](https://www.npmjs.com/package/app-publish-mcp)

**App Store Connect**と**Google Play Console**のための統合[MCP (Model Context Protocol)](https://modelcontextprotocol.io)サーバー。アプリのリスティング、スクリーンショット、リリース、レビュー、申請をAIアシスタントから管理できます。

## 機能

### Apple App Store Connect (56ツール)
| カテゴリ | ツール |
|----------|-------|
| アプリ管理 | `apple_list_apps`, `apple_get_app`, `apple_get_app_info`, `apple_update_category` |
| Bundle ID | `apple_list_bundle_ids`, `apple_create_bundle_id` |
| Bundle ID 機能 | `apple_list_bundle_id_capabilities`, `apple_enable_capability`, `apple_disable_capability` |
| バージョン | `apple_list_versions`, `apple_create_version` |
| バージョンローカライゼーション | `apple_list_version_localizations`, `apple_create_version_localization`, `apple_update_version_localization` |
| アプリ情報ローカライゼーション | `apple_list_app_info_localizations`, `apple_update_app_info_localization` |
| スクリーンショット | `apple_list_screenshot_sets`, `apple_create_screenshot_set`, `apple_upload_screenshot`, `apple_delete_screenshot` |
| ビルド | `apple_list_builds`, `apple_assign_build` |
| 年齢制限 | `apple_get_age_rating`, `apple_update_age_rating` |
| レビュー情報 | `apple_update_review_detail` |
| 申請 | `apple_submit_for_review`, `apple_cancel_submission` |
| 価格設定 | `apple_get_pricing`, `apple_set_price`, `apple_list_availability` |
| カスタマーレビュー | `apple_list_reviews`, `apple_respond_to_review` |
| 証明書 | `apple_list_certificates`, `apple_create_certificate`, `apple_revoke_certificate` |
| プロビジョニングプロファイル | `apple_list_profiles`, `apple_create_profile`, `apple_delete_profile` |
| デバイス | `apple_list_devices`, `apple_register_device`, `apple_update_device` |
| TestFlight ベータグループ | `apple_list_beta_groups`, `apple_create_beta_group`, `apple_delete_beta_group`, `apple_add_beta_testers_to_group`, `apple_remove_beta_testers_from_group` |
| TestFlight ベータテスター | `apple_list_beta_testers`, `apple_invite_beta_tester`, `apple_delete_beta_tester` |
| アプリ内課金 | `apple_list_iap`, `apple_create_iap`, `apple_get_iap`, `apple_delete_iap` |
| サブスクリプショングループ | `apple_list_subscription_groups`, `apple_create_subscription_group`, `apple_delete_subscription_group` |

### Google Play Console (35ツール)
| カテゴリ | ツール |
|----------|-------|
| 編集ライフサイクル | `google_create_edit`, `google_commit_edit`, `google_validate_edit`, `google_delete_edit` |
| アプリ詳細 | `google_get_details`, `google_update_details` |
| ストアリスティング | `google_list_listings`, `google_get_listing`, `google_update_listing`, `google_delete_listing` |
| 国別利用可否 | `google_get_country_availability` |
| テスター | `google_get_testers`, `google_update_testers` |
| 画像 | `google_list_images`, `google_upload_image`, `google_delete_image`, `google_delete_all_images` |
| トラックとリリース | `google_list_tracks`, `google_get_track`, `google_create_release`, `google_promote_release`, `google_halt_release` |
| Bundle / APK | `google_upload_bundle`, `google_upload_apk` |
| レビュー | `google_list_reviews`, `google_get_review`, `google_reply_to_review` |
| アプリ内商品 | `google_list_iap`, `google_get_iap`, `google_create_iap`, `google_update_iap`, `google_delete_iap` |
| サブスクリプション | `google_list_subscriptions`, `google_get_subscription`, `google_archive_subscription` |

### プロンプト (2個)
| プロンプト | 説明 |
|--------|-------------|
| `app_release_checklist` | アプリアップデートリリースのガイドチェックリスト — iOS/Androidでバージョン作成、メタデータ、ビルド割り当て、申請まで段階的にガイド |
| `app_store_optimization` | 現在のリスティングメタデータ（タイトル、説明、キーワード、スクリーンショット、ローカライゼーション）を分析し、実行可能な改善提案を提供するASOレビュー |

### リソース (2個)
| URI | 説明 |
|-----|-------------|
| `app-publish://config` | 現在のサーバー設定 — 接続されたアカウント、認証方法、ツール数 |
| `app-publish://supported-platforms` | プラットフォーム別にグループ化された全サポートツールと説明 |

## セットアップ

### 1. インストール

```bash
npm install
npm run build
```

### 2. Apple認証情報

1. [App Store Connect > Keys](https://appstoreconnect.apple.com/access/integrations/api)にアクセス
2. **App Manager**ロールでAPIキーを作成
3. `.p8`ファイルをダウンロード
4. **Key ID**と**Issuer ID**をメモ

### 3. Google認証情報

1. [Google Cloud Console](https://console.cloud.google.com/)にアクセス
2. **Google Play Android Developer API**を有効化
3. **サービスアカウント**を作成してJSONキーをダウンロード
4. Google Play Consoleで**設定 > APIアクセス**からサービスアカウントにアクセス権限を付与

### 4. 環境設定

```bash
cp .env.example .env
```

`.env`を編集:
```
APPLE_KEY_ID=YOUR_KEY_ID
APPLE_ISSUER_ID=YOUR_ISSUER_ID
APPLE_P8_PATH=/path/to/AuthKey.p8
GOOGLE_SERVICE_ACCOUNT_PATH=/path/to/service-account.json
```

### 5. Claude Codeに追加

`~/.claude/settings.local.json`に追加:

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

## 使用例

### iOSアプリのアップデート申請

```
1. apple_list_apps → アプリIDを取得
2. apple_create_version → バージョン1.1.0を作成
3. apple_list_version_localizations → ローカライゼーションIDを取得
4. apple_update_version_localization → whatsNew、descriptionを設定
5. apple_list_builds → アップロード済みビルドを検索
6. apple_assign_build → ビルドをバージョンに紐付け
7. apple_update_review_detail → レビュアー連絡先情報を設定
8. apple_submit_for_review → 申請!
```

### Androidアプリのリリース

```
1. google_create_edit → 編集セッションを開始
2. google_update_details → 連絡先情報を更新
3. google_update_listing → ストアリスティングを更新
4. google_upload_bundle → .aabファイルをアップロード
5. google_create_release → 本番トラックでリリースを作成
6. google_validate_edit → エラーチェック
7. google_commit_edit → 変更を公開
```

### Google Playアプリ内商品の管理

```
1. google_list_iap → 全商品を一覧
2. google_create_iap → 新しい管理商品を作成
3. google_update_iap → 価格や説明を更新
4. google_delete_iap → 商品を削除
```

## ライセンス

MIT
