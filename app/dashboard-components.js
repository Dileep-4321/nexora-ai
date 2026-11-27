"use client";

import React, { useState, useEffect, useRef } from "react";
import { globalSearch, downloadProjectPDFReport, downloadProjectExcelReport } from "../lib/api";

export function KanbanBoard({
  tasks = [],
  onTaskClick,
  onStatusChange,
  isClient = false,
  members = [],
  Icon: IconProp,
  Avatar: AvatarProp,
  Tag: TagProp,
  Progress: ProgressProp
}) {
  const Icon = IconProp || (({ name, size = 14 }) => <span style={{ fontSize: `${size}px`, display: "inline-block" }}>●</span>);
  const Avatar = AvatarProp || (({ member }) => <span className="avatar small">{member?.name?.[0] || "U"}</span>);
  const Tag = TagProp || (({ children, tone }) => <span className={`tag ${tone || ""}`}>{children}</span>);
  const Progress = ProgressProp || (({ value = 0 }) => <div className="progress"><i style={{ width: `${value}%` }} /></div>);
  const columns = [
    { id: "todo", title: "To Do", tone: "todo", color: "#3880ff" },
    { id: "in-progress", title: "In Progress", tone: "in-progress", color: "#30dbff" },
    { id: "blocked", title: "Blocked / Review", tone: "blocked", color: "#ff6eae" },
    { id: "completed", title: "Completed", tone: "completed", color: "#21d8ae" }
  ];

  const getColTasks = (colId) => {
    return tasks.filter((t) => {
      if (colId === "todo") return t.statusTone === "todo" || t.status === "To Do";
      if (colId === "in-progress") return t.statusTone === "in-progress" || t.status === "In Progress";
      if (colId === "blocked") return t.statusTone === "blocked" || t.status === "Blocked" || (t.blockers && t.blockers.length > 0);
      if (colId === "completed") return t.statusTone === "completed" || t.status === "Completed";
      return false;
    });
  };

  return (
    <div className="kanban-board">
      {columns.map((col) => {
        const colTasks = getColTasks(col.id);
        return (
          <div className="kanban-col" key={col.id}>
            <div className="kanban-col-head">
              <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: col.color,
                    boxShadow: `0 0 8px ${col.color}`
                  }}
                />
                {col.title}
              </span>
              <span className="kanban-col-count">{colTasks.length}</span>
            </div>

            <div className="kanban-cards-list">
              {colTasks.length === 0 ? (
                <div
                  style={{
                    padding: "24px 12px",
                    textAlign: "center",
                    color: "var(--muted, #8daecc)",
                    fontSize: "12px",
                    fontStyle: "italic",
                    border: "1px dashed rgba(41, 184, 255, 0.15)",
                    borderRadius: "6px"
                  }}
                >
                  No tasks in {col.title.toLowerCase()}
                </div>
              ) : (
                colTasks.map((task) => {
                  const assignee = members.find((m) => m.id === task.assigneeId);
                  return (
                    <article
                      className="kanban-card"
                      key={task.id || task._id || task.title}
                      onClick={() => onTaskClick?.(task)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onTaskClick?.(task);
                        }
                      }}
                    >
                      <div className="kanban-card-title">{task.title}</div>
                      <div className="kanban-card-project">
                        {task.projectName || "General Project"}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
                        <Tag tone={task.priorityTone}>{task.priority}</Tag>
                        {task.risk && task.risk !== "Low" && (
                          <Tag tone={task.riskTone}>{task.risk} risk</Tag>
                        )}
                      </div>

                      <div style={{ marginBottom: "6px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--muted, #8daecc)", marginBottom: "3px" }}>
                          <span>Progress</span>
                          <b>{task.progress || 0}%</b>
                        </div>
                        <Progress value={task.progress || 0} />
                      </div>

                      <div className="kanban-card-footer">
                        <span style={{ display: "flex", alignItems: "center", gap: "5px", color: "var(--muted, #8daecc)" }}>
                          <Icon name="calendar" size={13} />
                          {task.due || (task.dueAt ? new Date(task.dueAt).toLocaleDateString() : "No date")}
                        </span>

                        {!isClient && assignee && (
                          <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                            <Avatar member={assignee} small />
                            <small style={{ fontSize: "11px", color: "#d1e4f8" }}>{assignee.name.split(" ")[0]}</small>
                          </span>
                        )}
                      </div>

                      {/* Quick Move Selector */}
                      {onStatusChange && (
                        <div
                          style={{ marginTop: "10px", paddingTop: "8px", borderTop: "1px solid rgba(41, 184, 255, 0.12)" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <select
                            style={{
                              width: "100%",
                              padding: "4px 8px",
                              fontSize: "11.5px",
                              borderRadius: "5px",
                              background: "#081d3c",
                              border: "1px solid rgba(41, 184, 255, 0.3)",
                              color: "#cce4fb",
                              cursor: "pointer"
                            }}
                            value={task.statusTone || "todo"}
                            onChange={(e) => onStatusChange(task, e.target.value)}
                          >
                            <option value="todo">Move to: To Do</option>
                            <option value="in-progress">Move to: In Progress</option>
                            <option value="blocked">Move to: Blocked / Review</option>
                            <option value="completed">Move to: Completed</option>
                          </select>
                        </div>
                      )}
                    </article>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function GlobalSearchModal({
  isOpen,
  onClose,
  initialQuery = "",
  onSelectProject,
  onSelectTask,
  onSelectMember,
  onSelectMilestone,
  onSelectDocument,
  onSelectDiscussion,
  isClient = false,
  Icon,
  Tag
}) {
  const [q, setQ] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      if (initialQuery && initialQuery.trim()) {
        setQ(initialQuery);
      }
      setTimeout(() => inputRef.current?.focus(), 50);
      setSelectedIndex(0);
    } else {
      setQ("");
      setResults(null);
      setSelectedIndex(0);
    }
  }, [isOpen, initialQuery]);

  useEffect(() => {
    if (!q || !q.trim()) {
      setResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await globalSearch(q);
        setResults(res);
        setSelectedIndex(0);
      } catch {
        setResults({ projects: [], tasks: [], members: [], milestones: [], documents: [], discussions: [] });
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  if (!isOpen) return null;

  const projects = results?.projects || [];
  const tasks = results?.tasks || [];
  const milestones = results?.milestones || [];
  const documents = results?.documents || [];
  const discussions = isClient ? [] : (results?.discussions || []);
  const members = isClient ? [] : (results?.members || []);

  const allItems = [
    ...projects.map((p) => ({ type: "project", item: p, title: p.name, action: () => onSelectProject?.(p) })),
    ...tasks.map((t) => ({ type: "task", item: t, title: t.title, action: () => onSelectTask?.(t) })),
    ...milestones.map((m) => ({ type: "milestone", item: m, title: m.title, action: () => onSelectMilestone?.(m) })),
    ...documents.map((d) => ({ type: "document", item: d, title: d.name, action: () => onSelectDocument?.(d) })),
    ...discussions.map((c) => ({ type: "discussion", item: c, title: c.content, action: () => onSelectDiscussion?.(c) })),
    ...members.map((m) => ({ type: "member", item: m, title: m.name, action: () => onSelectMember?.(m) }))
  ];

  const hasResults = allItems.length > 0;

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (allItems.length ? (prev + 1) % allItems.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (allItems.length ? (prev - 1 + allItems.length) % allItems.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (allItems[selectedIndex]) {
        allItems[selectedIndex].action();
        onClose();
      }
    }
  };

  const highlightText = (text, query) => {
    if (!text || !query.trim()) return text;
    const parts = String(text).split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, "gi"));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} style={{ background: "rgba(48, 219, 255, 0.25)", color: "#30dbff", borderRadius: "2px", padding: "0 2px" }}>
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  let currentIndexTracker = 0;

  return (
    <div className="search-modal-backdrop" onClick={onClose}>
      <div className="search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="search-modal-input-row">
          <Icon name="search" size={20} />
          <input
            ref={inputRef}
            placeholder="Type to search projects, tasks, deliverables, documents… (↑↓ navigate, ENTER select, ESC close)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {loading && <span style={{ fontSize: "12px", color: "var(--cyan)" }}>Searching…</span>}
          <button
            type="button"
            className="text-button"
            onClick={onClose}
            style={{ color: "var(--muted)", padding: "4px" }}
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="search-modal-results">
          {!q.trim() && (
            <div style={{ padding: "30px 16px", textAlign: "center", color: "var(--muted)" }}>
              Start typing to search across your authorized workspace records.
              <div style={{ marginTop: "8px", fontSize: "11.5px", color: "#6188b4" }}>
                Tip: Press <kbd style={{ background: "#0b244d", padding: "2px 6px", borderRadius: "4px" }}>Ctrl</kbd> + <kbd style={{ background: "#0b244d", padding: "2px 6px", borderRadius: "4px" }}>K</kbd> or <kbd style={{ background: "#0b244d", padding: "2px 6px", borderRadius: "4px" }}>/</kbd> anywhere to open search.
              </div>
            </div>
          )}

          {q.trim() && !loading && !hasResults && (
            <div style={{ padding: "30px 16px", textAlign: "center", color: "var(--muted)" }}>
              No matches found for "{q}".
            </div>
          )}

          {projects.length > 0 && (
            <div>
              <div className="search-cat-title">Projects ({projects.length})</div>
              {projects.map((p) => {
                const thisIndex = currentIndexTracker++;
                const isSelected = thisIndex === selectedIndex;
                return (
                  <div
                    className={`search-item ${isSelected ? "selected-search-item" : ""}`}
                    style={isSelected ? { background: "rgba(48, 219, 255, 0.12)", borderColor: "var(--cyan)" } : {}}
                    key={p.id || p._id}
                    onClick={() => {
                      onSelectProject?.(p);
                      onClose();
                    }}
                  >
                    <div>
                      <b>{highlightText(p.name, q)}</b>
                      <small style={{ display: "block", color: "var(--muted)", fontSize: "11px" }}>
                        {p.code || "NX"} · {p.status || "In Progress"}
                      </small>
                    </div>
                    <Tag tone={p.statusTone || "in-progress"}>{p.progress ?? 0}%</Tag>
                  </div>
                );
              })}
            </div>
          )}

          {tasks.length > 0 && (
            <div>
              <div className="search-cat-title">{isClient ? "Deliverables" : "Tasks"} ({tasks.length})</div>
              {tasks.map((t) => {
                const thisIndex = currentIndexTracker++;
                const isSelected = thisIndex === selectedIndex;
                return (
                  <div
                    className={`search-item ${isSelected ? "selected-search-item" : ""}`}
                    style={isSelected ? { background: "rgba(48, 219, 255, 0.12)", borderColor: "var(--cyan)" } : {}}
                    key={t.id || t._id}
                    onClick={() => {
                      onSelectTask?.(t);
                      onClose();
                    }}
                  >
                    <div>
                      <b>{highlightText(t.title, q)}</b>
                      <small style={{ display: "block", color: "var(--muted)", fontSize: "11px" }}>
                        {t.project?.name || "Workspace Task"} · {t.priority || "Medium"} Priority
                      </small>
                    </div>
                    <Tag tone={t.statusTone || "todo"}>{t.status || "To Do"}</Tag>
                  </div>
                );
              })}
            </div>
          )}

          {milestones.length > 0 && (
            <div>
              <div className="search-cat-title">Milestones ({milestones.length})</div>
              {milestones.map((m) => {
                const thisIndex = currentIndexTracker++;
                const isSelected = thisIndex === selectedIndex;
                return (
                  <div
                    className={`search-item ${isSelected ? "selected-search-item" : ""}`}
                    style={isSelected ? { background: "rgba(48, 219, 255, 0.12)", borderColor: "var(--cyan)" } : {}}
                    key={m.id || m._id}
                    onClick={() => {
                      onSelectMilestone?.(m);
                      onClose();
                    }}
                  >
                    <div>
                      <b>{highlightText(m.title, q)}</b>
                      <small style={{ display: "block", color: "var(--muted)", fontSize: "11px" }}>
                        Milestone · Due {m.dueDate ? new Date(m.dueDate).toLocaleDateString() : 'Pending'}
                      </small>
                    </div>
                    <Tag tone={m.status === "completed" ? "completed" : "in-progress"}>{m.status || "Pending"}</Tag>
                  </div>
                );
              })}
            </div>
          )}

          {documents.length > 0 && (
            <div>
              <div className="search-cat-title">Documents ({documents.length})</div>
              {documents.map((d) => {
                const thisIndex = currentIndexTracker++;
                const isSelected = thisIndex === selectedIndex;
                return (
                  <div
                    className={`search-item ${isSelected ? "selected-search-item" : ""}`}
                    style={isSelected ? { background: "rgba(48, 219, 255, 0.12)", borderColor: "var(--cyan)" } : {}}
                    key={d.id || d._id}
                    onClick={() => {
                      onSelectDocument?.(d);
                      onClose();
                    }}
                  >
                    <div>
                      <b>{highlightText(d.name, q)}</b>
                      <small style={{ display: "block", color: "var(--muted)", fontSize: "11px" }}>
                        {d.category || "General"} · {d.status || "Approved"}
                      </small>
                    </div>
                    <Tag tone={d.status === "approved" ? "approved" : "in-progress"}>{d.status || "Document"}</Tag>
                  </div>
                );
              })}
            </div>
          )}

          {!isClient && discussions.length > 0 && (
            <div>
              <div className="search-cat-title">Discussions ({discussions.length})</div>
              {discussions.map((c) => {
                const thisIndex = currentIndexTracker++;
                const isSelected = thisIndex === selectedIndex;
                return (
                  <div
                    className={`search-item ${isSelected ? "selected-search-item" : ""}`}
                    style={isSelected ? { background: "rgba(48, 219, 255, 0.12)", borderColor: "var(--cyan)" } : {}}
                    key={c.id || c._id}
                    onClick={() => {
                      onSelectDiscussion?.(c);
                      onClose();
                    }}
                  >
                    <div>
                      <b>{highlightText(c.content?.slice(0, 75) + (c.content?.length > 75 ? "…" : ""), q)}</b>
                      <small style={{ display: "block", color: "var(--muted)", fontSize: "11px" }}>
                        By {c.author} · {c.project?.name || "Project Discussion"}
                      </small>
                    </div>
                    <Tag tone="to-do">Thread</Tag>
                  </div>
                );
              })}
            </div>
          )}

          {!isClient && members.length > 0 && (
            <div>
              <div className="search-cat-title">Team Members ({members.length})</div>
              {members.map((m) => {
                const thisIndex = currentIndexTracker++;
                const isSelected = thisIndex === selectedIndex;
                return (
                  <div
                    className={`search-item ${isSelected ? "selected-search-item" : ""}`}
                    style={isSelected ? { background: "rgba(48, 219, 255, 0.12)", borderColor: "var(--cyan)" } : {}}
                    key={m.id || m._id}
                    onClick={() => {
                      onSelectMember?.(m);
                      onClose();
                    }}
                  >
                    <div>
                      <b>{highlightText(m.name, q)}</b>
                      <small style={{ display: "block", color: "var(--muted)", fontSize: "11px" }}>
                        {m.role || "Engineer"} · {m.employeeId ? `[${m.employeeId}] ` : ""}{m.email || ""}
                      </small>
                    </div>
                    <Tag tone={m.availabilityStatus === "available" ? "available" : "unavailable"}>{m.availabilityStatus || "Available"}</Tag>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function QuickActionsMenu({
  isOpen,
  onClose,
  userRole,
  onCreateTask,
  onCreateProject,
  onExportPdf,
  onExportExcel,
  onSync,
  Icon
}) {
  const isPMorAdmin = ["admin", "project_manager"].includes(userRole);
  const isLead = userRole === "team_lead";
  const isClient = userRole === "client";

  if (!isOpen) return null;

  return (
    <div className="quick-actions-menu" onClick={(e) => e.stopPropagation()}>
      {!isClient && (
        <button
          type="button"
          onClick={() => {
            onCreateTask?.();
            onClose();
          }}
        >
          <Icon name="plus" size={15} />
          Create New Task
        </button>
      )}

      {isPMorAdmin && (
        <button
          type="button"
          onClick={() => {
            onCreateProject?.();
            onClose();
          }}
        >
          <Icon name="briefcase" size={15} />
          Create New Project
        </button>
      )}

      {(isPMorAdmin || isLead || isClient) && (
        <button
          type="button"
          onClick={() => {
            onExportPdf?.();
            onClose();
          }}
        >
          <Icon name="download" size={15} />
          Export PDF Report
        </button>
      )}

      {(isPMorAdmin || isLead || isClient) && (
        <button
          type="button"
          onClick={() => {
            onExportExcel?.();
            onClose();
          }}
        >
          <Icon name="file" size={15} />
          Export Excel Data
        </button>
      )}

      <button
        type="button"
        onClick={() => {
          onSync?.();
          onClose();
        }}
      >
        <Icon name="refresh" size={15} />
        Sync Live Workspace
      </button>
    </div>
  );
}

export function SkillMatcherModal({
  isOpen,
  onClose,
  task,
  members = [],
  onAssign,
  Icon,
  Avatar,
  Tag
}) {
  if (!isOpen || !task) return null;

  // Derive required skills from title & description
  const text = `${task.title} ${task.description || ""}`.toLowerCase();
  const knownSkills = [
    "react", "node", "python", "mongodb", "docker", "aws", "typescript",
    "security", "frontend", "backend", "analytics", "ui/ux", "devops", "qa"
  ];
  const requiredSkills = knownSkills.filter((s) => text.includes(s));
  const reqList = requiredSkills.length > 0 ? requiredSkills : ["general delivery", "problem solving"];

  // Score members based on skill match and availability
  const scoredMembers = members.map((mem) => {
    const memSkills = (mem.skills || []).map((s) => s.toLowerCase());
    const matches = reqList.filter((rs) => memSkills.some((ms) => ms.includes(rs) || rs.includes(ms)));
    const matchPercent = Math.round((matches.length / reqList.length) * 100);
    const availabilityScore = mem.availabilityTone === "available" ? 100 : mem.availabilityTone === "busy" ? 60 : 20;
    const compositeScore = Math.round(matchPercent * 0.7 + availabilityScore * 0.3);
    return {
      member: mem,
      matches,
      matchPercent,
      compositeScore,
      workload: mem.workload || 0
    };
  }).sort((a, b) => b.compositeScore - a.compositeScore);

  return (
    <div className="modal-backdrop-pro" onClick={onClose}>
      <div className="modal-card-pro" style={{ maxWidth: "620px" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p className="eyebrow" style={{ margin: "0 0 4px" }}>AI SKILL-BASED ALLOCATION</p>
            <h3>Candidate Matching: {task.title}</h3>
          </div>
          <button type="button" className="text-button" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </div>

        <p>
          Target Project: <b>{task.projectName || "General"}</b> · Priority: <b>{task.priority || "Medium"}</b>
        </p>

        <div style={{ padding: "10px 14px", borderRadius: "8px", background: "rgba(14, 165, 233, 0.12)", border: "1px solid rgba(56, 189, 248, 0.3)" }}>
          <small style={{ color: "var(--cyan)", display: "block", marginBottom: "4px", fontWeight: "700" }}>REQUIRED COMPETENCIES DETECTED:</small>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {reqList.map((s) => (
              <span key={s} className="tag planning" style={{ fontSize: "11.5px" }}>{s}</span>
            ))}
          </div>
        </div>

        <div style={{ maxHeight: "320px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
          {scoredMembers.slice(0, 5).map(({ member: m, matchPercent, compositeScore, workload }) => (
            <div
              key={m.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                borderRadius: "8px",
                background: "rgba(8, 26, 54, 0.6)",
                border: "1px solid rgba(41, 184, 255, 0.2)"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <Avatar member={m} small />
                <div>
                  <b>{m.name}</b>
                  <small style={{ display: "block", color: "var(--muted)", fontSize: "11.5px" }}>
                    {m.role} · Workload: <b>{workload}%</b>
                  </small>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ textAlign: "right" }}>
                  <b style={{ color: compositeScore >= 70 ? "var(--green)" : "var(--cyan)", fontSize: "15px" }}>
                    {compositeScore}% Match
                  </b>
                  <small style={{ display: "block", color: "var(--muted)", fontSize: "10.5px" }}>
                    {matchPercent}% Skills · {m.availability}
                  </small>
                </div>

                <button
                  type="button"
                  className="primary"
                  style={{ fontSize: "12px", padding: "6px 12px" }}
                  onClick={() => {
                    onAssign?.(task, m);
                    onClose();
                  }}
                >
                  Assign Candidate
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AIApprovalModal({
  isOpen,
  onClose,
  recommendation,
  onApply,
  Icon
}) {
  if (!isOpen || !recommendation) return null;

  return (
    <div className="modal-backdrop-pro" onClick={onClose}>
      <div className="modal-card-pro" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p className="eyebrow" style={{ margin: "0 0 4px" }}>HUMAN-IN-THE-LOOP ADVISORY</p>
            <h3>Review AI Operational Proposal</h3>
          </div>
          <button type="button" className="text-button" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ padding: "12px 14px", borderRadius: "8px", background: "rgba(255, 110, 174, 0.12)", border: "1px solid rgba(255, 110, 174, 0.35)" }}>
            <small style={{ color: "#ff6eae", fontWeight: "700", display: "block", marginBottom: "4px" }}>IDENTIFIED BOTTLENECK / RISK:</small>
            <b style={{ fontSize: "14px", color: "#ffffff" }}>{recommendation.problem || recommendation.title || "Operational Risk Identified"}</b>
            <p style={{ margin: "4px 0 0", fontSize: "12.5px", color: "#dcebff" }}>
              {recommendation.evidence || recommendation.detail || "Empirical indicators derived from live delivery progress."}
            </p>
          </div>

          <div style={{ padding: "12px 14px", borderRadius: "8px", background: "rgba(48, 219, 255, 0.12)", border: "1px solid rgba(48, 219, 255, 0.35)" }}>
            <small style={{ color: "var(--cyan)", fontWeight: "700", display: "block", marginBottom: "4px" }}>HEURISTIC RECOMMENDATION &amp; REASONING:</small>
            <b style={{ fontSize: "14px", color: "#ffffff" }}>{recommendation.action || "Recommended Rebalance"}</b>
            <p style={{ margin: "4px 0 0", fontSize: "12.5px", color: "#dcebff" }}>
              {recommendation.reasoning || recommendation.reason || "Optimizes delivery velocity and levels developer utilization."}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "12px" }}>
          <button type="button" className="outline" onClick={onClose}>
            Dismiss Advisory
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              onApply?.(recommendation);
              onClose();
            }}
          >
            Confirm &amp; Apply Recommendation →
          </button>
        </div>
      </div>
    </div>
  );
}

export function ClientFeedbackModal({
  isOpen,
  onClose,
  deliverable,
  onSubmitFeedback,
  Icon
}) {
  const [rating, setRating] = useState("approved");
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmitFeedback?.({
        deliverableId: deliverable?.id || deliverable?._id,
        deliverableTitle: deliverable?.title || "Deliverable",
        rating,
        comments
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop-pro" onClick={onClose}>
      <div className="modal-card-pro" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p className="eyebrow" style={{ margin: "0 0 4px" }}>STAKEHOLDER REVIEW</p>
            <h3>Deliverable Feedback &amp; Sign-Off</h3>
          </div>
          <button type="button" className="text-button" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </div>

        {deliverable && (
          <p>
            Item: <b>{deliverable.title}</b> ({deliverable.projectName || "Active Project"})
          </p>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12.5px", color: "#cce4fb" }}>
            Review Decision:
            <select
              style={{
                padding: "8px 12px",
                borderRadius: "6px",
                background: "#081d3c",
                border: "1px solid rgba(41, 184, 255, 0.35)",
                color: "#ffffff",
                fontSize: "13px"
              }}
              value={rating}
              onChange={(e) => setRating(e.target.value)}
            >
              <option value="approved">✓ Approve Deliverable (Sign-Off)</option>
              <option value="revision_requested">⚠ Request Revision</option>
              <option value="feedback">💬 General Feedback</option>
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12.5px", color: "#cce4fb" }}>
            Feedback &amp; Stakeholder Notes:
            <textarea
              required
              rows={4}
              placeholder="Provide constructive feedback, approval comments, or required changes…"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              style={{
                padding: "10px 12px",
                borderRadius: "6px",
                background: "#081d3c",
                border: "1px solid rgba(41, 184, 255, 0.35)",
                color: "#ffffff",
                fontSize: "13px",
                resize: "vertical"
              }}
            />
          </label>

          <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "8px" }}>
            <button type="button" className="outline" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit Stakeholder Sign-Off →"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
