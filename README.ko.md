[English](README.md) | **한국어** | [中文](README.zh.md) | [日本語](README.ja.md)

# app-publish-mcp

[![npm version](https://img.shields.io/npm/v/app-publish-mcp)](https://www.npmjs.com/package/app-publish-mcp)

**App Store Connect**와 **Google Play Console**을 위한 통합 [MCP (Model Context Protocol)](https://modelcontextprotocol.io) 서버입니다. AI 어시스턴트에서 앱 리스팅, 스크린샷, 릴리스, 리뷰, 제출을 관리할 수 있습니다.

## 배포 범위

사용자가 릴리스 가능하게 빌드·서명한 Android `.aab` / `.apk` 또는 Apple `.ipa`를 준비합니다. MCP는 바이너리 업로드부터 메타데이터, 테스트, 심사 제출, 출시까지 스토어 쪽의 지원 작업을 처리합니다. 앱을 컴파일하거나 서명 키를 보관하지 않으며 Xcode, Gradle, CI를 대체하지 않습니다.

신규 앱의 첫 출시는 개발자 등록, 계약, 필요한 앱 레코드, API 접근, 서명, 세금·은행 정보, 정책·개인정보·콘텐츠 선언 등을 App Store Connect나 Play Console에서 먼저 설정해야 합니다. 이미 설정이 완료된 Android 앱의 업데이트라면 보통 서명된 AAB로 MCP 배포 흐름을 진행할 수 있습니다. Google edit commit은 변경사항을 확정할 뿐, 심사·관리 게시·단계적 배포에 따라 실제 공개는 늦어질 수 있습니다.

## 기능

### Apple App Store Connect (135개 도구)

| 카테고리 | 도구 |
|----------|-------|
| 앱 관리 | `apple_list_apps`, `apple_get_next_page`, `apple_get_app`, `apple_update_app`, `apple_get_app_info`, `apple_update_category` |
| Bundle ID | `apple_list_bundle_ids`, `apple_create_bundle_id` |
| Bundle ID 기능 | `apple_list_bundle_id_capabilities`, `apple_enable_capability`, `apple_disable_capability` |
| 버전 | `apple_list_versions`, `apple_create_version`, `apple_update_version` |
| 버전 로컬라이제이션 | `apple_list_version_localizations`, `apple_create_version_localization`, `apple_update_version_localization` |
| 앱 정보 로컬라이제이션 | `apple_list_app_info_localizations`, `apple_update_app_info_localization` |
| Asset Library | `apple_get_asset_library`, `apple_get_asset_specs`, `apple_list_assets`, `apple_get_asset`, `apple_wait_for_asset`, `apple_upload_asset`, `apple_list_asset_placements`, `apple_delete_asset` |
| Asset Placements | `apple_list_placements`, `apple_create_placement`, `apple_reorder_placements`, `apple_delete_placement` |
| 기존 스크린샷 (deprecated) | `apple_list_screenshot_sets`, `apple_create_screenshot_set`, `apple_upload_screenshot`, `apple_delete_screenshot` |
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
| 맞춤형 제품 페이지 | `apple_list_custom_product_pages`, `apple_get_custom_product_page`, `apple_create_custom_product_page`, `apple_update_custom_product_page`, `apple_delete_custom_product_page`, `apple_list_custom_product_page_versions`, `apple_create_custom_product_page_version`, `apple_update_custom_product_page_version`, `apple_list_custom_product_page_localizations`, `apple_create_custom_product_page_localization`, `apple_update_custom_product_page_localization`, `apple_delete_custom_product_page_localization` |
| 제품 페이지 최적화 | `apple_list_experiments`, `apple_get_experiment`, `apple_create_experiment`, `apple_update_experiment`, `apple_delete_experiment`, `apple_list_experiment_treatments`, `apple_create_experiment_treatment`, `apple_update_experiment_treatment`, `apple_delete_experiment_treatment`, `apple_list_treatment_localizations`, `apple_create_treatment_localization`, `apple_delete_treatment_localization` |
| 판매·재무 보고서 | `apple_get_sales_report`, `apple_get_finance_report` |
| App 분석 보고서 | `apple_list_analytics_report_requests`, `apple_create_analytics_report_request`, `apple_list_analytics_reports`, `apple_list_analytics_report_instances`, `apple_list_analytics_report_segments`, `apple_download_analytics_report` |
| 심사 제출 흐름 | `apple_list_review_submissions`, `apple_get_review_submission`, `apple_create_review_submission`, `apple_add_review_submission_item`, `apple_submit_review_submission` |

`apple_get_pricing`은 수동·자동 가격의 모든 페이지를 조회합니다. `apple_set_price`는 전체 수동 가격 일정을 제출하므로 유지해야 할 현재·향후 수동 가격 항목을 모두 포함하세요. 누락한 항목은 일정에서 제거될 수 있습니다.

Bundle ID, capability, certificate, profile, device 같은 Apple 프로비저닝 리소스는 적절한 권한의 Team API key가 필요합니다. Individual API key는 지원되는 App Store Connect 배포 작업에는 사용할 수 있지만 이 프로비저닝 리소스에는 사용할 수 없습니다. TestFlight 내부 테스터는 Apple 직원이 아니라 App Store Connect 팀 멤버입니다.

### Google Play Console (53개 도구)
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
| Android Vitals³ | `google_query_vitals`, `google_list_vitals_anomalies`, `google_search_vitals_error_issues`, `google_search_vitals_error_reports` |
| 일회성 상품 | `google_list_one_time_products`, `google_get_one_time_product`, `google_create_one_time_product`, `google_update_one_time_product`, `google_delete_one_time_product`, `google_activate_purchase_option`, `google_deactivate_purchase_option` |

³ Vitals는 [Play Developer Reporting API](https://developers.google.com/play/developer/reporting)를 사용합니다. 서비스 계정의 Cloud 프로젝트에서 API를 활성화하고 Play Console에서 **앱 정보 보기** 권한을 부여하세요. 이 스코프가 추가되기 전에 저장한 OAuth 토큰은 `app-publish-mcp auth google`로 다시 인증해야 합니다.

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

선택 사항:
```
APPLE_VENDOR_NUMBER=YOUR_VENDOR_NUMBER   # sales and finance reports
APPLE_REPORTS_KEY_ID=REPORTS_KEY_ID      # key for Sales/Finance/Analytics reports
APPLE_REPORTS_P8_PATH=/path/to/AuthKey_REPORTS.p8
APPLE_ADMIN_KEY_ID=ADMIN_KEY_ID          # analytics requests and finance/reporting fallback
APPLE_ADMIN_P8_PATH=/path/to/AuthKey_ADMIN.p8
APP_PUBLISH_READ_ONLY=true               # read tools only
```

`APP_PUBLISH_READ_ONLY`는 비어 있거나 `0`·`false`·`no`·`off`가 아닌 모든 값에서 켜집니다(fail closed). 읽기 전용 모드는 조회·자산 폴링·Google edit 검증만 허용하며 edit 생성·삭제는 제외합니다. 새 edit가 기존 배포 초안을 무효화할 수 있으므로, edit 기반 조회에는 사용자가 지정한 기존 editId를 전달하세요. `outputPath`를 받는 보고서 도구는 로컬 파일을 쓰지만 `overwrite=true` 없이는 기존 파일을 덮어쓰지 않습니다.

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

## 키와 역할

Apple은 API 키의 역할로 가능한 작업을 정합니다. 리스팅을 관리하는 키로는 보고서가 `403`이 되고, 보고서용 키로는 리스팅을 바꿀 수 없습니다. 자세한 내용은 [영어 README](README.md#keys-and-roles)를 참고하세요.

| 작업 | 가능한 역할 |
|------|-----------|
| 리스팅, 스크린샷·비주얼, 맞춤형 제품 페이지, A/B 테스트, 버전, 심사 제출, TestFlight, 가격 | App Manager, Admin |
| `apple_get_sales_report` | Sales and Reports, Finance, Admin (App Manager는 `403`) |
| `apple_get_finance_report` | Finance, Admin (Sales and Reports는 `403`) |
| App 분석 보고서 읽기 | Sales and Reports, Finance, Admin |
| `apple_create_analytics_report_request` | Admin만 가능 |

**한 서버에 여러 키:** 메인 키 외에 `APPLE_REPORTS_*`(판매·분석 보고서 읽기)와 `APPLE_ADMIN_*`(분석 보고서 요청 생성·삭제, 재무 보고서)를 설정할 수 있습니다. 키는 API별로 선택되며, 거부된 요청을 더 강한 키로 재시도하지 않습니다.

**상시 Admin 키 없이 분석 보고서 쓰기:** 메인 키는 App Manager, `APPLE_REPORTS_*`에 Sales and Reports 키 설정 → 임시 Admin 키를 `APPLE_ADMIN_*`에 설정하고 앱마다 `apple_create_analytics_report_request`(`ONGOING`)를 한 번 호출 → Admin 키를 폐기하고 `APPLE_ADMIN_*` 삭제. 보고서는 계속 생성되고 Sales and Reports 키로 읽을 수 있습니다.

| 응답 | 주요 원인 |
|------|---------|
| `401` | Key ID·Issuer ID·`.p8` 오류 또는 폐기된 키. 토큰 발급 시각에 60초 여유를 두지만 시스템 시계도 동기화하세요 |
| `403` | 키 역할로 허용되지 않는 작업. 위 표를 확인하세요 |
| 보고서에서 `404` | 해당 날짜·지역의 데이터 없음(무료 앱은 재무 보고서가 없음 등) |

## 안전하게 사용하기

실제 스토어 데이터를 바꾸는 도구가 많습니다. 특히 주의할 것: 심사 제출·출시(`apple_submit_for_review`, `apple_release_version`, `google_commit_edit`), `started=true`인 `apple_update_experiment`(실제 방문자에게 테스트 노출), 가격·배포 지역·인앱 상품, 리뷰 공개 답글, 되돌릴 수 없는 삭제(`apple_delete_*`, `google_delete_*`, `apple_revoke_certificate`).

- 모니터링·보고서용으로는 `APP_PUBLISH_READ_ONLY=true` 읽기 전용 서버를 따로 두세요.
- 키에는 필요한 최소 역할만 주고, 임시 Admin 키는 사용 후 폐기하세요.
- 맞춤형 제품 페이지와 제품 페이지 최적화의 쓰기 도구는 Apple OpenAPI 4.5.1 기준 테스트만 거쳤고 실제 계정에서는 아직 검증하지 않았습니다. 먼저 테스트용 앱에서 사용해 보세요.

## 사용 예제

### 자산·맞춤 페이지·제품 페이지 테스트 심사

`apple_create_review_submission`으로 초안을 만든 뒤 `apple_add_review_submission_item`에 자산, 맞춤 페이지 버전, v2 실험을 추가합니다. `apple_get_review_submission`으로 전체 항목을 확인하고 반환된 item ID들을 `apple_submit_review_submission`에 전달해야 심사가 시작됩니다. 생성·추가만으로 제출하지 않습니다. 첫 앱 출시는 앱 버전도 함께 제출해야 하며, 페이지·테스트·버전에 배치된 자산은 해당 항목과 함께 심사됩니다.

Google 리뷰 조회는 최근 7일간 작성·수정된 프로덕션 앱의 댓글 포함 리뷰만 제공합니다. 페이지네이션으로 이 기간을 늘릴 수 없으며 과거 기록은 Play Console CSV를 사용하세요. 빈 결과만으로 권한 문제를 단정할 수 없습니다.

보고서는 다운로드당 32 MiB, 압축 해제·병합 텍스트 64 MiB로 제한됩니다. Analytics의 MD5가 제공되면 검증하며 서명 URL은 오류에 노출하지 않습니다. 빌드 전송에는 지원되는 MD5를 사용하고 로컬 `expectedSha256` 검사는 유지합니다.

### Apple 스크린샷·미리보기 영상 업로드 및 배치

1. `apple_get_asset_library(appId)`로 라이브러리 ID를 얻고, `apple_get_asset_specs`로 현재 규격과 호환되는 placement type·group을 확인합니다. 기기 해상도나 group ID를 추측하지 마세요.
2. `apple_upload_asset`에 `assetLibraryId`, `mediaType` (`IMAGE` / `VIDEO`), `filePath`, `expectedSpecId`를 전달합니다. 공식 규격의 확장자·크기 확인, 분할 업로드, 완료 처리, 처리 상태 대기를 수행합니다. 영상은 `previewFrameTimeCode`도 지정할 수 있습니다.
3. 시간 초과·처리 실패 시 에셋 ID를 보존하고 `apple_get_asset` / `apple_wait_for_asset`로 상태를 확인하세요. 같은 파일을 무작정 다시 업로드하지 않습니다. `waitForProcessing=false`로 먼저 반환받아도 배치 전에는 준비 완료가 필요합니다.
4. `apple_create_placement`로 `localizationId`에 에셋을 연결하며 앞서 확인한 `placementType`·`placementGroup`을 지정합니다. `targetType` 기본값은 `appStoreVersionLocalizations`이며 맞춤 제품 페이지·실험 처리·앱 내 이벤트도 지원합니다. 같은 배치는 재사용합니다.
5. `apple_list_placements` 조회 후 원하는 순서로 해당 그룹의 **전체** placement ID를 `apple_reorder_placements`에 전달합니다. 앱 내 이벤트는 이 정렬 API를 지원하지 않습니다.
6. `apple_delete_placement`는 배치만 삭제합니다. `apple_list_asset_placements`로 사용처를 확인할 수 있고 `apple_delete_asset`는 사용 중인 에셋 삭제를 거부합니다.

Apple은 [App Store Connect API 4.5.1](https://developer.apple.com/documentation/appstoreconnectapi/app-store-connect-api-4-5-1-release-notes)에서 기존 스크린샷 API를 deprecated로 지정했지만 종료일은 발표하지 않았습니다. 기존 4개 도구는 호환성을 위해 유지하며, 새 작업에는 [Asset Library](https://developer.apple.com/documentation/appstoreconnectapi/migrating-to-the-app-asset-library)를 사용하세요. 한국 연령 등급 override에는 `ALL`·`TWELVE_PLUS`도 사용할 수 있습니다.

### 헤더·검색 결과 비주얼, 맞춤형 제품 페이지, A/B 테스트

제품 페이지 헤더와 검색 결과 비주얼은 Asset Library 배치(`PRODUCT_PAGE_HEADER_ASSET`, `APP_STORE_SEARCH_RESULTS_ASSET`)입니다. `apple_get_asset_specs(placementType=...)`로 사양을 고르고 `apple_upload_asset`으로 업로드한 뒤 `apple_create_placement`로 배치합니다. 같은 배치를 맞춤형 제품 페이지 로컬라이제이션과 테스트 처리(treatment)에도 사용할 수 있습니다.

### 스토어 분석

`apple_create_analytics_report_request`로 App 분석 보고서 생성을 시작합니다(첫 데이터는 1~2일 후). 이어서 `apple_list_analytics_reports` → `apple_list_analytics_report_instances` → `apple_download_analytics_report`. `apple_get_sales_report`는 일별 판매량과 수익을 반환합니다. Android에서는 `google_query_vitals`가 최근 28일의 비정상 종료율과 ANR 비율을 반환합니다.

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
