# LangGraph CAD

[한국어](./README.md)

LangGraph CAD is a visual editor for designing LangGraph workflows on a canvas and exporting them as ready-to-use Python modules.

- Live app: https://langgraph-cad.netlify.app/
- Source: https://github.com/sjkwon1023/langgraph_cad

## Generated-code contract

The generated output is a complete Python module. It uses `from langgraph.graph import ...` and includes the State type, node and router functions, graph wiring, and the `compile()` call. After copying it, replace only the node and router function bodies marked `TODO` with your application logic. The graph wiring compiles without additional edits.

Install LangGraph in the environment where you use the generated module:

```bash
pip install langgraph
```

## Features

- Add nodes at the viewport center with a palette click or drag them onto the canvas
- Edit display labels for Agent, Tool, Conditional Edge, and Text nodes (code identifiers are derived automatically)
- Define shared state in `State fields`, one `name: Python type` entry per line
- Edit branch keys directly on edges leaving a Conditional Edge node
- See validation errors and warnings in real time and focus nodes from messages linked to them
- Preview generated Python code and copy it to the clipboard
- Autosave and share through the URL, or export and import versioned JSON
- Adjust an edge curve and reset it to its default shape
- Use Editor/Code tabs and a palette drawer on narrow screens

## Run locally

```bash
git clone https://github.com/sjkwon1023/langgraph_cad.git
cd langgraph_cad
npm install
npm start
```

Run the checks with:

```bash
npm test
npm run build
```

The Python syntax check in `npm test` is skipped when Python 3 is unavailable. The real LangGraph
build and execution checks are skipped when `langgraph` is unavailable to the test interpreter.
To include both execution checks, point `LANGGRAPH_CAD_PYTHON` at a Python installation that has
the test requirements installed:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-test.txt
LANGGRAPH_CAD_PYTHON=.venv/bin/python npm test
```

## Usage

### Nodes and edges

1. Click START, END, Agent, Tool, Conditional Edge, or Text in the left palette, or drag it onto the canvas.
2. Drag from a source handle to a target handle to connect nodes. Self-loops back to the same node are supported.
3. Select an Agent, Tool, Conditional Edge, or Text node and use its pencil button to edit the name. START and END are not editable. Saving a label for Agent, Tool, or Conditional Edge also updates its derived Python identifier.
4. Click the label on a dashed edge leaving a Conditional Edge node to edit the branch key returned by its router.
5. Select nodes or edges and press Delete or Backspace to remove them. Hold Shift for multi-selection.
6. In the Editor view, drag with one finger to pan the canvas on narrow screens. On desktop, left-drag to box-select and right-drag to pan. Use the wheel to zoom.

Only one START and one END node can exist. START may have multiple outgoing edges, which represents parallel entry paths. Text is a note-only node and is omitted from generated code.

### State and code generation

Edit Graph Name and State fields in the code panel. Enter one state field per line:

```text
messages: list
user_id: str
retry_count: int
```

State annotations automatically import `Annotated`, `Any`, `Optional`, `Union`, `Sequence`,
`Literal`, `Callable`, `Iterable`, `Mapping`, `List`, `Dict`, `Tuple`, `Set`, `add_messages`, and
`operator` when referenced. Python built-ins such as `list`, `dict`, `str`, and `int` work as-is.
Other symbols produce a warning; after copying the code, add their imports manually at the top of
the generated module.

Errors block code copying, while warnings point out graph structures worth reviewing. Only
messages linked to nodes are clickable; clicking one selects and fits those nodes. Warnings can
include unreachable nodes, nodes without a path to END, and isolated nodes.

### Save, share, and reset

- The editor automatically stores its state in the URL hash. Use `URL 복사` (Copy URL) to share the current graph.
- For large graphs, use `JSON 내보내기` (Export JSON) instead of a long URL, then restore it with `JSON 불러오기` (Import JSON).
- `전체 초기화` (Reset All) asks for confirmation and restores the initial graph with one START node.
- Invalid URL or JSON data is rejected and reported without replacing the current graph.

## Known limitations and roadmap

- Connecting edges entirely from the keyboard is not yet supported.
- The mobile palette drawer does not yet provide a focus trap.
- Undo/redo and reverse-importing existing LangGraph Python code are not supported.
- Prebuilt mappings such as `ToolNode` and `tools_condition`, plus checkpointer/interrupt HITL UI, are not included.
- There is no template/example loader, `Send` API support, or subgraph node type yet.
- URL payloads are not compressed. Share large graphs as JSON files.

## License

[MIT](./LICENSE) © Sejin Kwon

## Contact

- Email: sjkwon1023@gmail.com
- GitHub: [@sjkwon1023](https://github.com/sjkwon1023)
