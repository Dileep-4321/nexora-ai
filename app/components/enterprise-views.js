"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  apiRequest,
  getActivityTimeline,
  listProjectTemplates,
  saveProjectAsTemplate,
  createProjectFromTemplate,
  downloadTasksCsv,
  importTasksCsvPreview,
  importTasksCsvCommit,
  updateNotificationPreferences
} from "../../lib/api";

// ============================================================
// 1. SMART CALENDAR & SCHEDULING VIEW (Month / Week / Day / Agenda)
// ============================================================
export function SmartCalendarView({
  data,
  go,
  openProject,
  openTask,
  isClient = false,
  notify,
  Icon: IconProp,
  Tag: TagProp
}) {
  const Icon = IconProp || (({ name, size = 15 }) => <span style={{ fontSize: `${size}px` }}>📅</span>);
  const Tag = TagProp || (({ children, tone }) => <span className={`tag ${tone || ""}`}>{children}</span>);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const p = JSON.parse(localStorage.getItem("nexora_dashboard_prefs") || "{}");
        return p.calendarView || "month";
      } catch {
        return "month";
      }
    }
    return "month";
  });
  const [filterKind, setFilterKind] = useState("all");
  const [selectedProject, setSelectedProject] = useState("all");
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load calendar events from backend
  useEffect(() => {
    let mounted = true;
    async function fetchCalendar() {
      setLoading(true);
      try {
        const res = await apiRequest("/calendar");
        if (mounted && res?.data?.events) {
          setCalendarEvents(res.data.events);
        }
      } catch {
        if (mounted) setCalendarEvents(data?.calendar || []);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    fetchCalendar();
    return () => { mounted = false; };
  }, [data]);

  const handleViewChange = (mode) => {
    setViewMode(mode);
    if (typeof window !== "undefined") {
      try {
        const p = JSON.parse(localStorage.getItem("nexora_dashboard_prefs") || "{}");
        p.calendarView = mode;
        localStorage.setItem("nexora_dashboard_prefs", JSON.stringify(p));
      } catch {}
    }
  };

  const navDate = (delta) => {
    const next = new Date(currentDate);
    if (viewMode === "month") next.setMonth(next.getMonth() + delta);
    else if (viewMode === "week") next.setDate(next.getDate() + delta * 7);
    else next.setDate(next.getDate() + delta);
    setCurrentDate(next);
  };

  const resetToToday = () => setCurrentDate(new Date());

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const filteredEvents = useMemo(() => {
    return calendarEvents.filter((ev) => {
      if (filterKind !== "all" && ev.kind !== filterKind) return false;
      if (selectedProject !== "all" && String(ev.project?._id || ev.project?.id || ev.project) !== selectedProject) return false;
      return true;
    });
  }, [calendarEvents, filterKind, selectedProject]);

  // Month grid computation
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const daysGrid = [];
  for (let i = 0; i < firstDayIndex; i++) {
    daysGrid.push({ empty: true, key: `empty-${i}` });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dayEvents = filteredEvents.filter((ev) => {
      if (!ev.date) return false;
      return new Date(ev.date).toISOString().slice(0, 10) === dateStr;
    });
    const isToday = new Date().toISOString().slice(0, 10) === dateStr;
    daysGrid.push({ day: d, dateStr, events: dayEvents, isToday, key: dateStr });
  }

  // Kind tag helper
  const getKindTone = (kind) => {
    if (kind === "project_deadline") return "critical";
    if (kind === "milestone") return "completed";
    if (kind === "availability") return "unavailable";
    return "in-progress";
  };

  return (
    <div className="calendar-page-container">
      {/* Header bar */}
      <div className="page-header" style={{ marginBottom: "18px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <p className="eyebrow" style={{ margin: 0 }}>SMART CALENDAR &amp; SCHEDULE</p>
            <span className="tag active" style={{ fontSize: "11px", padding: "1px 8px" }}>
              {isClient ? "✦ CLIENT DELIVERY SCHEDULE" : "✦ UNIFIED ENTERPRISE TIMELINE"}
            </span>
          </div>
          <h1>Workspace Schedule &amp; Deadlines</h1>
          <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: "13px" }}>
            Actual portfolio deadlines, task due dates, milestones, and team availability synchronized with MongoDB.
          </p>
        </div>

        {/* View Mode Switcher */}
        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
          {["month", "week", "day", "agenda"].map((mode) => (
            <button
              key={mode}
              type="button"
              className={viewMode === mode ? "primary" : "outline"}
              style={{ padding: "6px 12px", fontSize: "12px", textTransform: "capitalize" }}
              onClick={() => handleViewChange(mode)}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Control bar: Prev / Today / Next + Filters */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          padding: "12px 16px",
          borderRadius: "8px",
          background: "linear-gradient(180deg, rgba(8, 25, 54, 0.8), rgba(4, 16, 36, 0.75))",
          border: "1px solid var(--line)",
          marginBottom: "16px",
          flexWrap: "wrap"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button type="button" className="outline" style={{ padding: "6px 10px" }} onClick={() => navDate(-1)}>
            ‹ Prev
          </button>
          <button type="button" className="outline" style={{ padding: "6px 12px" }} onClick={resetToToday}>
            Today
          </button>
          <button type="button" className="outline" style={{ padding: "6px 10px" }} onClick={() => navDate(1)}>
            Next ›
          </button>
          <h2 style={{ margin: "0 0 0 8px", fontSize: "16px", color: "var(--cyan)", fontWeight: 700 }}>
            {monthNames[month]} {year}
          </h2>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <select
            value={filterKind}
            onChange={(e) => setFilterKind(e.target.value)}
            style={{
              background: "#081d3c",
              border: "1px solid var(--line)",
              color: "#dcebff",
              padding: "6px 10px",
              borderRadius: "6px",
              fontSize: "12px"
            }}
          >
            <option value="all">All Event Types</option>
            <option value="task">{isClient ? "Deliverables" : "Tasks"}</option>
            <option value="milestone">Milestones</option>
            <option value="project_deadline">Project Releases</option>
            {!isClient && <option value="availability">Team Availability</option>}
          </select>

          {data.projects && (
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              style={{
                background: "#081d3c",
                border: "1px solid var(--line)",
                color: "#dcebff",
                padding: "6px 10px",
                borderRadius: "6px",
                fontSize: "12px"
              }}
            >
              <option value="all">All Projects</option>
              {data.projects.map((p) => (
                <option key={p.id || p._id} value={p.id || p._id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          <span className="tag" style={{ fontSize: "11px", padding: "4px 8px" }}>
            {filteredEvents.length} Events Total
          </span>
        </div>
      </div>

      {loading ? (
        <div className="empty-state" style={{ padding: "40px 20px" }}>
          <span className="loader" style={{ display: "inline-block", marginRight: "8px" }} />
          Loading calendar timeline…
        </div>
      ) : viewMode === "month" ? (
        /* Month Grid */
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: "6px",
            background: "rgba(4, 15, 34, 0.6)",
            padding: "10px",
            borderRadius: "10px",
            border: "1px solid var(--line)"
          }}
        >
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dayName) => (
            <div
              key={dayName}
              style={{
                textAlign: "center",
                padding: "8px",
                fontSize: "12px",
                fontWeight: 700,
                color: "var(--muted)",
                background: "rgba(10, 32, 68, 0.4)",
                borderRadius: "6px"
              }}
            >
              {dayName}
            </div>
          ))}

          {daysGrid.map((cell) => {
            if (cell.empty) {
              return (
                <div
                  key={cell.key}
                  style={{
                    minHeight: "95px",
                    background: "rgba(5, 18, 41, 0.2)",
                    borderRadius: "6px",
                    border: "1px dashed rgba(41, 184, 255, 0.1)"
                  }}
                />
              );
            }

            return (
              <div
                key={cell.key}
                style={{
                  minHeight: "95px",
                  background: cell.isToday
                    ? "linear-gradient(135deg, rgba(16, 52, 108, 0.5), rgba(7, 24, 52, 0.7))"
                    : "rgba(7, 22, 48, 0.6)",
                  border: cell.isToday ? "1px solid var(--cyan)" : "1px solid rgba(41, 184, 255, 0.18)",
                  borderRadius: "6px",
                  padding: "6px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <b
                    style={{
                      fontSize: "12px",
                      color: cell.isToday ? "var(--cyan)" : "#dcebff",
                      fontWeight: cell.isToday ? 800 : 600
                    }}
                  >
                    {cell.day}
                  </b>
                  {cell.isToday && (
                    <span style={{ fontSize: "9px", color: "var(--cyan)", fontWeight: 700 }}>TODAY</span>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "3px", overflow: "hidden" }}>
                  {cell.events.slice(0, 3).map((ev) => (
                    <div
                      key={ev._id || ev.id}
                      onClick={() => {
                        if (ev.kind === "task") openTask?.(ev);
                        else if (ev.project) openProject?.(ev.project);
                      }}
                      title={`${ev.title} (${ev.kind})`}
                      style={{
                        padding: "2px 5px",
                        borderRadius: "3px",
                        fontSize: "10.5px",
                        lineHeight: 1.25,
                        background:
                          ev.kind === "project_deadline"
                            ? "rgba(255, 110, 174, 0.2)"
                            : ev.kind === "milestone"
                            ? "rgba(33, 216, 174, 0.2)"
                            : "rgba(48, 219, 255, 0.15)",
                        borderLeft: `2px solid ${
                          ev.kind === "project_deadline"
                            ? "#ff6eae"
                            : ev.kind === "milestone"
                            ? "#21d8ae"
                            : "#30dbff"
                        }`,
                        color: "#fff",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        cursor: "pointer"
                      }}
                    >
                      {ev.title}
                    </div>
                  ))}
                  {cell.events.length > 3 && (
                    <span style={{ fontSize: "10px", color: "var(--muted)", textAlign: "center" }}>
                      +{cell.events.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Agenda / List / Week View */
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {filteredEvents.length === 0 ? (
            <div className="empty-state" style={{ padding: "40px" }}>
              No scheduled events found matching current criteria.
            </div>
          ) : (
            filteredEvents.map((ev) => {
              const isOverdue = ev.date && new Date(ev.date) < new Date() && ev.status !== "completed";
              return (
                <div
                  key={ev._id || ev.id}
                  className="warning-card"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px 16px",
                    cursor: "pointer",
                    borderLeft: `3px solid ${
                      ev.kind === "project_deadline"
                        ? "#ff6eae"
                        : ev.kind === "milestone"
                        ? "#21d8ae"
                        : "#30dbff"
                    }`
                  }}
                  onClick={() => {
                    if (ev.kind === "task") openTask?.(ev);
                    else if (ev.project) openProject?.(ev.project);
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <b>{ev.title}</b>
                      {isOverdue && (
                        <span className="tag high" style={{ fontSize: "10px", padding: "1px 6px" }}>
                          OVERDUE
                        </span>
                      )}
                    </div>
                    <small style={{ color: "var(--muted)", fontSize: "11.5px" }}>
                      {ev.project?.name || "Workspace Event"} · Type: {ev.kind.replace("_", " ").toUpperCase()}
                      {ev.assignedTo ? ` · Assigned to: ${ev.assignedTo.name}` : ""}
                    </small>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "12px", color: "#a8c5e6", fontWeight: 600 }}>
                      {ev.date ? new Date(ev.date).toLocaleDateString() : "Pending"}
                    </span>
                    <Tag tone={getKindTone(ev.kind)}>{ev.status || ev.kind}</Tag>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 2. UNIFIED ACTIVITY TIMELINE VIEW (Role-Scoped & Client-Safe)
// ============================================================
export function ActivityTimelineView({
  data,
  go,
  openProject,
  isClient = false,
  notify,
  Icon: IconProp,
  Tag: TagProp
}) {
  const Icon = IconProp || (({ name, size = 15 }) => <span style={{ fontSize: `${size}px` }}>⚡</span>);
  const Tag = TagProp || (({ children, tone }) => <span className={`tag ${tone || ""}`}>{children}</span>);

  const [activities, setActivities] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("all");
  const [selectedProjectId, setSelectedProjectId] = useState("all");

  const loadActivity = async () => {
    setLoading(true);
    try {
      const params = { page, limit };
      if (actionFilter !== "all") params.action = actionFilter;
      if (selectedProjectId !== "all") params.projectId = selectedProjectId;

      const res = await getActivityTimeline(params);
      setActivities(res.items || []);
      setTotal(res.pagination?.total || 0);
    } catch (err) {
      notify?.("Failed to fetch activity timeline: " + (err.message || "Network issue"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActivity();
  }, [page, actionFilter, selectedProjectId]);

  const formatRelativeTime = (timestamp) => {
    if (!timestamp) return "Recently";
    const diff = Math.floor((new Date() - new Date(timestamp)) / 1000);
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  const getActionBadgeTone = (action) => {
    if (action.includes("created") || action.includes("approved")) return "completed";
    if (action.includes("updated") || action.includes("reassigned")) return "in-progress";
    if (action.includes("deleted") || action.includes("rejected") || action.includes("deactivated")) return "critical";
    return "to-do";
  };

  return (
    <div className="activity-page-container">
      <div className="page-header" style={{ marginBottom: "18px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <p className="eyebrow" style={{ margin: 0 }}>ENTERPRISE AUDIT &amp; REAL-TIME TIMELINE</p>
            <span className="tag active" style={{ fontSize: "11px", padding: "1px 8px" }}>
              {isClient ? "✦ CLIENT EVENT LOG" : "✦ GOVERNANCE ACTIVITY STREAM"}
            </span>
          </div>
          <h1>Unified Activity Timeline</h1>
          <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: "13px" }}>
            {isClient
              ? "Verified record of milestone completions, document releases, and project deliveries."
              : "Immutable system activity log: tasks, project baselines, resource adjustments, and approvals."}
          </p>
        </div>

        <button type="button" className="outline" onClick={loadActivity} style={{ gap: "6px" }}>
          <Icon name="refresh" size={13} /> Refresh Stream
        </button>
      </div>

      {/* Filter Ribbon */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "10px",
          padding: "10px 14px",
          borderRadius: "8px",
          background: "linear-gradient(180deg, rgba(8, 25, 54, 0.8), rgba(4, 16, 36, 0.75))",
          border: "1px solid var(--line)",
          marginBottom: "16px",
          flexWrap: "wrap"
        }}
      >
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            style={{
              background: "#081d3c",
              border: "1px solid var(--line)",
              color: "#dcebff",
              padding: "6px 10px",
              borderRadius: "6px",
              fontSize: "12px"
            }}
          >
            <option value="all">All Action Types</option>
            <option value="project_created">Project Created</option>
            <option value="project_updated">Project Updated</option>
            <option value="milestone_completed">Milestone Completed</option>
            <option value="document_uploaded">Document Uploaded</option>
            <option value="document_approved">Document Approved</option>
            {!isClient && <option value="task_reassigned">Task Reassigned</option>}
            {!isClient && <option value="employee_deactivated">Employee Deactivated</option>}
          </select>

          {data.projects && (
            <select
              value={selectedProjectId}
              onChange={(e) => { setSelectedProjectId(e.target.value); setPage(1); }}
              style={{
                background: "#081d3c",
                border: "1px solid var(--line)",
                color: "#dcebff",
                padding: "6px 10px",
                borderRadius: "6px",
                fontSize: "12px"
              }}
            >
              <option value="all">All Projects</option>
              {data.projects.map((p) => (
                <option key={p.id || p._id} value={p.id || p._id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <span className="tag" style={{ fontSize: "11px", padding: "4px 8px" }}>
          Showing {activities.length} of {total} events
        </span>
      </div>

      {/* Stream list */}
      {loading ? (
        <div className="empty-state" style={{ padding: "40px" }}>
          <span className="loader" style={{ display: "inline-block", marginRight: "8px" }} />
          Loading activity stream…
        </div>
      ) : activities.length === 0 ? (
        <div className="empty-state" style={{ padding: "40px" }}>
          No recorded events found matching this filter criteria.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {activities.map((act) => (
            <div
              key={act._id || act.id}
              className="warning-card"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "12px",
                padding: "12px 16px"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span
                  style={{
                    display: "grid",
                    placeItems: "center",
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    background: "rgba(48, 219, 255, 0.12)",
                    border: "1px solid rgba(48, 219, 255, 0.3)",
                    color: "var(--cyan)",
                    fontSize: "12px",
                    fontWeight: 800,
                    flexShrink: 0
                  }}
                >
                  {act.actor?.name?.[0] || "N"}
                </span>

                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <b>{act.actor?.name || "System"}</b>
                    <Tag tone={getActionBadgeTone(act.action)}>{act.action.replace(/_/g, " ")}</Tag>
                  </div>
                  <small style={{ color: "var(--muted)", fontSize: "11.5px" }}>
                    Entity: {act.entityType || "Workspace"} · {act.metadata?.reason || act.metadata?.category || "Verified system execution"}
                  </small>
                </div>
              </div>

              <span style={{ fontSize: "11.5px", color: "#8daecc", whiteSpace: "nowrap" }}>
                {formatRelativeTime(act.timestamp)}
              </span>
            </div>
          ))}

          {/* Pagination controls */}
          <div style={{ display: "flex", justifyContent: "center", gap: "10px", marginTop: "14px" }}>
            <button
              type="button"
              className="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{ padding: "6px 14px", fontSize: "12px" }}
            >
              Previous Page
            </button>
            <span style={{ display: "flex", alignItems: "center", fontSize: "12px", color: "var(--muted)" }}>
              Page {page} of {Math.max(1, Math.ceil(total / limit))}
            </span>
            <button
              type="button"
              className="outline"
              disabled={page >= Math.ceil(total / limit)}
              onClick={() => setPage((p) => p + 1)}
              style={{ padding: "6px 14px", fontSize: "12px" }}
            >
              Next Page
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 3. NOTIFICATION PREFERENCES MODAL
// ============================================================
export function NotificationPreferencesModal({
  isOpen,
  onClose,
  user,
  notify,
  reloadWorkspace
}) {
  const [prefs, setPrefs] = useState({
    taskAssignments: true,
    deadlineReminders: true,
    projectUpdates: true,
    discussionMentions: true,
    documentApprovals: true,
    resourceAlerts: true,
    aiRiskAlerts: true,
    weeklyDigest: true
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user?.preferences) {
      setPrefs((prev) => ({ ...prev, ...user.preferences }));
    }
  }, [user]);

  if (!isOpen) return null;

  const toggle = (key) => setPrefs((p) => ({ ...p, [key]: !p[key] }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateNotificationPreferences(prefs);
      notify?.("Notification preferences updated successfully.");
      await reloadWorkspace?.();
      onClose();
    } catch (err) {
      notify?.("Failed to save preferences: " + (err.message || "Error"));
    } finally {
      setSaving(false);
    }
  };

  const prefItems = [
    { key: "taskAssignments", label: "Task Assignments & Status Changes", desc: "Alerts when tasks are assigned, reopened, or marked complete." },
    { key: "deadlineReminders", label: "Deadline & Milestone Reminders", desc: "High-priority warnings for upcoming delivery targets within 48h." },
    { key: "projectUpdates", label: "Project Health & Baseline Shifts", desc: "Notifications when project dates, baselines, or risks are modified." },
    { key: "discussionMentions", label: "Discussion Mentions & Direct Replies", desc: "Instant notifications when your team @mentions you in discussions." },
    { key: "documentApprovals", label: "Document Submissions & Approvals", desc: "Alerts when files are uploaded, approved, or rejected for release." },
    { key: "resourceAlerts", label: "Workload & Resource Saturation", desc: "Advisory warnings when member capacity exceeds normal limits." },
    { key: "aiRiskAlerts", label: "AI Operational Risk Alerts", desc: "Deterministic schedule variance and critical-path bottleneck warnings." }
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: "560px", padding: "24px" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div>
            <h2 style={{ margin: "0 0 4px", fontSize: "18px" }}>Notification Preferences</h2>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: "12.5px" }}>
              Configure categories and channels for your authenticated user account.
            </p>
          </div>
          <button type="button" className="text-button" onClick={onClose} style={{ color: "var(--muted)" }}>
            ✕
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "60vh", overflowY: "auto", paddingRight: "4px" }}>
          {prefItems.map((item) => (
            <label
              key={item.key}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
                padding: "10px 12px",
                borderRadius: "8px",
                background: "rgba(9, 27, 57, 0.45)",
                border: "1px solid var(--line)",
                cursor: "pointer"
              }}
            >
              <input
                type="checkbox"
                checked={!!prefs[item.key]}
                onChange={() => toggle(item.key)}
                style={{ marginTop: "3px", accentColor: "var(--cyan)" }}
              />
              <div style={{ flex: 1 }}>
                <b style={{ display: "block", fontSize: "13.5px", color: "#fff" }}>{item.label}</b>
                <span style={{ fontSize: "11.5px", color: "var(--muted)", lineHeight: 1.4, display: "block" }}>
                  {item.desc}
                </span>
              </div>
            </label>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "18px", paddingTop: "12px", borderTop: "1px solid var(--line)" }}>
          <button type="button" className="outline" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Preferences"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 4. PROJECT TEMPLATES & CSV AUTOMATION MODALS
// ============================================================
export function ProjectTemplatesModal({
  isOpen,
  onClose,
  projects = [],
  notify,
  reloadWorkspace
}) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [instantiating, setInstantiating] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [newDeadline, setNewDeadline] = useState("");

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const items = await listProjectTemplates();
      setTemplates(items || []);
    } catch {
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) loadTemplates();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreate = async () => {
    if (!selectedTemplate || !newProjectName.trim() || !newDeadline) {
      notify?.("Please provide project name, target deadline, and select a template.");
      return;
    }
    setInstantiating(true);
    try {
      await createProjectFromTemplate({
        templateId: selectedTemplate._id,
        name: newProjectName.trim(),
        startDate: new Date().toISOString(),
        deadline: new Date(newDeadline).toISOString()
      });
      notify?.(`Project "${newProjectName}" created successfully from template!`);
      await reloadWorkspace?.();
      onClose();
    } catch (err) {
      notify?.("Failed to instantiate template: " + (err.message || "Error"));
    } finally {
      setInstantiating(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: "600px", padding: "24px" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div>
            <h2 style={{ margin: "0 0 4px", fontSize: "18px" }}>Project Template Library</h2>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: "12.5px" }}>
              Accelerate project setup using approved enterprise blueprint templates.
            </p>
          </div>
          <button type="button" className="text-button" onClick={onClose} style={{ color: "var(--muted)" }}>✕</button>
        </div>

        {loading ? (
          <div className="empty-state" style={{ padding: "30px" }}>Loading template catalog…</div>
        ) : templates.length === 0 ? (
          <div className="empty-state" style={{ padding: "30px" }}>
            No saved templates found. Save any existing project as a template to enable quick instantiation.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "40vh", overflowY: "auto", marginBottom: "16px" }}>
            {templates.map((tpl) => (
              <div
                key={tpl._id}
                onClick={() => setSelectedTemplate(tpl)}
                style={{
                  padding: "12px",
                  borderRadius: "8px",
                  border: selectedTemplate?._id === tpl._id ? "1px solid var(--cyan)" : "1px solid var(--line)",
                  background: selectedTemplate?._id === tpl._id ? "rgba(48, 219, 255, 0.12)" : "rgba(8, 25, 54, 0.6)",
                  cursor: "pointer"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <b style={{ color: "#fff", fontSize: "14px" }}>{tpl.name}</b>
                  <span className="tag active" style={{ fontSize: "11px" }}>{tpl.templateCategory || "General"}</span>
                </div>
                <small style={{ color: "var(--muted)", display: "block", marginTop: "4px" }}>
                  {tpl.description || "Pre-configured milestone workflow and task baseline"}
                </small>
              </div>
            ))}
          </div>
        )}

        {selectedTemplate && (
          <div style={{ padding: "12px", borderRadius: "8px", background: "rgba(4, 16, 36, 0.8)", border: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: "10px" }}>
            <h3 style={{ margin: 0, fontSize: "13.5px", color: "var(--cyan)" }}>Create New Project from Selected Template</h3>
            <input
              placeholder="Enter new project name…"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: "6px", background: "#061833", border: "1px solid var(--line)", color: "#fff" }}
            />
            <input
              type="date"
              value={newDeadline}
              onChange={(e) => setNewDeadline(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: "6px", background: "#061833", border: "1px solid var(--line)", color: "#fff" }}
            />
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "18px" }}>
          <button type="button" className="outline" onClick={onClose} disabled={instantiating}>Cancel</button>
          <button type="button" className="primary" onClick={handleCreate} disabled={instantiating || !selectedTemplate}>
            {instantiating ? "Creating Project…" : "Instantiate Project"}
          </button>
        </div>
      </div>
    </div>
  );
}
