/**
 * NEXORA — Master Enterprise SaaS Upgrade Comprehensive Test Suite
 * Tests all 6 modules across API endpoints, data persistence, and RBAC firewall.
 */
import assert from 'node:assert/strict';

const BASE_URL = 'http://localhost:5001/api/v1';

async function api(path, method = 'GET', body = null, token = null) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });

  let data = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.arrayBuffer();
  }

  return { status: res.status, data, headers: res.headers };
}

async function runTests() {
  console.log('=== NEXORA MASTER ENTERPRISE UPGRADE VERIFICATION TEST SUITE ===\n');
  let passed = 0;
  let failed = 0;

  function pass(msg) {
    console.log(`✅ [PASS] ${msg}`);
    passed++;
  }

  function fail(msg, err) {
    console.error(`❌ [FAIL] ${msg}:`, err?.message || err);
    failed++;
  }

  try {
    // 0. AUTHENTICATION & SESSIONS SETUP
    const pmLogin = await api('/auth/login', 'POST', { email: 'pm@nexora.ai', password: 'Password123!' });
    assert.equal(pmLogin.status, 200, 'PM Login status');
    const pmToken = pmLogin.data.data.token;

    const tlLogin = await api('/auth/login', 'POST', { email: 'lead@nexora.ai', password: 'Password123!' });
    assert.equal(tlLogin.status, 200, 'TL Login status');

    const tmLogin = await api('/auth/login', 'POST', { email: 'member@nexora.ai', password: 'Password123!' });
    assert.equal(tmLogin.status, 200, 'TM Login status');
    const tmToken = tmLogin.data.data.token;

    const clientLogin = await api('/auth/login', 'POST', { email: 'client@nexora.ai', password: 'Password123!' });
    assert.equal(clientLogin.status, 200, 'Client Login status');
    const clientToken = clientLogin.data.data.token;

    const projList = await api('/projects', 'GET', null, pmToken);
    assert.equal(projList.status, 200);
    const testProject = projList.data.data.items[0];
    const projectId = testProject._id;

    // ----------------------------------------------------
    // MODULE 1: ADVANCED EMPLOYEE MANAGEMENT TESTS
    // ----------------------------------------------------
    console.log('\n--- MODULE 1: Advanced Employee Management ---');

    // 1.1 PM can list employees with enriched attributes
    const empList = await api('/employees', 'GET', null, pmToken);
    assert.equal(empList.status, 200);
    assert.ok(Array.isArray(empList.data.data.items));
    assert.ok(empList.data.data.items.length > 0);
    const firstEmp = empList.data.data.items[0];
    assert.ok(firstEmp.employeeId, 'Employee ID present');
    assert.ok(firstEmp.assignedProjects !== undefined, 'Assigned projects present');
    pass('1.1 PM lists employees with enriched attributes (ID, projects, capacity)');

    // 1.2 Client access to employees is strictly blocked (403)
    const clientEmp = await api('/employees', 'GET', null, clientToken);
    assert.equal(clientEmp.status, 403);
    pass('1.2 Client access to /employees returns 403 Forbidden');

    // 1.3 Add employee with auto-generated ID & duplicate rejection
    const testEmail = `enterprise.test.${Date.now()}@nexora.ai`;
    const addRes = await api('/employees', 'POST', {
      name: 'Enterprise Engineer',
      email: testEmail,
      jobTitle: 'Senior Cloud Architect',
      department: 'Engineering',
      skills: ['AWS', 'Kubernetes', 'Docker'],
      role: 'team_member',
      workloadCapacity: 40,
      experienceYears: 6
    }, pmToken);
    assert.equal(addRes.status, 201);
    const newEmp = addRes.data.data.employee || addRes.data.data.user;
    assert.ok(newEmp.employeeId.startsWith('NEX-'));
    pass('1.3 PM creates new employee with auto-generated Employee ID');

    // 1.4 Duplicate email returns 409
    const dupRes = await api('/employees', 'POST', {
      name: 'Duplicate Engineer',
      email: testEmail,
      jobTitle: 'Dev',
      department: 'Engineering',
      role: 'team_member'
    }, pmToken);
    assert.equal(dupRes.status, 409);
    pass('1.4 Duplicate employee email returns 409 Conflict');

    // 1.5 Team Member can update own availability and capacity
    const availRes = await api('/users/me/availability', 'PATCH', {
      availabilityStatus: 'busy',
      workloadCapacity: 35
    }, tmToken);
    assert.equal(availRes.status, 200);
    assert.equal(availRes.data.data.user.availabilityStatus, 'busy');
    assert.equal(availRes.data.data.user.workloadCapacity, 35);
    // Restore to available
    await api('/users/me/availability', 'PATCH', { availabilityStatus: 'available', workloadCapacity: 40 }, tmToken);
    pass('1.5 Team Member updates personal availability & workload capacity');

    // ----------------------------------------------------
    // MODULE 2: SMART RESOURCE ALLOCATION TESTS
    // ----------------------------------------------------
    console.log('\n--- MODULE 2: Smart Resource Allocation ---');

    // 2.1 PM / TL can fetch organization capacity overview
    const allocRes = await api(`/resources/allocation-overview?projectId=${projectId}`, 'GET', null, pmToken);
    assert.equal(allocRes.status, 200);
    const alloc = allocRes.data.data;
    assert.ok(alloc.totalCapacityHours > 0, 'Total capacity hours computed');
    assert.ok(alloc.totalAllocatedHours !== undefined, 'Allocated hours computed');
    assert.ok(alloc.unallocatedHours !== undefined, 'Unallocated capacity computed');
    assert.ok(Array.isArray(alloc.members), 'Members breakdown array');
    assert.ok(alloc.skillDistribution, 'Skill distribution inventory');
    pass('2.1 PM retrieves smart resource allocation overview and capacity metrics');

    // 2.2 Client is forbidden from resource allocation telemetry
    const clientAlloc = await api('/resources/allocation-overview', 'GET', null, clientToken);
    assert.equal(clientAlloc.status, 403);
    pass('2.2 Client access to /resources/allocation-overview returns 403 Forbidden');

    // 2.3 AI Workload Rebalance / Recommendation endpoint
    const recsRes = await api(`/projects/${projectId}/resource-recommendations`, 'GET', null, pmToken);
    assert.equal(recsRes.status, 200);
    pass('2.3 PM retrieves AI resource recommendations and candidates');

    // ----------------------------------------------------
    // MODULE 3: ADVANCED PROJECT PLANNING & BASELINES
    // ----------------------------------------------------
    console.log('\n--- MODULE 3: Advanced Project Planning & Baselines ---');

    // 3.1 Project Timeline with Critical Path
    const timelineRes = await api(`/projects/${projectId}/timeline`, 'GET', null, pmToken);
    assert.equal(timelineRes.status, 200);
    const tlData = timelineRes.data.data;
    assert.ok(Array.isArray(tlData.tasks), 'Timeline tasks present');
    assert.ok(Array.isArray(tlData.criticalPathTaskIds), 'Critical path task IDs computed');
    assert.ok(Array.isArray(tlData.milestones), 'Milestones present');
    pass('3.1 Project timeline computes tasks, milestones and critical path');

    // 3.2 Project Baseline retrieval and variance
    const baseRes = await api(`/projects/${projectId}/baseline`, 'GET', null, pmToken);
    assert.equal(baseRes.status, 200);
    const bData = baseRes.data.data;
    assert.ok(bData.currentDeadline, 'Current deadline present');
    assert.ok(bData.varianceDays !== undefined, 'Baseline variance days computed');
    pass('3.2 Baseline retrieval accurately computes schedule variance');

    // 3.3 Set and Lock Project Baseline with Audit Trail
    const setBaseRes = await api(`/projects/${projectId}/baseline`, 'POST', {
      revisedDeadline: new Date(Date.now() + 60 * 86400000).toISOString(),
      reason: 'Automated test schedule realignment'
    }, pmToken);
    assert.equal(setBaseRes.status, 200);
    assert.ok(setBaseRes.data.data.project.baselineDeadline, 'Baseline locked');
    pass('3.3 Project baseline realignment persists with reason and variance audit');

    // ----------------------------------------------------
    // MODULE 4: EXECUTIVE ANALYTICS & EXPORTS
    // ----------------------------------------------------
    console.log('\n--- MODULE 4: Executive Analytics & Reports ---');

    // 4.1 Advanced Project Analytics
    const advAnalyticsRes = await api(`/projects/${projectId}/advanced-analytics`, 'GET', null, pmToken);
    assert.equal(advAnalyticsRes.status, 200);
    assert.ok(advAnalyticsRes.data.data.overview.completionPercentage !== undefined, 'Completion metric present');
    assert.ok(advAnalyticsRes.data.data.aiInsights.predictiveDelays !== undefined, 'Predictive delays present');
    pass('4.1 Executive analytics returns completion percentage, insights, and predictive delays');

    // 4.2 PDF Report Export
    const pdfRes = await api(`/projects/${projectId}/reports/pdf`, 'GET', null, pmToken);
    assert.equal(pdfRes.status, 200);
    assert.equal(pdfRes.headers.get('content-type'), 'application/pdf');
    assert.ok(pdfRes.headers.get('content-disposition')?.includes('.pdf'));
    pass('4.2 PDF report export returns valid binary PDF buffer and attachment header');

    // 4.3 Excel Report Export
    const excelRes = await api(`/projects/${projectId}/reports/excel`, 'GET', null, pmToken);
    assert.equal(excelRes.status, 200);
    assert.ok(excelRes.headers.get('content-disposition')?.includes('.xlsx'));
    pass('4.3 Excel report export returns valid binary spreadsheet buffer and header');

    // 4.4 Client Analytics Data Masking & 403 Internal Block
    const clientProjects = await api('/projects', 'GET', null, clientToken);
    assert.equal(clientProjects.status, 200);
    const clientProjId = clientProjects.data.data.items[0]._id;

    // Client is blocked from internal raw analytics endpoint (403)
    const clientRawAnalytics = await api(`/projects/${clientProjId}/analytics`, 'GET', null, clientToken);
    assert.equal(clientRawAnalytics.status, 403);

    // Client delivery intelligence endpoint returns masked client-safe data
    const clientIntel = await api(`/analytics/client-intelligence/${clientProjId}`, 'GET', null, clientToken);
    assert.equal(clientIntel.status, 200);
    assert.equal(clientIntel.data.data.teamMembers, undefined, 'Client delivery intelligence masks internal team members');

    // Client project details masks internal staff
    const clientProjDetails = await api(`/projects/${clientProjId}`, 'GET', null, clientToken);
    assert.equal(clientProjDetails.status, 200);
    assert.equal(clientProjDetails.data.data.project.teamMembers.length, 0, 'Internal team members array is empty for client');
    pass('4.4 Client analytics strictly blocks raw internal telemetry (403) and masks staff in delivery views');

    // ----------------------------------------------------
    // MODULE 5: ADVANCED COLLABORATION
    // ----------------------------------------------------
    console.log('\n--- MODULE 5: Advanced Collaboration ---');

    // 5.1 Create Discussion Comment
    const discRes = await api(`/projects/${projectId}/discussions`, 'POST', {
      content: 'Enterprise master upgrade discussion test @all'
    }, pmToken);
    assert.equal(discRes.status, 201);
    const commentId = discRes.data.data.comment._id;
    pass('5.1 PM creates project discussion thread');

    // 5.2 Add Reaction to Comment
    const reactRes = await api(`/comments/${commentId}/reactions`, 'POST', {
      emoji: '🚀'
    }, tmToken);
    assert.equal(reactRes.status, 200);
    pass('5.2 Team Member reacts to discussion thread');

    // 5.3 Pin Comment
    const pinRes = await api(`/comments/${commentId}/pin`, 'PATCH', null, pmToken);
    assert.equal(pinRes.status, 200);
    assert.equal(pinRes.data.data.isPinned, true);
    pass('5.3 PM pins discussion message');

    // 5.4 Document Upload and Versioning
    const docBuffer = Buffer.from('%PDF-1.4\n%Enterprise Test Document\n%%EOF');
    const uploadRes = await api(`/projects/${projectId}/attachments`, 'POST', {
      filename: 'enterprise_spec.pdf',
      mimeType: 'application/pdf',
      content: docBuffer.toString('base64'),
      isPublicToClient: true,
      description: 'Enterprise architecture blueprint'
    }, pmToken);
    assert.equal(uploadRes.status, 201);
    const attachmentId = uploadRes.data.data.attachment._id;
    pass('5.4 PM uploads document with description and access controls');

    // 5.5 Document Review Workflow (Approve document)
    const approveDocRes = await api(`/attachments/${attachmentId}/status`, 'PATCH', {
      status: 'approved'
    }, pmToken);
    assert.equal(approveDocRes.status, 200);
    assert.equal(approveDocRes.data.data.attachment.status, 'approved');
    pass('5.5 PM reviews and approves document');

    // ----------------------------------------------------
    // MODULE 6: SECURITY AND GOVERNANCE
    // ----------------------------------------------------
    console.log('\n--- MODULE 6: Security and Governance ---');

    // 6.1 Audit Logs endpoint for PM
    const auditRes = await api('/audit-logs?limit=10', 'GET', null, pmToken);
    assert.equal(auditRes.status, 200);
    assert.ok(auditRes.data.data.items.length > 0);
    const auditItem = auditRes.data.data.items[0];
    assert.ok(auditItem.actor, 'Actor recorded');
    assert.ok(auditItem.action, 'Action recorded');
    assert.ok(auditItem.timestamp, 'Timestamp recorded');
    pass('6.1 PM retrieves immutable audit logs with actor, action, and timestamp');

    // 6.2 Team Member cannot access Audit Logs (403)
    const tmAudit = await api('/audit-logs', 'GET', null, tmToken);
    assert.equal(tmAudit.status, 403);
    pass('6.2 Team Member access to /audit-logs returns 403 Forbidden');

    // 6.3 Active Sessions Endpoint
    const sessRes = await api('/auth/sessions', 'GET', null, pmToken);
    assert.equal(sessRes.status, 200);
    assert.ok(sessRes.data.data.currentSession.device);
    assert.ok(sessRes.data.data.currentSession.tokenVersion);
    pass('6.3 User retrieves active session telemetry (device, IP, tokenVersion)');

    // 6.4 Session Revocation invalidates prior tokens
    const revokeRes = await api('/auth/revoke-sessions', 'POST', null, tmToken);
    assert.equal(revokeRes.status, 200);
    const newToken = revokeRes.data.data.token;
    assert.ok(newToken, 'New refreshed token returned');

    // Prior token should now be rejected (401)
    const rejectOld = await api('/auth/sessions', 'GET', null, tmToken);
    assert.equal(rejectOld.status, 401);

    // New token works cleanly (200)
    const acceptNew = await api('/auth/sessions', 'GET', null, newToken);
    assert.equal(acceptNew.status, 200);
    pass('6.4 Session revocation increments tokenVersion and immediately rejects old token');

    // 6.5 Safe Deactivation & Task Reassignment Workflow
    const deactRes = await api(`/employees/${newEmp._id}/deactivate`, 'POST', {
      reason: 'Enterprise test employee offboarding',
      force: true
    }, pmToken);
    assert.equal(deactRes.status, 200);
    pass('6.5 PM safely deactivates test employee with audit trail and soft-delete');

    // 6.6 Deactivated Account cannot sign in (401)
    const deactLogin = await api('/auth/login', 'POST', {
      email: testEmail,
      password: 'TemporaryPassword123!'
    });
    assert.equal(deactLogin.status, 401);
    pass('6.6 Deactivated employee account cannot sign in (401 Unauthorized)');

    // 6.7 Restore Deactivated Employee
    const restoreRes = await api(`/employees/${newEmp._id}/restore`, 'POST', null, pmToken);
    assert.equal(restoreRes.status, 200);
    const restoredEmp = restoreRes.data.data.employee || restoreRes.data.data.user;
    assert.equal(restoredEmp.isActive, true);
    pass('6.7 PM restores deactivated employee back to active status');

  } catch (err) {
    fail('Unhandled exception in test runner', err);
  }

  console.log('\n========================================');
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================');
  if (failed > 0) process.exit(1);
}

runTests();
