# 포켓몬 정원

레드미패드에서 포켓몬을 색칠해 집 NAS의 웹 정원으로 보내는 앱입니다. 아이 두 명이 각자의 이름으로 그림을 보낼 수 있습니다. **내 정원에 저장**을 누르면 태블릿에 따로 저장됩니다.

1. 메인 화면 상단의 **설정하기**에서 현진 또는 현서를 고르고, 집 정원을 쓸 경우 NAS 주소와 전송 키를 저장합니다.
2. **색칠하기**를 누르고 포켓몬을 고릅니다. 고정된 정면 2D 도안을 손가락으로 색칠합니다. 도안에서 칠한 부분은 정원의 3D 모델 표면에 반영됩니다.
3. **전송하기**를 누릅니다. 별도 백엔드 연결은 API 사양을 받은 뒤 추가합니다.
4. 브라우저에서 웹 정원을 열면 최근 전송한 여섯 마리가 보여요. 포켓몬이 걷다가 쉬고 톡 누르면 기뻐합니다.

## 집 NAS에서 웹 정원 실행

### 캐릭터 폴더 동기화

NAS에서 같은 집 네트워크에 웹으로 공개한 폴더에 자체 포함형 GLB와 `characters.json`을 함께 둡니다. 예를 들어 `http://192.168.0.10/characters/` 아래에 `elsa.glb`와 다음 목록 파일을 둡니다.

```json
{
  "characters": [
    { "id": "elsa", "name": "엘사", "file": "elsa.glb" }
  ]
}
```

앱에서 **설정하기 → 서버 설정**의 NAS 캐릭터 폴더 주소를 지정한 뒤 **캐릭터 설정 → 동기화**를 누릅니다. 매번 NAS 목록과 전체 GLB를 다시 읽으며, 모두 내려받은 경우에만 캐릭터 목록을 바꿉니다. Android 내부 저장소에 파일을 보관하므로 NAS가 꺼져도 앱에서 색칠하거나 모션 목록을 확인할 수 있습니다. 목록에서 캐릭터를 두 번 누르거나 **모션 보기**를 누르면 GLB에 내장된 애니메이션 이름이 표시됩니다.

한 목록은 최대 50개, GLB 한 개는 최대 32 MiB, 전체는 최대 192 MiB입니다. 동기화한 캐릭터를 색칠한 결과는 패드의 **내 정원**에 저장할 수 있습니다. 동기화한 모델의 서버 전송은 별도 백엔드 API 연동이 필요합니다.

저장소를 NAS에 복사하거나 내려받은 뒤, 저장소 루트에서 `sh fetch-models.sh`를 실행합니다. Windows에서 `fetch-models.ps1`을 먼저 실행하고 모델 폴더까지 함께 복사해도 됩니다. NAS는 앱과 동일한 GLB 버전을 사용해야 색칠한 위치가 일치합니다.

**Node.js가 설치된 NAS**에서 실행하는 방법입니다. 전송 키는 직접 만든 16자 이상의 영문자·숫자·하이픈·밑줄 조합으로 바꿔 주세요.

```sh
GARDEN_KEY='replace-with-your-own-key' node server/server.mjs
```

Docker가 있다면 다음과 같이 실행할 수도 있습니다.

```sh
docker build -t pokemon-garden .
docker run -d --name pokemon-garden --restart unless-stopped \
  -p 8787:8787 -v pokemon-garden-data:/data \
  -e GARDEN_KEY='replace-with-your-own-key' pokemon-garden
```

| 어디에 | 입력할 값 예시 |
|---|---|
| 안드로이드 **설정하기** | `http://192.168.0.10:8787`와 같은 전송 키 |
| 브라우저에서 볼 정원 | `http://192.168.0.10:8787/garden` |

`192.168.0.10`을 실제 NAS 내부 IPv4 주소로 바꾸세요. 같은 집 와이파이에서 사용하고, 라우터에서 포트 포워딩을 하지 않습니다. 기존 웹페이지에서는 위 정원 주소를 링크하거나 같은 네트워크의 HTTP 페이지에 iframe으로 표시할 수 있습니다. HTTPS 페이지에 연결할 때는 링크를 쓰거나 정원 쪽에도 HTTPS 리버스 프록시를 설정합니다.

정원은 2초마다 전송 목록을 확인합니다. 앱은 GLB 대신 모델 ID와 색칠 좌표만 전송하며, 요청당 최대 256 KiB입니다. 웹 브라우저가 GLB를 받아 3D를 그립니다. 서버는 최근 전송 기록 24건을 파일에 저장하고 최근 6건을 정원에 보여 줍니다. Node.js 직접 실행 시 기본 저장 위치는 `garden-data/drawings.json`입니다.

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
