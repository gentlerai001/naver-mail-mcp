# 직접 연결하기 (수동 설정)

설치 마법사(`setup.cmd` / `sh setup.sh` / `npm run setup`)를 쓰지 않고 손으로 설정하는 방법입니다.
마법사가 하는 일을 그대로 풀어 쓴 것이므로, 마법사가 성공했다면 이 문서는 필요 없습니다.

## 마법사가 하는 일

| 순서 | 내용 | 결과 |
| --- | --- | --- |
| 1 | `npm ci` + `npm run build` | `dist/index.js` 생성 |
| 2 | 계정 입력 | `~/.naver-mail-mcp/.env` 저장 (권한 600) |
| 3 | `~/.naver-mail-mcp/config.json` 에 `.env` 경로 기록 | Codex 플러그인 방식과 호환 |
| 4 | IMAP·SMTP 로그인 테스트 | 실패하면 원인 안내 |
| 5 | 설치된 앱 감지 후 등록 | Codex `config.toml`, Claude Desktop `claude_desktop_config.json`, Claude Code 사용자 설정 |

`~`는 Windows에서 `C:\Users\내이름`, macOS에서 `/Users/내이름` 입니다.

## 1. 빌드

Node.js 22 이상이 필요합니다.

```sh
git clone https://github.com/gentlerai001/naver-mail-mcp.git
cd naver-mail-mcp
npm ci
npm run build
```

Windows PowerShell에서 `npm.ps1` 실행 정책 오류가 나면 `npm` 대신 `npm.cmd` 를 사용하세요.

## 2. 계정 파일

`~/.naver-mail-mcp/.env` 를 만듭니다. (프로젝트 폴더의 `.env.example` 을 복사해도 됩니다)

```dotenv
NAVER_EMAIL=your-id@naver.com
NAVER_APP_PASSWORD=애플리케이션-비밀번호
NAVER_SENDER_NAME="보내는 이름"
NAVER_ENABLE_SEND=true
NAVER_ATTACHMENT_DIR=
```

| 설정 | 설명 |
| --- | --- |
| `NAVER_EMAIL` | 필수. `@naver.com` 주소 |
| `NAVER_APP_PASSWORD` | 필수. 네이버 애플리케이션 비밀번호 (로그인 비밀번호 아님) |
| `NAVER_SENDER_NAME` | 선택. 발신자 표시 이름. `#` 이 들어가면 따옴표로 감싸기 |
| `NAVER_ENABLE_SEND` | 기본 `true`. `false` 면 `send_email` 도구를 노출하지 않음 (읽기 전용) |
| `NAVER_ATTACHMENT_DIR` | 선택. 첨부파일 전용 폴더의 절대 경로. 비우면 `.env` 옆 `attachments/` |

macOS/Linux 에서는 `chmod 600 ~/.naver-mail-mcp/.env` 로 권한을 제한하세요.

서버는 `NAVER_ENV_FILE` 환경변수가 가리키는 파일을 읽습니다. 현재 폴더의 `.env` 를 자동으로 찾지 않습니다.
같은 이름의 환경변수(`NAVER_EMAIL` 등)가 있으면 파일보다 우선합니다.

## 3. 앱에 연결

아래 예시의 경로는 본인 환경에 맞게 바꾸세요. `node` 를 못 찾는 문제를 피하려면 `command` 에 Node 실행 파일의 절대 경로를 쓰는 편이 안전합니다.
(Windows 기본값 `C:\Program Files\nodejs\node.exe`, macOS Homebrew `/opt/homebrew/bin/node`)

### Codex (앱·CLI 공통)

CLI 한 줄:

```sh
codex mcp add naver-mail --env NAVER_ENV_FILE=/Users/me/.naver-mail-mcp/.env -- node /Users/me/naver-mail-mcp/dist/index.js
```

또는 `~/.codex/config.toml` 에 추가:

```toml
[mcp_servers.naver-mail]
command = "node"
args = ["/Users/me/naver-mail-mcp/dist/index.js"]
startup_timeout_sec = 20
tool_timeout_sec = 120

[mcp_servers.naver-mail.env]
NAVER_ENV_FILE = "/Users/me/.naver-mail-mcp/.env"
```

