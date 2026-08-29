[English](README.md) | [한국어](README.ko.md) | [中文](README.zh.md) | **日本語**

# app-publish-mcp

[![npm version](https://img.shields.io/npm/v/app-publish-mcp)](https://www.npmjs.com/package/app-publish-mcp)

**App Store Connect**と**Google Play Console**のための統合[MCP (Model Context Protocol)](https://modelcontextprotocol.io)サーバー。アプリのリスティング、スクリーンショット、リリース、レビュー、申請をAIアシスタントから管理できます。

## 公開ワークフローの範囲

ユーザーがリリース可能な状態にビルドし、正しく署名した Android `.aab` / `.apk` または Apple `.ipa` を用意します。MCP はバイナリのアップロードからメタデータ、テスト、審査申請、リリースまで、対応するストア側の作業を処理します。アプリのコンパイル、署名キーの保管、Xcode、Gradle、CI の代替は行いません。

新規アプリの初回リリースでは、開発者登録、契約、必要なアプリレコード、API アクセス、署名、税務・銀行情報、ポリシー・プライバシー・コンテンツ申告などを App Store Connect または Play Console で先に設定する必要があります。設定済みの Android アプリの更新であれば、通常は署名済み AAB から MCP で公開フローを進められます。Google edit の commit は変更を確定するもので、審査、管理対象の公開、段階的ロールアウトにより一般公開が遅れる場合があります。

## 機能

### Apple App Store Connect (86ツール)
| カテゴリ | ツール |
|----------|-------|
| アプリ管理 | `apple_list_apps`, `apple_get_next_page`, `apple_get_app`, `apple_update_app`, `apple_get_app_info`, `apple_update_category` |
| Bundle ID | `apple_list_bundle_ids`, `apple_create_bundle_id` |
| Bundle ID 機能 | `apple_list_bundle_id_capabilities`, `apple_enable_capability`, `apple_disable_capability` |
| バージョン | `apple_list_versions`, `apple_create_version`, `apple_update_version` |
| バージョンローカライゼーション | `apple_list_version_localizations`, `apple_create_version_localization`, `apple_update_version_localization` |
| アプリ情報ローカライゼーション | `apple_list_app_info_localizations`, `apple_update_app_info_localization` |
| スクリーンショット | `apple_list_screenshot_sets`, `apple_create_screenshot_set`, `apple_upload_screenshot`, `apple_delete_screenshot` |
| ビルド | `apple_list_builds`, `apple_get_build_upload`, `apple_wait_for_build_upload`, `apple_delete_build_upload`, `apple_upload_build`, `apple_set_build_encryption`, `apple_assign_build` |
| 年齢制限 | `apple_get_age_rating`, `apple_update_age_rating` |
| レビュー情報 | `apple_update_review_detail` |
| 申請 | `apple_submit_for_review`, `apple_cancel_submission` |
| リリース | `apple_release_version`, `apple_get_phased_release`, `apple_create_phased_release`, `apple_update_phased_release`, `apple_delete_phased_release` |
| 価格と配信可否 | `apple_get_pricing`, `apple_list_app_price_points`, `apple_set_price`, `apple_list_availability`, `apple_create_availability`, `apple_update_territory_availability` |
| カスタマーレビュー | `apple_list_reviews`, `apple_respond_to_review` |
| 証明書 | `apple_list_certificates`, `apple_create_certificate`, `apple_revoke_certificate` |
| プロビジョニングプロファイル | `apple_list_profiles`, `apple_create_profile`, `apple_delete_profile` |
| デバイス | `apple_list_devices`, `apple_register_device`, `apple_update_device` |
| TestFlight ベータグループ | `apple_list_beta_groups`, `apple_create_beta_group`, `apple_delete_beta_group`, `apple_add_beta_testers_to_group`, `apple_remove_beta_testers_from_group` |
| TestFlight ベータテスター | `apple_list_beta_testers`, `apple_invite_beta_tester`, `apple_delete_beta_tester` |
| アプリ内課金 | `apple_list_iap`, `apple_create_iap`, `apple_get_iap`, `apple_delete_iap` |
| サブスクリプショングループ | `apple_list_subscription_groups`, `apple_create_subscription_group`, `apple_delete_subscription_group` |
| アクセシビリティ宣言 | `apple_list_accessibility_declarations`, `apple_create_accessibility_declaration`, `apple_update_accessibility_declaration`, `apple_delete_accessibility_declaration` |
| 価格ポイント | `apple_get_subscription_price_points`, `apple_get_iap_price_points` |
| オファーコード | `apple_list_subscription_offer_codes`, `apple_get_subscription_offer_code`, `apple_create_subscription_offer_code`, `apple_list_iap_offer_codes`, `apple_get_iap_offer_code`, `apple_create_iap_offer_code` |
| ウィンバックオファー | `apple_list_win_back_offers`, `apple_get_win_back_offer` |

`apple_get_pricing` は手動価格と自動価格の全ページを取得します。`apple_set_price` は手動価格スケジュール全体を送信するため、維持する現在および将来の手動価格をすべて含めてください。省略した項目はスケジュールから削除される可能性があります。

Bundle ID、Capability、証明書、プロビジョニングプロファイル、デバイスなどの Apple プロビジョニングリソースには、適切なアクセス権を持つ Team API キーが必要です。Individual API キーは対応する App Store Connect 公開操作には使えますが、これらのプロビジョニングリソースには使えません。TestFlight の内部テスターは Apple 社員ではなく、App Store Connect チームのメンバーです。

### Google Play Console (49ツール)
| カテゴリ | ツール |
|----------|-------|
| 編集ライフサイクル | `google_create_edit`, `google_get_edit`, `google_commit_edit`, `google_validate_edit`, `google_delete_edit` |
| アプリ詳細 | `google_get_details`, `google_update_details` |
| ストアリスティング | `google_list_listings`, `google_get_listing`, `google_update_listing`, `google_delete_listing` |
| 国別利用可否 | `google_get_country_availability` |
| テスター | `google_get_testers`, `google_update_testers` |
| 画像 | `google_list_images`, `google_upload_image`, `google_delete_image`, `google_delete_all_images` |
| トラックとリリース | `google_list_tracks`, `google_get_track`, `google_create_release`, `google_promote_release`, `google_halt_release`, `google_list_release_statuses` |
| Bundle / APK | `google_list_bundles`, `google_upload_bundle`, `google_list_apks`, `google_upload_apk` |
| Data Safety | `google_update_data_safety` |
| レビュー | `google_list_reviews`, `google_get_review`, `google_reply_to_review` |
| アプリ内商品 | `google_list_iap`, `google_get_iap`, `google_create_iap`, `google_update_iap`, `google_delete_iap` |
| サブスクリプション | `google_list_subscriptions`, `google_get_subscription`, `google_create_subscription`, `google_activate_subscription_base_plan`, `google_deactivate_subscription_base_plan` |
| 単発商品 | `google_list_one_time_products`, `google_get_one_time_product`, `google_create_one_time_product`, `google_update_one_time_product`, `google_delete_one_time_product`, `google_activate_purchase_option`, `google_deactivate_purchase_option` |

### プロンプト (2個)
| プロンプト | 説明 |
|--------|-------------|
| `app_release_checklist` | iOS/Android の署名済み artifact アップロードから審査、リリース、公開状態の確認まで案内するチェックリスト |
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
4. **Key ID**と Team キーの **Issuer ID** をメモします。Individual キーは `APPLE_KEY_TYPE=INDIVIDUAL` に設定し、Issuer ID を省略します。
5. Bundle ID、証明書、プロファイル、Capability、デバイスのツールには、適切なアクセス権を持つ Team API キーを使用します。

### 3. Google認証情報

**Google Play Android Developer API** を有効にし、次のどちらかの認証方法を選びます。

- **サービスアカウント:** [Google Cloud Console](https://console.cloud.google.com/) で作成して JSON キーをダウンロードし、Play Console の **ユーザーと権限 (Users and permissions)** でそのメールアドレスを招待し、必要なアプリ権限を付与します。
- **OAuth:** Desktop OAuth クライアントを作成し、次を実行します。

```bash
app-publish-mcp auth google --client-id=YOUR_ID --client-secret=YOUR_SECRET
```

OAuth コマンドは refresh token を `~/.app-publish-mcp/google.json` に保存し、サーバーが自動的に読み込みます。代わりに `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`GOOGLE_REFRESH_TOKEN` を直接設定できます。

### 4. 環境設定

```bash
cp .env.example .env
```

`.env`を編集:
```
APPLE_KEY_ID=YOUR_KEY_ID
APPLE_KEY_TYPE=TEAM
APPLE_ISSUER_ID=YOUR_ISSUER_ID
APPLE_P8_PATH=/path/to/AuthKey.p8
GOOGLE_SERVICE_ACCOUNT_PATH=/path/to/service-account.json
```

サーバーはパッケージ/プロジェクトルートの `.env` を自動的に読み込みます。シェルまたは MCP ホストから渡された環境変数が優先されます。OAuth の環境変数は `.env.example` を参照してください。

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
        "APPLE_KEY_TYPE": "TEAM",
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
1. apple_list_apps → アプリ ID を確認
2. apple_create_version / apple_update_version とローカライゼーションツール → バージョン 1.1.0、リリース設定、メタデータを準備
3. apple_upload_build → 署名済み IPA をアップロードして import 完了を待機
   (中断した処理は apple_get_build_upload / apple_wait_for_build_upload で再開)
   commit 結果が不明なエラーで buildUploadId が残った場合は apple_get_build_upload で確認し、AWAITING_UPLOAD または FAILED なら apple_delete_build_upload で削除してから再アップロードします。
4. apple_set_build_encryption → import 済みビルドの暗号化輸出コンプライアンスに回答
   (`true` の場合、App Store Connect で暗号化申告、裏付け書類、appEncryptionDeclaration の関連付けを手動で追加する必要があります。)
5. apple_assign_build → import 済みビルドをバージョンに紐付け
6. apple_update_review_detail と apple_get_age_rating → 審査メタデータを確認
7. apple_submit_for_review → App Review に申請
8. 初回バージョン以外の更新では、リリース前に 7 日間の段階的リリースを任意で設定します。
9. 承認後、PENDING_DEVELOPER_RELEASE のバージョンに限り apple_release_version でリリースし、設定した段階的リリースを確認・管理します。
```

### Androidアプリのリリース

```
1. google_create_edit → edit を開始（以前の edit を再開する場合は google_get_edit で確認）
2. google_list_bundles / google_list_apks → edit 内の既存 artifact を再利用できるか確認
3. google_upload_bundle / google_upload_apk → artifact がない場合だけアップロード
4. リスティングツールと google_update_data_safety → レビュー済みのストア変更を適用
5. google_create_release → 正確な versionCodes セットで対象トラックのリリースを作成
6. google_validate_edit → エラーを確認
7. google_commit_edit → Play で処理する変更を commit
8. google_list_release_statuses → commit 後の審査・公開状態を確認
```

Edit を commit しても即時の一般公開は保証されません。Google Play の審査、管理対象の公開、段階的ロールアウトの設定はそのまま適用されます。

### Google Playアプリ内商品の管理

```
1. google_list_iap → 全商品を一覧
2. google_create_iap → 新しい管理商品を作成
3. google_update_iap → 価格や説明を更新
4. google_delete_iap → 商品を削除
```

## ライセンス

MIT
