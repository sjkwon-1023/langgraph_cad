import assert from 'node:assert/strict';
import test from 'node:test';

import {
  analyzeStateFieldAnnotations,
  buildPlan,
  generatePython,
  parseStateFields,
} from '../src/generator/generatePython.js';
import { edge, minimal, node, reactLoop, reflectionLoop } from './fixtures.js';

test('the canonical START -> Agent -> END graph renders a complete module', () => {
  assert.equal(
    generatePython(minimal),
    `"""LangGraph CAD 로 생성된 그래프.

TODO 로 표시된 함수 본문만 채우면 됩니다 — 그래프 배선 자체는 그대로 컴파일됩니다.
"""

from typing import TypedDict

from langgraph.graph import END, START, StateGraph


class State(TypedDict):
    """모든 노드가 공유하는 그래프 state."""

    messages: list


def agent(state: State) -> dict:
    """TODO: 'Agent' 노드를 구현하세요."""
    return {}


my_graph = StateGraph(State)

my_graph.add_node("Agent", agent)

my_graph.add_edge(START, "Agent")
my_graph.add_edge("Agent", END)

app = my_graph.compile()
`,
  );
});

test('imports resolve to the real langgraph module path', () => {
  const code = generatePython(minimal);
  assert.match(code, /^from langgraph\.graph import END, START, StateGraph$/m);
  assert.doesNotMatch(code, /from langgraph import/);
  assert.doesNotMatch(code, /AgentState/);
});

test('unused START/END imports are left out', () => {
  const code = generatePython({
    graphName: 'g',
    nodes: [node('a', 'agent', 'Agent'), node('b', 'agent', 'Beta')],
    edges: [edge('a', 'b')],
  });
  assert.match(code, /^from langgraph\.graph import StateGraph$/m);
});

test('every referenced function is defined and the graph is compiled', () => {
  const code = generatePython(reactLoop);
  assert.match(code, /^def agent\(state: State\) -> dict:$/m);
  assert.match(code, /^def tool\(state: State\) -> dict:$/m);
  assert.match(code, /^def should_continue\(state: State\) -> Literal\["continue", "finish"\]:$/m);
  assert.match(code, /^app = my_graph\.compile\(\)$/m);
});

test('conditional path_map entries are comma separated', () => {
  const code = generatePython(reactLoop);
  assert.match(
    code,
    /my_graph\.add_conditional_edges\(\n {4}"Agent",\n {4}should_continue,\n {4}\{\n {8}"continue": "Tool",\n {8}"finish": END,\n {4}\},\n\)/,
  );
});

test('router stubs prefer END and document loop branches', () => {
  const code = generatePython(reactLoop);
  assert.match(code, /루프 분기 continue -> Tool: 종료 조건을 반드시 구현하세요/);
  assert.match(code, /def should_continue[\s\S]*?return "finish"/);

  const reflectionCode = generatePython(reflectionLoop);
  assert.match(reflectionCode, /루프 분기 revise -> Generator/);
  assert.match(reflectionCode, /def evaluate_draft[\s\S]*?return "accepted"/);
});

test('router stubs prefer a non-loop branch and otherwise preserve first-branch fallback', () => {
  const nodes = [
    node('s', 'start', 'START'),
    node('a', 'agent', 'A'),
    node('b', 'agent', 'B'),
    node('c', 'conditional_edge', 'Route'),
  ];
  const safeForward = generatePython({
    graphName: 'g',
    nodes,
    edges: [
      edge('s', 'a'),
      edge('a', 'c'),
      edge('c', 'a', { branchKey: 'again' }),
      edge('c', 'b', { branchKey: 'next' }),
    ],
  });
  assert.match(safeForward, /def route[\s\S]*?return "next"/);

  const allLoops = generatePython({
    graphName: 'g',
    nodes,
    edges: [
      edge('s', 'a'),
      edge('a', 'c'),
      edge('b', 'c'),
      edge('c', 'a', { branchKey: 'first' }),
      edge('c', 'b', { branchKey: 'second' }),
    ],
  });
  assert.match(allLoops, /def route[\s\S]*?return "first"/);
});

test('implicit loop keys stay syntactically safe but do not use the target name', () => {
  const input = {
    graphName: 'g',
    nodes: [
      node('s', 'start', 'START'),
      node('a', 'agent', 'Writer'),
      node('c', 'conditional_edge', 'Review'),
      node('e', 'end', 'END'),
    ],
    edges: [edge('s', 'a'), edge('a', 'c'), edge('c', 'a'), edge('c', 'e')],
  };
  const loopBranch = buildPlan(input).routers[0].branches[0];
  const code = generatePython(input);

  assert.equal(loopBranch.isLoop, true);
  assert.equal(loopBranch.key, '');
  assert.match(code, /"": "Writer",/);
  assert.doesNotMatch(code, /"Writer": "Writer",/);
});

