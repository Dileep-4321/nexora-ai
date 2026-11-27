import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { User, Project, Task, Milestone } from '../src/models/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'nexora-ai-local-secret-2026-project';
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nexora_ai_demo';
const API_BASE = 'http://localhost:5001/api/v1';

function signToken(user) {
  return jwt.sign(
    { sub: user._id, role: user.role, tokenVersion: user.tokenVersion || 1 },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

test('NEXORA Balanced Master Enterprise Upgrade Test Suite', async (t) => {
  let pmUser, leadUser, memberUser, clientUser, project;
  let pmToken, leadToken, memberToken, clientToken;

  t.before(async () => {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(MONGO_URI);
    }
    pmUser = await User.findOne({ role: 'project_manager', isActive: true });
    leadUser = await User.findOne({ role: 'team_lead', isActive: true });
    memberUser = await User.findOne({ role: 'team_member', isActive: true });
    clientUser = await User.findOne({ role: 'client', isActive: true });
    project = await Project.findOne();

    pmToken = signToken(pmUser);
    leadToken = signToken(leadUser);
    memberToken = signToken(memberUser);
    clientToken = signToken(clientUser);
  });

  await t.test('1. Multi-Category Global Search returns all 6 categories for Project Manager', async () => {
    const res = await fetch(`${API_BASE}/search?q=NEXORA`, {
      headers: { Authorization: `Bearer ${pmToken}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data.projects), 'Projects must be an array');
    assert.ok(Array.isArray(body.data.tasks), 'Tasks must be an array');
    assert.ok(Array.isArray(body.data.members), 'Members must be an array');
    assert.ok(Array.isArray(body.data.milestones), 'Milestones must be an array');
    assert.ok(Array.isArray(body.data.documents), 'Documents must be an array');
    assert.ok(Array.isArray(body.data.discussions), 'Discussions must be an array');
  });

  await t.test('2. Global Search strictly masks internal staff & discussions for Client (Privacy Firewall)', async () => {
    const res = await fetch(`${API_BASE}/search?q=NEXORA`, {
      headers: { Authorization: `Bearer ${clientToken}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.members.length, 0, 'Client must receive 0 internal staff records');
    assert.equal(body.data.discussions.length, 0, 'Client must receive 0 internal discussion threads');
  });

  await t.test('3. Smart Calendar returns unified project deadlines, tasks, and milestones', async () => {
    const res = await fetch(`${API_BASE}/calendar`, {
      headers: { Authorization: `Bearer ${pmToken}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data.events));
    const kinds = new Set(body.data.events.map(e => e.kind));
    assert.ok(kinds.has('task') || kinds.has('milestone') || kinds.has('project_deadline'), 'Calendar must contain recognized event kinds');
  });

  await t.test('4. Unified Activity Timeline returns paginated events with role scoping', async () => {
    const res = await fetch(`${API_BASE}/activity?limit=10`, {
      headers: { Authorization: `Bearer ${pmToken}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data.items));
    assert.ok(body.data.pagination);
    assert.equal(body.data.pagination.limit, 10);
  });

  await t.test('5. Activity Timeline for Client masks developer IDs and internal activity', async () => {
    const res = await fetch(`${API_BASE}/activity`, {
      headers: { Authorization: `Bearer ${clientToken}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    for (const item of body.data.items) {
      assert.ok(!item.metadata?.employeeId, 'Employee ID must never leak to client');
      assert.equal(item.actor.name, 'NEXORA Delivery Team');
    }
  });

  await t.test('6. Project Templates: PM can save and list templates; Client access is 403', async () => {
    const saveRes = await fetch(`${API_BASE}/projects/${project._id}/template`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${pmToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'Enterprise SaaS Template' })
    });
    assert.equal(saveRes.status, 200);

    const listRes = await fetch(`${API_BASE}/project-templates`, {
      headers: { Authorization: `Bearer ${pmToken}` }
    });
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    assert.ok(listBody.data.items.length >= 1);

    const clientRes = await fetch(`${API_BASE}/project-templates`, {
      headers: { Authorization: `Bearer ${clientToken}` }
    });
    assert.equal(clientRes.status, 403, 'Client access to project templates must be 403');
  });

  await t.test('7. Task Recurrence can be configured with frequency and interval', async () => {
    const task = await Task.findOne({ project: project._id });
    assert.ok(task, 'Task must exist');

    const patchRes = await fetch(`${API_BASE}/tasks/${task._id}/recurrence`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${pmToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ frequency: 'weekly', interval: 2, isPaused: false })
    });
    assert.equal(patchRes.status, 200);
    const body = await patchRes.json();
    assert.equal(body.data.task.recurrence.frequency, 'weekly');
    assert.equal(body.data.task.recurrence.interval, 2);
  });

  await t.test('8. Tasks CSV Export returns valid CSV attachment', async () => {
    const res = await fetch(`${API_BASE}/projects/${project._id}/tasks/export-csv`, {
      headers: { Authorization: `Bearer ${pmToken}` }
    });
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type')?.includes('text/csv'));
    const text = await res.text();
    assert.ok(text.startsWith('Task ID,Title,Status'));
  });

  await t.test('9. Tasks CSV Import Preview validates columns and detects duplicates', async () => {
    const res = await fetch(`${API_BASE}/projects/${project._id}/tasks/import-preview`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${pmToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: project._id,
        rows: [
          { title: 'New Automation Test Task', dueDate: '2026-12-01', priority: 'high' },
          { title: '', dueDate: '2026-12-01' } // Invalid row
        ]
      })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.validCount, 1);
    assert.equal(body.data.errorCount, 1);
  });
});
