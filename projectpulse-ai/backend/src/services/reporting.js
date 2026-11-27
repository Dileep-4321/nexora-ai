import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { getProjectAdvancedAnalytics } from './analytics.js';

/**
 * Format a Date object to YYYY-MM-DD
 */
function formatDate(d) {
  if (!d) return 'N/A';
  const date = new Date(d);
  if (isNaN(date.getTime())) return 'N/A';
  return date.toISOString().split('T')[0];
}

/**
 * Clean string to safe filename segment
 */
function sanitizeFileSegment(str) {
  return String(str || 'report').replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Generates a comprehensive, professional PDF Report for a project
 */
export async function generateProjectPDFReport({ projectId, startDate, endDate, user }) {
  const analytics = await getProjectAdvancedAnalytics({ projectId, startDate, endDate, user });
  const isClient = user.role === 'client';
  const genDateStr = formatDate(new Date());

  const doc = new PDFDocument({
    margin: 40,
    size: 'A4',
    bufferPages: true,
    info: {
      Title: `NEXORA Report - ${analytics.projectName}`,
      Author: user.name || 'NEXORA AI',
      Subject: 'Project Delivery Analytics & Performance Report'
    }
  });

  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));

  const endPromise = new Promise((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  const pageWidth = doc.page.width - 80;

  // Header Banner & Decorative Bar
  doc.rect(40, 40, pageWidth, 4).fill('#4F46E5');
  doc.moveDown(0.8);

  doc.fontSize(20).fillColor('#0F172A').font('Helvetica-Bold')
    .text('NEXORA AI', 40, 50, { continued: true })
    .fontSize(12).fillColor('#64748B').font('Helvetica')
    .text(' | Project Performance & Analytics Report', { align: 'left' });

  doc.moveDown(0.5);

  // Metadata Box
  doc.rect(40, 75, pageWidth, 55).fillAndStroke('#F8FAFC', '#E2E8F0');
  doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(13)
    .text(`${analytics.projectName} (${analytics.projectCode || 'PROJ'})`, 50, 83);

  doc.fontSize(9).font('Helvetica').fillColor('#475569')
    .text(`Generated: ${genDateStr} by ${user.name} (${user.role.toUpperCase()})`, 50, 100)
    .text(`Schedule: ${formatDate(analytics.startDate)} to ${formatDate(analytics.deadline)} | Filter: ${analytics.dateRange.startDate ? `${formatDate(analytics.dateRange.startDate)} to ${formatDate(analytics.dateRange.endDate)}` : 'All Time'}`, 50, 113);

  doc.y = 145;

  // Section 1: Executive KPI Summary
  doc.fillColor('#1E293B').font('Helvetica-Bold').fontSize(12).text('1. Executive Delivery Summary');
  doc.moveDown(0.3);

  const kpis = [
    { label: 'Overall Completion', val: `${analytics.overview.completionPercentage}%` },
    { label: 'Planned Progress', val: `${analytics.overview.plannedProgress}%` },
    { label: 'Actual Progress', val: `${analytics.overview.actualProgress}%` },
    { label: 'Schedule Variance', val: `${analytics.overview.progressVariance > 0 ? '+' : ''}${analytics.overview.progressVariance}%` },
    { label: 'Health Status', val: (analytics.healthIndicators.health || 'Good').toUpperCase() },
    { label: 'Overdue Tasks', val: String(analytics.overview.overdueTasks) }
  ];

  const colW = pageWidth / 3;
  kpis.forEach((kpi, idx) => {
    const rx = 40 + (idx % 3) * colW;
    const ry = doc.y + Math.floor(idx / 3) * 45;
    doc.rect(rx, ry, colW - 8, 38).fillAndStroke('#F1F5F9', '#CBD5E1');
    doc.fillColor('#64748B').font('Helvetica').fontSize(8).text(kpi.label, rx + 8, ry + 6);
    doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(13).text(kpi.val, rx + 8, ry + 18);
  });

  doc.y += 100;

  // Section 2: Task Status & Priority Breakdown
  doc.fillColor('#1E293B').font('Helvetica-Bold').fontSize(12).text('2. Task Status & Priority Breakdown');
  doc.moveDown(0.3);

  const statusY = doc.y;
  doc.fontSize(9).font('Helvetica').fillColor('#334155');

  // Status Table
  doc.text(`Total Tasks: ${analytics.overview.totalTasks}`, 40, statusY);
  doc.text(`• To Do: ${analytics.statusDistribution.todo}`, 45, statusY + 15);
  doc.text(`• In Progress: ${analytics.statusDistribution.inProgress}`, 45, statusY + 28);
  doc.text(`• Completed: ${analytics.statusDistribution.completed}`, 45, statusY + 41);
  doc.text(`• Blocked: ${analytics.statusDistribution.blocked}`, 45, statusY + 54);

  // Priority Table
  doc.text('Priority Distribution:', 240, statusY);
  doc.text(`• Critical: ${analytics.priorityDistribution.critical}`, 245, statusY + 15);
  doc.text(`• High: ${analytics.priorityDistribution.high}`, 245, statusY + 28);
  doc.text(`• Medium: ${analytics.priorityDistribution.medium}`, 245, statusY + 41);
  doc.text(`• Low: ${analytics.priorityDistribution.low}`, 245, statusY + 54);

  doc.y = statusY + 75;

  // Section 3: Project Milestones
  doc.fillColor('#1E293B').font('Helvetica-Bold').fontSize(12).text(`3. Project Milestones (${analytics.overview.completedMilestones}/${analytics.overview.totalMilestones} Completed)`);
  doc.moveDown(0.3);

  if (analytics.milestones.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor('#64748B').text('No milestones configured for this project.');
    doc.moveDown(0.5);
  } else {
    // Milestone header
    const mY = doc.y;
    doc.rect(40, mY, pageWidth, 18).fill('#E2E8F0');
    doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(8);
    doc.text('Milestone Title', 45, mY + 5, { width: 220 });
    doc.text('Due Date', 270, mY + 5, { width: 80 });
    doc.text('Status', 360, mY + 5, { width: 80 });
    doc.text('Progress', 450, mY + 5, { width: 60 });

    doc.y = mY + 20;

    analytics.milestones.forEach((m, idx) => {
      const rowY = doc.y;
      if (idx % 2 === 1) doc.rect(40, rowY, pageWidth, 16).fill('#F8FAFC');
      doc.fillColor('#334155').font('Helvetica').fontSize(8);
      doc.text(m.title, 45, rowY + 3, { width: 220, ellipsis: true });
      doc.text(formatDate(m.dueDate), 270, rowY + 3, { width: 80 });
      doc.text(String(m.status || 'pending').toUpperCase(), 360, rowY + 3, { width: 80 });
      doc.text(`${m.progress}%`, 450, rowY + 3, { width: 60 });
      doc.y = rowY + 16;
    });
    doc.moveDown(0.8);
  }

  // Section 4: Delayed Tasks Analysis
  if (doc.y > 620) doc.addPage();
  doc.fillColor('#1E293B').font('Helvetica-Bold').fontSize(12).text(`4. Delayed Tasks Analysis (${analytics.delayedTasks.length} Active Overdue)`);
  doc.moveDown(0.3);

  if (analytics.delayedTasks.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor('#10B981').text('✓ Excellent: No tasks are currently overdue.');
    doc.moveDown(0.8);
  } else {
    const dY = doc.y;
    doc.rect(40, dY, pageWidth, 18).fill('#FEE2E2');
    doc.fillColor('#991B1B').font('Helvetica-Bold').fontSize(8);
    doc.text('Overdue Task', 45, dY + 5, { width: 200 });
    doc.text('Due Date', 250, dY + 5, { width: 70 });
    doc.text('Overdue', 325, dY + 5, { width: 60 });
    doc.text('Priority', 390, dY + 5, { width: 60 });
    doc.text('Assignee', 455, dY + 5, { width: 80 });

    doc.y = dY + 20;

    analytics.delayedTasks.slice(0, 8).forEach((t, idx) => {
      const rowY = doc.y;
      if (idx % 2 === 1) doc.rect(40, rowY, pageWidth, 16).fill('#FFF5F5');
      doc.fillColor('#450A0A').font('Helvetica').fontSize(8);
      doc.text(t.title, 45, rowY + 3, { width: 200, ellipsis: true });
      doc.text(formatDate(t.dueDate), 250, rowY + 3, { width: 70 });
      doc.text(`${t.daysOverdue} d`, 325, rowY + 3, { width: 60 });
      doc.text(String(t.priority).toUpperCase(), 390, rowY + 3, { width: 60 });
      doc.text(isClient ? 'Team Member' : (t.assignee?.name || 'Unassigned'), 455, rowY + 3, { width: 80, ellipsis: true });
      doc.y = rowY + 16;
    });
    doc.moveDown(0.8);
  }

  // Section 5: Team Performance Summary (Confidential to Internal Users)
  if (!isClient && analytics.teamPerformance && analytics.teamPerformance.length > 0) {
    if (doc.y > 580) doc.addPage();
    doc.fillColor('#1E293B').font('Helvetica-Bold').fontSize(12).text('5. Team Performance & Workload Summary (CONFIDENTIAL)');
    doc.moveDown(0.3);

    const tY = doc.y;
    doc.rect(40, tY, pageWidth, 18).fill('#E2E8F0');
    doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(8);
    doc.text('Member Name', 45, tY + 5, { width: 150 });
    doc.text('Role', 200, tY + 5, { width: 80 });
    doc.text('Assigned', 285, tY + 5, { width: 50 });
    doc.text('Completed', 340, tY + 5, { width: 55 });
    doc.text('On-Time %', 400, tY + 5, { width: 55 });
    doc.text('Workload', 460, tY + 5, { width: 60 });

    doc.y = tY + 20;

    analytics.teamPerformance.forEach((tm, idx) => {
      const rowY = doc.y;
      if (idx % 2 === 1) doc.rect(40, rowY, pageWidth, 16).fill('#F8FAFC');
      doc.fillColor('#334155').font('Helvetica').fontSize(8);
      doc.text(tm.member.name, 45, rowY + 3, { width: 150, ellipsis: true });
      doc.text(tm.member.role, 200, rowY + 3, { width: 80 });
      doc.text(String(tm.assignedTasks), 285, rowY + 3, { width: 50 });
      doc.text(String(tm.completedTasks), 340, rowY + 3, { width: 55 });
      doc.text(`${tm.onTimeCompletionRate}%`, 400, rowY + 3, { width: 55 });
      doc.text(`${tm.workloadUtilization}% (${tm.workloadClassification})`, 460, rowY + 3, { width: 60 });
      doc.y = rowY + 16;
    });
    doc.moveDown(0.8);
  } else if (isClient) {
    doc.font('Helvetica-Oblique').fontSize(8).fillColor('#64748B')
      .text('Note: Individual team member workloads and internal performance statistics are confidential and excluded from client reports.');
    doc.moveDown(0.5);
  }

  // Section 6: AI-Powered Analytical Insights (Advisory Only)
  if (doc.y > 660) doc.addPage();
  doc.fillColor('#4338CA').font('Helvetica-Bold').fontSize(11).text('AI Analytical Insights & Recommendations (Advisory Only)');
  doc.fontSize(8).font('Helvetica-Oblique').fillColor('#6366F1')
    .text('Notice: AI recommendations are deterministic heuristic guidance requiring human project manager authorization.');
  doc.moveDown(0.3);

  if (analytics.aiInsights.predictiveDelays.length > 0) {
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#991B1B').text('Delay Alerts:');
    analytics.aiInsights.predictiveDelays.slice(0, 3).forEach((d) => {
      doc.fontSize(8).font('Helvetica').fillColor('#334155')
        .text(`• ${d.title}: ${d.suggestedAction || 'Review schedule pace.'}`);
    });
  }

  // Page numbering and footer on every buffered page
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(8).font('Helvetica').fillColor('#94A3B8').text(
      `NEXORA AI Platform • Page ${i + 1} of ${range.count} • ${isClient ? 'Client Confidential Summary' : 'Internal Confidential'} • ${genDateStr}`,
      40,
      doc.page.height - 25,
      { align: 'center', width: pageWidth }
    );
  }

  doc.end();
  const pdfBuffer = await endPromise;

  const filename = `NEXORA_Report_${sanitizeFileSegment(analytics.projectCode || 'PROJ')}_${genDateStr}.pdf`;

  return {
    buffer: pdfBuffer,
    filename,
    mimeType: 'application/pdf'
  };
}