test('branch keys fall back to the target name, or "end" for the END node', () => {
  const code = generatePython({
    graphName: 'g',
    nodes: [
      node('s', 'start', 'START'),
      node('a', 'agent', 'Agent'),
      node('t', 'tool', 'Tool'),
      node('c', 'conditional_edge', 'Route'),
      node('e', 'end', 'END'),
    ],
    edges: [edge('s', 'a'), edge('a', 'c'), edge('c', 't'), edge('c', 'e')],
  });
  assert.match(code, /"Tool": "Tool",/);
  assert.match(code, /"end": END,/);
});

test('a node labelled END stays an ordinary node instead of becoming the END constant', () => {
  const code = generatePython({
    graphName: 'g',
    nodes: [node('s', 'start', 'START'), node('a', 'agent', 'END')],
    edges: [edge('s', 'a')],
  });
  assert.match(code, /g\.add_node\("END", end\)/);
  assert.match(code, /g\.add_edge\(START, "END"\)/);
  assert.doesNotMatch(code, /add_edge\(START, END\)/);
});

test('START may fan out to several nodes', () => {
  const code = generatePython({
    graphName: 'g',
    nodes: [node('s', 'start', 'START'), node('a', 'agent', 'A'), node('b', 'agent', 'B')],
    edges: [edge('s', 'a'), edge('s', 'b')],
  });
  assert.match(code, /g\.add_edge\(START, "A"\)/);
  assert.match(code, /g\.add_edge\(START, "B"\)/);
});

