# NAVER Mail MCP

네이버 메일을 **Codex와 Claude Desktop에서 조회·검색·읽기·발송**하는 로컬 MCP 서버입니다.
TypeScript / Node.js 기반이며 네이버의 IMAP·SMTP와 MCP `stdio`를 사용합니다.

> 개인이 만든 비공식 프로젝트입니다. NAVER, OpenAI, Anthropic과 제휴 관계가 없습니다.
> 초기 버전: 자동 테스트는 통과했으며, 실제 네이버 계정 연동과 앱 UI에서의 확인은 별도로 필요합니다.

```text
Codex / Claude Desktop
        │ stdio (local process)
        ▼
  NAVER Mail MCP
        ├── IMAP · TLS · imap.naver.com:993
        └── SMTP · STARTTLS · smtp.naver.com:587
```

## 기능

| 도구 | 기능 |
| --- | --- |
| `list_mailboxes` | 받은메일함 등 실제 메일함 경로 조회 |
| `search_emails` | 발신자·수신자·제목·본문·수신일·안 읽은 메일 검색, 페이지 이동 |
| `get_email` | 한글 MIME 본문 해석, HTML을 텍스트로 변환, 첨부파일 정보 조회 |
| `send_email` | 일반 텍스트 발송, 참조·숨은참조, 답장 헤더, 발송 미리보기 |
| `verify_connection` | 메일 발송 없이 IMAP 로그인과 SMTP 인증 확인 |

조회는 읽음 상태를 바꾸지 않습니다. 발신 주소는 설정한 네이버 계정으로 고정됩니다.
별도 AI API 키는 필요하지 않습니다. 연결한 AI 앱의 이용 조건은 별개입니다.

## 1. 네이버 계정 준비

1. PC 네이버 메일에서 **환경설정 → POP3/IMAP 설정 → IMAP/SMTP 설정 → 사용함**을 선택합니다.
2. 네이버 계정의 **2단계 인증**을 설정합니다.
3. **네이버ID → 보안설정 → 2단계 인증 → 관리 → 애플리케이션 비밀번호**에서 전용 비밀번호를 생성합니다.

