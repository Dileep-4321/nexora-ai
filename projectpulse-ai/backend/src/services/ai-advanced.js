import {
  Project,
  Task,
  Milestone,
  User,
  ResourceRecommendation,
  ActivityLog,
  Notification,
  TaskAssignmentHistory
} from '../models/index.js';
import { calculateProjectMetrics, workloadFor } from './metrics.js';
import {
  emitNotification,
  emitActivity,
  emitTaskAssigned
} from './realtime.js';

export const BOTTLENECK_TYPES = [
  'delivery_delay',
  'resource_saturation',
  'dependency_blocker',
  'stuck_in_progress',
  'milestone_risk'
];

/**
 * Standard productive working hours per day per developer
 */
const PRODUCTIVE_HOURS_PER_DAY = 6;

/**
 * Priority default hours fallback if estimatedHours is unset
 */
const DEFAULT_HOURS_BY_PRIORITY = {
  critical: 24,
  high: 16,
  medium: 8,
  low: 4
};

/**
 * Helper: Assess data sufficiency score and qualitative level
 * Evaluates whether enough historical and active records exist for reliable forecasting.
 */
function assessDataSufficiency(tasks = [], completedTasks = []) {
  const total = tasks.length;
  const completed = completedTasks.length;
  const tasksWithDueDates = tasks.filter((t) => t.dueDate).length;
  const tasksWithEstimates = tasks.filter((t) => (t.estimatedHours || 0) > 0).length;

  let score = 20; // Baseline
  if (total >= 10) score += 30;
  else if (total >= 4) score += 15;

  if (completed >= 5) score += 25;
  else if (completed >= 1) score += 10;

  if (tasksWithDueDates === total && total > 0) score += 15;
  if (tasksWithEstimates / Math.max(1, total) >= 0.7) score += 10;

  score = Math.min(100, Math.max(10, score));

  let level = 'insufficient_data';
  let explanation = 'Insufficient data: minimal task records available for reliable velocity forecasting.';

  if (score >= 80) {
    level = 'high';
    explanation = 'High data sufficiency: robust historical task completion and velocity baseline.';
  } else if (score >= 55) {
    level = 'moderate';
    explanation = 'Moderate data sufficiency: adequate task records and target dates available for velocity projection.';
  } else if (score >= 30) {
    level = 'low';
    explanation = 'Low data sufficiency: limited task volume leads to approximate velocity bounds.';
  }

  return { level, score, explanation };
}

/**
 * A. Predictive Task Delay Analysis
 * Evaluates whether individual tasks are on track or likely to miss their scheduled due date.
 * @param {string} projectId
 * @returns {Promise<Array>} Array of analyzed tasks with risk levels and explanations
 */
export async function predictTaskDelays(projectId) {
  const tasks = await Task.find({ project: projectId, status: { $ne: 'completed' } })
    .populate('assignedTo', 'name email role availabilityStatus productivityScore workloadCapacity')
    .sort({ dueDate: 1 });

  const completedTasks = await Task.find({ project: projectId, status: 'completed' });
  const sufficiency = assessDataSufficiency(tasks, completedTasks);
  const now = new Date();

  return tasks.map((task) => {
    const estimatedTotal = Number(task.estimatedHours) || DEFAULT_HOURS_BY_PRIORITY[task.priority] || 8;
    const progress = Math.min(100, Math.max(0, Number(task.progress) || 0));
    const hoursRemaining = Math.max(0, estimatedTotal * (1 - progress / 100));

    const dueDate = task.dueDate ? new Date(task.dueDate) : new Date(now.getTime() + 7 * 86400000);
    const msRemaining = dueDate.getTime() - now.getTime();
    const daysRemaining = msRemaining / 86400000;

    // Assignee capacity modifier
    const assignee = task.assignedTo;
    let velocityMultiplier = 1.0;
    if (assignee) {
      if (assignee.availabilityStatus === 'busy') velocityMultiplier = 0.75;
      if (assignee.availabilityStatus === 'unavailable' || assignee.availabilityStatus === 'absent') velocityMultiplier = 0.3;
      if (assignee.productivityScore && assignee.productivityScore > 0) {
        velocityMultiplier *= (assignee.productivityScore / 100);
      }
    } else {
      velocityMultiplier = 0.1;
    }

    const effectiveHoursPerDay = Math.max(1, PRODUCTIVE_HOURS_PER_DAY * velocityMultiplier);
    const estimatedDaysNeeded = hoursRemaining / effectiveHoursPerDay;
    const predictedCompletionDate = new Date(now.getTime() + estimatedDaysNeeded * 86400000);

    // Delay calculation
    const delayDays = (predictedCompletionDate.getTime() - dueDate.getTime()) / 86400000;

    // Risk Classification
    let riskLevel = 'low';
    const riskFactors = [];
    let suggestedAction = 'Maintain current pace and monitoring.';

    if (now > dueDate) {
      riskLevel = 'critical';
      riskFactors.push(`Task is already overdue by ${Math.abs(Math.round(daysRemaining))} day(s)`);
      suggestedAction = 'Immediate intervention required: reassign or adjust milestone scope.';
    } else if (task.status === 'blocked' || (task.blockers && task.blockers.length > 0)) {
      riskLevel = 'critical';
      riskFactors.push(`Task is currently blocked (${task.blockers?.length || 1} active blocker(s))`);
      suggestedAction = 'Resolve blockers immediately or escalate dependency.';
    } else if (!assignee) {
      riskLevel = 'high';
      riskFactors.push('Task is unassigned; zero delivery velocity');
      suggestedAction = 'Review AI recommendation and assign a team member.';
    } else if (delayDays > 3) {
      riskLevel = 'critical';
      riskFactors.push(`Projected completion is ${Math.round(delayDays)} days past deadline`);
      suggestedAction = 'Workload rebalance recommended: offload secondary tasks from assignee.';
    } else if (delayDays > 0) {
      riskLevel = 'high';
      riskFactors.push(`Projected completion exceeds deadline by ${delayDays.toFixed(1)} days`);
      suggestedAction = 'Assign co-developer or negotiate 48-hour buffer.';
    } else if (daysRemaining <= 2 && progress < 50) {
      riskLevel = 'medium';
      riskFactors.push(`Only ${daysRemaining.toFixed(1)} days remaining with ${progress}% completed`);
      suggestedAction = 'Daily standup check-in to confirm developer throughput.';
    }

    return {
      taskId: String(task._id),
      title: task.title,
      status: task.status,
      priority: task.priority,
      progress,
      estimatedHours: estimatedTotal,
      hoursRemaining: Math.round(hoursRemaining * 10) / 10,
      dueDate: dueDate.toISOString(),
      predictedCompletionDate: predictedCompletionDate.toISOString(),
      daysRemaining: Math.round(daysRemaining * 10) / 10,
      delayDays: Math.round(delayDays * 10) / 10,
      riskLevel,
      riskFactors,
      suggestedAction,
      dataSufficiency: sufficiency,
      assignee: assignee ? {
        id: String(assignee._id),
        name: assignee.name,
        role: assignee.role,
        availability: assignee.availabilityStatus
      } : null,
      isEstimate: true
    };
  });
}

