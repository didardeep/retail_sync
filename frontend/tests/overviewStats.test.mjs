import test from 'node:test';
import assert from 'node:assert/strict';

import {
  averageScore, bucketScoredStores, formatAverages, groupAuditsByRegion,
  groupObservationsByRisk, legacyStageCounts, rankScored, scoreStores,
} from '../src/lib/overviewStats.js';
import { filterRows, mergeRows } from '../src/lib/auditRows.js';

const obs = [
  { id: 1, risk: 'Critical' }, { id: 2, risk: 'high' }, { id: 3, risk: 'High' },
  { id: 4, risk: 'Medium' }, { id: 5, risk: 'Low' }, { id: 6, risk: 'Sev 9' }, { id: 7, risk: null },
];

test('risk groups: counts equal list lengths and cover every observation', () => {
  const g = groupObservationsByRisk(obs);
  assert.deepEqual(g.map((x) => [x.level, x.count]),
    [['Critical', 1], ['High', 2], ['Medium', 1], ['Low', 1], ['Unrated', 2]]);
  for (const x of g) assert.equal(x.count, x.items.length);
  assert.equal(g.reduce((a, x) => a + x.count, 0), obs.length);
});

test('risk groups: empty input has no slices (no fake fallback)', () => {
  assert.deepEqual(groupObservationsByRisk([]), []);
});

const audits = [
  { id: 'A1', region: 'North India', status: 'Planned', score: null },
  { id: 'A2', region: 'North India', status: 'Completed', score: 80 },
  { id: 'A3', region: 'North India', status: 'Approved', score: 90 },
  { id: 'A4', region: 'West India', status: 'Ongoing', score: null },
  { id: 'A5', region: null, status: 'Completed', score: 70 },
];

test('region groups: slice count equals drill list; unknown region kept', () => {
  const g = groupAuditsByRegion(audits);
  assert.deepEqual(g.map((x) => [x.region, x.count]),
    [['North India', 3], ['Unassigned', 1], ['West India', 1]]);
  for (const x of g) assert.equal(x.count, x.items.length);
  assert.equal(g.reduce((a, x) => a + x.count, 0), audits.length);
});

test('average score ignores audits without a score', () => {
  assert.equal(averageScore(audits.map((a) => a.score)), 80);
  assert.equal(averageScore([null, undefined]), null);
});

const stores = [
  { id: 'S1', name: 'A', format: 'COCO' }, { id: 'S2', name: 'B', format: 'COCO' },
  { id: 'S3', name: 'C', format: 'FOFO' }, { id: 'S4', name: 'D', format: 'FOFO' },
  { id: 'S5', name: 'E', format: 'FOCO' }, { id: 'S6', name: 'F', format: 'FOCO' },
  { id: 'S7', name: 'G', format: 'COFO' }, { id: 'S8', name: 'H', format: 'COFO' },
];
const scoreMap = {
  S1: { q4: 90.5, q3: 50 }, S2: { q4: 90 }, S3: { q4: 75 }, S4: { q4: 74.9 },
  S5: { q4: 60, q3: 0 }, S6: { q4: 39.9 }, S7: { q4: 0 },
  // S8 has no score row at all
};

test('buckets are exclusive, exhaustive over scored stores, boundaries as labelled', () => {
  const { scored, unscored } = scoreStores(stores, scoreMap, 'q4');
  assert.equal(scored.length, 6);
  assert.deepEqual(unscored.map((s) => s.id), ['S7', 'S8']);
  const b = bucketScoredStores(scored);
  assert.deepEqual(b.map((x) => x.count), [1, 2, 2, 0, 1]);
  assert.deepEqual(b[0].items.map((e) => e.store.id), ['S1']);
  assert.deepEqual(b[1].items.map((e) => e.store.id), ['S2', 'S3']);
  for (const x of b) assert.equal(x.count, x.items.length);
  assert.equal(b.reduce((a, x) => a + x.count, 0), scored.length);
  const ids = b.flatMap((x) => x.items.map((e) => e.store.id));
  assert.equal(new Set(ids).size, ids.length);
});

test('buckets recompute per quarter', () => {
  const q3 = scoreStores(stores, scoreMap, 'q3');
  assert.deepEqual(q3.scored.map((e) => e.store.id), ['S1']);
  assert.equal(bucketScoredStores(q3.scored)[3].count, 1);
});

test('format averages skip unscored stores', () => {
  const f = Object.fromEntries(formatAverages(stores, scoreMap, 'q4').map((x) => [x.format, x]));
  assert.equal(f.COCO.avg, 90);
  assert.equal(f.COCO.scoredCount, 2);
  assert.equal(f.COFO.avg, null);
  assert.equal(f.COFO.scoredCount, 0);
});

test('ranking is descending over scored stores only', () => {
  const r = rankScored(scoreStores(stores, scoreMap, 'q4').scored);
  assert.equal(r[0].store.id, 'S1');
  assert.equal(r[r.length - 1].store.id, 'S6');
});

test('dashboard stage counts equal Audit Status rows filtered by kind=legacy', () => {
  const raw = audits.map((a) => ({ ...a, store_id: 'S1' }));
  const counts = legacyStageCounts(raw);
  const rows = mergeRows(raw, [{ id: 'sop-1', status: 'Planned' }]);
  for (const stage of ['scheduled', 'in_progress', 'completed', 'approved']) {
    assert.equal(counts[stage], filterRows(rows, { stage, kind: 'legacy' }).length, stage);
  }
  assert.equal(counts.completed, 2);
  assert.equal(counts.approved, 1);
});

test('region drill list equals Audit Status rows for that region (kind=legacy)', () => {
  const rows = mergeRows(audits, []);
  for (const g of groupAuditsByRegion(audits)) {
    if (g.region === 'Unassigned') continue;
    assert.equal(filterRows(rows, { region: g.region, kind: 'legacy' }).length, g.count);
  }
});
