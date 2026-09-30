# NAVER Mail MCP

**ChatGPT(Codex)나 Claude에게 "내 네이버 메일 읽어 줘, 보내 줘"라고 시킬 수 있게 해 주는 도구입니다.**

프로그램이 내 PC에서만 돌아가고, 네이버 메일에 직접 연결됩니다. 비밀번호는 내 PC 밖으로 나가지 않습니다.



## 이런 걸 할 수 있어요

설치가 끝나면 AI 앱에 이렇게 말하면 됩니다.

- "안 읽은 메일 최신 10개만 요약해 줘"
- "9월에 받은 메일 중 제목에 '견적서' 들어간 거 찾아 줘"
- "이 메일 첨부파일 이름이 뭐야? PDF 내려받아 줘"
- "홍길동님한테 '내일 2시 회의' 메일 보내 줘. 보내기 전에 미리 보여 줘"
- "첨부 폴더에 있는 견적서.pdf 붙여서 보내 줘"

메일을 읽어도 '읽음' 표시가 바뀌지 않고, 삭제·이동은 하지 않습니다.

## 설치하기

두 가지 방법이 있습니다. **Codex 앱을 쓴다면 방법 A**가 가장 쉽습니다. 터미널을 열 일이 없습니다.

| | 방법 A. Codex 앱에서 플러그인 설치 | 방법 B. 설치 파일 실행 |
| --- | --- | --- |
| 대상 | Codex 앱 | Claude Desktop, Claude Code, Codex 모두 |
| 할 일 | 주소 붙여넣기 → 설치 → 채팅에 "설정해 줘" | ZIP 풀기 → `setup.cmd` 더블클릭 |
| 걸리는 시간 | 2분 | 5분 |

두 방법 모두 **공통 준비물**이 먼저 필요합니다.

### 공통 준비 1. Node.js 설치 (이미 있으면 건너뛰기)

