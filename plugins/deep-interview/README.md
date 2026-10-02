# Deep Interview

막연한 아이디어를 **실행하기 전에** 질문으로 좁히는 스킬입니다.

- 한 번에 질문 하나만 합니다.
- 답할 때마다 목표·제약·성공 기준의 명확도를 채점해 보여 줍니다.
- 모호성이 기준(기본 20%) 아래로 내려가면 명세서로 정리하고 승인을 기다립니다. 그 전에는 아무것도 만들거나 고치지 않습니다.

코드뿐 아니라 문서, 보고서, 자동화, 기획에도 씁니다. Claude(채팅·Cowork·Claude Code)와 Codex에서 동작합니다.

## 사용

```text
딥 인터뷰 해 줘: 고객 문의 메일을 자동으로 분류하는 걸 만들고 싶어
```

| 말하기 | 통과 기준 | 최대 라운드 |
| --- | --- | --- |
| `--quick` | 모호성 30% 이하 | 8 |
| 기본 | 20% 이하 | 20 |
| `--deep` | 10% 이하 | 20 |

끝나면 `specs/deep-interview-<제목>.md`에 명세서가 저장됩니다. 파일을 쓸 수 없는 환경에서는 대화에 출력합니다.

## 설치

```text
Codex:   codex plugin marketplace add gentlerai001/gentler-plugins  →  codex plugin add deep-interview@gentler
Claude:  /plugin marketplace add gentlerai001/gentler-plugins        →  /plugin install deep-interview@gentler
```

Claude 채팅은 **Customize → Plugins → Add marketplace**에 `gentlerai001/gentler-plugins`를 넣고 Deep Interview를 추가합니다.

## 출처

Yeachan Heo의 [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) `deep-interview` 스킬(MIT)을 단독으로 동작하도록 줄여 옮긴 것입니다.
원본의 상태 저장 도구, autopilot·ralph·omc-plan 연결, 설정 파일 조회는 빠졌고 질문 방식, 채점 공식, 관점 전환, 명세서 구조는 유지했습니다. 원본은 [Ouroboros](https://github.com/Q00/ouroboros)에서 착안했습니다.
