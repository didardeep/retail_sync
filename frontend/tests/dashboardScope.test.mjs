import test from 'node:test';
import assert from 'node:assert/strict';

import {
  inScope, recentObservations, repeatIssues, resolveScope,
  scopeFromParams, scopeTitle, storesInScope, topObservations, wording,
} from '../src/lib/dashboardScope.js';

const stores = [
  { id: 'S1', name: 'Phoenix Mall', city: 'Mumbai', region: 'West India' },
  { id: 'S2', name: 'DLF Avenue', city: 'Delhi', region: 'North India' },
  { id: 'S3', name: 'Ub City', city: 'Bengaluru', region: 'South India' },
];

test('heading names the scope', () => {
  assert.equal(scopeTitle({ kind: 'all' }, stores), 'All stores');
  assert.equal(scopeTitle({ kind: 'store', id: 'S1' }, stores), 'Phoenix Mall - Mumbai, West India');
  assert.equal(scopeTitle({ kind: 'store', id: 'gone' }, stores), 'All stores');
});

test('scope comes from the URL', () => {
  assert.deepEqual(scopeFromParams(new URLSearchParams('store=S1')), { kind: 'store', id: 'S1' });
  assert.deepEqual(scopeFromParams(new URLSearchParams('brand=b1')), { kind: 'all', id: '' });
  assert.deepEqual(scopeFromParams(new URLSearchParams('')), { kind: 'all', id: '' });
  assert.deepEqual(resolveScope({ kind: 'store', id: 'gone' }, stores), { kind: 'all', id: '' });
  assert.deepEqual(resolveScope({ kind: 'store', id: 'S2' }, stores), { kind: 'store', id: 'S2' });
});

test('scope filters stores and everything that belongs to them', () => {
  const audits = [{ id: 'A1', store_id: 'S1' }, { id: 'A2', store_id: 'S2' }, { id: 'A3', store_id: 'S3' }];
  assert.deepEqual(inScope(audits, storesInScope(stores, { kind: 'store', id: 'S2' })).map((a) => a.id), ['A2']);
  assert.equal(storesInScope(stores, { kind: 'all' }).length, 3);
  assert.equal(inScope(audits, storesInScope(stores, { kind: 'all' })).length, 3);
});

test('one wording set; single store reads differently where the table says so', () => {
  const all = wording({ kind: 'all' });
  const one = wording({ kind: 'store', id: 'S1' });
  assert.equal(all.trend, 'Store Performance');
  assert.equal(all.risk, 'All Observations by Risk');
  assert.equal(one.risk, 'Observations by Risk, this store');
  assert.equal(all.observations, 'Most common observations');
  assert.equal(one.observations, 'Most recent observations');
  assert.equal(one.issues, 'Open issues at this store');
  assert.equal(all.issues, 'Recent issues, all stores');
});

test('top observations rank by how often the text was recorded', () => {
  const obs = [
    { observation: 'Wet floor' }, { observation: 'Broken till' }, { observation: 'wet  floor ' },
    { observation: 'Expired stock' }, { observation: 'Wet floor' }, { observation: 'Broken till' }, { observation: '' },
  ];
  const top = topObservations(obs);
  assert.deepEqual(top.map((g) => [g.text, g.count]), [['Wet floor', 3], ['Broken till', 2], ['Expired stock', 1]]);
  for (const g of top) assert.equal(g.count, g.items.length);
  assert.equal(topObservations(obs, 1).length, 1);
});

test('repeat issues are only titles raised more than once, most repeats first', () => {
  const issues = [
    { title: 'CCTV gap' }, { title: 'Late deposit' }, { title: 'cctv gap' },
    { title: 'Late deposit' }, { title: 'Late deposit' }, { title: 'One off' },
  ];
  const rep = repeatIssues(issues);
  assert.deepEqual(rep.map((g) => [g.text, g.count]), [['Late deposit', 3], ['CCTV gap', 2]]);
  assert.deepEqual(repeatIssues([{ title: 'a' }, { title: 'b' }]), []);
});

test('recent observations are the highest sheet numbers first', () => {
  const obs = [{ sr_no: 1 }, { sr_no: 7 }, { sr_no: 3 }];
  assert.deepEqual(recentObservations(obs, 2).map((o) => o.sr_no), [7, 3]);
});
