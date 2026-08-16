import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPlan, generatePython } from '../src/generator/generatePython.js';
import { importPython } from '../src/graph/importPython.js';
import { decodeState, encodeState } from '../src/graph/serialization.js';
import { GRAPH_TEMPLATES } from '../src/graph/templates.js';

function refName(reference) {
  if (reference === 'START' || reference === 'END') return reference;
  return JSON.parse(reference);
}

function expectedSignature(graph) {
  const plan = buildPlan(graph);
  const nodes = new Set();
  const plainEdges = new Set();
  const conditionalEdges = new Set();
  plan.codeNodes.forEach((node) => nodes.add(`${node.data.type}:${plan.nodeNames.get(node.id)}`));
  [...plan.startEdges, ...plan.plainEdges].forEach((edge) => {
    const source = refName(plan.asSource(edge.source));
    const target = refName(plan.asTarget(edge.target));
    nodes.add(source === 'START' ? 'start:START' : `${/tools?/i.test(source) ? 'tool' : 'agent'}:${source}`);
    nodes.add(target === 'END' ? 'end:END' : `${/tools?/i.test(target) ? 'tool' : 'agent'}:${target}`);
    plainEdges.add(`${source}->${target}`);
  });
  plan.routers.forEach((router) => {
    nodes.add(`conditional_edge:${router.functionName}`);
    router.sources.forEach((sourceRef) => {
      const source = refName(sourceRef);
      nodes.add(source === 'START' ? 'start:START' : `${/tools?/i.test(source) ? 'tool' : 'agent'}:${source}`);
      router.branches.forEach((branch) => {
        const target = refName(branch.target);
        nodes.add(target === 'END' ? 'end:END' : `${/tools?/i.test(target) ? 'tool' : 'agent'}:${target}`);
        conditionalEdges.add(`${source}|${router.functionName}|${branch.key}|${target}`);
      });
    });
  });
  return { nodes: [...nodes].sort(), plainEdges: [...plainEdges].sort(), conditionalEdges: [...conditionalEdges].sort() };
}

function parsedSignature(state) {
  const byId = new Map(state.nodes.map((node) => [node.id, node]));
  const nameOf = (node) => {
    if (node.data.type === 'start') return 'START';
    if (node.data.type === 'end') return 'END';
    return node.data.codeIdentifier;
  };
  const nodes = state.nodes.map((node) => `${node.data.type}:${nameOf(node)}`).sort();
  const plainEdges = [];
  const conditionalEdges = [];
  const routers = state.nodes.filter((node) => node.data.type === 'conditional_edge');
  const routerIds = new Set(routers.map((node) => node.id));
  state.edges.forEach((edge) => {
    if (!routerIds.has(edge.source) && !routerIds.has(edge.target)) {
      plainEdges.push(`${nameOf(byId.get(edge.source))}->${nameOf(byId.get(edge.target))}`);
    }
  });
  routers.forEach((router) => {
    const sources = state.edges.filter((edge) => edge.target === router.id).map((edge) => byId.get(edge.source));
    const branches = state.edges.filter((edge) => edge.source === router.id);
    sources.forEach((source) => branches.forEach((branch) => {
      conditionalEdges.push(
        `${nameOf(source)}|${nameOf(router)}|${branch.data?.branchKey || ''}|${nameOf(byId.get(branch.target))}`,
      );
    }));
  });
  return { nodes, plainEdges: plainEdges.sort(), conditionalEdges: conditionalEdges.sort() };
}

test('imports supported calls, legacy APIs, inferred tools, State fields, and deterministic IDs', () => {
  const source = [
    'from typing import TypedDict',
    '',
    'class State(TypedDict):',
    '    messages: list',
    '    count: int',
    '',
    'workflow = StateGraph(State)',
    'workflow.add_node("Agent", agent)',
    'workflow.add_node(tools)',
    'workflow.set_entry_point("Agent")',
    'workflow.set_finish_point("tools")',
  ].join('\n');
  const result = importPython(source);

  assert.deepEqual(result.unreadable, []);
  assert.deepEqual(result.implied, []);
  assert.equal(result.state.v, 1);
  assert.equal(result.state.graphName, 'workflow');
  assert.equal(result.state.stateFields, 'messages: list\ncount: int');
  assert.deepEqual(result.state.nodes.map(({ id, data }) => [id, data.type, data.codeIdentifier]), [
    ['agent-1', 'agent', 'Agent'],
    ['tool-1', 'tool', 'tools'],
    ['start-1', 'start', undefined],
    ['end-1', 'end', undefined],
  ]);
  assert.deepEqual(result.state.edges.map(({ id, source: from, target }) => [id, from, target]), [
    ['edge-1', 'start-1', 'agent-1'],
    ['edge-2', 'tool-1', 'end-1'],
  ]);
  assert.deepEqual(result.summary, { nodes: 4, edges: 2, routers: 0 });
});

test('converts single-line and multiline conditionals into routers and branch-key edges', () => {
  const source = [
    'g = StateGraph(State)',
    'g.add_node("source", source)',
    'g.add_conditional_edges("source", choose, {"left": "left", "done": END})',
    'g.add_conditional_edges(',
    '    START,',
    '    choose_entry,',
    '    {',
    '        "go": "source",',
    '    },',
    ')',
  ].join('\n');
  const result = importPython(source);
  const routers = result.state.nodes.filter(({ data }) => data.type === 'conditional_edge');

  assert.deepEqual(result.unreadable, []);
  assert.deepEqual(result.implied, ['left']);
  assert.deepEqual(routers.map(({ data }) => data.codeIdentifier), ['choose', 'choose_entry']);
  assert.deepEqual(result.state.edges.map((edge) => edge.data?.branchKey).filter(Boolean), ['left', 'done', 'go']);
  assert.deepEqual(result.summary, { nodes: 6, edges: 5, routers: 2 });
});

