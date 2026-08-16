# LangGraph CAD

[English](./README_en.md)

LangGraph CAD는 **LangGraph의 초기 그래프 구조만 빠르게 설계하는 아주 간단한 도구**입니다. 코드만으로 배선을 구상하면 전체 흐름이 한눈에 들어오지 않고 필요한 노드를 누락하기 쉬운 문제를 캔버스 설계와 실시간 검증으로 해결하며, 완성한 구조는 바로 사용할 수 있는 Python 모듈로 변환합니다.

- 배포 페이지: https://langgraph-cad.netlify.app/
- 소스 저장소: https://github.com/sjkwon1023/langgraph_cad

## 생성 코드 계약

생성 결과는 `from langgraph.graph import ...`를 사용하고 State 타입, 노드·라우터 함수, 그래프 배선, `compile()` 호출을 모두 포함하는 완전한 Python 모듈입니다. 코드를 복사한 뒤 `TODO`로 표시된 노드와 라우터 함수 본문만 실제 로직으로 바꾸면 됩니다. 그래프 배선은 별도로 고치지 않아도 컴파일됩니다.

루프가 있는 그래프에서는 생성된 라우터 stub이 우선 END 또는 루프가 아닌 분기를 반환해, 수정 전 예제도 안전하게 종료됩니다. 생성 모듈 끝에는 `if __name__ == "__main__":` 실행 예제가 추가되며, `recursion_limit`은 `compile()` 옵션이 아니라 `app.invoke(..., config={"recursion_limit": 25})`의 실행 설정으로 들어갑니다. 실제 반복 동작을 만들 때는 라우터의 `TODO` 종료 조건을 반드시 구현하세요.

코드를 실행할 환경에는 LangGraph가 필요합니다.

```bash
pip install langgraph
```

## 주요 기능

- 팔레트의 노드를 클릭해 화면 중앙에 추가하거나 캔버스로 드래그 앤 드롭
- Agent, Tool, Conditional Edge, Memo의 표시 이름 편집(생성 코드 식별자는 라벨에서 자동 파생)
- `State fields`에 한 줄당 `이름: Python 타입` 형식으로 공유 state 정의
- Conditional Edge에서 나가는 엣지의 분기 키를 캔버스에서 직접 편집
- ReAct Agent, Reflection Loop, Sequential Pipeline, Routing, Parallel Branches 템플릿 제공
- 오류와 경고를 실시간 표시해 초기 설계에서 빠뜨린 노드와 경로를 찾고, 연결된 항목을 클릭해 관련 노드로 이동
- 생성된 Python 코드를 실시간 확인하고 클립보드로 복사
- LangGraph Python 소스를 붙여넣고 읽지 못한 줄과 암시된 노드를 검토한 뒤 캔버스 그래프로 변환
- URL 자동 저장 및 공유
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

1. 왼쪽 팔레트에서 START, END, Agent, Tool, Conditional Edge, Memo 노드를 클릭하거나 캔버스로 끌어다 놓습니다.
2. 노드의 source 핸들에서 target 핸들로 드래그해 연결합니다. 같은 노드로 돌아오는 셀프 루프도 만들 수 있습니다. Conditional Edge의 outgoing branch를 앞선 상위 노드로 연결하면 조건이 충족될 때까지 반복하는 루프가 됩니다.
3. Agent, Tool, Conditional Edge, Memo 노드를 선택한 뒤 연필 버튼으로 이름을 편집합니다. START와 END는 이름을 편집할 수 없습니다. Agent, Tool, Conditional Edge는 라벨을 저장할 때 Python 코드 식별자도 함께 자동 관리합니다.
4. Conditional Edge에서 나가는 점선 엣지의 라벨을 클릭해 라우터가 반환할 분기 키를 편집합니다. 루프 분기에는 `revise`, `retry`, `tools`처럼 결정의 의미가 드러나는 키를 지정하고, 생성된 라우터 함수에는 루프를 빠져나갈 종료 조건을 구현해야 합니다.
5. 노드나 엣지를 선택하고 Delete 또는 Backspace를 누르면 삭제됩니다. Shift를 누른 채 여러 항목을 선택할 수 있습니다.
6. Editor 뷰에서는 좁은 화면에서 한 손가락 드래그로 캔버스를 이동합니다. 데스크톱에서는 왼쪽 드래그로 박스 선택하고 오른쪽 드래그로 캔버스를 이동합니다. 휠로 확대·축소할 수 있습니다.

START와 END 노드는 각각 하나만 둘 수 있습니다. START 노드는 여러 outgoing edge를 가질 수 있으므로 병렬 진입 경로를 표현할 수 있습니다. Memo 노드는 메모 전용이며 생성 코드에는 포함되지 않습니다.

### State와 코드 생성

오른쪽 코드 패널에서 Graph Name과 State 필드를 편집합니다. State 필드는 다음처럼 한 줄에 하나씩 입력합니다.

```text
messages: list
user_id: str
retry_count: int
```

State 타입에서 `Annotated`, `Any`, `Optional`, `Union`, `Sequence`, `Literal`, `Callable`, `Iterable`,
`Mapping`, `List`, `Dict`, `Tuple`, `Set`은 `typing`에서, `AnyMessage`는
`langchain_core.messages`에서, `add_messages`는 `langgraph.graph.message`에서,
`RemainingSteps`와 `IsLastStep`은 `langgraph.managed`에서, `Overwrite`는 `langgraph.types`에서
자동으로 import됩니다. `operator` 모듈도 참조 시 자동 import됩니다. `list`, `dict`, `str`, `int` 같은
Python 빌트인은 그대로 사용할 수 있습니다. 그 밖의 심볼은 경고로 표시되며, 코드를 복사한 뒤 생성
코드 상단에 import를 직접 추가해야 합니다.

