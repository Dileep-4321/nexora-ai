import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import express from 'express';
import cors from 'cors';
import router from '../src/routes/index.js';
import { errorHandler } from '../src/middleware/errors.js';
import { User, Project, Task } from '../src/models/index.js';
import {
  hasCycle,
  validateDependencies,
  calculateCriticalPath,
  getProjectTimeline,
  } from '../src/services/timeline.js';

const JWT_SECRET = process.env.JWT_SECRET || 'nexora-ai-local-secret-2026-project';
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nexora_ai_demo';

function signToken(user) {
  return jwt.sign(
    { sub: user._id, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

test('Phase 4: Gantt Chart and Interactive Project Timeline Suite', async (t) => {
  let server;
  let baseUrl;
  let pmUser;
  let clientUser;
  let project;
  let sampleTaskA;
  let sampleTaskB;
    let pmToken;
  let clientToken;

  t.before(async () => {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(MONGO_URI);
    }

    pmUser = await User.findOne({ role: 'project_manager' });
    clientUser = await User.findOne({ role: 'client' });
    project = await Project.findOne();

    assert.ok(pmUser, 'PM user must exist');
    assert.ok(clientUser, 'Client user must exist');
    assert.ok(project, 'Project must exist');

    const projectTasks = await Task.find({ project: project._id }).limit(3);
    assert.ok(projectTasks.length >= 2, 'Need at least 2 tasks in project for testing');
    [sampleTaskA, sampleTaskB] = projectTasks;

    pmToken = signToken(pmUser);
    clientToken = signToken(clientUser);

    const app = express();
    app.use(cors());
    app.use(express.json());
    app.use('/api/v1', router);
    app.use(errorHandler);

    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}/api/v1`;
        resolve();
      });
    });
  });

  t.after(async () => {
    // Reset sample task dependencies to avoid side effects
    if (sampleTaskA) {
      await Task.updateOne({ _id: sampleTaskA._id }, { dependencies: [] });
    }
    if (sampleTaskB) {
      await Task.updateOne({ _id: sampleTaskB._id }, { dependencies: [] });
    }
    if (server) await new Promise((r) => server.close(r));
    await mongoose.disconnect();
  });

  await t.test('1. Cycle detection algorithm correctly identifies directed circular loops', async () => {
    const acyclicGraph = new Map([
      ['A', ['B']],
      ['B', ['C']],
      ['C', []]
    ]);
    assert.equal(hasCycle(acyclicGraph), false, 'Acyclic graph must not have cycles');

    const cyclicGraph = new Map([
      ['A', ['B']],
      ['B', ['C']],
      ['C', ['A']]
    ]);
    assert.equal(hasCycle(cyclicGraph), true, 'Cyclic graph must be detected');

    const selfCycle = new Map([
      ['A', ['A']]
    ]);
    assert.equal(hasCycle(selfCycle), true, 'Self loop must be detected as cycle');
  });

  await t.test('2. Dependency validation rejects self-dependency', async () => {
    await assert.rejects(
      async () => {
        await validateDependencies(sampleTaskA._id, [sampleTaskA._id], project._id);
      },
      (err) => err.status === 400 && err.message.includes('cannot depend on itself')
    );
  });

  await t.test('3. Dependency validation rejects circular dependencies (A -> B -> A)', async () => {
    // Temporarily set Task B to depend on Task A
    await Task.updateOne({ _id: sampleTaskB._id }, { dependencies: [sampleTaskA._id] });

    // Now try to set Task A to depend on Task B
    await assert.rejects(
      async () => {
        await validateDependencies(sampleTaskA._id, [sampleTaskB._id], project._id);
      },
      (err) => err.status === 400 && err.message.includes('Circular dependency detected')
    );

    // Clean up
    await Task.updateOne({ _id: sampleTaskB._id }, { dependencies: [] });
  });

  await t.test('4. Critical path calculation identifies sequence of zero-float tasks', async () => {
    const mockTasks = [
      { _id: '1', durationDays: 3, dependencies: [] },
      { _id: '2', durationDays: 5, dependencies: ['1'] },
      { _id: '3', durationDays: 2, dependencies: ['1'] },
      { _id: '4', durationDays: 4, dependencies: ['2'] }
    ];
    const cp = calculateCriticalPath(mockTasks);
    // Path 1 -> 2 -> 4 has duration 3 + 5 + 4 = 12 (Critical Path)
    // Path 1 -> 3 has duration 3 + 2 = 5
    assert.ok(cp.includes('1'), 'Task 1 must be on critical path');
    assert.ok(cp.includes('2'), 'Task 2 must be on critical path');
    assert.ok(cp.includes('4'), 'Task 4 must be on critical path');
    assert.equal(cp.includes('3'), false, 'Task 3 has float and should not be on critical path');
  });

  await t.test('5. Service: getProjectTimeline preserves legacy tasks without start dates', async () => {
    const timeline = await getProjectTimeline(project._id, 'project_manager');
    assert.ok(timeline.project, 'Project metadata must be returned');
    assert.ok(Array.isArray(timeline.tasks), 'Tasks must be array');
    assert.ok(Array.isArray(timeline.milestones), 'Milestones must be array');
    assert.ok(Array.isArray(timeline.criticalPathTaskIds), 'Critical path IDs must be array');

    for (const tsk of timeline.tasks) {
      assert.ok(tsk.startDate, 'startDate must be resolved or inferred');
      assert.ok(tsk.dueDate, 'dueDate must be present');
      assert.ok(typeof tsk.durationDays === 'number' && tsk.durationDays >= 1);
      assert.ok(typeof tsk.isInferredStartDate === 'boolean');
      assert.ok(['low', 'medium', 'high', 'critical'].includes(tsk.riskLevel));
    }
  });

  await t.test('6. Service: getProjectTimeline masks internal developer status for client role', async () => {
    const clientTimeline = await getProjectTimeline(project._id, 'client');
    for (const tsk of clientTimeline.tasks) {
      if (tsk.assignedTo) {
        assert.equal(
          tsk.assignedTo.availability,
          undefined,
          'Developer availability status must be masked from client'
        );
      }
    }
  });

  await t.test('7. API: GET /projects/:projectId/timeline returns 200 with complete timeline payload', async () => {
    const res = await fetch(`${baseUrl}/projects/${project._id}/timeline`, {
      headers: { Authorization: `Bearer ${pmToken}` }
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.data.tasks.length > 0);
    assert.ok(json.data.milestones.length > 0);
  });

  await t.test('8. API: PATCH /tasks/:taskId/schedule updates dates and validates dueDate >= startDate', async () => {
    // Valid update
    const validStart = new Date(Date.now() - 2 * 86400000).toISOString();
    const validDue = new Date(Date.now() + 10 * 86400000).toISOString();

    const resValid = await fetch(`${baseUrl}/tasks/${sampleTaskA._id}/schedule`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pmToken}`
      },
      body: JSON.stringify({ startDate: validStart, dueDate: validDue })
    });
    assert.equal(resValid.status, 200);
    const jsonValid = await resValid.json();
    assert.equal(jsonValid.success, true);
    assert.equal(new Date(jsonValid.data.task.startDate).toISOString(), validStart);

    // Invalid update: dueDate precedes startDate
    const invalidStart = new Date(Date.now() + 10 * 86400000).toISOString();
    const invalidDue = new Date(Date.now() + 2 * 86400000).toISOString();

    const resInvalid = await fetch(`${baseUrl}/tasks/${sampleTaskA._id}/schedule`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pmToken}`
      },
      body: JSON.stringify({ startDate: invalidStart, dueDate: invalidDue })
    });
    assert.equal(resInvalid.status, 400);
    const jsonInvalid = await resInvalid.json();
    assert.equal(jsonInvalid.success, false);
    assert.ok(jsonInvalid.message.includes('Due date cannot precede start date'));
  });

  await t.test('9. API: POST /tasks/:taskId/dependencies adds dependency and prevents cycles', async () => {
    // Add valid dependency
    const resAdd = await fetch(`${baseUrl}/tasks/${sampleTaskB._id}/dependencies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pmToken}`
      },
      body: JSON.stringify({ dependsOnTaskId: sampleTaskA._id })
    });
    assert.equal(resAdd.status, 200);
    const jsonAdd = await resAdd.json();
    assert.equal(jsonAdd.success, true);
    assert.ok(jsonAdd.data.task.dependencies.map(String).includes(String(sampleTaskA._id)));

    // Attempt to add circular dependency: Task A depends on Task B
    const resCycle = await fetch(`${baseUrl}/tasks/${sampleTaskA._id}/dependencies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pmToken}`
      },
      body: JSON.stringify({ dependsOnTaskId: sampleTaskB._id })
    });
    assert.equal(resCycle.status, 400);
    const jsonCycle = await resCycle.json();
    assert.ok(jsonCycle.message.includes('Circular dependency detected'));

    // Remove dependency
    const resDel = await fetch(`${baseUrl}/tasks/${sampleTaskB._id}/dependencies/${sampleTaskA._id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${pmToken}` }
    });
    assert.equal(resDel.status, 200);
  });

  await t.test('10. API: Client role is restricted from editing schedules (403)', async () => {
    const resClient = await fetch(`${baseUrl}/tasks/${sampleTaskA._id}/schedule`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${clientToken}`
      },
      body: JSON.stringify({ dueDate: new Date().toISOString() })
    });
    assert.equal(resClient.status, 403, 'Client must be forbidden from updating schedules');
  });
});
