// NEXORA intelligence helpers.
// All values here are DERIVED from real, already-normalized workspace data —
// never hard-coded, never fabricated.

export function timeAgo(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function daysUntil(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
}

export function memberTaskStats(data) {
  const empty = () => ({ assigned: 0, active: 0, completed: 0, overdue: 0 });
  const stats = new Map(data.members.map((member) => [member.id, empty()]));
  data.tasks.forEach((task) => {
    if (!task.assigneeId) return;
    const row = stats.get(task.assigneeId);
    if (!row) return;
    row.assigned += 1;
    if (task.statusTone === "completed") {
      row.completed += 1;
    } else {
      row.active += 1;
      if (task.dueAt && new Date(task.dueAt) < new Date()) row.overdue += 1;
    }
  });
  return stats;
}

export function canTakeWork(member) {
  return member.workload < 75 && ["available", "busy"].includes(member.availabilityTone);
}

export function workloadLabel(percentage) {
  if (percentage >= 100) return "Overloaded";
  if (percentage >= 75) return "High";
  if (percentage >= 35) return "Normal";
  return "Available";
}

export function taskStatusDistribution(data) {
  return [
    ["todo", "To do"],
    ["in-progress", "In progress"],
    ["blocked", "Blocked"],
    ["completed", "Completed"]
  ]
    .map(([key, label]) => ({ key, label, value: data.tasks.filter((t) => t.statusTone === key).length }))
    .filter((row) => row.value > 0);
}

export function taskPriorityDistribution(data) {
  return ["low", "medium", "high", "critical"]
    .map((key) => ({ key, label: key, value: data.tasks.filter((t) => t.priorityTone === key).length }))
    .filter((row) => row.value > 0);
}

export function riskDistribution(data) {
  return ["low", "medium", "high", "critical"].map((key) => ({
    key,
    value: data.projects.filter((p) => p.riskTone === key).length
  }));
}

export function unassignedCriticalTasks(data) {
  return data.tasks.filter(
    (t) => t.statusTone !== "completed" && !t.assigneeId && ["high", "critical"].includes(t.priorityTone)
  );
}

// Build a warning list from real workspace data. Each warning explains
// WHAT is wrong, WHY it matters, and WHAT should be done.
export function deriveWarnings(data) {
  const warnings = [];
  const now = new Date();
  const add = (category, severity, title, detail, action, target = "tasks", affectedItem = "") =>
    warnings.push({
      id: warnings.length + 1,
      category,
      severity,
      title,
      detail,
      action,
      target,
      affectedItem
    });

  // 1. overdue_tasks
  const overdue = data.tasks.filter((t) => t.statusTone !== "completed" && t.dueAt && new Date(t.dueAt) < now);
  if (overdue.length) {
    add(
      "overdue_tasks",
      "critical",
      `${overdue.length} overdue task${overdue.length > 1 ? "s" : ""}`,
      `${overdue[0].title} (${overdue[0].projectName}) was due ${timeAgo(overdue[0].dueAt)}.`,
      "Reassign, extend the deadline, or unblock the affected work.",
      "tasks",
      overdue[0].title
    );
  }

  // 2. high_priority_incomplete
  const laggingCritical = data.tasks.filter(
    (t) => t.statusTone !== "completed" && ["high", "critical"].includes(t.priorityTone) && t.progress < 50
  );
  if (laggingCritical.length) {
    add(
      "high_priority_incomplete",
      "high",
      `${laggingCritical.length} critical task${laggingCritical.length > 1 ? "s" : ""} lagging under 50%`,
      `${laggingCritical[0].title} is ${laggingCritical[0].priority} priority with only ${laggingCritical[0].progress}% completion.`,
      "Allocate additional team support or review blockers.",
      "tasks",
      laggingCritical[0].title
    );
  }

  // 3. low_progress_near_deadline
  data.tasks
    .filter((t) => {
      if (t.statusTone === "completed" || !t.dueAt) return false;
      const days = daysUntil(t.dueAt);
      return days !== null && days <= 7 && days >= 0 && t.progress < 60;
    })
    .slice(0, 3)
    .forEach((t) => {
      add(
        "low_progress_near_deadline",
        "warning",
        `Deadline approaching: ${t.title}`,
        `${daysUntil(t.dueAt)} day${daysUntil(t.dueAt) === 1 ? "" : "s"} remaining with ${t.progress}% progress.`,
        "Add support, reduce scope, or reprioritize before the due date.",
        "tasks",
        t.title
      );
    });

  // 4. unassigned_critical
  const unassigned = unassignedCriticalTasks(data);
  if (unassigned.length) {
    add(
      "unassigned_critical",
      "warning",
      `${unassigned.length} critical task${unassigned.length > 1 ? "s" : ""} unassigned`,
      `${unassigned[0].title} is ${unassigned[0].priority} priority but has no assigned member.`,
      "Use the AI recommendation to assign a suitable team member.",
      "insights",
      unassigned[0].title
    );
  }

  // 5. blocked_tasks
  const blocked = data.tasks.filter((t) => t.statusTone === "blocked" || (t.blockers && t.blockers.length > 0));
  if (blocked.length) {
    const isCriticalBlocked = blocked.some((t) => ["high", "critical"].includes(t.priorityTone));
    add(
      "blocked_tasks",
      isCriticalBlocked ? "critical" : "warning",
      `${blocked.length} blocked task${blocked.length > 1 ? "s" : ""}`,
      `${blocked[0].title} is blocked${blocked[0].blockers?.length ? `: ${blocked[0].blockers[0]}` : ""}.`,
      "Resolve the blocker or reassign to keep delivery moving.",
      "tasks",
      blocked[0].title
    );
  }

  // 6. overloaded_members
  data.members
    .filter((m) => m.workload >= 100 || m.availabilityTone === "overloaded")
    .forEach((m) => {
      add(
        "overloaded_members",
        "critical",
        `${m.name} is overloaded`,
        `${m.name} is at ${m.workload}% workload with ${m.availabilityTone} availability.`,
        "Redistribute tasks to available members.",
        "team",
        m.name
      );
    });

  // 7. projects_behind_schedule
  data.projects
    .filter((p) => p.statusTone !== "completed" && p.expectedProgress - p.progress > 10)
    .forEach((p) => {
      add(
        "projects_behind_schedule",
        "high",
        `${p.name} is behind schedule`,
        `Progress is ${p.progress}% vs an expected ${p.expectedProgress}% at this point in the timeline.`,
        "Review tasks and accelerate critical-path work.",
        "projects",
        p.name
      );
    });

  // 8. uneven_workload
  data.members
    .filter((m) => m.workload >= 75 && m.workload < 100)
    .slice(0, 3)
    .forEach((m) => {
      add(
        "uneven_workload",
        "warning",
        `${m.name} has a high workload`,
        `${m.name} is at ${m.workload}% capacity.`,
        "Monitor capacity and avoid assigning new work.",
        "team",
        m.name
      );
    });

  // Pull any additional project-level critical risk factors
  data.projects
    .filter((p) => ["high", "critical"].includes(p.riskTone) && p.statusTone !== "completed")
    .forEach((p) => {
      if (p.metrics?.risks?.length) {
        p.metrics.risks.forEach((r) => {
          if (!warnings.some((w) => w.detail === r.reason || w.title === r.reason)) {
            add(
              r.category || "project_risk",
              String(r.severity || "high").toLowerCase(),
              `${p.name}: ${r.category?.replace(/_/g, " ") || "Risk alert"}`,
              r.reason,
              r.recommendedAction || "Review project risks in project detail.",
              "projects",
              r.affectedItem || p.name
            );
          }
        });
      } else {
        add(
          "project_risk",
          p.riskTone === "critical" ? "critical" : "warning",
          `${p.name} has ${p.risk} delivery risk`,
          p.metrics?.factors?.[0] || "Current project metrics show an elevated delivery risk.",
          "Open the project dashboard and review the risk factors.",
          "projects",
          p.name
        );
      }
    });

  return warnings;
}

// Summarize a member's capacity position for the Team dashboard.
export function memberCapacity(member, statsRow) {
  if (member.availabilityTone === "unavailable" || member.availabilityTone === "absent") {
    return { label: "Not available", tone: "unavailable" };
  }
  if (member.workload >= 100 || member.availabilityTone === "overloaded") return { label: "Overloaded", tone: "overloaded" };
  if (member.workload >= 75) return { label: "Busy", tone: "busy" };
  if (statsRow?.active === 0) return { label: "Available", tone: "available" };
  return { label: "Available", tone: "available" };
}