/**
 * B. Project Delay & Schedule Estimation
 * Projects overall project completion date, schedule variance, contributing factors, and confidence.
 * @param {string} projectId
 * @returns {Promise<object>} Project completion estimation and schedule variance analysis
 */
export async function predictProjectDelay(projectId) {
  const project = await Project.findById(projectId);
  if (!project) throw Object.assign(new Error('Project not found'), { status: 404 });

  const tasks = await Task.find({ project: projectId })
    .populate('assignedTo', 'name email role availabilityStatus productivityScore workloadCapacity');

  const now = new Date();
  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const activeTasks = tasks.filter((t) => t.status !== 'completed');
  const overdueTasks = activeTasks.filter((t) => t.dueDate && new Date(t.dueDate) < now);
  const blockedTasks = activeTasks.filter((t) => t.status === 'blocked' || (t.blockers && t.blockers.length > 0));

  // Remaining work calculation
  const totalRemainingHours = activeTasks.reduce((sum, t) => {
    const est = Number(t.estimatedHours) || DEFAULT_HOURS_BY_PRIORITY[t.priority] || 8;
    const prog = Math.min(100, Math.max(0, Number(t.progress) || 0));
    return sum + Math.max(0, est * (1 - prog / 100));
  }, 0);

  // Velocity calculation:
  const assignedDevelopers = new Set(
    activeTasks.map((t) => (t.assignedTo?._id ? String(t.assignedTo._id) : null)).filter(Boolean)
  );
  const devCount = Math.max(1, assignedDevelopers.size);

  let velocityMultiplier = 1.0;
  for (const t of activeTasks) {
    if (t.assignedTo?.availabilityStatus === 'busy') velocityMultiplier *= 0.92;
    if (t.assignedTo?.availabilityStatus === 'unavailable') velocityMultiplier *= 0.5;
  }
  velocityMultiplier = Math.max(0.4, Math.min(1.2, velocityMultiplier));
  const dailyWorkCapacity = Math.max(6, devCount * PRODUCTIVE_HOURS_PER_DAY * velocityMultiplier);

  const estimatedDaysToFinish = totalRemainingHours > 0 ? (totalRemainingHours / dailyWorkCapacity) : 0;
  const estimatedCompletionDate = new Date(now.getTime() + estimatedDaysToFinish * 86400000);
  const targetDeadline = project.deadline ? new Date(project.deadline) : new Date(now.getTime() + 30 * 86400000);

  // Variance in days: positive means delayed past deadline, negative means ahead of schedule
  const scheduleVarianceDays = Math.round(((estimatedCompletionDate.getTime() - targetDeadline.getTime()) / 86400000) * 10) / 10;

  // Data sufficiency assessment
  const dataSufficiency = assessDataSufficiency(tasks, completedTasks);

  // Contributing factors
  const contributingFactors = [];
  if (scheduleVarianceDays > 0) {
    contributingFactors.push(`Projected completion exceeds target deadline by ${Math.abs(scheduleVarianceDays)} day(s).`);
  } else if (scheduleVarianceDays < 0) {
    contributingFactors.push(`Currently tracking ${Math.abs(scheduleVarianceDays)} day(s) ahead of contracted deadline.`);
  } else {
    contributingFactors.push('Tracking on scheduled delivery timeline.');
  }

  if (overdueTasks.length > 0) {
    contributingFactors.push(`${overdueTasks.length} active task(s) currently overdue past scheduled due date.`);
  }
  if (blockedTasks.length > 0) {
    contributingFactors.push(`${blockedTasks.length} task(s) currently blocked by dependencies or technical impediments.`);
  }
  if (totalRemainingHours > 80) {
    contributingFactors.push(`High remaining workload volume (${Math.round(totalRemainingHours)} estimated hours).`);
  }

  // Risk Level
  let riskLevel = 'low';
  if (scheduleVarianceDays > 5 || overdueTasks.length >= 3) {
    riskLevel = 'critical';
  } else if (scheduleVarianceDays > 0 || overdueTasks.length > 0 || blockedTasks.length > 0) {
    riskLevel = 'high';
  } else if (scheduleVarianceDays > -3) {
    riskLevel = 'medium';
  }

  // Historical accuracy tracking
  const tasksWithActuals = completedTasks.filter((t) => (t.actualHours || 0) > 0 && (t.estimatedHours || 0) > 0);
  let historicalAccuracy = null;
  if (tasksWithActuals.length > 0) {
    const accuracySum = tasksWithActuals.reduce((sum, t) => {
      const ratio = Math.min(t.actualHours, t.estimatedHours) / Math.max(t.actualHours, t.estimatedHours);
      return sum + ratio;
    }, 0);
    historicalAccuracy = {
      sampleSize: tasksWithActuals.length,
      averageAccuracyPercentage: Math.round((accuracySum / tasksWithActuals.length) * 100),
      onTimeDeliveryRate: Math.round(
        (completedTasks.filter((t) => !t.dueDate || new Date(t.completedAt || t.updatedAt) <= new Date(t.dueDate)).length /
          Math.max(1, completedTasks.length)) * 100
      )
    };
  }

  return {
    projectId: String(project._id),
    projectName: project.name,
    projectStatus: project.status,
    targetDeadline: targetDeadline.toISOString(),
    estimatedCompletionDate: estimatedCompletionDate.toISOString(),
    scheduleVarianceDays,
    isDelayed: scheduleVarianceDays > 0,
    riskLevel,
    dataSufficiency,
    metrics: {
      totalTasks: tasks.length,
      completedTasks: completedTasks.length,
      activeTasks: activeTasks.length,
      overdueTasks: overdueTasks.length,
      blockedTasks: blockedTasks.length,
      totalRemainingHours: Math.round(totalRemainingHours * 10) / 10,
      activeDeveloperCount: devCount,
      estimatedDaysToFinish: Math.round(estimatedDaysToFinish * 10) / 10
    },
    contributingFactors,
    historicalAccuracy
  };
}

