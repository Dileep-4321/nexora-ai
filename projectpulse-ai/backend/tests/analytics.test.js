import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import express from 'express';
import cors from 'cors';
import ExcelJS from 'exceljs';
import router from '../src/routes/index.js';
import { errorHandler } from '../src/middleware/errors.js';
import { User, Project } from '../src/models/index.js';
import {
  getProjectAdvancedAnalytics,
  getWorkspaceComparisonAnalytics
} from '../src/services/analytics.js';
import {
  generateProjectPDFReport,
  generateProjectExcelReport
} from '../src/services/reporting.js';

const JWT_SECRET = process.env.JWT_SECRET || 'nexora-ai-local-secret-2026-project';
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nexora_ai_demo';

function signToken(user) {
  return jwt.sign(
    { sub: user._id, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

test('Phase 6: Advanced Analytics and Reporting Suite', async (t) => {
  let server;
  let baseUrl;
    let pmUser;
  let devUser;
  let clientUser;
  let outsiderUser;
    let project;
  let emptyProject;

    let pmToken;
  let devToken;
    
  t.before(async () => {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(MONGO_URI);
    }

        pmUser = await User.findOne({ role: 'project_manager', isActive: true });
    clientUser = await User.findOne({ role: 'client', isActive: true });
    devUser = await User.findOne({ role: 'team_member', isActive: true });

    project = await Project.findOne();
    assert.ok(project, 'Project must exist in DB');

    // Ensure fixtures
    if (!project.teamMembers.map(String).includes(String(devUser._id))) {
      project.teamMembers.push(devUser._id);
    }
    project.projectManager = pmUser._id;
    project.client = clientUser._id;
    await project.save();

    const projectMemberIds = [
      project.owner,
      project.projectManager,
      project.teamLead,
      project.client,
      ...(project.teamMembers || [])
    ].map(String);

    outsiderUser = await User.findOne({
      role: { $in: ['client', 'team_member'] },
      _id: { $nin: projectMemberIds },
      isActive: true
    });

    if (!outsiderUser) {
      outsiderUser = await User.create({
        name: 'Temporary Outsider User',
        email: 'temp.outsider.audit@nexora.ai',
        role: 'team_member',
        department: 'Engineering',
        isActive: true
      });
    }

    // Create an empty temporary project for empty dataset testing
    emptyProject = await Project.create({
      name: 'Empty Test Project Analytics',
      code: 'EMPTY-ANL',
      description: 'Used solely for empty dataset validation',
      status: 'planning',
      owner: pmUser._id,
      projectManager: pmUser._id,
      teamMembers: [devUser._id],
      startDate: new Date('2026-01-01'),
      deadline: new Date('2026-12-31')
    });

        pmToken = signToken(pmUser);
    devToken = signToken(devUser);
        
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
    if (emptyProject) {
      await Project.deleteOne({ _id: emptyProject._id });
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.disconnect();
  });

  await t.test('1. Service: getProjectAdvancedAnalytics calculates accurate metrics against database records', async () => {
    const data = await getProjectAdvancedAnalytics({
      projectId: project._id,
      user: pmUser
    });

    assert.ok(data);
    assert.equal(String(data.projectId), String(project._id));
    assert.equal(data.projectName, project.name);
    assert.ok(data.overview.totalTasks >= 0);
    assert.ok(typeof data.overview.completionPercentage === 'number');
    assert.ok(typeof data.overview.plannedProgress === 'number');
    assert.ok(typeof data.overview.actualProgress === 'number');
    assert.ok(typeof data.overview.progressVariance === 'number');
    assert.equal(data.overview.progressVariance, data.overview.actualProgress - data.overview.plannedProgress);

    // Status breakdown sums to total tasks
    const statusSum = data.statusDistribution.todo +
      data.statusDistribution.inProgress +
      data.statusDistribution.completed +
      data.statusDistribution.blocked;
    assert.equal(statusSum, data.overview.totalTasks);

    // Priority breakdown sums to total tasks
    const prioSum = data.priorityDistribution.critical +
      data.priorityDistribution.high +
      data.priorityDistribution.medium +
      data.priorityDistribution.low;
    assert.equal(prioSum, data.overview.totalTasks);

    // Team performance present for PM
    assert.ok(Array.isArray(data.teamPerformance));
    assert.ok(data.teamPerformance.length > 0);
    const memberStat = data.teamPerformance[0];
    assert.ok(memberStat.member.name);
    assert.ok(typeof memberStat.completionRate === 'number');
    assert.ok(typeof memberStat.onTimeCompletionRate === 'number');
    assert.ok(typeof memberStat.productivityScore === 'number');

    // AI Insights integrated
    assert.ok(data.aiInsights);
    assert.ok(data.aiInsights.advisoryNotice.includes('advisory-only'));
  });

  await t.test('2. Service: getProjectAdvancedAnalytics handles empty project datasets safely without NaN', async () => {
    const data = await getProjectAdvancedAnalytics({
      projectId: emptyProject._id,
      user: pmUser
    });

    assert.ok(data);
    assert.equal(data.overview.totalTasks, 0);
    assert.equal(data.overview.completedTasks, 0);
    assert.equal(data.overview.completionPercentage, 0);
    assert.equal(data.overview.actualProgress, 0);
    assert.equal(data.overview.totalMilestones, 0);
    assert.equal(data.overview.milestoneCompletionRate, 0);
    assert.equal(data.delayedTasks.length, 0);
    assert.equal(Number.isNaN(data.overview.completionPercentage), false);
    assert.equal(Number.isNaN(data.overview.plannedProgress), false);
  });

  await t.test('3. Service: getProjectAdvancedAnalytics enforces date-range filtering', async () => {
    const now = new Date();
    const pastYear = new Date(now.getTime() - 365 * 86400000).toISOString();
    const futureYear = new Date(now.getTime() + 365 * 86400000).toISOString();

    const inRange = await getProjectAdvancedAnalytics({
      projectId: project._id,
      startDate: pastYear,
      endDate: futureYear,
      user: pmUser
    });
    assert.ok(inRange.overview.totalTasks >= 0);

    // Filter to an impossible future narrow window
    const futureWindowStart = new Date(now.getTime() + 700 * 86400000).toISOString();
    const futureWindowEnd = new Date(now.getTime() + 710 * 86400000).toISOString();

    const emptyWindow = await getProjectAdvancedAnalytics({
      projectId: project._id,
      startDate: futureWindowStart,
      endDate: futureWindowEnd,
      user: pmUser
    });
    assert.equal(emptyWindow.overview.totalTasks, 0);
  });

  await t.test('4. Service: getProjectAdvancedAnalytics validates date format and ordering (throws 400)', async () => {
    await assert.rejects(async () => {
      await getProjectAdvancedAnalytics({
        projectId: project._id,
        startDate: 'invalid-date-string',
        user: pmUser
      });
    }, (err) => {
      assert.equal(err.status, 400);
      assert.match(err.message, /Invalid startDate/);
      return true;
    });

    await assert.rejects(async () => {
      await getProjectAdvancedAnalytics({
        projectId: project._id,
        startDate: '2026-12-31',
        endDate: '2026-01-01',
        user: pmUser
      });
    }, (err) => {
      assert.equal(err.status, 400);
      assert.match(err.message, /startDate cannot be after endDate/);
      return true;
    });
  });

  await t.test('5. Security & Confidentiality: getProjectAdvancedAnalytics masks team performance and internal risks for Client', async () => {
    const clientData = await getProjectAdvancedAnalytics({
      projectId: project._id,
      user: clientUser
    });

    // Client must NOT receive teamPerformance details
    assert.equal(clientData.teamPerformance, null);

    // Risk score must be undefined/masked for client
    assert.equal(clientData.healthIndicators.riskScore, undefined);

    // Delayed task assignees must be masked
    clientData.delayedTasks.forEach((dt) => {
      assert.equal(dt.assignee, null);
    });

    // AI Rebalance recommendations must be empty for client
    assert.deepEqual(clientData.aiInsights.rebalanceRecommendations, []);
  });

  await t.test('6. Security & RBAC: getProjectAdvancedAnalytics rejects unauthorized project access (throws 403)', async () => {
    // Outsider user not in project
    await assert.rejects(async () => {
      await getProjectAdvancedAnalytics({
        projectId: project._id,
        user: { _id: new mongoose.Types.ObjectId(), role: 'client' }
      });
    }, (err) => {
      assert.equal(err.status, 403);
      assert.match(err.message, /access denied/i);
      return true;
    });
  });

  await t.test('7. Service: getWorkspaceComparisonAnalytics aggregates cross-project comparisons', async () => {
    const comparison = await getWorkspaceComparisonAnalytics({
      user: pmUser
    });

    assert.ok(comparison);
    assert.ok(comparison.totals.projects >= 1);
    assert.ok(comparison.totals.tasks >= 0);
    assert.ok(typeof comparison.totals.averageProgress === 'number');
    assert.ok(typeof comparison.totals.overallCompletionRate === 'number');
    assert.ok(Array.isArray(comparison.projects));

    const found = comparison.projects.find((p) => String(p._id) === String(project._id));
    assert.ok(found);
    assert.equal(found.name, project.name);
    assert.ok(typeof found.progress === 'number');
    assert.ok(typeof found.plannedProgress === 'number');
  });

  await t.test('8. Reporting: generateProjectPDFReport produces a valid PDF buffer with %PDF- header', async () => {
    const report = await generateProjectPDFReport({
      projectId: project._id,
      user: pmUser
    });

    assert.ok(report);
    assert.equal(report.mimeType, 'application/pdf');
    assert.match(report.filename, /^NEXORA_Report_.*\.pdf$/);
    assert.ok(Buffer.isBuffer(report.buffer));
    assert.ok(report.buffer.length > 500);

    // Check PDF magic header %PDF-
    assert.equal(report.buffer.slice(0, 4).toString(), '%PDF');

    // Contains project code or name in stream
    const pdfText = report.buffer.toString('latin1');
    assert.ok(pdfText.includes('NEXORA AI') || pdfText.includes('/Title'));
  });

  await t.test('9. Reporting: generateProjectExcelReport produces a valid XLSX workbook with 5 worksheets', async () => {
    const report = await generateProjectExcelReport({
      projectId: project._id,
      user: pmUser
    });

    assert.ok(report);
    assert.equal(report.mimeType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    assert.match(report.filename, /^NEXORA_Report_.*\.xlsx$/);
    assert.ok(Buffer.isBuffer(report.buffer));
    assert.ok(report.buffer.length > 1000);

    // Check ZIP/OpenXML magic number PK\x03\x04
    assert.equal(report.buffer[0], 0x50);
    assert.equal(report.buffer[1], 0x4B);

    // Inspect workbook structure via ExcelJS
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(report.buffer);

    const sheetNames = wb.worksheets.map((s) => s.name);
    assert.ok(sheetNames.includes('Project Overview'));
    assert.ok(sheetNames.includes('Task Details'));
    assert.ok(sheetNames.includes('Milestones'));
    assert.ok(sheetNames.includes('Team Performance'));
    assert.ok(sheetNames.includes('Analytics Summary'));
    assert.equal(sheetNames.length, 5);
  });

  await t.test('10. Reporting: Client Excel report masks team member metrics', async () => {
    const clientExcel = await generateProjectExcelReport({
      projectId: project._id,
      user: clientUser
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(clientExcel.buffer);

    const teamSheet = wb.getWorksheet('Team Performance');
    assert.ok(teamSheet);
    const noticeText = teamSheet.getCell('A2').value;
    assert.match(String(noticeText), /confidential to internal staff/i);
  });

  await t.test('11. API: GET /projects/:projectId/advanced-analytics returns 200 with complete analytics payload', async () => {
    const res = await fetch(`${baseUrl}/projects/${project._id}/advanced-analytics`, {
      headers: { Authorization: `Bearer ${pmToken}` }
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.overview);
    assert.ok(body.data.statusDistribution);
    assert.ok(body.data.priorityDistribution);
    assert.ok(body.data.healthIndicators);
    assert.ok(Array.isArray(body.data.teamPerformance));
  });

  await t.test('12. API: GET /analytics/comparison returns 200 with multi-project comparisons', async () => {
    const res = await fetch(`${baseUrl}/analytics/comparison`, {
      headers: { Authorization: `Bearer ${pmToken}` }
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.totals);
    assert.ok(Array.isArray(body.data.projects));
    assert.ok(body.data.projects.length >= 1);
  });

  await t.test('13. API: GET /projects/:projectId/reports/pdf streams PDF with security headers', async () => {
    const res = await fetch(`${baseUrl}/projects/${project._id}/reports/pdf`, {
      headers: { Authorization: `Bearer ${devToken}` }
    });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/pdf');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.match(res.headers.get('content-disposition'), /attachment; filename="NEXORA_Report_.*\.pdf"/);

    const buf = Buffer.from(await res.arrayBuffer());
    assert.equal(buf.slice(0, 4).toString(), '%PDF');
  });

  await t.test('14. API: GET /projects/:projectId/reports/excel streams XLSX with security headers', async () => {
    const res = await fetch(`${baseUrl}/projects/${project._id}/reports/excel`, {
      headers: { Authorization: `Bearer ${devToken}` }
    });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.match(res.headers.get('content-disposition'), /attachment; filename="NEXORA_Report_.*\.xlsx"/);

    const buf = Buffer.from(await res.arrayBuffer());
    assert.equal(buf[0], 0x50);
    assert.equal(buf[1], 0x4B);
  });

  await t.test('15. API: Reporting endpoints enforce authentication and project membership (401 & 403)', async () => {
    // 1. Unauthenticated -> 401
    const unauthPdf = await fetch(`${baseUrl}/projects/${project._id}/reports/pdf`);
    assert.equal(unauthPdf.status, 401);

    const unauthExcel = await fetch(`${baseUrl}/projects/${project._id}/reports/excel`);
    assert.equal(unauthExcel.status, 401);

    // 2. Outsider user not in project -> 403
    const fakeToken = signToken(outsiderUser || { _id: new mongoose.Types.ObjectId(), role: 'client' });
    const forbidPdf = await fetch(`${baseUrl}/projects/${project._id}/reports/pdf`, {
      headers: { Authorization: `Bearer ${fakeToken}` }
    });
    assert.equal(forbidPdf.status, 403);

    const forbidExcel = await fetch(`${baseUrl}/projects/${project._id}/reports/excel`, {
      headers: { Authorization: `Bearer ${fakeToken}` }
    });
    assert.equal(forbidExcel.status, 403);
  });

  t.after(async () => {
    if (mongoose.connection.readyState === 1) {
      if (emptyProject) {
        await Project.deleteOne({ _id: emptyProject._id });
      }
      if (outsiderUser && outsiderUser.email === 'temp.outsider.audit@nexora.ai') {
        await User.deleteOne({ _id: outsiderUser._id });
      }
    }
    server?.close();
  });
});
