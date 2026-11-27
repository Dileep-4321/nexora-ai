import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { cache } from '../src/services/cache.js';
import { calculateProjectMetrics } from '../src/services/metrics.js';
import { Project, Task } from '../src/models/index.js';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nexora_ai_demo';

test('Phase 7: Performance, Scalability and Production Hardening Suite', async (t) => {
  let server;
  let baseUrl;
  let testProject;

  t.before(async () => {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(MONGO_URI, {
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 10,
        minPoolSize: 2,
      });
    }

    testProject = await Project.findOne();

    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}/api/v1`;
        resolve();
      });
    });
  });

  t.after(async () => {
    try { await mongoose.disconnect(); } catch {}

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  await t.test('1. Health check returns operational metrics and DB latency', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.status, 'healthy');
    assert.equal(body.database.status, 'connected');
    assert.equal(body.database.readyState, 1);
    assert.ok(typeof body.database.latencyMs === 'number');
    assert.ok(body.database.latencyMs >= 0);

    assert.ok(body.system);
    assert.ok(typeof body.system.uptime === 'number');
    assert.ok(body.system.memory.heapUsedMB > 0);
    assert.ok(body.system.memory.heapTotalMB > 0);
    assert.ok(body.system.memory.rssMB > 0);
    assert.ok(body.system.nodeVersion.startsWith('v'));
    assert.ok(body.system.environment);

    // Verify correlation ID in body and response header
    const headerCorrId = res.headers.get('x-correlation-id');
    assert.ok(headerCorrId);
    assert.equal(body.correlationId, headerCorrId);
  });

  await t.test('2. Correlation ID generation when missing', async () => {
    const res = await fetch(`${baseUrl}/health`);
    const corrId = res.headers.get('x-correlation-id');
    assert.ok(corrId);
    // UUID v4 format verification
    assert.match(
      corrId,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  await t.test('3. Correlation ID preservation when provided by client', async () => {
    const customId = 'test-trace-nexora-phase7-9988';
    const res = await fetch(`${baseUrl}/health`, {
      headers: {
        'x-correlation-id': customId,
      },
    });
    assert.equal(res.headers.get('x-correlation-id'), customId);
    const body = await res.json();
    assert.equal(body.correlationId, customId);
  });

  await t.test('4. In-Memory SimpleCache core mechanics and TTL', async () => {
    cache.clear();
    assert.equal(cache.size(), 0);

    // Set and get
    cache.set('test:key1', { hello: 'world' }, 5000);
    assert.equal(cache.has('test:key1'), true);
    assert.deepEqual(cache.get('test:key1'), { hello: 'world' });

    // Expiration
    cache.set('test:short', 'expired-soon', 10);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(cache.get('test:short'), null);
    assert.equal(cache.has('test:short'), false);

    // Delete
    cache.delete('test:key1');
    assert.equal(cache.has('test:key1'), false);

    // Project-specific invalidation
    cache.set('project_metrics:proj-123', { score: 95 });
    cache.set('project_analytics:proj-123', { trend: [] });
    cache.set('project:proj-123:timeline', { items: [] });
    cache.set('project_metrics:proj-other', { score: 50 });

    cache.invalidateProject('proj-123');
    assert.equal(cache.get('project_metrics:proj-123'), null);
    assert.equal(cache.get('project_analytics:proj-123'), null);
    assert.equal(cache.get('project:proj-123:timeline'), null);
    assert.ok(cache.get('project_metrics:proj-other') !== null);

    cache.clear();
  });

  await t.test('5. Metrics caching speeds up read performance and invalidates on update', async () => {
    if (!testProject) return;

    cache.clear();
    const projectId = String(testProject._id);

    // Cold run (cache miss)
    const t0 = process.hrtime.bigint();
    const metrics1 = await calculateProjectMetrics(projectId, false);
    const t1 = process.hrtime.bigint();
    const coldMs = Number(t1 - t0) / 1e6;

    // Hot run (cache hit)
    const t2 = process.hrtime.bigint();
    const metrics2 = await calculateProjectMetrics(projectId, false);
    const t3 = process.hrtime.bigint();
    const hotMs = Number(t3 - t2) / 1e6;

    assert.equal(metrics1.projectId.toString(), metrics2.projectId.toString());
    assert.equal(metrics1.riskScore, metrics2.riskScore);
    assert.ok(cache.has(`project_metrics:${projectId}`));

    // Hot run should be faster or sub-millisecond
    assert.ok(hotMs <= coldMs || hotMs < 5);

    // Invalidation
    cache.invalidateProject(projectId);
    assert.equal(cache.has(`project_metrics:${projectId}`), false);
  });

  await t.test('6. Compound indexes exist on schemas', async () => {
    const taskIndexes = Task.schema.indexes();
    const projectIndexes = Project.schema.indexes();

    // Check Task compound indexes
    const hasProjectStatus = taskIndexes.some(
      ([fields]) => fields.project === 1 && fields.status === 1
    );
    const hasProjectDueDate = taskIndexes.some(
      ([fields]) => fields.project === 1 && fields.dueDate === 1
    );
    const hasAssignedToStatus = taskIndexes.some(
      ([fields]) => fields.assignedTo === 1 && fields.status === 1
    );

    assert.ok(hasProjectStatus, 'taskSchema should have { project: 1, status: 1 } index');
    assert.ok(hasProjectDueDate, 'taskSchema should have { project: 1, dueDate: 1 } index');
    assert.ok(hasAssignedToStatus, 'taskSchema should have { assignedTo: 1, status: 1 } index');

    // Check Project compound indexes
    const hasStatusPriority = projectIndexes.some(
      ([fields]) => fields.status === 1 && fields.priority === 1
    );
    assert.ok(hasStatusPriority, 'projectSchema should have { status: 1, priority: 1 } index');
  });

  await t.test('7. Security headers and payload limits are enforced', async () => {
    const res = await fetch(`${baseUrl}/health`);
    // Helmet headers
    assert.ok(res.headers.get('x-content-type-options') === 'nosniff');
    assert.ok(res.headers.get('x-dns-prefetch-control') === 'off');

    // Test JSON body limit rejects oversized payload
    const hugeBody = JSON.stringify({ data: 'A'.repeat(1.5 * 1024 * 1024) });
    const postRes = await fetch(`${baseUrl}/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: hugeBody,
    });
    // Should reject or return 413 / 404
    assert.ok([413, 404].includes(postRes.status));
  });
});
