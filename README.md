# 포켓몬 정원

레드미패드 한 대를 아이 두 명이 함께 쓰는 오프라인 3D 색칠 앱입니다. 사용자 계정이나 서버 없이 두 아이가 같은 정원을 사용합니다. 완성한 그림은 태블릿의 앱 데이터에 저장됩니다.

1. 만든 사람과 포켓몬을 고릅니다.
2. 손가락으로 3D 모델에 칠합니다. 반대쪽을 칠하려면 **돌려보기**로 전환한 뒤 다시 **색칠**을 누릅니다.
3. **완성 · 정원에 보내기**를 누르면 정원에 등장합니다. 정원에는 최근 완성한 여섯 마리가 보이며, 포켓몬이 걷다가 쉬고 톡 누르면 기뻐합니다.

## 빌드

Android Studio 또는 JDK 17 이상과 Android SDK Platform 34를 준비합니다. 앱은 Android 8.0 이상을 대상으로 하며, 3D 화면에는 WebGL 2와 import maps를 지원하는 최신 Android System WebView가 필요합니다.

Windows PowerShell에서 저장소 루트 기준으로 실행합니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\fetch-models.ps1
.\gradlew.bat assembleDebug
```

Android Studio에서는 먼저 모델을 다운로드한 뒤 프로젝트를 열고 Run을 선택해도 됩니다. 빌드 결과는 `app/build/outputs/apk/debug/app-debug.apk`에 생성됩니다. USB 디버깅을 켜고 연결한 태블릿에는 다음과 같이 설치할 수 있습니다.

```powershell
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## 에셋

포켓몬 GLB는 저장소에서 제외했습니다. 다운로드 스크립트는 [06wj/pokemon의 고정 리비전](https://github.com/06wj/pokemon/tree/00d96f7f18894055e7f1db44fa0df6462e5e4c8a)에서 각 파일을 받습니다. 해당 프로젝트는 포켓몬 캐릭터 및 관련 에셋의 사용 권한을 부여하지 않습니다. [에셋 안내](https://github.com/06wj/pokemon#asset-credits)

렌더러는 오프라인 실행을 위해 Three.js 0.179.1을 포함합니다. [Three.js 라이선스](app/src/main/assets/web/vendor/LICENSE)