test('a router fed by several sources emits one call per source', () => {
  const code = generatePython({
    graphName: 'g',
    nodes: [
      node('s', 'start', 'START'),
      node('a', 'agent', 'A'),
      node('b', 'agent', 'B'),
      node('z', 'agent', 'Z'),
      node('c', 'conditional_edge', 'Route'),
    ],
    edges: [edge('s', 'a'), edge('a', 'c'), edge('b', 'c'), edge('c', 'z')],
  });
  assert.equal(code.match(/add_conditional_edges\(/g).length, 2);
  assert.match(code, /add_conditional_edges\(\n {4}"A",/);
  assert.match(code, /add_conditional_edges\(\n {4}"B",/);
});

test('a router wired straight to START becomes a conditional entry point', () => {
  const code = generatePython({
    graphName: 'g',
    nodes: [
      node('s', 'start', 'START'),
      node('a', 'agent', 'A'),
      node('c', 'conditional_edge', 'Route'),
    ],
    edges: [edge('s', 'c'), edge('c', 'a')],
  });
  assert.match(code, /add_conditional_edges\(\n {4}START,/);
});

test('self loops are emitted', () => {
  const code = generatePython({
    graphName: 'g',
    nodes: [node('s', 'start', 'START'), node('a', 'agent', 'A')],
    edges: [edge('s', 'a'), edge('a', 'a')],
  });
  assert.match(code, /g\.add_edge\("A", "A"\)/);
});

test('text nodes and their edges never reach the output', () => {
  const code = generatePython({
    graphName: 'g',
    nodes: [node('s', 'start', 'START'), node('a', 'agent', 'A'), node('m', 'text', 'memo')],
    edges: [edge('s', 'a'), edge('m', 'a')],
  });
  assert.doesNotMatch(code, /memo/);
  assert.equal(code.match(/add_edge/g).length, 1);
});

test('node names that are Python keywords or start with a digit get usable function names', () => {
  const code = generatePython({
    graphName: 'g',
    nodes: [node('a', 'agent', 'class'), node('b', 'agent', '2nd step')],
    edges: [],
  });
  assert.match(code, /^def class_\(state: State\) -> dict:$/m);
  assert.match(code, /^def _2nd_step\(state: State\) -> dict:$/m);
  assert.match(code, /g\.add_node\("class", class_\)/);
});

test('function names never collide with the graph, state or compiled names', () => {
  const code = generatePython({
    graphName: 'app',
    nodes: [node('a', 'agent', 'app'), node('b', 'agent', 'State')],
    edges: [],
  });
  assert.doesNotMatch(code, /^def app\(/m);
  assert.doesNotMatch(code, /^def state\(/m);
  // The graph variable is called `app`, so the compiled handle steps aside.
  assert.match(code, /^app_1 = app\.compile\(\)$/m);
});

test('an invalid graph name falls back instead of emitting broken syntax', () => {
  assert.match(generatePython({ ...minimal, graphName: '' }), /^my_graph = StateGraph\(State\)$/m);
  assert.match(generatePython({ ...minimal, graphName: '1graph' }), /^my_graph = StateGraph\(State\)$/m);
});

test('routers with no source or no branch are skipped', () => {
  const dangling = generatePython({
    graphName: 'g',
    nodes: [node('s', 'start', 'START'), node('a', 'agent', 'A'), node('c', 'conditional_edge', 'Route')],
    edges: [edge('s', 'a'), edge('c', 'a')],
  });
  assert.doesNotMatch(dangling, /add_conditional_edges/);
  assert.doesNotMatch(dangling, /def route/);
});

test('state fields are parsed line by line', () => {
  assert.deepEqual(parseStateFields('messages: list\n# comment\n\ncount: int').fields, [
    { name: 'messages', annotation: 'list' },
    { name: 'count', annotation: 'int' },
  ]);
  assert.deepEqual(parseStateFields('oops').invalid, ['oops']);
  assert.match(generatePython({ ...minimal, stateFields: '' }), /class State\(TypedDict\):\n {4}"""[^\n]*"""\n\n {4}pass/);
});

test('state annotation symbols resolve to deterministic imports', () => {
  assert.deepEqual(
    analyzeStateFieldAnnotations([
      { annotation: 'Annotated[list, add_messages]' },
      { annotation: 'Optional[Mapping[str, Any]]' },
      { annotation: 'Callable[[int], Union[List[str], Tuple[int, ...]]]' },
      { annotation: 'Sequence[Iterable[Dict[str, Set[int]]]]' },
      { annotation: 'Literal["done"]' },
      { annotation: 'operator.add' },
    ]),
    {
      typingNames: [
        'Annotated',
        'Any',
        'Callable',
        'Dict',
        'Iterable',
        'List',
        'Literal',
        'Mapping',
        'Optional',
        'Sequence',
        'Set',
        'Tuple',
        'Union',
      ],
      langchainMessageNames: [],
      langgraphMessageNames: ['add_messages'],
      langgraphManagedNames: [],
      langgraphTypeNames: [],
      moduleNames: ['operator'],
      unknownNames: [],
    },
  );

  const code = generatePython({
    ...minimal,
    stateFields: 'messages: Annotated[list, add_messages]\ncount: Annotated[int, operator.add]',
  });
  assert.match(code, /^import operator$/m);
  assert.match(code, /^from typing import Annotated, TypedDict$/m);
  assert.match(code, /^from langgraph\.graph\.message import add_messages$/m);
});

test('LangGraph loop-safety annotations resolve to deterministic module imports', () => {
  const fields = parseStateFields([
    'messages: Annotated[list[AnyMessage], add_messages]',
    'remaining_steps: RemainingSteps',
    'is_last_step: IsLastStep',
    'result: Overwrite',
  ].join('\n')).fields;
  const analysis = analyzeStateFieldAnnotations(fields);
  const code = generatePython({ ...minimal, stateFields: fields.map((field) => `${field.name}: ${field.annotation}`).join('\n') });

  assert.deepEqual(analysis.langchainMessageNames, ['AnyMessage']);
  assert.deepEqual(analysis.langgraphManagedNames, ['IsLastStep', 'RemainingSteps']);
  assert.deepEqual(analysis.langgraphTypeNames, ['Overwrite']);
  assert.deepEqual(analysis.unknownNames, []);
  assert.match(code, /^from langchain_core\.messages import AnyMessage$/m);
  assert.match(code, /^from langgraph\.managed import IsLastStep, RemainingSteps$/m);
  assert.match(code, /^from langgraph\.types import Overwrite$/m);
});

test('only cyclic graphs include an invoke example with recursion_limit config', () => {
  assert.doesNotMatch(generatePython(minimal), /^if __name__ == "__main__":$/m);

  const builtins = generatePython({
    ...reflectionLoop,
    stateFields: [
      'items: list[str]',
      'lookup: dict[str, int]',
      'name: str',
      'count: int',
      'score: float',
      'ready: bool',
      'seen: set[str]',
      'pair: tuple[int, int]',
      'history: Annotated[list[str], operator.add]',
    ].join('\n'),
  });
  assert.match(builtins, /^if __name__ == "__main__":$/m);
  assert.match(builtins, /"items": \[\],[\s\S]*"lookup": \{\},[\s\S]*"ready": False/);
  assert.match(builtins, /"history": \[\],/);
  assert.match(builtins, /invoke\(initial_state, config=\{"recursion_limit": 25\}\)/);

  const unknown = generatePython({ ...reflectionLoop, stateFields: 'custom: CustomState' });
  assert.match(unknown, /TODO: 실제 State 필드에 맞는 초기값을 입력하세요\.\n {4}initial_state = \{\}/);
});

test('unknown state annotation names are reported without treating quoted forward references as imports', () => {
  assert.deepEqual(
    analyzeStateFieldAnnotations([
      { annotation: 'Optional[Foo]' },
      { annotation: 'list["ForwardRef"]' },
    ]).unknownNames,
    ['Foo'],
  );
});

test('branch keys and labels containing quotes stay valid Python', () => {
  const code = generatePython({
    graphName: 'g',
    nodes: [
      node('s', 'start', 'START'),
      node('a', 'agent', 'He said "hi"'),
      node('t', 'tool', 'T'),
      node('c', 'conditional_edge', 'R'),
    ],
    edges: [edge('s', 'a'), edge('a', 'c'), edge('c', 't', { branchKey: 'a "quoted" key' })],
  });
  assert.match(code, /"a \\"quoted\\" key": "T",/);
  assert.doesNotMatch(code, /"""TODO: 'He said "hi"'/);
});
