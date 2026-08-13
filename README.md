# LangGraph CAD

[English](./README_en.md)

LangGraph CAD는 LangGraph 워크플로를 캔버스에서 설계하고, 바로 사용할 수 있는 Python 모듈로 변환하는 웹 편집기입니다.

- 배포 페이지: https://langgraph-cad.netlify.app/
- 소스 저장소: https://github.com/sjkwon1023/langgraph_cad

## 생성 코드 계약

생성 결과는 `from langgraph.graph import ...`를 사용하고 State 타입, 노드·라우터 함수, 그래프 배선, `compile()` 호출을 모두 포함하는 완전한 Python 모듈입니다. 코드를 복사한 뒤 `TODO`로 표시된 노드와 라우터 함수 본문만 실제 로직으로 바꾸면 됩니다. 그래프 배선은 별도로 고치지 않아도 컴파일됩니다.

코드를 실행할 환경에는 LangGraph가 필요합니다.

```bash
pip install langgraph
```

## 주요 기능

- 팔레트의 노드를 클릭해 화면 중앙에 추가하거나 캔버스로 드래그 앤 드롭
- Agent, Tool, Conditional Edge, Text의 표시 이름 편집(생성 코드 식별자는 라벨에서 자동 파생)
- `State 필드`에 한 줄당 `이름: Python 타입` 형식으로 공유 state 정의
- Conditional Edge에서 나가는 엣지의 분기 키를 캔버스에서 직접 편집
- 오류와 경고를 실시간 표시하고, 노드와 연결된 항목을 클릭해 관련 노드로 이동
- 생성된 Python 코드를 실시간 확인하고 클립보드로 복사
- URL 자동 저장·공유 및 버전이 있는 JSON 내보내기·불러오기
- 선택한 엣지의 곡선 조절 및 기본 모양으로 초기화
- 좁은 화면에서 Editor/Code 탭과 노드 팔레트 drawer 제공

## 로컬 실행

```bash
git clone https://github.com/sjkwon1023/langgraph_cad.git
cd langgraph_cad
npm install
npm start
```

검증 명령은 다음과 같습니다.

```bash
npm test
npm run build
```

`npm test`의 Python 문법 검사는 Python 3가 없으면 건너뛰고, 실제 LangGraph 그래프 생성·실행 검사는
테스트 인터프리터에 `langgraph`가 없으면 건너뜁니다. 두 실행 검사를 포함하려면 `langgraph`가 설치된
Python을 `LANGGRAPH_CAD_PYTHON`으로 지정하세요.

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-test.txt
LANGGRAPH_CAD_PYTHON=.venv/bin/python npm test
```

## 사용 방법

### 노드와 엣지

1. 왼쪽 팔레트에서 START, END, Agent, Tool, Conditional Edge, Text 노드를 클릭하거나 캔버스로 끌어다 놓습니다.
2. 노드의 source 핸들에서 target 핸들로 드래그해 연결합니다. 같은 노드로 돌아오는 셀프 루프도 만들 수 있습니다.
3. Agent, Tool, Conditional Edge, Text 노드를 선택한 뒤 연필 버튼으로 이름을 편집합니다. START와 END는 이름을 편집할 수 없습니다. Agent, Tool, Conditional Edge는 라벨을 저장할 때 Python 코드 식별자도 함께 자동 관리합니다.
4. Conditional Edge에서 나가는 점선 엣지의 라벨을 클릭해 라우터가 반환할 분기 키를 편집합니다.
5. 노드나 엣지를 선택하고 Delete 또는 Backspace를 누르면 삭제됩니다. Shift를 누른 채 여러 항목을 선택할 수 있습니다.
6. Editor 뷰에서는 좁은 화면에서 한 손가락 드래그로 캔버스를 이동합니다. 데스크톱에서는 왼쪽 드래그로 박스 선택하고 오른쪽 드래그로 캔버스를 이동합니다. 휠로 확대·축소할 수 있습니다.

START와 END 노드는 각각 하나만 둘 수 있습니다. START 노드는 여러 outgoing edge를 가질 수 있으므로 병렬 진입 경로를 표현할 수 있습니다. Text 노드는 메모 전용이며 생성 코드에는 포함되지 않습니다.

### State와 코드 생성

오른쪽 코드 패널에서 Graph Name과 State 필드를 편집합니다. State 필드는 다음처럼 한 줄에 하나씩 입력합니다.

```text
messages: list
user_id: str
retry_count: int
```

State 타입에서 `Annotated`, `Any`, `Optional`, `Union`, `Sequence`, `Literal`, `Callable`, `Iterable`,
`Mapping`, `List`, `Dict`, `Tuple`, `Set`, `add_messages`, `operator`를 사용하면 필요한 import가 자동으로
추가됩니다. `list`, `dict`, `str`, `int` 같은 Python 빌트인도 그대로 사용할 수 있습니다. 그 밖의 심볼은
경고로 표시되며, 코드를 복사한 뒤 생성 코드 상단에 import를 직접 추가해야 합니다.

오류는 코드 복사를 막고, 경고는 그래프를 점검하도록 안내합니다. 노드와 연결된 메시지만 클릭할 수
있으며, 클릭하면 관련 노드가 선택되고 화면에 맞춰집니다. 경고에는 도달할 수 없는 노드, END로 가는
경로가 없는 노드, 고립된 노드 등이 포함될 수 있습니다.

### 저장, 공유, 초기화

- 편집 상태는 URL hash에 자동 저장됩니다. `URL 복사`로 현재 그래프를 공유할 수 있습니다.
- 큰 그래프는 긴 URL 대신 `JSON 내보내기`를 사용하고, `JSON 불러오기`로 다시 열 수 있습니다.
- `전체 초기화`는 확인 후 START 노드 하나가 있는 초기 상태로 되돌립니다.
- URL 또는 JSON 데이터가 유효하지 않으면 가져오지 않고 오류 메시지를 표시합니다.

## 알려진 한계와 향후 과제

- 키보드만으로 엣지를 연결하는 기능은 아직 없습니다.
- 모바일 노드 팔레트 drawer는 아직 focus trap을 제공하지 않습니다.
- undo/redo와 기존 LangGraph Python 코드를 그래프로 역변환하는 기능은 지원하지 않습니다.
- `ToolNode`, `tools_condition` 같은 prebuilt 매핑과 checkpointer/interrupt 기반 HITL UI는 제공하지 않습니다.
- 템플릿·예제 그래프 로더, `Send` API, subgraph 노드 타입은 아직 없습니다.
- URL payload는 압축하지 않습니다. 큰 그래프는 JSON 파일로 공유하세요.

## 라이선스

[MIT](./LICENSE) © Sejin Kwon

## 연락처

- 이메일: sjkwon1023@gmail.com
- GitHub: [@sjkwon1023](https://github.com/sjkwon1023)
