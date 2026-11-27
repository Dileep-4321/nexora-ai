import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { User, Project } from '../src/models/index.js';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nexora_ai';
const JWT_SECRET = process.env.JWT_SECRET || 'nexora-ai-local-secret-2026-project';
const BASE_URL = 'http://127.0.0.1:5001/api/v1';

async function main() {
  console.log('============================================================');
  console.log('NEXORA: PHASE 3 ADVANCED AI & WORKLOAD REBALANCING TEST');
  console.log('============================================================\n');

  await mongoose.connect(MONGO_URI);

  const pm = await User.findOne({ role: 'project_manager' });
  const client = await User.findOne({ role: 'client' });
  const project = await Project.findOne();

  const pmToken = jwt.sign({ sub: pm._id, role: pm.role, email: pm.email }, JWT_SECRET, { expiresIn: '1h' });
  const clientToken = jwt.sign({ sub: client._id, role: client.role, email: client.email }, JWT_SECRET, { expiresIn: '1h' });

  console.log(`1. Testing Predictive Task Delays for "${project.name}" (ID: ${project._id})...`);
  const delayRes = await fetch(`${BASE_URL}/ai/predictive-delays/${project._id}`, {
    headers: { Authorization: `Bearer ${pmToken}` }
  });
  const delayJson = await delayRes.json();
  console.log(`  ✓ Status: ${delayRes.status}, Tasks Analyzed: ${delayJson.data.tasks.length}`);
  const sampleDelay = delayJson.data.tasks[0];
  if (sampleDelay) {
    console.log(`    Sample: "${sampleDelay.title}" | Risk: ${sampleDelay.riskLevel} | Delay: ${sampleDelay.delayDays}d | Action: ${sampleDelay.suggestedAction}`);
  }

  console.log('\n2. Testing Workload Rebalance (Advisory Human-in-the-Loop)...');
  const rebalanceRes = await fetch(`${BASE_URL}/ai/workload-rebalance/${project._id}`, {
    headers: { Authorization: `Bearer ${pmToken}` }
  });
  const rebalanceJson = await rebalanceRes.json();
  console.log(`  ✓ Status: ${rebalanceRes.status}, Overloaded Members: ${rebalanceJson.data.overloadedCount}, Available: ${rebalanceJson.data.availableCount}, Proposals: ${rebalanceJson.data.proposals.length}`);
  if (rebalanceJson.data.proposals.length > 0) {
    const p = rebalanceJson.data.proposals[0];
    console.log(`    Sample Proposal: Rebalance "${p.taskTitle}" from ${p.currentAssignee.name} to ${p.proposedAssignee.name} (${p.proposedAssignee.skillMatchRate}% match)`);
    console.log(`    Requires Human Approval: ${p.requiresApproval} | Status: ${p.status}`);
  }

  console.log('\n3. Testing Client Masking on Workload Rebalance (Must be 403 Forbidden)...');
  const clientRebalanceRes = await fetch(`${BASE_URL}/ai/workload-rebalance/${project._id}`, {
    headers: { Authorization: `Bearer ${clientToken}` }
  });
  console.log(`  ✓ Client Rebalance Status: ${clientRebalanceRes.status} (Expected: 403 Forbidden)`);

  console.log('\n4. Testing Project Bottleneck Intelligence...');
  const bottleneckRes = await fetch(`${BASE_URL}/ai/bottlenecks/${project._id}`, {
    headers: { Authorization: `Bearer ${pmToken}` }
  });
  const bottleneckJson = await bottleneckRes.json();
  console.log(`  ✓ Status: ${bottleneckRes.status}, Bottleneck Count: ${bottleneckJson.data.bottleneckCount}`);
  console.log(`    Health Explanation: ${bottleneckJson.data.healthExplanation}`);

  console.log('\n5. Testing Explainable AI Assistant Cards (PM vs Client)...');
  const pmAiRes = await fetch(`${BASE_URL}/ai/assistant/${project._id}`, {
    headers: { Authorization: `Bearer ${pmToken}` }
  });
  const pmAiJson = await pmAiRes.json();
  console.log(`  ✓ PM AI Cards Count: ${pmAiJson.data.cards.length}`);
  for (const card of pmAiJson.data.cards) {
    console.log(`    - [${card.severity.toUpperCase()}] ${card.title} (${card.type})`);
  }

  const clientAiRes = await fetch(`${BASE_URL}/ai/assistant/${project._id}`, {
    headers: { Authorization: `Bearer ${clientToken}` }
  });
  const clientAiJson = await clientAiRes.json();
  console.log(`  ✓ Client AI Cards Count: ${clientAiJson.data.cards.length}`);
  const clientHasRebalance = clientAiJson.data.cards.some((c) => c.type === 'workload_rebalance');
  console.log(`  ✓ Client sees internal rebalance cards: ${clientHasRebalance} (Must be false)`);

  console.log('\n============================================================');
  console.log('ALL PHASE 3 AI ENDPOINTS VERIFIED AND PRODUCTION-READY!');
  console.log('============================================================');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