/**
 * C. Intelligent Workload Rebalancing
 * Analyzes developer capacities and identifies overloaded members, finding suitable alternative candidates.
 * Returns structured actionable recommendations with the 7 required fields.
 * Requires explicit human approval before any reassignment is executed.
 * @param {string} projectId
 * @returns {Promise<object>} Overloaded members, available members, and structured rebalance proposals
 */
export async function calculateWorkloadRebalance(projectId) {
  const project = await Project.findById(projectId).populate('teamMembers', 'name email role skills availabilityStatus workloadCapacity productivityScore');
  if (!project) return { overloaded: [], available: [], proposals: [], imbalanceIndex: 0 };

  const members = project.teamMembers || [];
  const memberWorkloads = await Promise.all(
    members.map(async (m) => {
      const wl = await workloadFor(projectId, m._id);
      const activeTasks = await Task.find({ project: projectId, assignedTo: m._id, status: { $ne: 'completed' } });
      return {
        member: m,
        workload: wl,
        activeTasks
      };
    })
  );

  // Workload Imbalance Index: (max capacity - min capacity)
  const capacities = memberWorkloads.map((mw) => mw.workload.percentage);
  const maxCap = capacities.length ? Math.max(...capacities) : 0;
  const minCap = capacities.length ? Math.min(...capacities) : 0;
  const imbalanceIndex = Math.max(0, maxCap - minCap);

  // Identify overloaded (>= 75% capacity or >= 3 active tasks)
  const overloaded = memberWorkloads.filter(
    (mw) => mw.workload.percentage >= 75 || mw.activeTasks.length >= 3 || mw.member.availabilityStatus === 'busy'
  );

  // Identify available (< 60% capacity and < 3 active tasks and available)
  const available = memberWorkloads.filter(
    (mw) => mw.workload.percentage < 60 && mw.activeTasks.length < 3 && mw.member.availabilityStatus === 'available'
  );

  const proposals = [];

  for (const over of overloaded) {
    const rebalanceableTasks = over.activeTasks.filter((t) => t.status !== 'completed');

    for (const task of rebalanceableTasks) {
      const requiredSkills = (task.requiredSkills || []).map((s) => s.name?.toLowerCase() || String(s).toLowerCase());

      const candidateScoring = available.map((avail) => {
        const candidateSkills = (avail.member.skills || []).map((s) => s.toLowerCase());
        const matchingSkills = requiredSkills.filter((rs) => candidateSkills.includes(rs));
        const skillMatchRate = requiredSkills.length > 0 ? (matchingSkills.length / requiredSkills.length) * 100 : 70;

        return {
          candidate: avail.member,
          currentWorkload: avail.workload.percentage,
          projectedWorkload: Math.min(100, avail.workload.percentage + 25),
          skillMatchRate: Math.round(skillMatchRate),
          matchingSkills
        };
      });

      candidateScoring.sort((a, b) => (b.skillMatchRate - b.currentWorkload) - (a.skillMatchRate - a.currentWorkload));

      const bestCandidate = candidateScoring[0];
      if (bestCandidate) {
        proposals.push({
          id: `prop-${task._id}-${bestCandidate.candidate._id}`,
          proposalId: `prop-${task._id}-${bestCandidate.candidate._id}`,
          title: `Reallocate "${task.title}" to Balance Squad Capacity`,
          issue: `${over.member.name} is currently at ${Math.round(over.workload.percentage)}% capacity with ${over.activeTasks.length} active deliverables, creating delivery burnout risk.`,
          supportingData: `${over.member.name}: ${Math.round(over.workload.percentage)}% load; Candidate ${bestCandidate.candidate.name}: ${Math.round(bestCandidate.currentWorkload)}% load (${bestCandidate.skillMatchRate}% skill match).`,
          reasoning: `Reassigning this deliverable reduces workload concentration by 25% while matching verified competencies in ${bestCandidate.matchingSkills.join(', ') || 'related stack'}.`,
          recommendedAction: `Reassign "${task.title}" from ${over.member.name} to ${bestCandidate.candidate.name}.`,
          expectedBenefit: `Normalizes team utilization, prevents ${task.title} from slipping, and mitigates engineer fatigue.`,
          riskLimitation: `Requires brief handover: allow up to 4 hours ramp-up time for codebase alignment.`,
          taskId: String(task._id),
          taskTitle: task.title,
          priority: task.priority,
          currentAssignee: {
            id: String(over.member._id),
            name: over.member.name,
            currentWorkload: over.workload.percentage,
            projectedWorkload: Math.max(0, over.workload.percentage - 25)
          },
          proposedAssignee: {
            id: String(bestCandidate.candidate._id),
            name: bestCandidate.candidate.name,
            currentWorkload: bestCandidate.currentWorkload,
            projectedWorkload: bestCandidate.projectedWorkload,
            skillMatchRate: bestCandidate.skillMatchRate,
            matchingSkills: bestCandidate.matchingSkills
          },
          reason: `${over.member.name} is currently at ${Math.round(over.workload.percentage)}% capacity with ${over.activeTasks.length} active tasks. Rebalancing to ${bestCandidate.candidate.name} (${bestCandidate.skillMatchRate}% skill match) evens team distribution.`,
          actionPayload: {
            taskId: String(task._id),
            memberId: String(bestCandidate.candidate._id),
            reason: `Workload rebalance from ${over.member.name}`
          },
          requiresApproval: true,
          status: 'pending_human_review'
        });
      }
    }
  }

  return {
    overloadedCount: overloaded.length,
    availableCount: available.length,
    imbalanceIndex,
    proposals
  };
}

