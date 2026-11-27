const titleCase = (value = "") =>
  String(value)
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const idOf = (value) =>
  String(value?._id || value?.id || value || "");

export const formatDate = (value) => {
  if (!value) return "No date";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "No date"
    : new Intl.DateTimeFormat("en", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      }).format(date);
};

export const safePercent = (value) =>
  Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

function normalizeMember(member = {}, workload = {}) {
  const id = idOf(member);
  const availabilityTone = member.availabilityStatus || member.availability || "available";
  const name = member.name || "Unassigned";

  return {
    id,
    name,
    email: member.email || "",
    employeeId: member.employeeId || "",
    phone: member.phone || "",
    experienceYears: Number(member.experienceYears) >= 0 ? Number(member.experienceYears) : 1,
    deactivatedAt: member.deactivatedAt || null,
    deactivatedBy: member.deactivatedBy || null,
    deactivationReason: member.deactivationReason || "",
    role: titleCase(member.role || "team member"),
    rawRole: member.role || "team_member",
    preferences: member.preferences || {},
    department: member.department || "",
    jobTitle: member.jobTitle || "",
    workloadCapacity: Number(member.workloadCapacity) || 40,
    isActive: member.isActive !== false,
    assignedProjects: Array.isArray(member.assignedProjects) ? member.assignedProjects : [],
    skills: (() => {
      const raw = Array.isArray(member.skills)
        ? member.skills.map((s) => (typeof s === "string" ? s : s?.name || s?.skillName || String(s || ""))).filter(Boolean)
        : [];
      if (raw.length > 0) return raw;
      const title = String(member.jobTitle || "");
      if (title.includes("Frontend")) return ["React.js", "TypeScript", "Next.js", "Tailwind CSS"];
      if (title.includes("Backend")) return ["Node.js", "Express", "MongoDB", "REST APIs"];
      if (title.includes("Lead") || member.role === "team_lead") return ["System Architecture", "Code Review", "Node.js", "TypeScript", "Docker"];
      if (title.includes("Project") || member.role === "project_manager") return ["Agile / Scrum", "Risk Governance", "Sprint Planning", "Jira"];
      return ["React.js", "Node.js", "TypeScript", "MongoDB", "Docker"];
    })(),
    availability: titleCase(availabilityTone),
    availabilityTone,
    workload: safePercent(workload.percentage ?? member.workload),
    productivity: safePercent(member.productivityScore ?? member.productivity),
    initials: name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "NX"
  };
}

function projectWorkloads(projects) {
  const totals = new Map();

  projects.forEach(({ metrics = {} }) => {
    (metrics.workload || []).forEach((entry) => {
      const id = idOf(entry.member || entry.user || entry);
      const current = totals.get(id) || { percentage: 0, count: 0 };
      totals.set(id, {
        percentage: Math.max(current.percentage, safePercent(entry.percentage)),
        count: current.count + 1
      });
    });
  });

  return totals;
}

function normalizeProject(item = {}) {
  const project = item.project || item;
  const metrics = item.metrics || project.metrics || {};
  const id = idOf(project);
  const statusTone = project.status || "planning";
  const priorityTone = project.priority || "medium";
  const riskTone = metrics.riskLevel || project.riskLevel || "low";

  return {
    id,
    code: project.code || project.name?.slice(0, 3)?.toUpperCase() || "NXR",
    name: project.name || "Untitled project",
    description: project.description || "No project description provided.",
    status: titleCase(statusTone),
    statusTone,
    priority: titleCase(priorityTone),
    priorityTone,
    risk: titleCase(riskTone),
    riskTone,
    health: titleCase(metrics.health || project.health || "good"),
    healthScore: Number(metrics.healthScore ?? project.healthScore) || (metrics.health === "warning" ? 72 : 88),
    progress: safePercent(metrics.progress ?? project.progress),
    expectedProgress: safePercent(metrics.expectedProgress ?? project.expectedProgress),
    deadline: formatDate(project.deadline),
    deadlineAt: project.deadline || null,
    team: (project.teamMembers || []).map(idOf).filter(Boolean),
    metrics
  };
}

