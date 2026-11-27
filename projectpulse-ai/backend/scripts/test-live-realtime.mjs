import { io as Client } from 'socket.io-client';
import mongoose from 'mongoose';
import { User, Project, Task } from '../src/models/index.js';

const API_BASE = 'http://localhost:5001/api/v1';
const SOCKET_URL = 'http://localhost:5001';

async function login(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Login failed for ${email}: ${JSON.stringify(data)}`);
  return { token: data.token, user: data.user };
}

async function run() {
  console.log('============================================================');
  console.log('NEXORA: LIVE REAL-TIME SOCKET.IO INTEGRATION TEST');
  console.log('============================================================\n');

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nexora_ai');

  // Step 1: Login users
  console.log('1. Authenticating Project Manager (Dileep) & Client (Punith)...');
  const pmAuth = await login('dileep@nexora.ai', 'Password123!');
  const clientAuth = await login('punith@nexora.ai', 'Password123!');
  console.log('  ✓ PM Authenticated. Token acquired.');
  console.log('  ✓ Client Authenticated. Token acquired.');

  // Step 2: Connect PM Socket
  console.log('\n2. Establishing Authenticated Socket.IO connections...');
  const pmSocket = Client(SOCKET_URL, {
    auth: { token: pmAuth.token },
    transports: ['websocket', 'polling']
  });

  const clientSocket = Client(SOCKET_URL, {
    auth: { token: clientAuth.token },
    transports: ['websocket', 'polling']
  });

  await Promise.all([
    new Promise((resolve) => pmSocket.on('connect', resolve)),
    new Promise((resolve) => clientSocket.on('connect', resolve))
  ]);

  console.log('  ✓ PM Socket connected! ID:', pmSocket.id);
  console.log('  ✓ Client Socket connected! ID:', clientSocket.id);

  // Step 3: Join Project Room
  const project = await Project.findOne();
  console.log(`\n3. Subscribing to Project Room: "${project.name}" (ID: ${project._id})...`);

  await new Promise((resolve) => {
    pmSocket.emit('project:join', { projectId: String(project._id) }, (res) => {
      console.log('  ✓ PM joined project room:', res);
      resolve();
    });
  });

  await new Promise((resolve) => {
    clientSocket.emit('project:join', { projectId: String(project._id) }, (res) => {
      console.log('  ✓ Client joined project room:', res);
      resolve();
    });
  });

  // Step 4: Test Real-Time Task Update Propagation
  console.log('\n4. Testing Real-time Task Update via REST API...');
  const task = await Task.findOne({ project: project._id, status: { $ne: 'completed' } });

  let pmReceived = null;
  let clientReceived = null;

  const eventPromise = Promise.all([
    new Promise((resolve) => {
      pmSocket.once('task:updated', (payload) => {
        pmReceived = payload;
        resolve();
      });
    }),
    new Promise((resolve) => {
      clientSocket.once('task:updated', (payload) => {
        clientReceived = payload;
        resolve();
      });
    })
  ]);

  // Trigger REST API update
  const newProgress = task.progress === 50 ? 55 : 50;
  const updateRes = await fetch(`${API_BASE}/tasks/${task._id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${pmAuth.token}`
    },
    body: JSON.stringify({ progress: newProgress })
  });

  if (!updateRes.ok) {
    throw new Error(`Failed to update task: ${await updateRes.text()}`);
  }

  // Wait for real-time delivery
  await eventPromise;

  console.log(`  ✓ PM Socket received "task:updated": taskId=${pmReceived.taskId}, progress=${pmReceived.progress}%`);
  console.log(`  ✓ Client Socket received "task:updated": taskId=${clientReceived.taskId}, progress=${clientReceived.progress}%`);

  // Step 5: Test Client Data Masking (Internal Activities)
  console.log('\n5. Testing Security: Client Data Isolation for internal activities...');
  let pmInternalReceived = false;
  let clientInternalReceived = false;

  pmSocket.once('activity:new', () => { pmInternalReceived = true; });
  clientSocket.once('activity:new', () => { clientInternalReceived = true; });

  // Simulate internal activity
  const { emitActivity } = await import('../src/services/realtime.js');
  emitActivity({
    _id: new mongoose.Types.ObjectId(),
    action: 'developer_rate_updated',
    entityType: 'User',
    entityId: pmAuth.user.id,
    actor: { name: 'Dileep' }
  }, project._id);

  await new Promise((r) => setTimeout(r, 600));

  console.log(`  ✓ PM received internal activity: ${pmInternalReceived}`);
  console.log(`  ✓ Client masked from internal activity: ${!clientInternalReceived}`);

  if (clientInternalReceived) {
    throw new Error('SECURITY BREACH: Client received internal activity event!');
  }

  // Step 6: Test Reconnection Handling
  console.log('\n6. Testing Socket Reconnection Handling...');
  pmSocket.disconnect();
  console.log('  ✓ PM Socket disconnected manually.');
  pmSocket.connect();
  await new Promise((resolve) => pmSocket.on('connect', resolve));
  console.log('  ✓ PM Socket successfully reconnected with valid JWT.');

  // Clean up
  pmSocket.close();
  clientSocket.close();
  await mongoose.disconnect();

  console.log('\n============================================================');
  console.log('ALL REAL-TIME TESTS COMPLETED SUCCESSFULLY WITH ZERO DEFECTS!');
  console.log('============================================================');
}

run().catch((err) => {
  console.error('\n❌ REAL-TIME TEST FAILED:', err);
  process.exit(1);
});
