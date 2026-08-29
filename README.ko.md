[English](README.md) | **한국어** | [中文](README.zh.md) | [日本語](README.ja.md)

# app-publish-mcp

[![npm version](https://img.shields.io/npm/v/app-publish-mcp)](https://www.npmjs.com/package/app-publish-mcp)

**App Store Connect**와 **Google Play Console**을 위한 통합 [MCP (Model Context Protocol)](https://modelcontextprotocol.io) 서버입니다. AI 어시스턴트에서 앱 리스팅, 스크린샷, 릴리스, 리뷰, 제출을 관리할 수 있습니다.

## 배포 범위

사용자가 릴리스 가능하게 빌드·서명한 Android `.aab` / `.apk` 또는 Apple `.ipa`를 준비합니다. MCP는 바이너리 업로드부터 메타데이터, 테스트, 심사 제출, 출시까지 스토어 쪽의 지원 작업을 처리합니다. 앱을 컴파일하거나 서명 키를 보관하지 않으며 Xcode, Gradle, CI를 대체하지 않습니다.

신규 앱의 첫 출시는 개발자 등록, 계약, 필요한 앱 레코드, API 접근, 서명, 세금·은행 정보, 정책·개인정보·콘텐츠 선언 등을 App Store Connect나 Play Console에서 먼저 설정해야 합니다. 이미 설정이 완료된 Android 앱의 업데이트라면 보통 서명된 AAB로 MCP 배포 흐름을 진행할 수 있습니다. Google edit commit은 변경사항을 확정할 뿐, 심사·관리 게시·단계적 배포에 따라 실제 공개는 늦어질 수 있습니다.

## 기능

### Apple App Store Connect (86개 도구)
| 카테고리 | 도구 |
|----------|-------|
| 앱 관리 | `apple_list_apps`, `apple_get_next_page`, `apple_get_app`, `apple_update_app`, `apple_get_app_info`, `apple_update_category` |
| Bundle ID | `apple_list_bundle_ids`, `apple_create_bundle_id` |
| Bundle ID 기능 | `apple_list_bundle_id_capabilities`, `apple_enable_capability`, `apple_disable_capability` |
| 버전 | `apple_list_versions`, `apple_create_version`, `apple_update_version` |
| 버전 로컬라이제이션 | `apple_list_version_localizations`, `apple_create_version_localization`, `apple_update_version_localization` |
| 앱 정보 로컬라이제이션 | `apple_list_app_info_localizations`, `apple_update_app_info_localization` |
| 스크린샷 | `apple_list_screenshot_sets`, `apple_create_screenshot_set`, `apple_upload_screenshot`, `apple_delete_screenshot` |
| 빌드 | `apple_list_builds`, `apple_get_build_upload`, `apple_wait_for_build_upload`, `apple_delete_build_upload`, `apple_upload_build`, `apple_set_build_encryption`, `apple_assign_build` |
| 연령 등급 | `apple_get_age_rating`, `apple_update_age_rating` |
| 리뷰 정보 | `apple_update_review_detail` |
| 제출 | `apple_submit_for_review`, `apple_cancel_submission` |
| 출시 | `apple_release_version`, `apple_get_phased_release`, `apple_create_phased_release`, `apple_update_phased_release`, `apple_delete_phased_release` |
| 가격 및 가용성 | `apple_get_pricing`, `apple_list_app_price_points`, `apple_set_price`, `apple_list_availability`, `apple_create_availability`, `apple_update_territory_availability` |
| 고객 리뷰 | `apple_list_reviews`, `apple_respond_to_review` |
| 인증서 | `apple_list_certificates`, `apple_create_certificate`, `apple_revoke_certificate` |
| 프로비저닝 프로파일 | `apple_list_profiles`, `apple_create_profile`, `apple_delete_profile` |
| 디바이스 | `apple_list_devices`, `apple_register_device`, `apple_update_device` |
| TestFlight 베타 그룹 | `apple_list_beta_groups`, `apple_create_beta_group`, `apple_delete_beta_group`, `apple_add_beta_testers_to_group`, `apple_remove_beta_testers_from_group` |
| TestFlight 베타 테스터 | `apple_list_beta_testers`, `apple_invite_beta_tester`, `apple_delete_beta_tester` |
| 인앱 구매 | `apple_list_iap`, `apple_create_iap`, `apple_get_iap`, `apple_delete_iap` |
| 구독 그룹 | `apple_list_subscription_groups`, `apple_create_subscription_group`, `apple_delete_subscription_group` |
| 접근성 선언 | `apple_list_accessibility_declarations`, `apple_create_accessibility_declaration`, `apple_update_accessibility_declaration`, `apple_delete_accessibility_declaration` |
| 가격 포인트 | `apple_get_subscription_price_points`, `apple_get_iap_price_points` |
| 오퍼 코드 | `apple_list_subscription_offer_codes`, `apple_get_subscription_offer_code`, `apple_create_subscription_offer_code`, `apple_list_iap_offer_codes`, `apple_get_iap_offer_code`, `apple_create_iap_offer_code` |
| 윈백 오퍼 | `apple_list_win_back_offers`, `apple_get_win_back_offer` |

`apple_get_pricing`은 수동·자동 가격의 모든 페이지를 조회합니다. `apple_set_price`는 전체 수동 가격 일정을 제출하므로 유지해야 할 현재·향후 수동 가격 항목을 모두 포함하세요. 누락한 항목은 일정에서 제거될 수 있습니다.

Bundle ID, capability, certificate, profile, device 같은 Apple 프로비저닝 리소스는 적절한 권한의 Team API key가 필요합니다. Individual API key는 지원되는 App Store Connect 배포 작업에는 사용할 수 있지만 이 프로비저닝 리소스에는 사용할 수 없습니다. TestFlight 내부 테스터는 Apple 직원이 아니라 App Store Connect 팀 멤버입니다.

### Google Play Console (49개 도구)
| 카테고리 | 도구 |
|----------|-------|
| 편집 생명주기 | `google_create_edit`, `google_get_edit`, `google_commit_edit`, `google_validate_edit`, `google_delete_edit` |
| 앱 상세 정보 | `google_get_details`, `google_update_details` |
| 스토어 리스팅 | `google_list_listings`, `google_get_listing`, `google_update_listing`, `google_delete_listing` |
| 국가 가용성 | `google_get_country_availability` |
| 테스터 | `google_get_testers`, `google_update_testers` |
| 이미지 | `google_list_images`, `google_upload_image`, `google_delete_image`, `google_delete_all_images` |
| 트랙 & 릴리스 | `google_list_tracks`, `google_get_track`, `google_create_release`, `google_promote_release`, `google_halt_release`, `google_list_release_statuses` |
| Bundle / APK | `google_list_bundles`, `google_upload_bundle`, `google_list_apks`, `google_upload_apk` |
| Data Safety | `google_update_data_safety` |
| 리뷰 | `google_list_reviews`, `google_get_review`, `google_reply_to_review` |
| 인앱 상품 | `google_list_iap`, `google_get_iap`, `google_create_iap`, `google_update_iap`, `google_delete_iap` |
| 구독 | `google_list_subscriptions`, `google_get_subscription`, `google_create_subscription`, `google_activate_subscription_base_plan`, `google_deactivate_subscription_base_plan` |
| 일회성 상품 | `google_list_one_time_products`, `google_get_one_time_product`, `google_create_one_time_product`, `google_update_one_time_product`, `google_delete_one_time_product`, `google_activate_purchase_option`, `google_deactivate_purchase_option` |

### 프롬프트 (2개)
| 프롬프트 | 설명 |
|--------|-------------|
| `app_release_checklist` | iOS 및/또는 Android의 서명된 artifact 업로드부터 심사, 출시, 게시 상태 확인까지 안내하는 체크리스트 |
| `app_store_optimization` | 현재 리스팅 메타데이터(제목, 설명, 키워드, 스크린샷, 로컬라이제이션)를 분석하고 실행 가능한 개선 권장사항을 제공하는 ASO 감사 |

### 리소스 (2개)
| URI | 설명 |
|-----|-------------|
| `app-publish://config` | 현재 서버 구성 — 연결된 계정, 인증 방식, 도구 수 |
| `app-publish://supported-platforms` | 플랫폼별로 그룹화된 모든 지원 도구와 설명 |

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
4. **Key ID**와 Team key의 **Issuer ID**를 확인합니다. Individual key는 `APPLE_KEY_TYPE=INDIVIDUAL`로 설정하고 Issuer ID를 생략합니다.
5. Bundle ID, 인증서, 프로파일, capability, device 도구는 적절한 권한의 Team API key를 사용합니다.

### 3. Google 자격증명

**Google Play Android Developer API**를 활성화한 다음 두 인증 방식 중 하나를 선택합니다.

- **Service account:** [Google Cloud Console](https://console.cloud.google.com/)에서 생성하고 JSON 키를 다운로드한 뒤, Play Console의 **사용자 및 권한(Users and permissions)**에서 서비스 계정 이메일을 초대하고 필요한 앱 권한을 부여합니다.
- **OAuth:** Desktop OAuth client를 생성한 뒤 다음을 실행합니다.

```bash
app-publish-mcp auth google --client-id=YOUR_ID --client-secret=YOUR_SECRET
```

OAuth 명령은 refresh token을 `~/.app-publish-mcp/google.json`에 저장하고 서버가 자동으로 불러옵니다. 대신 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`을 직접 설정해도 됩니다.

### 4. 환경 구성

```bash
cp .env.example .env
```

`.env` 파일을 편집합니다:
```
APPLE_KEY_ID=YOUR_KEY_ID
APPLE_KEY_TYPE=TEAM
APPLE_ISSUER_ID=YOUR_ISSUER_ID
APPLE_P8_PATH=/path/to/AuthKey.p8
GOOGLE_SERVICE_ACCOUNT_PATH=/path/to/service-account.json
```

서버는 패키지/프로젝트 루트의 `.env`를 자동으로 불러옵니다. 쉘이나 MCP 호스트가 전달한 환경변수가 우선합니다. OAuth 환경변수는 `.env.example`을 참고하세요.

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
        "APPLE_KEY_TYPE": "TEAM",
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
1. apple_list_apps → 앱 ID 확인
2. apple_create_version / apple_update_version과 로컬라이제이션 도구 → 버전 1.1.0, 출시 설정, 메타데이터 준비
3. apple_upload_build → 서명된 IPA 업로드 및 import 완료 대기
   (중단된 작업은 apple_get_build_upload / apple_wait_for_build_upload로 재개)
   모호한 commit 오류로 buildUploadId가 남으면 apple_get_build_upload로 확인하고, 상태가 AWAITING_UPLOAD 또는 FAILED일 때 apple_delete_build_upload로 정리한 뒤 다시 업로드합니다.
4. apple_set_build_encryption → import된 빌드의 암호화 수출 준수 질문에 답변
   (`true`인 경우 App Store Connect에서 암호화 선언·증빙 서류와 appEncryptionDeclaration 연결을 수동으로 추가 처리해야 할 수 있습니다.)
5. apple_assign_build → import된 빌드를 버전에 연결
6. apple_update_review_detail과 apple_get_age_rating → 심사 메타데이터 확인
7. apple_submit_for_review → App Review 제출
8. 첫 버전이 아닌 업데이트는 출시 전 선택적으로 7일 단계적 배포를 설정합니다.
9. 승인 후 PENDING_DEVELOPER_RELEASE인 버전만 apple_release_version으로 출시하고, 설정한 단계적 배포를 조회·관리합니다.
```

### Android 앱 릴리스

```
1. google_create_edit → edit 시작(이전 edit 재개 시 google_get_edit로 확인)
2. google_list_bundles / google_list_apks → edit에 이미 있는 artifact를 재사용할 수 있는지 확인
3. google_upload_bundle / google_upload_apk → artifact가 없을 때만 업로드
4. 리스팅 도구와 google_update_data_safety → 검토한 스토어 변경사항 적용
5. google_create_release → 정확한 versionCodes 집합으로 대상 트랙 릴리스 생성
6. google_validate_edit → 오류 확인
7. google_commit_edit → Play 처리를 위해 변경사항 확정
8. google_list_release_statuses → commit 후 심사·게시 상태 확인
```

Edit commit은 즉시 공개를 보장하지 않습니다. Google Play 심사, 관리 게시, 단계적 배포 설정은 그대로 적용됩니다.

### Google Play 인앱 상품 관리

```
1. google_list_iap → 전체 상품 목록
2. google_create_iap → 새 관리형 상품 생성
3. google_update_iap → 가격 또는 설명 업데이트
4. google_delete_iap → 상품 삭제
```

## 라이선스

MIT
