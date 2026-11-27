import 'dotenv/config';
import test from 'node:test'; import assert from 'node:assert/strict'; import { riskBand, healthBand } from '../src/services/metrics.js';
test('risk bands are stable and inclusive', () => { assert.equal(riskBand(0), 'low'); assert.equal(riskBand(24), 'low'); assert.equal(riskBand(25), 'medium'); assert.equal(riskBand(50), 'high'); assert.equal(riskBand(75), 'critical'); });
test('health bands use canonical threshold', () => { assert.equal(healthBand(0), 'excellent'); assert.equal(healthBand(25), 'good'); assert.equal(healthBand(50), 'warning'); assert.equal(healthBand(75), 'critical'); });