[https://nodejs.org](https://nodejs.org) 에서 **LTS** 버튼을 눌러 설치합니다. 설치 중 나오는 선택지는 전부 기본값 그대로 두면 됩니다.
버전이 22 이상이어야 합니다. 예전에 설치한 적이 있다면 한 번 다시 설치해 주세요.

### 공통 준비 2. 네이버에서 세 가지 켜기

1. PC로 네이버 메일에 들어가 **환경설정 → POP3/IMAP 설정 → IMAP/SMTP 설정 → "사용함"** 선택 후 저장
   [네이버 안내 보기](https://help.naver.com/service/30029/contents/21344?osType=COMMONOS)
2. **네이버ID → 보안설정 → 2단계 인증**을 켭니다. (이미 켜져 있으면 넘어가세요)
3. 같은 화면의 **2단계 인증 → 관리 → 애플리케이션 비밀번호**에서 비밀번호를 하나 만듭니다.
   이름은 아무거나("AI 메일") 적으면 되고, 화면에 나오는 **비밀번호를 복사해 두세요.** 설치 마지막 단계에서 붙여넣습니다.
   [네이버 안내 보기](https://help.naver.com/service/5640/contents/8584?lang=ko&osType=PC)

> 평소 로그인할 때 쓰는 비밀번호가 아니라 **애플리케이션 비밀번호**를 써야 합니다. 이걸 헷갈리면 로그인이 안 됩니다.

---

## 방법 A. Codex 앱에서 플러그인으로 설치 (가장 쉬움)

1. Codex 앱에서 **플러그인** 화면을 열고 **마켓플레이스 추가**를 누릅니다.
2. 아래 주소를 붙여넣고 확인합니다.
   ```text
   https://github.com/gentlerai001/naver-mail-mcp
   ```
3. 목록에 나타난 **NAVER Mail**을 설치합니다.
4. **새 대화**를 열고 이렇게 말합니다.
   > "네이버 메일 설정해 줘"
5. 브라우저에 설정 창이 열립니다. 네이버 주소와 애플리케이션 비밀번호를 넣고 **연결 확인하고 저장**을 누릅니다.
   네이버에 실제로 로그인해 보고 성공하면 바로 끝입니다. 앱을 다시 켤 필요도 없습니다.

비밀번호는 내 PC의 설정 파일에만 저장되고 채팅으로는 전송되지 않습니다.
계정을 바꾸거나 읽기 전용으로 바꾸고 싶으면 같은 말을 다시 하면 설정 창이 다시 열립니다.

터미널이 편하다면 이 두 줄로도 같은 결과입니다.

```sh
codex plugin marketplace add gentlerai001/naver-mail-mcp
codex plugin add naver-mail-mcp@gentler
```

---

## 방법 B. 설치 파일 실행 (Claude Desktop · Claude Code · Codex)

### B-1. 이 프로젝트 내려받기

이 페이지 위쪽의 초록색 **Code** 버튼 → **Download ZIP** 을 누르고, 받은 파일의 압축을 풉니다.
바탕화면이나 문서 폴더처럼 찾기 쉬운 곳에 두세요. 폴더 이름은 `naver-mail-mcp-main` 처럼 됩니다.

Git을 쓸 줄 안다면 이렇게 해도 됩니다.

```sh
git clone https://github.com/gentlerai001/naver-mail-mcp.git
```

### B-2. 설치 파일 실행

압축을 푼 폴더를 열고,

- **Windows**: `setup.cmd` 를 더블클릭합니다.
- **Mac**: 폴더에서 마우스 오른쪽 클릭 → "폴더에서 새로운 터미널 열기" 후 `sh setup.sh` 를 입력하고 Enter.

검은 창이 뜨고 설치 마법사가 순서대로 물어봅니다.

```text
네이버 메일 주소:                    ← 내 네이버 주소
애플리케이션 비밀번호:               ← 공통 준비 2에서 복사한 것 붙여넣기 (화면엔 *** 로 보임)
보내는 사람 이름 (비워도 됩니다):     ← 받는 사람에게 보일 이름
AI 가 메일을 보낼 수 있게 할까요?     ← 읽기만 원하면 n
Codex 에 연결할까요?                 ← 설치된 앱만 물어봅니다. Enter 면 예
Claude Desktop 에 연결할까요?
Claude Code 에 연결할까요?
```

마법사가 네이버에 실제로 로그인해 보고, 설치된 AI 앱을 찾아서 알아서 연결합니다.
처음 실행할 때는 필요한 파일을 내려받느라 1~2분 걸립니다.

### B-3. 앱을 완전히 껐다 켜기

AI 앱을 **완전히 종료**했다가 다시 실행합니다. (창만 닫지 말고 트레이 아이콘까지 종료)
그리고 새 대화에서 이렇게 말해 보세요.

> "네이버 메일 연결 상태 확인해 줘"

"연결됨"이라고 답하면 끝입니다.

## 막혔을 때

**더블클릭했는데 창이 바로 사라져요**
Node.js가 없을 때 그렇습니다. 공통 준비 1을 먼저 하고, PC를 한 번 재부팅한 뒤 다시 실행하세요.

**"Windows의 PC 보호" 파란 창이 떠요**
인터넷에서 받은 스크립트라 뜨는 경고입니다. **추가 정보 → 실행**을 누르면 됩니다.

**"네이버에 로그인하지 못했습니다"**
거의 항상 아래 셋 중 하나입니다.
1. IMAP/SMTP가 "사용 안 함"으로 되어 있음 → 공통 준비 2의 1번
2. 2단계 인증이 꺼져 있음 → 공통 준비 2의 2번
3. 로그인 비밀번호를 넣었음 → 애플리케이션 비밀번호를 새로 만들어 넣기
`setup.cmd` 를 다시 실행하면 처음부터 다시 입력할 수 있습니다.

**앱에 네이버 메일 도구가 안 보여요**
앱을 완전히 종료했다가 다시 켰는지 확인하세요. Codex는 새 대화를 시작해야 보입니다.
그래도 안 되면 `setup.cmd` 를 다시 실행해 해당 앱에 "예"로 답하세요.

**"설정해 줘"라고 했는데 브라우저 창이 안 열려요**
AI가 답변에 적어 준 `http://127.0.0.1:...` 주소를 복사해 브라우저 주소창에 붙여넣으세요. 이 주소는 내 PC 안에서만 열리고 15분 뒤 만료됩니다.

**계정을 바꾸고 싶어요 / 읽기 전용으로 바꾸고 싶어요**
AI 앱에 "네이버 메일 설정해 줘"라고 말하면 설정 창이 다시 열립니다. 방법 B로 설치했다면 `setup.cmd` 를 다시 실행해도 됩니다.

**비밀번호는 어디에 저장되나요?**
내 PC의 `내 사용자 폴더\.naver-mail-mcp\.env` 파일 한 곳에만 저장됩니다. 인터넷으로 전송되지 않습니다.
Windows는 `C:\Users\내이름\.naver-mail-mcp`, Mac은 `/Users/내이름/.naver-mail-mcp` 입니다.

**첨부파일을 보내려면?**
위 폴더 안의 `attachments` 폴더에 파일을 넣고 "첨부 폴더의 파일명.pdf 붙여서 보내 줘"라고 하면 됩니다.
받은 첨부파일도 같은 폴더에 저장됩니다.

**지우고 싶어요**
1. AI 앱에서 연결을 해제합니다. Codex는 플러그인 화면에서 NAVER Mail 제거(또는 터미널에서 `codex plugin remove naver-mail-mcp@gentler`), Claude Code는 `claude mcp remove naver-mail -s user`, Claude Desktop은 설정 → 개발자 → 설정 편집에서 `naver-mail` 항목 삭제.
2. `.naver-mail-mcp` 폴더와 압축 푼 프로젝트 폴더를 삭제합니다.
3. 네이버에서 만든 애플리케이션 비밀번호를 삭제합니다.

## 안전하게 쓰기

- 비밀번호는 내 PC에만 있지만, **읽어 온 메일 내용은 AI 앱(OpenAI·Anthropic)으로 전달**됩니다. 민감한 메일이 많은 계정이라면 읽기 전용 계정을 따로 쓰는 것도 방법입니다.
- 메일을 보내기 전에는 "보내기 전에 미리 보여 줘"라고 하는 습관을 들이세요. AI 앱 설정에서 도구 실행 전 확인을 켜 두면 더 안전합니다.
- 받은 메일 안에 "이 메일을 전달해라" 같은 문장이 있어도 AI가 그걸 따르면 안 됩니다. 도구 설명에 그렇게 안내하지만 완벽하지 않으니, AI가 이상한 행동을 하면 바로 중단하세요.
- 공용 PC에는 설치하지 마세요.

## 더 알아보기

- [직접 연결하기 (수동 설정)](docs/manual-setup.md): 마법사 없이 설정 파일을 손으로 고치고 싶을 때, 또는 Codex 플러그인 형태로 쓰고 싶을 때
- [기술 문서](docs/reference.md): 도구 8개의 입력값, 검색·첨부·발송 한도, 보안 설계, 개발·테스트 방법

개발자라면 이 명령으로 검증할 수 있습니다.

```sh
npm ci
npm run check      # 타입 검사 + 테스트 41개
npm run setup      # 설치 마법사
```

MIT 라이선스입니다.

## English

Local stdio MCP server for personal NAVER Mail accounts, for Codex, Claude Desktop and Claude Code. Search, read, download attachments, and send text/HTML mail with attachments through NAVER IMAP/SMTP. Requires Node.js 22+, NAVER IMAP/SMTP enabled, two-step verification, and an application password.

Quick start (Codex app): add `https://github.com/gentlerai001/naver-mail-mcp` as a plugin marketplace, install NAVER Mail, then say "set up NAVER mail" in a new chat; a local browser page collects the account and verifies the login, with no restart needed. Alternatively download the ZIP and run `setup.cmd` (Windows) or `sh setup.sh` (macOS/Linux): the interactive wizard asks for your account, verifies the login, detects installed AI apps and registers the server. Credentials stay in `~/.naver-mail-mcp/.env`. See [docs/manual-setup.md](docs/manual-setup.md) and [docs/reference.md](docs/reference.md) for manual configuration and the full tool reference. Unofficial; not affiliated with NAVER, OpenAI, or Anthropic. MIT licensed.
