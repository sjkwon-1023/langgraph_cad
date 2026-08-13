import assert from 'node:assert/strict';
import test from 'node:test';

import { findBareModuleSpecifiers, findModuleScriptSources } from '../scripts/verify-build.mjs';

test('finds bare specifiers in static, side-effect, re-export, and dynamic imports', () => {
  const source = `
    import React from 'react';
    import 'reactflow/dist/style.css';
    export { render } from "react-dom/client";
    const flow = import('reactflow');
    const runtime = import(\`react/jsx-runtime\`);
    const nested = \`${'${'}import('react-dom')${'}'}\`;
    const chunk = import(\`reactflow/${'${'}chunkName${'}'}\`);
    import { from } from 'package-with-from-binding';
    export { from as origin } from 'package-with-from-export';
    import '';
  `;

  assert.deepEqual(findBareModuleSpecifiers(source), [
    'react',
    'reactflow/dist/style.css',
    'react-dom/client',
    'reactflow',
    'react/jsx-runtime',
    'react-dom',
    'reactflow/',
    'package-with-from-binding',
    'package-with-from-export',
    '',
  ]);
});

test('accepts browser-resolvable module specifiers', () => {
  const source = `
    import './local.js';
    import '../shared.js';
    export { value } from '/assets/value.js';
    import('https://cdn.example.com/module.js');
    import(\`./chunks/${'${'}chunkName${'}'}\`);
    import(\`${'${'}runtimePath${'}'}\`);
    import 'http://cdn.example.com/module.js';
    import 'data:text/javascript,export default 1';
  `;

  assert.deepEqual(findBareModuleSpecifiers(source), []);
});

test('ignores import-like text in strings, templates, and comments', () => {
  const source = `
    const message = "import 'react'";
    const template = \`export { x } from 'react-dom'\`;
    const pattern = /import\\("react"\\)/;
    const moduleUrl = import.meta.url;
    const keywords = { import: 'react', export: 'react-dom' };
    console.log(keywords.import, keywords.export);
    // import 'reactflow';
    /* import('react/jsx-runtime'); */
  `;

  assert.deepEqual(findBareModuleSpecifiers(source), []);
});

test('distinguishes regular expressions and division around import syntax', () => {
  const source = `
    if (ok) /import("not-a-module")/.test(message);
    if (ok) {} /import("also-not-a-module")/.test(message);
    for await (const item of items) /import("still-not-a-module")/.test(item);
    function f() {} /import("function-regex")/.test(message);
    class C {} /import("class-regex")/.test(message);
    {} /import("block-regex")/.test(message);
    let ratio = total++ / count;
    const normalized = /x/ / 2;
    const fnRatio = function () {} / 2;
    const classRatio = class {} / 2;
    import "react";
  `;

  assert.deepEqual(findBareModuleSpecifiers(source), ['react']);
});

test('finds module entry scripts regardless of attribute order', () => {
  const html = `
    <script src="/assets/app.js" type="module"></script>
    <script type='module' defer src='./chunk.js'></script>
    <script src=/assets/minified.js type=module></script>
    <script src="legacy.js"></script>
  `;

  assert.deepEqual(
    findModuleScriptSources(html),
    ['/assets/app.js', './chunk.js', '/assets/minified.js'],
  );
});
