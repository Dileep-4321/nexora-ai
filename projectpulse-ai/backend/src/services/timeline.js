import { Project, Task, Milestone } from '../models/index.js';
import { predictTaskDelays } from './ai-advanced.js';

/**
 * Depth-first cycle detection on a directed dependency graph
 * @param {Map<string, string[]>} graph
 * @returns {boolean} True if cycle detected
 */
export function hasCycle(graph) {
  const visited = new Set();
  const recStack = new Set();

  function dfs(node) {
    visited.add(node);
    recStack.add(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (recStack.has(neighbor)) {
        return true;
      }
    }

    recStack.delete(node);
    return false;
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      if (dfs(node)) return true;
    }
  }

  return false;
}

/**
 * Validates dependencies for a task in a project:
 * - Prevents self-dependency
 * - Prevents cross-project dependencies
 * - Detects circular dependencies
 * @param {string} taskId
 * @param {string[]} dependencyIds
 * @param {string} projectId
 * @returns {Promise<void>}
 */
export async function validateDependencies(taskId, dependencyIds, projectId) {
  if (!Array.isArray(dependencyIds) || dependencyIds.length === 0) return;

  const targetTaskIdStr = String(taskId);
  const cleanDepIds = [...new Set(dependencyIds.map(String))];

  // 1. Self dependency check
  if (cleanDepIds.includes(targetTaskIdStr)) {
    throw Object.assign(new Error('A task cannot depend on itself'), { status: 400 });
  }

  // 2. Fetch all dependency tasks to verify existence and project ownership
  const depTasks = await Task.find({ _id: { $in: cleanDepIds } }).select('_id project');
  if (depTasks.length !== cleanDepIds.length) {
    throw Object.assign(new Error('One or more referenced dependency tasks do not exist'), { status: 400 });
  }

  for (const dep of depTasks) {
    if (String(dep.project) !== String(projectId)) {
      throw Object.assign(new Error('Cross-project dependencies are strictly forbidden'), { status: 400 });
    }
  }

  // 3. Build whole project dependency graph to detect cycles
  const allProjectTasks = await Task.find({ project: projectId }).select('_id dependencies');
  const graph = new Map();

  for (const t of allProjectTasks) {
    const currentId = String(t._id);
    if (currentId === targetTaskIdStr) {
      // Use candidate dependencies
      graph.set(currentId, cleanDepIds);
    } else {
      // Use existing dependencies
      const existingDeps = (t.dependencies || []).map(String);
      graph.set(currentId, existingDeps);
    }
  }

  // Ensure target node is in graph even if newly created
  if (!graph.has(targetTaskIdStr)) {
    graph.set(targetTaskIdStr, cleanDepIds);
  }

  if (hasCycle(graph)) {
    throw Object.assign(new Error('Circular dependency detected: adding this dependency would create an invalid loop'), { status: 400 });
  }
}

/**
 * Calculates Critical Path tasks using Early Start / Late Start forward and backward pass
 * @param {Array} tasks
 * @returns {string[]} Array of task IDs on the critical path
 */
