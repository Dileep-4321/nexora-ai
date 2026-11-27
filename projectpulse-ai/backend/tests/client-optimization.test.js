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

const TEST_MONGO_URI = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/nexora_ai_test_client_optimization';
const JWT_SECRET = process.env.JWT_SECRET || 'nexora-ai-local-secret-2026-project';

function generateToken(user) {
  return jwt.sign({ sub: user._id, id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
}

test('NEXORA Client Dashboard Optimization & RBAC Verification Suite', async (t) => {
  let server;
  let ioServer;
  let serverPort;
  let baseUrl;
  let adminUser;
  let pmUser;
  let leadUser;
  let memberUser;
  let clientUser;
  let project;
  let task;

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
    ioServer = initRealtime(server);

    await new Promise((resolve) => {
      server.listen(0, () => {
        serverPort = server.address().port;
        baseUrl = `http://127.0.0.1:${serverPort}/api/v1`;
        resolve();
      });
    });

    adminUser = await User.create({
      name: 'System Admin',
      email: 'admin_test@nexora.ai',
      password: 'HashedPassword123!',
      role: 'admin',
      isActive: true
    });

    pmUser = await User.create({
      name: 'Dileep PM',
      email: 'pm_test@nexora.ai',
      password: 'HashedPassword123!',
      role: 'project_manager',
      isActive: true
    });

    leadUser = await User.create({
      name: 'Sohel Lead',
      email: 'lead_test@nexora.ai',
      password: 'HashedPassword123!',
      role: 'team_lead',
      isActive: true
    });

    memberUser = await User.create({
      name: 'Hemavardhan Dev',
      email: 'dev_test@nexora.ai',
      password: 'HashedPassword123!',
      role: 'team_member',
      isActive: true
    });

    clientUser = await User.create({
      name: 'Punith Client',
      email: 'client_test@nexora.ai',
      password: 'HashedPassword123!',
      role: 'client',
      isActive: true
    });

    project = await Project.create({
      name: 'Client Optimization Alpha',
      description: 'Executive portal demonstration engagement',
      status: 'active',
      priority: 'high',
      budget: 150000,
      startDate: new Date('2026-01-01'),
      deadline: new Date('2026-12-31'),
      owner: adminUser._id,
      projectManager: pmUser._id,
      teamLead: leadUser._id,
      client: clientUser._id,
      teamMembers: [
        { user: pmUser._id, role: 'Project Manager', allocationPercentage: 100 },
        { user: leadUser._id, role: 'Team Lead', allocationPercentage: 100 },
        { user: memberUser._id, role: 'Developer', allocationPercentage: 100 }
      ]
    });

    task = await Task.create({
      title: 'Phase 8 Deliverable Package',
      description: 'Production deliverable package with executive summary',
      project: project._id,
      assignedTo: memberUser._id,
      status: 'in-progress',
      priority: 'high',
      progress: 65,
      estimatedHours: 40,
      actualHours: 25,
      startDate: new Date('2026-01-10'),
      dueDate: new Date('2026-06-30')
    });
  });

  t.after(async () => {
    if (ioServer && typeof ioServer.close === 'function') {
      await new Promise((resolve) => ioServer.close(resolve));
    }
    if (server && server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.disconnect();
  });

  // Helper for API calls
  async function apiCall(endpoint, method = 'GET', body = null, token = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);
    const res = await fetch(`${baseUrl}${endpoint}`, options);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = null; }
    return { status: res.status, ok: res.ok, data: json, text };
  }

  // --- SECTION 1: CLIENT RBAC FORBIDDEN ENDPOINTS (EXPECT 403) ---

  await t.test('1. Client RBAC: POST /projects/:id/employees is rejected with 403', async () => {
    const clientToken = generateToken(clientUser);
    const res = await apiCall(`/projects/${project._id}/employees`, 'POST', {
      name: 'Unauth User',
      email: 'unauth@nexora.ai',
      password: 'Password123!',
      role: 'team_member'
    }, clientToken);
    assert.equal(res.status, 403, 'Expected 403 Forbidden for client employee creation');
  });

  await t.test('2. Client RBAC: POST /projects/:id/members is rejected with 403', async () => {
    const clientToken = generateToken(clientUser);
    const res = await apiCall(`/projects/${project._id}/members`, 'POST', {
      userId: memberUser._id,
      role: 'developer'
    }, clientToken);
    assert.equal(res.status, 403, 'Expected 403 Forbidden for client member addition');
  });

  await t.test('3. Client RBAC: DELETE /projects/:id/members/:memberId is rejected with 403', async () => {
    const clientToken = generateToken(clientUser);
    const res = await apiCall(`/projects/${project._id}/members/${memberUser._id}`, 'DELETE', null, clientToken);
    assert.equal(res.status, 403, 'Expected 403 Forbidden for client member removal');
  });

  await t.test('4. Client RBAC: DELETE /users/:id is rejected with 403', async () => {
    const clientToken = generateToken(clientUser);
    const res = await apiCall(`/users/${memberUser._id}`, 'DELETE', null, clientToken);
    assert.equal(res.status, 403, 'Expected 403 Forbidden for client user deletion');
  });

  await t.test('5. Client RBAC: POST /tasks is rejected with 403', async () => {
    const clientToken = generateToken(clientUser);
    const res = await apiCall('/tasks', 'POST', {
      title: 'Illegal Client Task',
      project: project._id,
      priority: 'high'
    }, clientToken);
    assert.equal(res.status, 403, 'Expected 403 Forbidden for client task creation');
  });

  await t.test('6. Client RBAC: PATCH /tasks/:id/status is rejected with 403', async () => {
    const clientToken = generateToken(clientUser);
    const res = await apiCall(`/tasks/${task._id}/status`, 'PATCH', {
      status: 'completed'
    }, clientToken);
    assert.equal(res.status, 403, 'Expected 403 Forbidden for client status update');
  });

  await t.test('7. Client RBAC: PATCH /tasks/:id/schedule is rejected with 403', async () => {
    const clientToken = generateToken(clientUser);
    const res = await apiCall(`/tasks/${task._id}/schedule`, 'PATCH', {
      startDate: new Date(),
      dueDate: new Date(Date.now() + 86400000)
    }, clientToken);
    assert.equal(res.status, 403, 'Expected 403 Forbidden for client schedule modification');
  });

  await t.test('8. Client RBAC: POST /tasks/:id/reassign is rejected with 403', async () => {
    const clientToken = generateToken(clientUser);
    const res = await apiCall(`/tasks/${task._id}/reassign`, 'POST', {
      memberId: leadUser._id
    }, clientToken);
    assert.equal(res.status, 403, 'Expected 403 Forbidden for client task reassignment');
  });

  await t.test('9. Client RBAC: GET /projects/:id/workload is rejected with 403', async () => {
    const clientToken = generateToken(clientUser);
    const res = await apiCall(`/projects/${project._id}/workload`, 'GET', null, clientToken);
    assert.equal(res.status, 403, 'Expected 403 Forbidden for client workload access');
  });

  await t.test('10. Client RBAC: GET /projects/:id/resource-recommendations is rejected with 403', async () => {
    const clientToken = generateToken(clientUser);
    const res = await apiCall(`/projects/${project._id}/resource-recommendations`, 'GET', null, clientToken);
    assert.equal(res.status, 403, 'Expected 403 Forbidden for client resource recommendations access');
  });

  await t.test('11. Client RBAC: GET /ai/workload-rebalance/:id is rejected with 403', async () => {
    const clientToken = generateToken(clientUser);
    const res = await apiCall(`/ai/workload-rebalance/${project._id}`, 'GET', null, clientToken);
    assert.equal(res.status, 403, 'Expected 403 Forbidden for client AI workload rebalance access');
  });

  // --- SECTION 2: CLIENT DATA MASKING & SANITIZATION ---

  await t.test('12. Client Masking: GET /tasks omits assignedTo, actualHours, and estimatedHours for client', async () => {
    const clientToken = generateToken(clientUser);
    const res = await apiCall('/tasks', 'GET', null, clientToken);
    assert.equal(res.status, 200);
    const tasks = res.data?.data?.tasks || res.data?.tasks || [];
    assert.ok(tasks.length > 0, 'Tasks should be returned');
    const returnedTask = tasks.find((t) => String(t._id || t.id) === String(task._id));
    assert.ok(returnedTask, 'Test task found in list');
    assert.strictEqual(returnedTask.assignedTo, undefined, 'assignedTo must be omitted for client');
    assert.strictEqual(returnedTask.actualHours, undefined, 'actualHours must be omitted for client');
    assert.strictEqual(returnedTask.estimatedHours, undefined, 'estimatedHours must be omitted for client');
  });

  await t.test('13. Client Masking: GET /projects/:id omits teamMembers, owner, projectManager, and teamLead for client', async () => {
    const clientToken = generateToken(clientUser);
    const res = await apiCall(`/projects/${project._id}`, 'GET', null, clientToken);
    assert.equal(res.status, 200);
    const proj = res.data?.data?.project || res.data?.project;
    assert.ok(proj, 'Project must be returned');
    assert.deepEqual(proj.teamMembers, [], 'teamMembers must be empty array for client');
    assert.strictEqual(proj.owner, undefined, 'owner must be omitted for client');
    assert.strictEqual(proj.projectManager, undefined, 'projectManager must be omitted for client');
    assert.strictEqual(proj.teamLead, undefined, 'teamLead must be omitted for client');
  });

  await t.test('14. Client Masking: GET /projects/:id/timeline sets assignedTo to null and masks delayDays for client', async () => {
    const clientToken = generateToken(clientUser);
    const res = await apiCall(`/projects/${project._id}/timeline`, 'GET', null, clientToken);
    assert.equal(res.status, 200);
    const timeline = res.data?.data || res.data;
    assert.ok(timeline.tasks, 'Timeline tasks returned');
    const tItem = timeline.tasks.find((t) => String(t._id || t.id) === String(task._id));
    assert.ok(tItem, 'Timeline task found');
    assert.strictEqual(tItem.assignedTo, null, 'assignedTo must be null in client timeline');
    assert.strictEqual(tItem.delayDays, 0, 'delayDays must be masked to 0 for client');
  });

  await t.test('15. Client Masking: GET /ai/assistant/:id masks delay risk assignee and sets client-safe copy', async () => {
    const clientToken = generateToken(clientUser);
    const res = await apiCall(`/ai/assistant/${project._id}`, 'GET', null, clientToken);
    assert.equal(res.status, 200);
    const assistant = res.data?.data || res.data;
    assert.ok(assistant.cards, 'AI assistant cards returned');
    for (const card of assistant.cards) {
      if (card.type === 'delay_risk') {
        assert.ok(!card.evidence || card.evidence.every((e) => !e.assignee), 'No assignee in delay_risk card');
        assert.ok(!card.suggestedAction.toLowerCase().includes('rebalance'), 'Client suggested action must be client-safe');
      }
    }
  });

  // --- SECTION 3: COMMENT VISIBILITY ISOLATION (isPublicToClient) ---

  await t.test('16. Comment Isolation: PM can create internal comment (isPublicToClient: false) hidden from client', async () => {
    const pmToken = generateToken(pmUser);
    const clientToken = generateToken(clientUser);

    // PM creates internal comment
    const internalRes = await apiCall(`/tasks/${task._id}/comments`, 'POST', {
      content: 'CONFIDENTIAL INTERNAL: Team is debugging memory issue before client presentation.',
      isPublicToClient: false
    }, pmToken);
    assert.equal(internalRes.status, 201);
    const internalComment = internalRes.data?.data?.comment || internalRes.data?.comment;
    assert.equal(internalComment.isPublicToClient, false, 'Internal comment marked isPublicToClient: false');

    // PM creates public comment
    const publicRes = await apiCall(`/tasks/${task._id}/comments`, 'POST', {
      content: 'PUBLIC: Milestone deliverable package is on schedule for review.',
      isPublicToClient: true
    }, pmToken);
    assert.equal(publicRes.status, 201);

    // Client fetches comments
    const clientCommentsRes = await apiCall(`/tasks/${task._id}/comments`, 'GET', null, clientToken);
    assert.equal(clientCommentsRes.status, 200);
    const clientComments = clientCommentsRes.data?.data?.comments || clientCommentsRes.data?.comments || [];

    const foundInternal = clientComments.some((c) => c.content.includes('CONFIDENTIAL INTERNAL'));
    const foundPublic = clientComments.some((c) => c.content.includes('PUBLIC: Milestone deliverable'));

    assert.equal(foundInternal, false, 'Client must NOT see internal comment (isPublicToClient: false)');
    assert.equal(foundPublic, true, 'Client MUST see public comment (isPublicToClient: true)');

    // Client verifies author email is stripped
    for (const c of clientComments) {
      assert.strictEqual(c.author?.email, undefined, 'Author email must be stripped for client');
    }
  });

  await t.test('17. Comment Isolation: Client posting comment always enforces isPublicToClient: true', async () => {
    const clientToken = generateToken(clientUser);
    const res = await apiCall(`/tasks/${task._id}/comments`, 'POST', {
      content: 'Client feedback: Deliverable looks great, approved for milestone staging.',
      isPublicToClient: false // Attempting to set false
    }, clientToken);
    assert.equal(res.status, 201);
    const created = res.data?.data?.comment || res.data?.comment;
    assert.equal(created.isPublicToClient, true, 'Client comment must force isPublicToClient: true');
  });

  // --- SECTION 4: REAL-TIME SOCKET ISOLATION ---

  await t.test('18. Realtime Isolation: Client does NOT receive socket event for internal comment', async () => {
    const clientToken = generateToken(clientUser);
    const pmToken = generateToken(pmUser);

    const clientSocket = Client(`http://127.0.0.1:${serverPort}`, {
      auth: { token: clientToken },
      transports: ['websocket']
    });

    await new Promise((resolve) => clientSocket.on('connect', resolve));
    clientSocket.emit('join:project', String(project._id));
    await new Promise((r) => setTimeout(r, 80));

    let receivedInternal = false;
    let receivedPublic = false;

    clientSocket.on('comment:created', (payload) => {
      if (payload.content?.includes('SECRET INTERNAL')) {
        receivedInternal = true;
      }
      if (payload.content?.includes('PUBLIC BROADCAST')) {
        receivedPublic = true;
      }
    });

    // PM emits internal comment
    await apiCall(`/tasks/${task._id}/comments`, 'POST', {
      content: 'SECRET INTERNAL: Do not disclose backend test server details.',
      isPublicToClient: false
    }, pmToken);

    // PM emits public comment
    await apiCall(`/tasks/${task._id}/comments`, 'POST', {
      content: 'PUBLIC BROADCAST: Staging environment ready for client inspection.',
      isPublicToClient: true
    }, pmToken);

    await new Promise((r) => setTimeout(r, 200));
    clientSocket.disconnect();

    assert.equal(receivedInternal, false, 'Client must NOT receive realtime socket event for internal comment');
    assert.equal(receivedPublic, true, 'Client MUST receive realtime socket event for public comment');
  });

  // --- SECTION 5: NON-CLIENT ROLES FUNCTIONALITY PRESERVATION ---

  await t.test('19. Role Preservation: Project Manager can access workload and recommendations', async () => {
    const pmToken = generateToken(pmUser);
    const workloadRes = await apiCall(`/projects/${project._id}/workload`, 'GET', null, pmToken);
    assert.equal(workloadRes.status, 200, 'PM must have full access to workload');

    const recRes = await apiCall(`/projects/${project._id}/resource-recommendations`, 'GET', null, pmToken);
    assert.equal(recRes.status, 200, 'PM must have full access to recommendations');
  });

  await t.test('20. Role Preservation: Team Member can update task progress', async () => {
    const memberToken = generateToken(memberUser);
    const updateRes = await apiCall(`/tasks/${task._id}`, 'PATCH', {
      progress: 80
    }, memberToken);
    assert.equal(updateRes.status, 200, 'Team Member can update their task progress');
  });
});
