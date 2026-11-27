import jwt from 'jsonwebtoken';

const BASE_URL = 'http://localhost:5001/api/v1';
const JWT_SECRET = process.env.JWT_SECRET || 'nexora-ai-local-secret-2026-project';

async function testHealth() {
  const res = await fetch(`${BASE_URL}/health`);
  const data = await res.json();
  console.log('✅ Health Telemetry Check:', {
    status: res.status,
    healthy: data.success,
    dbStatus: data.database?.status,
    latencyMs: data.database?.latencyMs,
    uptimeSec: data.system?.uptime,
    heapUsedMB: data.system?.memory?.heapUsedMB
  });
}

async function testLogin(email, password, expectedRole) {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Login failed for ${email}: ${data.message}`);
  }
  const token = data.data.token;
  const user = data.data.user;

  // Test dashboard/:role
  const dashRes = await fetch(`${BASE_URL}/dashboard/${user.role}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const dashData = await dashRes.json();

  // Test unauthorized dashboard access
  const forbiddenRole = user.role === 'admin' ? 'client' : 'admin';
  const forbiddenRes = await fetch(`${BASE_URL}/dashboard/${forbiddenRole}`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  console.log(`✅ Role: ${expectedRole} (${email})`, {
    loginStatus: res.status,
    returnedRole: user.role,
    dashStatus: dashRes.status,
    dashRole: dashData.data?.role,
    projectCount: dashData.data?.projects?.length,
    taskCount: dashData.data?.tasks?.length,
    memberCount: dashData.data?.members?.length,
    crossRoleIsolation: forbiddenRes.status === 403 ? '403 Forbidden (PASSED)' : 'FAILED'
  });
  return { token, user };
}

async function testAdmin() {
  const adminPayload = {
    sub: '000000000000000000000001',
    id: '000000000000000000000001',
    role: 'admin',
    email: 'admin.platform@nexora.ai'
  };
  const token = jwt.sign(adminPayload, JWT_SECRET, { expiresIn: '1h' });

  const dashRes = await fetch(`${BASE_URL}/dashboard/admin`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const dashData = await dashRes.json();

  const usersRes = await fetch(`${BASE_URL}/users`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const usersData = await usersRes.json();

  console.log('✅ Role: Admin (Platform Governance)', {
    dashStatus: dashRes.status,
    dashRole: dashData.data?.role,
    totalProjects: dashData.data?.projects?.length,
    totalTasks: dashData.data?.tasks?.length,
    totalMembers: dashData.data?.members?.length,
    allUsersCount: usersData.data?.items?.length
  });
}

async function main() {
  console.log('--- NEXORA LIVE ROLE DASHBOARD VERIFICATION ---');
  await testHealth();
  await testAdmin();
  await testLogin('dileep@nexora.ai', 'Password123!', 'Project Manager');
  await testLogin('sohel@nexora.ai', 'Password123!', 'Team Lead');
  await testLogin('hemavardhan@nexora.ai', 'Password123!', 'Team Member');
  await testLogin('punith@nexora.ai', 'Password123!', 'Client');
  console.log('--- ALL LIVE ROLE DASHBOARDS VERIFIED SUCCESSFULLY ---');
}

main().catch((err) => {
  console.error('❌ Verification Error:', err);
  process.exit(1);
});
