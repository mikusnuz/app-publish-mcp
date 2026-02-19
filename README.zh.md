[English](README.md) | [한국어](README.ko.md) | **中文** | [日本語](README.ja.md)

# app-publish-mcp

[![npm version](https://img.shields.io/npm/v/app-publish-mcp)](https://www.npmjs.com/package/app-publish-mcp)

统一的 [MCP（模型上下文协议）](https://modelcontextprotocol.io)服务器，支持 **App Store Connect** 和 **Google Play Console**。从 AI 助手管理应用列表、截图、发布、评论和提交。

## 功能特性

### Apple App Store Connect（29个工具）
| 类别 | 工具 |
|----------|-------|
| 应用管理 | `apple_list_apps`, `apple_get_app`, `apple_get_app_info`, `apple_update_category` |
| Bundle ID | `apple_list_bundle_ids`, `apple_create_bundle_id` |
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

### Google Play Console（20个工具）
| 类别 | 工具 |
|----------|-------|
| 编辑生命周期 | `google_create_edit`, `google_commit_edit`, `google_delete_edit` |
| 商店列表 | `google_list_listings`, `google_get_listing`, `google_update_listing` |
| 图片 | `google_list_images`, `google_upload_image`, `google_delete_image`, `google_delete_all_images` |
| 轨道和发布 | `google_list_tracks`, `google_get_track`, `google_create_release`, `google_promote_release`, `google_halt_release` |
| Bundle / APK | `google_upload_bundle`, `google_upload_apk` |
| 评论 | `google_list_reviews`, `google_get_review`, `google_reply_to_review` |

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
2. google_update_listing → 更新商店列表
3. google_upload_bundle → 上传 .aab 文件
4. google_create_release → 在生产轨道上创建发布
5. google_commit_edit → 发布更改
```

## 许可证

MIT