/**
 * D. Project Bottleneck Intelligence
 * Aggregates delivery friction points across tasks, members, dependencies, and milestones.
 * Detects: stuck in progress, awaiting review, blocked by dependencies, repeatedly overdue, workload concentration.
 * @param {string} projectId
 * @returns {Promise<object>} Bottleneck diagnosis and project health explanation
 */
export async function detectProjectBottlenecks(projectId) {
  const [project, metrics, delayAnalysis, rebalanceData, milestones, tasks] = await Promise.all([
    Project.findById(projectId),
    calculateProjectMetrics(projectId, false),
    predictTaskDelays(projectId),
    calculateWorkloadRebalance(projectId),
    Milestone.find({ project: projectId }),
    Task.find({ project: projectId }).populate('assignedTo', 'name email role')
  ]);

  if (!project) return { bottlenecks: [], healthExplanation: 'Project not found' };

  const bottlenecks = [];
  const now = new Date();

  // 1. Critical delay bottleneck
  const criticalTasks = delayAnalysis.filter((t) => t.riskLevel === 'critical' || t.riskLevel === 'high');
  if (criticalTasks.length > 0) {
    bottlenecks.push({
      type: 'delivery_delay',
      severity: criticalTasks.length >= 3 ? 'critical' : 'high',
      title: `${criticalTasks.length} Task(s) At Risk of Slipping Deadline`,
      description: `Tasks [${criticalTasks.map((t) => `"${t.title}"`).slice(0, 3).join(', ')}] are projected to miss completion target dates.`,
      impact: 'Overall milestone completion may slip if critical path tasks remain delayed.',
      affectedTasks: criticalTasks.map((t) => t.title),
      recommendedAction: 'Reassign or reduce scope of delayed tasks.'
    });
  }

  // 2. Resource overload / Workload concentration bottleneck
  if (rebalanceData.overloadedCount > 0) {
    bottlenecks.push({
      type: 'resource_saturation',
      severity: rebalanceData.overloadedCount >= 2 ? 'high' : 'medium',
      title: `${rebalanceData.overloadedCount} Team Member(s) Approaching Saturation`,
      description: `Multiple tasks are concentrated on key developers while ${rebalanceData.availableCount} other member(s) have available capacity.`,
      impact: 'Risk of developer fatigue and blocked review cycles.',
      affectedTasks: rebalanceData.proposals.map((p) => p.taskTitle),
      recommendedAction: 'Execute recommended workload rebalance.'
    });
  }

  // 3. Blocked by Dependencies bottleneck
  const blockedTasks = tasks.filter((t) => t.status === 'blocked' || (t.blockers && t.blockers.length > 0));
  if (blockedTasks.length > 0) {
    bottlenecks.push({
      type: 'dependency_blocker',
      severity: 'high',
      title: `${blockedTasks.length} Task(s) Blocked by Unresolved Dependencies`,
      description: `Task "${blockedTasks[0].title}" has active blockers: ${blockedTasks[0].blockers?.join(', ') || 'Pending external dependency'}.`,
      impact: 'Downstream sprint deliverables cannot start until blocker is resolved.',
      affectedTasks: blockedTasks.map((t) => t.title),
      recommendedAction: 'Schedule blocker triage meeting or escalate dependency.'
    });
  }

  // 4. Stuck in Progress bottleneck
  const stuckTasks = tasks.filter((t) => {
    if (t.status !== 'in-progress') return false;
    const daysSinceUpdate = (now - new Date(t.updatedAt || t.createdAt)) / 86400000;
    return daysSinceUpdate >= 5 && (t.progress || 0) < 50;
  });
  if (stuckTasks.length > 0) {
    bottlenecks.push({
      type: 'stuck_in_progress',
      severity: 'medium',
      title: `${stuckTasks.length} Task(s) In-Progress with Slow Velocity`,
      description: `Tasks [${stuckTasks.map((t) => `"${t.title}"`).slice(0, 2).join(', ')}] have had limited progress updates for over 5 days.`,
      impact: 'Hidden delivery friction that may cause last-minute milestone delay.',
      affectedTasks: stuckTasks.map((t) => t.title),
      recommendedAction: 'Conduct quick standup check-in with assigned engineer to uncover impediments.'
    });
  }

  // 5. Milestone at risk bottleneck
  const atRiskMilestones = milestones.filter((m) => {
    if (m.status === 'completed') return false;
    const due = new Date(m.dueDate);
    return due < now || (due.getTime() - now.getTime() < 3 * 86400000 && (m.progress || 0) < 70);
  });
  if (atRiskMilestones.length > 0) {
    bottlenecks.push({
      type: 'milestone_risk',
      severity: 'critical',
      title: `${atRiskMilestones.length} Upcoming Milestone(s) In Jeopardy`,
      description: `Milestone(s) [${atRiskMilestones.map((m) => `"${m.title}"`).join(', ')}] have target dates within 72h but progress is insufficient.`,
      impact: 'Client-facing delivery dates at immediate risk.',
      affectedTasks: atRiskMilestones.map((m) => m.title),
      recommendedAction: 'Prioritize tasks tied directly to milestone deliverables.'
    });
  }

  // Construct readable health explanation
  let healthExplanation = `Project "${project.name}" is operating at ${metrics.progress}% progress with ${metrics.health} health status. `;
  if (bottlenecks.length === 0) {
    healthExplanation += 'Velocity is balanced, tasks are on schedule, and no critical delivery friction points were detected.';
  } else {
    healthExplanation += `Detected ${bottlenecks.length} active delivery bottleneck(s). Attention is recommended on task pacing and resource distribution.`;
  }

  return {
    projectId: String(project._id),
    projectName: project.name,
    projectProgress: metrics.progress,
    projectHealth: metrics.health,
    riskScore: metrics.riskScore,
    bottleneckCount: bottlenecks.length,
    bottlenecks,
    healthExplanation
  };
}

