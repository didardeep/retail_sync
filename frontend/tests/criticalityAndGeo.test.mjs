import assert from 'node:assert/strict';
import test from 'node:test';

import { CRITICALITY_WEIGHT, criticalityOf } from '../src/lib/criticality.js';
import { currentPosition, geoLabel, mapLink } from '../src/lib/geo.js';

test('criticality comes from the row, or from the old flag and weight', () => {
  assert.equal(criticalityOf({ criticality: 'Medium', is_critical: true }), 'Medium');
  assert.equal(criticalityOf({ is_critical: true }), 'High');
  assert.equal(criticalityOf({ weight: 5 }), 'High');
  assert.equal(criticalityOf({ weight: 3 }), 'Medium');
  assert.equal(criticalityOf({ weight: 1 }), 'Low');
  assert.equal(criticalityOf({}), 'Low');
  assert.equal(criticalityOf({ criticality: 'Severe', weight: 3 }), 'Medium');
});

test('criticality weights match the server', () => {
  assert.deepEqual(CRITICALITY_WEIGHT, { High: 3, Medium: 2, Low: 1 });
});

test('currentPosition gives the coordinates, or null when refused or missing', async () => {
  const ok = { getCurrentPosition: (yes) => yes({ coords: { latitude: 28.6, longitude: 77.2, accuracy: 9 }, timestamp: Date.UTC(2026, 10, 23) }) };
  assert.deepEqual(await currentPosition({ geolocation: ok }),
    { lat: 28.6, lng: 77.2, accuracy: 9, captured_at: '2026-11-23T00:00:00.000Z' });
  const refused = { getCurrentPosition: (_yes, no) => no({ code: 1 }) };
  assert.equal(await currentPosition({ geolocation: refused }), null);
  assert.equal(await currentPosition({ geolocation: null }), null);
});

test('geo label and map link', () => {
  assert.equal(geoLabel({ lat: 28.61391, lng: 77.209, accuracy: 12.4 }), '28.61391, 77.20900 (±12 m)');
  assert.equal(geoLabel({ lat: 28.6, lng: 77.2 }), '28.60000, 77.20000');
  assert.equal(geoLabel(null), '');
  assert.equal(mapLink({ lat: 1.5, lng: 2 }), 'https://www.google.com/maps?q=1.5,2');
});
