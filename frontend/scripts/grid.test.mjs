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

const coastSource = await readFile(new URL('../src/ocean/coastalDisplay.ts', import.meta.url), 'utf8');
const coastJs = ts.transpileModule(coastSource, {compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {extendCoastalDisplay} = await import(`data:text/javascript;base64,${Buffer.from(coastJs).toString('base64')}`);
test('coastal display extends only land nodes and leaves source and offshore gaps intact', () => {
  const rows = [[10,null,null],[20,null,30],[20,20,30]];
  const snapshot = structuredClone(rows);
  const display = extendCoastalDisplay(rows,(j,i)=>j===0 && i===1,false);
  assert.ok(display[0][1] >= 10 && display[0][1] <= 30);
  assert.equal(display[0][2],null);
  assert.equal(display[1][1],null);
  assert.deepEqual(rows,snapshot);
});
test('coastal display uses periodic neighbors without filling unsupported interiors',()=>{
  const rows=[[10,null,null,null,null,null]];
  assert.equal(extendCoastalDisplay(rows,()=>true,true)[0][5],10);
  assert.equal(extendCoastalDisplay(rows,()=>true,false)[0][5],null);
});
const { geographicLandTest } = await import(`data:text/javascript;base64,${Buffer.from(coastJs).toString('base64')}`);
test('exact geographic masking preserves narrow islands, holes and wrapped longitudes', () => {
  const land = {features:[{geometry:{type:'Polygon',coordinates:[[[179,0],[180,0],[180,2],[179,2],[179,0]],[[179.3,0.5],[179.7,0.5],[179.7,1.5],[179.3,1.5],[179.3,0.5]]]}}]};
  const contains = geographicLandTest(land);
  assert.equal(contains(179.1,1),true);
  assert.equal(contains(-180.9,1),true);
  assert.equal(contains(179.5,1),false);
  assert.equal(contains(178,1),false);
});