export function calculateCriticalPath(tasks) {
  if (!tasks || tasks.length === 0) return [];

  const taskMap = new Map();
  const successors = new Map();

  for (const t of tasks) {
    taskMap.set(t._id, {
      id: t._id,
      duration: Math.max(1, Number(t.durationDays) || 1),
      dependencies: (t.dependencies || []).map((d) => String(d._id || d)),
      es: 0,
      ef: 0,
      ls: Infinity,
      lf: Infinity,
      slack: 0
    });
    successors.set(t._id, []);
  }

  // Build successors map
  for (const t of tasks) {
    const deps = (t.dependencies || []).map((d) => String(d._id || d));
    for (const depId of deps) {
      if (successors.has(depId)) {
        successors.get(depId).push(t._id);
      }
    }
  }

  // Forward pass: compute ES and EF
  let changed = true;
  let iterations = 0;
  const maxIterations = tasks.length * 2;

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    for (const node of taskMap.values()) {
      let maxDepEf = 0;
      for (const depId of node.dependencies) {
        const depNode = taskMap.get(depId);
        if (depNode && depNode.ef > maxDepEf) {
          maxDepEf = depNode.ef;
        }
      }

      const newEs = maxDepEf;
      const newEf = newEs + node.duration;

      if (newEs !== node.es || newEf !== node.ef) {
        node.es = newEs;
        node.ef = newEf;
        changed = true;
      }
    }
  }

  // Project finish time
  let projectFinish = 0;
  for (const node of taskMap.values()) {
    if (node.ef > projectFinish) projectFinish = node.ef;
  }

  // Backward pass: compute LF, LS, and Slack
  for (const node of taskMap.values()) {
    const succs = successors.get(node.id) || [];
    if (succs.length === 0) {
      node.lf = projectFinish;
      node.ls = node.lf - node.duration;
    }
  }

  changed = true;
  iterations = 0;

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    for (const node of taskMap.values()) {
      const succs = successors.get(node.id) || [];
      if (succs.length > 0) {
        let minSuccLs = Infinity;
        for (const succId of succs) {
          const succNode = taskMap.get(succId);
          if (succNode && succNode.ls < minSuccLs) {
            minSuccLs = succNode.ls;
          }
        }
        const newLf = minSuccLs === Infinity ? projectFinish : minSuccLs;
        const newLs = newLf - node.duration;

        if (newLf !== node.lf || newLs !== node.ls) {
          node.lf = newLf;
          node.ls = newLs;
          changed = true;
        }
      }
    }
  }

  const criticalPathIds = [];
  for (const [id, node] of taskMap.entries()) {
    node.slack = Math.max(0, node.ls - node.es);
    if (node.slack === 0) {
      criticalPathIds.push(id);
    }
  }

  return criticalPathIds;
}

/**
 * Retrieves comprehensive project timeline with tasks, fallback dates, milestones, and critical path
 * @param {string} projectId
 * @param {string} userRole
 * @returns {Promise<object>} Complete project timeline data
 */