test('attributes multiline add_node and add_edge calls to their opening lines', () => {
  const result = importPython([
    'g = StateGraph(State)',
    'g.add_node(',
    '    "agent",',
    '    agent,',
    ')',
    'g.add_edge(',
    '    START,',
    '    "agent",',
    ')',
  ].join('\n'));

  assert.deepEqual(result.unreadable, []);
  assert.deepEqual(result.implied, []);
  assert.deepEqual(result.summary, { nodes: 2, edges: 1, routers: 0 });
});

test('records actionable unreadable diagnostics only for marker-bearing opening lines', () => {
  const source = [
    'from langgraph.graph import StateGraph',
    'g = StateGraph(State)',
    'g.add_node(node_name, fn)',
    'g.add_conditional_edges("a", route)',
    'for name in names:',
    '    g.add_node(name, fn)',
    'g.add_sequence([a, b])',
    'other.add_edge("a", "b")',
    'def implementation(state):',
    '    return {"message": "add_edge(fake, fake)"}',
    '# g.add_node("comment", fn)',
    'text = "StateGraph(Bogus)"',
    '',
    'g.add_conditional_edges(',
  ].join('\n');
  const result = importPython(source);

  assert.equal(result.state, null);
  assert.deepEqual(result.unreadable.map(({ line }) => line), [3, 4, 6, 7, 8, 14]);
  assert.equal(result.unreadable[0].text, 'g.add_node(node_name, fn)');
  assert.match(result.unreadable[0].reason, /node name is a variable/);
  assert.match(result.unreadable[1].reason, /path_map/);
  assert.match(result.unreadable[2].reason, /inside loops/);
  assert.match(result.unreadable[3].reason, /add_sequence/);
  assert.match(result.unreadable[4].reason, /receiver/);
  assert.match(result.unreadable[5].reason, /not closed/);
  assert.equal(new Set(result.unreadable.map(({ line }) => line)).size, result.unreadable.length);
  assert.deepEqual(result.summary, { nodes: 0, edges: 0, routers: 0 });
});

test('collects edges first so later declarations are not mistaken for implied names', () => {
  const result = importPython([
    'g = StateGraph(State)',
    'g.add_edge("declared_later", "missing")',
    'g.add_node("declared_later", declared_later)',
  ].join('\n'));

  assert.deepEqual(result.implied, ['missing']);
  assert.deepEqual(
    result.state.nodes.filter(({ data }) => ['agent', 'tool'].includes(data.type)).map(({ data }) => data.codeIdentifier),
    ['declared_later', 'missing'],
  );
});

test('distinguishes variable path targets, incomplete dictionaries, conditional blocks, and function blocks', () => {
  const result = importPython([
    'g = StateGraph(State)',
    'g.add_conditional_edges("a", route, {"go": target})',
    'g.add_conditional_edges("a", route, {"go": "b")',
    'if enabled:',
    '    g.add_edge("a", "b")',
    'def wire():',
    '    g.add_edge("a", "b")',
  ].join('\n'));

  assert.equal(result.state, null);
  assert.deepEqual(result.unreadable.map(({ line }) => line), [2, 3, 5, 7]);
  assert.match(result.unreadable[0].reason, /branch target is a variable/);
  assert.match(result.unreadable[1].reason, /dictionary is not closed/);
  assert.match(result.unreadable[2].reason, /conditional blocks/);
  assert.match(result.unreadable[3].reason, /function blocks/);
});

test('returns null without diagnostics when the source has no graph markers', () => {
  assert.deepEqual(importPython('import os\n\ndef helper():\n    return "ok"\n'), {
    state: null,
    unreadable: [],
    implied: [],
    summary: { nodes: 0, edges: 0, routers: 0 },
  });
});

test('returns null when nothing is readable and preserves partial results with unreadable diagnostics', () => {
  const none = importPython('g = StateGraph(State)\ng.add_node(name, fn)');
  assert.equal(none.state, null);
  assert.equal(none.unreadable.length, 1);

  const partial = importPython([
    'g = StateGraph(State)',
    'g.add_node("ok", ok)',
    'g.add_edge("ok", target_name)',
  ].join('\n'));
  assert.notEqual(partial.state, null);
  assert.equal(partial.summary.nodes, 1);
  assert.equal(partial.unreadable.length, 1);
  assert.match(partial.unreadable[0].reason, /endpoint/);
});

test('produces deterministic IDs, diagnostics, and positions for identical input', () => {
  const source = 'g = StateGraph(State)\ng.add_edge(START, "tools")\ng.add_edge("tools", END)';
  assert.deepEqual(importPython(source), importPython(source));
});

test('returns public state with literal node names containing spaces as a valid v1 payload', () => {
  const result = importPython([
    'g = StateGraph(State)',
    'g.add_node("review step", review_step)',
    'g.add_edge(START, "review step")',
  ].join('\n'));
  const node = result.state.nodes.find(({ data }) => data.label === 'review step');

  assert.equal(node.data.codeIdentifier, undefined);
  assert.equal(decodeState(encodeState(result.state)).ok, true);
});

GRAPH_TEMPLATES.forEach(({ id, graph }) => {
  test(`generated ${id} template round-trips through the Python importer`, () => {
    const result = importPython(generatePython(graph));
    assert.notEqual(result.state, null);
    assert.equal(result.state.graphName, graph.graphName);
    assert.equal(result.state.stateFields, graph.stateFields);
    assert.deepEqual(result.unreadable, []);
    assert.deepEqual(result.implied, []);
    assert.deepEqual(parsedSignature(result.state), expectedSignature(graph));
  });
});
