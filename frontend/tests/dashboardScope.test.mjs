import test from 'node:test';
import assert from 'node:assert/strict';

import {
  brandStyles, inScope, pickerParams, recentObservations, repeatIssues, resolveScope,
  scopeFromParams, scopeTitle, storesInScope, topObservations, trendQuery, wording,
} from '../src/lib/dashboardScope.js';

const brands = [{ id: 'b1', name: 'FreshMart' }, { id: 'b2', name: 'Urban Basket' }];
const stores = [
  { id: 'S1', name: 'Phoenix Mall', city: 'Mumbai', region: 'West India', brand_id: 'b1' },
  { id: 'S2', name: 'DLF Avenue', city: 'Delhi', region: 'North India', brand_id: 'b2' },
  { id: 'S3', name: 'Ub City', city: 'Bengaluru', region: 'South India', brand_id: 'b1' },
];

test('heading names the scope', () => {
  assert.equal(scopeTitle({ kind: 'all' }, stores, brands), 'All brands, all stores');
  assert.equal(scopeTitle({ kind: 'brand', id: 'b2' }, stores, brands), 'Urban Basket');
  assert.equal(scopeTitle({ kind: 'store', id: 'S1' }, stores, brands), 'Phoenix Mall - Mumbai, West India');
});

test('brand and store dropdowns work together or alone', () => {
  assert.deepEqual(pickerParams(stores, {}, { brand: 'b1' }), { brand: 'b1' });
  assert.deepEqual(pickerParams(stores, {}, { store: 'S2' }), { store: 'S2' });
  assert.deepEqual(pickerParams(stores, { brand: 'b1' }, { store: 'S3' }), { brand: 'b1', store: 'S3' });
  // a brand that does not own the picked store drops the store; one that does keeps it
  assert.deepEqual(pickerParams(stores, { store: 'S2' }, { brand: 'b1' }), { brand: 'b1' });
  assert.deepEqual(pickerParams(stores, { store: 'S3' }, { brand: 'b1' }), { brand: 'b1', store: 'S3' });
  // back to all brands keeps the store; clearing the store keeps the brand
  assert.deepEqual(pickerParams(stores, { brand: 'b1', store: 'S3' }, { brand: '' }), { store: 'S3' });
  assert.deepEqual(pickerParams(stores, { brand: 'b1', store: 'S3' }, { store: '' }), { brand: 'b1' });
});

test('scope comes from the URL', () => {
  assert.deepEqual(scopeFromParams(new URLSearchParams('store=S1&brand=b1')), { kind: 'store', id: 'S1' });
  assert.deepEqual(scopeFromParams(new URLSearchParams('brand=b1')), { kind: 'brand', id: 'b1' });
  assert.deepEqual(scopeFromParams(new URLSearchParams('')), { kind: 'all', id: '' });
  assert.deepEqual(resolveScope({ kind: 'store', id: 'gone' }, stores, brands), { kind: 'all', id: '' });
});

test('scope filters stores and everything that belongs to them', () => {
  const brandStores = storesInScope(stores, { kind: 'brand', id: 'b1' });
  assert.deepEqual(brandStores.map((s) => s.id), ['S1', 'S3']);
  const audits = [{ id: 'A1', store_id: 'S1' }, { id: 'A2', store_id: 'S2' }, { id: 'A3', store_id: 'S3' }];
  assert.deepEqual(inScope(audits, brandStores).map((a) => a.id), ['A1', 'A3']);
  assert.deepEqual(inScope(audits, storesInScope(stores, { kind: 'store', id: 'S2' })).map((a) => a.id), ['A2']);
  assert.equal(storesInScope(stores, { kind: 'all' }).length, 3);
});

test('one wording set; single store reads differently where the table says so', () => {
  const all = wording({ kind: 'all' });
  const one = wording({ kind: 'store', id: 'S1' });
  assert.equal(all.trend, 'Average audit score by quarter, per brand');
  assert.equal(one.trend, 'Audit score by quarter');
  assert.equal(all.risk, 'Observations by risk level, all stores');
  assert.equal(one.risk, 'Observations by risk level, this store');
  assert.equal(wording({ kind: 'brand', id: 'b1' }, 'FreshMart').risk, 'Observations by risk level, FreshMart');
  assert.equal(all.observations, 'Most common observations');
  assert.equal(one.observations, 'Most recent observations');
  assert.equal(one.issues, 'Open issues at this store');
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

test('brand colours are fixed by alphabetical brand and never repeat within 8 brands', () => {
  const all = brandStyles([...brands, { id: 'b0', name: 'Alpha' }]);
  assert.deepEqual(brandStyles(brands), brandStyles([...brands].reverse()));
  assert.equal(new Set(Object.values(all).map((s) => s.color)).size, 3);
  assert.equal(all.b0.color, '#2a78d6');
});

test('trend query lists only what is chosen', () => {
  assert.equal(trendQuery(), '');
  assert.equal(trendQuery({ brandIds: ['b1'] }), '?brand_ids=b1');
  assert.equal(trendQuery({ brandIds: ['b1'], storeIds: ['S1', 'S3'] }), '?brand_ids=b1&store_ids=S1%2CS3');
  assert.equal(trendQuery({ storeIds: [] }), '?store_ids=-');
});
