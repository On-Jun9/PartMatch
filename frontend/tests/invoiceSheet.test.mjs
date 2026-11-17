import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../src/components/InvoiceSheet.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext, jsx: ts.JsxEmit.ReactJSX },
}).outputText.replace(/from ["'](react(?:\/jsx-runtime)?)["']/g,
  (_, name) => `from ${JSON.stringify(pathToFileURL(require.resolve(name)).href)}`);
const { InvoiceSheet } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

const filledCell = (merged) => ({
  r: 0, c: 0, x: 0, y: 0, width: merged ? 120 : 40, height: merged ? 40 : 20,
  text: '', lines: [], textWidth: 0, fontSize: 10, merged, overflowWidth: 120, numeric: false,
  font: { family: 'Arial', size: 10, bold: false, italic: false, color: '#000000' },
  align: 'left', vertical: 'bottom', wrap: false, shrink: false, format: 'General',
  fill: '#00ff00', borders: {},
});

function renderCell(cell) {
  return renderToStaticMarkup(createElement(InvoiceSheet, { preview: {
    cells: [cell], columns: [0, 40, 80, 120], rows: [0, 20, 40],
    region: { x: 0, y: 0, width: 120, height: 40 },
    page: { pageWidth: 200, pageHeight: 200, mmWidth: 70, mmHeight: 70, x: 0, y: 0, scale: 1 },
    fontWarning: false,
  } }));
}

test('a merged cell background covers every merged column and row', () => {
  assert.match(renderCell(filledCell(true)), /<rect x="0" y="0" width="120" height="40" fill="#00ff00"/);
});

test('an unmerged cell background remains limited to its own cell', () => {
  assert.match(renderCell(filledCell(false)), /<rect x="0" y="0" width="40" height="20" fill="#00ff00"/);
});

test('text clipping stays self contained when the SVG is cloned for printing', () => {
  const html = renderCell({ ...filledCell(false), fill: null, x: 10, y: 20,
    overflowWidth: 80, text: 'long part name', lines: ['long part name'] });
  assert.match(html, /<svg x="10" y="20" width="80" height="20" viewBox="10 20 80 20" overflow="hidden"><text/);
  assert.doesNotMatch(html, /clip-path|<clipPath/);
});