function normalizeTask(task = {}) {
  const project = task.project || {};
  const assignee = task.assignedTo || {};
  const statusTone = task.status || "todo";
  const priorityTone = task.priority || "medium";
  const riskTone = task.riskLevel || "low";

  return {
    id: idOf(task),
    title: task.title || "Untitled task",
    description: task.description || "",
    projectId: idOf(project) || idOf(task.project),
    projectName: project.name || "Project",
    assigneeId: idOf(assignee) || idOf(task.assignedTo),
    assignee: assignee.name || "Unassigned",
    priority: titleCase(priorityTone),
    priorityTone,
    status: titleCase(statusTone),
    statusTone,
    progress: statusTone === "completed" ? 100 : safePercent(task.progress),
    due: formatDate(task.dueDate),
    dueAt: task.dueDate || null,
    risk: titleCase(riskTone),
    riskTone,
    blockers: Array.isArray(task.blockers) ? task.blockers : [],
    estimatedHours: Number(task.estimatedHours) || 0,
    requiredSkills: Array.isArray(task.requiredSkills)
      ? task.requiredSkills.map((s) => (typeof s === "string" ? s : s?.name || String(s || ""))).filter(Boolean)
      : []
  };
}

export function normalizeWorkspace(dashboard = {}, user = {}, calendar = []) {
  const rawProjects = Array.isArray(dashboard.projects) ? dashboard.projects : [];
  const workloads = projectWorkloads(rawProjects);
  const members = (dashboard.members || []).map((member) =>
    normalizeMember(member, workloads.get(idOf(member)))
  );
  const memberById = new Map(members.map((member) => [member.id, member]));
  const projects = rawProjects.map(normalizeProject);
  const tasks = (dashboard.tasks || []).map(normalizeTask);

  const recommendations = (dashboard.recommendations || []).map((item) => ({
    id: idOf(item),
    status: item.status || "pending",
    task: normalizeTask(item.task || {}),
    unavailable: normalizeMember(item.unavailableMember || {}),
    candidate: normalizeMember(item.recommendedMember || {}),
    match: safePercent(item.matchScore),
    factors: Array.isArray(item.factors)
      ? item.factors.map((f) => (typeof f === "string" ? f : f?.message || f?.name || String(f || ""))).filter(Boolean)
      : [],
    reason: item.reason || "No explanation was returned for this recommendation."
  }));

  const notifications = (dashboard.notifications || []).map((item) => ({
    id: idOf(item),
    title: item.title || "NEXORA update",
    body: item.message || "No additional detail is available.",
    time: formatDate(item.createdAt),
    unread: !item.isRead,
    kind: item.type || "system",
    target: item.relatedRecommendation ? "insights" : item.relatedTask ? "tasks" : "projects"
  }));

  const profile = normalizeMember(user);
  const normalizedTasks = tasks.map((task) => ({
    ...task,
    projectName: task.projectName === "Project"
      ? projects.find((project) => project.id === task.projectId)?.name || "Project"
      : task.projectName,
    assignee: task.assignee === "Unassigned"
      ? memberById.get(task.assigneeId)?.name || "Unassigned"
      : task.assignee
  }));

  const projectsWithProgress = projects.map((p) => {
    if (p.progress > 0) return p;
    const pTasks = normalizedTasks.filter((t) => t.projectId === p.id || t.projectName === p.name);
    if (pTasks.length > 0) {
      const completedCount = pTasks.filter((t) => t.statusTone === "completed").length;
      return { ...p, progress: Math.round((completedCount / pTasks.length) * 100) };
    }
    return p;
  });

  return {
    lastUpdated: new Date().toISOString(),
    user: profile,
    metrics: {
      projects: Number(dashboard.totals?.projects) || projectsWithProgress.length,
      tasks: Number(dashboard.totals?.tasks) || normalizedTasks.length,
      completed: Number(dashboard.totals?.completed) || normalizedTasks.filter((task) => task.statusTone === "completed").length,
      overdue: Number(dashboard.totals?.overdue) || 0,
      progress: safePercent(dashboard.totals?.progress) || (normalizedTasks.length ? Math.round((normalizedTasks.filter((task) => task.statusTone === "completed").length / normalizedTasks.length) * 100) : 0),
      highRisk: Number(dashboard.totals?.highRisk) || 0
    },
    projects: projectsWithProgress,
    tasks: normalizedTasks,
    members,
    recommendations,
    notifications,
    activities: Array.isArray(dashboard.activity) ? dashboard.activity : [],
    calendar: Array.isArray(calendar)
      ? calendar.map((event) => ({
          id: idOf(event),
          title: event.title || "Untitled event",
          date: event.date || null,
          type: event.kind || event.type || "event",
          status: titleCase(event.status || "scheduled"),
          priority: event.priority || "low",
          project: event.project || null,
          projectName: event.project?.name || "Project"
        }))
      : []
  };
}
