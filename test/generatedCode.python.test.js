import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { generatePython } from '../src/generator/generatePython.js';
import { edge, minimal, node, reactLoop } from './fixtures.js';
import { findPython, hasLangGraph } from './pythonEnv.js';

const python = findPython();
const langgraph = hasLangGraph(python);

const CASES = {
  minimal,
  'Annotated messages reducer': {
    ...minimal,
    stateFields: 'messages: Annotated[list, add_messages]',
  },
  'react loop': reactLoop,
  'conditional entry point': {
    graphName: 'g',
    nodes: [
      node('s', 'start', 'START'),
      node('a', 'agent', 'A'),
      node('b', 'agent', 'B'),
      node('c', 'conditional_edge', 'Route'),
      node('e', 'end', 'END'),
    ],
    edges: [edge('s', 'c'), edge('c', 'a'), edge('c', 'b'), edge('a', 'e'), edge('b', 'e')],
  },
  'parallel fan-out from START': {
    graphName: 'g',
    nodes: [
      node('s', 'start', 'START'),
      node('a', 'agent', 'A'),
      node('b', 'agent', 'B'),
      node('e', 'end', 'END'),
    ],
    edges: [edge('s', 'a'), edge('s', 'b'), edge('a', 'e'), edge('b', 'e')],
  },
  'shared router with two sources': {
    graphName: 'g',
    nodes: [
      node('s', 'start', 'START'),
      node('a', 'agent', 'A'),
      node('b', 'agent', 'B'),
      node('z', 'agent', 'Z'),
      node('c', 'conditional_edge', 'Route'),
      node('e', 'end', 'END'),
    ],
    edges: [edge('s', 'a'), edge('a', 'c'), edge('b', 'c'), edge('c', 'z'), edge('z', 'e')],
  },
  'awkward names': {
    graphName: 'app',
    stateFields: 'messages: list\ncount: int',
    nodes: [
      node('s', 'start', 'START'),
      node('a', 'agent', 'class'),
      node('b', 'tool', '2nd step'),
      node('d', 'agent', 'END'),
      node('c', 'conditional_edge', 'lambda'),
      node('e', 'end', 'END'),
    ],
    edges: [
      edge('s', 'a'),
      edge('a', 'c'),
      edge('c', 'b', { branchKey: 'a "quoted" key' }),
      edge('c', 'd'),
      edge('b', 'e'),
      edge('d', 'e'),
    ],
  },
  'self loop': {
    graphName: 'g',
    nodes: [node('s', 'start', 'START'), node('a', 'agent', 'A'), node('e', 'end', 'END')],
    edges: [edge('s', 'a'), edge('a', 'a'), edge('a', 'e')],
  },
};

let workDir;
test.before(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'langgraph-cad-'));
});
test.after(() => {
  if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
});

const writeCase = (name, graph) => {
  const file = path.join(workDir, `${name.replace(/\W+/g, '_')}.py`);
  fs.writeFileSync(file, generatePython(graph));
  return file;
};

test('generated code is syntactically valid Python', { skip: python ? false : 'python3 not found' }, () => {
  for (const [name, graph] of Object.entries(CASES)) {
    const file = writeCase(name, graph);
    const result = spawnSync(python, ['-m', 'py_compile', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${name}: ${result.stderr}`);
  }
});

test(
  'generated code builds a real LangGraph graph',
  { skip: langgraph ? false : 'langgraph not importable by the test interpreter' },
  () => {
    for (const [name, graph] of Object.entries(CASES)) {
      const file = writeCase(name, graph);
      const result = spawnSync(python, [file], { encoding: 'utf8' });
      assert.equal(result.status, 0, `${name}: ${result.stderr}`);
    }
  },
);

test(
  'the compiled graph runs',
  { skip: langgraph ? false : 'langgraph not importable by the test interpreter' },
  () => {
    const file = path.join(workDir, 'invoke.py');
    fs.writeFileSync(file, `${generatePython(minimal)}\nprint(app.invoke({"messages": []}))\n`);
    const result = spawnSync(python, [file], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /messages/);
  },
);