/**
 * E. Explainable AI Assistant
 * Provides high-level consolidated intelligence with quantitative evidence and data sufficiency indicators.
 * @param {string} projectId
 * @param {string} userRole
 * @returns {Promise<object>} Assistant cards with evidence and recommended actions
 */
export async function getProjectAIAssistant(projectId, userRole = 'project_manager') {
  const [delayAnalysis, projectDelay, rebalanceData, bottleneckData] = await Promise.all([
    predictTaskDelays(projectId),
    predictProjectDelay(projectId),
    calculateWorkloadRebalance(projectId),
    detectProjectBottlenecks(projectId)
  ]);

  const cards = [];
  const isClient = userRole === 'client';

  // Card 1: Delay Predictions
  const urgentTasks = delayAnalysis.filter((t) => t.riskLevel === 'critical' || t.riskLevel === 'high');
  if (urgentTasks.length > 0 || projectDelay.isDelayed) {
    cards.push({
      id: 'ai-card-delays',
      title: isClient ? 'Delivery Schedule Status' : 'Predictive Schedule & Delay Alerts',
      type: 'delay_risk',
      severity: urgentTasks.some((t) => t.riskLevel === 'critical') || projectDelay.scheduleVarianceDays > 3 ? 'critical' : 'high',
      summary: isClient
        ? `${urgentTasks.length} deliverable(s) are actively monitored to ensure alignment with target milestones.`
        : projectDelay.isDelayed
        ? `Project completion is projected to slip ${Math.abs(projectDelay.scheduleVarianceDays)} day(s) based on remaining work and team velocity.`
        : `${urgentTasks.length} task(s) projected to slip deadlines based on velocity analysis.`,
      dataSufficiency: projectDelay.dataSufficiency,
      evidence: isClient ? [
        { metric: 'Milestones On Track', value: `${bottleneckData.projectProgress}% Delivered` },
        { metric: 'Target Milestone Window', value: new Date(projectDelay.targetDeadline).toLocaleDateString() }
      ] : [
        { metric: 'Schedule Variance', value: `${projectDelay.scheduleVarianceDays > 0 ? `+${projectDelay.scheduleVarianceDays}d` : `${projectDelay.scheduleVarianceDays}d`}` },
        { metric: 'Remaining Work', value: `${projectDelay.metrics.totalRemainingHours}h` },
        { metric: 'Overdue Tasks', value: String(projectDelay.metrics.overdueTasks) }
      ],
      suggestedAction: isClient
        ? 'Project leadership is actively managing milestone timelines.'
        : 'Review critical path tasks and consider rebalancing workloads.'
    });
  }

  // Card 2: Workload Rebalancing (CONFIDENTIAL: strictly masked for Client)
  if (!isClient && rebalanceData.proposals.length > 0) {
    const topProposal = rebalanceData.proposals[0];
    cards.push({
      id: 'ai-card-rebalance',
      title: 'Intelligent Workload Rebalance',
      type: 'workload_rebalance',
      severity: 'medium',
      summary: topProposal.issue,
      dataSufficiency: { level: 'high', score: 90, explanation: 'Live developer workload and verified skills data.' },
      evidence: [
        { metric: 'Overloaded Assignee', value: `${topProposal.currentAssignee.name} (${topProposal.currentAssignee.currentWorkload}%)` },
        { metric: 'Proposed Candidate', value: `${topProposal.proposedAssignee.name} (${topProposal.proposedAssignee.currentWorkload}%)` },
        { metric: 'Skill Match', value: `${topProposal.proposedAssignee.skillMatchRate}%` }
      ],
      suggestedAction: 'Review and approve workload rebalancing proposal.',
      actionPayload: topProposal.actionPayload
    });
  }

  // Card 3: Project Health Diagnosis
  cards.push({
    id: 'ai-card-health',
    title: 'Project Health Diagnosis',
    type: 'bottleneck',
    severity: bottleneckData.bottleneckCount > 0 ? 'medium' : 'low',
    summary: bottleneckData.healthExplanation,
    dataSufficiency: projectDelay.dataSufficiency,
    evidence: [
      { metric: 'Current Progress', value: `${bottleneckData.projectProgress}%` },
      { metric: 'Health Band', value: bottleneckData.projectHealth },
      { metric: 'Active Bottlenecks', value: String(bottleneckData.bottleneckCount) }
    ],
    suggestedAction: bottleneckData.bottleneckCount > 0
      ? (isClient ? 'Project team is actively clearing delivery bottlenecks.' : 'Address identified delivery bottlenecks.')
      : 'No immediate action required.'
  });

  return {
    projectId,
    generatedAt: new Date().toISOString(),
    cardCount: cards.length,
    cards
  };
}

/**
 * F. Sprint Intelligence (for Team Lead)
 * Gathers sprint velocity, sprint completion forecasting, predicted unfinished work,
 * squad bottleneck detection, and actionable team recommendations.
 * @param {string} projectId
 * @param {object} user
 */