Codex를 새로 시작하고 **새 대화**를 열면 도구가 보입니다.
[공식 Codex MCP 안내](https://developers.openai.com/codex/mcp/)

### Claude Desktop

**Settings → Developer → Edit Config** 로 `claude_desktop_config.json` 을 열어 `mcpServers` 안에 합칩니다.

```json
{
  "mcpServers": {
    "naver-mail": {
      "command": "node",
      "args": ["C:/Users/me/naver-mail-mcp/dist/index.js"],
      "env": { "NAVER_ENV_FILE": "C:/Users/me/.naver-mail-mcp/.env" }
    }
  }
}
```

파일 위치: Windows `%APPDATA%\Claude\claude_desktop_config.json`, macOS `~/Library/Application Support/Claude/claude_desktop_config.json`.
Claude Desktop을 완전히 종료한 뒤 다시 실행합니다.
[공식 로컬 MCP 연결 안내](https://modelcontextprotocol.io/docs/develop/connect-local-servers)

### Claude Code

```sh
claude mcp add naver-mail -s user -e NAVER_ENV_FILE=/Users/me/.naver-mail-mcp/.env -- node /Users/me/naver-mail-mcp/dist/index.js
claude mcp get naver-mail
```

### 복사용 예시 파일

[`examples/`](../examples/) 폴더에 Codex·Claude Desktop 설정 예시가 있습니다. 비밀번호는 예시 파일에 적지 말고 `.env` 에만 두세요.

## 4. 플러그인 형태로 쓰기 (Codex · Claude)

이 저장소는 Codex 와 Claude Code 양쪽의 마켓플레이스입니다. 루트의 `.agents/plugins/marketplace.json`(Codex)과
`.claude-plugin/marketplace.json`(Claude)이 같은 `./plugin` 폴더를 가리킵니다. 플러그인 폴더 안에는
`.codex-plugin/plugin.json` + `.codex-mcp.json`(Codex 용)과 `.claude-plugin/plugin.json`(Claude 용, MCP 설정 내장)이 함께 있고,
`plugin/server/index.js` 는 실행 의존성을 모두 담은 단일 번들이라 사용자 PC 에서 npm 설치가 필요 없습니다.

### Claude Code / Claude 데스크톱 앱

```text
/plugin marketplace add gentlerai001/naver-mail-mcp
/plugin install naver-mail-mcp@gentler
```

설치 시 `userConfig` 로 네이버 주소와 앱 비밀번호를 물어보며, 비밀번호는 `sensitive` 로 표시되어 안전한 저장소에 들어갑니다.
값은 MCP 서버의 `NAVER_EMAIL`·`NAVER_APP_PASSWORD` 환경변수로 전달됩니다. 비워 두면 서버가 `~/.naver-mail-mcp/.env` 를 찾고,
없으면 `setup_naver_mail` 브라우저 설정 창으로 안내합니다. 나중에 바꾸려면 `/plugin configure naver-mail-mcp@gentler`.
검증: `claude plugin validate .` 와 `claude plugin validate ./plugin`.

### Codex

```sh
codex plugin marketplace add gentlerai001/naver-mail-mcp   # 또는 로컬 클론 경로
codex plugin add naver-mail-mcp@gentler
```

일반 MCP 등록과 **둘 중 하나만** 쓰세요. 둘 다 켜면 도구가 두 번 보입니다.

- 계정은 설치 후 채팅에서 "네이버 메일 설정해 줘"로 여는 브라우저 설정 창에서 입력합니다. `setup_naver_mail` 도구가 127.0.0.1 에 임시 페이지를 띄우고, 로그인 확인 후 `~/.naver-mail-mcp/.env` 에 저장합니다.
- 설정 위치를 바꾸려면 `~/.naver-mail-mcp/config.json` 에 `{"envFile":"절대경로"}` 를 적습니다.
- 소스를 바꾸면 `npm run build:bundle` 로 번들을 다시 만들어 커밋하세요. CI 가 번들과 소스의 일치를 검사합니다.
- 개인 마켓플레이스(`~/plugins/naver-mail-mcp`)로 쓰려면 `npm run build:plugin` 후 `npm run register:plugin` 을 실행합니다.
- 제거: `codex plugin remove naver-mail-mcp@gentler`
- 이 패키지는 Claude Desktop 확장 파일로는 쓸 수 없습니다.

[Codex 플러그인 패키징·배포 안내](https://developers.openai.com/plugins/build/plugins)

## 5. 수동 실행으로 확인

```powershell
$env:NAVER_ENV_FILE = 'C:/Users/me/.naver-mail-mcp/.env'
npm.cmd start
```

stdio 입력을 기다리므로 화면에 아무것도 나오지 않는 것이 정상입니다. 설정이 잘못되면 한 줄짜리 오류만 출력하고 종료합니다.

## 문제 해결

| 증상 | 확인할 내용 |
| --- | --- |
| `Missing or invalid configuration` | `.env` 의 주소·앱 비밀번호, `NAVER_ENV_FILE` 절대 경로 |
| `Cannot read NAVER_ENV_FILE` | 파일 존재 여부와 OS 접근 권한 |
| 인증 실패 | IMAP/SMTP 사용함, 2단계 인증, 애플리케이션 비밀번호 |
| 앱에 도구가 없음 | 빌드 완료, 절대 경로, Node 경로, 앱 완전 재시작 |
| 도구가 두 번 보임 | Codex 플러그인과 일반 MCP 등록이 동시에 켜짐. 하나만 남기기 |
