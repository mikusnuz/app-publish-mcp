[English](README.md) | **한국어** | [中文](README.zh.md) | [日本語](README.ja.md)

# app-publish-mcp

[![npm version](https://img.shields.io/npm/v/app-publish-mcp)](https://www.npmjs.com/package/app-publish-mcp)

**App Store Connect**와 **Google Play Console**을 위한 통합 [MCP (Model Context Protocol)](https://modelcontextprotocol.io) 서버입니다. AI 어시스턴트에서 앱 리스팅, 스크린샷, 릴리스, 리뷰, 제출을 관리할 수 있습니다.

## 기능

### Apple App Store Connect (29개 도구)
| 카테고리 | 도구 |
|----------|-------|
| 앱 관리 | `apple_list_apps`, `apple_get_app`, `apple_get_app_info`, `apple_update_category` |
| Bundle ID | `apple_list_bundle_ids`, `apple_create_bundle_id` |
| 버전 | `apple_list_versions`, `apple_create_version` |
| 버전 로컬라이제이션 | `apple_list_version_localizations`, `apple_create_version_localization`, `apple_update_version_localization` |
| 앱 정보 로컬라이제이션 | `apple_list_app_info_localizations`, `apple_update_app_info_localization` |
| 스크린샷 | `apple_list_screenshot_sets`, `apple_create_screenshot_set`, `apple_upload_screenshot`, `apple_delete_screenshot` |
| 빌드 | `apple_list_builds`, `apple_assign_build` |
| 연령 등급 | `apple_get_age_rating`, `apple_update_age_rating` |
| 리뷰 정보 | `apple_update_review_detail` |
| 제출 | `apple_submit_for_review`, `apple_cancel_submission` |
| 가격 | `apple_get_pricing`, `apple_set_price`, `apple_list_availability` |
| 고객 리뷰 | `apple_list_reviews`, `apple_respond_to_review` |

### Google Play Console (20개 도구)
| 카테고리 | 도구 |
|----------|-------|
| 편집 생명주기 | `google_create_edit`, `google_commit_edit`, `google_delete_edit` |
| 스토어 리스팅 | `google_list_listings`, `google_get_listing`, `google_update_listing` |
| 이미지 | `google_list_images`, `google_upload_image`, `google_delete_image`, `google_delete_all_images` |
| 트랙 & 릴리스 | `google_list_tracks`, `google_get_track`, `google_create_release`, `google_promote_release`, `google_halt_release` |
| Bundle / APK | `google_upload_bundle`, `google_upload_apk` |
| 리뷰 | `google_list_reviews`, `google_get_review`, `google_reply_to_review` |

## 설정

### 1. 설치

```bash
npm install
npm run build
```

### 2. Apple 자격증명

1. [App Store Connect > Keys](https://appstoreconnect.apple.com/access/integrations/api)로 이동합니다
2. **App Manager** 역할로 API Key를 생성합니다
3. `.p8` 파일을 다운로드합니다
4. **Key ID**와 **Issuer ID**를 확인합니다

### 3. Google 자격증명

1. [Google Cloud Console](https://console.cloud.google.com/)로 이동합니다
2. **Google Play Android Developer API**를 활성화합니다
3. **Service Account**를 생성하고 JSON 키를 다운로드합니다
4. Google Play Console에서 **설정 > API 액세스**에서 서비스 계정에 권한을 부여합니다

### 4. 환경 구성

```bash
cp .env.example .env
```

`.env` 파일을 편집합니다:
```
APPLE_KEY_ID=YOUR_KEY_ID
APPLE_ISSUER_ID=YOUR_ISSUER_ID
APPLE_P8_PATH=/path/to/AuthKey.p8
GOOGLE_SERVICE_ACCOUNT_PATH=/path/to/service-account.json
```

### 5. Claude Code에 추가

`~/.claude/settings.local.json`에 추가합니다:

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

## 사용 예제

### iOS 앱 업데이트 제출

```
1. apple_list_apps → 앱 ID 가져오기
2. apple_create_version → 버전 1.1.0 생성
3. apple_list_version_localizations → 로컬라이제이션 ID 가져오기
4. apple_update_version_localization → whatsNew, description 설정
5. apple_list_builds → 업로드된 빌드 찾기
6. apple_assign_build → 버전에 빌드 연결
7. apple_update_review_detail → 리뷰어 연락처 정보 설정
8. apple_submit_for_review → 제출!
```

### Android 앱 릴리스

```
1. google_create_edit → 편집 세션 시작
2. google_update_listing → 스토어 리스팅 업데이트
3. google_upload_bundle → .aab 파일 업로드
4. google_create_release → production 트랙에 릴리스 생성
5. google_commit_edit → 변경사항 게시
```

## 라이선스

MIT