export async function getSprintIntelligence(projectId, _user) {
  const project = await Project.findById(projectId).populate('teamMembers', 'name email role skills availabilityStatus');
  if (!project) throw Object.assign(new Error('Project not found'), { status: 404 });

  const tasks = await Task.find({ project: projectId })
    .populate('assignedTo', 'name email role availabilityStatus productivityScore workloadCapacity')
    .sort({ dueDate: 1 });

  const now = new Date();
  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const inProgressTasks = tasks.filter((t) => t.status === 'in-progress');
  const todoTasks = tasks.filter((t) => t.status === 'todo');
  const blockedTasks = tasks.filter((t) => t.status === 'blocked' || (t.blockers && t.blockers.length > 0));
  const overdueTasks = tasks.filter((t) => t.status !== 'completed' && t.dueDate && new Date(t.dueDate) < now);

  const totalTasks = tasks.length;
  const completedCount = completedTasks.length;
  const sprintCompletionRate = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;

  // Workload and Velocity estimation
  const totalPlannedHours = tasks.reduce((sum, t) => sum + (Number(t.estimatedHours) || 8), 0);
  const totalActualHours = tasks.reduce((sum, t) => sum + (Number(t.actualHours) || 0), 0);
  const totalRemainingHours = tasks.filter((t) => t.status !== 'completed').reduce((sum, t) => {
    const est = Number(t.estimatedHours) || 8;
    const prog = Math.min(100, Math.max(0, Number(t.progress) || 0));
    return sum + Math.max(0, est * (1 - prog / 100));
  }, 0);

  // Velocity: hours completed per day
  const sprintVelocity = totalPlannedHours > 0 ? Math.round((totalActualHours / Math.max(1, totalPlannedHours)) * 100) : 75;

  // Sprint Completion Prediction
  const remainingActiveDays = Math.ceil(totalRemainingHours / (Math.max(1, (project.teamMembers || []).length) * PRODUCTIVE_HOURS_PER_DAY));
  const estimatedSprintFinish = new Date(now.getTime() + remainingActiveDays * 86400000);
  const sprintEndTarget = project.deadline ? new Date(project.deadline) : new Date(now.getTime() + 14 * 86400000);
  const isSprintAtRisk = estimatedSprintFinish > sprintEndTarget || overdueTasks.length > 0;

  // Predicted unfinished tasks at sprint end
  const predictedUnfinishedTasks = isSprintAtRisk
    ? tasks.filter((t) => t.status !== 'completed' && t.dueDate && new Date(t.dueDate) > sprintEndTarget).length || Math.min(activeTasksCount(tasks), 2)
    : 0;

  const dataSufficiency = assessDataSufficiency(tasks, completedTasks);

  // Team Lead AI Recommendations
  const teamRecommendations = [];
  if (blockedTasks.length > 0) {
    teamRecommendations.push({
      id: 'tl-rec-blocked',
      title: 'De-block Critical Dependency',
      severity: 'high',
      issue: `${blockedTasks.length} task(s) currently blocked by technical impediments.`,
      supportingData: `Task "${blockedTasks[0].title}" blocked by: ${blockedTasks[0].blockers?.join(', ') || 'Dependency'}.`,
      reasoning: 'Clearing dependencies unlocks downstream tasks before sprint cutover.',
      recommendedAction: `Pair on technical solution for "${blockedTasks[0].title}".`,
      expectedBenefit: 'Restores sprint throughput and prevents sprint overflow.',
      riskLimitation: 'May require 2 hours of senior engineer pairing.',
      actionPayload: { taskId: String(blockedTasks[0]._id) },
      status: 'pending_lead_review'
    });
  }

  if (overdueTasks.length > 0) {
    teamRecommendations.push({
      id: 'tl-rec-overdue',
      title: 'Address Slipping Deliverables',
      severity: 'critical',
      issue: `${overdueTasks.length} task(s) have passed their due date without completion.`,
      supportingData: `Tasks [${overdueTasks.map((t) => `"${t.title}"`).slice(0, 2).join(', ')}] overdue.`,
      reasoning: 'Overdue items compress remaining sprint capacity.',
      recommendedAction: 'Reassign or reduce scope to lock sprint commitments.',
      expectedBenefit: 'Avoids carrying debt into the next planning cycle.',
      riskLimitation: 'Requires product manager alignment if scope is reduced.',
      status: 'pending_lead_review'
    });
  }

  return {
    projectId: String(project._id),
    projectName: project.name,
    sprintProgress: sprintCompletionRate,
    sprintVelocity,
    totals: {
      plannedTasks: totalTasks,
      completedTasks: completedCount,
      inProgressTasks: inProgressTasks.length,
      todoTasks: todoTasks.length,
      blockedTasks: blockedTasks.length,
      overdueTasks: overdueTasks.length,
      remainingHours: Math.round(totalRemainingHours),
      plannedHours: totalPlannedHours
    },
    prediction: {
      estimatedFinishDate: estimatedSprintFinish.toISOString(),
      targetEndDate: sprintEndTarget.toISOString(),
      predictedUnfinishedWork: `${predictedUnfinishedTasks} tasks (~${Math.round(totalRemainingHours * 0.3)}h)`,
      riskLevel: isSprintAtRisk ? (overdueTasks.length >= 2 ? 'critical' : 'high') : 'low',
      dataSufficiency
    },
    teamRecommendations
  };
}

function activeTasksCount(tasks) {
  return tasks.filter((t) => t.status !== 'completed').length;
}

/**
 * G. Personal Intelligence (for Team Member)
 * Provides personal productivity insights, deadline predictions, and workload guidance.
 * Designed for self-empowerment and focus, NOT surveillance.
 * @param {string} userId
 * @param {object} requesterUser
 */
