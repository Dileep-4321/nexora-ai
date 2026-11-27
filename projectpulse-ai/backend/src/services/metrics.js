import { Project, Task, User, MemberSkill, ResourceRecommendation, ProjectRiskSnapshot, TaskAssignmentHistory } from '../models/index.js';
import { cache } from './cache.js';

const clamp = (value) => Math.max(0, Math.min(100, Math.round(value)));
const priorityWeight = { low: 1, medium: 1.2, high: 1.5, critical: 2 };
export function riskBand(score) { return score >= 75 ? 'critical' : score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low'; }
export function healthBand(score) { return score < 25 ? 'excellent' : score < 50 ? 'good' : score < 75 ? 'warning' : 'critical'; }

const COMMON_SKILLS = [
  'React', 'Node.js', 'Express', 'MongoDB', 'JavaScript', 'TypeScript',
  'Python', 'Machine Learning', 'Data Analysis', 'Testing', 'Security',
  'DevOps', 'Docker', 'AWS', 'API Design', 'Architecture', 'Agile',
  'Governance', 'UI/UX', 'Full-stack'
];

export function extractSkillsFromText(text = '') {
  if (!text) return [];
  const lower = text.toLowerCase();
  const matched = [];
  for (const skill of COMMON_SKILLS) {
    const escaped = skill.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(lower)) {
      matched.push({ name: skill, importance: 0.8 });
    }
  }
  return matched;
}

export async function workloadFor(projectId, memberId) {
  const [member, tasks] = await Promise.all([User.findById(memberId), Task.find({ project: projectId, assignedTo: memberId, status: { $ne: 'completed' } })]);
  if (!member) return { percentage: 0, classification: 'low', activeHours: 0 };
  const activeHours = tasks.reduce((total, task) => {
    const hours = (task.estimatedHours && task.estimatedHours > 0)
      ? task.estimatedHours
      : (task.priority === 'critical' ? 24 : task.priority === 'high' ? 16 : task.priority === 'medium' ? 8 : 4);
    return total + Math.max(0, hours * (1 - (task.progress || 0) / 100));
  }, 0);
  const percentage = clamp(activeHours / Math.max(member.workloadCapacity, 1) * 100);
  return { percentage, activeHours, classification: percentage >= 100 ? 'overloaded' : percentage >= 75 ? 'high' : percentage >= 35 ? 'balanced' : 'low' };
}

export async function projectWorkload(projectId) {
  const project = await Project.findById(projectId).populate('teamMembers', 'name role availabilityStatus workloadCapacity');
  if (!project) return [];
  return Promise.all(project.teamMembers.map(async (member) => ({ member: { _id: member._id, name: member.name, role: member.role, availabilityStatus: member.availabilityStatus }, ...(await workloadFor(projectId, member._id)) })));
}

export async function performanceFor(memberId, projectId) {
  const filter = { assignedTo: memberId }; if (projectId) filter.project = projectId;
  const tasks = await Task.find(filter); const closed = tasks.filter((task) => task.status === 'completed');
  const assigned = tasks.length; const completionRate = assigned ? closed.length / assigned * 100 : 0;
  const overdue = tasks.filter((task) => task.status !== 'completed' && task.dueDate < new Date()).length;
  const estimated = tasks.reduce((n, task) => n + task.estimatedHours, 0); const actual = tasks.reduce((n, task) => n + task.actualHours, 0);
  const deadlineAdherence = assigned ? (assigned - overdue) / assigned * 100 : 100;
  const efficiency = estimated ? Math.min(100, actual ? estimated / actual * 100 : 85) : 85;
  const score = clamp(completionRate * .4 + deadlineAdherence * .35 + efficiency * .25);
  return { assigned, completed: closed.length, completionRate: Math.round(completionRate), overdue, estimatedHours: estimated, actualHours: actual, productivityScore: score };
}

