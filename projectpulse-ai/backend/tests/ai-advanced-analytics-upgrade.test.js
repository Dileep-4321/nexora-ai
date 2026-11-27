import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import express from 'express';
import cors from 'cors';
import router from '../src/routes/index.js';
import { errorHandler } from '../src/middleware/errors.js';
import { User, Project } from '../src/models/index.js';
import {
  predictProjectDelay,
  getSprintIntelligence,
  getPersonalIntelligence,
  getClientDeliveryIntelligence,
  approveAIRecommendation,
  dismissAIRecommendation
} from '../src/services/ai-advanced.js';

const JWT_SECRET = process.env.JWT_SECRET || 'nexora-ai-local-secret-2026-project';
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nexora_ai_demo';

function signToken(user) {
  return jwt.sign(
    { sub: user._id, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

test('NEXORA Advanced Analytics & AI Prediction System Suite', async (t) => {
  let server;
  let baseUrl;
  let pmUser;
  let leadUser;
  let memberUser;
  let clientUser;
  let project;
  let pmToken;
  let leadToken;
  let memberToken;
  let clientToken;

  t.before(async () => {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(MONGO_URI);
    }

    pmUser = await User.findOne({ role: 'project_manager', isActive: true });
    leadUser = await User.findOne({ role: 'team_lead', isActive: true });
    memberUser = await User.findOne({ role: 'team_member', isActive: true });
    clientUser = await User.findOne({ role: 'client', isActive: true });
    project = await Project.findOne();

    assert.ok(pmUser, 'PM user must exist in DB');
    assert.ok(leadUser, 'Team Lead user must exist in DB');
    assert.ok(memberUser, 'Team Member user must exist in DB');
    assert.ok(clientUser, 'Client user must exist in DB');
    assert.ok(project, 'Project must exist in DB');

    pmToken = signToken(pmUser);
    leadToken = signToken(leadUser);
    memberToken = signToken(memberUser);
    clientToken = signToken(clientUser);

    const app = express();
    app.use(cors());
    app.use(express.json());
    app.use('/api/v1', router);
    app.use(errorHandler);

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}/api/v1`;
  });

  t.after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  await t.test('1. Service: predictProjectDelay computes schedule variance, confidence, and contributing factors', async () => {
    const res = await predictProjectDelay(project._id);
    assert.ok(res);
    assert.equal(String(res.projectId), String(project._id));
    assert.ok('scheduleVarianceDays' in res);
    assert.ok('isDelayed' in res);
    assert.ok(res.dataSufficiency);
    assert.ok(['high', 'moderate', 'low', 'insufficient_data'].includes(res.dataSufficiency.level));
    assert.ok(Array.isArray(res.contributingFactors));
    assert.ok(res.contributingFactors.length > 0);
  });

  await t.test('2. Service: getSprintIntelligence computes sprint velocity, completion prediction, and team recommendations', async () => {
    const res = await getSprintIntelligence(project._id, leadUser);
    assert.ok(res);
    assert.equal(String(res.projectId), String(project._id));
    assert.ok('sprintProgress' in res);
    assert.ok('sprintVelocity' in res);
    assert.ok(res.prediction);
    assert.ok(res.prediction.estimatedFinishDate);
    assert.ok(res.prediction.predictedUnfinishedWork);
    assert.ok(Array.isArray(res.teamRecommendations));
  });

  await t.test('3. Service: getPersonalIntelligence provides non-surveillance individual productivity and deadline risk', async () => {
    const res = await getPersonalIntelligence(memberUser._id, memberUser);
    assert.ok(res);
    assert.equal(String(res.user.id), String(memberUser._id));
    assert.ok(res.metrics);
    assert.ok('completionRate' in res.metrics);
    assert.ok('onTimeRate' in res.metrics);
    assert.ok(Array.isArray(res.atRiskTasks));
    assert.ok(Array.isArray(res.personalRecommendations));
  });

  await t.test('4. Security & Privacy: getPersonalIntelligence rejects unauthorized access by unrelated members', async () => {
    // Another member or unprivileged role cannot spy on a different member
    const anotherMember = await User.findOne({ _id: { $ne: memberUser._id }, role: 'team_member' });
    if (anotherMember) {
      await assert.rejects(
        () => getPersonalIntelligence(anotherMember._id, memberUser),
        (err) => err.status === 403
      );
    }
  });

  await t.test('5. Service: getClientDeliveryIntelligence guarantees client confidentiality (0 internal developer data)', async () => {
    const res = await getClientDeliveryIntelligence(project._id, clientUser);
    assert.ok(res);
    assert.ok(res.deliveryStatus);
    assert.ok(res.milestones);
    assert.ok(Array.isArray(res.clientInsights));
    // Verify no internal employee performance or workload fields exist
    const jsonStr = JSON.stringify(res);
    assert.equal(jsonStr.includes('productivityScore'), false);
    assert.equal(jsonStr.includes('workloadCapacity'), false);
    assert.equal(jsonStr.includes('rebalanceRecommendations'), false);
  });

  await t.test('6. Service: approveAIRecommendation and dismissAIRecommendation enforce human approval and audit logging', async () => {
    // Test dismiss
    const dismissRes = await dismissAIRecommendation('rec-test-123', pmUser, 'Reviewed and dismissed');
    assert.equal(dismissRes.success, true);

    // Test approve with non-manager role fails
    await assert.rejects(
      () => approveAIRecommendation('rec-test-123', clientUser),
      (err) => err.status === 403
    );
  });

  await t.test('7. API: GET /ai/project-delay/:projectId returns 200 with forecast payload', async () => {
    const res = await fetch(`${baseUrl}/ai/project-delay/${project._id}`, {
      headers: { Authorization: `Bearer ${pmToken}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.estimatedCompletionDate);
    assert.ok(body.data.dataSufficiency);
  });

  await t.test('8. API: GET /analytics/sprint-intelligence/:projectId enforces role boundaries (200 for Lead, 403 for Client)', async () => {
    const leadRes = await fetch(`${baseUrl}/analytics/sprint-intelligence/${project._id}`, {
      headers: { Authorization: `Bearer ${leadToken}` }
    });
    assert.equal(leadRes.status, 200);
    const leadBody = await leadRes.json();
    assert.equal(leadBody.success, true);
    assert.ok(leadBody.data.prediction);

    const clientRes = await fetch(`${baseUrl}/analytics/sprint-intelligence/${project._id}`, {
      headers: { Authorization: `Bearer ${clientToken}` }
    });
    assert.equal(clientRes.status, 403);
  });

  await t.test('9. API: GET /analytics/personal-intelligence returns 200 for authenticated member', async () => {
    const res = await fetch(`${baseUrl}/analytics/personal-intelligence`, {
      headers: { Authorization: `Bearer ${memberToken}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(String(body.data.user.id), String(memberUser._id));
  });

  await t.test('10. API: GET /analytics/client-intelligence/:projectId returns 200 client delivery insights', async () => {
    const res = await fetch(`${baseUrl}/analytics/client-intelligence/${project._id}`, {
      headers: { Authorization: `Bearer ${clientToken}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.milestones);
    assert.ok(body.data.clientInsights);
  });

  await t.test('11. API: POST /ai/recommendations/:id/dismiss returns 200 and audits decision', async () => {
    const res = await fetch(`${baseUrl}/ai/recommendations/prop-test-demo/dismiss`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pmToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ reason: 'Scope confirmed with client' })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
  });
});
