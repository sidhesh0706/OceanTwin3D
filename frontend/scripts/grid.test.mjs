import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

const source = await readFile(new URL('../src/cesium/gridSampling.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { interval, interpolate } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
test('nonuniform coordinates interpolate an analytic plane at the correct position', () => {
  const xs = [0, 1, 4], ys = [0, 2, 8];
  const rows = ys.map(y => xs.map(x => 2 * x + 3 * y));
  assert.equal(interpolate(rows, interval(xs, 2), interval(ys, 5)), 19);
});
test('periodic seam uses last-to-first spacing and normalizes equivalent longitudes', () => {
  const xs = [-180, -90, 0, 90], ys = [-10, 10];
  const rows = [[-1, 0, 1, 0], [-1, 0, 1, 0]];
  assert.equal(interpolate(rows, interval(xs, 135, true), interval(ys, 0)), -0.5);
  assert.deepEqual(interval(xs, 185, true), interval(xs, -175, true));
  assert.equal(interval(xs, 135), null);
});
test('missing corners never create data over land and exact wet nodes remain usable', () => {
  const rows = [[2, null], [4, 8]];
  assert.equal(interpolate(rows, [0, 1, 0.5], [0, 1, 0.5]), null);
  assert.equal(interpolate(rows, [0, 1, 0], [0, 1, 0]), 2);
  assert.equal(interpolate(rows, null, [0, 1, 0]), null);
});