일반 로그인 비밀번호 대신 애플리케이션 비밀번호를 사용해야 합니다.
[IMAP 설정 안내](https://help.naver.com/service/30029/contents/21344?osType=COMMONOS) · [앱 비밀번호 안내](https://help.naver.com/service/5640/contents/8584?lang=ko&osType=PC)

## 2. 설치

Node.js **22 이상**과 Git이 필요합니다. 저장소를 클론하거나 ZIP을 풀고 프로젝트 폴더에서 실행하세요.

```sh
npm ci
npm run build
```

Windows PowerShell에서 `npm.ps1` 실행 정책 오류가 나면 `npm` 대신 `npm.cmd`를 사용하세요.

Windows:

```powershell
Copy-Item .env.example .env
notepad .env
```

macOS / Linux:

```sh
cp .env.example .env
chmod 600 .env
```

`.env`를 본인 계정 정보로 수정합니다. 실제 비밀번호를 채팅, 이슈, 커밋에 붙여 넣지 마세요.

```dotenv
NAVER_EMAIL=your-id@naver.com
NAVER_APP_PASSWORD=replace-with-application-password
NAVER_SENDER_NAME="보내는 이름"
NAVER_ENABLE_SEND=true
```

서버는 `NAVER_ENV_FILE`로 지정한 파일을 읽습니다. 현재 작업 폴더의 `.env`를 자동으로 찾지 않으므로 앱이 다른 폴더에서 실행해도 설정이 일관됩니다. 같은 이름의 환경변수가 있으면 파일 값보다 우선합니다.

| 설정 | 설명 |
| --- | --- |
| `NAVER_ENV_FILE` | `.env` 절대 경로. 생략하면 환경변수만 사용 |
| `NAVER_EMAIL` | 필수. `@naver.com` 메일 주소 |
| `NAVER_APP_PASSWORD` | 필수. 네이버 애플리케이션 비밀번호 |
| `NAVER_SENDER_NAME` | 선택. 발신자 표시 이름 |
| `NAVER_ENABLE_SEND` | 기본 `true`. `false`이면 발송 도구를 노출하지 않음 |

## 3. Codex 연결

실제 설치 폴더의 절대 경로를 사용합니다. 아래는 Windows의 `C:/projects/naver-mail-mcp`에 설치한 예시입니다.

```sh
codex mcp add naver-mail --env NAVER_ENV_FILE=C:/projects/naver-mail-mcp/.env -- node C:/projects/naver-mail-mcp/dist/index.js
```

또는 Codex 설정 파일에 아래 항목을 추가합니다. 일반적인 위치는 `~/.codex/config.toml`이며, 별도 `CODEX_HOME`을 설정했다면 해당 폴더의 설정 파일을 사용합니다. 기존 설정을 통째로 덮어쓰지 마세요.

```toml
[mcp_servers.naver-mail]
command = "node"
args = ["C:/projects/naver-mail-mcp/dist/index.js"]
startup_timeout_sec = 20
tool_timeout_sec = 120

[mcp_servers.naver-mail.env]
NAVER_ENV_FILE = "C:/projects/naver-mail-mcp/.env"
```

Codex를 새로 시작해 도구 목록을 확인합니다. macOS/Linux에서는 경로를 `/Users/you/projects/...` 또는 `/home/you/projects/...`로 바꾸세요.
앱이 `node`를 찾지 못하면 `command`에 Node 실행 파일 절대 경로를 사용합니다.
[공식 Codex MCP 안내](https://developers.openai.com/codex/mcp/)

## 4. Claude Desktop 연결

**Settings → Developer → Edit Config**에서 다음 내용을 기존 `mcpServers`에 합칩니다.

```json
{
  "mcpServers": {
    "naver-mail": {
      "command": "node",
      "args": ["C:/projects/naver-mail-mcp/dist/index.js"],
      "env": {
        "NAVER_ENV_FILE": "C:/projects/naver-mail-mcp/.env"
      }
    }
  }
}
```

설정 파일 위치:

- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

Claude Desktop을 완전히 종료한 뒤 다시 실행합니다. 위 설정은 로컬 `stdio` 서버용이며 원격 커넥터 URL 입력란에 추가하는 방식과 다릅니다.
[공식 로컬 MCP 연결 안내](https://modelcontextprotocol.io/docs/develop/connect-local-servers)

복사용 파일은 [`examples`](examples/)에 있습니다. 비밀번호는 예시 파일에 적지 않고 `.env`에만 보관하세요.

## 5. 사용 예시

연결 후 AI 앱에서 다음처럼 요청할 수 있습니다.

- “네이버 메일 연결 상태 확인해 줘.”
- “안 읽은 메일 최신 10개 요약해 줘.”
- “9월 1일부터 받은 메일 중 제목에 견적서가 있는 메일 찾아 줘.”
- “이 메일 본문과 첨부파일 이름을 보여 줘.”
- “recipient@example.com에게 제목 ‘회의 일정’, 본문 ‘내일 오후 2시에 뵙겠습니다.’로 메일 보내 줘.”

검색 예시:

```json
{
  "mailbox": "INBOX",
  "subject": "견적서",
  "since": "2026-09-01",
  "before": "2026-10-01",
  "unread_only": true,
  "limit": 20
}
```

필터는 AND 조건입니다. 날짜는 메일 헤더의 발송일이 아닌 서버 내부 수신일을 사용하고, `since`는 포함, `before`는 제외합니다. IMAP 날짜 검색은 시간대 변환 없는 달력 날짜 기준입니다. 필터 없이 호출하면 최근 메일 목록을 반환합니다. 순서는 수신함 UID 내림차순입니다.

다음 페이지는 같은 조건에 결과의 `next_before_uid`를 `before_uid`로 넣습니다. `matched_remaining`은 해당 페이지 범위에 남아 있는 검색 결과 수입니다. 본문 조회에는 검색에서 반환된 `mailbox`, `uid`, `uid_validity`를 함께 사용합니다.

```json
{
  "mailbox": "INBOX",
  "uid": 123,
  "uid_validity": "456",
  "max_chars": 20000
}
```

발송 미리보기 예시 (`send_email`):

```json
{
  "to": ["recipient@example.com"],
  "cc": [],
  "bcc": [],
  "subject": "회의 일정",
  "text": "내일 오후 2시에 뵙겠습니다.",
  "dry_run": true,
  "request_id": "meeting-20260912-001"
}
```

`dry_run: true`는 네트워크 접속 없이 미리보기만 반환합니다. **`dry_run`을 생략하거나 `false`로 설정하면 실제 발송됩니다.** 위 예시의 주소를 본인이 의도한 수신자로 바꾼 뒤 사용하세요.

답장은 원본 `message_id`를 `in_reply_to`에, 필요한 원본 Message-ID 목록을 `references`에 전달합니다. 수신자는 사용자가 지정한 주소를 사용합니다.

### 발송 결과와 재시도

- `accepted`: SMTP 서버가 메시지를 접수했습니다. 최종 수신함 도착을 보장하지 않습니다.
- `partially_accepted`: 일부 수신자는 접수됐고 일부는 거절됐습니다. `accepted`/`rejected` 목록을 확인하세요.
- `SEND_FAILED_OR_UNKNOWN`: 실패했거나 접수 여부가 불확실합니다. 자동 재발송하지 않습니다.

같은 `request_id`와 같은 내용을 다시 호출하면 기존 결과를 반환합니다. 같은 ID에 다른 내용을 사용하면 거절합니다. 실패한 요청도 재시도하지 않도록 기억합니다.
이 기록은 **현재 서버 프로세스 메모리에만** 있으며 재시작하거나 Codex와 Claude Desktop이 별도 프로세스를 실행하면 공유되지 않습니다. 프로세스당 최대 1,000개 발송 시도를 저장하며 자동 삭제하지 않습니다. SMTP와 로컬 상태 사이에 원자적 처리는 없으므로 정확히 한 번 전달을 보장하지 않습니다.

## 범위와 제한

- 개인 `@naver.com` 계정 한 개 / 프로세스. NAVER WORKS, `@me.com` 별칭, OAuth 로그인은 지원하지 않습니다.
- 수신 첨부파일은 이름·타입·크기만 제공하며 다운로드·첨부 발송·HTML 발송은 아직 지원하지 않습니다.
- 본문 읽기는 첨부파일을 포함한 원문 최대 10 MiB. 기본 20,000자, 최대 100,000자를 반환하며 잘렸는지 표시합니다.
- 검색은 페이지당 최대 50개, 발송은 참조·숨은참조를 포함해 최대 20개 주소입니다.
- 삭제, 이동, 읽음 변경, 예약 발송, 백그라운드 수신 감시는 제공하지 않습니다.
- SMTP 발송 후 별도 IMAP 보낸메일함 저장은 수행하지 않습니다. 네이버의 자동 저장 동작은 실제 계정에서 확인해야 합니다.
- 한글 검색 지원과 검색 결과는 네이버 IMAP 서버 동작에 따릅니다.

## 개인정보와 보안

서버는 로컬에서 실행되며 HTTP 포트를 열지 않습니다. 메일 접속 정보는 네이버 인증에만 사용하고 별도 수집 서버나 분석 도구로 전송하지 않습니다. 단, **조회된 메일 내용은 연결한 AI 앱에 도구 결과로 전달됩니다.** `.env`는 평문 파일이므로 OS 권한으로 접근을 제한하세요.

IMAP/SMTP에는 인증서 검증을 켠 TLS를 사용합니다. SMTP는 STARTTLS가 불가능하면 실패합니다. 본문 변환 중 외부 이미지나 URL을 가져오지 않으며 파일 경로·URL 첨부 입력을 받지 않습니다. 서버 로그와 도구 오류에서 원본 인증 오류/프로토콜 대화를 출력하지 않습니다.

받은 메일의 본문·제목·발신자 표시는 신뢰할 수 없는 데이터입니다. 서버 도구 설명에 메일 속 지시를 따르지 않도록 안내하지만, 그것만으로 프롬프트 인젝션을 완전히 차단하지는 못합니다. 발송에는 AI 앱의 도구 승인 설정이 적용되며 이 서버가 별도의 사람 확인 UI를 강제하지는 않습니다.

`.gitignore`는 `.env`와 개인 앱 설정 파일을 제외하고, npm 패키지는 `files` 허용 목록만 포함합니다.

## 개발과 검증

```sh
npm ci
npm run check
npm run build
npm pack --dry-run
```

테스트는 가짜 IMAP 클라이언트, 로컬 SMTP 소켓, 실제 MCP 클라이언트/stdio 프로세스를 사용합니다. 네이버 계정이나 외부 수신자에게 접근하지 않습니다.
GitHub Actions에서 Windows/macOS/Linux와 Node.js 22/24 조합을 검증하도록 설정되어 있습니다. CI 결과는 저장소에 push한 뒤 확인할 수 있습니다.

실계정 확인 순서: `.env` 입력 → 앱 연결 → `verify_connection` → 목록/검색/본문 확인 → 본인 주소로 미리보기 → 실제 발송 및 수신 확인.

`npm start`로 직접 실행하면 stdio 입력을 기다리므로 화면에 아무것도 나오지 않는 것이 정상입니다. 수동 실행에서는 먼저 `NAVER_ENV_FILE`을 설정하세요.

```powershell
$env:NAVER_ENV_FILE = 'C:/projects/naver-mail-mcp/.env'
npm.cmd start
```

## 문제 해결

| 증상 | 확인할 내용 |
| --- | --- |
| `Missing or invalid configuration` | `.env`의 계정·앱 비밀번호와 `NAVER_ENV_FILE` 절대 경로 |
| `Cannot read NAVER_ENV_FILE` | 파일 존재 여부와 OS 접근 권한 |
| 인증 실패 | IMAP 사용함, 2단계 인증, 애플리케이션 비밀번호 |
| 앱에 도구가 없음 | 빌드 완료, 절대 경로, Node 경로, 앱 완전 재시작 |
| `STALE_UID` | 메일함 식별자가 바뀜. 다시 검색한 결과로 조회 |
| `MESSAGE_TOO_LARGE` | 10 MiB를 넘는 원문은 네이버 웹메일에서 확인 |
| SMTP 오류 또는 부분 성공 | 기존 접수 여부 확인 후 필요한 수신자만 새 요청으로 발송 |

## GitHub 공개

이 프로젝트는 MIT 라이선스입니다. 공개 전 실제 계정으로 연동을 확인하고 아래 명령으로 포함 파일을 검토하세요.

```sh
git status --short
git ls-files
npm pack --dry-run
```

`.env`, 메일 원문, 첨부파일, 개인 앱 설정을 커밋하지 마세요. 아직 npm에 배포된 패키지라는 가정은 하지 않으며, 위 설치 안내는 소스를 내려받아 빌드하는 방식입니다.

## English

Local stdio MCP server for personal NAVER Mail accounts. Provides mailbox listing, filtered search with UID pagination, decoded message reading, SMTP sending (cc/bcc/reply headers), dry-run previews, and authentication checks. Requires Node.js 22+, NAVER IMAP/SMTP enabled, two-step verification, and an application password.

Run `npm ci && npm run build`, copy `.env.example` to `.env`, fill in your account, and use the client configurations in `examples/` with absolute paths. Launch `node /absolute/path/dist/index.js` with `NAVER_ENV_FILE=/absolute/path/.env`. Credentials remain local; retrieved mail is returned to your AI client. Send deduplication is in-memory and process-local. This unofficial project is not affiliated with NAVER, OpenAI, or Anthropic. MIT licensed.
