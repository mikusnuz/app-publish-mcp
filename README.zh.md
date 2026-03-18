[English](README.md) | [한국어](README.ko.md) | **中文** | [日本語](README.ja.md)

# app-publish-mcp

[![npm version](https://img.shields.io/npm/v/app-publish-mcp)](https://www.npmjs.com/package/app-publish-mcp)

统一的 [MCP（模型上下文协议）](https://modelcontextprotocol.io)服务器，支持 **App Store Connect** 和 **Google Play Console**。从 AI 助手管理应用列表、截图、发布、评论和提交。

## 功能特性

### Apple App Store Connect（56个工具）
| 类别 | 工具 |
|----------|-------|
| 应用管理 | `apple_list_apps`, `apple_get_app`, `apple_get_app_info`, `apple_update_category` |
| Bundle ID | `apple_list_bundle_ids`, `apple_create_bundle_id` |
| Bundle ID 功能 | `apple_list_bundle_id_capabilities`, `apple_enable_capability`, `apple_disable_capability` |
| 版本管理 | `apple_list_versions`, `apple_create_version` |
| 版本本地化 | `apple_list_version_localizations`, `apple_create_version_localization`, `apple_update_version_localization` |
| 应用信息本地化 | `apple_list_app_info_localizations`, `apple_update_app_info_localization` |
| 截图 | `apple_list_screenshot_sets`, `apple_create_screenshot_set`, `apple_upload_screenshot`, `apple_delete_screenshot` |
| 构建版本 | `apple_list_builds`, `apple_assign_build` |
| 年龄分级 | `apple_get_age_rating`, `apple_update_age_rating` |
| 审核信息 | `apple_update_review_detail` |
| 提交 | `apple_submit_for_review`, `apple_cancel_submission` |
| 价格 | `apple_get_pricing`, `apple_set_price`, `apple_list_availability` |
| 用户评论 | `apple_list_reviews`, `apple_respond_to_review` |
| 证书 | `apple_list_certificates`, `apple_create_certificate`, `apple_revoke_certificate` |
| 描述文件 | `apple_list_profiles`, `apple_create_profile`, `apple_delete_profile` |
| 设备 | `apple_list_devices`, `apple_register_device`, `apple_update_device` |
| TestFlight 测试组 | `apple_list_beta_groups`, `apple_create_beta_group`, `apple_delete_beta_group`, `apple_add_beta_testers_to_group`, `apple_remove_beta_testers_from_group` |
| TestFlight 测试员 | `apple_list_beta_testers`, `apple_invite_beta_tester`, `apple_delete_beta_tester` |
| 应用内购买 | `apple_list_iap`, `apple_create_iap`, `apple_get_iap`, `apple_delete_iap` |
| 订阅组 | `apple_list_subscription_groups`, `apple_create_subscription_group`, `apple_delete_subscription_group` |

### Google Play Console（35个工具）
| 类别 | 工具 |
|----------|-------|
| 编辑生命周期 | `google_create_edit`, `google_commit_edit`, `google_validate_edit`, `google_delete_edit` |
| 应用详情 | `google_get_details`, `google_update_details` |
| 商店列表 | `google_list_listings`, `google_get_listing`, `google_update_listing`, `google_delete_listing` |
| 国家可用性 | `google_get_country_availability` |
| 测试员 | `google_get_testers`, `google_update_testers` |
| 图片 | `google_list_images`, `google_upload_image`, `google_delete_image`, `google_delete_all_images` |
| 轨道和发布 | `google_list_tracks`, `google_get_track`, `google_create_release`, `google_promote_release`, `google_halt_release` |
| Bundle / APK | `google_upload_bundle`, `google_upload_apk` |
| 评论 | `google_list_reviews`, `google_get_review`, `google_reply_to_review` |
| 应用内商品 | `google_list_iap`, `google_get_iap`, `google_create_iap`, `google_update_iap`, `google_delete_iap` |
| 订阅 | `google_list_subscriptions`, `google_get_subscription`, `google_archive_subscription` |

### 提示词 (2个)
| 提示词 | 描述 |
|--------|-------------|
| `app_release_checklist` | 应用更新发布指导清单 — 逐步引导 iOS 和/或 Android 的版本创建、元数据、构建分配和提交 |
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
4. 记录 **Key ID** 和 **Issuer ID**

### 3. Google 凭证

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 启用 **Google Play Android Developer API**
3. 创建一个 **Service Account** 并下载 JSON 密钥
4. 在 Google Play Console 中，前往 **Settings > API access** 授予服务账号访问权限

### 4. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`:
```
APPLE_KEY_ID=YOUR_KEY_ID
APPLE_ISSUER_ID=YOUR_ISSUER_ID
APPLE_P8_PATH=/path/to/AuthKey.p8
GOOGLE_SERVICE_ACCOUNT_PATH=/path/to/service-account.json
```

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
1. apple_list_apps → 获取应用 ID
2. apple_create_version → 创建版本 1.1.0
3. apple_list_version_localizations → 获取本地化 ID
4. apple_update_version_localization → 设置 whatsNew、description
5. apple_list_builds → 查找已上传的构建版本
6. apple_assign_build → 将构建版本附加到版本
7. apple_update_review_detail → 设置审核联系信息
8. apple_submit_for_review → 提交！
```

### 发布 Android 应用

```
1. google_create_edit → 启动编辑会话
2. google_update_details → 更新联系信息
3. google_update_listing → 更新商店列表
4. google_upload_bundle → 上传 .aab 文件
5. google_create_release → 在生产轨道上创建发布
6. google_validate_edit → 检查错误
7. google_commit_edit → 发布更改
```

### 管理 Google Play 应用内商品

```
1. google_list_iap → 列出所有商品
2. google_create_iap → 创建新的托管商品
3. google_update_iap → 更新价格或描述
4. google_delete_iap → 删除商品
```

## 许可证

MIT