/**
 * Generates a comprehensive, professional Excel (.xlsx) Report with 5 worksheets
 */
export async function generateProjectExcelReport({ projectId, startDate, endDate, user }) {
  const analytics = await getProjectAdvancedAnalytics({ projectId, startDate, endDate, user });
  const isClient = user.role === 'client';
  const genDateStr = formatDate(new Date());

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'NEXORA AI';
  workbook.created = new Date();
  workbook.modified = new Date();

  const headerFill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' }
  };

  const headerFont = {
    name: 'Arial',
    size: 10,
    bold: true,
    color: { argb: 'FFFFFFFF' }
  };

  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
  };

  function applyHeaderRow(row) {
    row.eachCell((cell) => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = thinBorder;
    });
    row.height = 24;
  }

  function applyDataRow(row, isEven = false) {
    row.eachCell((cell) => {
      if (isEven) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' }
        };
      }
      cell.font = { name: 'Arial', size: 9 };
      cell.border = thinBorder;
    });
  }

  // --- Worksheet 1: Project Overview ---
  const wsOverview = workbook.addWorksheet('Project Overview');
  wsOverview.columns = [
    { header: 'Attribute', key: 'attr', width: 28 },
    { header: 'Value', key: 'val', width: 45 },
    { header: 'Notes / Calculation', key: 'notes', width: 45 }
  ];
  applyHeaderRow(wsOverview.getRow(1));

  const overviewRows = [
    { attr: 'Project Name', val: analytics.projectName, notes: 'Full registered title' },
    { attr: 'Project Code', val: analytics.projectCode, notes: 'Project identifier' },
    { attr: 'Description', val: analytics.description || 'N/A', notes: 'Project scope' },
    { attr: 'Start Date', val: formatDate(analytics.startDate), notes: 'Target inception' },
    { attr: 'Deadline', val: formatDate(analytics.deadline), notes: 'Target delivery milestone' },
    { attr: 'Report Generation Date', val: genDateStr, notes: `Exported by ${user.name} (${user.role})` },
    { attr: 'Overall Completion Rate', val: `${analytics.overview.completionPercentage}%`, notes: `${analytics.overview.completedTasks} of ${analytics.overview.totalTasks} tasks closed` },
    { attr: 'Planned Progress', val: `${analytics.overview.plannedProgress}%`, notes: 'Elapsed time vs total duration' },
    { attr: 'Actual Progress', val: `${analytics.overview.actualProgress}%`, notes: 'Estimated-hours weighted task progress' },
    { attr: 'Progress Variance', val: `${analytics.overview.progressVariance}%`, notes: 'Actual progress minus planned progress' },
    { attr: 'Health Status', val: (analytics.healthIndicators.health || 'Good').toUpperCase(), notes: 'Comprehensive project health tier' },
    { attr: 'Risk Level', val: (analytics.healthIndicators.riskLevel || 'Medium').toUpperCase(), notes: isClient ? 'Standard monitoring' : `Risk score: ${analytics.healthIndicators.riskScore ?? 'N/A'}` },
    { attr: 'Milestones Completed', val: `${analytics.overview.completedMilestones} / ${analytics.overview.totalMilestones}`, notes: `${analytics.overview.milestoneCompletionRate}% milestone completion` },
    { attr: 'Overdue Tasks', val: analytics.overview.overdueTasks, notes: 'Active tasks past deadline' }
  ];

  overviewRows.forEach((r, idx) => {
    const row = wsOverview.addRow(r);
    applyDataRow(row, idx % 2 === 1);
  });

  // --- Worksheet 2: Task Details ---
  const wsTasks = workbook.addWorksheet('Task Details');
  wsTasks.columns = [
    { header: 'Task Title', key: 'title', width: 32 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Priority', key: 'priority', width: 12 },
    { header: 'Progress', key: 'progress', width: 12 },
    { header: 'Due Date', key: 'dueDate', width: 14 },
    { header: 'Assignee', key: 'assignee', width: 22 },
    { header: 'Blockers Count', key: 'blockers', width: 15 }
  ];
  applyHeaderRow(wsTasks.getRow(1));

  // Retrieve all project tasks for full task details worksheet
  const { Task } = await import('../models/index.js');
  const allTasks = await Task.find({ project: analytics.projectId }).populate('assignedTo', 'name email').sort({ dueDate: 1 });

  allTasks.forEach((t, idx) => {
    const row = wsTasks.addRow({
      title: t.title,
      status: String(t.status || 'todo').toUpperCase(),
      priority: String(t.priority || 'medium').toUpperCase(),
      progress: `${t.progress || 0}%`,
      dueDate: formatDate(t.dueDate),
      assignee: isClient ? 'Assigned Team' : (t.assignedTo?.name || 'Unassigned'),
      blockers: (t.blockers || []).length
    });
    applyDataRow(row, idx % 2 === 1);
  });

  // --- Worksheet 3: Milestones ---
  const wsMilestones = workbook.addWorksheet('Milestones');
  wsMilestones.columns = [
    { header: 'Milestone Title', key: 'title', width: 35 },
    { header: 'Target Due Date', key: 'dueDate', width: 16 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Progress', key: 'progress', width: 14 },
    { header: 'Overdue?', key: 'isOverdue', width: 14 }
  ];
  applyHeaderRow(wsMilestones.getRow(1));

  analytics.milestones.forEach((m, idx) => {
    const row = wsMilestones.addRow({
      title: m.title,
      dueDate: formatDate(m.dueDate),
      status: String(m.status || 'pending').toUpperCase(),
      progress: `${m.progress}%`,
      isOverdue: m.isOverdue ? 'YES' : 'NO'
    });
    applyDataRow(row, idx % 2 === 1);
  });

  // --- Worksheet 4: Team Performance (Confidential) ---
  const wsTeam = workbook.addWorksheet('Team Performance');
  if (isClient) {
    wsTeam.columns = [{ header: 'Confidential Notice', key: 'notice', width: 60 }];
    applyHeaderRow(wsTeam.getRow(1));
    const row = wsTeam.addRow({ notice: 'Individual team member performance and workload metrics are confidential to internal staff.' });
    applyDataRow(row, false);
  } else {
    wsTeam.columns = [
      { header: 'Member Name', key: 'name', width: 24 },
      { header: 'Role', key: 'role', width: 18 },
      { header: 'Assigned Tasks', key: 'assigned', width: 15 },
      { header: 'Completed Tasks', key: 'completed', width: 16 },
      { header: 'Active Tasks', key: 'active', width: 14 },
      { header: 'Overdue Tasks', key: 'overdue', width: 14 },
      { header: 'Completion Rate', key: 'compRate', width: 16 },
      { header: 'On-Time Rate', key: 'onTimeRate', width: 15 },
      { header: 'Workload %', key: 'workload', width: 14 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Productivity Score', key: 'productivity', width: 18 }
    ];
    applyHeaderRow(wsTeam.getRow(1));

    (analytics.teamPerformance || []).forEach((tm, idx) => {
      const row = wsTeam.addRow({
        name: tm.member.name,
        role: tm.member.role,
        assigned: tm.assignedTasks,
        completed: tm.completedTasks,
        active: tm.activeTasks,
        overdue: tm.overdueTasks,
        compRate: `${tm.completionRate}%`,
        onTimeRate: `${tm.onTimeCompletionRate}%`,
        workload: `${tm.workloadUtilization}%`,
        status: String(tm.workloadClassification || 'balanced').toUpperCase(),
        productivity: tm.productivityScore
      });
      applyDataRow(row, idx % 2 === 1);
    });
  }

  // --- Worksheet 5: Analytics Summary ---
  const wsSummary = workbook.addWorksheet('Analytics Summary');
  wsSummary.columns = [
    { header: 'Metric Category', key: 'cat', width: 24 },
    { header: 'Metric Name', key: 'name', width: 28 },
    { header: 'Calculated Value', key: 'val', width: 22 },
    { header: 'Calculation Basis & Methodology', key: 'desc', width: 55 }
  ];
  applyHeaderRow(wsSummary.getRow(1));

  const summaryRows = [
    { cat: 'Delivery', name: 'Task Completion Rate', val: `${analytics.overview.completionPercentage}%`, desc: 'Completed tasks / Total tasks * 100' },
    { cat: 'Delivery', name: 'Planned Progress', val: `${analytics.overview.plannedProgress}%`, desc: 'Elapsed project time / Total project scheduled span * 100' },
    { cat: 'Delivery', name: 'Actual Progress', val: `${analytics.overview.actualProgress}%`, desc: 'Sum(task.progress * estimatedHours) / Sum(estimatedHours)' },
    { cat: 'Delivery', name: 'Schedule Variance', val: `${analytics.overview.progressVariance}%`, desc: 'Actual Progress - Planned Progress (Positive = Ahead, Negative = Behind)' },
    { cat: 'Milestones', name: 'Milestone Progress', val: `${analytics.overview.milestoneCompletionRate}%`, desc: 'Completed milestones / Total project milestones * 100' },
    { cat: 'Risk', name: 'Delayed Task Count', val: analytics.overview.overdueTasks, desc: 'Active incomplete tasks past due date' },
    { cat: 'Risk', name: 'Project Health', val: analytics.healthIndicators.health, desc: 'Deterministic multi-factor health classification' },
    { cat: 'Risk', name: 'Overall Risk Level', val: analytics.healthIndicators.riskLevel, desc: 'Weighted risk matrix evaluating delays, dependencies, blockers, and capacity' }
  ];

  summaryRows.forEach((r, idx) => {
    const row = wsSummary.addRow(r);
    applyDataRow(row, idx % 2 === 1);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `NEXORA_Report_${sanitizeFileSegment(analytics.projectCode || 'PROJ')}_${genDateStr}.xlsx`;

  return {
    buffer: Buffer.from(buffer),
    filename,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };
}