export async function getProjectTimeline(projectId, userRole = 'team_member') {
  const [project, tasks, milestones, delays] = await Promise.all([
    Project.findById(projectId).populate('projectManager client teamLead', 'name email role'),
    Task.find({ project: projectId })
      .populate('assignedTo', 'name email role availabilityStatus productivityScore')
      .populate('dependencies', '_id title status dueDate progress')
      .sort({ dueDate: 1 }),
    Milestone.find({ project: projectId }).sort({ dueDate: 1 }),
    predictTaskDelays(projectId)
  ]);

  if (!project) throw Object.assign(new Error('Project not found'), { status: 404 });

  const now = new Date();
  const delayMap = new Map(delays.map((d) => [d.taskId, d]));

  const normalizedTasks = tasks.map((task) => {
    const delayInfo = delayMap.get(String(task._id));
    const dueDate = task.dueDate ? new Date(task.dueDate) : new Date(now.getTime() + 7 * 86400000);

    let startDate = task.startDate ? new Date(task.startDate) : null;
    let isInferredStartDate = false;

    if (!startDate) {
      isInferredStartDate = true;
      const daysNeeded = Math.max(1, Math.ceil((task.estimatedHours || 8) / 8));
      startDate = task.createdAt && task.createdAt < dueDate
        ? new Date(task.createdAt)
        : new Date(dueDate.getTime() - daysNeeded * 86400000);
    }

    if (startDate >= dueDate) {
      startDate = new Date(dueDate.getTime() - 86400000);
    }

    const durationDays = Math.max(1, Math.round((dueDate.getTime() - startDate.getTime()) / 86400000));
    const isOverdue = task.status !== 'completed' && dueDate < now;

    // Check if any prerequisite is blocked or incomplete
    const blockingDeps = (task.dependencies || []).filter(
      (d) => d.status !== 'completed' || d.status === 'blocked'
    );
    const hasUnresolvedDependencies = blockingDeps.length > 0;

    const isClient = userRole === 'client';

    return {
      _id: String(task._id),
      title: task.title,
      description: task.description || '',
      status: task.status,
      priority: task.priority,
      progress: Number(task.progress) || 0,
      startDate: startDate.toISOString(),
      dueDate: dueDate.toISOString(),
      durationDays,
      estimatedHours: task.estimatedHours || 8,
      isInferredStartDate,
      isOverdue,
      hasUnresolvedDependencies,
      dependencies: (task.dependencies || []).map((d) => ({
        _id: String(d._id),
        title: d.title,
        status: d.status,
        dueDate: d.dueDate ? new Date(d.dueDate).toISOString() : null,
        progress: d.progress || 0
      })),
      assignedTo: (isClient || !task.assignedTo) ? null : {
        _id: String(task.assignedTo._id),
        name: task.assignedTo.name,
        role: task.assignedTo.role,
        availability: task.assignedTo.availabilityStatus
      },
      riskLevel: delayInfo ? delayInfo.riskLevel : task.riskLevel || 'low',
      delayDays: isClient ? 0 : (delayInfo ? delayInfo.delayDays : 0),
      predictedCompletionDate: delayInfo ? delayInfo.predictedCompletionDate : dueDate.toISOString(),
      suggestedAction: isClient
        ? (task.status === 'completed' ? 'Milestone deliverable completed.' : 'On track for scheduled delivery.')
        : (delayInfo ? delayInfo.suggestedAction : null),
      blockers: isClient ? [] : (task.blockers || [])
    };
  });

  const criticalPathIds = calculateCriticalPath(normalizedTasks);
  for (const t of normalizedTasks) {
    t.isCritical = criticalPathIds.includes(t._id);
  }

  const normalizedMilestones = milestones.map((m) => {
    const due = new Date(m.dueDate);
    const isOverdue = m.status !== 'completed' && due < now;
    const isUpcoming = m.status !== 'completed' && !isOverdue && (due.getTime() - now.getTime() <= 7 * 86400000);

    return {
      _id: String(m._id),
      title: m.title,
      description: m.description || '',
      dueDate: due.toISOString(),
      status: m.status,
      progress: m.progress || 0,
      isOverdue,
      isUpcoming
    };
  });

  return {
    project: {
      _id: String(project._id),
      name: project.name,
      description: project.description,
      status: project.status,
      priority: project.priority,
      startDate: project.startDate ? new Date(project.startDate).toISOString() : null,
      deadline: project.deadline ? new Date(project.deadline).toISOString() : null,
      progress: project.progress || 0,
      health: project.health,
      riskLevel: project.riskLevel
    },
    tasks: normalizedTasks,
    milestones: normalizedMilestones,
    criticalPathTaskIds: criticalPathIds,
    hasDependencies: normalizedTasks.some((t) => t.dependencies.length > 0)
  };
}

/**
 * Updates task scheduling and dependencies with strict validation
 * @param {string} taskId
 * @param {object} updates
 * @param {string} userId
 * @returns {Promise<object>} Updated task
 */
export async function updateTaskSchedule(taskId, updates) {
  const task = await Task.findById(taskId);
  if (!task) throw Object.assign(new Error('Task not found'), { status: 404 });

  const { startDate, dueDate, dependencies, estimatedHours } = updates;

  let newStart = task.startDate ? new Date(task.startDate) : null;
  let newDue = task.dueDate ? new Date(task.dueDate) : null;

  if (startDate) {
    newStart = new Date(startDate);
    if (Number.isNaN(newStart.getTime())) {
      throw Object.assign(new Error('Invalid startDate format'), { status: 400 });
    }
  }

  if (dueDate) {
    newDue = new Date(dueDate);
    if (Number.isNaN(newDue.getTime())) {
      throw Object.assign(new Error('Invalid dueDate format'), { status: 400 });
    }
  }

  if (newStart && newDue && newDue < newStart) {
    throw Object.assign(new Error('Due date cannot precede start date'), { status: 400 });
  }

  if (dependencies !== undefined) {
    await validateDependencies(task._id, dependencies, task.project);
    task.dependencies = dependencies;
  }

  if (startDate) task.startDate = newStart;
  if (dueDate) task.dueDate = newDue;
  if (estimatedHours !== undefined && estimatedHours >= 0) task.estimatedHours = Number(estimatedHours);

  await task.save();
  return task;
}
