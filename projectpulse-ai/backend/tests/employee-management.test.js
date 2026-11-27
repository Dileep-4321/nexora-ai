import assert from 'assert';

const BASE_URL = 'http://localhost:5001/api/v1';

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function login(email, password = 'Password123!') {
  const res = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) throw new Error(`Login failed for ${email}: ${JSON.stringify(res.data)}`);
  return res.data.data.token;
}

async function runTests() {
  console.log('--- NEXORA Employee Management Module Automated Tests ---');
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  // Tokens
  const pmToken = await login('pm@nexora.ai');
  const tlToken = await login('lead@nexora.ai');
  const tmToken = await login('member@nexora.ai');
  const clientToken = await login('client@nexora.ai');

  // Test 1: Client is forbidden from accessing /employees
  await test('1. Client access to /employees returns 403 Forbidden', async () => {
    const res = await request('/employees', {
      headers: { Authorization: `Bearer ${clientToken}` }
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.data.success, false);
  });

  // Test 2: PM can list all employees
  let initialEmployees = [];
  await test('2. PM can list employees with enriched fields (employeeId, projects, workload)', async () => {
    const res = await request('/employees', {
      headers: { Authorization: `Bearer ${pmToken}` }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert(Array.isArray(res.data.data.items), 'items must be an array');
    assert(res.data.data.total >= 10, 'must have existing users');
    initialEmployees = res.data.data.items;
    const sample = initialEmployees[0];
    assert(sample.employeeId, 'employee must have employeeId');
    assert('workloadPercentage' in sample, 'employee must have workloadPercentage');
    assert('assignedProjects' in sample, 'employee must have assignedProjects');
  });

  // Test 3: Search and filters work
  await test('3. Search and role filters return accurate subsets', async () => {
    const resSearch = await request('/employees?search=dileep', {
      headers: { Authorization: `Bearer ${pmToken}` }
    });
    assert.strictEqual(resSearch.status, 200);
    assert(resSearch.data.data.items.length >= 1, 'must find at least 1 match');

    const resRole = await request('/employees?role=team_lead', {
      headers: { Authorization: `Bearer ${pmToken}` }
    });
    assert.strictEqual(resRole.status, 200);
    for (const item of resRole.data.data.items) {
      assert.strictEqual(item.role, 'team_lead');
    }
  });

  // Test 4: Team Lead can only view active project members
  await test('4. Team Lead receives scoped active member directory', async () => {
    const res = await request('/employees', {
      headers: { Authorization: `Bearer ${tlToken}` }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    for (const item of res.data.data.items) {
      assert.strictEqual(item.isActive, true, 'TL cannot see deactivated members');
    }
  });

  // Test 5: Reject duplicate email
  await test('5. Adding employee with duplicate email returns 409 Conflict', async () => {
    const res = await request('/employees', {
      method: 'POST',
      headers: { Authorization: `Bearer ${pmToken}` },
      body: JSON.stringify({
        name: 'Duplicate Test',
        email: 'dileep@nexora.ai',
        role: 'team_member'
      })
    });
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.data.success, false);
  });

  // Test 6: Create new employee with auto-generated Employee ID
  let newEmployeeId = null;
  let createdEmpRecord = null;
  const testEmail = `test.dev.${Date.now()}@nexora.ai`;
  await test('6. PM can add new employee with auto-generated Employee ID', async () => {
    const res = await request('/employees', {
      method: 'POST',
      headers: { Authorization: `Bearer ${pmToken}` },
      body: JSON.stringify({
        name: 'Jordan Rivera',
        email: testEmail,
        jobTitle: 'Cloud Architect',
        department: 'DevOps & Infra',
        skills: ['Kubernetes', 'Terraform', 'AWS', 'Docker'],
        experienceYears: 4,
        role: 'team_member',
        availabilityStatus: 'available',
        workloadCapacity: 40
      })
    });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.success, true);
    createdEmpRecord = res.data.data.employee;
    newEmployeeId = createdEmpRecord._id || createdEmpRecord.id;
    assert(createdEmpRecord.employeeId.startsWith('NEX-'), 'Must auto-generate NEX-XXXX ID');
    assert.strictEqual(createdEmpRecord.name, 'Jordan Rivera');
    assert.strictEqual(createdEmpRecord.department, 'DevOps & Infra');
    assert.strictEqual(createdEmpRecord.isActive, true);
    assert(res.data.data.temporaryPassword, 'Must return generated temporary credentials');
  });

  // Test 7: Get Employee Details
  await test('7. PM can retrieve comprehensive employee details by ID', async () => {
    const res = await request(`/employees/${newEmployeeId}`, {
      headers: { Authorization: `Bearer ${pmToken}` }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.data.employee.email, testEmail);
    assert(Array.isArray(res.data.data.skills), 'skills list must be array');
  });

  // Test 8: Edit Employee details and skills
  await test('8. PM can update employee details, designation, and skills', async () => {
    const res = await request(`/employees/${newEmployeeId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${pmToken}` },
      body: JSON.stringify({
        jobTitle: 'Lead Cloud Infrastructure Architect',
        experienceYears: 5,
        skills: ['Kubernetes', 'Terraform', 'AWS', 'GCP', 'ArgoCD']
      })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.data.employee.jobTitle, 'Lead Cloud Infrastructure Architect');
    assert.strictEqual(res.data.data.employee.experienceYears, 5);
    assert(res.data.data.employee.skills.includes('ArgoCD'));
  });

  // Test 9: Assign Employee to Project
  let sampleProjectId = null;
  await test('9. PM can assign employee to a project', async () => {
    const projRes = await request('/projects', {
      headers: { Authorization: `Bearer ${pmToken}` }
    });
    sampleProjectId = projRes.data.data.items[0]._id || projRes.data.data.items[0].id;

    const res = await request(`/employees/${newEmployeeId}/projects`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${pmToken}` },
      body: JSON.stringify({ projectId: sampleProjectId })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
  });

  // Test 10: Task creation and assignment to this employee
  let createdTaskId = null;
  await test('10. Assign active task to employee to test dependency safety', async () => {
    const taskRes = await request('/tasks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${pmToken}` },
      body: JSON.stringify({
        title: 'Deploy Production Kubernetes Ingress Controller',
        description: 'Configure high availability ingress controller with cert-manager.',
        project: sampleProjectId,
        assignedTo: newEmployeeId,
        priority: 'high',
        estimatedHours: 8,
        dueDate: new Date(Date.now() + 86400000 * 5).toISOString()
      })
    });
    assert.strictEqual(taskRes.status, 201);
    createdTaskId = taskRes.data.data.task._id;
  });

  // Test 11: Attempt deactivation without reassignment returns 409 Conflict
  await test('11. Deactivation without task reassignment returns 409 Conflict with active tasks', async () => {
    const res = await request(`/employees/${newEmployeeId}/deactivate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${pmToken}` },
      body: JSON.stringify({
        reason: 'Temporary medical leave'
      })
    });
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.data.hasActiveTasks, true);
    assert.strictEqual(res.data.activeTasksCount, 1);
  });

  // Test 12: Deactivation with task reassignment succeeds safely
  await test('12. Deactivation with replacement assignee reassigns active task and deactivates employee', async () => {
    // Find replacement member (e.g. initialEmployees[1])
    const replacement = initialEmployees.find((e) => e.isActive && e.role !== 'client' && e._id !== newEmployeeId);
    assert(replacement, 'Must have replacement member');

    const res = await request(`/employees/${newEmployeeId}/deactivate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${pmToken}` },
      body: JSON.stringify({
        reason: 'Temporary medical leave',
        reassignTasksTo: replacement._id
      })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.data.employee.isActive, false);
    assert.strictEqual(res.data.data.employee.availabilityStatus, 'unavailable');
    assert.strictEqual(res.data.data.reassignedTasksCount, 1);

    // Verify task is now assigned to replacement
    const taskCheck = await request(`/tasks/${createdTaskId}`, {
      headers: { Authorization: `Bearer ${pmToken}` }
    });
    assert.strictEqual(String(taskCheck.data.data.task.assignedTo._id || taskCheck.data.data.task.assignedTo), String(replacement._id));
  });

  // Test 13: Deactivated employee cannot log in
  await test('13. Deactivated employee account cannot sign in (401 Unauthorized)', async () => {
    const loginRes = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: testEmail,
        password: 'Password123!'
      })
    });
    assert.strictEqual(loginRes.status, 401);
  });

  // Test 14: Restore employee account
  await test('14. PM can restore deactivated employee back to active status', async () => {
    const res = await request(`/employees/${newEmployeeId}/restore`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${pmToken}` }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.data.employee.isActive, true);
    assert.strictEqual(res.data.data.employee.availabilityStatus, 'available');
  });

  // Test 15: Self-deactivation protection
  await test('15. Self-deactivation is strictly prohibited (400 Bad Request)', async () => {
    // PM cannot deactivate self
    const meRes = await request('/auth/me', {
      headers: { Authorization: `Bearer ${pmToken}` }
    });
    const myId = meRes.data.data.user._id;

    const res = await request(`/employees/${myId}/deactivate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${pmToken}` },
      body: JSON.stringify({ reason: 'Accidental self-deactivation' })
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.success, false);
  });

  console.log(`\n========================================`);
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
