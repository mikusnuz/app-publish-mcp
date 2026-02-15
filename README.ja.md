[English](README.md) | [한국어](README.ko.md) | [中文](README.zh.md) | **日本語**

# app-publish-mcp

**App Store Connect**と**Google Play Console**のための統合[MCP (Model Context Protocol)](https://modelcontextprotocol.io)サーバー。アプリのリスティング、スクリーンショット、リリース、レビュー、申請をAIアシスタントから管理できます。

## 機能

### Apple App Store Connect (29ツール)
| カテゴリ | ツール |
|----------|-------|
| アプリ管理 | `apple_list_apps`, `apple_get_app`, `apple_get_app_info`, `apple_update_category` |
| Bundle ID | `apple_list_bundle_ids`, `apple_create_bundle_id` |
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

### Google Play Console (20ツール)
| カテゴリ | ツール |
|----------|-------|
| 編集ライフサイクル | `google_create_edit`, `google_commit_edit`, `google_delete_edit` |
| ストアリスティング | `google_list_listings`, `google_get_listing`, `google_update_listing` |
| 画像 | `google_list_images`, `google_upload_image`, `google_delete_image`, `google_delete_all_images` |
| トラックとリリース | `google_list_tracks`, `google_get_track`, `google_create_release`, `google_promote_release`, `google_halt_release` |
| Bundle / APK | `google_upload_bundle`, `google_upload_apk` |
| レビュー | `google_list_reviews`, `google_get_review`, `google_reply_to_review` |

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
2. google_update_listing → ストアリスティングを更新
3. google_upload_bundle → .aabファイルをアップロード
4. google_create_release → 本番トラックでリリースを作成
5. google_commit_edit → 変更を公開
```

## ライセンス

MIT