export async function calculateProjectMetrics(projectId, persist = true) {
  const cacheKey = `project_metrics:${projectId}`;
  if (!persist) {
    const cached = cache.get(cacheKey);
    if (cached) return JSON.parse(JSON.stringify(cached));
  }
  const project = await Project.findById(projectId); if (!project) throw Object.assign(new Error('Project not found'), { status: 404 });
  const [tasks, workload] = await Promise.all([Task.find({ project: projectId }), projectWorkload(projectId)]);
  const now = new Date(); const weighted = tasks.reduce((sum, task) => sum + task.progress * Math.max(task.estimatedHours, 1), 0); const weights = tasks.reduce((sum, task) => sum + Math.max(task.estimatedHours, 1), 0);
  const progress = clamp(weights ? weighted / weights : 0);
  const totalDays = Math.max(1, project.deadline - project.startDate); const elapsed = Math.max(0, now - project.startDate); const expectedProgress = clamp(elapsed / totalDays * 100);
  const active = tasks.filter((task) => task.status !== 'completed'); const overdue = active.filter((task) => task.dueDate < now); const blocked = active.filter((task) => task.status === 'blocked'); const critical = active.filter((task) => ['high', 'critical'].includes(task.priority));
  const daysRemaining = Math.ceil((project.deadline - now) / 86400000); const highWorkload = workload.filter((entry) => entry.percentage >= 75).length; const unavailable = workload.filter((entry) => ['unavailable', 'absent', 'overloaded'].includes(entry.member.availabilityStatus)).length;
  const progressGap = progress - expectedProgress;
  const isFullyCompleted = tasks.length > 0 && active.length === 0 && progress >= 100;
  const deadlineRisk = isFullyCompleted ? 0 : (daysRemaining <= 0 ? 100 : clamp((1 - daysRemaining / Math.max(1, Math.ceil(totalDays / 86400000))) * 100));
  const delayRisk = active.length ? overdue.length / active.length * 100 : 0;
  const progressRisk = isFullyCompleted ? 0 : clamp(Math.max(0, -progressGap) * 2);
  const priorityRisk = active.length ? critical.reduce((sum, task) => sum + priorityWeight[task.priority], 0) / (active.length * 2) * 100 : 0;
  const blockerRisk = active.length ? blocked.length / active.length * 100 : 0;
  const workloadRisk = isFullyCompleted ? 0 : (workload.length ? ((highWorkload + unavailable) / workload.length) * 100 : 0);
  const performance = await Promise.all(workload.map((entry) => performanceFor(entry.member._id, projectId)));
  const averageProductivity = performance.length ? performance.reduce((sum, p) => sum + p.productivityScore, 0) / performance.length : 100;
  const productivityRisk = isFullyCompleted ? 0 : 100 - averageProductivity;
  const score = isFullyCompleted ? 0 : clamp(deadlineRisk * .2 + delayRisk * .2 + progressRisk * .2 + priorityRisk * .15 + blockerRisk * .1 + workloadRisk * .1 + productivityRisk * .05);

  // 8 Specific Risk Conditions with structured fields & severity
  const structuredRisks = [];
  let riskIdx = 1;

  // 1. Overdue tasks
  if (overdue.length) {
    structuredRisks.push({
      id: `risk-${riskIdx++}`,
      category: 'overdue_tasks',
      severity: 'CRITICAL',
      reason: `${overdue.length} active task${overdue.length === 1 ? ' is' : 's are'} overdue past scheduled deadline.`,
      affectedItem: overdue[0].title + (overdue.length > 1 ? ` (+${overdue.length - 1} more)` : ''),
      recommendedAction: 'Reassign, extend deadline, or clear blockers immediately.'
    });
  }

  // 2. High-priority incomplete tasks
  const criticalIncomplete = active.filter((t) => ['high', 'critical'].includes(t.priority) && t.progress < 50);
  if (criticalIncomplete.length) {
    const isCrit = criticalIncomplete.some((t) => t.priority === 'critical');
    structuredRisks.push({
      id: `risk-${riskIdx++}`,
      category: 'high_priority_incomplete',
      severity: isCrit ? 'CRITICAL' : 'HIGH',
      reason: `${criticalIncomplete.length} high/critical priority task${criticalIncomplete.length === 1 ? ' is' : 's are'} lagging under 50% completion.`,
      affectedItem: criticalIncomplete[0].title + (criticalIncomplete.length > 1 ? ` (+${criticalIncomplete.length - 1} more)` : ''),
      recommendedAction: 'Allocate senior team support to accelerate delivery.'
    });
  }

  // 3. Low progress near deadline (<60% progress with <= 7 days)
  const nearDeadline = active.filter((t) => {
    if (t.dueDate <= now) return false;
    const days = Math.ceil((t.dueDate - now) / 86400000);
    return days <= 7 && t.progress < 60;
  });
  if (nearDeadline.length) {
    structuredRisks.push({
      id: `risk-${riskIdx++}`,
      category: 'low_progress_near_deadline',
      severity: 'HIGH',
      reason: `${nearDeadline.length} task${nearDeadline.length === 1 ? ' has' : 's have'} low progress (<60%) with deadline approaching inside 7 days.`,
      affectedItem: nearDeadline[0].title,
      recommendedAction: 'Review task scope, eliminate dependencies, or reassign.'
    });
  }

  // 4. Unassigned critical tasks
  const unassignedCritical = active.filter((t) => !t.assignedTo && ['high', 'critical'].includes(t.priority));
  if (unassignedCritical.length) {
    structuredRisks.push({
      id: `risk-${riskIdx++}`,
      category: 'unassigned_critical',
      severity: 'CRITICAL',
      reason: `${unassignedCritical.length} critical/high-priority task${unassignedCritical.length === 1 ? ' has' : 's have'} no assigned member.`,
      affectedItem: unassignedCritical[0].title,
      recommendedAction: 'Use AI team-member recommendation to assign an owner immediately.'
    });
  }

  // 5. Blocked tasks
  if (blocked.length) {
    structuredRisks.push({
      id: `risk-${riskIdx++}`,
      category: 'blocked_tasks',
      severity: 'HIGH',
      reason: `${blocked.length} task${blocked.length === 1 ? ' is' : 's are'} currently blocked.`,
      affectedItem: blocked[0].title + (blocked[0].blockers?.length ? `: ${blocked[0].blockers[0]}` : ''),
      recommendedAction: 'Resolve technical blocker or escalate cross-team dependency.'
    });
  }

  // 6. Overloaded members
  const overloadedMembers = workload.filter((entry) => entry.percentage >= 100 || entry.member.availabilityStatus === 'overloaded');
  if (overloadedMembers.length) {
    structuredRisks.push({
      id: `risk-${riskIdx++}`,
      category: 'overloaded_members',
      severity: 'CRITICAL',
      reason: `${overloadedMembers[0].member.name} is overloaded at ${overloadedMembers[0].percentage}% capacity.`,
      affectedItem: overloadedMembers[0].member.name,
      recommendedAction: 'Redistribute active tasks to members with available capacity.'
    });
  } else {
    const highWorkloadMembers = workload.filter((entry) => entry.percentage >= 75);
    if (highWorkloadMembers.length) {
      structuredRisks.push({
        id: `risk-${riskIdx++}`,
        category: 'overloaded_members',
        severity: 'HIGH',
        reason: `${highWorkloadMembers[0].member.name} has a high workload (${highWorkloadMembers[0].percentage}% capacity).`,
        affectedItem: highWorkloadMembers[0].member.name,
        recommendedAction: 'Limit new task assignments to avoid delivery burnout.'
      });
    }
  }

  // 7. Projects behind schedule
  if (progressGap < -10) {
    structuredRisks.push({
      id: `risk-${riskIdx++}`,
      category: 'projects_behind_schedule',
      severity: 'HIGH',
      reason: `Project progress (${progress}%) is ${Math.abs(progressGap)}% behind expected timeline (${expectedProgress}%).`,
      affectedItem: project.name,
      recommendedAction: 'Review critical path, compress upcoming milestones, or add resources.'
    });
  }

  // 8. Uneven workload
  if (workload.length >= 2) {
    const percentages = workload.map((w) => w.percentage);
    const maxW = Math.max(...percentages);
    const minW = Math.min(...percentages);
    if (maxW - minW >= 45) {
      structuredRisks.push({
        id: `risk-${riskIdx++}`,
        category: 'uneven_workload',
        severity: 'MEDIUM',
        reason: `Uneven workload distribution: team utilization ranges from ${minW}% to ${maxW}%.`,
        affectedItem: 'Team Workload Balance',
        recommendedAction: 'Balance assignments to optimize overall delivery throughput.'
      });
    }
  }

  // Fallback if no elevated risks detected
  if (structuredRisks.length === 0) {
    structuredRisks.push({
      id: 'risk-optimal',
      category: 'optimal',
      severity: 'LOW',
      reason: 'Progress, workload, and delivery deadlines are within target range.',
      affectedItem: project.name,
      recommendedAction: 'Continue standard sprint execution.'
    });
  }

  const factors = structuredRisks.map((r) => r.reason);
  const metrics = {
    projectId,
    progress,
    expectedProgress,
    progressGap,
    daysRemaining,
    overdueTasks: overdue.length,
    blockedTasks: blocked.length,
    activeTasks: active.length,
    totalTasks: tasks.length,
    riskScore: score,
    riskLevel: riskBand(score),
    health: healthBand(score),
    factors,
    risks: structuredRisks,
    workload,
    performance,
    averageProductivity: Math.round(averageProductivity),
    recommendations: structuredRisks.map((r) => r.recommendedAction)
  };

  if (persist) {
    Object.assign(project, { progress, expectedProgress, riskScore: score, riskLevel: metrics.riskLevel, health: metrics.health });
    await project.save();
    await ProjectRiskSnapshot.create({ project: projectId, riskScore: score, riskLevel: metrics.riskLevel, factors });
    cache.invalidateProject(projectId);
  } else {
    cache.set(cacheKey, metrics);
  }
  return metrics;
}

