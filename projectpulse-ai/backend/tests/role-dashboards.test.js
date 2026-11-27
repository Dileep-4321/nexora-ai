import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { User, Project, Task, Notification, ActivityLog } from '../src/models/index.js';

const TEST_MONGO_URI = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/nexora_ai_test_role_dashboards';
const JWT_SECRET = process.env.JWT_SECRET || 'nexora-ai-local-secret-2026-project';

function generateToken(user) {
  return jwt.sign(
    { sub: user._id, id: user._id, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

test('NEXORA Four Role Dashboard & RBAC Test Suite', async (t) => {
  let server;
  let baseUrl;
  let adminUser;
  let pmUser;
  let leadUser;
  let memberUser;
  let clientUser;
  let testProject;

  let adminToken;
  let pmToken;
  let leadToken;
  let memberToken;
  let clientToken;

  t.before(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    await mongoose.connect(TEST_MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });

    // Clean test collections
    await Promise.all([
      User.deleteMany({}),
      Project.deleteMany({}),
      Task.deleteMany({}),
      Notification.deleteMany({}),
      ActivityLog.deleteMany({})
    ]);

    // Seed test users
    adminUser = await User.create({
      name: 'System Admin',
      email: 'admin.test@nexora.ai',
      password: 'Password123!',
      role: 'admin',
      jobTitle: 'Super Administrator',
      department: 'Platform Governance',
      isActive: true,
      availabilityStatus: 'available'
    });

    pmUser = await User.create({
      name: 'PM Test',
      email: 'pm.test@nexora.ai',
      password: 'Password123!',
      role: 'project_manager',
      jobTitle: 'Senior Delivery Lead',
      department: 'Product Delivery',
      isActive: true,
      availabilityStatus: 'busy'
    });

    leadUser = await User.create({
      name: 'Lead Test',
      email: 'lead.test@nexora.ai',
      password: 'Password123!',
      role: 'team_lead',
      jobTitle: 'Tech Lead',
      department: 'Engineering',
      isActive: true,
      availabilityStatus: 'available'
    });

    memberUser = await User.create({
      name: 'Dev Test',
      email: 'dev.test@nexora.ai',
      password: 'Password123!',
      role: 'team_member',
      jobTitle: 'Fullstack Engineer',
      department: 'Engineering',
      isActive: true,
      availabilityStatus: 'available',
      productivityScore: 88
    });

    clientUser = await User.create({
      name: 'Client Test',
      email: 'client.test@nexora.ai',
      password: 'Password123!',
      role: 'client',
      jobTitle: 'Product Sponsor',
      department: 'Executive Stakeholders',
      isActive: true,
      availabilityStatus: 'available'
    });

    // Seed test project with all roles assigned
    testProject = await Project.create({
      name: 'Enterprise Core Platform',
      code: 'ECP',
      description: 'Core microservices and intelligence engine',
      owner: adminUser._id,
      projectManager: pmUser._id,
      teamLead: leadUser._id,
      client: clientUser._id,
      teamMembers: [memberUser._id],
      status: 'in-progress',
      priority: 'high',
      deadline: new Date(Date.now() + 30 * 86400000),
      budget: 150000
    });

    // Seed tasks
    await Task.create([
      {
        title: 'Architect RBAC & Multi-Role Control Plane',
        project: testProject._id,
        assignedTo: memberUser._id,
        status: 'in-progress',
        priority: 'high',
        progress: 60,
        dueDate: new Date(Date.now() + 5 * 86400000)
      },
      {
        title: 'Unassigned Sprint Deliverable',
        project: testProject._id,
        status: 'todo',
        priority: 'critical',
        riskLevel: 'high',
        progress: 0,
        dueDate: new Date(Date.now() + 2 * 86400000)
      }
    ]);

    // Generate tokens
    adminToken = generateToken(adminUser);
    pmToken = generateToken(pmUser);
    leadToken = generateToken(leadUser);
    memberToken = generateToken(memberUser);
    clientToken = generateToken(clientUser);

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
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (mongoose.connection.readyState !== 0) {
      await User.deleteMany({});
      await Project.deleteMany({});
      await Task.deleteMany({});
      await Notification.deleteMany({});
      await ActivityLog.deleteMany({});
      await mongoose.disconnect();
    }
  });

  await t.test('1. Health telemetry endpoint returns 200 with database latency and system memory', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.status, 'healthy');
    assert.equal(body.database.status, 'connected');
    assert.ok(typeof body.database.latencyMs === 'number' || body.database.latencyMs === null);
    assert.ok(typeof body.system.uptime === 'number');
    assert.ok(typeof body.system.memory.heapUsedMB === 'number');
  });

  await t.test('2. Admin Dashboard: GET /dashboard/admin returns platform-wide metrics and all users', async () => {
    const res = await fetch(`${baseUrl}/dashboard/admin`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.role, 'admin');
    assert.ok(Array.isArray(body.data.projects));
    assert.equal(body.data.projects.length, 1);
    assert.ok(Array.isArray(body.data.tasks));
    assert.equal(body.data.tasks.length, 2);
    assert.ok(Array.isArray(body.data.members));
    assert.ok(body.data.members.length >= 4); // admin, pm, lead, member
    assert.equal(body.data.totals.projects, 1);
    assert.equal(body.data.totals.tasks, 2);
  });

  await t.test('3. Project Manager Dashboard: GET /dashboard/project_manager returns scoped project metrics', async () => {
    const res = await fetch(`${baseUrl}/dashboard/project_manager`, {
      headers: { Authorization: `Bearer ${pmToken}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.role, 'project_manager');
    assert.ok(Array.isArray(body.data.projects));
    assert.equal(body.data.projects.length, 1);
    assert.ok(body.data.totals.tasks >= 1);
  });

  await t.test('4. Team Lead Dashboard: GET /dashboard/team_lead returns sprint tasks and squad engineers', async () => {
    const res = await fetch(`${baseUrl}/dashboard/team_lead`, {
      headers: { Authorization: `Bearer ${leadToken}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.role, 'team_lead');
    assert.ok(Array.isArray(body.data.projects));
    assert.ok(Array.isArray(body.data.tasks));
    assert.ok(Array.isArray(body.data.members));
  });

  await t.test('5. Team Member Dashboard: GET /dashboard/team_member returns personal tasks and productivity', async () => {
    const res = await fetch(`${baseUrl}/dashboard/team_member`, {
      headers: { Authorization: `Bearer ${memberToken}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.role, 'team_member');
    assert.ok(Array.isArray(body.data.tasks));
    assert.equal(body.data.tasks.length, 1); // Only assigned tasks
    assert.equal(body.data.tasks[0].title, 'Architect RBAC & Multi-Role Control Plane');
    assert.equal(body.data.totals.productivity, 88);
  });

  await t.test('6. Client Dashboard: GET /dashboard/client masks team members and internal developer metrics', async () => {
    const res = await fetch(`${baseUrl}/dashboard/client`, {
      headers: { Authorization: `Bearer ${clientToken}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.role, 'client');
    assert.equal(body.data.members.length, 0); // Members masked for client
    const proj = body.data.projects[0].project;
    assert.equal(proj.teamMembers, undefined); // Masked
    assert.equal(proj.projectManager, undefined); // Masked
    assert.equal(proj.teamLead, undefined); // Masked
  });

  await t.test('7. Role Isolation: Team Member attempting GET /dashboard/admin is rejected with 403', async () => {
    const res = await fetch(`${baseUrl}/dashboard/admin`, {
      headers: { Authorization: `Bearer ${memberToken}` }
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.message, /Dashboard role does not match your session/);
  });

  await t.test('8. Role Isolation: Team Lead attempting GET /dashboard/project_manager is rejected with 403', async () => {
    const res = await fetch(`${baseUrl}/dashboard/project_manager`, {
      headers: { Authorization: `Bearer ${leadToken}` }
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  await t.test('9. Role Isolation: Client attempting GET /dashboard/admin is rejected with 403', async () => {
    const res = await fetch(`${baseUrl}/dashboard/admin`, {
      headers: { Authorization: `Bearer ${clientToken}` }
    });
    assert.equal(res.status, 403);
  });

  await t.test('10. Role Isolation: PM attempting GET /dashboard/team_member is rejected with 403', async () => {
    const res = await fetch(`${baseUrl}/dashboard/team_member`, {
      headers: { Authorization: `Bearer ${pmToken}` }
    });
    assert.equal(res.status, 403);
  });

  await t.test('11. Admin User Governance: Admin can toggle user active state', async () => {
    const res = await fetch(`${baseUrl}/users/${memberUser._id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ isActive: false })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.user.isActive, false);

    // Revert back to active
    await fetch(`${baseUrl}/users/${memberUser._id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ isActive: true })
    });
  });

  await t.test('12. Admin Privilege Enforcement: Non-admin calling DELETE /users/:userId is rejected with 403', async () => {
    const res = await fetch(`${baseUrl}/users/${memberUser._id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${pmToken}` }
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.message, /Access denied: Account deletion and deactivation requires Admin privileges/);
  });
});
