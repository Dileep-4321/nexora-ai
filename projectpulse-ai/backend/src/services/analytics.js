import { Project, Task, Milestone } from '../models/index.js';
import { calculateProjectMetrics, workloadFor } from './metrics.js';
import { predictTaskDelays, detectProjectBottlenecks, calculateWorkloadRebalance, predictProjectDelay } from './ai-advanced.js';

const memberId = (value) => value?._id || value;

/**
 * Access check helper adhering to NEXORA's 5-role RBAC
 */
export function canAccessProject(user, project) {
  if (!user || !project) return false;
  if (user.role === 'admin') return true;

  const accessibleMembers = [
    project.owner,
    project.projectManager,
    project.teamLead,
    project.client,
    ...(project.teamMembers || [])
  ].filter(Boolean).map(memberId).map(String);

  return accessibleMembers.includes(String(user._id));
}

/**
 * Advanced Project Analytics Service
 * Computes deep project analytics, planned vs actual progress, milestone completion trends,
 * delayed tasks analysis, and team performance metrics.
 * Strictly enforces client confidentiality.
 */
export async function getProjectAdvancedAnalytics({ projectId, startDate, endDate, user }) {
  const project = await Project.findById(projectId)
    .populate('teamMembers', 'name email role availabilityStatus workloadCapacity productivityScore avatar')
    .populate('projectManager', 'name email role')
    .populate('client', 'name email role');

  if (!project) {
    throw Object.assign(new Error('Project not found'), { status: 404 });
  }

  if (!canAccessProject(user, project)) {
    throw Object.assign(new Error('Project access denied'), { status: 403 });
  }

  const isClient = user.role === 'client';
  const now = new Date();

  // Date range validation
  let startFilterDate = null;
  let endFilterDate = null;

  if (startDate) {
    startFilterDate = new Date(startDate);
    if (isNaN(startFilterDate.getTime())) {
      throw Object.assign(new Error('Invalid startDate parameter'), { status: 400 });
    }
  }

  if (endDate) {
    endFilterDate = new Date(endDate);
    if (isNaN(endFilterDate.getTime())) {
      throw Object.assign(new Error('Invalid endDate parameter'), { status: 400 });
    }
  }

  if (startFilterDate && endFilterDate && startFilterDate > endFilterDate) {
    throw Object.assign(new Error('startDate cannot be after endDate'), { status: 400 });
  }

  // Build task query with optional date range on dueDate
  const taskQuery = { project: project._id };
  if (startFilterDate || endFilterDate) {
    taskQuery.dueDate = {};
    if (startFilterDate) taskQuery.dueDate.$gte = startFilterDate;
    if (endFilterDate) taskQuery.dueDate.$lte = endFilterDate;
  }

  // Build milestone query
  const milestoneQuery = { project: project._id };
  if (startFilterDate || endFilterDate) {
    milestoneQuery.dueDate = {};
    if (startFilterDate) milestoneQuery.dueDate.$gte = startFilterDate;
    if (endFilterDate) milestoneQuery.dueDate.$lte = endFilterDate;
  }

  const [tasks, milestones, projectMetrics] = await Promise.all([
    Task.find(taskQuery)
      .populate('assignedTo', 'name email role availabilityStatus productivityScore avatar')
      .sort({ dueDate: 1 }),
    Milestone.find(milestoneQuery).sort({ dueDate: 1 }),
    calculateProjectMetrics(project._id, false)
  ]);

  // Overall completion & task counts
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const activeTasks = tasks.filter((t) => t.status !== 'completed');
  const overdueTasks = activeTasks.filter((t) => t.dueDate && new Date(t.dueDate) < now);

  const completionPercentage = totalTasks > 0 ? Math.round((completedTasks.length / totalTasks) * 100) : 0;

  // Task status distribution
  const statusDistribution = {
    todo: tasks.filter((t) => t.status === 'todo').length,
    inProgress: tasks.filter((t) => t.status === 'in-progress').length,
    completed: completedTasks.length,
    blocked: tasks.filter((t) => t.status === 'blocked').length
  };

  // Priority distribution
  const priorityDistribution = {
    critical: tasks.filter((t) => t.priority === 'critical').length,
    high: tasks.filter((t) => t.priority === 'high').length,
    medium: tasks.filter((t) => t.priority === 'medium').length,
    low: tasks.filter((t) => t.priority === 'low').length
  };

  // Planned vs Actual Progress Calculation
  const projStart = project.startDate ? new Date(project.startDate) : new Date(now.getTime() - 30 * 86400000);
  const projDeadline = project.deadline ? new Date(project.deadline) : new Date(now.getTime() + 30 * 86400000);
  const totalDurationMs = Math.max(86400000, projDeadline.getTime() - projStart.getTime());
  const elapsedMs = Math.max(0, now.getTime() - projStart.getTime());
  const plannedProgress = Math.min(100, Math.max(0, Math.round((elapsedMs / totalDurationMs) * 100)));

  // Weighted actual progress calculation
  const totalEstimatedHours = tasks.reduce((sum, t) => sum + (Number(t.estimatedHours) || 8), 0);
  const weightedProgressSum = tasks.reduce((sum, t) => sum + ((Number(t.progress) || 0) * (Number(t.estimatedHours) || 8)), 0);
  const actualProgress = totalEstimatedHours > 0
    ? Math.min(100, Math.max(0, Math.round(weightedProgressSum / totalEstimatedHours)))
    : completionPercentage;
  const progressVariance = actualProgress - plannedProgress;

  // Milestone trends
  const totalMilestones = milestones.length;
  const completedMilestones = milestones.filter((m) => m.status === 'completed' || (m.progress || 0) >= 100);
  const milestoneCompletionRate = totalMilestones > 0 ? Math.round((completedMilestones.length / totalMilestones) * 100) : 0;
  const milestoneTrends = milestones.map((m) => ({
    _id: m._id,
    title: m.title,
    description: m.description,
    dueDate: m.dueDate,
    status: m.status,
    progress: m.progress || (m.status === 'completed' ? 100 : 0),
    isOverdue: m.status !== 'completed' && m.dueDate && new Date(m.dueDate) < now
  }));

  // Delayed task analysis
  const delayedTasks = overdueTasks.map((t) => {
    const dueDate = new Date(t.dueDate);
    const daysOverdue = Math.max(1, Math.ceil((now.getTime() - dueDate.getTime()) / 86400000));
    return {
      _id: t._id,
      title: t.title,
      priority: t.priority,
      status: t.status,
      progress: t.progress || 0,
      dueDate: t.dueDate,
      daysOverdue,
      blockers: t.blockers || [],
      assignee: isClient ? null : (t.assignedTo ? { name: t.assignedTo.name, email: t.assignedTo.email } : null)
    };
  });

  // Project Health Indicators
  const healthIndicators = {
    health: projectMetrics.health || 'good',
    riskScore: isClient ? undefined : projectMetrics.riskScore,
    riskLevel: projectMetrics.riskLevel || 'medium',
    factors: isClient ? ['Delivery risks are continuously monitored by the project team.'] : (projectMetrics.factors || []),
    structuredRisks: isClient ? [] : (projectMetrics.structuredRisks || [])
  };

  // Team Performance Analytics (CONFIDENTIAL: Hidden from Client role)
  let teamPerformance = null;
  if (!isClient) {
    const memberStatsMap = new Map();

    // Seed with project team members
    for (const member of (project.teamMembers || [])) {
      memberStatsMap.set(String(member._id), {
        member: {
          _id: member._id,
          name: member.name,
          email: member.email,
          role: member.role,
          avatar: member.avatar
        },
        assignedTasks: 0,
        completedTasks: 0,
        activeTasks: 0,
        overdueTasks: 0,
        totalEstimatedHours: 0,
        totalActualHours: 0,
        onTimeCompletedCount: 0,
        completionRate: 0,
        onTimeCompletionRate: 0,
        workloadUtilization: 0,
        workloadClassification: 'balanced',
        productivityScore: 0
      });
    }

    // Accumulate task statistics per assignee
    for (const task of tasks) {
      if (!task.assignedTo) continue;
      const mId = String(task.assignedTo._id || task.assignedTo);
      let entry = memberStatsMap.get(mId);

      if (!entry) {
        entry = {
          member: {
            _id: mId,
            name: task.assignedTo.name || 'Team Member',
            email: task.assignedTo.email || '',
            role: task.assignedTo.role || 'team_member',
            avatar: task.assignedTo.avatar
          },
          assignedTasks: 0,
          completedTasks: 0,
          activeTasks: 0,
          overdueTasks: 0,
          totalEstimatedHours: 0,
          totalActualHours: 0,
          onTimeCompletedCount: 0,
          completionRate: 0,
          onTimeCompletionRate: 0,
          workloadUtilization: 0,
          workloadClassification: 'balanced',
          productivityScore: 0
        };
        memberStatsMap.set(mId, entry);
      }

      entry.assignedTasks += 1;
      const est = Number(task.estimatedHours) || 8;
      const act = Number(task.actualHours) || 0;
      entry.totalEstimatedHours += est;
      entry.totalActualHours += act;

      if (task.status === 'completed') {
        entry.completedTasks += 1;
        const completedDate = task.completedAt ? new Date(task.completedAt) : now;
        const taskDueDate = task.dueDate ? new Date(task.dueDate) : null;
        if (!taskDueDate || completedDate <= taskDueDate) {
          entry.onTimeCompletedCount += 1;
        }
      } else {
        entry.activeTasks += 1;
        if (task.dueDate && new Date(task.dueDate) < now) {
          entry.overdueTasks += 1;
        }
      }
    }

    // Compute metrics and productivity scores
    const memberAnalytics = await Promise.all(
      Array.from(memberStatsMap.values()).map(async (stat) => {
        const assigned = stat.assignedTasks;
        const completed = stat.completedTasks;
        const overdue = stat.overdueTasks;
        const onTime = stat.onTimeCompletedCount;

        stat.completionRate = assigned > 0 ? Math.round((completed / assigned) * 100) : 0;
        stat.onTimeCompletionRate = completed > 0 ? Math.round((onTime / completed) * 100) : (assigned > 0 ? 100 : 0);

        try {
          const wl = await workloadFor(project._id, stat.member._id);
          stat.workloadUtilization = wl.percentage;
          stat.workloadClassification = wl.classification;
        } catch {
          stat.workloadUtilization = 0;
          stat.workloadClassification = 'low';
        }

        // Productivity calculation formula:
        // Productivity = clamp(0.40 * completionRate + 0.35 * deadlineAdherence + 0.25 * efficiency)
        const deadlineAdherence = assigned > 0 ? ((assigned - overdue) / assigned) * 100 : 100;
        const efficiency = stat.totalEstimatedHours > 0
          ? Math.min(100, Math.round((stat.totalEstimatedHours / Math.max(stat.totalActualHours, stat.totalEstimatedHours)) * 100))
          : 85;

        stat.productivityScore = Math.max(0, Math.min(100, Math.round(
          stat.completionRate * 0.40 + deadlineAdherence * 0.35 + efficiency * 0.25
        )));

        return stat;
      })
    );

    teamPerformance = memberAnalytics;
  }

  // Integrated AI Analytical Insights (Advisory only)
  let predictiveDelays = [];
  let bottlenecks = [];
  let rebalanceRecommendations = [];
  let projectDelay = null;

  try {
    const rawProjectDelay = await predictProjectDelay(project._id);
    projectDelay = isClient
      ? {
          isDelayed: rawProjectDelay.isDelayed,
          targetDeadline: rawProjectDelay.targetDeadline,
          estimatedCompletionDate: rawProjectDelay.estimatedCompletionDate,
          scheduleVarianceDays: rawProjectDelay.scheduleVarianceDays,
          riskLevel: rawProjectDelay.riskLevel,
          contributingFactors: rawProjectDelay.contributingFactors.map(() => 'Milestone delivery pacing is continuously evaluated.')
        }
      : rawProjectDelay;
  } catch {}

  try {
    const rawDelays = await predictTaskDelays(project._id);
    predictiveDelays = isClient
      ? rawDelays.map((t) => ({ ...t, assignee: null })).slice(0, 5)
      : rawDelays.slice(0, 5);
  } catch {}

  try {
    const rawBottlenecks = await detectProjectBottlenecks(project._id);
    bottlenecks = (rawBottlenecks?.bottlenecks || [])
      .filter((b) => !isClient || b.type !== 'resource_saturation')
      .slice(0, 5);
  } catch {}

  if (['admin', 'project_manager'].includes(user.role)) {
    try {
      const rawRebalance = await calculateWorkloadRebalance(project._id);
      rebalanceRecommendations = (rawRebalance?.proposals || []).slice(0, 3);
    } catch {}
  }

  const aiInsights = {
    advisoryNotice: 'AI recommendations and predictive insights are advisory-only and require project manager approval before changes are executed.',
    projectDelay,
    predictiveDelays,
    bottlenecks,
    rebalanceRecommendations
  };

  return {
    projectId: project._id,
    projectName: project.name,
    projectCode: project.code,
    description: project.description,
    startDate: project.startDate,
    deadline: project.deadline,
    dateRange: {
      startDate: startFilterDate ? startFilterDate.toISOString() : null,
      endDate: endFilterDate ? endFilterDate.toISOString() : null
    },
    overview: {
      totalTasks,
      completedTasks: completedTasks.length,
      activeTasks: activeTasks.length,
      overdueTasks: overdueTasks.length,
      completionPercentage,
      plannedProgress,
      actualProgress,
      progressVariance,
      totalMilestones,
      completedMilestones: completedMilestones.length,
      milestoneCompletionRate
    },
    statusDistribution,
    priorityDistribution,
    milestones: milestoneTrends,
    delayedTasks,
    healthIndicators,
    teamPerformance,
    aiInsights
  };
}