export async function recommendationFor(taskId) {
  const task = await Task.findById(taskId).populate('project assignedTo');
  if (!task) throw Object.assign(new Error('Task not found'), { status: 404 });
  const project = task.project;
  const excludeCurrent = task.assignedTo ? { _id: { $ne: task.assignedTo._id } } : {};
  const members = await User.find({ _id: { $in: project.teamMembers }, ...excludeCurrent, isActive: true });
  const skills = await MemberSkill.find({ member: { $in: members.map((m) => m._id) } });

  // Extract skills from task title & description if not explicitly set
  const explicitNeeds = task.requiredSkills || [];
  const extractedNeeds = explicitNeeds.length ? [] : extractSkillsFromText(`${task.title} ${task.description || ''}`);
  const needed = explicitNeeds.length ? explicitNeeds : extractedNeeds;

  const candidates = [];
  for (const member of members) {
    if (['unavailable', 'absent', 'overloaded'].includes(member.availabilityStatus)) continue;
    const workload = await workloadFor(project._id, member._id);
    if (workload.percentage >= 100) continue;

    // Check skills in both MemberSkill and User.skills
    const memberDbSkills = skills.filter((skill) => String(skill.member) === String(member._id));
    const userStringSkills = Array.isArray(member.skills) ? member.skills : [];
    const combinedSkillNames = new Set([
      ...memberDbSkills.map((s) => s.skillName.toLowerCase()),
      ...userStringSkills.map((s) => s.toLowerCase())
    ]);

    const matchedSkills = [];
    let coverage = 70;
    if (needed.length) {
      let matchedWeight = 0;
      let totalWeight = 0;
      for (const need of needed) {
        const weight = need.importance || 1;
        totalWeight += weight;
        const foundDb = memberDbSkills.find((s) => s.skillName.toLowerCase() === need.name.toLowerCase());
        if (foundDb) {
          const level = { beginner: .35, intermediate: .6, advanced: .82, expert: 1 }[foundDb.proficiency] || .7;
          matchedWeight += level * weight;
          matchedSkills.push(need.name);
        } else if (userStringSkills.some((s) => s.toLowerCase() === need.name.toLowerCase())) {
          matchedWeight += 0.8 * weight;
          matchedSkills.push(need.name);
        }
      }
      coverage = totalWeight ? (matchedWeight / totalWeight) * 100 : 70;
      // Skip if missing mandatory high importance skill
      if (needed.some((need) => need.importance >= .9 && !combinedSkillNames.has(need.name.toLowerCase()))) continue;
    }

    const performance = await performanceFor(member._id, project._id);
    const experience = Math.min(100, (memberDbSkills.reduce((sum, s) => sum + s.experienceYears, 0) || (userStringSkills.length * 1.5)) * 12);
    const deadlineFit = task.dueDate > new Date() ? Math.max(30, 100 - workload.percentage) : 25;

    // Count real active tasks
    const activeTasksCount = await Task.countDocuments({ assignedTo: member._id, status: { $ne: 'completed' } });

    // Previous assignments history
    const pastAssignments = await TaskAssignmentHistory.countDocuments({ newMember: member._id });
    const experienceBonus = Math.min(10, pastAssignments * 2);

    const availMultiplier = member.availabilityStatus === 'available' ? 1.0 : member.availabilityStatus === 'busy' ? 0.75 : 0.5;

    const score = clamp(
      (
        coverage * .3 +
        experience * .15 +
        (100 - workload.percentage) * .15 +
        performance.productivityScore * .15 +
        performance.completionRate * .1 +
        deadlineFit * .1 +
        experienceBonus * .05
      ) * availMultiplier
    );

    candidates.push({
      member: { _id: member._id, name: member.name, role: member.role, availabilityStatus: member.availabilityStatus },
      matchScore: score,
      skillMatch: clamp(coverage),
      matchedSkills,
      workload: workload.percentage,
      activeTasks: activeTasksCount,
      productivity: performance.productivityScore,
      experience: clamp(experience),
      availability: member.availabilityStatus,
      deadlineFit: clamp(deadlineFit)
    });
  }

  candidates.sort((a, b) => b.matchScore - a.matchScore);
  const best = candidates[0];
  const skillSummary = best?.matchedSkills?.length ? ` in ${best.matchedSkills.join(', ')}` : '';
  const reason = best
    ? `${best.member.name} is recommended (${best.matchScore}% confidence) with ${best.skillMatch}% skill fit${skillSummary}, ${best.workload}% current workload (${best.activeTasks} active tasks), and a productivity score of ${best.productivity}.`
    : 'No suitable candidate found. Team members either lack essential skills, are unavailable, or would exceed capacity thresholds.';

  return { task, candidates, best, reason, requiredSkills: needed };
}

