import test from 'node:test';
import assert from 'node:assert/strict';
import { preferredZone, saveZone, validZone, deviceZone, availableZones, zoneName } from '../dist/timezone.js';
import { localParts } from '../dist/analysis.js';

test('detection yields a valid IANA zone and rejects invalid stored values', () => {
  assert.ok(validZone(deviceZone()));
  assert.deepEqual(preferredZone({getItem: () => 'invalid'}, 'Asia/Kathmandu'), {zone:'Asia/Kathmandu', manual:false});
  assert.deepEqual(preferredZone(null, ''), {zone:'UTC', manual:false});
});
test('manual selection persists, automatic selection clears it, blocked storage is safe', () => {
  const values = new Map();
  const storage = {getItem:k => values.get(k), setItem:(k,v) => values.set(k,v), removeItem:k => values.delete(k)};
  saveZone(storage, 'Europe/Berlin');
  assert.deepEqual(preferredZone(storage, 'Asia/Tokyo'), {zone:'Europe/Berlin', manual:true});
  saveZone(storage, null);
  assert.deepEqual(preferredZone(storage, 'Asia/Tokyo'), {zone:'Asia/Tokyo', manual:false});
  const blocked = {getItem(){throw Error();}, setItem(){throw Error();}};
  assert.equal(preferredZone(blocked, 'UTC').zone, 'UTC');
  assert.doesNotThrow(() => saveZone(blocked, 'UTC'));
});
test('analysis accepts device zones outside the original list with quarter-hour boundaries and DST', () => {
  assert.equal(localParts(Date.parse('2026-09-14T18:15:00Z')/1000, 'Asia/Kathmandu').date, '2026-09-15');
  assert.equal(localParts(Date.parse('2026-09-14T18:15:00Z')/1000, 'Asia/Kathmandu').hour, 0);
  assert.equal(localParts(Date.parse('2026-07-01T12:00:00Z')/1000, 'America/Chicago').hour, 7);
  assert.equal(localParts(Date.parse('2026-01-01T12:00:00Z')/1000, 'America/Chicago').hour, 6);
  assert.throws(() => localParts(0, 'invalid'), RangeError);
});

test('timezone menu covers the global IANA list, including older browsers', () => {
  for (const zones of [availableZones(), availableZones({})]) {
    assert.ok(zones.length > 400);
    for (const zone of ['UTC', 'Asia/Kolkata', 'Asia/Dubai', 'America/Chicago', 'Pacific/Auckland', 'Africa/Johannesburg']) assert.ok(zones.includes(zone));
    assert.equal(new Set(zones).size, zones.length);
    assert.ok(zones.every(validZone));
  }
  assert.equal(zoneName('America/Argentina/Buenos_Aires'), 'Buenos Aires · America / Argentina');
});