/**
 * Multi-Project Workspace Comparison Analytics
 * Compares delivery performance, planned vs actual progress, and workload across all accessible projects.
 */
export async function getWorkspaceComparisonAnalytics({ user, startDate, endDate }) {
  const allProjects = await Project.find()
    .populate('teamMembers', 'name email role')
    .populate('projectManager', 'name email role');

  const accessibleProjects = allProjects.filter((p) => canAccessProject(user, p));
  const isClient = user.role === 'client';
  const now = new Date();

  let startFilterDate = null;
  let endFilterDate = null;

  if (startDate) {
    startFilterDate = new Date(startDate);
    if (isNaN(startFilterDate.getTime())) {
      throw Object.assign(new Error('Invalid startDate parameter'), { status: 400 });
    }
  }

  if (endDate) {
    endFilterDate = new Date(endDate);
    if (isNaN(endFilterDate.getTime())) {
      throw Object.assign(new Error('Invalid endDate parameter'), { status: 400 });
    }
  }

  if (startFilterDate && endFilterDate && startFilterDate > endFilterDate) {
    throw Object.assign(new Error('startDate cannot be after endDate'), { status: 400 });
  }

  const projectAnalytics = await Promise.all(
    accessibleProjects.map(async (project) => {
      const taskQuery = { project: project._id };
      if (startFilterDate || endFilterDate) {
        taskQuery.dueDate = {};
        if (startFilterDate) taskQuery.dueDate.$gte = startFilterDate;
        if (endFilterDate) taskQuery.dueDate.$lte = endFilterDate;
      }

      const [tasks, milestones, metrics] = await Promise.all([
        Task.find(taskQuery),
        Milestone.find({ project: project._id }),
        calculateProjectMetrics(project._id, false)
      ]);

      const total = tasks.length;
      const completed = tasks.filter((t) => t.status === 'completed').length;
      const overdue = tasks.filter((t) => t.status !== 'completed' && t.dueDate && new Date(t.dueDate) < now).length;
      const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

      // Planned progress
      const pStart = project.startDate ? new Date(project.startDate) : new Date(now.getTime() - 30 * 86400000);
      const pDead = project.deadline ? new Date(project.deadline) : new Date(now.getTime() + 30 * 86400000);
      const dur = Math.max(86400000, pDead.getTime() - pStart.getTime());
      const el = Math.max(0, now.getTime() - pStart.getTime());
      const plannedProgress = Math.min(100, Math.max(0, Math.round((el / dur) * 100)));

      return {
        _id: project._id,
        name: project.name,
        code: project.code,
        status: project.status,
        health: metrics.health || 'good',
        riskLevel: metrics.riskLevel || 'medium',
        riskScore: isClient ? undefined : metrics.riskScore,
        progress: metrics.progress || 0,
        plannedProgress,
        progressVariance: (metrics.progress || 0) - plannedProgress,
        totalTasks: total,
        completedTasks: completed,
        overdueTasks: overdue,
        completionRate,
        totalMilestones: milestones.length,
        completedMilestones: milestones.filter((m) => m.status === 'completed' || (m.progress || 0) >= 100).length
      };
    })
  );

  const totalProjects = projectAnalytics.length;
  const totalTasks = projectAnalytics.reduce((sum, p) => sum + p.totalTasks, 0);
  const totalCompleted = projectAnalytics.reduce((sum, p) => sum + p.completedTasks, 0);
  const totalOverdue = projectAnalytics.reduce((sum, p) => sum + p.overdueTasks, 0);
  const averageProgress = totalProjects > 0
    ? Math.round(projectAnalytics.reduce((sum, p) => sum + p.progress, 0) / totalProjects)
    : 0;
  const overallCompletionRate = totalTasks > 0
    ? Math.round((totalCompleted / totalTasks) * 100)
    : 0;

  return {
    totals: {
      projects: totalProjects,
      tasks: totalTasks,
      completed: totalCompleted,
      overdue: totalOverdue,
      averageProgress,
      overallCompletionRate
    },
    projects: projectAnalytics
  };
}
