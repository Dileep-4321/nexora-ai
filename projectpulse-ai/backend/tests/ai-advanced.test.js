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
  predictTaskDelays,
  calculateWorkloadRebalance,
  detectProjectBottlenecks,
  getProjectAIAssistant
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

test('Advanced AI & Machine Learning Enhancements Suite', async (t) => {
  let server;
  let baseUrl;
  let pmUser;
  let clientUser;
    let project;
  let pmToken;
  let clientToken;

  t.before(async () => {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(MONGO_URI);
    }

    pmUser = await User.findOne({ role: 'project_manager' });
    clientUser = await User.findOne({ role: 'client' });
        project = await Project.findOne();

    assert.ok(pmUser, 'PM user must exist in DB');
    assert.ok(clientUser, 'Client user must exist in DB');
    assert.ok(project, 'Project must exist in DB');

    pmToken = signToken(pmUser);
    clientToken = signToken(clientUser);

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
    if (server) await new Promise((r) => server.close(r));
    await mongoose.disconnect();
  });

  await t.test('1. Service: predictTaskDelays generates explainable risk assessments', async () => {
    const predictions = await predictTaskDelays(project._id);
    assert.ok(Array.isArray(predictions), 'Predictions must be an array');
    assert.ok(predictions.length > 0, 'Project should have active tasks to evaluate');

    for (const pred of predictions) {
      assert.ok(pred.taskId, 'Prediction must have taskId');
      assert.ok(pred.title, 'Prediction must have title');
      assert.ok(['low', 'medium', 'high', 'critical'].includes(pred.riskLevel), 'riskLevel must be valid');
      assert.ok(typeof pred.hoursRemaining === 'number', 'hoursRemaining must be number');
      assert.ok(pred.dueDate, 'dueDate must be present');
      assert.ok(pred.predictedCompletionDate, 'predictedCompletionDate must be present');
      assert.equal(pred.isEstimate, true, 'isEstimate flag must be true');
      assert.ok(Array.isArray(pred.riskFactors), 'riskFactors must be array');
      assert.ok(pred.suggestedAction, 'suggestedAction must be present');
    }
  });

  await t.test('2. Service: calculateWorkloadRebalance enforces advisory-only human-in-the-loop proposals', async () => {
    const rebalance = await calculateWorkloadRebalance(project._id);
    assert.ok(typeof rebalance.overloadedCount === 'number', 'overloadedCount must be a number');
    assert.ok(typeof rebalance.availableCount === 'number', 'availableCount must be a number');
    assert.ok(Array.isArray(rebalance.proposals), 'proposals must be an array');

    for (const prop of rebalance.proposals) {
      assert.equal(prop.requiresApproval, true, 'Every proposal MUST require human approval');
      assert.equal(prop.status, 'pending_human_review', 'Proposal status must be pending_human_review');
      assert.ok(prop.taskId, 'Proposal must specify target task');
      assert.ok(prop.currentAssignee?.id, 'Proposal must specify current assignee');
      assert.ok(prop.proposedAssignee?.id, 'Proposal must specify proposed candidate');
      assert.ok(prop.reason, 'Proposal must contain clear explainability justification');
      assert.ok(typeof prop.proposedAssignee.skillMatchRate === 'number', 'Must compute skill match rate');
    }
  });

  await t.test('3. Service: detectProjectBottlenecks provides aggregated friction points and health explanation', async () => {
    const diagnosis = await detectProjectBottlenecks(project._id);
    assert.equal(diagnosis.projectId, String(project._id));
    assert.ok(diagnosis.projectName);
    assert.ok(typeof diagnosis.bottleneckCount === 'number');
    assert.ok(Array.isArray(diagnosis.bottlenecks));
    assert.ok(diagnosis.healthExplanation, 'Health explanation string must be present');

    for (const b of diagnosis.bottlenecks) {
      assert.ok(['delivery_delay', 'resource_saturation', 'milestone_risk'].includes(b.type));
      assert.ok(['low', 'medium', 'high', 'critical'].includes(b.severity));
      assert.ok(b.title && b.description && b.impact && b.recommendedAction);
    }
  });

  await t.test('4. Service: getProjectAIAssistant masks confidential resource cards for client role', async () => {
    const pmAssistant = await getProjectAIAssistant(project._id, 'project_manager');
    const clientAssistant = await getProjectAIAssistant(project._id, 'client');

    assert.ok(pmAssistant.cards.length >= clientAssistant.cards.length);
    const clientHasRebalanceCard = clientAssistant.cards.some((c) => c.type === 'workload_rebalance');
    assert.equal(clientHasRebalanceCard, false, 'Client must NOT see internal workload rebalancing cards');
  });

  await t.test('5. API: GET /ai/predictive-delays/:projectId returns 200 with sanitized data', async () => {
    const res = await fetch(`${baseUrl}/ai/predictive-delays/${project._id}`, {
      headers: { Authorization: `Bearer ${pmToken}` }
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(Array.isArray(json.data.tasks));
  });

  await t.test('6. API: GET /ai/workload-rebalance/:projectId restricts client access (403)', async () => {
    const resClient = await fetch(`${baseUrl}/ai/workload-rebalance/${project._id}`, {
      headers: { Authorization: `Bearer ${clientToken}` }
    });
    assert.equal(resClient.status, 403, 'Client role must be forbidden from workload rebalance endpoint');

    const resPm = await fetch(`${baseUrl}/ai/workload-rebalance/${project._id}`, {
      headers: { Authorization: `Bearer ${pmToken}` }
    });
    assert.equal(resPm.status, 200, 'PM must have access to workload rebalance endpoint');
    const json = await resPm.json();
    assert.equal(json.success, true);
    assert.ok(Array.isArray(json.data.proposals));
  });

  await t.test('7. API: GET /ai/bottlenecks/:projectId masks internal resource saturation for client', async () => {
    const resClient = await fetch(`${baseUrl}/ai/bottlenecks/${project._id}`, {
      headers: { Authorization: `Bearer ${clientToken}` }
    });
    assert.equal(resClient.status, 200);
    const json = await resClient.json();
    assert.equal(json.success, true);
    const hasSaturation = json.data.bottlenecks.some((b) => b.type === 'resource_saturation');
    assert.equal(hasSaturation, false, 'Client view of bottlenecks must not contain resource_saturation');
  });

  await t.test('8. API: GET /ai/assistant/:projectId delivers explainable cards', async () => {
    const res = await fetch(`${baseUrl}/ai/assistant/${project._id}`, {
      headers: { Authorization: `Bearer ${pmToken}` }
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.data.cards.length > 0, 'Assistant should return at least one card');
  });
});