export async function analyzeTask(taskId) {
  const task = await Task.findById(taskId).populate('project assignedTo');
  if (!task) throw Object.assign(new Error('Task not found'), { status: 404 });
  const project = task.project;

  const extracted = extractSkillsFromText(`${task.title} ${task.description || ''}`);
  const explicit = (task.requiredSkills || []).map((s) => ({ name: s.name, importance: s.importance || 0.8 }));
  const skillMap = new Map();
  for (const s of [...explicit, ...extracted]) {
    if (!skillMap.has(s.name.toLowerCase())) skillMap.set(s.name.toLowerCase(), s);
  }
  const detectedSkills = Array.from(skillMap.values());

  const now = new Date();
  const daysRemaining = task.dueDate ? Math.ceil((task.dueDate - now) / 86400000) : null;
  const isOverdue = daysRemaining !== null && daysRemaining < 0;
  const isTight = daysRemaining !== null && daysRemaining <= 3 && task.progress < 50;

  const hours = task.estimatedHours || 0;
  const complexity = hours > 40 || task.priority === 'critical' ? 'High' : hours > 15 || task.priority === 'high' ? 'Medium' : 'Standard';

  let taskRiskScore = 15;
  if (isOverdue) taskRiskScore += 50;
  else if (isTight) taskRiskScore += 35;
  else if (daysRemaining !== null && daysRemaining <= 7) taskRiskScore += 20;

  if (task.status === 'blocked') taskRiskScore += 30;
  if (!task.assignedTo && ['high', 'critical'].includes(task.priority)) taskRiskScore += 25;
  if (task.priority === 'critical') taskRiskScore += 15;
  else if (task.priority === 'high') taskRiskScore += 10;
  taskRiskScore = clamp(taskRiskScore);
  const taskRiskLevel = riskBand(taskRiskScore);

  const recommendation = await recommendationFor(taskId);

  const warnings = [];
  if (isOverdue) warnings.push({ severity: 'CRITICAL', message: `Task is overdue by ${Math.abs(daysRemaining)} day(s).` });
  if (task.status === 'blocked') warnings.push({ severity: 'HIGH', message: `Task is marked blocked${task.blockers?.length ? `: ${task.blockers[0]}` : ''}.` });
  if (!task.assignedTo) warnings.push({ severity: 'MEDIUM', message: 'Task currently has no assigned member.' });
  if (isTight) warnings.push({ severity: 'HIGH', message: `Deadline is in ${daysRemaining} day(s) with only ${task.progress}% completion.` });

  return {
    project: { _id: project?._id, name: project?.name },
    task,
    detectedSkills,
    complexity,
    estimatedHours: hours,
    daysRemaining,
    isOverdue,
    taskRiskScore,
    taskRiskLevel,
    recommendation,
    warnings
  };
}

export async function saveRecommendation(taskId) {
  const result = await recommendationFor(taskId);
  const existing = await ResourceRecommendation.findOne({ task: taskId, status: 'pending' });
  const factors = result.best
    ? [
        `${result.best.skillMatch}% skill match`,
        `${Math.max(0, 100 - result.best.workload)}% available capacity`,
        `${result.best.productivity}% productivity`,
        `${result.best.deadlineFit}% deadline fit`
      ]
    : ['No eligible candidate'];

  if (existing) {
    existing.unavailableMember = result.task.assignedTo?._id || null;
    existing.recommendedMember = result.best?.member._id || null;
    existing.alternativeCandidates = result.candidates.slice(1);
    existing.matchScore = result.best?.matchScore || 0;
    existing.factors = factors;
    existing.reason = result.reason;
    await existing.save();
    return existing;
  }
  return ResourceRecommendation.create({
    project: result.task.project._id,
    task: taskId,
    unavailableMember: result.task.assignedTo?._id || null,
    recommendedMember: result.best?.member._id || null,
    alternativeCandidates: result.candidates.slice(1),
    matchScore: result.best?.matchScore || 0,
    factors,
    reason: result.reason
  });
}
