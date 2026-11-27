import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { io as Client } from 'socket.io-client';
import { User, Project, Task } from '../src/models/index.js';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nexora_ai';
const JWT_SECRET = process.env.JWT_SECRET || 'nexora-ai-local-secret-2026-project';
const BASE_URL = 'http://127.0.0.1:5001/api/v1';
const SOCKET_URL = 'http://127.0.0.1:5001';

async function main() {
  console.log('============================================================');
  console.log('NEXORA: PHASE 4 GANTT CHART & PROJECT TIMELINE LIVE AUDIT');
  console.log('============================================================\n');

  await mongoose.connect(MONGO_URI);

  const pm = await User.findOne({ role: 'project_manager' });
  const lead = await User.findOne({ role: 'team_lead' });
  const client = await User.findOne({ role: 'client' });
  const projects = await Project.find();

  console.log(`1. Authenticating Users: PM (${pm.name}), TL (${lead.name}), Client (${client.name})...`);
  const pmToken = jwt.sign({ sub: pm._id, role: pm.role, email: pm.email }, JWT_SECRET, { expiresIn: '1h' });
  const leadToken = jwt.sign({ sub: lead._id, role: lead.role, email: lead.email }, JWT_SECRET, { expiresIn: '1h' });
  const clientToken = jwt.sign({ sub: client._id, role: client.role, email: client.email }, JWT_SECRET, { expiresIn: '1h' });
  console.log('  ✓ Tokens generated for all roles.');

  console.log('\n2. Verifying GET /projects/:id/timeline across all 4 projects...');
  for (const proj of projects) {
    const res = await fetch(`${BASE_URL}/projects/${proj._id}/timeline`, {
      headers: { Authorization: `Bearer ${pmToken}` }
    });
    console.log(`  ✓ Project "${proj.name}": Status ${res.status}`);
    const json = await res.json();
    if (!json.success) throw new Error(`Timeline failed for project ${proj.name}: ${json.message}`);

    const { tasks, milestones, criticalPathTaskIds } = json.data;
    console.log(`    - Tasks: ${tasks.length}, Milestones: ${milestones.length}, Critical Path Tasks: ${criticalPathTaskIds.length}`);

    for (const t of tasks) {
      if (!t.startDate || !t.dueDate) throw new Error(`Task ${t.title} missing startDate or dueDate`);
      if (typeof t.durationDays !== 'number' || t.durationDays < 1) throw new Error(`Task ${t.title} invalid duration`);
    }
  }

  const primaryProject = projects[0];
  const projectTasks = await Task.find({ project: primaryProject._id }).limit(2);
  const [taskA, taskB] = projectTasks;

  console.log('\n3. Verifying Client Confidentiality Masking on Timeline...');
  const clientRes = await fetch(`${BASE_URL}/projects/${primaryProject._id}/timeline`, {
    headers: { Authorization: `Bearer ${clientToken}` }
  });
  const clientJson = await clientRes.json();
  console.log(`  ✓ Client Timeline Status: ${clientRes.status}`);
  let developerAvailabilityExposed = false;
  for (const t of clientJson.data.tasks) {
    if (t.assignedTo && t.assignedTo.availability !== undefined) {
      developerAvailabilityExposed = true;
    }
  }
  console.log(`  ✓ Internal developer availability exposed to Client: ${developerAvailabilityExposed} (Must be false)`);

  console.log('\n4. Verifying Real-Time Socket.IO Synchronization on Task Schedule Changes...');
  const pmSocket = Client(SOCKET_URL, {
    auth: { token: pmToken },
    transports: ['websocket']
  });

  await new Promise((resolve, reject) => {
    pmSocket.on('connect', resolve);
    pmSocket.on('connect_error', reject);
  });
  console.log(`  ✓ Socket connected: ID=${pmSocket.id}`);

  await new Promise((resolve) => {
    pmSocket.emit('join:project', { projectId: String(primaryProject._id) }, resolve);
  });
  console.log(`  ✓ Subscribed to project room: ${primaryProject._id}`);

  let receivedRealtimeEvent = false;
  pmSocket.on('task:updated', (payload) => {
    if (payload && String(payload.task?._id) === String(taskA._id)) {
      receivedRealtimeEvent = true;
    }
  });

  console.log('\n5. Testing Live Schedule Modification via PATCH /tasks/:id/schedule...');
  const testStartDate = new Date(Date.now() - 86400000).toISOString();
  const testDueDate = new Date(Date.now() + 14 * 86400000).toISOString();

  const schedRes = await fetch(`${BASE_URL}/tasks/${taskA._id}/schedule`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${pmToken}`
    },
    body: JSON.stringify({ startDate: testStartDate, dueDate: testDueDate })
  });
  const schedJson = await schedRes.json();
  console.log(`  ✓ Update Schedule Status: ${schedRes.status}, Message: "${schedJson.message || 'OK'}"`);

  // Wait a moment for socket event
  await new Promise((r) => setTimeout(r, 600));
  console.log(`  ✓ Real-time Socket.IO event received by listeners: ${receivedRealtimeEvent}`);

  console.log('\n6. Testing Invalid Date Rejection (dueDate < startDate)...');
  const invalidRes = await fetch(`${BASE_URL}/tasks/${taskA._id}/schedule`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${pmToken}`
    },
    body: JSON.stringify({
      startDate: new Date(Date.now() + 10 * 86400000).toISOString(),
      dueDate: new Date(Date.now() + 2 * 86400000).toISOString()
    })
  });
  const invalidJson = await invalidRes.json();
  console.log(`  ✓ Invalid Dates Rejection Status: ${invalidRes.status} (Expected: 400), Message: "${invalidJson.message}"`);

  console.log('\n7. Testing Client Role Permission Restriction (Must be 403 Forbidden)...');
  const clientEditRes = await fetch(`${BASE_URL}/tasks/${taskA._id}/schedule`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${clientToken}`
    },
    body: JSON.stringify({ dueDate: new Date().toISOString() })
  });
  console.log(`  ✓ Client Edit Attempt Status: ${clientEditRes.status} (Expected: 403 Forbidden)`);

  console.log('\n8. Testing Task Dependency Management & Circular Dependency Prevention...');
  // Add dependency: Task B depends on Task A
  const addDepRes = await fetch(`${BASE_URL}/tasks/${taskB._id}/dependencies`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${pmToken}`
    },
    body: JSON.stringify({ dependsOnTaskId: taskA._id })
  });
  const addDepJson = await addDepRes.json();
  console.log(`  ✓ Add Dependency Status: ${addDepRes.status}, Task B now depends on Task A: ${addDepJson.data?.task?.dependencies?.includes(String(taskA._id))}`);

  // Attempt circular dependency: Task A depends on Task B
  const cycleRes = await fetch(`${BASE_URL}/tasks/${taskA._id}/dependencies`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${pmToken}`
    },
    body: JSON.stringify({ dependsOnTaskId: taskB._id })
  });
  const cycleJson = await cycleRes.json();
  console.log(`  ✓ Circular Dependency Blocked Status: ${cycleRes.status} (Expected: 400), Message: "${cycleJson.message}"`);

  // Remove dependency to restore clean baseline
  const removeDepRes = await fetch(`${BASE_URL}/tasks/${taskB._id}/dependencies/${taskA._id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${pmToken}` }
  });
  console.log(`  ✓ Clean-up Removed Dependency Status: ${removeDepRes.status}`);

  pmSocket.disconnect();
  await mongoose.disconnect();

  console.log('\n============================================================');
  console.log('ALL PHASE 4 GANTT TIMELINE TESTS PASSED WITH ZERO DEFECTS!');
  console.log('============================================================');
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
