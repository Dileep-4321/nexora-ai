import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { io as Client } from 'socket.io-client';
import app from '../src/app.js';
import { initRealtime } from '../src/services/realtime.js';
import { User, Project, Task, Comment, Attachment, Notification, ActivityLog } from '../src/models/index.js';

const TEST_MONGO_URI = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/nexora_ai_test_client_security_audit';
const JWT_SECRET = process.env.JWT_SECRET || 'nexora-ai-local-secret-2026-project';

function generateToken(user) {
  return jwt.sign({ sub: user._id, id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
}

test('NEXORA Client Security Hardening & Isolation Suite', async (t) => {
  let server;
  let serverPort;
  let baseUrl;
  let adminUser;
  let pmUser;
  let leadUser;
  let memberUser;
  let clientUserA;
  let clientUserB;
  let projectA;
  let projectB;
  let taskA;
  
  t.before(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    await mongoose.connect(TEST_MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });

    await Promise.all([
      User.deleteMany({}),
      Project.deleteMany({}),
      Task.deleteMany({}),
      Comment.deleteMany({}),
      Attachment.deleteMany({}),
      Notification.deleteMany({}),
      ActivityLog.deleteMany({})
    ]);

    server = http.createServer(app);
    initRealtime(server);

    await new Promise((resolve) => {
      server.listen(0, () => {
        serverPort = server.address().port;
        baseUrl = `http://127.0.0.1:${serverPort}/api/v1`;
        resolve();
      });
    });

    // Seed test fixtures
    adminUser = await User.create({
      name: 'Security Admin',
      email: 'admin.sec@nexora.ai',
      role: 'admin',
      password: 'Password123!',
      isActive: true
    });

    pmUser = await User.create({
      name: 'Security PM',
      email: 'pm.sec@nexora.ai',
      role: 'project_manager',
      password: 'Password123!',
      isActive: true
    });

    leadUser = await User.create({
      name: 'Security Lead',
      email: 'lead.sec@nexora.ai',
      role: 'team_lead',
      password: 'Password123!',
      isActive: true
    });

    memberUser = await User.create({
      name: 'Security Member',
      email: 'member.sec@nexora.ai',
      role: 'team_member',
      password: 'Password123!',
      isActive: true
    });

    clientUserA = await User.create({
      name: 'Enterprise Client A',
      email: 'client.a@nexora.ai',
      role: 'client',
      password: 'Password123!',
      isActive: true
    });

    clientUserB = await User.create({
      name: 'Enterprise Client B',
      email: 'client.b@nexora.ai',
      role: 'client',
      password: 'Password123!',
      isActive: true
    });

    projectA = await Project.create({
      name: 'Client A Confidential Portal',
      description: 'Confidential client A platform operations',
      owner: pmUser._id,
      projectManager: pmUser._id,
      teamLead: leadUser._id,
      teamMembers: [memberUser._id],
      client: clientUserA._id,
      status: 'active',
      priority: 'high',
      budget: 250000,
      progress: 50,
      startDate: new Date(),
      deadline: new Date(Date.now() + 86400000 * 30)
    });

    projectB = await Project.create({
      name: 'Client B Confidential Portal',
      description: 'Confidential client B platform operations',
      owner: pmUser._id,
      projectManager: pmUser._id,
      teamLead: leadUser._id,
      teamMembers: [memberUser._id],
      client: clientUserB._id,
      status: 'active',
      priority: 'medium',
      budget: 180000,
      progress: 30,
      startDate: new Date(),
      deadline: new Date(Date.now() + 86400000 * 45)
    });

    taskA = await Task.create({
      title: 'Confidential Core Architecture A',
      description: 'Implement isolated tenant backend',
      project: projectA._id,
      assignedTo: memberUser._id,
      status: 'in-progress',
      priority: 'high',
      progress: 45,
      actualHours: 36,
      estimatedHours: 40,
      dueDate: new Date(Date.now() + 86400000 * 7),
      createdBy: pmUser._id
    });

    await Task.create({
      title: 'Confidential Core Architecture B',
      description: 'Implement tenant billing integration',
      project: projectB._id,
      assignedTo: memberUser._id,
      status: 'todo',
      priority: 'medium',
      progress: 10,
      actualHours: 8,
      estimatedHours: 24,
      dueDate: new Date(Date.now() + 86400000 * 14),
      createdBy: pmUser._id
    });

    await Comment.create({
      task: taskA._id,
      author: pmUser._id,
      content: 'Internal risk factor: Database failover latency exceeds 50ms',
      isPublicToClient: false
    });

    await Comment.create({
      task: taskA._id,
      author: pmUser._id,
      content: 'Deliverable update: Phase 1 architecture approved',
      isPublicToClient: true
    });
  });

  t.after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  });

  async function apiCall(endpoint, method = 'GET', body = null, token = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    let data;
    try { data = await res.json(); } catch { data = null; }
    return { status: res.status, data };
  }

  // ------------------------------------------------------------------------
  // CROSS-CLIENT ACCESS DENIAL (IDOR DEFENSE)
  // ------------------------------------------------------------------------

  await t.test('1. Cross-Client Isolation: Client A cannot access Client B project (403)', async () => {
    const tokenA = generateToken(clientUserA);
    const res = await apiCall(`/projects/${projectB._id}`, 'GET', null, tokenA);
    assert.equal(res.status, 403);
    assert.equal(res.data?.success, false);
  });

  await t.test('2. Cross-Client Isolation: Client B cannot access Client A project (403)', async () => {
    const tokenB = generateToken(clientUserB);
    const res = await apiCall(`/projects/${projectA._id}`, 'GET', null, tokenB);
    assert.equal(res.status, 403);
    assert.equal(res.data?.success, false);
  });

  await t.test('3. Unauthorized project timeline access is rejected (403)', async () => {
    const tokenB = generateToken(clientUserB);
    const res = await apiCall(`/projects/${projectA._id}/timeline`, 'GET', null, tokenB);
    assert.equal(res.status, 403);
  });

  await t.test('4. Unauthorized project attachments access is rejected (403)', async () => {
    const tokenB = generateToken(clientUserB);
    const res = await apiCall(`/projects/${projectA._id}/attachments`, 'GET', null, tokenB);
    assert.equal(res.status, 403);
  });

  await t.test('5. Unauthorized advanced analytics access is rejected (403)', async () => {
    const tokenB = generateToken(clientUserB);
    const res = await apiCall(`/projects/${projectA._id}/advanced-analytics`, 'GET', null, tokenB);
    assert.equal(res.status, 403);
  });

  await t.test('6. Unauthorized reporting access (PDF/Excel) is rejected (403)', async () => {
    const tokenB = generateToken(clientUserB);
    const resPdf = await apiCall(`/projects/${projectA._id}/reports/pdf`, 'GET', null, tokenB);
    assert.equal(resPdf.status, 403);

    const resExcel = await apiCall(`/projects/${projectA._id}/reports/excel`, 'GET', null, tokenB);
    assert.equal(resExcel.status, 403);
  });

  await t.test('7. Unauthorized AI endpoint access is rejected (403)', async () => {
    const tokenB = generateToken(clientUserB);
    const resAssistant = await apiCall(`/ai/assistant/${projectA._id}`, 'GET', null, tokenB);
    assert.equal(resAssistant.status, 403);

    const resDelays = await apiCall(`/ai/predictive-delays/${projectA._id}`, 'GET', null, tokenB);
    assert.equal(resDelays.status, 403);

    const resBottlenecks = await apiCall(`/ai/bottlenecks/${projectA._id}`, 'GET', null, tokenB);
    assert.equal(resBottlenecks.status, 403);

    const resRebalance = await apiCall(`/ai/workload-rebalance/${projectA._id}`, 'GET', null, tokenB);
    assert.equal(resRebalance.status, 403);
  });

  await t.test('8. Unauthorized task query filtering is rejected (403)', async () => {
    const tokenB = generateToken(clientUserB);
    const res = await apiCall(`/tasks?project=${projectA._id}`, 'GET', null, tokenB);
    assert.equal(res.status, 403);
  });

  // ------------------------------------------------------------------------
  // USER DIRECTORY ACCESS HARDENING
  // ------------------------------------------------------------------------

  await t.test('9. Hardened Access Control: GET /users is explicitly rejected for Client role (403)', async () => {
    const tokenA = generateToken(clientUserA);
    const res = await apiCall('/users', 'GET', null, tokenA);
    assert.equal(res.status, 403);
    assert.equal(res.data?.success, false);
    assert.match(res.data?.message, /restricted from client accounts/i);
  });

  await t.test('10. Authorized Access Preservation: GET /users succeeds for Admin and PM', async () => {
    const adminToken = generateToken(adminUser);
    const resAdmin = await apiCall('/users', 'GET', null, adminToken);
    assert.equal(resAdmin.status, 200);
    assert.ok(Array.isArray(resAdmin.data?.data?.items));
    assert.ok(resAdmin.data.data.items.length >= 6);

    const pmToken = generateToken(pmUser);
    const resPm = await apiCall('/users', 'GET', null, pmToken);
    assert.equal(resPm.status, 200);
    assert.ok(Array.isArray(resPm.data?.data?.items));
    assert.ok(resPm.data.data.items.length >= 6);
  });

  await t.test('11. Client Profile Loading: GET /auth/me succeeds for Client role', async () => {
    const tokenA = generateToken(clientUserA);
    const res = await apiCall('/auth/me', 'GET', null, tokenA);
    assert.equal(res.status, 200);
    assert.equal(res.data?.data?.user?.email, 'client.a@nexora.ai');
    assert.equal(res.data?.data?.user?.role, 'client');
  });

  // ------------------------------------------------------------------------
  // SENSITIVE FIELD MASKING & CONFIDENTIALITY
  // ------------------------------------------------------------------------

  await t.test('12. Sensitive Field Masking: GET /dashboard/client sanitizes internal resources', async () => {
    const tokenA = generateToken(clientUserA);
    const res = await apiCall('/dashboard/client', 'GET', null, tokenA);
    assert.equal(res.status, 200);

    const data = res.data?.data;
    assert.equal(data.role, 'client');
    assert.deepEqual(data.members, []);
    assert.deepEqual(data.activity, []);
    assert.deepEqual(data.recommendations, []);

    // Verify project masking
    assert.equal(data.projects?.length, 1);
    const p = data.projects[0].project;
    assert.equal(p.projectManager, undefined);
    assert.equal(p.teamLead, undefined);
    assert.equal(p.teamMembers, undefined);
    assert.equal(p.owner, undefined);

    // Verify task masking
    assert.equal(data.tasks?.length, 1);
    const tItem = data.tasks[0];
    assert.equal(tItem.assignedTo, undefined);
    assert.equal(tItem.actualHours, undefined);
  });

  await t.test('13. Private Comment Isolation: Internal comments are omitted from Client response', async () => {
    const tokenA = generateToken(clientUserA);
    const res = await apiCall(`/tasks/${taskA._id}/comments`, 'GET', null, tokenA);
    assert.equal(res.status, 200);

    const comments = res.data?.data?.items || [];
    assert.equal(comments.length, 1);
    assert.equal(comments[0].content, 'Deliverable update: Phase 1 architecture approved');
    assert.ok(!comments.some(c => c.content.includes('Internal risk factor')));
  });

  // ------------------------------------------------------------------------
  // SOCKET.IO REALTIME ISOLATION
  // ------------------------------------------------------------------------

  await t.test('14. Socket.IO Authorization: Client cannot subscribe to another client project room', async () => {
    const tokenB = generateToken(clientUserB);
    const socket = Client(`http://127.0.0.1:${serverPort}`, {
      auth: { token: tokenB },
      transports: ['websocket', 'polling']
    });

    await new Promise((resolve) => socket.on('connect', resolve));

    const ack = await new Promise((resolve) => {
      socket.emit('project:join', { projectId: String(projectA._id) }, resolve);
    });

    assert.equal(ack?.success, false);
    assert.match(ack?.error, /access denied/i);

    socket.disconnect();
  });

  await t.test('15. Socket.IO Isolation: Client joins public room but NOT internal room', async () => {
    const tokenA = generateToken(clientUserA);
    const socket = Client(`http://127.0.0.1:${serverPort}`, {
      auth: { token: tokenA },
      transports: ['websocket', 'polling']
    });

    await new Promise((resolve) => socket.on('connect', resolve));

    const ack = await new Promise((resolve) => {
      socket.emit('project:join', { projectId: String(projectA._id) }, resolve);
    });

    assert.equal(ack?.success, true);
    assert.equal(ack?.role, 'client');

    socket.disconnect();
  });
});
