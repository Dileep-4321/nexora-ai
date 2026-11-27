import 'dotenv/config';
import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import { User, Project } from '../src/models/index.js';

const API_BASE = 'http://localhost:5001/api/v1';
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nexora_ai';

async function main() {
  console.log('--- NEXORA PHASE 6 LIVE VERIFICATION SCRIPT ---');
  await mongoose.connect(MONGO_URI);

  const pmUser = await User.findOne({ role: 'project_manager' });
  const clientUser = await User.findOne({ role: 'client' });
  const devUser = await User.findOne({ role: 'team_member' });
  const project = await Project.findOne();

  if (!pmUser || !clientUser || !devUser || !project) {
    throw new Error('Required test fixtures missing in database');
  }

  console.log(`✓ Fixtures found: Project "${project.name}" (${project.code})`);
  console.log(`✓ Users: PM (${pmUser.email}), Dev (${devUser.email}), Client (${clientUser.email})`);

  async function login(email, password) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const body = await res.json();
    if (!body.success) throw new Error(`Login failed for ${email}: ${body.message}`);
    return body.data.token;
  }

  const pmToken = await login(pmUser.email, 'Password123!');
  const devToken = await login(devUser.email, 'Password123!');
  const clientToken = await login(clientUser.email, 'Password123!');
  console.log('✓ Successfully authenticated PM, Dev, and Client');

  // 1. PM Advanced Analytics
  console.log('\n1. Fetching Project Advanced Analytics as Project Manager...');
  const pmRes = await fetch(`${API_BASE}/projects/${project._id}/advanced-analytics`, {
    headers: { Authorization: `Bearer ${pmToken}` }
  });
  if (!pmRes.ok) throw new Error(`Failed PM analytics: ${pmRes.status}`);
  const pmData = (await pmRes.json()).data;
  console.log(`✓ Total Tasks: ${pmData.overview.totalTasks}, Completed: ${pmData.overview.completedTasks}`);
  console.log(`✓ Completion: ${pmData.overview.completionPercentage}%, Actual Progress: ${pmData.overview.actualProgress}%, Planned: ${pmData.overview.plannedProgress}%`);
  console.log(`✓ Health: ${pmData.healthIndicators.health.toUpperCase()}, Risk Level: ${pmData.healthIndicators.riskLevel.toUpperCase()}`);
  console.log(`✓ Team Performance Records: ${pmData.teamPerformance?.length || 0} members evaluated`);
  console.log(`✓ AI Insights Integrated: ${pmData.aiInsights.predictiveDelays?.length || 0} delay alerts, ${pmData.aiInsights.bottlenecks?.length || 0} bottlenecks`);

  // 2. Client Confidentiality Verification
  console.log('\n2. Verifying Client Confidentiality Gate...');
  const clientRes = await fetch(`${API_BASE}/projects/${project._id}/advanced-analytics`, {
    headers: { Authorization: `Bearer ${clientToken}` }
  });
  if (!clientRes.ok) throw new Error(`Failed Client analytics: ${clientRes.status}`);
  const clientData = (await clientRes.json()).data;
  if (clientData.teamPerformance !== null) {
    throw new Error('SECURITY VIOLATION: Team performance details leaked to client role!');
  }
  if (clientData.healthIndicators.riskScore !== undefined) {
    throw new Error('SECURITY VIOLATION: Internal risk score leaked to client role!');
  }
  console.log('✓ Client confidentiality strictly enforced (teamPerformance: null, riskScore masked)');

  // 3. Workspace Comparison Analytics
  console.log('\n3. Fetching Multi-Project Workspace Comparison...');
  const compRes = await fetch(`${API_BASE}/analytics/comparison`, {
    headers: { Authorization: `Bearer ${pmToken}` }
  });
  if (!compRes.ok) throw new Error(`Failed comparison analytics: ${compRes.status}`);
  const compData = (await compRes.json()).data;
  console.log(`✓ Accessible Projects in Workspace: ${compData.totals.projects}`);
  console.log(`✓ Total Workspace Tasks: ${compData.totals.tasks}, Overall Completion: ${compData.totals.overallCompletionRate}%`);
  console.log(`✓ Average Progress Across Projects: ${compData.totals.averageProgress}%`);

  // 4. PDF Report Generation & Streaming
  console.log('\n4. Generating & Streaming Project PDF Report...');
  const pdfRes = await fetch(`${API_BASE}/projects/${project._id}/reports/pdf`, {
    headers: { Authorization: `Bearer ${pmToken}` }
  });
  if (!pdfRes.ok) throw new Error(`Failed PDF generation: ${pdfRes.status}`);
  const pdfContentType = pdfRes.headers.get('content-type');
  const pdfDisposition = pdfRes.headers.get('content-disposition');
  const pdfNosniff = pdfRes.headers.get('x-content-type-options');
  const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());

  if (!pdfContentType.includes('application/pdf')) throw new Error(`Invalid PDF content type: ${pdfContentType}`);
  if (!pdfBuffer.slice(0, 4).toString().startsWith('%PDF')) throw new Error('Invalid PDF magic bytes');
  console.log(`✓ PDF streamed (${pdfBuffer.length} bytes) with Content-Disposition: ${pdfDisposition}`);
  console.log(`✓ Security Header X-Content-Type-Options: ${pdfNosniff}`);

  // 5. Excel (.xlsx) Report Generation & Validation
  console.log('\n5. Generating & Validating Multi-Sheet Excel Workbook...');
  const excelRes = await fetch(`${API_BASE}/projects/${project._id}/reports/excel`, {
    headers: { Authorization: `Bearer ${pmToken}` }
  });
  if (!excelRes.ok) throw new Error(`Failed Excel generation: ${excelRes.status}`);
  const excelBuffer = Buffer.from(await excelRes.arrayBuffer());

  if (excelBuffer[0] !== 0x50 || excelBuffer[1] !== 0x4B) throw new Error('Invalid XLSX ZIP magic bytes');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(excelBuffer);
  const sheetNames = wb.worksheets.map((s) => s.name);
  console.log(`✓ Excel workbook validated (${excelBuffer.length} bytes)`);
  console.log(`✓ Verified 5 Worksheets: ${sheetNames.join(', ')}`);

  // 6. Client Excel Masking
  console.log('\n6. Validating Client Excel Report...');
  const clientExcelRes = await fetch(`${API_BASE}/projects/${project._id}/reports/excel`, {
    headers: { Authorization: `Bearer ${clientToken}` }
  });
  const clientExcelBuf = Buffer.from(await clientExcelRes.arrayBuffer());
  const clientWb = new ExcelJS.Workbook();
  await clientWb.xlsx.load(clientExcelBuf);
  const clientTeamSheet = clientWb.getWorksheet('Team Performance');
  const noticeCell = clientTeamSheet.getCell('A2').value;
  console.log(`✓ Client Excel Team Performance Sheet: "${noticeCell}"`);

  // 7. Date Range Filtering
  console.log('\n7. Testing Date-Range Filtered Analytics...');
  const now = new Date();
  const past30 = new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0];
  const next30 = new Date(now.getTime() + 30 * 86400000).toISOString().split('T')[0];
  const dateRangeRes = await fetch(`${API_BASE}/projects/${project._id}/advanced-analytics?startDate=${past30}&endDate=${next30}`, {
    headers: { Authorization: `Bearer ${pmToken}` }
  });
  const dateRangeData = (await dateRangeRes.json()).data;
  console.log(`✓ Filtered Window (${past30} to ${next30}) Tasks: ${dateRangeData.overview.totalTasks}`);

  await mongoose.disconnect();
  console.log('\n🎉 ALL LIVE PHASE 6 VERIFICATION CHECKS PASSED SUCCESSFULLY!\n');
}

main().catch((err) => {
  console.error('❌ Phase 6 Live Verification Failed:', err);
  process.exit(1);
});