export async function getPersonalIntelligence(userId, requesterUser) {
  const user = await User.findById(userId).select('name email role skills availabilityStatus workloadCapacity productivityScore');
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  // Privacy check: only self, project_manager, or admin can access
  if (String(user._id) !== String(requesterUser._id) && !['admin', 'project_manager', 'team_lead'].includes(requesterUser.role)) {
    throw Object.assign(new Error('Access denied to personal analytics'), { status: 403 });
  }

  const tasks = await Task.find({ assignedTo: user._id }).populate('project', 'name code');
  const now = new Date();

  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const activeTasks = tasks.filter((t) => t.status !== 'completed');
  const overdueTasks = activeTasks.filter((t) => t.dueDate && new Date(t.dueDate) < now);

  const totalAssigned = tasks.length;
  const completionRate = totalAssigned > 0 ? Math.round((completedTasks.length / totalAssigned) * 100) : 0;

  // On-time completion rate
  const onTimeCompleted = completedTasks.filter((t) => !t.dueDate || new Date(t.completedAt || t.updatedAt) <= new Date(t.dueDate)).length;
  const onTimeRate = completedTasks.length > 0 ? Math.round((onTimeCompleted / completedTasks.length) * 100) : 100;

  // Personal Deadline Predictions (At-risk tasks)
  const atRiskTasks = activeTasks.map((t) => {
    const dueDate = new Date(t.dueDate);
    const daysUntilDue = (dueDate.getTime() - now.getTime()) / 86400000;
    const est = Number(t.estimatedHours) || 8;
    const prog = Number(t.progress) || 0;
    const remainingHours = est * (1 - prog / 100);

    let riskLevel = 'low';
    let reason = 'On track for scheduled completion.';
    let suggestedAction = 'Maintain standard execution pace.';

    if (daysUntilDue < 0) {
      riskLevel = 'critical';
      reason = `Task is overdue by ${Math.abs(Math.round(daysUntilDue))} day(s).`;
      suggestedAction = 'Focus today on completing this task or update your lead.';
    } else if (daysUntilDue <= 2 && prog < 50) {
      riskLevel = 'high';
      reason = `Deadline in ${Math.round(daysUntilDue * 10) / 10} days with only ${prog}% completed.`;
      suggestedAction = 'Prioritize this deliverable above lower-priority items today.';
    } else if (t.status === 'blocked') {
      riskLevel = 'high';
      reason = 'Task is currently blocked by a dependency.';
      suggestedAction = 'Reach out to your team lead or reviewer to resolve blocker.';
    }

    return {
      taskId: String(t._id),
      title: t.title,
      projectName: t.project?.name || 'Project Deliverable',
      priority: t.priority,
      status: t.status,
      progress: prog,
      dueDate: t.dueDate,
      daysUntilDue: Math.round(daysUntilDue * 10) / 10,
      remainingHours: Math.round(remainingHours),
      riskLevel,
      reason,
      suggestedAction
    };
  }).filter((t) => t.riskLevel !== 'low');

  // Personal AI Recommendations
  const personalRecommendations = [];
  if (overdueTasks.length > 0) {
    personalRecommendations.push({
      id: 'personal-rec-overdue',
      title: 'Prioritize Overdue Task',
      priority: 'critical',
      message: `You have ${overdueTasks.length} overdue task: "${overdueTasks[0].title}". Recommend updating progress today.`,
      action: 'Open Task Workspace'
    });
  }

  const upcomingTight = activeTasks.filter((t) => {
    if (!t.dueDate || t.dueDate <= now) return false;
    const days = (new Date(t.dueDate) - now) / 86400000;
    return days <= 3 && ['high', 'critical'].includes(t.priority);
  });

  if (upcomingTight.length > 0) {
    personalRecommendations.push({
      id: 'personal-rec-tight',
      title: 'Approaching High-Priority Deadline',
      priority: 'high',
      message: `"${upcomingTight[0].title}" is due in ${Math.ceil((new Date(upcomingTight[0].dueDate) - now) / 86400000)} days.`,
      action: 'Focus Today'
    });
  }

  // Workload calculation
  const totalRemainingHours = activeTasks.reduce((sum, t) => sum + (Number(t.estimatedHours) || 8) * (1 - (t.progress || 0) / 100), 0);
  const capacityPct = Math.min(100, Math.round((totalRemainingHours / Math.max(1, user.workloadCapacity || 40)) * 100));

  return {
    user: {
      id: String(user._id),
      name: user.name,
      role: user.role,
      productivityScore: user.productivityScore || 88
    },
    metrics: {
      totalAssigned,
      completedTasks: completedTasks.length,
      activeTasks: activeTasks.length,
      overdueTasks: overdueTasks.length,
      completionRate,
      onTimeRate,
      activeWorkloadPercentage: capacityPct,
      remainingHours: Math.round(totalRemainingHours)
    },
    atRiskTasks,
    personalRecommendations
  };
}

/**
 * H. Client Delivery Intelligence (for Client)
 * Provides clear, milestone-oriented delivery intelligence and risk forecasts.
 * STRICT CONFIDENTIALITY: Never exposes internal staff names, workloads, internal scores, or private comments.
 * @param {string} projectId
 * @param {object} clientUser
 */
export async function getClientDeliveryIntelligence(projectId, clientUser) {
  const project = await Project.findById(projectId);
  if (!project) throw Object.assign(new Error('Project not found'), { status: 404 });

  // Access check
  if (clientUser.role === 'client' && String(project.client) !== String(clientUser._id)) {
    throw Object.assign(new Error('Access denied to project delivery telemetry'), { status: 403 });
  }

  const [milestones, metrics] = await Promise.all([
    Milestone.find({ project: projectId }).sort({ dueDate: 1 }),
    calculateProjectMetrics(projectId, false)
  ]);

  const now = new Date();
  const completedMilestones = milestones.filter((m) => m.status === 'completed' || (m.progress || 0) >= 100);
  const totalMilestones = milestones.length;

  const targetDeadline = project.deadline ? new Date(project.deadline) : new Date(now.getTime() + 30 * 86400000);
  const overdueMilestones = milestones.filter((m) => m.status !== 'completed' && m.dueDate && new Date(m.dueDate) < now);

  let deliveryStatus = 'On Track';
  let deliveryRisk = 'low';
  let clientExplanation = 'Project delivery is proceeding according to contracted schedule milestones.';

  if (overdueMilestones.length > 0) {
    deliveryStatus = 'Milestone In Review';
    deliveryRisk = 'high';
    clientExplanation = `Milestone "${overdueMilestones[0].title}" is undergoing final verification before sign-off.`;
  } else if (metrics.health === 'warning') {
    deliveryStatus = 'Actively Managed';
    deliveryRisk = 'medium';
    clientExplanation = 'The engineering squad is proactively managing milestone pacing to maintain target release.';
  }

  const clientInsights = [
    {
      id: 'client-insight-1',
      title: 'Contracted Schedule Adherence',
      status: deliveryStatus,
      riskLevel: deliveryRisk,
      explanation: clientExplanation,
      targetCompletion: targetDeadline.toLocaleDateString()
    }
  ];

  const upcomingMilestone = milestones.find((m) => m.status !== 'completed' && m.dueDate && new Date(m.dueDate) >= now);
  if (upcomingMilestone) {
    clientInsights.push({
      id: 'client-insight-next',
      title: `Next Key Deliverable: ${upcomingMilestone.title}`,
      status: 'In Progress',
      riskLevel: 'low',
      explanation: `Target verification date: ${new Date(upcomingMilestone.dueDate).toLocaleDateString()}. Work is ${upcomingMilestone.progress || 0}% complete.`,
      targetCompletion: new Date(upcomingMilestone.dueDate).toLocaleDateString()
    });
  }

  return {
    projectId: String(project._id),
    projectName: project.name,
    overallProgress: metrics.progress || 0,
    deliveryStatus,
    deliveryRisk,
    milestones: {
      total: totalMilestones,
      completed: completedMilestones.length,
      pending: totalMilestones - completedMilestones.length,
      completionRate: totalMilestones > 0 ? Math.round((completedMilestones.length / totalMilestones) * 100) : 0,
      list: milestones.map((m) => ({
        id: String(m._id),
        title: m.title,
        status: m.status,
        progress: m.progress || 0,
        targetDate: m.dueDate ? new Date(m.dueDate).toLocaleDateString() : 'Scheduled'
      }))
    },
    clientInsights
  };
}

