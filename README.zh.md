[English](README.md) | [한국어](README.ko.md) | **中文** | [日本語](README.ja.md)

# app-publish-mcp

[![npm version](https://img.shields.io/npm/v/app-publish-mcp)](https://www.npmjs.com/package/app-publish-mcp)

统一的 [MCP（模型上下文协议）](https://modelcontextprotocol.io)服务器，支持 **App Store Connect** 和 **Google Play Console**。从 AI 助手管理应用列表、截图、发布、评论和提交。

## 发布边界

用户需要提供已完成构建、正确签名且可供发布的 Android `.aab` / `.apk` 或 Apple `.ipa`。MCP 负责它所支持的商店端工作，从二进制文件上传到元数据、测试、审核提交和发布。它不会编译应用、保管签名密钥，也不会取代 Xcode、Gradle 或 CI。

新应用首次发布时，仍需要在 App Store Connect 或 Play Console 中手动完成开发者注册、协议、必要的应用记录、API 访问、签名、税务与银行信息，以及政策、隐私或内容声明。对于已完成配置的 Android 应用更新，通常只要有已签名的 AAB，MCP 就可以继续执行发布流程。Google edit commit 只是提交所请求的更改；商店审核、受管发布或分阶段发布都可能延迟公开上线。

## 功能特性

### Apple App Store Connect（86个工具）
| 类别 | 工具 |
|----------|-------|
| 应用管理 | `apple_list_apps`, `apple_get_next_page`, `apple_get_app`, `apple_update_app`, `apple_get_app_info`, `apple_update_category` |
| Bundle ID | `apple_list_bundle_ids`, `apple_create_bundle_id` |
| Bundle ID 功能 | `apple_list_bundle_id_capabilities`, `apple_enable_capability`, `apple_disable_capability` |
| 版本管理 | `apple_list_versions`, `apple_create_version`, `apple_update_version` |
| 版本本地化 | `apple_list_version_localizations`, `apple_create_version_localization`, `apple_update_version_localization` |
| 应用信息本地化 | `apple_list_app_info_localizations`, `apple_update_app_info_localization` |
| 截图 | `apple_list_screenshot_sets`, `apple_create_screenshot_set`, `apple_upload_screenshot`, `apple_delete_screenshot` |
| 构建版本 | `apple_list_builds`, `apple_get_build_upload`, `apple_wait_for_build_upload`, `apple_delete_build_upload`, `apple_upload_build`, `apple_set_build_encryption`, `apple_assign_build` |
| 年龄分级 | `apple_get_age_rating`, `apple_update_age_rating` |
| 审核信息 | `apple_update_review_detail` |
| 提交 | `apple_submit_for_review`, `apple_cancel_submission` |
| 发布 | `apple_release_version`, `apple_get_phased_release`, `apple_create_phased_release`, `apple_update_phased_release`, `apple_delete_phased_release` |
| 价格与可用性 | `apple_get_pricing`, `apple_list_app_price_points`, `apple_set_price`, `apple_list_availability`, `apple_create_availability`, `apple_update_territory_availability` |
| 用户评论 | `apple_list_reviews`, `apple_respond_to_review` |
| 证书 | `apple_list_certificates`, `apple_create_certificate`, `apple_revoke_certificate` |
| 描述文件 | `apple_list_profiles`, `apple_create_profile`, `apple_delete_profile` |
| 设备 | `apple_list_devices`, `apple_register_device`, `apple_update_device` |
| TestFlight 测试组 | `apple_list_beta_groups`, `apple_create_beta_group`, `apple_delete_beta_group`, `apple_add_beta_testers_to_group`, `apple_remove_beta_testers_from_group` |
| TestFlight 测试员 | `apple_list_beta_testers`, `apple_invite_beta_tester`, `apple_delete_beta_tester` |
| 应用内购买 | `apple_list_iap`, `apple_create_iap`, `apple_get_iap`, `apple_delete_iap` |
| 订阅组 | `apple_list_subscription_groups`, `apple_create_subscription_group`, `apple_delete_subscription_group` |
| 无障碍声明 | `apple_list_accessibility_declarations`, `apple_create_accessibility_declaration`, `apple_update_accessibility_declaration`, `apple_delete_accessibility_declaration` |
| 价格点 | `apple_get_subscription_price_points`, `apple_get_iap_price_points` |
| 优惠码 | `apple_list_subscription_offer_codes`, `apple_get_subscription_offer_code`, `apple_create_subscription_offer_code`, `apple_list_iap_offer_codes`, `apple_get_iap_offer_code`, `apple_create_iap_offer_code` |
| 挽回优惠 | `apple_list_win_back_offers`, `apple_get_win_back_offer` |

`apple_get_pricing` 会读取手动价格和自动价格的所有分页。`apple_set_price` 会提交完整的手动价格计划，因此请包含所有需要保留的当前及未来手动价格；遗漏的条目可能会从计划中移除。

Bundle ID、Capability、证书、配置文件和设备等 Apple provisioning 资源需要具有适当访问权限的 Team API Key。Individual API Key 可用于受支持的 App Store Connect 发布操作，但不能用于这些 provisioning 资源。TestFlight 内部测试员是 App Store Connect 团队成员，不是 Apple 员工。

### Google Play Console（49个工具）
| 类别 | 工具 |
|----------|-------|
| 编辑生命周期 | `google_create_edit`, `google_get_edit`, `google_commit_edit`, `google_validate_edit`, `google_delete_edit` |
| 应用详情 | `google_get_details`, `google_update_details` |
| 商店列表 | `google_list_listings`, `google_get_listing`, `google_update_listing`, `google_delete_listing` |
| 国家可用性 | `google_get_country_availability` |
| 测试员 | `google_get_testers`, `google_update_testers` |
| 图片 | `google_list_images`, `google_upload_image`, `google_delete_image`, `google_delete_all_images` |
| 轨道和发布 | `google_list_tracks`, `google_get_track`, `google_create_release`, `google_promote_release`, `google_halt_release`, `google_list_release_statuses` |
| Bundle / APK | `google_list_bundles`, `google_upload_bundle`, `google_list_apks`, `google_upload_apk` |
| Data Safety | `google_update_data_safety` |
| 评论 | `google_list_reviews`, `google_get_review`, `google_reply_to_review` |
| 应用内商品 | `google_list_iap`, `google_get_iap`, `google_create_iap`, `google_update_iap`, `google_delete_iap` |
| 订阅 | `google_list_subscriptions`, `google_get_subscription`, `google_create_subscription`, `google_activate_subscription_base_plan`, `google_deactivate_subscription_base_plan` |
| 一次性商品 | `google_list_one_time_products`, `google_get_one_time_product`, `google_create_one_time_product`, `google_update_one_time_product`, `google_delete_one_time_product`, `google_activate_purchase_option`, `google_deactivate_purchase_option` |

### 提示词 (2个)
| 提示词 | 描述 |
|--------|-------------|
| `app_release_checklist` | 从 iOS/Android 已签名 artifact 上传到审核、发布和上线状态检查的指导清单 |
| `app_store_optimization` | ASO 审计 — 分析当前列表元数据（标题、描述、关键词、截图、本地化）并提供可操作的改进建议 |

### 资源 (2个)
| URI | 描述 |
|-----|-------------|
| `app-publish://config` | 当前服务器配置 — 已连接的账户、认证方式、工具数量 |
| `app-publish://supported-platforms` | 按平台分组的所有支持工具及其描述 |

## 配置

### 1. 安装

```bash
npm install
npm run build
```

### 2. Apple 凭证

1. 前往 [App Store Connect > Keys](https://appstoreconnect.apple.com/access/integrations/api)
2. 创建一个具有 **App Manager** 角色的 API Key
3. 下载 `.p8` 文件
4. 记录 **Key ID** 和 Team Key 的 **Issuer ID**。Individual Key 请设置 `APPLE_KEY_TYPE=INDIVIDUAL` 并省略 Issuer ID。
5. Bundle ID、证书、配置文件、Capability 或设备工具需要具有适当访问权限的 Team API Key。

### 3. Google 凭证

启用 **Google Play Android Developer API**，然后选择一种认证方式：

- **Service Account：**在 [Google Cloud Console](https://console.cloud.google.com/) 中创建并下载 JSON 密钥，然后在 Play Console 的 **Users and permissions** 中邀请该服务账号邮箱并授予所需的应用权限。
- **OAuth：**创建 Desktop OAuth client，然后运行：

```bash
app-publish-mcp auth google --client-id=YOUR_ID --client-secret=YOUR_SECRET
```

OAuth 命令会将 refresh token 保存到 `~/.app-publish-mcp/google.json`，服务器会自动加载。也可以直接设置 `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET` 和 `GOOGLE_REFRESH_TOKEN`。

### 4. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`:
```
APPLE_KEY_ID=YOUR_KEY_ID
APPLE_KEY_TYPE=TEAM
APPLE_ISSUER_ID=YOUR_ISSUER_ID
APPLE_P8_PATH=/path/to/AuthKey.p8
GOOGLE_SERVICE_ACCOUNT_PATH=/path/to/service-account.json
```

服务器会自动加载 package/project 根目录中的 `.env`。Shell 或 MCP host 已提供的环境变量优先。OAuth 环境变量请参考 `.env.example`。

### 5. 添加到 Claude Code

在 `~/.claude/settings.local.json` 中添加：

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

## 使用示例

### 提交 iOS 应用更新

```
1. apple_list_apps → 确认应用 ID
2. apple_create_version / apple_update_version 和本地化工具 → 准备版本 1.1.0、发布设置和元数据
3. apple_upload_build → 上传已签名的 IPA 并等待 import 完成
   （使用 apple_get_build_upload / apple_wait_for_build_upload 恢复中断的操作）
   如果 commit 结果不明确的错误留下了 buildUploadId，请先用 apple_get_build_upload 检查；状态为 AWAITING_UPLOAD 或 FAILED 时，用 apple_delete_build_upload 清理后再重新上传。
4. apple_set_build_encryption → 回答已 import 构建的加密出口合规问题
   （如果为 `true`，可能仍需要在 App Store Connect 中手动补充加密声明、证明文件和 appEncryptionDeclaration 关联。）
5. apple_assign_build → 将已 import 的构建附加到版本
6. apple_update_review_detail 和 apple_get_age_rating → 确认审核元数据
7. apple_submit_for_review → 提交 App Review
8. 非首个版本的更新可在发布前选择设置七天分阶段发布。
9. 审核通过后，仅对 PENDING_DEVELOPER_RELEASE 版本使用 apple_release_version，然后查看或管理已设置的分阶段发布。
```

### 发布 Android 应用

```
1. google_create_edit → 启动 edit（恢复旧 edit 时先用 google_get_edit 确认）
2. google_list_bundles / google_list_apks → 检查是否可以复用 edit 中的现有 artifact
3. google_upload_bundle / google_upload_apk → 仅在缺少 artifact 时上传
4. 商店列表工具和 google_update_data_safety → 应用已审阅的商店更改
5. google_create_release → 使用精确的 versionCodes 集合创建目标轨道发布
6. google_validate_edit → 检查错误
7. google_commit_edit → 提交更改供 Play 处理
8. google_list_release_statuses → 查看 commit 后的审核和发布状态
```

提交 edit 不保证立即公开上线。Google Play 审核、受管发布和分阶段发布设置仍然适用。

### 管理 Google Play 应用内商品

```
1. google_list_iap → 列出所有商品
2. google_create_iap → 创建新的托管商品
3. google_update_iap → 更新价格或描述
4. google_delete_iap → 删除商品
```

## 许可证

MIT