오류는 코드 복사를 막고, 경고는 그래프를 점검하도록 안내합니다. 노드와 연결된 메시지만 클릭할 수
있으며, 클릭하면 관련 노드가 선택되고 화면에 맞춰집니다. 특히 고립 노드, START에서 도달할 수 없는
노드, END로 가는 경로가 없는 노드 경고는 초기 구조를 코드로 옮기는 과정에서 생기기 쉬운 노드·연결
누락을 캔버스 단계에서 바로 잡아 줍니다.

### Python 코드에서 그래프 불러오기

오른쪽 코드 패널에서 `Paste Code` 모드로 전환하고 LangGraph Python 소스를 입력한 뒤
`Convert to Graph`를 누릅니다. 판정 화면에는 노드·엣지 수, 읽지 못한 줄 수, `add_node` 없이
엣지에서만 참조된 노드 수가 표시됩니다. 읽지 못한 그래프 구성 줄은 빨간 배경으로 강조되고 각 줄의
이유도 함께 나옵니다. 일부 호출만 읽힌 경우에도 이 정보를 숨기지 않으므로 적용 전에 결과를 확인할
수 있습니다.

`Apply parsed result`를 누르면 현재 캔버스를 덮어쓸지 다시 확인합니다. 취소하면 캔버스와 공유 URL은
바뀌지 않습니다. 적용 후에는 생성 코드 모드로 돌아가며, 고립 노드, START에서 도달할 수 없는 노드,
END로 가는 경로가 없는 노드 같은 기존 검증 결과를 즉시 확인할 수 있습니다. 그래프를 만드는 호출을
하나도 찾지 못하면 현재 캔버스를 덮어쓰지 않습니다. 붙여넣은 원문은 그래프나 URL에 저장되지
않는 임시 입력입니다.

정적 가져오기는 다음 형태를 지원합니다.

- `X = StateGraph(...)`와 `class State(TypedDict):`의 직접 필드
- 리터럴 이름을 사용한 `add_node`, `add_edge`와 함수 식별자 하나를 받는 `add_node(fn)`
- 리터럴 `path_map`을 포함한 `add_conditional_edges`
- 구 API인 `set_entry_point`, `set_finish_point`

노드 이름·엣지 대상이 변수인 호출, 반복문·조건문·함수 블록에서 동적으로 만드는 호출,
`path_map` 없는 conditional, `add_sequence`는 읽지 못한 줄로 남습니다. 완전한 Python AST,
다중 State 스키마, `ToolNode`나 `tools_condition` 같은 prebuilt 매핑도 해석하지 않습니다.

코드를 다시 불러오면 노드 라벨은 이전 캔버스의 표시 이름이 아니라 코드에 남아 있는 식별자가 됩니다.
생성된 Python 코드에는 별도의 캔버스 라벨 정보가 보존되지 않기 때문에 발생하는 불가피한 손실입니다.

### 그래프 템플릿

왼쪽 팔레트의 템플릿 선택 메뉴에서 다음 다섯 초기 구조를 불러올 수 있습니다.

- **ReAct Agent**: Agent→Tool→Agent 루프와 Conditional Edge 라우터 모델링
- **Reflection Loop**: 평가 결과에 따라 Generator를 다시 실행하는 Evaluator-Optimizer
- **Sequential Pipeline**: 품질 게이트로 다음 단계 진행 여부를 결정하는 Prompt chaining
- **Routing**: START 직후 세 작업 중 하나를 고르는 조건부 진입점
- **Parallel Branches**: START에서 두 작업을 동시에 시작하고 결과를 Aggregate로 모으는 구조

템플릿은 좌표, State 필드, 명시적인 분기 키가 포함된 초기 설계입니다. `Load template`을 누르면
현재 그래프를 덮어쓸지 먼저 확인하며, 불러온 뒤 노드와 라우터의 `TODO` 본문을 실제 로직으로 바꾸면
됩니다.

### 저장, 공유, 초기화

- 편집 상태는 URL hash에 자동 저장됩니다. `Copy URL`로 현재 그래프를 공유할 수 있습니다.
- `Reset all`은 확인 후 START 노드 하나가 있는 초기 상태로 되돌립니다.
- `Load template`도 확인 후 현재 그래프 전체를 선택한 초기 구조로 교체합니다.
- URL 데이터가 유효하지 않으면 가져오지 않고 오류 메시지를 표시합니다.

## 알려진 한계와 향후 과제

- 키보드만으로 엣지를 연결하는 기능은 아직 없습니다.
- 모바일 노드 팔레트 drawer는 아직 focus trap을 제공하지 않습니다.
- undo/redo는 지원하지 않습니다. 기존 LangGraph Python 코드는 위에 설명한 정적 형태에 한해 그래프로 불러올 수 있습니다.
- `ToolNode`, `tools_condition` 같은 prebuilt 매핑과 checkpointer/interrupt 기반 HITL UI는 제공하지 않습니다.
- `Send` API와 subgraph 노드 타입은 아직 없습니다.
- URL payload는 압축하지 않으므로 큰 그래프의 공유 URL은 일부 앱이나 브라우저에서 동작하지 않을 수 있습니다.

## 라이선스

[MIT](./LICENSE) © Sejin Kwon

## 연락처

- 이메일: sjkwon1023@gmail.com
- GitHub: [@sjkwon1023](https://github.com/sjkwon1023)