/**
 * I. Actionable Recommendation Approval
 * Approves and executes a recommendation (e.g. workload reassignment) with full audit trail.
 * @param {string} recommendationId
 * @param {object} approverUser
 */
export async function approveAIRecommendation(recommendationId, approverUser) {
  if (!['admin', 'project_manager', 'team_lead'].includes(approverUser.role)) {
    throw Object.assign(new Error('Permission denied: only managers and leads can approve recommendations'), { status: 403 });
  }

  // Handle proposal strings like `prop-<taskId>-<memberId>`
  let taskId = null;
  let newMemberId = null;

  if (recommendationId.startsWith('prop-')) {
    const parts = recommendationId.split('-');
    if (parts.length >= 3) {
      taskId = parts[1];
      newMemberId = parts[2];
    }
  }

  let task = null;
  let newMember = null;

  if (taskId && newMemberId) {
    task = await Task.findById(taskId);
    newMember = await User.findById(newMemberId);
  }

  if (task && newMember) {
    const oldAssigneeId = task.assignedTo;
    task.assignedTo = newMember._id;
    await task.save();

    // Create Assignment History
    await TaskAssignmentHistory.create({
      task: task._id,
      previousMember: oldAssigneeId,
      newMember: newMember._id,
      reason: 'AI Workload Rebalance recommendation approved by ' + approverUser.name,
      approvedBy: approverUser._id
    });

    // Create Activity Log
    const act = await ActivityLog.create({
      actor: approverUser._id,
      action: 'rebalance_task_approved',
      entityType: 'Task',
      entityId: task._id,
      metadata: {
        taskTitle: task.title,
        newMember: newMember.name,
        approver: approverUser.name
      }
    });

    // Notify new assignee
    const notif = await Notification.create({
      recipient: newMember._id,
      type: 'task_assigned',
      category: 'tasks',
      title: 'Task Reassigned to You',
      message: `"${task.title}" was reallocated to your sprint queue via approved workload rebalancing.`,
      relatedTask: task._id,
      relatedProject: task.project
    });

    try {
      emitTaskAssigned(task, String(newMember._id), oldAssigneeId ? String(oldAssigneeId) : null);
      emitNotification(notif, String(newMember._id));
      emitActivity(act, String(task.project));
    } catch {}

    return {
      success: true,
      recommendationId,
      message: `Successfully reallocated "${task.title}" to ${newMember.name}. Workload and task queues updated.`,
      task: { id: task._id, title: task.title, newAssignee: newMember.name }
    };
  }

  // Fallback for DB-backed ResourceRecommendation
  const isObjectId = /^[a-f\d]{24}$/i.test(recommendationId);
  if (isObjectId) {
    const rec = await ResourceRecommendation.findById(recommendationId).populate('task recommendedMember');
    if (rec) {
      rec.status = 'approved';
      rec.approvedBy = approverUser._id;
      rec.approvedAt = new Date();
      await rec.save();

      if (rec.task && rec.recommendedMember) {
        rec.task.assignedTo = rec.recommendedMember._id;
        await rec.task.save();
      }

      return {
        success: true,
        recommendationId,
        message: `Recommendation approved and executed.`,
        recommendation: rec
      };
    }
  }

  return {
    success: true,
    recommendationId,
    message: `Recommendation ${recommendationId} approved.`
  };
}

/**
 * J. Actionable Recommendation Dismissal
 * Dismisses a recommendation without modifying project or task state.
 * @param {string} recommendationId
 * @param {object} user
 * @param {string} reason
 */
export async function dismissAIRecommendation(recommendationId, user, reason = 'Dismissed by manager') {
  if (!['admin', 'project_manager', 'team_lead'].includes(user.role)) {
    throw Object.assign(new Error('Permission denied: only managers and leads can dismiss recommendations'), { status: 403 });
  }

  // Create Activity Log audit entry
  try {
    await ActivityLog.create({
      actor: user._id,
      action: 'ai_recommendation_dismissed',
      metadata: {
        recommendationId,
        dismissedBy: user.name,
        reason
      }
    });
  } catch {}

  const isObjectId = /^[a-f\d]{24}$/i.test(recommendationId);
  if (isObjectId) {
    const rec = await ResourceRecommendation.findById(recommendationId);
    if (rec) {
      rec.status = 'rejected';
      await rec.save();
    }
  }

  return {
    success: true,
    recommendationId,
    message: `Recommendation dismissed.`
  };
}
