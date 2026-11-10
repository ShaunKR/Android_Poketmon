# 포켓몬 정원 작업 인계

기준일은 2026년 11월 11일입니다. 안드로이드 앱은 v1.4까지 구현했습니다.

## 다른 노트북에서 시작

Windows PowerShell에서 실행합니다. GitHub 비공개 저장소에 접근 가능한 계정으로 로그인하고 Android Studio, JDK 17 이상, Android SDK Platform 34를 준비합니다.

```powershell
git clone https://github.com/ShaunKR/Android_Poketmon.git
cd Android_Poketmon
powershell -ExecutionPolicy Bypass -File .\fetch-models.ps1
.\gradlew.bat assembleDebug
```

Android Studio에서 저장소 루트를 열어도 됩니다. APK는 `app/build/outputs/apk/debug/app-debug.apk`에 생성됩니다. USB 디버깅을 켠 패드에 `adb install -r app/build/outputs/apk/debug/app-debug.apk`로 설치할 수 있습니다. APK는 레드미패드 실기기에서 아직 검증하지 않았습니다.

## 구현된 기능

- 앱 시작 시 현진·현서가 표시되는 로딩 화면을 띄웁니다. 얼굴 사진은 첨부를 기다리고 있습니다.
- 메인에서 **색칠하기**를 누르면 캐릭터 선택 화면이 나옵니다. 피카츄·파이리·꼬부기·이상해씨·이브이가 기본 캐릭터입니다.
- 선택한 캐릭터는 고정된 정면 2D 선 도안으로 표시됩니다. 색과 붓 크기 선택, 되돌리기, 처음부터 지우기를 지원합니다. **내 정원에 저장**을 누르면 칠한 부분이 3D 모델에 반영됩니다.
- 상단 **설정하기**에서 사용자(현진·현서), 서버 URL과 전송 키, NAS 캐릭터 폴더 URL을 설정합니다.
- **캐릭터 설정 → 동기화**는 NAS 폴더의 `characters.json`과 GLB 파일을 내려받습니다. 패드 내부 저장소에 보관하므로 연결이 끊겨도 열고 색칠할 수 있습니다. 캐릭터를 두 번 누르거나 **모션 보기**를 누르면 GLB에 내장된 모션 이름을 확인할 수 있습니다.
- NAS 시험 서버는 기본 캐릭터의 모델 ID와 색칠 좌표를 받아 브라우저의 3D 정원에 표시합니다. 사용자가 제공할 백엔드의 API 사양은 아직 받지 않았습니다. NAS에서 동기화한 추가 캐릭터는 현재 패드의 내 정원에 저장할 수 있습니다.

## 파일 위치와 검증

| 경로 | 역할 |
|---|---|
| `app/src/main/assets/web/app.js` | 앱 화면 전환, 2D 색칠 입력, 로컬 정원과 브라우저 정원 |
| `app/src/main/assets/web/coloring-sheet.js` | GLB에서 정면 선 도안을 만들고 색칠 표시 |
| `app/src/main/java/com/familygarden/app/CharacterSync.java` | NAS 목록과 GLB 다운로드, 패드 내부 저장 |
| `app/src/main/java/com/familygarden/app/GardenUpload.java` | NAS 시험 서버로 색칠 데이터 전송 |
| `server/server.mjs` | Node.js 시험 서버와 웹 정원 |
| `README.md` | 빌드, NAS 실행, 동기화 목록 형식 |

PC에서 Android 빌드와 린트, APK 서명을 확인했습니다. 브라우저에서 색칠·되돌리기·저장·3D 반영과 동기화 후 목록 복원을 확인했습니다. Java 테스트에서 실제 HTTP 다운로드, 재동기화, 불완전한 파일 수신 시 기존 파일 보존을 확인했습니다.

기본 GLB는 다운로드 스크립트로 복원합니다. 별도로 확보한 `nas-teenieping-glb.zip`에는 하츄핑·다다핑·고고핑·로미 GLB와 동기화 목록이 들어 있습니다. 이 네 파일의 내장 모션은 0개입니다. `character-models-originals.zip`에는 티니핑과 엘사·안나·자스민 원본이 들어 있고, 디즈니 캐릭터의 GLB 변환은 남아 있습니다. 두 ZIP은 기존 노트북의 Codex 출력 폴더에 있으며 다른 노트북에서 필요하면 별도로 옮깁니다.

## 다음 작업과 보류된 아이디어

- 레드미패드에서 APK 설치, 2D 색칠, NAS 동기화, Wi-Fi를 끈 뒤 캐릭터·모션 목록 열기를 확인합니다. 얼굴 사진을 받으면 로딩 화면에 적용합니다.
- 새 백엔드 API 사양을 받으면 전송과 표시를 연동합니다.
- REDMI Smart Pen 버튼으로 펜·붓·지우개를 전환하는 기능은 검토 중입니다. 먼저 실기기에서 앱으로 들어오는 버튼 이벤트를 확인해야 합니다.
- Pi 3는 세로 FHD 전자앨범 전용으로 사용하기로 했습니다. 화면 구상은 상단 시간·날씨, 가운데 Pi의 로컬 사진 폴더, 하단 용도 미정이며 행 높이 비율은 약 1:8:1입니다. 전자앨범 화면은 설계 단계입니다.
- 사진 위에 색칠한 3D 캐릭터를 투명 배경으로 띄우는 기능은 추후 Pi 4에서 검토합니다. 표시 시간은 미정입니다. 모션 카메라와 자유 그림을 새 3D 모델로 변환하는 기능도 추후 검토 대상입니다.
