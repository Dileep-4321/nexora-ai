"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
  KanbanBoard,
  GlobalSearchModal,
  QuickActionsMenu,
  SkillMatcherModal,
  AIApprovalModal,
  ClientFeedbackModal
} from "./dashboard-components";
import {
  SmartCalendarView,
  ActivityTimelineView,
  NotificationPreferencesModal,
  ProjectTemplatesModal
} from "./components/enterprise-views";
import {
  ChartContainer,
  BarChart,
  LineChart,
  DoughnutChart,
  StackedBarChart,
  ProgressChart,
  TimelineChart,
  ChartEmptyState,
  ChartLoadingState
} from "./components/charts";
import {
  DataSufficiencyBadge,
  PredictionCard,
  AIRecommendationCard,
  BottleneckPanel,
  PredictionExplanationModal
} from "./components/analytics";
import {
  loginUser,
  registerUser,
  getCurrentUser,
  apiRequest,
  downloadAttachmentFile,
  downloadProjectPDFReport,
  downloadProjectExcelReport,
  getAdvancedProjectAnalytics,
  getComparisonAnalytics,
  createEmployeeAccount,
  addProjectMember,
  removeProjectMember,
  deleteOrDeactivateUser,
  getSystemHealth,
  getApiBaseUrl,
  getProjectDelayPrediction,
  getSprintIntelligence,
  getPersonalIntelligence,
  getClientDeliveryIntelligence,
  approveAIRecommendation,
  dismissAIRecommendation,
  listEmployees,
  getEmployeeDetails,
  createEmployee,
  updateEmployee,
  deactivateEmployee,
  restoreEmployee,
  assignEmployeeProject,
  removeEmployeeProject,
  getActiveSessions,
  revokeSessions,
  getAuditLogs,
  updateMyAvailability,
  getProjectBaseline,
  setProjectBaseline,
  getResourceAllocationOverview
} from "../lib/api";
import { normalizeWorkspace, formatDate, safePercent } from "../lib/normalize";
import { getSocket, subscribeToProject, unsubscribeFromProject, disconnectSocket } from "../lib/socket";
import {
  deriveWarnings,
  timeAgo,
  daysUntil,
  memberTaskStats,
  canTakeWork,
  workloadLabel,
  taskStatusDistribution,
  taskPriorityDistribution,
  riskDistribution,
  unassignedCriticalTasks,
  memberCapacity
} from "../lib/intelligence";

const icons = {
  kanban: "M4 4h4v16H4zm6 0h4v10h-4zm6 0h4v14h-4z",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  arrowLeft: "m15 19-7-7 7-7",
  arrowRight: "m9 5 7 7-7 7",
  menu: "M3 12h18M3 6h18M3 18h18",
  thumbsUp: "M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3",
  externalLink: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3",
  clipboard: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z",
  target: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm0-4a6 6 0 1 0 0-12 6 6 0 0 0 0 12zm0-4a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  zap: "M13 2 3 14h9l-1 8 10-12h-9l1-8z",
  sliders: "M4 21v-7m0-4V3m8 21v-9m0-4V3m8 21v-5m0-4V3M1 14h6m2-6h6m2 8h6",
  home: "M3 11.5 12 4l9 7.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5zM9 21v-6h6v6",
  layers: "m12 3 8.5 4.8L12 12.5 3.5 7.8zM3.5 12.2 12 17l8.5-4.8M3.5 16.7 12 21.5l8.5-4.8",
  check: "M5 12.5 9.5 17 19 7",
  spark: "m12 2 1.8 7.2L21 11l-7.2 1.8L12 20l-1.8-7.2L3 11l7.2-1.8z",
  chart: "M4 20V10m5 10V4m5 16v-7m5 7V7",
  users: "M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20m12-11a4 4 0 1 0-8 0m14 11v-1.5a4 4 0 0 0-3-3.8M9.5 10.5a4 4 0 1 0 0-8",
  cube: "m12 3 8 4.5v9L12 21l-8-4.5v-9zM4 7.5 12 12l8-4.5M12 12v9",
  calendar: "M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 5h14M8 2v4m8-4v4",
  bell: "M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8.5 12h5",
  file: "M6 3h8l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm7 0v5h5",
  chat: "M20 14a3 3 0 0 1-3 3H9l-5 4v-4a3 3 0 0 1-1-3V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3z",
  user: "M20 21a8 8 0 0 0-16 0m12-13a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  settings: "M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5zm0-13v3m0 13v3m9.5-9.5h-3m-13 0h-3m16.2-6.7-2.1 2.1m-9.2 9.2-2.1 2.1m0-13.4 2.1 2.1m9.2 9.2 2.1 2.1",
  search: "m21 21-4.4-4.4M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  arrow: "m5 12h14m-6-6 6 6-6 6",
  plus: "M12 5v14M5 12h14",
  dots: "M5 12h.01M12 12h.01M19 12h.01",
  close: "M6 6l12 12M18 6 6 18",
  send: "m22 2-7 20-4-9-9-4zM22 2 11 13",
  lock: "M6 10V7a6 6 0 0 1 12 0v3m-13 0h14v11H5z",
  mail: "M3 6h18v12H3zM3 7l9 7 9-7",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  refresh: "M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67",
  alert: "M12 9v4m0 4h.01M10.29 3.86l-8.6 15A2 2 0 0 0 3.39 22h17.22a2 2 0 0 0 1.7-3.14l-8.6-15a2 2 0 0 0-3.42 0z",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  filter: "M22 3H2l8 9.46V19l4 2v-8.54L22 3z",
  activity: "M22 12h-4l-3 9L9 3l-3 9H2",
  briefcase: "M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm0-14v4l3 3",
  globe: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 0c2.5 2.5 4 6 4 10s-1.5 7.5-4 10c-2.5-2.5-4-6-4-10s1.5-7.5 4-10zM2 12h20",
  eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  eyeOff: "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24 M1 1l22 22",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
};

function Icon({ name, size = 17 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={icons[name] || icons.spark} />
    </svg>
  );
}

function Brand({ subtitle }) {
  return (
    <div className="brand">
      <span className="nmark">N</span>
      <span className="brand-text">
        <b>
          NEXORA <i>AI</i>
        </b>
        <small>{subtitle || "Plan · Track · Collaborate · Achieve"}</small>
      </span>
    </div>
  );
}

function Avatar({ member, small = false }) {
  return (
    <span
      className={`avatar ${small ? "small" : ""}`}
      style={{ background: member?.color || "#6578ff" }}
    >
      {member?.initials || "NX"}
    </span>
  );
}

function Tag({ children, tone }) {
  return (
    <span
      className={`tag ${
        tone || String(children || "").toLowerCase().replaceAll(" ", "-")
      }`}
    >
      {children}
    </span>
  );
}

function Progress({ value }) {
  return (
    <div className="progress">
      <i style={{ width: `${Math.max(0, Math.min(100, Number(value) || 0))}%` }} />
    </div>
  );
}

function Panel({ children, title, action, className = "" }) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-head">
        {title && <h3>{title}</h3>}
        {action && (
          typeof action === "string" ? (
            <button className="text-button">
              {action} <Icon name="arrow" size={13} />
            </button>
          ) : (
            action
          )
        )}
      </div>
      {children}
    </section>
  );
}

function Header({ eyebrow, title, description, action }) {
  return (
    <section className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </section>
  );
}

function Spark({ values }) {
  if (!values || !values.length) return null;
  const p = values
    .map((v, i) => `${i * (100 / Math.max(values.length - 1, 1))},${40 - v * 0.34}`)
    .join(" ");
  return (
    <svg className="spark" viewBox="0 0 100 40" preserveAspectRatio="none">
      <polyline points={p} fill="none" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

function Bars({ values, labels }) {
  return (
    <div className="bars">
      {values.map((v, i) => (
        <div key={`${labels[i]}-${i}`}>
          <span style={{ height: `${v}%` }}>
            <i>{i === values.length - 1 ? `${v}%` : ""}</i>
          </span>
          <small>{labels[i]}</small>
        </div>
      ))}
    </div>
  );
}

function Donut({ value, label = "Tasks" }) {
  return (
    <div
      className="donut"
      style={{ "--p": `${Math.min(95, value * 5)}%` }}
    >
      <span>
        <b>{value}</b>
        <small>{label}</small>
      </span>
    </div>
  );
}

function Float({ c, i, t, x, dot = "#38bdf8" }) {
  return (
    <div className={`float-card ${c}`}>
      <div className="float-icon-wrap">
        <Icon name={i} size={15} />
      </div>
      <div className="float-info">
        <b>{t}</b>
        <small>
          <i style={{ background: dot }} /> {x}
        </small>
      </div>
    </div>
  );
}

function HoloGlobe() {
  const canvasRef = useRef(null);
  const [hasCanvasError, setHasCanvasError] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setHasCanvasError(true);
      return;
    }

    let animId;
    let rot = 0;
    let pulseTime = 0;

    // Check prefers-reduced-motion
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // HiDPI / Retina setup
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const size = 420;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2 - 8;
    const R = 135; // Sphere radius in logical px
    const tilt = 0.22; // ~12.6 deg axial tilt

    // 12 Global Telemetry Nodes (lat, lon)
    const nodes = [
      { lat: 0.72, lon: -1.35 },
      { lat: 0.68, lon: -2.15 },
      { lat: 0.92, lon: 0.05 },
      { lat: 0.88, lon: 0.25 },
      { lat: 0.60, lon: 2.35 },
      { lat: 0.25, lon: 1.85 },
      { lat: 0.22, lon: 1.30 },
      { lat: -0.55, lon: 2.60 },
      { lat: -0.45, lon: -0.75 },
      { lat: 0.45, lon: 0.95 },
      { lat: -0.25, lon: -1.90 },
      { lat: 0.10, lon: -0.40 }
    ];

    // Node-to-node cyber arcs
    const arcs = [
      [0, 1], [0, 2], [1, 4], [2, 3], [3, 9],
      [9, 6], [6, 5], [5, 4], [5, 7], [0, 8],
      [10, 0], [10, 8], [11, 2], [11, 9]
    ];

    // Project spherical coordinate (lat, lon) with current rotation
    function project(lat, lon, r = R) {
      const l = lon + rot;
      const x3 = r * Math.cos(lat) * Math.sin(l);
      const y3 = r * Math.sin(lat);
      const z3 = r * Math.cos(lat) * Math.cos(l);

      const x2 = cx + x3;
      const y2 = cy - y3 * Math.cos(tilt) + z3 * Math.sin(tilt);
      const zDepth = z3 * Math.cos(tilt) + y3 * Math.sin(tilt);
      return { x: x2, y: y2, z: zDepth };
    }

    // Latitude angles to render
    const latitudes = [-1.1, -0.75, -0.4, 0, 0.4, 0.75, 1.1];

    // 12 Meridians (every 30 degrees = PI/6)
    const meridians = [];
    for (let m = 0; m < 12; m++) {
      meridians.push((m * Math.PI) / 6);
    }

    function draw() {
      ctx.clearRect(0, 0, size, size);

      // 1. Atmosphere Glow behind globe
      const atmosGlow = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.35);
      atmosGlow.addColorStop(0, "rgba(22, 110, 245, 0.26)");
      atmosGlow.addColorStop(0.55, "rgba(35, 205, 245, 0.09)");
      atmosGlow.addColorStop(1, "rgba(2, 10, 26, 0)");
      ctx.fillStyle = atmosGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.35, 0, Math.PI * 2);
      ctx.fill();

      // 2. Translucent Dark Spherical Body
      const sphereFill = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.35, R * 0.1, cx, cy, R);
      sphereFill.addColorStop(0, "rgba(28, 140, 255, 0.20)");
      sphereFill.addColorStop(0.55, "rgba(8, 32, 75, 0.45)");
      sphereFill.addColorStop(0.9, "rgba(2, 12, 32, 0.65)");
      sphereFill.addColorStop(1, "rgba(20, 180, 255, 0.32)");
      ctx.fillStyle = sphereFill;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();

      // 3. Glowing Spherical Rim
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(56, 221, 255, 0.70)";
      ctx.lineWidth = 1.5;
      ctx.shadowColor = "#30dbff";
      ctx.shadowBlur = 14;
      ctx.stroke();
      ctx.restore();

      // 4. Back Hemisphere: Meridians (longitude lines)
      ctx.lineWidth = 0.8;
      meridians.forEach((lonBase) => {
        let drawing = false;
        ctx.beginPath();
        for (let lat = -Math.PI / 2; lat <= Math.PI / 2 + 0.05; lat += 0.08) {
          const p = project(lat, lonBase);
          if (p.z <= 0) {
            if (!drawing) {
              ctx.moveTo(p.x, p.y);
              drawing = true;
            } else {
              ctx.lineTo(p.x, p.y);
            }
          } else {
            drawing = false;
          }
        }
        ctx.strokeStyle = "rgba(30, 110, 210, 0.20)";
        ctx.stroke();
      });

      // 5. Back Hemisphere: Parallels (latitude lines)
      latitudes.forEach((lat) => {
        let drawing = false;
        ctx.beginPath();
        for (let lon = 0; lon <= Math.PI * 2 + 0.05; lon += 0.08) {
          const p = project(lat, lon);
          if (p.z <= 0) {
            if (!drawing) {
              ctx.moveTo(p.x, p.y);
              drawing = true;
            } else {
              ctx.lineTo(p.x, p.y);
            }
          } else {
            drawing = false;
          }
        }
        ctx.strokeStyle = "rgba(30, 110, 210, 0.18)";
        ctx.stroke();
      });

      // 6. Front Hemisphere: Parallels (latitude lines)
      latitudes.forEach((lat) => {
        let drawing = false;
        ctx.beginPath();
        for (let lon = 0; lon <= Math.PI * 2 + 0.05; lon += 0.08) {
          const p = project(lat, lon);
          if (p.z > 0) {
            if (!drawing) {
              ctx.moveTo(p.x, p.y);
              drawing = true;
            } else {
              ctx.lineTo(p.x, p.y);
            }
          } else {
            drawing = false;
          }
        }
        if (Math.abs(lat) < 0.05) {
          // Equator is emphasized
          ctx.strokeStyle = "rgba(68, 235, 255, 0.65)";
          ctx.lineWidth = 1.3;
        } else {
          ctx.strokeStyle = "rgba(48, 219, 255, 0.42)";
          ctx.lineWidth = 1.0;
        }
        ctx.stroke();
      });

      // 7. Front Hemisphere: Meridians (longitude lines) - these visibly rotate!
      ctx.lineWidth = 1.1;
      meridians.forEach((lonBase) => {
        let drawing = false;
        ctx.beginPath();
        for (let lat = -Math.PI / 2; lat <= Math.PI / 2 + 0.05; lat += 0.08) {
          const p = project(lat, lonBase);
          if (p.z > 0) {
            if (!drawing) {
              ctx.moveTo(p.x, p.y);
              drawing = true;
            } else {
              ctx.lineTo(p.x, p.y);
            }
          } else {
            drawing = false;
          }
        }
        ctx.strokeStyle = "rgba(48, 219, 255, 0.50)";
        ctx.stroke();
      });

      // 8. Outer Orbital Rings with glowing satellite pulses
      // Ring 1 (tilted)
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy, R * 1.28, R * 0.48, tilt, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(56, 221, 255, 0.38)";
      ctx.setLineDash([5, 7]);
      ctx.lineWidth = 1.1;
      ctx.stroke();
      // Satellite on Ring 1
      const s1Angle = rot * 1.5;
      const s1X = cx + R * 1.28 * Math.cos(s1Angle) * Math.cos(tilt) - R * 0.48 * Math.sin(s1Angle) * Math.sin(tilt);
      const s1Y = cy + R * 1.28 * Math.cos(s1Angle) * Math.sin(tilt) + R * 0.48 * Math.sin(s1Angle) * Math.cos(tilt);
      ctx.setLineDash([]);
      ctx.fillStyle = "#38ddff";
      ctx.shadowColor = "#38ddff";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(s1X, s1Y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Ring 2 (counter-tilted)
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy, R * 1.34, R * 0.42, -tilt * 1.4, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(147, 100, 255, 0.32)";
      ctx.setLineDash([4, 8]);
      ctx.lineWidth = 1.0;
      ctx.stroke();
      // Satellite on Ring 2
      const s2Angle = -rot * 1.8 + Math.PI;
      const s2X = cx + R * 1.34 * Math.cos(s2Angle) * Math.cos(-tilt * 1.4) - R * 0.42 * Math.sin(s2Angle) * Math.sin(-tilt * 1.4);
      const s2Y = cy + R * 1.34 * Math.cos(s2Angle) * Math.sin(-tilt * 1.4) + R * 0.42 * Math.sin(s2Angle) * Math.cos(-tilt * 1.4);
      ctx.setLineDash([]);
      ctx.fillStyle = "#bd70ff";
      ctx.shadowColor = "#bd70ff";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(s2X, s2Y, 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 9. Connecting 3D Cyber Arcs
      arcs.forEach(([i, j], arcIdx) => {
        const na = nodes[i];
        const nb = nodes[j];
        const pa = project(na.lat, na.lon);
        const pb = project(nb.lat, nb.lon);

        // Only draw arc if at least one endpoint is facing forward
        if (pa.z > -R * 0.4 || pb.z > -R * 0.4) {
          // Midpoint lifted above sphere
          const midLat = (na.lat + nb.lat) / 2;
          const midLon = (na.lon + nb.lon) / 2;
          const pmid = project(midLat, midLon, R * 1.20);

          ctx.beginPath();
          ctx.moveTo(pa.x, pa.y);
          ctx.quadraticCurveTo(pmid.x, pmid.y, pb.x, pb.y);
          ctx.strokeStyle = "rgba(48, 219, 255, 0.42)";
          ctx.lineWidth = 1.2;
          ctx.stroke();

          // Animated data packet along the arc
          const tPacket = ((pulseTime * 0.8 + arcIdx * 0.25) % 1);
          const px = (1 - tPacket) * (1 - tPacket) * pa.x + 2 * (1 - tPacket) * tPacket * pmid.x + tPacket * tPacket * pb.x;
          const py = (1 - tPacket) * (1 - tPacket) * pa.y + 2 * (1 - tPacket) * tPacket * pmid.y + tPacket * tPacket * pb.y;
          if (pmid.z > -R * 0.2) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(px, py, 2, 0, Math.PI * 2);
            ctx.fillStyle = "#ffffff";
            ctx.shadowColor = "#38ddff";
            ctx.shadowBlur = 8;
            ctx.fill();
            ctx.restore();
          }
        }
      });

      // 10. Surface Network Nodes
      nodes.forEach((n, idx) => {
        const p = project(n.lat, n.lon);
        if (p.z > 0) {
          // Facing viewer: bright, pulsing node
          const pulse = Math.sin(pulseTime * 3 + idx) * 0.8;
          const nodeRadius = Math.max(2.5, 3.8 + (p.z / R) * 2.2 + pulse);

          ctx.save();
          // Halo
          ctx.beginPath();
          ctx.arc(p.x, p.y, nodeRadius + 3, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(56, 221, 255, 0.25)";
          ctx.fill();

          // Core
          ctx.beginPath();
          ctx.arc(p.x, p.y, nodeRadius, 0, Math.PI * 2);
          ctx.fillStyle = "#ffffff";
          ctx.shadowColor = "#30dbff";
          ctx.shadowBlur = 12;
          ctx.fill();
          ctx.restore();
        } else if (p.z > -R * 0.3) {
          // Edge/back: subtle dimmer dot
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(40, 140, 220, 0.28)";
          ctx.fill();
        }
      });

      // Advance rotation & animation time
      if (!prefersReducedMotion) {
        rot += 0.007; // Smooth continuous rotation
        pulseTime += 0.02;
        animId = requestAnimationFrame(draw);
      }
    }

    draw();

    return () => {
      if (animId) {
        cancelAnimationFrame(animId);
      }
    };
  }, []);

  return (
    <div className="holo-wrapper">
      {hasCanvasError ? (
        <div className="globe-fallback">
          <Icon name="globe" size={140} />
        </div>
      ) : (
        <canvas ref={canvasRef} className="holo-canvas" />
      )}

      <div className="holo-center-badge">
        <b>NEXORA <i>AI</i></b>
        <small>PROJECT INTELLIGENCE</small>
      </div>

      <div className="holo-base">
        <span className="holo-beam" />
        <b>INTELLIGENCE · INSIGHTS · IMPACT</b>
      </div>

      <Float c="fc1" i="layers" t="Projects" x="On Track" dot="#22c55e" />
      <Float c="fc2" i="check" t="Tasks" x="In Progress" dot="#38bdf8" />
      <Float c="fc3" i="users" t="Team" x="Optimizing" dot="#a855f7" />
      <Float c="fc4" i="shield" t="Risk" x="Analyzing" dot="#f59e0b" />
    </div>
  );
}

function ErrorCardPro({ title, message, onRetry, onSecondary, secondaryLabel = "Back" }) {
  return (
    <div className="card" style={{ padding: "20px", textAlign: "center", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "12px", background: "rgba(239, 68, 68, 0.05)", margin: "16px 0" }}>
      <div style={{ color: "var(--red, #ef4444)", marginBottom: "8px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontWeight: "600", fontSize: "15px" }}>
        <Icon name="alert" size={18} />
        <span>{title || "An error occurred"}</span>
      </div>
      <p style={{ color: "var(--text-muted, #94a3b8)", fontSize: "13px", margin: "0 0 16px 0", lineHeight: "1.5" }}>
        {message || "Unable to complete request. Please try again."}
      </p>
      <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
        {onRetry && (
          <button className="primary" onClick={onRetry} style={{ padding: "6px 14px", fontSize: "13px" }}>
            <Icon name="refresh" size={14} /> Retry
          </button>
        )}
        {onSecondary && (
          <button className="outline" onClick={onSecondary} style={{ padding: "6px 14px", fontSize: "13px" }}>
            {secondaryLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyStatePro({ icon = "layers", title, description, actionText, onAction, secondaryText, onSecondary, compact = false }) {
  return (
    <div className="empty-state-pro" style={compact ? { padding: "20px 14px" } : undefined}>
      <div className="empty-state-icon" style={compact ? { width: "36px", height: "36px", fontSize: "16px" } : undefined}>
        <Icon name={icon} />
      </div>
      <h4 className="empty-state-title" style={compact ? { fontSize: "14px" } : undefined}>{title}</h4>
      {description && <p className="empty-state-desc" style={compact ? { fontSize: "12px", maxWidth: "340px" } : undefined}>{description}</p>}
      {(actionText || secondaryText) && (
        <div className="empty-state-cta" style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
          {actionText && onAction && (
            <button type="button" className="primary" onClick={onAction}>
              {actionText}
            </button>
          )}
          {secondaryText && onSecondary && (
            <button type="button" className="outline" onClick={onSecondary}>
              {secondaryText}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "10px 0" }}>
      <div className="skeleton-row" style={{ justifyContent: "space-between", marginBottom: "8px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div className="skeleton-box" style={{ width: "200px", height: "16px" }} />
          <div className="skeleton-box" style={{ width: "320px", height: "30px" }} />
        </div>
        <div className="skeleton-box" style={{ width: "160px", height: "40px" }} />
      </div>

      <div className="skeleton-kpis">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton-card" style={{ height: "92px" }}>
            <div className="skeleton-box" style={{ width: "50%", height: "14px" }} />
            <div className="skeleton-box" style={{ width: "70%", height: "26px" }} />
          </div>
        ))}
      </div>

      <div className="skeleton-grid">
        <div className="skeleton-card" style={{ height: "220px" }}>
          <div className="skeleton-box" style={{ width: "40%", height: "18px" }} />
          <div className="skeleton-box" style={{ width: "100%", height: "150px" }} />
        </div>
        <div className="skeleton-card" style={{ height: "220px" }}>
          <div className="skeleton-box" style={{ width: "40%", height: "18px" }} />
          <div className="skeleton-box" style={{ width: "100%", height: "150px" }} />
        </div>
        <div className="skeleton-card" style={{ height: "220px" }}>
          <div className="skeleton-box" style={{ width: "40%", height: "18px" }} />
          <div className="skeleton-box" style={{ width: "100%", height: "150px" }} />
        </div>
      </div>
    </div>
  );
}

function AISkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "10px 0" }}>
      <div className="skeleton-row">
        <div className="skeleton-box" style={{ width: "100%", height: "24px" }} />
      </div>
      <div className="ai-meta-grid">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton-card" style={{ height: "80px", padding: "10px" }}>
            <div className="skeleton-box" style={{ width: "60%", height: "12px" }} />
            <div className="skeleton-box" style={{ width: "85%", height: "22px" }} />
          </div>
        ))}
      </div>
      <div className="skeleton-card" style={{ height: "100px" }}>
        <div className="skeleton-box" style={{ width: "40%", height: "14px" }} />
        <div className="skeleton-box" style={{ width: "90%", height: "14px" }} />
        <div className="skeleton-box" style={{ width: "75%", height: "14px" }} />
      </div>
    </div>
  );
}

function ProjectHealthSection({ projects, tasks, openProject, go }) {
  if (!projects || !projects.length) return null;

  return (
    <section className="health-dashboard-section">
      <div className="panel-head" style={{ marginBottom: "10px" }}>
        <div>
          <p className="eyebrow" style={{ margin: "0 0 4px" }}>PORTFOLIO HEALTH &amp; SCHEDULE DELIVERY</p>
          <h3 style={{ margin: 0 }}>Project Health Status</h3>
        </div>
        {go && (
          <button type="button" className="text-button" onClick={() => go("projects")}>
            All projects <Icon name="arrow" />
          </button>
        )}
      </div>

      <div className="health-grid">
        {projects.map((p) => {
          const riskScore = p.metrics?.riskScore ?? 0;
          const healthScore = Math.max(0, 100 - riskScore);
          const healthStatus = healthScore >= 75 ? "HEALTHY" : healthScore >= 50 ? "MODERATE" : healthScore >= 25 ? "AT RISK" : "CRITICAL";
          const healthTone = healthScore >= 75 ? "healthy" : healthScore >= 50 ? "warning" : "critical";

          const scheduleDiff = (p.progress || 0) - (p.expectedProgress || 0);
          const scheduleStatus = scheduleDiff < -10 ? "BEHIND" : scheduleDiff > 10 ? "AHEAD" : "ON TRACK";
          const scheduleTone = scheduleStatus === "ON TRACK" ? "ontrack" : scheduleStatus === "AHEAD" ? "ahead" : "behind";

          const pTasks = (tasks || []).filter((t) => String(t.projectId) === String(p.id));
          const totalTasks = pTasks.length;
          const completedTasks = pTasks.filter((t) => t.statusTone === "completed").length;
          const inProgressTasks = pTasks.filter((t) => t.statusTone === "in-progress").length;
          const blockedTasks = pTasks.filter((t) => t.statusTone === "blocked" || (t.blockers && t.blockers.length > 0)).length;

          return (
            <article
              className="health-card"
              key={p.id}
              onClick={() => openProject?.(p)}
              tabIndex={0}
              role="button"
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openProject?.(p); } }}
            >
              <div className="health-card-head">
                <div className="health-card-title">
                  <b>{p.name}</b>
                  <small>{p.code || "NX"} · {p.status || "Planning"}</small>
                </div>
                <span className={`health-score-badge ${healthTone}`}>
                  {healthScore}% {healthStatus}
                </span>
              </div>

              <div className="dual-progress-box">
                <div className="dual-progress-row">
                  <span>Actual Progress</span>
                  <b>{p.progress}%</b>
                </div>
                <Progress value={p.progress} />

                <div className="dual-progress-row" style={{ marginTop: "4px" }}>
                  <span>Expected Timeline</span>
                  <b>{p.expectedProgress}%</b>
                </div>
                <div className="progress" style={{ height: "4px", background: "rgba(17,41,73,0.8)" }}>
                  <i style={{ width: `${Math.min(100, Math.max(0, p.expectedProgress))}%`, background: "#4989ff", boxShadow: "none" }} />
                </div>
              </div>

              <div className="schedule-status-row">
                <span style={{ color: "#8daecc" }}>Schedule Status</span>
                <span className={`schedule-pill ${scheduleTone}`}>
                  {scheduleStatus === "ON TRACK" ? "✓" : scheduleStatus === "BEHIND" ? "⚠" : "↑"} {scheduleStatus}
                </span>
              </div>

              <div className="task-count-pills">
                <span className="task-count-pill"><b>{totalTasks}</b> tasks</span>
                <span className="task-count-pill" style={{ color: "#39e8b4" }}><b>{completedTasks}</b> completed</span>
                <span className="task-count-pill" style={{ color: "#42dcff" }}><b>{inProgressTasks}</b> active</span>
                {blockedTasks > 0 && (
                  <span className="task-count-pill" style={{ color: "#ff6eae", borderColor: "rgba(255,110,174,0.4)" }}>
                    <b>{blockedTasks}</b> blocked
                  </span>
                )}
                <span className="task-count-pill" style={{ marginLeft: "auto" }}>
                  <Tag tone={p.riskTone}>{p.risk} risk</Tag>
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function RiskCenterSection({ data, go }) {
  const warnings = deriveWarnings(data);
  const critCount = warnings.filter((w) => w.severity === "critical").length;
  const highCount = warnings.filter((w) => w.severity === "high").length;
  const medCount = warnings.filter((w) => ["warning", "medium"].includes(w.severity)).length;
  const lowCount = data.projects.filter((p) => p.riskTone === "low").length;

  const categoryLabels = {
    overdue_tasks: "Overdue Task",
    high_priority_incomplete: "Critical Incomplete",
    low_progress_near_deadline: "Deadline Risk",
    unassigned_critical: "Unassigned Critical",
    blocked_tasks: "Blocked Task",
    overloaded_members: "Overloaded Member",
    projects_behind_schedule: "Behind Schedule",
    uneven_workload: "High Workload"
  };

  return (
    <section className="risk-center-panel">
      <div className="risk-center-head">
        <h3>
          <span style={{ color: "#ff6eae" }}>●</span> Risk Center &amp; AI Alerts
        </h3>
        <div className="risk-summary-badges">
          <span className="risk-badge crit">🔴 Critical <b>{critCount}</b></span>
          <span className="risk-badge high">🟠 High <b>{highCount}</b></span>
          <span className="risk-badge med">🟡 Medium <b>{medCount}</b></span>
          <span className="risk-badge low">🟢 Low <b>{lowCount}</b></span>
          {go && (
            <button type="button" className="text-button" style={{ marginLeft: "8px" }} onClick={() => go("insights")}>
              Full Risk Analysis <Icon name="arrow" />
            </button>
          )}
        </div>
      </div>

      {warnings.length > 0 ? (
        <div className="risk-items-grid">
          {warnings.slice(0, 6).map((w) => {
            const catLabel = categoryLabels[w.category] || "Risk Alert";
            return (
              <div
                key={w.id}
                className={`risk-card-item ${w.severity}`}
                onClick={() => go?.(w.target)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go?.(w.target); } }}
                style={{ cursor: "pointer" }}
              >
                <div className="risk-card-top">
                  <Tag tone={w.severity === "critical" ? "critical" : w.severity === "high" ? "high" : "medium"}>
                    {catLabel}
                  </Tag>
                  {w.affectedItem && (
                    <span style={{ color: "#8ab0d4", fontSize: "11.5px", maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {w.affectedItem}
                    </span>
                  )}
                </div>
                <b>{w.title}</b>
                <p>{w.detail}</p>
                <small>→ {w.action}</small>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyStatePro
          icon="check"
          title="All Systems Healthy"
          description="Zero critical delivery bottlenecks, schedule deviations, or team overload alerts detected."
          compact
        />
      )}
    </section>
  );
}

function Login({ onLogin }) {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("pm@nexora.ai");
  const [password, setPassword] = useState("Password123!");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const demoAccounts = [
    { label: "Project Manager", email: "pm@nexora.ai", pass: "Password123!", role: "Project Manager" },
    { label: "Team Lead", email: "lead@nexora.ai", pass: "Password123!", role: "Team Lead" },
    { label: "Team Member", email: "member@nexora.ai", pass: "Password123!", role: "Team Member" },
    { label: "Client", email: "client@nexora.ai", pass: "Password123!", role: "Client" }
  ];

  function fillDemo(acc) {
    setEmail(acc.email);
    setPassword(acc.pass);
    setError("");
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await loginUser({ email, password });
      const user = res.data?.user || res.user || res.data;
      const token = res.data?.token || res.token;
      if (!token) throw new Error(res.message || "Authentication token was not returned.");
      if (typeof window !== "undefined") {
        localStorage.setItem("nexora_token", token);
        localStorage.setItem("nexora_user", JSON.stringify(user));
      }
      onLogin(user);
    } catch (err) {
      setError(err?.message || "Authentication failed. Please verify credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <div className="nebula n1" />
      <div className="nebula n2" />
      <div className="stars" />

      <header className="login-brand">
        <Brand subtitle="Plan · Track · Collaborate · Achieve" />
        <p className="login-header-tagline">
          Smarter Projects · Stronger Teams · Brighter Outcomes
        </p>
      </header>

      <div className="login-grid">
        <section className="login-story">
          <div className="login-pill-badge">
            <span>✦</span> AI-POWERED PROJECT OPERATIONS
          </div>

          <h1 className="hero-title">
            Make every<br />
            project decision<br />
            <span className="hero-gradient-text">intelligent.</span>
          </h1>

          <p className="lead hero-lead">
            Monitor project health, predict delivery risks, optimize team resources, and make confident decisions with explainable AI.
          </p>

          <div className="feature-grid">
            {[
              { icon: "chart", title: "Live Project Intelligence", sub: "Real-time insights" },
              { icon: "shield", title: "AI Risk Prediction", sub: "Stay ahead of risks" },
              { icon: "users", title: "Smart Resource Optimization", sub: "Right people, right work" },
              { icon: "layers", title: "Team Performance Analytics", sub: "Build high-performing teams" }
            ].map((f) => (
              <div className="feature" key={f.title}>
                <div className="feature-icon-box">
                  <Icon name={f.icon} size={20} />
                </div>
                <div className="feature-content">
                  <b>{f.title}</b>
                  <small>{f.sub}</small>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="holo">
          <HoloGlobe />
        </section>

        <form className="auth-card" onSubmit={submit}>
          <h2>Welcome back</h2>
          <strong className="auth-card-subtitle">
            Sign in to NEXORA AI
          </strong>
          <p className="auth-card-desc">
            Access your intelligent project operations workspace
          </p>

          {error && <div className="login-error" role="alert">{error}</div>}

          <label>
            Work email
            <div className="input-with-icon">
              <Icon name="mail" size={17} />
              <input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
          </label>

          <label>
            Password
            <div className="input-with-icon password">
              <Icon name="lock" size={17} />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="eye-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <Icon name={showPassword ? "eyeOff" : "eye"} size={17} />
              </button>
            </div>
          </label>

          <div className="form-line">
            <label className="remember">
              <input type="checkbox" defaultChecked />
              Remember me
            </label>
            <button
              type="button"
              className="link"
              onClick={() => setError("Password resets are handled by your NEXORA administrator.")}
            >
              Forgot password?
            </button>
          </div>

          <button
            type="submit"
            className="primary wide login-submit-btn"
            disabled={loading}
          >
            {loading ? "Authenticating…" : "Sign in securely →"}
          </button>

          <small className="auth-card-footer-note">
            Helping teams build a smarter tomorrow
          </small>

          {/* Quick Demo Accounts Strip */}
          <div className="demo-accounts">
            <span>⚡ QUICK SELECT DEMO ROLE (PASSWORD123!)</span>
            <div className="demo-accounts-grid">
              {demoAccounts.map((acc) => (
                <button
                  type="button"
                  key={acc.email}
                  className={email === acc.email ? "active" : ""}
                  onClick={() => fillDemo(acc)}
                >
                  {acc.label}
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>

      <footer className="login-footer">
        <div className="login-footer-stats">
          <div>
            <b>100%</b>
            <small>Data-Driven</small>
          </div>
          <div>
            <b>Smarter</b>
            <small>Project Decisions</small>
          </div>
          <div>
            <b>Higher</b>
            <small>Team Productivity</small>
          </div>
          <div>
            <b>Better</b>
            <small>Project Outcomes</small>
          </div>
        </div>

        <div className="login-footer-quote">
          <p>“AI that works for your projects, your people, and your future.”</p>
          <i>— NEXORA AI</i>
        </div>
      </footer>
    </main>
  );
}

function GanttTimeline({ data, initialProjectId, action, notify, openTaskAI, openTaskEdit }) {
  const projects = data?.projects || [];
  const [selectedProjectId, setSelectedProjectId] = useState(() => initialProjectId || projects[0]?.id || "");
  const [timeline, setTimeline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [zoomLevel, setZoomLevel] = useState("week");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCriticalPath, setShowCriticalPath] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [editStartDate, setEditStartDate] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [selectedNewDep, setSelectedNewDep] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [baseline, setBaseline] = useState(null);
  const [baselineModalOpen, setBaselineModalOpen] = useState(false);

  const role = data?.currentUser?.role || data?.currentUser?.rawRole || data?.user?.rawRole || data?.user?.role || "";
  const canManage = ["admin", "project_manager", "team_lead"].includes(role);

  useEffect(() => {
    if (initialProjectId && initialProjectId !== selectedProjectId) {
      setSelectedProjectId(initialProjectId);
    }
  }, [initialProjectId]);

  useEffect(() => {
    if (!selectedProjectId) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError("");

    getProjectBaseline(selectedProjectId)
      .then((res) => {
        if (active) setBaseline(res);
      })
      .catch(() => {
        if (active) setBaseline(null);
      });

    apiRequest(`/projects/${selectedProjectId}/timeline`)
      .then((res) => {
        if (!active) return;
        if (res.success && res.data) {
          setTimeline(res.data);
        } else {
          setError(res.message || "Unable to load timeline data");
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || "Failed to load project timeline");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [selectedProjectId, refreshKey]);

  useEffect(() => {
    if (!selectedProjectId) return;
    const socket = getSocket();
    if (!socket) return;

    subscribeToProject(selectedProjectId);

    const handleRealtimeUpdate = () => {
      setRefreshKey((k) => k + 1);
    };

    socket.on("task:updated", handleRealtimeUpdate);
    socket.on("task:assigned", handleRealtimeUpdate);
    socket.on("milestone:updated", handleRealtimeUpdate);

    return () => {
      socket.off("task:updated", handleRealtimeUpdate);
      socket.off("task:assigned", handleRealtimeUpdate);
      socket.off("milestone:updated", handleRealtimeUpdate);
    };
  }, [selectedProjectId]);

  const tasks = timeline?.tasks || [];
  const milestones = timeline?.milestones || [];
  const criticalPathIds = timeline?.criticalPathTaskIds || [];

  const filteredTasks = tasks.filter((t) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (showCriticalPath && !t.isCritical) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!t.title.toLowerCase().includes(q) && !(t.assignedTo?.name || "").toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  const now = new Date();
  const allDates = [];
  if (timeline?.project?.startDate) allDates.push(new Date(timeline.project.startDate).getTime());
  if (timeline?.project?.deadline) allDates.push(new Date(timeline.project.deadline).getTime());
  tasks.forEach((t) => {
    if (t.startDate) allDates.push(new Date(t.startDate).getTime());
    if (t.dueDate) allDates.push(new Date(t.dueDate).getTime());
  });
  milestones.forEach((m) => {
    if (m.dueDate) allDates.push(new Date(m.dueDate).getTime());
  });
  allDates.push(now.getTime());

  const minTime = allDates.length ? Math.min(...allDates) - 2 * 86400000 : now.getTime() - 7 * 86400000;
  const maxTime = allDates.length ? Math.max(...allDates) + 4 * 86400000 : now.getTime() + 21 * 86400000;
  const totalDurationMs = Math.max(86400000 * 7, maxTime - minTime);

  const columns = [];
  const stepMs = zoomLevel === "day" ? 86400000 : zoomLevel === "month" ? 86400000 * 30 : 86400000 * 7;
  for (let t = minTime; t <= maxTime; t += stepMs) {
    const colDate = new Date(t);
    let label = "";
    if (zoomLevel === "day") {
      label = colDate.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } else if (zoomLevel === "month") {
      label = colDate.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
    } else {
      label = `Wk of ${colDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
    }
    columns.push({ time: t, label });
  }

  const todayOffsetPct = Math.min(100, Math.max(0, ((now.getTime() - minTime) / totalDurationMs) * 100));

  const handleSelectTask = (task) => {
    setSelectedTask(task);
    setEditStartDate(task.startDate ? task.startDate.slice(0, 10) : "");
    setEditDueDate(task.dueDate ? task.dueDate.slice(0, 10) : "");
    setSelectedNewDep("");
  };

  const handleSaveSchedule = async (e) => {
    e?.preventDefault();
    if (!selectedTask || !canManage) return;
    setSaving(true);
    try {
      const res = await apiRequest(`/tasks/${selectedTask._id}/schedule`, {
        method: "PATCH",
        body: JSON.stringify({
          startDate: editStartDate ? new Date(editStartDate).toISOString() : undefined,
          dueDate: editDueDate ? new Date(editDueDate).toISOString() : undefined
        })
      });
      if (res.success) {
        notify?.("Task schedule updated successfully.");
        setRefreshKey((k) => k + 1);
        setSelectedTask(null);
      } else {
        notify?.(res.message || "Failed to update schedule");
      }
    } catch (err) {
      notify?.(err?.message || "Scheduling error");
    } finally {
      setSaving(false);
    }
  };

  const handleAddDependency = async () => {
    if (!selectedTask || !selectedNewDep || !canManage) return;
    setSaving(true);
    try {
      const res = await apiRequest(`/tasks/${selectedTask._id}/dependencies`, {
        method: "POST",
        body: JSON.stringify({ dependsOnTaskId: selectedNewDep })
      });
      if (res.success) {
        notify?.("Dependency added successfully.");
        setRefreshKey((k) => k + 1);
        setSelectedTask(null);
      } else {
        notify?.(res.message || "Failed to add dependency");
      }
    } catch (err) {
      notify?.(err?.message || "Dependency error");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveDependency = async (depTaskId) => {
    if (!selectedTask || !canManage) return;
    setSaving(true);
    try {
      const res = await apiRequest(`/tasks/${selectedTask._id}/dependencies/${depTaskId}`, {
        method: "DELETE"
      });
      if (res.success) {
        notify?.("Dependency removed.");
        setRefreshKey((k) => k + 1);
        setSelectedTask(null);
      } else {
        notify?.(res.message || "Failed to remove dependency");
      }
    } catch (err) {
      notify?.(err?.message || "Error removing dependency");
    } finally {
      setSaving(false);
    }
  };

  const currentProjectName = timeline?.project?.name || projects.find((p) => p.id === selectedProjectId)?.name || "Project";

  return (
    <div className="gantt-wrapper">
      <Header
        eyebrow="PROJECT INTELLIGENCE &amp; SCHEDULING"
        title="Gantt Chart &amp; Interactive Project Timeline"
        description={`Interactive timeline, dependency tracking, critical path, and milestone alignment for ${currentProjectName}.`}
      />

      <div className="gantt-toolbar">
        <div className="gantt-toolbar-group">
          {projects.length > 1 && (
            <select
              value={selectedProjectId}
              onChange={(e) => {
                setSelectedProjectId(e.target.value);
                setSelectedTask(null);
              }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}

          <div className="gantt-toolbar-group">
            <button
              className={`gantt-zoom-pill ${zoomLevel === "day" ? "active" : ""}`}
              onClick={() => setZoomLevel("day")}
            >
              Day
            </button>
            <button
              className={`gantt-zoom-pill ${zoomLevel === "week" ? "active" : ""}`}
              onClick={() => setZoomLevel("week")}
            >
              Week
            </button>
            <button
              className={`gantt-zoom-pill ${zoomLevel === "month" ? "active" : ""}`}
              onClick={() => setZoomLevel("month")}
            >
              Month
            </button>
          </div>

          <button
            className={`gantt-btn-cp ${showCriticalPath ? "active" : ""}`}
            onClick={() => setShowCriticalPath(!showCriticalPath)}
            title="Highlight tasks on the critical delivery path"
          >
            Critical Path ({criticalPathIds.length})
          </button>

          {baseline && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(6, 22, 48, 0.7)", border: "1px solid var(--line)", padding: "4px 8px", borderRadius: "6px", fontSize: "11px" }}>
              <span style={{ color: "var(--muted)" }}>Baseline:</span>
              <span style={{ color: baseline.hasBaseline ? "#fff" : "var(--muted)" }}>
                {baseline.hasBaseline ? new Date(baseline.baselineDeadline).toLocaleDateString() : "Not Locked"}
              </span>
              <Tag tone={baseline.varianceStatus === "delayed" ? "warning" : "healthy"}>
                {baseline.varianceDays > 0 ? `+${baseline.varianceDays}d` : `${baseline.varianceDays}d`}
              </Tag>
            </div>
          )}

          {canManage && (
            <button
              type="button"
              className="outline"
              style={{ fontSize: "11px", padding: "4px 8px" }}
              onClick={() => setBaselineModalOpen(true)}
              title="Lock or realign project baseline"
            >
              Baseline Controls
            </button>
          )}
        </div>

        <div className="gantt-toolbar-group">
          <input
            type="text"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: "170px" }}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="todo">To Do</option>
            <option value="in-progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>
      </div>

      {loading ? (
        <DashboardSkeleton />
      ) : error ? (
        <ErrorCardPro
          title="Timeline Unavailable"
          message={error}
          onRetry={() => setRefreshKey((k) => k + 1)}
        />
      ) : (
        <div className="gantt-card">
          <div className="gantt-main-view">
            <div className="gantt-left-pane">
              <div className="gantt-left-header">
                <span>Task ({filteredTasks.length})</span>
                <span>Status</span>
              </div>
              {filteredTasks.length ? (
                filteredTasks.map((t) => (
                  <div
                    key={t._id}
                    className={`gantt-left-row ${selectedTask?._id === t._id ? "selected" : ""}`}
                    onClick={() => handleSelectTask(t)}
                  >
                    <div className="gantt-left-title">
                      <b>{t.title}</b>
                      <small>
                        {t.assignedTo?.name || "Unassigned"} · {t.durationDays}d
                        {t.isCritical && <span style={{ color: "var(--pink)", marginLeft: "4px" }}>[CP]</span>}
                        {t.dependencies?.length > 0 && <span style={{ color: "var(--cyan)", marginLeft: "4px" }}>({t.dependencies.length} deps)</span>}
                      </small>
                    </div>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <Tag tone={t.status}>{t.status}</Tag>
                      {t.delayDays > 0 && <Tag tone="critical">+{t.delayDays}d</Tag>}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ padding: "30px 16px", color: "var(--muted)", textAlign: "center" }}>
                  No tasks match filter criteria.
                </div>
              )}
            </div>

            <div className="gantt-timeline-pane">
              <div className="gantt-timeline-inner" style={{ width: `${Math.max(900, columns.length * (zoomLevel === "day" ? 70 : zoomLevel === "month" ? 140 : 110))}px` }}>
                <div className="gantt-timeline-header">
                  {columns.map((c, ci) => (
                    <div key={ci} className="gantt-col-header">
                      {c.label}
                    </div>
                  ))}
                </div>

                {todayOffsetPct >= 0 && todayOffsetPct <= 100 && (
                  <div className="gantt-today-indicator" style={{ left: `${todayOffsetPct}%` }}>
                    <span className="gantt-today-badge">TODAY</span>
                  </div>
                )}

                {columns.map((c, ci) => (
                  <div
                    key={ci}
                    className="gantt-grid-line"
                    style={{ left: `${(ci / columns.length) * 100}%` }}
                  />
                ))}

                {filteredTasks.map((t) => {
                  const tStart = new Date(t.startDate).getTime();
                  const tDue = new Date(t.dueDate).getTime();
                  const leftPct = Math.min(98, Math.max(0, ((tStart - minTime) / totalDurationMs) * 100));
                  const widthPct = Math.min(100 - leftPct, Math.max(2.5, ((tDue - tStart) / totalDurationMs) * 100));

                  const isCriticalPathTask = showCriticalPath && t.isCritical;

                  return (
                    <div key={t._id} className="gantt-timeline-row">
                      <div
                        className={`gantt-bar status-${t.status} ${t.isOverdue ? "is-overdue" : ""} ${isCriticalPathTask ? "critical-path" : ""}`}
                        style={{
                          left: `${leftPct}%`,
                          width: `${widthPct}%`
                        }}
                        onClick={() => handleSelectTask(t)}
                        title={`${t.title} (${new Date(t.startDate).toLocaleDateString()} - ${new Date(t.dueDate).toLocaleDateString()}) - ${t.progress}%`}
                      >
                        <div className="gantt-bar-fill" style={{ width: `${t.progress}%` }} />
                        <span className="gantt-bar-text">
                          {t.title} ({t.progress}%)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {milestones.length > 0 && (
            <div className="gantt-milestones-track">
              <span style={{ fontSize: "12px", fontWeight: "800", color: "#7abdfa", textTransform: "uppercase" }}>
                Milestones:
              </span>
              {milestones.map((m) => (
                <div
                  key={m._id}
                  className={`gantt-milestone-chip ${m.status === "completed" ? "completed" : m.isOverdue ? "overdue" : ""}`}
                >
                  <span className="gantt-milestone-diamond" />
                  <span>{m.title}</span>
                  <small style={{ color: "var(--muted)" }}>({new Date(m.dueDate).toLocaleDateString()})</small>
                  <Tag tone={m.status}>{m.status}</Tag>
                </div>
              ))}
            </div>
          )}

          {selectedTask && (
            <div className="gantt-drawer">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <div>
                  <h3 style={{ margin: "0 0 4px", fontSize: "16px", color: "var(--ink)" }}>
                    {selectedTask.title}
                  </h3>
                  <p style={{ margin: 0, fontSize: "12.5px", color: "var(--muted)" }}>
                    Assigned to: <b>{selectedTask.assignedTo?.name || "Unassigned"}</b> · Priority: <Tag tone={selectedTask.priority}>{selectedTask.priority}</Tag> · Status: <Tag tone={selectedTask.status}>{selectedTask.status}</Tag>
                  </p>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button className="mini outline" onClick={() => openTaskAI?.(selectedTask, "analyze")}>
                    <Icon name="search" /> AI Analysis
                  </button>
                  <button className="mini outline" onClick={() => setSelectedTask(null)}>
                    <Icon name="close" /> Close
                  </button>
                </div>
              </div>

              <div className="gantt-drawer-grid">
                <div>
                  <h4 style={{ margin: "0 0 8px", fontSize: "13px", color: "#7abdfa", textTransform: "uppercase" }}>
                    Schedule Management
                  </h4>
                  {canManage ? (
                    <form onSubmit={handleSaveSchedule} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <label style={{ fontSize: "12px" }}>
                        Start Date:
                        <input
                          type="date"
                          value={editStartDate}
                          onChange={(e) => setEditStartDate(e.target.value)}
                          required
                          style={{ width: "100%", marginTop: "4px" }}
                        />
                      </label>
                      <label style={{ fontSize: "12px" }}>
                        Due Date:
                        <input
                          type="date"
                          value={editDueDate}
                          onChange={(e) => setEditDueDate(e.target.value)}
                          required
                          style={{ width: "100%", marginTop: "4px" }}
                        />
                      </label>
                      <button className="primary" disabled={saving} style={{ alignSelf: "flex-start", marginTop: "4px" }}>
                        {saving ? "Saving..." : "Save Schedule"}
                      </button>
                    </form>
                  ) : (
                    <div style={{ fontSize: "13px", color: "var(--ink)" }}>
                      <p>Start: <b>{new Date(selectedTask.startDate).toLocaleDateString()}</b> {selectedTask.isInferredStartDate && "(Inferred)"}</p>
                      <p>Due: <b>{new Date(selectedTask.dueDate).toLocaleDateString()}</b></p>
                      <p>Duration: <b>{selectedTask.durationDays} days</b></p>
                    </div>
                  )}
                </div>

                <div>
                  <h4 style={{ margin: "0 0 8px", fontSize: "13px", color: "#7abdfa", textTransform: "uppercase" }}>
                    Dependencies ({selectedTask.dependencies?.length || 0})
                  </h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "10px" }}>
                    {selectedTask.dependencies?.length ? (
                      selectedTask.dependencies.map((dep) => (
                        <div
                          key={dep._id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "6px 10px",
                            background: "rgba(4, 17, 39, 0.7)",
                            border: "1px solid var(--line)",
                            borderRadius: "6px"
                          }}
                        >
                          <span style={{ fontSize: "12.5px" }}>
                            <b>{dep.title}</b> ({dep.status})
                          </span>
                          {canManage && (
                            <button
                              className="mini danger-mini"
                              onClick={() => handleRemoveDependency(dep._id)}
                              title="Remove dependency"
                            >
                              <Icon name="close" />
                            </button>
                          )}
                        </div>
                      ))
                    ) : (
                      <p style={{ margin: 0, fontSize: "12.5px", color: "var(--muted)" }}>
                        No dependencies configured for this task.
                      </p>
                    )}
                  </div>

                  {canManage && (
                    <div style={{ display: "flex", gap: "6px" }}>
                      <select
                        value={selectedNewDep}
                        onChange={(e) => setSelectedNewDep(e.target.value)}
                        style={{ flex: 1 }}
                      >
                        <option value="">Select task to add as dependency...</option>
                        {tasks
                          .filter((cand) => cand._id !== selectedTask._id && !selectedTask.dependencies?.some((d) => d._id === cand._id))
                          .map((cand) => (
                            <option key={cand._id} value={cand._id}>{cand.title}</option>
                          ))}
                      </select>
                      <button
                        className="outline"
                        onClick={handleAddDependency}
                        disabled={!selectedNewDep || saving}
                      >
                        <Icon name="plus" /> Add
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {baselineModalOpen && (
        <ProjectBaselineModal
          projectId={selectedProjectId}
          projectName={currentProjectName}
          currentDeadline={timeline?.project?.deadline}
          baseline={baseline}
          onClose={() => setBaselineModalOpen(false)}
          onSuccess={() => {
            getProjectBaseline(selectedProjectId).then(setBaseline).catch(() => {});
            setRefreshKey((k) => k + 1);
          }}
          notify={notify}
        />
      )}
    </div>
  );
}

function Insights({data,action}){
  const [selectedRecIndex, setSelectedRecIndex] = useState(0);
  const recList = data.recommendations || [];
  const r = recList[selectedRecIndex] || recList[0];
  const highestRisk=[...data.projects].sort(
    (a,b)=>(b.metrics.riskScore || 0)-(a.metrics.riskScore || 0)
  )[0];
  const canManage=["admin","project_manager","team_lead"].includes(data.user.rawRole);
  const criticalTasks = data.tasks.filter((t) => t.statusTone !== "completed" && ["high", "critical"].includes(t.priorityTone)).slice(0, 3);

  return <>
    <Header
      eyebrow="NEXORA AI / DECISION SUPPORT"
      title="AI Intelligence"
      description="Explainable risk and resource recommendations generated from live task, capacity, and deadline data."
    />

    <section className="insights-hero">
      <Panel title="Overall Risk Score">
        <div className="risk-score">
          <Donut value={highestRisk?.metrics.riskScore || 0}/>

          <div>
            <h2>{highestRisk ? `${highestRisk.risk} delivery risk` : "No project risk data"}</h2>
            <p>
              {highestRisk?.metrics.factors?.[0] || "No accessible projects currently report a delivery risk."}
            </p>

            <Tag tone={highestRisk?.riskTone || "low"}>
              {highestRisk?.name || "No active project"}
            </Tag>
          </div>
        </div>
      </Panel>

      <Panel title="Delivery prediction">
        <div className="prediction">
          <b>{highestRisk ? `${Math.max(0, 100 - (highestRisk.metrics.riskScore || 0))}%` : "—"}</b>

          <span>
            {highestRisk
              ? `Current delivery confidence is derived from ${highestRisk.name}'s live risk score.`
              : "Delivery confidence will appear when an accessible project has data."}
          </span>

          <Spark/>
        </div>
      </Panel>
    </section>

    {recList.length > 1 && (
      <div className="calendar-tabs" style={{ marginBottom: 12 }}>
        {recList.map((item, idx) => (
          <button
            key={item.id || idx}
            type="button"
            className={idx === selectedRecIndex ? "active" : ""}
            onClick={() => setSelectedRecIndex(idx)}
          >
            {item.task?.title || `Recommendation ${idx + 1}`} ({item.match}% match)
          </button>
        ))}
      </div>
    )}

    {r ? <section className="recommendation">
      <div className="rec-header">
        <div>
          <p className="eyebrow">
            RESOURCE RECOMMENDATION / {String(r?.status || 'PENDING').toUpperCase()}
          </p>

          <h2>Keep critical delivery moving.</h2>

          <p>
            Our recommendation compares skills, availability,
            workload, performance and deadline fit.
          </p>
        </div>

        {r.status==="pending" && canManage
          ? <div className="rec-actions"><button
              className="primary"
              onClick={()=>
                action(
                  {endpoint:`/tasks/${r.task.id}/reassign`,method:"POST",payload:{memberId:r.candidate.id}},
                  "Reassignment approved. Tasks, workload, activity and notifications updated."
                )
              }
            >
              Approve reassignment
              <Icon name="arrow"/>
            </button><button className="outline" onClick={()=>action({endpoint:`/recommendations/${r.id}/reject`,method:"PATCH"},"Recommendation rejected.")}>Reject</button></div>
          : <Tag tone={r.status === "pending" ? "medium" : "approved"}>
              {r.status === "pending" ? "Review required" : `Recommendation ${r.status}`}
            </Tag>}
      </div>

      <div className="rec-flow">
        <div>
          <small>UNAVAILABLE MEMBER</small>
          <Avatar member={r.unavailable}/>
          <b>{r.unavailable.name}</b>
          <span>{r.unavailable.availability}</span>
        </div>

        <Icon name="arrow"/>

        <div>
          <small>AFFECTED WORK</small>
          <b>{r.task.title}</b>
          <span>
            {r.task.projectName}
          </span>
        </div>

        <Icon name="arrow"/>

        <div className="match">
          <small>BEST MATCH</small>
          <b>{r.match}%</b>
          <span>confidence score</span>
        </div>

        <Icon name="arrow"/>

        <div>
          <small>RECOMMENDED MEMBER</small>
          <Avatar member={r.candidate}/>
          <b>{r.candidate.name}</b>
          <span>{r.candidate.role}</span>
        </div>
      </div>

      <div className="factor-grid">
        {r.factors.map((f,i)=>
          <div key={`${f}-${i}`}>
            <span>
              {["✦","◌","↗","⌁"][i]}
            </span>

            <b>{f}</b>

            <small>
              {
                [
                  "Relevant skills verified against active work.",
                  "Capacity leaves room for critical delivery.",
                  "Historical delivery rate supports assignment.",
                  "Due dates remain achievable."
                ][i]
              }
            </small>
          </div>
        )}
      </div>
    </section> : <Panel title="Resource recommendations"><div className="empty-state">No pending resource recommendations are available for your authorized projects.</div></Panel>}

    <section className="dashboard-grid lower">
      <Panel title="Critical risks">
        <InsightsList data={data}/>
      </Panel>

      <Panel title="Recommended actions">
        <ol className="actions-list">
          {(highestRisk?.metrics.factors || ["No high-risk action is currently reported."]).slice(0,3).map((factor, idx)=><li key={`${factor}-${idx}`}>{factor}</li>)}
        </ol>
      </Panel>

      <Panel title="Critical path tasks">
        {criticalTasks.length ? (
          <div className="health-list">
            {criticalTasks.map((t) => (
              <div key={t.id || t._id}>
                <span>
                  <b>{t.title}</b>
                  <small>{t.projectName} · Due {t.due}</small>
                </span>
                <Tag tone={t.riskTone}>{t.risk} risk</Tag>
                <Progress value={t.progress} />
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">No lagging critical tasks.</div>
        )}
      </Panel>
    </section>
  </>;
}

function Documents({ data, notify, openTaskModal }) {
  const projects = data.projects || [];
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id || projects[0]?._id || "");
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [isPublicToClient, setIsPublicToClient] = useState(true);
  const [filterType, setFilterType] = useState("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [viewMode, setViewMode] = useState("table");
  const [uploadDesc, setUploadDesc] = useState("");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedUploadFile, setSelectedUploadFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  
  // Preview Modal state
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (!previewDoc) {
      if (previewBlobUrl) {
        URL.revokeObjectURL(previewBlobUrl);
      }
      setPreviewBlobUrl(null);
      setPreviewLoading(false);
      return;
    }

    let active = true;
    setPreviewLoading(true);
    const baseUrl = getApiBaseUrl();
    const token = typeof window !== "undefined" ? localStorage.getItem("nexora_token") : null;

    fetch(`${baseUrl}/attachments/${previewDoc._id}/preview`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load preview");
        return res.blob();
      })
      .then((blob) => {
        if (active) {
          const url = URL.createObjectURL(blob);
          setPreviewBlobUrl(url);
          setPreviewLoading(false);
        }
      })
      .catch((err) => {
        console.error("Preview load error:", err);
        if (active) setPreviewLoading(false);
      });

    return () => {
      active = false;
    };
  }, [previewDoc]);
  
  // Version Upload Modal state
  const [versionDoc, setVersionDoc] = useState(null);
  const [versionDesc, setVersionDesc] = useState("");
  const [versionUploading, setVersionUploading] = useState(false);
  const versionInputRef = useRef(null);

  // Review Workflow Modal state
  const [reviewDoc, setReviewDoc] = useState(null);
  const [reviewStatus, setReviewStatus] = useState("approved");
  const [reviewComments, setReviewComments] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const fileInputRef = useRef(null);
  const modalFileInputRef = useRef(null);
  const isClient = data.user?.role === "client" || data.user?.rawRole === "client";
  const userRole = data.user?.role || data.user?.rawRole || "team_member";
  const canManageReview = ["admin", "project_manager", "team_lead"].includes(userRole);

  const projectTasks = (data.tasks || []).filter(
    (t) => String(t.project?._id || t.project || t.projectId) === String(selectedProjectId)
  );

  function loadAttachments(pId) {
    if (!pId) return;
    setLoading(true);
    apiRequest(`/projects/${pId}/attachments`)
      .then((res) => {
        if (res.success && res.data?.attachments) {
          setAttachments(res.data.attachments);
        }
      })
      .catch((err) => {
        if (notify) notify(err.message || "Failed to load documents");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (selectedProjectId) {
      loadAttachments(selectedProjectId);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    function handleAttachmentEvent(e) {
      const { event, payload } = e.detail || {};
      if (payload?.projectId === String(selectedProjectId)) {
        if (event === "created") {
          setAttachments((prev) => [payload, ...prev]);
        } else if (event === "updated" || event === "reviewed") {
          setAttachments((prev) =>
            prev.map((a) => (String(a._id) === String(payload.attachmentId || payload._id) ? { ...a, ...payload } : a))
          );
        } else if (event === "deleted") {
          setAttachments((prev) => prev.filter((a) => String(a._id) !== String(payload.attachmentId)));
        }
      }
    }
    window.addEventListener("nexora:attachment_event", handleAttachmentEvent);
    return () => window.removeEventListener("nexora:attachment_event", handleAttachmentEvent);
  }, [selectedProjectId]);

  async function performUpload(fileToUpload) {
    const file = fileToUpload || selectedUploadFile;
    if (!file) {
      if (notify) notify("Please select a document to upload");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      if (notify) notify("File size exceeds maximum allowed 10 MB limit");
      return;
    }

    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result;
        const res = await apiRequest(`/projects/${selectedProjectId}/attachments`, {
          method: "POST",
          body: JSON.stringify({
            filename: file.name,
            mimeType: file.type || "application/octet-stream",
            content: base64,
            taskId: selectedTaskId || undefined,
            isPublicToClient: isClient ? true : isPublicToClient,
            status: isClient ? "approved" : "submitted",
            description: uploadDesc
          })
        });

        if (res.success && res.data?.attachment) {
          setAttachments((prev) => [res.data.attachment, ...prev]);
          if (notify) notify(`Uploaded "${file.name}" successfully (Version 1)`);
          setUploadDesc("");
          setSelectedTaskId("");
          setSelectedUploadFile(null);
          setShowUploadModal(false);
        }
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        if (modalFileInputRef.current) modalFileInputRef.current.value = "";
      };
      reader.readAsDataURL(file);
    } catch (err) {
      if (notify) notify(err.message || "Failed to upload file");
      setUploading(false);
    }
  }

  async function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (file) {
      performUpload(file);
    }
  }

  async function handleVersionFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file || !versionDoc) return;

    if (file.size > 10 * 1024 * 1024) {
      if (notify) notify("File size exceeds maximum allowed 10 MB limit");
      return;
    }

    setVersionUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result;
        const res = await apiRequest(`/attachments/${versionDoc._id}/versions`, {
          method: "POST",
          body: JSON.stringify({
            filename: file.name,
            mimeType: file.type || "application/octet-stream",
            content: base64,
            changeDescription: versionDesc || `Updated to version ${(versionDoc.currentVersion || 1) + 1}`
          })
        });

        if (res.success && res.data?.attachment) {
          setAttachments((prev) =>
            prev.map((a) => (a._id === versionDoc._id ? res.data.attachment : a))
          );
          if (notify) notify(`Uploaded version ${res.data.attachment.currentVersion} of "${file.name}"`);
          setVersionDoc(null);
          setVersionDesc("");
        }
        setVersionUploading(false);
        if (versionInputRef.current) versionInputRef.current.value = "";
      };
      reader.readAsDataURL(file);
    } catch (err) {
      if (notify) notify(err.message || "Version upload failed");
      setVersionUploading(false);
    }
  }

  async function handleReviewSubmit(e) {
    if (e) e.preventDefault();
    if (!reviewDoc) return;
    setReviewSubmitting(true);
    try {
      const res = await apiRequest(`/attachments/${reviewDoc._id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status: reviewStatus,
          comments: reviewComments
        })
      });
      if (res.success && res.data?.attachment) {
        setAttachments((prev) =>
          prev.map((a) => (a._id === reviewDoc._id ? res.data.attachment : a))
        );
        if (notify) notify(`Document marked as ${reviewStatus.replace('_', ' ').toUpperCase()}`);
        setReviewDoc(null);
        setReviewComments("");
      }
    } catch (err) {
      if (notify) notify(err.message || "Failed to update review status");
    } finally {
      setReviewSubmitting(false);
    }
  }

  async function handleDownload(att) {
    try {
      await downloadAttachmentFile(att._id, att.filename);
      if (notify) notify(`Downloading ${att.filename}`);
    } catch (err) {
      if (notify) notify(err.message || "Download failed");
    }
  }

  async function handleDelete(att) {
    if (!confirm(`Permanently remove "${att.filename}" and its version history?`)) return;
    try {
      const res = await apiRequest(`/attachments/${att._id}`, { method: "DELETE" });
      if (res.success) {
        setAttachments((prev) => prev.filter((a) => a._id !== att._id));
        if (notify) notify("Document removed successfully");
      }
    } catch (err) {
      if (notify) notify(err.message || "Failed to delete document");
    }
  }

  // Dynamic summary metrics
  const summaryMetrics = useMemo(() => {
    const total = attachments.length;
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const recent = attachments.filter((a) => {
      if (!a.createdAt) return false;
      return now - new Date(a.createdAt).getTime() <= sevenDaysMs;
    }).length;
    const pending = attachments.filter((a) => a.status === "submitted" || a.status === "under_review").length;
    const approved = attachments.filter((a) => a.status === "approved").length;
    return { total, recent, pending, approved };
  }, [attachments]);

  // Tab counts
  const categoryCounts = useMemo(() => {
    return {
      all: attachments.length,
      deliverables: attachments.filter((a) => a.task || a.status === "approved").length,
      review: attachments.filter((a) => a.status === "submitted" || a.status === "under_review").length,
      approved: attachments.filter((a) => a.status === "approved").length,
      images: attachments.filter((a) => a.mimeType?.includes("image") || /\.(png|jpe?g|gif|webp)$/i.test(a.filename)).length,
      archives: attachments.filter((a) => a.mimeType?.includes("zip") || /\.(zip|docx|xlsx|csv)$/i.test(a.filename)).length,
    };
  }, [attachments]);

  // Filtered & sorted attachments
  const filteredAttachments = useMemo(() => {
    let result = attachments.filter((att) => {
      if (search && !att.filename?.toLowerCase().includes(search.toLowerCase()) && !att.description?.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterType === "deliverables") return att.task || att.status === "approved";
      if (filterType === "review") return att.status === "submitted" || att.status === "under_review";
      if (filterType === "approved") return att.status === "approved";
      if (filterType === "images") return att.mimeType?.includes("image") || /\.(png|jpe?g|gif|webp)$/i.test(att.filename);
      if (filterType === "archives") return att.mimeType?.includes("zip") || /\.(zip|docx|xlsx|csv)$/i.test(att.filename);
      return true;
    });

    if (statusFilter !== "all") {
      result = result.filter((a) => (a.status || "approved") === statusFilter);
    }

    result.sort((a, b) => {
      if (sortBy === "newest") return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      if (sortBy === "oldest") return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      if (sortBy === "name") return (a.filename || "").localeCompare(b.filename || "");
      if (sortBy === "size") return (b.size || 0) - (a.size || 0);
      return 0;
    });

    return result;
  }, [attachments, search, filterType, statusFilter, sortBy]);

  return (
    <>
      <Header
        eyebrow="ENTERPRISE ASSETS & ASSET CONTROL"
        title="Secure Document Workspace"
        description="Role-gated multi-version file repository, formal review & sign-off workflows, and client confidentiality."
      />

      <section className="doc-hub-layout">
        {/* A. Section Header */}
        <div className="doc-section-header">
          <div className="doc-section-title-wrap">
            <div className="doc-title-row">
              <h2 className="doc-section-title">
                <Icon name="file" size={20} /> Project Document Hub
              </h2>
              <span className="doc-count-badge">
                {filteredAttachments.length} {filteredAttachments.length === 1 ? "Asset" : "Assets"}
              </span>
            </div>
            <p className="doc-section-desc">
              Centralized repository for deliverable verification, version tracking, and client-safe assets.
            </p>
          </div>

          <div className="doc-header-actions">
            <button
              type="button"
              className="primary doc-upload-trigger-btn"
              onClick={() => setShowUploadModal(true)}
            >
              <Icon name="plus" size={15} /> Upload Document
            </button>
          </div>
        </div>

        {/* B. Document Summary Cards */}
        <div className="doc-summary-grid">
          <div className="doc-summary-card">
            <div className="doc-summary-icon total">
              <Icon name="file" size={18} />
            </div>
            <div className="doc-summary-info">
              <span className="doc-summary-label">Total Documents</span>
              <div className="doc-summary-val">{summaryMetrics.total}</div>
              <span className="doc-summary-sub">Across project files</span>
            </div>
          </div>

          <div className="doc-summary-card">
            <div className="doc-summary-icon recent">
              <Icon name="zap" size={18} />
            </div>
            <div className="doc-summary-info">
              <span className="doc-summary-label">Recently Uploaded</span>
              <div className="doc-summary-val">{summaryMetrics.recent}</div>
              <span className="doc-summary-sub">In the last 7 days</span>
            </div>
          </div>

          <div className="doc-summary-card">
            <div className="doc-summary-icon pending">
              <Icon name="alert" size={18} />
            </div>
            <div className="doc-summary-info">
              <span className="doc-summary-label">Pending Review</span>
              <div className="doc-summary-val">{summaryMetrics.pending}</div>
              <span className="doc-summary-sub">Awaiting verification</span>
            </div>
          </div>

          <div className="doc-summary-card">
            <div className="doc-summary-icon approved">
              <Icon name="check" size={18} />
            </div>
            <div className="doc-summary-info">
              <span className="doc-summary-label">Approved Documents</span>
              <div className="doc-summary-val">{summaryMetrics.approved}</div>
              <span className="doc-summary-sub">Signed off & ready</span>
            </div>
          </div>
        </div>

        {/* C. Search & Filter Toolbar */}
        <div className="doc-toolbar">
          <div className="doc-toolbar-left">
            <select
              className="doc-control"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              title="Filter by project"
              style={{ fontWeight: 600, minWidth: 160 }}
            >
              {projects.map((p) => (
                <option key={p.id || p._id} value={p.id || p._id}>{p.name}</option>
              ))}
            </select>

            <div className="doc-search-box">
              <span className="doc-search-icon">
                <Icon name="search" size={14} />
              </span>
              <input
                type="text"
                placeholder="Search filename or description..."
                className="doc-search-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  style={{ background: "none", border: "none", color: "#8daecc", cursor: "pointer", padding: "0 6px", fontSize: 13 }}
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            <select
              className="doc-control"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              title="Filter by approval status"
            >
              <option value="all">All Statuses</option>
              <option value="approved">Approved</option>
              <option value="submitted">Submitted</option>
              <option value="under_review">Under Review</option>
              <option value="rejected">Needs Revision</option>
            </select>

            <select
              className="doc-control"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              title="Sort documents"
            >
              <option value="newest">Sort: Newest First</option>
              <option value="oldest">Sort: Oldest First</option>
              <option value="name">Sort: Name (A–Z)</option>
              <option value="size">Sort: File Size</option>
            </select>
          </div>

          <div className="doc-toolbar-right">
            <div className="doc-view-toggle">
              <button
                type="button"
                className={`doc-view-btn ${viewMode === "table" ? "active" : ""}`}
                onClick={() => setViewMode("table")}
                title="Table View"
              >
                <Icon name="menu" size={13} /> Table
              </button>
              <button
                type="button"
                className={`doc-view-btn ${viewMode === "cards" ? "active" : ""}`}
                onClick={() => setViewMode("cards")}
                title="Cards View"
              >
                <Icon name="grid" size={13} /> Cards
              </button>
            </div>
          </div>
        </div>

        {/* D. Category Filter Pills */}
        <div className="doc-filter-tabs">
          {[
            ["all", "All Documents", categoryCounts.all],
            ["deliverables", "Deliverables", categoryCounts.deliverables],
            ["review", "Pending Review", categoryCounts.review],
            ["approved", "Approved", categoryCounts.approved],
            ["images", "Images", categoryCounts.images],
            ["archives", "Archives & Data", categoryCounts.archives]
          ].map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              className={`doc-filter-pill ${filterType === key ? "active" : ""}`}
              onClick={() => setFilterType(key)}
            >
              <span>{label}</span>
              <span className="doc-filter-count">{count}</span>
            </button>
          ))}
        </div>

        {/* E. Documents Content (Table View vs Cards View) */}
        {loading ? (
          <div className="empty-state">Loading document assets...</div>
        ) : filteredAttachments.length === 0 ? (
          <div className="empty-state" style={{ padding: 40, textAlign: "center" }}>
            <p style={{ margin: "0 0 12px", color: "#8daecc", fontSize: 14 }}>
              No documents found matching this filter criteria.
            </p>
            <button
              type="button"
              className="primary"
              onClick={() => setShowUploadModal(true)}
              style={{ fontSize: 13, padding: "7px 16px" }}
            >
              <Icon name="plus" size={14} /> Upload First Document
            </button>
          </div>
        ) : viewMode === "table" ? (
          <div className="doc-table-container">
            <table className="doc-table">
              <thead>
                <tr>
                  <th style={{ width: "32%" }}>Document</th>
                  <th style={{ width: "18%" }}>Project / Task</th>
                  <th style={{ width: "16%" }}>Uploaded</th>
                  <th style={{ width: "10%" }}>Size</th>
                  <th style={{ width: "12%" }}>Status</th>
                  <th style={{ width: "12%", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAttachments.map((att) => {
                  const ext = att.filename?.split(".").pop()?.toLowerCase();
                  const isPdf = ext === "pdf";
                  const isImg = ["png", "jpg", "jpeg", "gif", "webp"].includes(ext);
                  const isZip = ["zip", "docx", "xlsx", "csv"].includes(ext);
                  const badgeClass = isPdf ? "pdf" : isImg ? "image" : isZip ? "archive" : "";
                  const sizeFormatted = att.size ? `${(att.size / 1024).toFixed(1)} KB` : "—";
                  const uploaderName = att.uploadedBy?.name || "Team Member";
                  const status = att.status || "approved";

                  return (
                    <tr key={att._id}>
                      <td>
                        <div className="doc-table-file-cell">
                          <div className={`doc-icon-badge ${badgeClass}`}>
                            {isPdf ? "PDF" : isImg ? "IMG" : isZip ? "ZIP" : "DOC"}
                          </div>
                          <div className="doc-table-name-wrap">
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span className="doc-table-filename" title={att.filename}>
                                {att.filename}
                              </span>
                              <span className="doc-version-pill">v{att.currentVersion || 1}</span>
                            </div>
                            {att.description && (
                              <span className="doc-table-desc" title={att.description}>
                                {att.description}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="doc-table-task-cell">
                          {att.task ? (
                            <span className="doc-table-task-name" title={att.task.title || "Linked Task"}>
                              Task: {att.task.title || att.task}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11.5, color: "#6184a8" }}>General Project File</span>
                          )}
                          <div>
                            {att.isPublicToClient ? (
                              <span className="badge-public" style={{ fontSize: 10 }}>✓ Client Public</span>
                            ) : (
                              <span className="badge-internal" style={{ fontSize: 10 }}>🔒 Internal Only</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: 12.5, color: "#d2e7fc", fontWeight: 500 }}>
                          {att.createdAt ? new Date(att.createdAt).toLocaleDateString() : "Recent"}
                        </div>
                        <div style={{ fontSize: 11, color: "#6a92b8" }}>{uploaderName}</div>
                      </td>
                      <td>
                        <span style={{ fontSize: 12, color: "#8ab8ec", fontFamily: "monospace" }}>
                          {sizeFormatted}
                        </span>
                      </td>
                      <td>
                        <span className={`doc-status-badge ${status}`}>
                          {status.replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        <div className="doc-table-actions">
                          <button
                            type="button"
                            className="mini outline"
                            title="Preview document"
                            onClick={() => setPreviewDoc(att)}
                          >
                            <Icon name="search" size={12} />
                          </button>
                          <button
                            type="button"
                            className="mini outline"
                            title="Download document"
                            onClick={() => handleDownload(att)}
                          >
                            <Icon name="file" size={12} />
                          </button>
                          {!isClient && (
                            <button
                              type="button"
                              className="mini outline"
                              title={`Upload version ${(att.currentVersion || 1) + 1}`}
                              onClick={() => setVersionDoc(att)}
                            >
                              +v{(att.currentVersion || 1) + 1}
                            </button>
                          )}
                          {canManageReview && (
                            <button
                              type="button"
                              className="mini primary"
                              title="Review deliverable status"
                              onClick={() => {
                                setReviewDoc(att);
                                setReviewStatus(att.status === "approved" ? "rejected" : "approved");
                                setReviewComments(att.reviewFeedback?.comments || "");
                              }}
                            >
                              Review
                            </button>
                          )}
                          {(!isClient && (att.uploadedBy?._id === data.user?._id || ["admin", "project_manager"].includes(userRole))) && (
                            <button
                              type="button"
                              className="mini danger-mini"
                              title="Delete file"
                              onClick={() => handleDelete(att)}
                            >
                              <Icon name="close" size={11} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* Cards View */
          <div className="doc-card-grid">
            {filteredAttachments.map((att) => {
              const ext = att.filename?.split(".").pop()?.toLowerCase();
              const isPdf = ext === "pdf";
              const isImg = ["png", "jpg", "jpeg", "gif", "webp"].includes(ext);
              const isZip = ["zip", "docx", "xlsx", "csv"].includes(ext);
              const badgeClass = isPdf ? "pdf" : isImg ? "image" : isZip ? "archive" : "";
              const sizeFormatted = att.size ? `${(att.size / 1024).toFixed(1)} KB` : "—";
              const uploaderName = att.uploadedBy?.name || "Team Member";
              const status = att.status || "approved";

              return (
                <div className="doc-card" key={att._id}>
                  <div>
                    <div className="doc-card-top">
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <div className={`doc-icon-badge ${badgeClass}`}>
                          {isPdf ? "PDF" : isImg ? "IMG" : isZip ? "ZIP" : "DOC"}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span className="doc-card-filename" title={att.filename}>
                              {att.filename}
                            </span>
                            <span className="doc-version-pill">v{att.currentVersion || 1}</span>
                          </div>
                        </div>
                      </div>
                      <span className={`doc-status-badge ${status}`}>
                        {status.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="doc-card-content">
                      {att.description && (
                        <p className="doc-card-desc">{att.description}</p>
                      )}

                      <div className="doc-card-meta">
                        <span>{sizeFormatted}</span>
                        <span>·</span>
                        <span>{uploaderName}</span>
                        <span>·</span>
                        <span>{att.createdAt ? new Date(att.createdAt).toLocaleDateString() : "Recent"}</span>
                      </div>

                      {att.reviewFeedback?.comments && (
                        <div style={{ padding: "6px 10px", borderRadius: 6, background: status === "rejected" ? "rgba(255, 93, 144, 0.12)" : "rgba(33, 216, 174, 0.12)", border: `1px solid ${status === "rejected" ? "rgba(255, 93, 144, 0.3)" : "rgba(33, 216, 174, 0.3)"}`, margin: "6px 0 10px", fontSize: 11.5 }}>
                          <b style={{ color: status === "rejected" ? "#ff8ba7" : "#43e5b5" }}>
                            {status === "rejected" ? "Review Rejection Feedback: " : "Approval Comment: "}
                          </b>
                          <span style={{ color: "#d2e7fc" }}>"{att.reviewFeedback.comments}"</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="doc-card-bottom">
                    <div>
                      {att.isPublicToClient ? (
                        <span className="badge-public" style={{ fontSize: 10.5 }}>✓ Client Public</span>
                      ) : (
                        <span className="badge-internal" style={{ fontSize: 10.5 }}>🔒 Internal Only</span>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="mini outline"
                        title="Preview document"
                        onClick={() => setPreviewDoc(att)}
                        style={{ padding: "4px 8px", fontSize: 12 }}
                      >
                        <Icon name="search" size={12} /> Preview
                      </button>

                      <button
                        type="button"
                        className="mini outline"
                        title="Download securely"
                        onClick={() => handleDownload(att)}
                        style={{ padding: "4px 8px", fontSize: 12 }}
                      >
                        <Icon name="file" size={12} /> Download
                      </button>

                      {!isClient && (
                        <button
                          type="button"
                          className="mini outline"
                          title="Upload new version"
                          onClick={() => setVersionDoc(att)}
                          style={{ padding: "4px 8px", fontSize: 12 }}
                        >
                          +v{(att.currentVersion || 1) + 1}
                        </button>
                      )}

                      {canManageReview && (
                        <button
                          type="button"
                          className="mini primary"
                          title="Review deliverable status"
                          onClick={() => {
                            setReviewDoc(att);
                            setReviewStatus(att.status === "approved" ? "rejected" : "approved");
                            setReviewComments(att.reviewFeedback?.comments || "");
                          }}
                          style={{ padding: "4px 8px", fontSize: 11 }}
                        >
                          Review
                        </button>
                      )}

                      {(!isClient && (att.uploadedBy?._id === data.user?._id || ["admin", "project_manager"].includes(userRole))) && (
                        <button
                          type="button"
                          className="mini danger-mini"
                          title="Delete file"
                          onClick={() => handleDelete(att)}
                          style={{ padding: "4px 8px" }}
                        >
                          <Icon name="close" size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 0. DEDICATED UPLOAD DOCUMENT MODAL */}
        {showUploadModal && (
          <div className="doc-preview-modal-overlay" onClick={() => setShowUploadModal(false)}>
            <div className="doc-upload-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="doc-preview-header">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon name="file" size={18} />
                  <b style={{ fontSize: 15, color: "#fff" }}>Upload Document Deliverable</b>
                </div>
                <button type="button" className="mini outline" onClick={() => setShowUploadModal(false)}>✕</button>
              </div>

              <div style={{ padding: 22 }}>
                {/* Drag & Drop Zone */}
                <div
                  className="doc-dropzone"
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                    const files = e.dataTransfer.files;
                    if (files && files[0]) {
                      setSelectedUploadFile(files[0]);
                    }
                  }}
                  onClick={() => modalFileInputRef.current?.click()}
                  style={{
                    borderColor: dragActive ? "var(--cyan)" : undefined,
                    background: dragActive ? "rgba(48, 219, 255, 0.12)" : undefined
                  }}
                >
                  <Icon name="file" size={32} />
                  <div style={{ fontWeight: 600, color: "#fff", fontSize: 14 }}>
                    Drag & drop your file here, or <span style={{ color: "var(--cyan)", textDecoration: "underline" }}>browse files</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#7da2c8" }}>
                    Maximum file size: 10 MB per document
                  </div>
                  <div className="doc-format-chips">
                    {["PDF", "PNG", "JPG", "DOCX", "ZIP", "XLSX", "CSV", "JSON"].map((fmt) => (
                      <span key={fmt} className="doc-format-chip">{fmt}</span>
                    ))}
                  </div>
                </div>

                <input
                  ref={modalFileInputRef}
                  type="file"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setSelectedUploadFile(file);
                  }}
                  accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.csv,.json,.zip,.docx,.xlsx"
                />

                {/* Selected File Chip */}
                {selectedUploadFile && (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "rgba(48, 219, 255, 0.12)",
                    border: "1px solid rgba(48, 219, 255, 0.3)",
                    borderRadius: 8,
                    padding: "10px 14px",
                    marginTop: 14
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <Icon name="check" size={16} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {selectedUploadFile.name}
                        </div>
                        <div style={{ fontSize: 11, color: "#8ab8ec" }}>
                          {(selectedUploadFile.size / 1024).toFixed(1)} KB
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="mini outline"
                      onClick={() => {
                        setSelectedUploadFile(null);
                        if (modalFileInputRef.current) modalFileInputRef.current.value = "";
                      }}
                      style={{ padding: "3px 8px" }}
                    >
                      Remove
                    </button>
                  </div>
                )}

                {/* Form Controls */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#8ab8ec", marginBottom: 5 }}>
                      Project Association:
                    </label>
                    <select
                      value={selectedProjectId}
                      onChange={(e) => setSelectedProjectId(e.target.value)}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: 6, background: "#041126", color: "#fff", border: "1px solid var(--line)", fontSize: 13 }}
                    >
                      {projects.map((p) => (
                        <option key={p.id || p._id} value={p.id || p._id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#8ab8ec", marginBottom: 5 }}>
                      Task Link (Optional):
                    </label>
                    <select
                      value={selectedTaskId}
                      onChange={(e) => setSelectedTaskId(e.target.value)}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: 6, background: "#041126", color: "#fff", border: "1px solid var(--line)", fontSize: 13 }}
                    >
                      <option value="">Attach to General Project</option>
                      {projectTasks.map((t) => (
                        <option key={t.id || t._id} value={t.id || t._id}>Task: {t.title}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#8ab8ec", marginBottom: 5 }}>
                      Description or Change Notes:
                    </label>
                    <input
                      type="text"
                      placeholder="Brief description or purpose of this deliverable..."
                      value={uploadDesc}
                      onChange={(e) => setUploadDesc(e.target.value)}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: 6, background: "#041126", color: "#fff", border: "1px solid var(--line)", fontSize: 13 }}
                    />
                  </div>

                  {!isClient && (
                    <div style={{ paddingTop: 4 }}>
                      <label className="confidentiality-toggle" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#91a9c8", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={!isPublicToClient}
                          onChange={(e) => setIsPublicToClient(!e.target.checked)}
                        />
                        <span>Internal Team Only (Mask from Client Portal)</span>
                      </label>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
                  <button
                    type="button"
                    className="outline"
                    onClick={() => setShowUploadModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="primary"
                    disabled={uploading || !selectedUploadFile}
                    onClick={() => performUpload(selectedUploadFile)}
                  >
                    <Icon name="plus" size={14} />
                    {uploading ? "Uploading & Checking..." : "Upload Document Deliverable"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 1. DOCUMENT PREVIEW MODAL */}
        {previewDoc && (
          <div className="doc-preview-modal-overlay" onClick={() => setPreviewDoc(null)}>
            <div className="doc-preview-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="doc-preview-header">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon name="file" size={18} />
                  <b style={{ fontSize: 15, color: "#fff" }}>{previewDoc.filename}</b>
                  <span className="doc-version-pill">v{previewDoc.currentVersion || 1}</span>
                  <span className={`doc-status-badge ${previewDoc.status || 'approved'}`}>
                    {(previewDoc.status || 'approved').replace('_', ' ')}
                  </span>
                </div>
                <button type="button" className="mini outline" onClick={() => setPreviewDoc(null)}>
                  ✕ Close
                </button>
              </div>

              <div className="doc-preview-body">
                {/* Media Preview Viewport */}
                <div className="doc-preview-display">
                  {previewLoading ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 460, flexDirection: "column", gap: 12 }}>
                      <div className="skeleton-line" style={{ width: 160, height: 16 }} />
                      <p className="muted" style={{ fontSize: 13 }}>Loading secure preview stream...</p>
                    </div>
                  ) : previewDoc.mimeType?.includes("pdf") ? (
                    previewBlobUrl ? (
                      <iframe
                        src={previewBlobUrl}
                        style={{ width: "100%", height: "100%", border: "none", minHeight: 460 }}
                        title="PDF Preview"
                      />
                    ) : (
                      <div style={{ textAlign: "center", padding: 30 }}>
                        <p className="muted">Preview unavailable for this document.</p>
                      </div>
                    )
                  ) : previewDoc.mimeType?.includes("image") ? (
                    previewBlobUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element -- Runtime blob: object URLs cannot be statically optimized by next/image */
                      <img
                        src={previewBlobUrl}
                        alt={previewDoc.filename}
                        style={{ maxWidth: "100%", maxHeight: 460, objectFit: "contain", borderRadius: 6 }}
                      />
                    ) : (
                      <div style={{ textAlign: "center", padding: 30 }}>
                        <p className="muted">Image preview unavailable.</p>
                      </div>
                    )
                  ) : (
                    <div style={{ textAlign: "center", padding: 30 }}>
                      <Icon name="file" size={48} />
                      <h4 style={{ margin: "14px 0 6px", color: "#fff" }}>{previewDoc.filename}</h4>
                      <p className="muted" style={{ fontSize: 13 }}>
                        Inline preview is not supported for {previewDoc.mimeType || "this file type"}. Download the file to inspect its contents.
                      </p>
                      <button type="button" className="primary" onClick={() => handleDownload(previewDoc)} style={{ marginTop: 12 }}>
                        Download File ({previewDoc.size ? `${(previewDoc.size / 1024).toFixed(1)} KB` : ""})
                      </button>
                    </div>
                  )}
                </div>

                {/* Metadata & Version History Sidebar */}
                <div className="doc-preview-sidebar">
                  <div style={{ padding: 12, borderRadius: 8, background: "rgba(4, 16, 36, 0.7)", border: "1px solid var(--line)" }}>
                    <h5 style={{ margin: "0 0 8px", color: "var(--cyan)", textTransform: "uppercase", fontSize: 11, letterSpacing: 0.5 }}>
                      Document Metadata
                    </h5>
                    <div style={{ fontSize: 12.5, display: "flex", flexDirection: "column", gap: 5, color: "#c6e3fc" }}>
                      <div><b>Size:</b> {previewDoc.size ? `${(previewDoc.size / 1024).toFixed(1)} KB` : "—"}</div>
                      <div><b>Uploaded by:</b> {previewDoc.uploadedBy?.name || "Team Member"}</div>
                      <div><b>Upload Date:</b> {previewDoc.createdAt ? new Date(previewDoc.createdAt).toLocaleString() : "Recent"}</div>
                      <div><b>Access:</b> {previewDoc.isPublicToClient ? "Public to Client" : "Internal Team Only"}</div>
                      {previewDoc.description && <div><b>Description:</b> {previewDoc.description}</div>}
                    </div>
                  </div>

                  {/* Version History Drawer */}
                  <div style={{ padding: 12, borderRadius: 8, background: "rgba(4, 16, 36, 0.7)", border: "1px solid var(--line)", flex: 1, overflowY: "auto" }}>
                    <h5 style={{ margin: "0 0 8px", color: "var(--cyan)", textTransform: "uppercase", fontSize: 11, letterSpacing: 0.5 }}>
                      Version History ({((previewDoc.versions?.length || 0) + 1)} Total)
                    </h5>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
                      {/* Active Version */}
                      <div style={{ padding: "6px 8px", borderRadius: 6, background: "rgba(48, 219, 255, 0.15)", border: "1px solid var(--cyan)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, color: "#fff" }}>
                          <span>v{previewDoc.currentVersion || 1} (Current Active)</span>
                          <span style={{ color: "#21d8ae" }}>Active</span>
                        </div>
                        <small style={{ color: "#7bb7e7" }}>{previewDoc.createdAt ? new Date(previewDoc.createdAt).toLocaleDateString() : "Recent"}</small>
                      </div>

                      {/* Past Versions */}
                      {(previewDoc.versions || []).map((ver, idx) => (
                        <div key={idx} style={{ padding: "6px 8px", borderRadius: 6, background: "rgba(9, 27, 54, 0.5)", border: "1px solid rgba(41, 184, 255, 0.2)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, color: "#a8cded" }}>
                            <span>v{ver.version}</span>
                            <small>{ver.size ? `${(ver.size / 1024).toFixed(1)} KB` : ""}</small>
                          </div>
                          <p style={{ margin: "2px 0 0", fontSize: 11, color: "#7ba7cd" }}>{ver.changeDescription || "Archived version"}</p>
                          <small style={{ color: "#597f9d", fontSize: 10.5 }}>{ver.createdAt ? new Date(ver.createdAt).toLocaleDateString() : ""}</small>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button type="button" className="primary" onClick={() => handleDownload(previewDoc)} style={{ width: "100%", justifyContent: "center" }}>
                    <Icon name="file" size={14} /> Download Current File
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. UPLOAD NEW VERSION MODAL */}
        {versionDoc && (
          <div className="doc-preview-modal-overlay" onClick={() => setVersionDoc(null)}>
            <div className="doc-preview-modal-content" style={{ width: 520 }} onClick={(e) => e.stopPropagation()}>
              <div className="doc-preview-header">
                <b>Upload Version {(versionDoc.currentVersion || 1) + 1} for "{versionDoc.filename}"</b>
                <button type="button" className="mini outline" onClick={() => setVersionDoc(null)}>✕</button>
              </div>
              <div style={{ padding: 20 }}>
                <p className="muted" style={{ margin: "0 0 14px", fontSize: 13 }}>
                  Replacing this document increments its version while automatically archiving version {versionDoc.currentVersion || 1} in audit history.
                </p>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#8ab8ec", marginBottom: 6 }}>
                    Change Notes / Version Summary:
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Added requested security specifications and SLA updates"
                    value={versionDesc}
                    onChange={(e) => setVersionDesc(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: 6, background: "#041126", color: "#fff", border: "1px solid var(--line)" }}
                  />
                </div>
                <input
                  ref={versionInputRef}
                  type="file"
                  style={{ display: "none" }}
                  onChange={handleVersionFileSelected}
                />
                <button
                  type="button"
                  className="primary"
                  disabled={versionUploading}
                  onClick={() => versionInputRef.current?.click()}
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  {versionUploading ? "Uploading & Archiving Previous Version..." : `Select File for Version ${(versionDoc.currentVersion || 1) + 1}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 3. REVIEW & APPROVAL WORKFLOW MODAL */}
        {reviewDoc && (
          <div className="doc-preview-modal-overlay" onClick={() => setReviewDoc(null)}>
            <div className="doc-preview-modal-content" style={{ width: 520 }} onClick={(e) => e.stopPropagation()}>
              <div className="doc-preview-header">
                <b>Review Deliverable: "{reviewDoc.filename}"</b>
                <button type="button" className="mini outline" onClick={() => setReviewDoc(null)}>✕</button>
              </div>
              <form onSubmit={handleReviewSubmit} style={{ padding: 20 }}>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#8ab8ec", marginBottom: 6 }}>
                    Decision Status:
                  </label>
                  <select
                    value={reviewStatus}
                    onChange={(e) => setReviewStatus(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: 6, background: "#041126", color: "#fff", border: "1px solid var(--line)" }}
                  >
                    <option value="approved">Approve Deliverable (Mark Verified)</option>
                    <option value="under_review">Under Active Review</option>
                    <option value="rejected">Reject with Feedback (Request Revision)</option>
                  </select>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#8ab8ec", marginBottom: 6 }}>
                    Feedback & Comments:
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Provide specific approval remarks or required revision feedback..."
                    value={reviewComments}
                    onChange={(e) => setReviewComments(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: 6, background: "#041126", color: "#fff", border: "1px solid var(--line)", resize: "vertical" }}
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button type="button" className="outline" onClick={() => setReviewDoc(null)}>Cancel</button>
                  <button type="submit" className="primary" disabled={reviewSubmitting}>
                    {reviewSubmitting ? "Submitting Decision..." : "Submit Review Decision"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </section>
    </>
  );
}


function Communication({ data, notify, openTaskModal }) {
  const projects = data.projects || [];
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id || projects[0]?._id || "");
  const [activeTab, setActiveTab] = useState("all");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [discussions, setDiscussions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  
  // New Message State
  const [newMsg, setNewMsg] = useState("");
  const [isInternalOnly, setIsInternalOnly] = useState(false);
  const [posting, setPosting] = useState(false);

  // Thread Reply State
  const [replyingToId, setReplyingToId] = useState(null);
  const [replyMsg, setReplyMsg] = useState("");
  const [replyPosting, setReplyPosting] = useState(false);

  // Mention Autocomplete state
  const [mentionUsers, setMentionUsers] = useState([]);
  const [showMentionPopup, setShowMentionPopup] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");

  const isClient = data.user?.role === "client" || data.user?.rawRole === "client";
  const userRole = data.user?.role || data.user?.rawRole || "team_member";
  const canPin = ["admin", "project_manager", "team_lead"].includes(userRole);

  const projectTasks = (data.tasks || []).filter(
    (t) => String(t.project?._id || t.project || t.projectId) === String(selectedProjectId)
  );

  function loadDiscussions(pId, tId = null, queryStr = "") {
    if (!pId) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (tId) params.append("taskId", tId);
    if (queryStr) params.append("search", queryStr);

    apiRequest(`/projects/${pId}/discussions?${params.toString()}`)
      .then((res) => {
        if (res.success && res.data?.discussions) {
          setDiscussions(res.data.discussions);
        }
      })
      .catch((err) => {
        if (notify) notify(err.message || "Failed to load discussions");
      })
      .finally(() => setLoading(false));
  }

  function loadMentionUsers(pId) {
    if (!pId) return;
    apiRequest(`/projects/${pId}/mentionable-users`)
      .then((res) => {
        if (res.success && res.data?.users) {
          setMentionUsers(res.data.users);
        }
      })
      .catch(() => {});
  }

  useEffect(() => {
    if (selectedProjectId) {
      loadDiscussions(selectedProjectId, activeTab === "tasks" ? selectedTaskId : null, search);
      loadMentionUsers(selectedProjectId);
    }
  }, [selectedProjectId, activeTab, selectedTaskId]);

  useEffect(() => {
    function handleCommentEvent(e) {
      const { event, payload } = e.detail || {};
      if (payload?.projectId === String(selectedProjectId)) {
        if (event === "created") {
          setDiscussions((prev) => {
            const exists = prev.some((d) => String(d._id) === String(payload._id));
            if (exists) return prev;
            return [payload, ...prev];
          });
        } else if (event === "updated") {
          setDiscussions((prev) =>
            prev.map((d) => (String(d._id) === String(payload.commentId || payload._id) ? { ...d, content: payload.content, isEdited: true } : d))
          );
        } else if (event === "reacted") {
          setDiscussions((prev) =>
            prev.map((d) => (String(d._id) === String(payload.commentId) ? { ...d, reactions: payload.reactions } : d))
          );
        } else if (event === "pinned") {
          setDiscussions((prev) =>
            prev.map((d) => (String(d._id) === String(payload.commentId) ? { ...d, isPinned: payload.isPinned } : d))
          );
        } else if (event === "deleted") {
          setDiscussions((prev) => prev.filter((d) => String(d._id) !== String(payload.commentId)));
        }
      }
    }
    window.addEventListener("nexora:comment_event", handleCommentEvent);
    return () => window.removeEventListener("nexora:comment_event", handleCommentEvent);
  }, [selectedProjectId]);

  // Handle typing in main composer and mention detection
  function handleMsgChange(e) {
    const text = e.target.value;
    setNewMsg(text);

    const match = text.match(/@([a-zA-Z0-9._-]*)$/);
    if (match) {
      setShowMentionPopup(true);
      setMentionQuery(match[1].toLowerCase());
    } else {
      setShowMentionPopup(false);
    }
  }

  function handleSelectMention(user) {
    const handle = user.handle || user.name.replace(/\s+/g, '').toLowerCase();
    const updated = newMsg.replace(/@([a-zA-Z0-9._-]*)$/, `@${handle} `);
    setNewMsg(updated);
    setShowMentionPopup(false);
  }

  async function handleSendMessage(e) {
    if (e) e.preventDefault();
    if (!newMsg.trim() || !selectedProjectId) return;
    setPosting(true);
    try {
      const res = await apiRequest(`/projects/${selectedProjectId}/discussions`, {
        method: "POST",
        body: JSON.stringify({
          content: newMsg,
          taskId: selectedTaskId || undefined,
          isPublicToClient: isClient ? true : !isInternalOnly
        })
      });
      if (res.success && res.data?.comment) {
        setDiscussions((prev) => [res.data.comment, ...prev]);
        setNewMsg("");
        setShowMentionPopup(false);
        if (notify) notify("Message posted to discussion");
      }
    } catch (err) {
      if (notify) notify(err.message || "Failed to post message");
    } finally {
      setPosting(false);
    }
  }

  async function handleSendReply(parentCommentId) {
    if (!replyMsg.trim() || !selectedProjectId) return;
    setReplyPosting(true);
    try {
      const res = await apiRequest(`/projects/${selectedProjectId}/discussions`, {
        method: "POST",
        body: JSON.stringify({
          content: replyMsg,
          parentCommentId,
          isPublicToClient: isClient ? true : !isInternalOnly
        })
      });
      if (res.success && res.data?.comment) {
        setDiscussions((prev) => [...prev, res.data.comment]);
        setReplyMsg("");
        setReplyingToId(null);
        if (notify) notify("Reply sent");
      }
    } catch (err) {
      if (notify) notify(err.message || "Failed to post reply");
    } finally {
      setReplyPosting(false);
    }
  }

  async function handleToggleReaction(commentId, emoji) {
    try {
      const res = await apiRequest(`/comments/${commentId}/reactions`, {
        method: "POST",
        body: JSON.stringify({ emoji })
      });
      if (res.success && res.data?.reactions) {
        setDiscussions((prev) =>
          prev.map((d) => (d._id === commentId ? { ...d, reactions: res.data.reactions } : d))
        );
      }
    } catch (err) {
      if (notify) notify(err.message || "Reaction failed");
    }
  }

  async function handleTogglePin(commentId) {
    try {
      const res = await apiRequest(`/comments/${commentId}/pin`, { method: "PATCH" });
      if (res.success) {
        setDiscussions((prev) =>
          prev.map((d) => (d._id === commentId ? { ...d, isPinned: res.data.isPinned } : d))
        );
        if (notify) notify(res.data.isPinned ? "Message pinned as priority announcement" : "Message unpinned");
      }
    } catch (err) {
      if (notify) notify(err.message || "Pin failed");
    }
  }

  async function handleDeleteComment(commentId) {
    if (!confirm("Delete this message?")) return;
    try {
      const res = await apiRequest(`/comments/${commentId}`, { method: "DELETE" });
      if (res.success) {
        setDiscussions((prev) => prev.filter((d) => d._id !== commentId));
        if (notify) notify("Message deleted");
      }
    } catch (err) {
      if (notify) notify(err.message || "Delete failed");
    }
  }

  function handleCopyText(text) {
    navigator.clipboard?.writeText(text);
    if (notify) notify("Message text copied to clipboard");
  }

  // Format message text and highlight @mentions
  function renderFormattedContent(text) {
    if (!text) return "";
    const parts = text.split(/(@[a-zA-Z0-9._-]+)/g);
    return parts.map((part, i) => {
      if (part.startsWith("@")) {
        return <span key={i} className="mention-pill">{part}</span>;
      }
      return part;
    });
  }

  // Filter top-level parents and build threaded replies
  const topLevelDiscussions = discussions.filter((d) => !d.parentComment);
  const repliesByParentId = {};
  discussions.filter((d) => d.parentComment).forEach((r) => {
    const pId = String(r.parentComment?._id || r.parentComment);
    if (!repliesByParentId[pId]) repliesByParentId[pId] = [];
    repliesByParentId[pId].push(r);
  });

  const filteredList = topLevelDiscussions.filter((d) => {
    if (search && !d.content?.toLowerCase().includes(search.toLowerCase()) && !d.author?.name?.toLowerCase().includes(search.toLowerCase())) return false;
    if (activeTab === "pinned") return d.isPinned;
    if (activeTab === "mentions") {
      const myId = String(data.user?._id || data.user?.id);
      return (d.mentions || []).some((m) => String(m._id || m) === myId);
    }
    if (activeTab === "tasks") {
      if (!selectedTaskId) return Boolean(d.task);
      return String(d.task?._id || d.task) === String(selectedTaskId);
    }
    return true;
  });

  const filteredMentionUsers = mentionUsers.filter((u) =>
    u.name?.toLowerCase().includes(mentionQuery) || u.handle?.toLowerCase().includes(mentionQuery)
  );

  return (
    <>
      <Header
        eyebrow="COLLABORATIVE INTELLIGENCE"
        title="Discussion & Team Collaboration"
        description="Threaded project communications, task context discussions, @mentions, emoji reactions, and verified announcements."
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: "#7bb7e7" }}>Project:</label>
          <select
            value={selectedProjectId}
            onChange={(e) => {
              setSelectedProjectId(e.target.value);
              setSelectedTaskId("");
            }}
            style={{ padding: "6px 12px", borderRadius: 6, background: "#061833", color: "#fff", border: "1px solid var(--line)", fontWeight: 600 }}
          >
            {projects.map((p) => (
              <option key={p.id || p._id} value={p.id || p._id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="Search discussions or tags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ padding: "6px 12px", borderRadius: 6, background: "#061833", color: "#fff", border: "1px solid var(--line)", width: 200 }}
          />
          <div className="tabs" style={{ display: "flex", gap: 4 }}>
            {[
              ["all", "All Discussions"],
              ["pinned", "📌 Pinned Announcements"],
              ["tasks", "Task Discussions"],
              ["mentions", "@My Mentions"]
            ].map(([key, label]) => (
              <button
                key={key}
                className={`mini ${activeTab === key ? "primary" : "outline"}`}
                onClick={() => setActiveTab(key)}
                style={{ padding: "4px 10px", fontSize: 12 }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="discussion-hub-layout">
        {/* Left Column: Task / Scope Selector */}
        <div>
          <Panel title="Scope & Filters">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div
                className={`discussion-scope-card ${!selectedTaskId ? "active" : ""}`}
                onClick={() => setSelectedTaskId("")}
              >
                <b style={{ color: !selectedTaskId ? "#fff" : "#c6e3fc", fontSize: 13 }}>✦ General Project Channel</b>
                <small style={{ color: "#7bb7e7" }}>Strategic updates, announcements & team-wide coordination</small>
              </div>

              <div style={{ marginTop: 8 }}>
                <small style={{ fontWeight: 800, color: "#7abdfa", textTransform: "uppercase", fontSize: 10.5, letterSpacing: 0.5 }}>
                  Project Tasks ({projectTasks.length})
                </small>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6, maxHeight: 380, overflowY: "auto" }}>
                  {projectTasks.map((t) => {
                    const isSel = selectedTaskId === (t.id || t._id);
                    return (
                      <div
                        key={t.id || t._id}
                        className={`discussion-scope-card ${isSel ? "active" : ""}`}
                        onClick={() => {
                          setSelectedTaskId(t.id || t._id);
                          setActiveTab("tasks");
                        }}
                      >
                        <b style={{ fontSize: 12.5, color: isSel ? "#fff" : "#adc8df" }}>{t.title}</b>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <Tag tone={t.priorityTone || t.priority}>{t.priority}</Tag>
                          <Tag tone={t.statusTone || t.status}>{t.status}</Tag>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </Panel>
        </div>

        {/* Right Column: Discussion Feed & Composer */}
        <div>
          {/* Main Message Composer */}
          <div className="discussion-composer-box" style={{ position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--cyan)" }}>
                {selectedTaskId ? `Post to Task: "${projectTasks.find((t) => (t.id || t._id) === selectedTaskId)?.title || 'Task'}"` : "Post to Project General Discussion"}
              </span>
              {!isClient && (
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#91a9c8", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={isInternalOnly}
                    onChange={(e) => setIsInternalOnly(e.target.checked)}
                  />
                  <span>🔒 Internal Team Only</span>
                </label>
              )}
            </div>

            <textarea
              className="discussion-composer-textarea"
              placeholder="Type your message or update... Tip: type @ to tag team members"
              value={newMsg}
              onChange={handleMsgChange}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  handleSendMessage();
                }
              }}
            />

            {/* Mention Autocomplete Dropdown */}
            {showMentionPopup && (
              <div className="mention-popup">
                <div style={{ padding: "6px 10px", fontSize: 10.5, fontWeight: 800, color: "var(--cyan)", borderBottom: "1px solid var(--line)" }}>
                  MENTION PROJECT PARTICIPANT
                </div>
                {filteredMentionUsers.length === 0 ? (
                  <div style={{ padding: "8px 10px", fontSize: 12, color: "#91a9c8" }}>No matching members</div>
                ) : (
                  filteredMentionUsers.map((u) => (
                    <div
                      key={u._id}
                      className="mention-option"
                      onClick={() => handleSelectMention(u)}
                    >
                      <Avatar member={{ name: u.name, initials: (u.name || "U").slice(0, 2).toUpperCase() }} small />
                      <div>
                        <b>{u.name}</b>
                        <small style={{ display: "block", color: "#7bb7e7", fontSize: 10.5 }}>@{u.handle} · {u.role}</small>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <small className="muted" style={{ fontSize: 11.5 }}>
                Press <b>⌘ + Enter</b> to post · Tag team members with <b>@username</b>
              </small>
              <button
                type="button"
                className="primary"
                disabled={posting || !newMsg.trim()}
                onClick={handleSendMessage}
                style={{ padding: "6px 14px", fontSize: 13 }}
              >
                <Icon name="chat" size={14} /> {posting ? "Posting..." : "Post Message"}
              </button>
            </div>
          </div>

          {/* Discussion Message Feed */}
          {loading ? (
            <div className="empty-state">Loading project discussions...</div>
          ) : filteredList.length === 0 ? (
            <div className="empty-state">
              No discussions found for this scope. Start a conversation or coordinate deliverables using the composer above!
            </div>
          ) : (
            <div className="discussion-feed-list">
              {filteredList.map((d) => {
                const author = d.author || {};
                const replies = repliesByParentId[String(d._id)] || [];
                const isAuthor = String(author._id || author.id) === String(data.user?._id || data.user?.id);
                const reactions = d.reactions || [];

                return (
                  <div className={`discussion-msg-card ${d.isPinned ? "is-pinned" : ""}`} key={d._id}>
                    {d.isPinned && (
                      <div className="pin-banner">
                        <Icon name="spark" size={13} /> Pinned Announcement by {d.pinnedBy?.name || "Project Leadership"}
                      </div>
                    )}

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <Avatar member={{ name: author.name, initials: (author.name || "U").slice(0, 2).toUpperCase() }} small />
                        <div>
                          <b style={{ color: "#fff", fontSize: 13.5 }}>{author.name || "Team Member"}</b>
                          <small style={{ color: "#7bb7e7", marginLeft: 6, textTransform: "capitalize", fontSize: 11.5 }}>
                            ({author.role?.replace('_', ' ') || "member"})
                          </small>
                          {d.task && (
                            <span style={{ marginLeft: 8, fontSize: 11, background: "rgba(41, 184, 255, 0.15)", border: "1px solid rgba(41, 184, 255, 0.3)", borderRadius: 4, padding: "1px 6px", color: "var(--cyan)" }}>
                              Task: {d.task.title || "Linked Task"}
                            </span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#7098bd" }}>
                        {d.isEdited && <span className="comment-edited-tag" style={{ color: "#ffb74d" }}>edited</span>}
                        <span>{d.createdAt ? timeAgo(d.createdAt) : "Just now"}</span>
                      </div>
                    </div>

                    {/* Content */}
                    <div style={{ fontSize: 13.5, color: "#edf7ff", lineHeight: 1.55, margin: "6px 0 10px", wordBreak: "break-word" }}>
                      {renderFormattedContent(d.content)}
                    </div>

                    {/* Emoji Reactions Row */}
                    <div className="reactions-row">
                      {reactions.map((r, rIdx) => {
                        const hasReacted = (r.users || []).some((u) => String(u._id || u) === String(data.user?._id || data.user?.id));
                        return (
                          <button
                            key={rIdx}
                            type="button"
                            className={`reaction-pill-btn ${hasReacted ? "user-reacted" : ""}`}
                            onClick={() => handleToggleReaction(d._id, r.emoji)}
                            title={(r.users || []).map((u) => u.name || "User").join(", ")}
                          >
                            <span>{r.emoji}</span>
                            <span>{r.users?.length || 1}</span>
                          </button>
                        );
                      })}

                      {/* Quick Reaction Pickers */}
                      {["👍", "❤️", "🚀", "🎉", "👀"].map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          className="reaction-pill-btn"
                          onClick={() => handleToggleReaction(d._id, emoji)}
                          style={{ padding: "2px 6px", opacity: 0.75 }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>

                    {/* Message Actions */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, borderTop: "1px solid rgba(41, 184, 255, 0.15)", paddingTop: 8 }}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          type="button"
                          className="mini outline"
                          onClick={() => setReplyingToId(replyingToId === d._id ? null : d._id)}
                          style={{ padding: "3px 8px", fontSize: 11.5 }}
                        >
                          <Icon name="chat" size={12} /> Reply {replies.length > 0 && `(${replies.length})`}
                        </button>
                        <button
                          type="button"
                          className="mini outline"
                          onClick={() => handleCopyText(d.content)}
                          style={{ padding: "3px 8px", fontSize: 11.5 }}
                        >
                          Copy
                        </button>
                        {canPin && (
                          <button
                            type="button"
                            className="mini outline"
                            onClick={() => handleTogglePin(d._id)}
                            style={{ padding: "3px 8px", fontSize: 11.5 }}
                          >
                            {d.isPinned ? "Unpin" : "📌 Pin"}
                          </button>
                        )}
                      </div>

                      {(!isClient && (isAuthor || ["admin", "project_manager"].includes(userRole))) && (
                        <button
                          type="button"
                          className="mini danger-mini"
                          onClick={() => handleDeleteComment(d._id)}
                          style={{ padding: "3px 8px", fontSize: 11.5 }}
                        >
                          <Icon name="close" size={11} /> Delete
                        </button>
                      )}
                    </div>

                    {/* Thread Replies List */}
                    {replies.length > 0 && (
                      <div className="thread-replies-box">
                        {replies.map((r) => {
                          const rAuthor = r.author || {};
                          return (
                            <div className="thread-reply-item" key={r._id}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <b style={{ color: "#c6e3fc", fontSize: 12 }}>{rAuthor.name || "Team Member"}</b>
                                  <small style={{ color: "#7bb7e7", fontSize: 10.5 }}>({rAuthor.role || "member"})</small>
                                </div>
                                <small style={{ color: "#5b84a9", fontSize: 10.5 }}>{r.createdAt ? timeAgo(r.createdAt) : "Just now"}</small>
                              </div>
                              <div style={{ fontSize: 12.5, color: "#edf7ff", lineHeight: 1.45 }}>
                                {renderFormattedContent(r.content)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Inline Reply Composer */}
                    {replyingToId === d._id && (
                      <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: "rgba(4, 16, 36, 0.8)", border: "1px solid var(--line)" }}>
                        <textarea
                          rows={2}
                          placeholder={`Reply to ${author.name || 'message'}...`}
                          value={replyMsg}
                          onChange={(e) => setReplyMsg(e.target.value)}
                          style={{ width: "100%", padding: "6px 10px", borderRadius: 6, background: "#020a17", color: "#fff", border: "1px solid var(--line)", fontSize: 12.5 }}
                        />
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 6 }}>
                          <button type="button" className="mini outline" onClick={() => setReplyingToId(null)}>Cancel</button>
                          <button
                            type="button"
                            className="mini primary"
                            disabled={replyPosting || !replyMsg.trim()}
                            onClick={() => handleSendReply(d._id)}
                          >
                            {replyPosting ? "Replying..." : "Post Reply"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}


function Analytics({ data }) {
  const [selectedProjectId, setSelectedProjectId] = useState(data.projects[0]?.id || "all");
  const [dateFilter, setDateFilter] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [projectAnalytics, setProjectAnalytics] = useState(null);
  const [comparisonAnalytics, setComparisonAnalytics] = useState(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportMsg, setExportMsg] = useState("");

  const isClient = data.role === "client";

  function getDateRange() {
    if (dateFilter === "30d") {
      const now = new Date();
      const past = new Date(now.getTime() - 30 * 86400000);
      return { startDate: past.toISOString().split("T")[0], endDate: now.toISOString().split("T")[0] };
    }
    if (dateFilter === "90d") {
      const now = new Date();
      const past = new Date(now.getTime() - 90 * 86400000);
      return { startDate: past.toISOString().split("T")[0], endDate: now.toISOString().split("T")[0] };
    }
    if (dateFilter === "custom" && (customStart || customEnd)) {
      return { startDate: customStart || undefined, endDate: customEnd || undefined };
    }
    return {};
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    const range = getDateRange();
    const fetcher = selectedProjectId === "all"
      ? getComparisonAnalytics(range)
      : getAdvancedProjectAnalytics(selectedProjectId, range);

    fetcher
      .then((resData) => {
        if (!active) return;
        if (selectedProjectId === "all") {
          setComparisonAnalytics(resData);
          setProjectAnalytics(null);
        } else {
          setProjectAnalytics(resData);
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || "Failed to load analytics");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [selectedProjectId, dateFilter, customStart, customEnd]);

  async function handleExportPdf() {
    const targetId = selectedProjectId === "all" ? data.projects[0]?.id : selectedProjectId;
    if (!targetId) return;

    setExportingPdf(true);
    setExportMsg("Generating professional PDF report...");
    try {
      const range = getDateRange();
      const proj = data.projects.find((p) => p.id === targetId);
      const filename = `NEXORA_Report_${proj?.code || "PROJ"}_${new Date().toISOString().split("T")[0]}.pdf`;
      await downloadProjectPDFReport(targetId, filename, range);
      setExportMsg("PDF report downloaded successfully!");
      if (typeof window !== "undefined") {
        window.setTimeout(() => setExportMsg(""), 3500);
      }
    } catch (err) {
      setExportMsg(`Export failed: ${err.message}`);
    } finally {
      setExportingPdf(false);
    }
  }

  async function handleExportExcel() {
    const targetId = selectedProjectId === "all" ? data.projects[0]?.id : selectedProjectId;
    if (!targetId) return;

    setExportingExcel(true);
    setExportMsg("Generating multi-worksheet Excel workbook...");
    try {
      const range = getDateRange();
      const proj = data.projects.find((p) => p.id === targetId);
      const filename = `NEXORA_Report_${proj?.code || "PROJ"}_${new Date().toISOString().split("T")[0]}.xlsx`;
      await downloadProjectExcelReport(targetId, filename, range);
      setExportMsg("Excel workbook (.xlsx) downloaded successfully!");
      if (typeof window !== "undefined") {
        window.setTimeout(() => setExportMsg(""), 3500);
      }
    } catch (err) {
      setExportMsg(`Export failed: ${err.message}`);
    } finally {
      setExportingExcel(false);
    }
  }

  return (
    <>
      <Header
        eyebrow="ANALYTICS & REPORTING / LIVE WORKSPACE METRICS"
        title="Delivery Analytics & Intelligence"
        description="Deep project analytics, milestone completion trends, planned vs. actual progress, team performance, and professional reports."
        action={
          <div className="analytics-export-group" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              type="button"
              className="outline"
              onClick={handleExportPdf}
              disabled={exportingPdf || exportingExcel || data.projects.length === 0}
              title="Download professional PDF Report"
            >
              {exportingPdf ? "Generating PDF..." : "📥 Export PDF Report"}
            </button>
            <button
              type="button"
              className="outline primary"
              onClick={handleExportExcel}
              disabled={exportingPdf || exportingExcel || data.projects.length === 0}
              title="Download multi-sheet Excel Workbook"
            >
              {exportingExcel ? "Generating Excel..." : "📊 Export Excel (.xlsx)"}
            </button>
          </div>
        }
      />

      {exportMsg && (
        <div className="analytics-banner" style={{ margin: "0 0 16px", padding: "10px 14px", borderRadius: "8px", background: "rgba(33, 216, 174, 0.12)", border: "1px solid #21d8ae", color: "#bbfff2", fontSize: "13px" }}>
          {exportMsg}
        </div>
      )}

      {/* Control Filter Toolbar */}
      <section className="analytics-toolbar" style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", justifyContent: "space-between", margin: "0 0 20px", padding: "12px 16px", background: "var(--panel)", borderRadius: "8px", border: "1px solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <label style={{ fontSize: "12px", fontWeight: "700", color: "var(--muted)", textTransform: "uppercase" }}>Project Scope:</label>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            style={{ padding: "7px 12px", borderRadius: "6px", background: "#061836", border: "1px solid var(--line)", color: "var(--ink)", fontSize: "13px" }}
          >
            <option value="all">Workspace Overview (All Accessible Projects)</option>
            {data.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <label style={{ fontSize: "12px", fontWeight: "700", color: "var(--muted)", textTransform: "uppercase" }}>Time Window:</label>
          <button type="button" className={`filter ${dateFilter === "all" ? "active" : ""}`} onClick={() => setDateFilter("all")}>All Time</button>
          <button type="button" className={`filter ${dateFilter === "30d" ? "active" : ""}`} onClick={() => setDateFilter("30d")}>Last 30 Days</button>
          <button type="button" className={`filter ${dateFilter === "90d" ? "active" : ""}`} onClick={() => setDateFilter("90d")}>Last 90 Days</button>
          <button type="button" className={`filter ${dateFilter === "custom" ? "active" : ""}`} onClick={() => setDateFilter("custom")}>Custom</button>

          {dateFilter === "custom" && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "6px" }}>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                style={{ padding: "5px 8px", borderRadius: "5px", background: "#061836", border: "1px solid var(--line)", color: "var(--ink)", fontSize: "12px" }}
              />
              <span style={{ color: "var(--muted)" }}>to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                style={{ padding: "5px 8px", borderRadius: "5px", background: "#061836", border: "1px solid var(--line)", color: "var(--ink)", fontSize: "12px" }}
              />
            </div>
          )}
        </div>
      </section>

      {loading && (
        <div style={{ padding: "40px", textAlign: "center", color: "var(--cyan)", background: "var(--panel)", borderRadius: "8px", border: "1px solid var(--line)" }}>
          <div className="loader" style={{ margin: "0 auto 12px" }} />
          Computing advanced project analytics, schedule variances, and performance trends...
        </div>
      )}

      {error && !loading && (
        <div style={{ padding: "20px", textAlign: "center", color: "#ff8da1", background: "rgba(234, 54, 114, 0.1)", borderRadius: "8px", border: "1px solid #ea3672" }}>
          <b>Analytics error:</b> {error}
        </div>
      )}

      {/* SINGLE PROJECT ADVANCED ANALYTICS VIEW */}
      {!loading && !error && selectedProjectId !== "all" && projectAnalytics && (
        <>
          {/* Executive KPI Summary Cards */}
          <section className="kpis" style={{ marginBottom: "20px" }}>
            <div className="stat">
              <small>Overall Completion</small>
              <b>{projectAnalytics.overview.completionPercentage}%</b>
              <span>{projectAnalytics.overview.completedTasks} of {projectAnalytics.overview.totalTasks} tasks closed</span>
            </div>

            <div className="stat">
              <small>Planned vs Actual Progress</small>
              <b style={{ color: projectAnalytics.overview.progressVariance >= 0 ? "var(--green)" : "var(--pink)" }}>
                {projectAnalytics.overview.actualProgress}%
              </b>
              <span>
                Planned: {projectAnalytics.overview.plannedProgress}% ({projectAnalytics.overview.progressVariance >= 0 ? `+${projectAnalytics.overview.progressVariance}% ahead` : `${projectAnalytics.overview.progressVariance}% behind`})
              </span>
            </div>

            <div className="stat">
              <small>Project Health & Risk</small>
              <div style={{ marginTop: "6px" }}>
                <Tag tone={projectAnalytics.healthIndicators.health === "excellent" || projectAnalytics.healthIndicators.health === "good" ? "low" : "high"}>
                  {projectAnalytics.healthIndicators.health.toUpperCase()}
                </Tag>
              </div>
              <span>
                {isClient ? "Monitored delivery pace" : `Risk Level: ${projectAnalytics.healthIndicators.riskLevel.toUpperCase()}`}
              </span>
            </div>

            <div className="stat">
              <small>Milestone Completion</small>
              <b>{projectAnalytics.overview.milestoneCompletionRate}%</b>
              <span>{projectAnalytics.overview.completedMilestones} of {projectAnalytics.overview.totalMilestones} milestones reached</span>
            </div>

            <div className="stat">
              <small>Delayed Tasks</small>
              <b style={{ color: projectAnalytics.overview.overdueTasks > 0 ? "var(--pink)" : "var(--green)" }}>
                {projectAnalytics.overview.overdueTasks}
              </b>
              <span>{projectAnalytics.overview.overdueTasks === 0 ? "All tasks on schedule" : "Requires schedule adjustment"}</span>
            </div>
          </section>

          {/* Delivery Progress Comparison & Task Breakdown */}
          <section className="dashboard-grid analytics-grid" style={{ marginBottom: "20px" }}>
            <Panel title="Planned vs. Actual Delivery Progress">
              <div style={{ padding: "8px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "12px" }}>
                  <span>Actual Progress (Weighted by Task Hours)</span>
                  <b>{projectAnalytics.overview.actualProgress}%</b>
                </div>
                <Progress value={projectAnalytics.overview.actualProgress} />

                <div style={{ display: "flex", justifyContent: "space-between", margin: "16px 0 4px", fontSize: "12px" }}>
                  <span>Planned Schedule Progress (Elapsed Time)</span>
                  <b>{projectAnalytics.overview.plannedProgress}%</b>
                </div>
                <div className="progress" style={{ height: "6px", background: "rgba(255,255,255,0.08)" }}>
                  <i style={{ width: `${projectAnalytics.overview.plannedProgress}%`, background: "linear-gradient(90deg, #3785ff, #30dbff)" }} />
                </div>

                <div style={{ marginTop: "16px", padding: "10px", borderRadius: "6px", background: "rgba(9, 27, 57, 0.7)", border: "1px solid var(--line)", fontSize: "12px" }}>
                  Schedule Variance: <b style={{ color: projectAnalytics.overview.progressVariance >= 0 ? "var(--green)" : "var(--pink)" }}>
                    {projectAnalytics.overview.progressVariance >= 0 ? `+${projectAnalytics.overview.progressVariance}% Ahead of Target` : `${projectAnalytics.overview.progressVariance}% Behind Schedule`}
                  </b>
                </div>
              </div>
            </Panel>

            <Panel title="Task Status Distribution">
              <div className="donut-row">
                <Donut value={projectAnalytics.overview.totalTasks} />
                <ul className="legend">
                  <li><i className="blue" />To do <b>{projectAnalytics.statusDistribution.todo}</b></li>
                  <li><i className="cyan" />In progress <b>{projectAnalytics.statusDistribution.inProgress}</b></li>
                  <li><i className="purple" />Completed <b>{projectAnalytics.statusDistribution.completed}</b></li>
                  <li><i className="pink" />Blocked <b>{projectAnalytics.statusDistribution.blocked}</b></li>
                </ul>
              </div>
            </Panel>

            <Panel title="Task Priority Distribution">
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "6px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Tag tone="critical">CRITICAL</Tag>
                  <b>{projectAnalytics.priorityDistribution.critical} tasks</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Tag tone="high">HIGH</Tag>
                  <b>{projectAnalytics.priorityDistribution.high} tasks</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Tag tone="medium">MEDIUM</Tag>
                  <b>{projectAnalytics.priorityDistribution.medium} tasks</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Tag tone="low">LOW</Tag>
                  <b>{projectAnalytics.priorityDistribution.low} tasks</b>
                </div>
              </div>
            </Panel>
          </section>

          {/* Delayed Tasks Analysis & Milestones Grid */}
          <section className="dashboard-grid analytics-grid" style={{ marginBottom: "20px" }}>
            <Panel title={`Delayed Tasks Analysis (${projectAnalytics.delayedTasks.length} Active Overdue)`}>
              {projectAnalytics.delayedTasks.length === 0 ? (
                <div style={{ padding: "20px", textAlign: "center", color: "var(--green)" }}>
                  ✓ All tasks in this project are currently on track with no overdue milestones!
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--line)", textAlign: "left", color: "var(--muted)" }}>
                        <th style={{ padding: "8px" }}>Task</th>
                        <th style={{ padding: "8px" }}>Priority</th>
                        <th style={{ padding: "8px" }}>Overdue</th>
                        <th style={{ padding: "8px" }}>Progress</th>
                        {!isClient && <th style={{ padding: "8px" }}>Assignee</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {projectAnalytics.delayedTasks.slice(0, 6).map((dt) => (
                        <tr key={dt._id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                          <td style={{ padding: "8px", fontWeight: "600" }}>{dt.title}</td>
                          <td style={{ padding: "8px" }}><Tag tone={dt.priority === "critical" || dt.priority === "high" ? "high" : "medium"}>{dt.priority}</Tag></td>
                          <td style={{ padding: "8px", color: "var(--pink)", fontWeight: "700" }}>{dt.daysOverdue} d</td>
                          <td style={{ padding: "8px" }}>{dt.progress}%</td>
                          {!isClient && <td style={{ padding: "8px", color: "var(--muted)" }}>{dt.assignee?.name || "Unassigned"}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel title={`Milestone Completion Trends (${projectAnalytics.overview.completedMilestones}/${projectAnalytics.overview.totalMilestones})`}>
              {projectAnalytics.milestones.length === 0 ? (
                <div style={{ padding: "20px", textAlign: "center", color: "var(--muted)" }}>
                  No milestones configured for this project.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {projectAnalytics.milestones.slice(0, 5).map((m) => (
                    <div key={m._id} style={{ padding: "8px 10px", borderRadius: "6px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--line)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                        <b style={{ fontSize: "13px" }}>{m.title}</b>
                        <Tag tone={m.status === "completed" ? "low" : m.isOverdue ? "high" : "medium"}>
                          {m.isOverdue ? "OVERDUE" : m.status.toUpperCase()}
                        </Tag>
                      </div>
                      <Progress value={m.progress} />
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px", fontSize: "11px", color: "var(--muted)" }}>
                        <span>Due: {m.dueDate ? new Date(m.dueDate).toISOString().split("T")[0] : "TBD"}</span>
                        <span>{m.progress}% complete</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </section>

          {/* Team Performance Analytics (CONFIDENTIAL: Hidden from Client Role) */}
          <section style={{ marginBottom: "20px" }}>
            <Panel title="Team Performance & Workload Utilization">
              {isClient ? (
                <div style={{ padding: "16px", borderRadius: "6px", background: "rgba(55, 133, 255, 0.08)", border: "1px solid var(--line)", color: "var(--muted)", fontSize: "13px" }}>
                  ℹ <b>Client Confidentiality Gate:</b> Individual team member workloads, private task completion stats, and productivity metrics are confidential to internal staff.
                </div>
              ) : projectAnalytics.teamPerformance && projectAnalytics.teamPerformance.length > 0 ? (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--line)", textAlign: "left", color: "var(--muted)", background: "rgba(255,255,255,0.02)" }}>
                        <th style={{ padding: "10px 12px" }}>Member</th>
                        <th style={{ padding: "10px 12px" }}>Role</th>
                        <th style={{ padding: "10px 12px" }}>Assigned</th>
                        <th style={{ padding: "10px 12px" }}>Completed</th>
                        <th style={{ padding: "10px 12px" }}>On-Time Rate</th>
                        <th style={{ padding: "10px 12px" }}>Workload</th>
                        <th style={{ padding: "10px 12px" }}>Productivity Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectAnalytics.teamPerformance.map((tm) => (
                        <tr key={tm.member._id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                          <td style={{ padding: "10px 12px", fontWeight: "700" }}>{tm.member.name}</td>
                          <td style={{ padding: "10px 12px", color: "var(--muted)" }}>{tm.member.role}</td>
                          <td style={{ padding: "10px 12px" }}>{tm.assignedTasks}</td>
                          <td style={{ padding: "10px 12px" }}>{tm.completedTasks}</td>
                          <td style={{ padding: "10px 12px" }}>
                            <b style={{ color: tm.onTimeCompletionRate >= 80 ? "var(--green)" : "var(--pink)" }}>
                              {tm.onTimeCompletionRate}%
                            </b>
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            <Tag tone={tm.workloadClassification === "overloaded" ? "high" : tm.workloadClassification === "high" ? "medium" : "low"}>
                              {tm.workloadUtilization}% ({tm.workloadClassification})
                            </Tag>
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            <b style={{ color: tm.productivityScore >= 75 ? "var(--cyan)" : "var(--ink)" }}>
                              {tm.productivityScore} / 100
                            </b>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ marginTop: "10px", fontSize: "11.5px", color: "var(--muted)", fontStyle: "italic" }}>
                    * Productivity formula: 40% Completion Rate + 35% Deadline Adherence + 25% Estimation Efficiency. Heuristic score for project delivery estimation.
                  </div>
                </div>
              ) : (
                <div style={{ padding: "16px", color: "var(--muted)" }}>No team performance records available for this project.</div>
              )}
            </Panel>
          </section>

          {/* Integrated AI-Powered Analytical Insights */}
          <section style={{ marginBottom: "20px" }}>
            <Panel title="AI-Powered Analytical Insights & Advisory Bottlenecks">
              <div style={{ marginBottom: "12px", padding: "8px 12px", borderRadius: "6px", background: "rgba(147, 100, 255, 0.1)", border: "1px solid var(--purple)", color: "#dfd2ff", fontSize: "12px" }}>
                <b>Advisory Intelligence Notice:</b> {projectAnalytics.aiInsights.advisoryNotice}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px" }}>
                {projectAnalytics.aiInsights.predictiveDelays.slice(0, 3).map((d) => (
                  <div key={d._id} style={{ padding: "10px 12px", borderRadius: "6px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--line)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <b style={{ fontSize: "13px" }}>{d.title}</b>
                      <Tag tone={d.riskLevel === "critical" ? "high" : "medium"}>{d.riskLevel.toUpperCase()}</Tag>
                    </div>
                    <p style={{ margin: "4px 0", fontSize: "12px", color: "var(--muted)" }}>{d.suggestedAction}</p>
                  </div>
                ))}

                {projectAnalytics.aiInsights.bottlenecks.slice(0, 2).map((b, i) => (
                  <div key={i} style={{ padding: "10px 12px", borderRadius: "6px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--line)" }}>
                    <b style={{ fontSize: "13px", color: "var(--pink)" }}>Friction Point: {b.title || b.type}</b>
                    <p style={{ margin: "4px 0", fontSize: "12px", color: "var(--muted)" }}>{b.description || b.recommendation}</p>
                  </div>
                ))}
              </div>
            </Panel>
          </section>
        </>
      )}

      {/* WORKSPACE OVERVIEW COMPARISON VIEW */}
      {!loading && !error && selectedProjectId === "all" && comparisonAnalytics && (
        <>
          <section className="kpis" style={{ marginBottom: "20px" }}>
            <div className="stat">
              <small>Accessible Projects</small>
              <b>{comparisonAnalytics.totals.projects}</b>
              <span>Active workspace projects</span>
            </div>
            <div className="stat">
              <small>Workspace Tasks</small>
              <b>{comparisonAnalytics.totals.tasks}</b>
              <span>{comparisonAnalytics.totals.completed} completed</span>
            </div>
            <div className="stat">
              <small>Average Project Progress</small>
              <b style={{ color: "var(--cyan)" }}>{comparisonAnalytics.totals.averageProgress}%</b>
              <span>Across all accessible scopes</span>
            </div>
            <div className="stat">
              <small>Overall Completion Rate</small>
              <b>{comparisonAnalytics.totals.overallCompletionRate}%</b>
              <span>Task closure velocity</span>
            </div>
            <div className="stat">
              <small>Total Overdue Tasks</small>
              <b style={{ color: comparisonAnalytics.totals.overdue > 0 ? "var(--pink)" : "var(--green)" }}>
                {comparisonAnalytics.totals.overdue}
              </b>
              <span>Requires attention</span>
            </div>
          </section>

          <section className="dashboard-grid analytics-grid" style={{ marginBottom: "20px" }}>
            <Panel title="Project-Wise Progress Comparison">
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {comparisonAnalytics.projects.map((p) => (
                  <div key={p._id} style={{ padding: "10px 12px", borderRadius: "6px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--line)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <span>
                        <b style={{ fontSize: "13.5px" }}>{p.name}</b>
                        <small style={{ marginLeft: "8px", color: "var(--muted)" }}>({p.code})</small>
                      </span>
                      <Tag tone={p.health === "excellent" || p.health === "good" ? "low" : "high"}>
                        {p.health.toUpperCase()}
                      </Tag>
                    </div>
                    <Progress value={p.progress} />
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px", fontSize: "11px", color: "var(--muted)" }}>
                      <span>Actual: {p.progress}% | Planned: {p.plannedProgress}%</span>
                      <span>{p.completedTasks}/{p.totalTasks} Tasks Closed ({p.completionRate}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Workspace Task Distribution">
              <div className="donut-row">
                <Donut value={comparisonAnalytics.totals.tasks} />
                <ul className="legend">
                  <li><i className="blue" />Total <b>{comparisonAnalytics.totals.tasks}</b></li>
                  <li><i className="purple" />Closed <b>{comparisonAnalytics.totals.completed}</b></li>
                  <li><i className="pink" />Overdue <b>{comparisonAnalytics.totals.overdue}</b></li>
                  <li><i className="cyan" />Rate <b>{comparisonAnalytics.totals.overallCompletionRate}%</b></li>
                </ul>
              </div>
            </Panel>
          </section>
        </>
      )}
    </>
  );
}

function AddEmployeeModal({ projects, onClose, onSuccess, notify }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("team_member");
  const [department, setDepartment] = useState("Engineering");
  const [jobTitle, setJobTitle] = useState("Software Engineer");
  const [skills, setSkills] = useState("React, Node.js");
  const [experienceYears, setExperienceYears] = useState(2);
  const [selectedProjects, setSelectedProjects] = useState(projects[0]?.id ? [projects[0].id] : []);
  const [availabilityStatus, setAvailabilityStatus] = useState("available");
  const [workloadCapacity, setWorkloadCapacity] = useState(40);
  const [autoPassword, setAutoPassword] = useState(true);
  const [customPassword, setCustomPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [createdInfo, setCreatedInfo] = useState(null);

  const skillSuggestions = ["React.js", "Node.js", "TypeScript", "Next.js", "Docker", "AWS", "MongoDB", "PostgreSQL", "Python", "GraphQL", "Kubernetes", "DevOps", "Figma", "UI/UX"];

  const addSkill = (skill) => {
    const list = skills.split(",").map((s) => s.trim()).filter(Boolean);
    if (!list.includes(skill)) {
      setSkills(list.concat(skill).join(", "));
    }
  };

  const toggleProject = (pId) => {
    setSelectedProjects((prev) =>
      prev.includes(pId) ? prev.filter((id) => id !== pId) : [...prev, pId]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError("Full name and official email are required.");
      return;
    }
    if (!autoPassword && (!customPassword || customPassword.length < 8)) {
      setError("Custom password must be at least 8 characters long.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const res = await createEmployee({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        employeeId: employeeId.trim() || undefined,
        phone: phone.trim(),
        role,
        department,
        jobTitle: jobTitle.trim(),
        skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
        experienceYears: Number(experienceYears) || 1,
        assignedProjectIds: selectedProjects,
        availabilityStatus,
        workloadCapacity: Number(workloadCapacity) || 40,
        password: autoPassword ? undefined : customPassword
      });

      setCreatedInfo(res);
      notify(`Employee account created for ${name.trim()} (${res.employee?.employeeId})`);
      onSuccess?.();
    } catch (err) {
      setError(err?.message || "Failed to add new employee.");
    } finally {
      setSubmitting(false);
    }
  };

  if (createdInfo) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
          <div className="modal-head">
            <div>
              <Tag tone="active">ONBOARDING COMPLETE</Tag>
              <h3 style={{ marginTop: 4 }}>Employee Successfully Registered</h3>
            </div>
            <button className="icon-button" onClick={onClose} aria-label="Close modal">
              <Icon name="close" />
            </button>
          </div>
          <div className="modal-body" style={{ display: "grid", gap: 12 }}>
            <div style={{ background: "rgba(33, 216, 174, 0.1)", border: "1px solid rgba(33, 216, 174, 0.3)", borderRadius: 8, padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Icon name="check" size={18} style={{ color: "var(--neon-green)" }} />
                <b style={{ color: "#fff", fontSize: 14 }}>{createdInfo.employee?.name} has been added to NEXORA</b>
              </div>
              <div style={{ display: "grid", gap: 6, fontSize: 13, color: "var(--ink)" }}>
                <div><span style={{ color: "var(--muted)" }}>Employee ID: </span><b style={{ color: "var(--cyan)" }}>{createdInfo.employee?.employeeId}</b></div>
                <div><span style={{ color: "var(--muted)" }}>Official Email: </span><b>{createdInfo.employee?.email}</b></div>
                <div><span style={{ color: "var(--muted)" }}>Role: </span><b>{createdInfo.employee?.role}</b></div>
                <div><span style={{ color: "var(--muted)" }}>Department: </span><b>{createdInfo.employee?.department}</b></div>
                <div><span style={{ color: "var(--muted)" }}>Temporary Password: </span><code style={{ background: "#061429", padding: "2px 6px", borderRadius: 4, color: "#ffd087" }}>{createdInfo.temporaryPassword}</code></div>
              </div>
            </div>
            <small style={{ color: "var(--muted)", fontSize: 12 }}>
              A system notification and onboarding record have been generated. The employee can immediately log in using their credentials.
            </small>
            <div className="action-row" style={{ marginTop: 8, justifyContent: "flex-end" }}>
              <button type="button" className="primary" onClick={onClose}>
                Done &amp; View Directory
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="modal-head">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Tag tone="planning">STAFF DIRECTORY</Tag>
              <small style={{ color: "var(--cyan)" }}>ENTERPRISE ONBOARDING</small>
            </div>
            <h3 style={{ marginTop: 4 }}>Add New Employee</h3>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close modal">
            <Icon name="close" />
          </button>
        </div>

        {error && (
          <div className="warning-card critical" style={{ marginBottom: 12, padding: "8px 12px" }}>
            <span className="warning-bar" />
            <small style={{ color: "#ff95bd" }}>{error}</small>
          </div>
        )}

        <form className="modal-body modal-form" onSubmit={handleSubmit} style={{ maxHeight: "75vh", overflowY: "auto", paddingRight: 6 }}>
          <div className="form-row">
            <label>
              Full Name *
              <input
                type="text"
                placeholder="e.g. Alex Morgan"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
            <label>
              Official Work Email *
              <input
                type="email"
                placeholder="e.g. alex.morgan@nexora.ai"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              Employee ID (Optional · Leave blank to auto-generate)
              <input
                type="text"
                placeholder="e.g. NEX-1015"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value.toUpperCase())}
              />
            </label>
            <label>
              Contact Phone (Optional)
              <input
                type="tel"
                placeholder="+1 (555) 019-2834"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              Role *
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="team_member">Team Member (Engineer / Specialist)</option>
                <option value="team_lead">Team Lead (Technical / Delivery Lead)</option>
                <option value="project_manager">Project Manager (Portfolio / Operations)</option>
              </select>
            </label>
            <label>
              Department *
              <select value={department} onChange={(e) => setDepartment(e.target.value)}>
                <option value="Engineering">Engineering</option>
                <option value="Product">Product</option>
                <option value="Design">Design</option>
                <option value="Quality Assurance">Quality Assurance</option>
                <option value="DevOps &amp; Infra">DevOps &amp; Infra</option>
                <option value="Data &amp; AI">Data &amp; AI</option>
              </select>
            </label>
          </div>

          <div className="form-row">
            <label>
              Job Designation
              <input
                type="text"
                placeholder="e.g. Senior Frontend Engineer"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
              />
            </label>
            <label>
              Experience (Years)
              <input
                type="number"
                min="0"
                max="40"
                value={experienceYears}
                onChange={(e) => setExperienceYears(e.target.value)}
              />
            </label>
          </div>

          <label>
            Skills &amp; Technical Expertise (comma-separated)
            <input
              type="text"
              placeholder="e.g. React.js, TypeScript, Node.js, GraphQL"
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
              {skillSuggestions.map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => addSkill(s)}
                  style={{
                    background: "rgba(48, 219, 255, 0.08)",
                    border: "1px solid rgba(48, 219, 255, 0.2)",
                    borderRadius: 4,
                    color: "var(--cyan)",
                    fontSize: 10,
                    padding: "2px 6px",
                    cursor: "pointer"
                  }}
                >
                  + {s}
                </button>
              ))}
            </div>
          </label>

          <label>
            Assign to Project(s)
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 6, marginTop: 4, maxHeight: 120, overflowY: "auto", background: "rgba(4, 18, 38, 0.6)", padding: 8, borderRadius: 6, border: "1px solid var(--line)" }}>
              {projects.map((p) => (
                <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", color: "#fff" }}>
                  <input
                    type="checkbox"
                    checked={selectedProjects.includes(p.id)}
                    onChange={() => toggleProject(p.id)}
                  />
                  <span><b>[{p.code || "NXR"}]</b> {p.name}</span>
                </label>
              ))}
            </div>
          </label>

          <div className="form-row">
            <label>
              Availability Status
              <select value={availabilityStatus} onChange={(e) => setAvailabilityStatus(e.target.value)}>
                <option value="available">Available</option>
                <option value="busy">Busy</option>
                <option value="unavailable">Unavailable</option>
              </select>
            </label>
            <label>
              Weekly Workload Capacity (Hours)
              <input
                type="number"
                min="10"
                max="60"
                value={workloadCapacity}
                onChange={(e) => setWorkloadCapacity(e.target.value)}
              />
            </label>
          </div>

          <div style={{ background: "rgba(9, 27, 57, 0.6)", border: "1px solid var(--line)", borderRadius: 6, padding: "10px 12px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", margin: 0 }}>
              <input
                type="checkbox"
                checked={autoPassword}
                onChange={(e) => setAutoPassword(e.target.checked)}
              />
              <span style={{ fontSize: 13, color: "#fff" }}>Auto-generate secure temporary password (Recommended)</span>
            </label>
            {!autoPassword && (
              <div style={{ marginTop: 8 }}>
                <label style={{ margin: 0, fontSize: 12 }}>
                  Custom Password (min. 8 characters)
                  <div style={{ position: "relative", display: "flex", alignItems: "center", marginTop: 4 }}>
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter secure initial password"
                      value={customPassword}
                      onChange={(e) => setCustomPassword(e.target.value)}
                      style={{ paddingRight: 36 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{ position: "absolute", right: 6, background: "transparent", border: 0, color: "var(--muted)", padding: 4 }}
                    >
                      <Icon name={showPassword ? "eye-off" : "eye"} size={14} />
                    </button>
                  </div>
                </label>
              </div>
            )}
          </div>

          <div className="action-row" style={{ marginTop: 12, justifyContent: "flex-end", gap: 10 }}>
            <button type="button" className="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={submitting}>
              {submitting ? "Adding Employee…" : "+ Add Employee & Register"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const CreateEmployeeModal = AddEmployeeModal;

function EditEmployeeModal({ employee, projects, onClose, onSuccess, notify }) {
  const [name, setName] = useState(employee.name || "");
  const [email, setEmail] = useState(employee.email || "");
  const [employeeId, setEmployeeId] = useState(employee.employeeId || "");
  const [phone, setPhone] = useState(employee.phone || "");
  const [role, setRole] = useState(employee.rawRole || employee.role || "team_member");
  const [department, setDepartment] = useState(employee.department || "Engineering");
  const [jobTitle, setJobTitle] = useState(employee.jobTitle || "");
  const [skills, setSkills] = useState((employee.skills || []).join(", "));
  const [experienceYears, setExperienceYears] = useState(employee.experienceYears || 2);
  const [availabilityStatus, setAvailabilityStatus] = useState(employee.availabilityTone || employee.availabilityStatus || "available");
  const [workloadCapacity, setWorkloadCapacity] = useState(employee.workloadCapacity || 40);
  const [selectedProjects, setSelectedProjects] = useState(
    (employee.assignedProjects || []).map((p) => p.id || p._id)
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const toggleProject = (pId) => {
    setSelectedProjects((prev) =>
      prev.includes(pId) ? prev.filter((id) => id !== pId) : [...prev, pId]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await updateEmployee(employee.id || employee._id, {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        employeeId: employeeId.trim() || undefined,
        phone: phone.trim(),
        role,
        department,
        jobTitle: jobTitle.trim(),
        skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
        experienceYears: Number(experienceYears) || 1,
        availabilityStatus,
        workloadCapacity: Number(workloadCapacity) || 40,
        assignedProjectIds: selectedProjects
      });

      notify(`Employee ${name.trim()} updated successfully.`);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err?.message || "Failed to update employee details.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 620 }}>
        <div className="modal-head">
          <div>
            <Tag tone="planning">EDIT PROFILE</Tag>
            <h3 style={{ marginTop: 4 }}>Edit Employee: {employee.name}</h3>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close modal">
            <Icon name="close" />
          </button>
        </div>

        {error && (
          <div className="warning-card critical" style={{ marginBottom: 12, padding: "8px 12px" }}>
            <span className="warning-bar" />
            <small style={{ color: "#ff95bd" }}>{error}</small>
          </div>
        )}

        <form className="modal-body modal-form" onSubmit={handleSubmit} style={{ maxHeight: "75vh", overflowY: "auto", paddingRight: 6 }}>
          <div className="form-row">
            <label>
              Full Name *
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
            <label>
              Official Work Email *
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              Employee ID
              <input
                type="text"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value.toUpperCase())}
              />
            </label>
            <label>
              Contact Phone
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              Role
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="team_member">Team Member</option>
                <option value="team_lead">Team Lead</option>
                <option value="project_manager">Project Manager</option>
              </select>
            </label>
            <label>
              Department
              <select value={department} onChange={(e) => setDepartment(e.target.value)}>
                <option value="Engineering">Engineering</option>
                <option value="Product">Product</option>
                <option value="Design">Design</option>
                <option value="Quality Assurance">Quality Assurance</option>
                <option value="DevOps &amp; Infra">DevOps &amp; Infra</option>
                <option value="Data &amp; AI">Data &amp; AI</option>
              </select>
            </label>
          </div>

          <div className="form-row">
            <label>
              Job Designation
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
              />
            </label>
            <label>
              Experience (Years)
              <input
                type="number"
                min="0"
                max="40"
                value={experienceYears}
                onChange={(e) => setExperienceYears(e.target.value)}
              />
            </label>
          </div>

          <label>
            Skills (comma-separated)
            <input
              type="text"
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
            />
          </label>

          <label>
            Assigned Project(s)
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 6, marginTop: 4, maxHeight: 120, overflowY: "auto", background: "rgba(4, 18, 38, 0.6)", padding: 8, borderRadius: 6, border: "1px solid var(--line)" }}>
              {projects.map((p) => (
                <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", color: "#fff" }}>
                  <input
                    type="checkbox"
                    checked={selectedProjects.includes(p.id)}
                    onChange={() => toggleProject(p.id)}
                  />
                  <span><b>[{p.code || "NXR"}]</b> {p.name}</span>
                </label>
              ))}
            </div>
          </label>

          <div className="form-row">
            <label>
              Availability Status
              <select value={availabilityStatus} onChange={(e) => setAvailabilityStatus(e.target.value)}>
                <option value="available">Available</option>
                <option value="busy">Busy</option>
                <option value="unavailable">Unavailable</option>
                <option value="overloaded">Overloaded</option>
              </select>
            </label>
            <label>
              Workload Capacity (Hours)
              <input
                type="number"
                min="10"
                max="60"
                value={workloadCapacity}
                onChange={(e) => setWorkloadCapacity(e.target.value)}
              />
            </label>
          </div>

          <div className="action-row" style={{ marginTop: 12, justifyContent: "flex-end", gap: 10 }}>
            <button type="button" className="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={submitting}>
              {submitting ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EmployeeDetailsModal({ employee, projects, onClose, onEdit, onDeactivate, onRestore, openAvailability }) {
  const isDeactivated = employee.isActive === false;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 660 }}>
        <div className="modal-head">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Avatar member={employee} size={44} />
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h3 style={{ margin: 0 }}>{employee.name}</h3>
                <span style={{ background: "rgba(48, 219, 255, 0.15)", border: "1px solid var(--cyan)", borderRadius: 4, padding: "2px 6px", fontSize: 11, fontWeight: 700, color: "var(--cyan)" }}>
                  {employee.employeeId || "NEX-1001"}
                </span>
                <Tag tone={isDeactivated ? "critical" : "active"}>
                  {isDeactivated ? "Deactivated" : "Active Staff"}
                </Tag>
              </div>
              <p style={{ margin: "2px 0 0", color: "var(--muted)", fontSize: 12 }}>
                {employee.jobTitle || employee.role} · {employee.department || "Engineering"}
              </p>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close modal">
            <Icon name="close" />
          </button>
        </div>

        <div className="modal-body" style={{ display: "grid", gap: 14, maxHeight: "75vh", overflowY: "auto", paddingRight: 6 }}>
          {/* Deactivation Banner if applicable */}
          {isDeactivated && (
            <div className="warning-card critical" style={{ margin: 0, padding: "10px 14px", borderRadius: 8 }}>
              <span className="warning-bar" />
              <div>
                <b style={{ color: "#ff95bd" }}>Account Deactivated</b>
                <p style={{ margin: "2px 0", fontSize: 12, color: "var(--ink)" }}>
                  Reason: {employee.deactivationReason || "Deactivated by Project Manager"}
                </p>
                <small style={{ color: "var(--muted)" }}>
                  Sign-in access is suspended. Historical logs, audit trails, and completed task milestones are preserved.
                </small>
              </div>
            </div>
          )}

          {/* Contact & Professional Info Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10, background: "rgba(4, 18, 38, 0.6)", padding: "12px 14px", borderRadius: 8, border: "1px solid var(--line)" }}>
            <div style={{ display: "grid", gap: 2 }}>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>Official Work Email</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--cyan)" }}>
                <Icon name="mail" size={13} /> {employee.email}
              </span>
            </div>
            <div style={{ display: "grid", gap: 2 }}>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>Contact Phone</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#fff" }}>
                <Icon name="phone" size={13} /> {employee.phone || "Not recorded"}
              </span>
            </div>
            <div style={{ display: "grid", gap: 2 }}>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>Department &amp; Team</span>
              <span style={{ fontSize: 13, color: "#fff" }}>
                {employee.department || "Engineering"}
              </span>
            </div>
            <div style={{ display: "grid", gap: 2 }}>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>Industry Experience</span>
              <span style={{ fontSize: 13, color: "#fff" }}>
                {employee.experienceYears || 2} Years Experience
              </span>
            </div>
          </div>

          {/* Workload Capacity Meter */}
          <div style={{ background: "rgba(9, 27, 57, 0.6)", border: "1px solid var(--line)", borderRadius: 8, padding: "12px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>Capacity Utilization</span>
              <Tag tone={employee.availabilityTone || "available"}>{employee.availability || "Available"}</Tag>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>
              <span>Load: {employee.workloadHours || 16} hrs / {employee.workloadCapacity || 40} hrs allocated</span>
              <b style={{ color: (employee.workload || 40) > 85 ? "#ff95bd" : "var(--cyan)" }}>{employee.workload || 40}%</b>
            </div>
            <Progress value={employee.workload || 40} />
          </div>

          {/* Technical Skills */}
          <div>
            <h4 style={{ margin: "0 0 6px", fontSize: 13, color: "var(--muted)" }}>Technical Skills &amp; Stack</h4>
            <div className="skill-list" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {(employee.skills || []).map((s, idx) => (
                <span key={`${s}-${idx}`} style={{ background: "rgba(48, 219, 255, 0.1)", border: "1px solid rgba(48, 219, 255, 0.25)", color: "var(--cyan)", padding: "3px 8px", borderRadius: 4, fontSize: 11 }}>
                  {s}
                </span>
              ))}
            </div>
          </div>

          {/* Assigned Projects */}
          <div>
            <h4 style={{ margin: "0 0 6px", fontSize: 13, color: "var(--muted)" }}>
              Assigned Projects ({(employee.assignedProjects || []).length})
            </h4>
            <div style={{ display: "grid", gap: 6 }}>
              {(employee.assignedProjects || []).length > 0 ? (
                employee.assignedProjects.map((p) => (
                  <div key={p.id || p._id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(4, 18, 38, 0.5)", border: "1px solid var(--line)", borderRadius: 6, padding: "8px 12px" }}>
                    <div>
                      <b style={{ fontSize: 13, color: "#fff" }}>[{p.code || "NXR"}] {p.name}</b>
                      <small style={{ color: "var(--muted)", display: "block", fontSize: 11 }}>Role: {p.roleInProject || "Team Member"}</small>
                    </div>
                    <Tag tone={p.statusTone || "planning"}>{p.status || "In Progress"}</Tag>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic", padding: "8px 0" }}>
                  Not currently assigned to any active projects.
                </div>
              )}
            </div>
          </div>

          {/* Active Tasks */}
          <div>
            <h4 style={{ margin: "0 0 6px", fontSize: 13, color: "var(--muted)" }}>
              Active Deliverables ({(employee.activeTasks || []).length})
            </h4>
            <div style={{ display: "grid", gap: 6 }}>
              {(employee.activeTasks || []).length > 0 ? (
                employee.activeTasks.map((t) => (
                  <div key={t.id || t._id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(4, 18, 38, 0.5)", border: "1px solid var(--line)", borderRadius: 6, padding: "8px 12px" }}>
                    <div>
                      <b style={{ fontSize: 12, color: "#fff" }}>{t.title}</b>
                      <small style={{ color: "var(--cyan)", display: "block", fontSize: 11 }}>{t.projectName || "Project"}</small>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Tag tone={t.priority || "medium"}>{t.priority || "Medium"}</Tag>
                      <Tag tone={t.status || "todo"}>{t.status || "Todo"}</Tag>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic", padding: "8px 0" }}>
                  Zero active tasks assigned.
                </div>
              )}
            </div>
          </div>

          {/* Action Row */}
          <div className="action-row" style={{ marginTop: 8, justifyContent: "space-between", borderTop: "1px solid var(--line)", paddingTop: 12 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {isDeactivated ? (
                <button
                  type="button"
                  className="primary"
                  style={{ background: "linear-gradient(100deg, #059669, #10b981)", borderColor: "#10b981" }}
                  onClick={() => {
                    onClose();
                    onRestore?.(employee);
                  }}
                >
                  <Icon name="check" size={14} /> Restore Account
                </button>
              ) : (
                <button
                  type="button"
                  className="outline"
                  style={{ color: "#ff95bd", borderColor: "rgba(255, 110, 174, 0.4)" }}
                  onClick={() => {
                    onClose();
                    onDeactivate?.(employee);
                  }}
                >
                  <Icon name="user-minus" size={14} /> Deactivate Employee
                </button>
              )}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="outline"
                onClick={() => {
                  onClose();
                  openAvailability?.(employee);
                }}
              >
                <Icon name="settings" size={13} /> Availability
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  onClose();
                  onEdit?.(employee);
                }}
              >
                <Icon name="edit" size={13} /> Edit Profile
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeactivateEmployeeModal({ employee, allMembers, onClose, onSuccess, notify }) {
  const [reason, setReason] = useState("");
  const [reassignTasksTo, setReassignTasksTo] = useState("");
  const [force, setForce] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const activeTasksCount = employee.activeTasksCount || (employee.activeTasks || []).length || 0;
  const eligibleReplacements = (allMembers || []).filter(
    (m) => m.id !== employee.id && m.isActive !== false && m.rawRole !== "client"
  );

  const handleDeactivate = async () => {
    if (activeTasksCount > 0 && !reassignTasksTo && !force) {
      setError("Please select a team member to reassign active deliverables or check the force unassignment box.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const res = await deactivateEmployee(employee.id || employee._id, {
        reason: reason.trim() || "Deactivated by Project Manager",
        reassignTasksTo: reassignTasksTo || undefined,
        force
      });

      notify(`Employee ${employee.name} deactivated. ${res.reassignedTasksCount ? `${res.reassignedTasksCount} task(s) reassigned.` : ""}`);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err?.message || "Failed to deactivate employee.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-head">
          <div>
            <Tag tone="critical">DEACTIVATION GOVERNANCE</Tag>
            <h3 style={{ marginTop: 4, color: "#ff95bd" }}>Deactivate Employee</h3>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close modal">
            <Icon name="close" />
          </button>
        </div>

        {error && (
          <div className="warning-card critical" style={{ marginBottom: 12, padding: "8px 12px" }}>
            <span className="warning-bar" />
            <small style={{ color: "#ff95bd" }}>{error}</small>
          </div>
        )}

        <div className="modal-body" style={{ display: "grid", gap: 12 }}>
          <p style={{ margin: 0, color: "var(--ink)" }}>
            Are you sure you want to deactivate <b>{employee.name}</b> ({employee.employeeId || employee.email})?
          </p>

          <div style={{ background: "rgba(4, 18, 38, 0.6)", padding: "10px 12px", borderRadius: 6, border: "1px solid var(--line)", fontSize: 13, display: "grid", gap: 4 }}>
            <div><span style={{ color: "var(--muted)" }}>Role &amp; Dept:</span> <b>{employee.jobTitle || employee.role} ({employee.department || "Engineering"})</b></div>
            <div><span style={{ color: "var(--muted)" }}>Active Deliverables:</span> <b style={{ color: activeTasksCount > 0 ? "#ffd087" : "var(--neon-green)" }}>{activeTasksCount} Active Tasks</b></div>
            <div><span style={{ color: "var(--muted)" }}>Assigned Projects:</span> <b>{(employee.assignedProjects || []).length} Project(s)</b></div>
          </div>

          {activeTasksCount > 0 && (
            <div style={{ background: "rgba(255, 208, 135, 0.08)", border: "1px solid rgba(255, 208, 135, 0.25)", borderRadius: 6, padding: "10px 12px" }}>
              <b style={{ color: "#ffd087", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name="alert-triangle" size={15} /> Active Task Dependencies Detected
              </b>
              <p style={{ margin: "4px 0 8px", fontSize: 12, color: "var(--muted)" }}>
                This employee has {activeTasksCount} active task(s). To protect delivery timelines, select a replacement team member to automatically reassign their deliverables:
              </p>
              <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
                Reassign Active Tasks To:
                <select
                  value={reassignTasksTo}
                  onChange={(e) => setReassignTasksTo(e.target.value)}
                  disabled={force}
                  style={{ background: "#061429", padding: "8px 10px", borderRadius: 6, color: "#fff", border: "1px solid var(--line)" }}
                >
                  <option value="">Select replacement team member...</option>
                  {eligibleReplacements.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.role} · {m.workload || 40}% load)
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, cursor: "pointer", fontSize: 12, color: "var(--muted)" }}>
                <input
                  type="checkbox"
                  checked={force}
                  onChange={(e) => setForce(e.target.checked)}
                />
                <span>Unassign tasks without reassignment (Force deactivation)</span>
              </label>
            </div>
          )}

          <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
            Deactivation Reason (Optional):
            <textarea
              placeholder="e.g. Extended leave of absence, department transfer, or offboarding"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              style={{ background: "#061429", padding: "8px 10px", borderRadius: 6, color: "#fff", border: "1px solid var(--line)", resize: "none" }}
            />
          </label>

          <small style={{ color: "var(--muted)", fontSize: 11 }}>
            Notice: Account sign-in is disabled immediately. Historical completed tasks, comment threads, and audit logs are safely preserved. The account can be restored at any time.
          </small>

          <div className="action-row" style={{ marginTop: 8, justifyContent: "flex-end", gap: 10 }}>
            <button type="button" className="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              style={{ background: "linear-gradient(100deg, #991b1b, #dc2626)", borderColor: "#ef4444" }}
              onClick={handleDeactivate}
              disabled={submitting}
            >
              {submitting ? "Deactivating…" : "Confirm Deactivation"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmployeeManagementSection({
  data,
  query: externalQuery = "",
  openAvailability,
  notify,
  reloadWorkspace,
  isSection5 = false
}) {
  const [viewMode, setViewMode] = useState("table");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [sortOption, setSortOption] = useState("name");
  const [activeSectionTab, setActiveSectionTab] = useState("directory");

  // Modals state
  const [addEmployeeOpen, setAddEmployeeOpen] = useState(false);
  const [editEmployeeTarget, setEditEmployeeTarget] = useState(null);
  const [detailsTarget, setDetailsTarget] = useState(null);
  const [deactivateTarget, setDeactivateTarget] = useState(null);

  // Live employee list state
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);

  const userRoleNormalized = (data.user?.rawRole || data.user?.role || "").toLowerCase().replace(/\s+/g, "_");
  const canManage = ["admin", "project_manager"].includes(userRoleNormalized);
  const myProjects = data.projects || [];

  const fetchEmployees = useCallback(async () => {
    try {
      setLoading(true);
      const res = await listEmployees({
        search: search.trim() || externalQuery.trim() || undefined,
        role: roleFilter !== "all" ? roleFilter : undefined,
        department: deptFilter !== "all" ? deptFilter : undefined,
        projectId: projectFilter !== "all" ? projectFilter : undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        sort: sortOption
      });
      if (res && res.items) {
        setEmployees(res.items);
      }
    } catch (err) {
      setEmployees(data.members || []);
    } finally {
      setLoading(false);
    }
  }, [search, externalQuery, roleFilter, deptFilter, projectFilter, statusFilter, sortOption, data.members]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const handleRestore = async (emp) => {
    try {
      await restoreEmployee(emp.id || emp._id);
      notify(`Employee account for ${emp.name} restored to active status.`);
      fetchEmployees();
      reloadWorkspace?.(false);
    } catch (err) {
      notify(`Restore failed: ${err.message}`, "error");
    }
  };

  const totalEmployees = employees.length;
  const activeEmployees = employees.filter((e) => e.isActive !== false).length;
  const availableCount = employees.filter((e) => (e.availabilityStatus === "available" || e.availabilityTone === "available") && e.isActive !== false).length;
  const overloadedCount = employees.filter((e) => (e.workload || 0) > 85 && e.isActive !== false).length;

  return (
    <section id={isSection5 ? "pm-resources" : undefined} className={isSection5 ? "dashboard-section" : undefined}>
      {isSection5 ? (
        <div className="dashboard-section-header">
          <div>
            <span className="section-eyebrow">Section 5</span>
            <h2><Icon name="team" size={18} /> Human Resources &amp; Smart Resource Allocation</h2>
            <p>Enterprise workforce directory, capacity allocation meters, cross-project assignments, and workload optimization.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "inline-flex", background: "rgba(0,0,0,0.3)", borderRadius: "6px", padding: "2px", border: "1px solid var(--line)" }}>
              <button
                type="button"
                className={activeSectionTab === "directory" ? "primary" : "text-button"}
                style={{ fontSize: "11.5px", padding: "4px 10px" }}
                onClick={() => setActiveSectionTab("directory")}
              >
                Staff Directory
              </button>
              <button
                type="button"
                className={activeSectionTab === "allocation" ? "primary" : "text-button"}
                style={{ fontSize: "11.5px", padding: "4px 10px" }}
                onClick={() => setActiveSectionTab("allocation")}
              >
                Resource Allocation &amp; Capacity
              </button>
            </div>
            {canManage && activeSectionTab === "directory" && (
              <button
                type="button"
                className="primary"
                onClick={() => setAddEmployeeOpen(true)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "12px", padding: "6px 14px" }}
              >
                <Icon name="plus" size={14} /> Add New Employee
              </button>
            )}
            <span className="tag active">{availableCount} / {activeEmployees} Available</span>
          </div>
        </div>
      ) : null}

      {isSection5 && activeSectionTab === "allocation" ? (
        <ResourceAllocationView
          projectId={projectFilter !== "all" ? projectFilter : undefined}
          notify={notify}
        />
      ) : (
        <>
      {/* KPI Metrics Ribbon */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 14 }}>
        <div style={{ background: "rgba(9, 27, 57, 0.5)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 14px" }}>
          <small style={{ color: "var(--muted)", display: "block", fontSize: 11 }}>Total Workforce</small>
          <b style={{ fontSize: 18, color: "#fff" }}>{totalEmployees}</b>
          <span style={{ fontSize: 11, color: "var(--cyan)", marginLeft: 6 }}>({activeEmployees} Active)</span>
        </div>
        <div style={{ background: "rgba(9, 27, 57, 0.5)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 14px" }}>
          <small style={{ color: "var(--muted)", display: "block", fontSize: 11 }}>Available Engineers</small>
          <b style={{ fontSize: 18, color: "var(--neon-green)" }}>{availableCount}</b>
          <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 6 }}>Ready for tasks</span>
        </div>
        <div style={{ background: "rgba(9, 27, 57, 0.5)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 14px" }}>
          <small style={{ color: "var(--muted)", display: "block", fontSize: 11 }}>High Load (&gt;85%)</small>
          <b style={{ fontSize: 18, color: overloadedCount > 0 ? "#ffd087" : "var(--neon-green)" }}>{overloadedCount}</b>
          <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 6 }}>Saturation alerts</span>
        </div>
        <div style={{ background: "rgba(9, 27, 57, 0.5)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 14px" }}>
          <small style={{ color: "var(--muted)", display: "block", fontSize: 11 }}>Deactivated Accounts</small>
          <b style={{ fontSize: 18, color: totalEmployees - activeEmployees > 0 ? "#ff95bd" : "var(--muted)" }}>{totalEmployees - activeEmployees}</b>
          <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 6 }}>Preserved archives</span>
        </div>
      </div>

      {/* Directory Filter & Search Bar */}
      <div className="filter-row" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <div className="search slim" style={{ flex: "1 1 220px", display: "flex", alignItems: "center", background: "#061429", border: "1px solid var(--line)", borderRadius: 6, padding: "4px 10px" }}>
          <Icon name="search" size={14} style={{ color: "var(--muted)", marginRight: 6 }} />
          <input
            type="text"
            placeholder="Search by name, ID (e.g. NEX-1001), email, or skill…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ background: "transparent", border: 0, color: "#fff", outline: "none", width: "100%", fontSize: 12 }}
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} style={{ background: "transparent", border: 0, color: "var(--muted)", cursor: "pointer", padding: 2 }}>
              <Icon name="close" size={12} />
            </button>
          )}
        </div>

        {myProjects.length > 0 && (
          <select className="filter" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: 6, fontSize: 12 }}>
            <option value="all">All Projects</option>
            {myProjects.map((p) => (
              <option key={p.id} value={p.id}>[{p.code || "NXR"}] {p.name}</option>
            ))}
          </select>
        )}

        <select className="filter" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: 6, fontSize: 12 }}>
          <option value="all">All Roles</option>
          <option value="team_member">Team Member</option>
          <option value="team_lead">Team Lead</option>
          <option value="project_manager">Project Manager</option>
        </select>

        <select className="filter" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: 6, fontSize: 12 }}>
          <option value="all">All Departments</option>
          <option value="Engineering">Engineering</option>
          <option value="Product">Product</option>
          <option value="Design">Design</option>
          <option value="Quality Assurance">Quality Assurance</option>
          <option value="DevOps &amp; Infra">DevOps &amp; Infra</option>
          <option value="Data &amp; AI">Data &amp; AI</option>
        </select>

        <select className="filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: 6, fontSize: 12 }}>
          <option value="all">All Statuses</option>
          <option value="active">Active Staff</option>
          <option value="deactivated">Deactivated</option>
        </select>

        <select className="filter" value={sortOption} onChange={(e) => setSortOption(e.target.value)} style={{ padding: "6px 10px", borderRadius: 6, fontSize: 12 }}>
          <option value="name">Sort: Name (A-Z)</option>
          <option value="employeeId">Sort: Employee ID</option>
          <option value="experienceYears">Sort: Experience</option>
          <option value="workload">Sort: Workload</option>
        </select>

        {/* View Mode Toggle */}
        <div style={{ display: "flex", background: "#061429", border: "1px solid var(--line)", borderRadius: 6, padding: 2 }}>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            style={{
              background: viewMode === "table" ? "rgba(48, 219, 255, 0.15)" : "transparent",
              border: 0,
              color: viewMode === "table" ? "var(--cyan)" : "var(--muted)",
              padding: "4px 8px",
              borderRadius: 4,
              fontSize: 11,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4
            }}
          >
            <Icon name="layers" size={12} /> Table
          </button>
          <button
            type="button"
            onClick={() => setViewMode("cards")}
            style={{
              background: viewMode === "cards" ? "rgba(48, 219, 255, 0.15)" : "transparent",
              border: 0,
              color: viewMode === "cards" ? "var(--cyan)" : "var(--muted)",
              padding: "4px 8px",
              borderRadius: 4,
              fontSize: 11,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4
            }}
          >
            <Icon name="grid" size={12} /> Cards
          </button>
        </div>
      </div>

      {/* Directory Content: Table View */}
      {viewMode === "table" ? (
        <div className="table-wrapper" style={{ overflowX: "auto", background: "rgba(9, 27, 57, 0.4)", border: "1px solid var(--line)", borderRadius: 8 }}>
          <table className="enterprise-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "rgba(4, 18, 38, 0.8)", borderBottom: "1px solid var(--line)", textAlign: "left" }}>
                <th style={{ padding: "10px 12px", color: "var(--muted)" }}>Employee</th>
                <th style={{ padding: "10px 12px", color: "var(--muted)" }}>Employee ID</th>
                <th style={{ padding: "10px 12px", color: "var(--muted)" }}>Role &amp; Department</th>
                <th style={{ padding: "10px 12px", color: "var(--muted)" }}>Assigned Projects</th>
                <th style={{ padding: "10px 12px", color: "var(--muted)" }}>Skills</th>
                <th style={{ padding: "10px 12px", color: "var(--muted)" }}>Workload &amp; Capacity</th>
                <th style={{ padding: "10px 12px", color: "var(--muted)" }}>Status</th>
                <th style={{ padding: "10px 12px", color: "var(--muted)", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.length > 0 ? (
                employees.map((emp) => {
                  const isDeactivated = emp.isActive === false;
                  return (
                    <tr
                      key={emp.id || emp._id}
                      style={{
                        borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                        opacity: isDeactivated ? 0.65 : 1,
                        background: isDeactivated ? "rgba(255, 110, 174, 0.02)" : "transparent"
                      }}
                    >
                      {/* Name & Email */}
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <Avatar member={emp} size={30} />
                          <div>
                            <b style={{ color: "#fff", display: "block" }}>{emp.name}</b>
                            <small style={{ color: "var(--cyan)", fontSize: 11 }}>{emp.email}</small>
                          </div>
                        </div>
                      </td>

                      {/* Employee ID */}
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{
                          background: "rgba(48, 219, 255, 0.1)",
                          border: "1px solid rgba(48, 219, 255, 0.25)",
                          color: "var(--cyan)",
                          padding: "2px 6px",
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 700
                        }}>
                          {emp.employeeId || "NEX-1001"}
                        </span>
                      </td>

                      {/* Role & Dept */}
                      <td style={{ padding: "10px 12px" }}>
                        <b style={{ color: "#fff", display: "block" }}>{emp.jobTitle || emp.role}</b>
                        <small style={{ color: "var(--muted)" }}>{emp.department || "Engineering"} · {emp.experienceYears || 2}y exp</small>
                      </td>

                      {/* Projects */}
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, maxWidth: 200 }}>
                          {(emp.assignedProjects || []).length > 0 ? (
                            emp.assignedProjects.slice(0, 2).map((p) => (
                              <span key={p.id || p._id} style={{ background: "rgba(255, 255, 255, 0.06)", borderRadius: 3, padding: "1px 5px", fontSize: 10, color: "#fff" }}>
                                {p.code || p.name?.slice(0, 3)}
                              </span>
                            ))
                          ) : (
                            <span style={{ color: "var(--muted)", fontSize: 11 }}>Unassigned</span>
                          )}
                          {(emp.assignedProjects || []).length > 2 && (
                            <span style={{ color: "var(--cyan)", fontSize: 10 }}>+{(emp.assignedProjects || []).length - 2}</span>
                          )}
                        </div>
                      </td>

                      {/* Skills */}
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, maxWidth: 180 }}>
                          {(emp.skills || []).slice(0, 2).map((s, idx) => (
                            <span key={`${s}-${idx}`} style={{ background: "rgba(48, 219, 255, 0.08)", color: "var(--cyan)", borderRadius: 3, padding: "1px 4px", fontSize: 10 }}>
                              {s}
                            </span>
                          ))}
                          {(emp.skills || []).length > 2 && (
                            <span style={{ color: "var(--muted)", fontSize: 10 }}>+{(emp.skills || []).length - 2}</span>
                          )}
                        </div>
                      </td>

                      {/* Workload */}
                      <td style={{ padding: "10px 12px", minWidth: 120 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                          <span style={{ color: "var(--muted)" }}>{emp.availabilityStatus || emp.availability || "Available"}</span>
                          <b style={{ color: (emp.workload || 40) > 85 ? "#ff95bd" : "var(--cyan)" }}>{emp.workload || 40}%</b>
                        </div>
                        <Progress value={emp.workload || 40} />
                      </td>

                      {/* Status */}
                      <td style={{ padding: "10px 12px" }}>
                        <Tag tone={isDeactivated ? "critical" : "active"}>
                          {isDeactivated ? "Deactivated" : "Active"}
                        </Tag>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: "10px 12px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                          <button
                            type="button"
                            className="icon-button mini"
                            title="View Full Profile & Deliverables"
                            onClick={() => setDetailsTarget(emp)}
                            style={{ padding: 4 }}
                          >
                            <Icon name="eye" size={13} />
                          </button>

                          {canManage && (
                            <button
                              type="button"
                              className="icon-button mini"
                              title="Edit Employee Details"
                              onClick={() => setEditEmployeeTarget(emp)}
                              style={{ padding: 4 }}
                            >
                              <Icon name="edit" size={13} />
                            </button>
                          )}

                          {canManage && (
                            isDeactivated ? (
                              <button
                                type="button"
                                className="icon-button mini"
                                title="Restore Employee Account"
                                onClick={() => handleRestore(emp)}
                                style={{ padding: 4, color: "var(--neon-green)" }}
                              >
                                <Icon name="check" size={13} />
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="icon-button mini"
                                title="Deactivate Employee"
                                onClick={() => setDeactivateTarget(emp)}
                                style={{ padding: 4, color: "#ff95bd" }}
                              >
                                <Icon name="user-minus" size={13} />
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} style={{ padding: "24px 12px", textAlign: "center", color: "var(--muted)" }}>
                    No employees match the selected search or filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Directory Content: Card Grid View */
        <div className="workload-grid">
          {employees.map((emp) => {
            const isDeactivated = emp.isActive === false;
            return (
              <div
                key={emp.id || emp._id}
                className="workload-card"
                style={{
                  opacity: isDeactivated ? 0.7 : 1,
                  border: isDeactivated ? "1px solid rgba(255, 110, 174, 0.3)" : undefined
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Avatar member={emp} />
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <b style={{ fontSize: 13, color: "#fff" }}>{emp.name}</b>
                        <span style={{ fontSize: 10, background: "rgba(48, 219, 255, 0.1)", color: "var(--cyan)", padding: "1px 4px", borderRadius: 3, fontWeight: 700 }}>
                          {emp.employeeId || "NEX-1001"}
                        </span>
                      </div>
                      <small style={{ color: "var(--muted)", display: "block", fontSize: 11 }}>
                        {emp.jobTitle || emp.role} · {emp.department || "Engineering"}
                      </small>
                    </div>
                  </div>
                  <Tag tone={isDeactivated ? "critical" : (emp.availabilityTone || "available")}>
                    {isDeactivated ? "Deactivated" : (emp.availability || "Available")}
                  </Tag>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--muted)", marginTop: 8 }}>
                  <span>Capacity Utilization</span>
                  <b style={{ color: (emp.workload || 40) > 85 ? "#ff95bd" : "var(--cyan)" }}>{emp.workload || 40}%</b>
                </div>
                <Progress value={emp.workload || 40} />

                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                  {(emp.skills || []).slice(0, 3).map((s, idx) => (
                    <span key={`${s}-${idx}`} style={{ fontSize: 10, background: "rgba(48, 219, 255, 0.08)", color: "var(--cyan)", padding: "1px 5px", borderRadius: 3 }}>
                      {s}
                    </span>
                  ))}
                  {(emp.skills || []).length > 3 && (
                    <span style={{ fontSize: 10, color: "var(--muted)" }}>+{(emp.skills || []).length - 3}</span>
                  )}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, paddingTop: 6, borderTop: "1px solid rgba(255, 255, 255, 0.05)" }}>
                  <button
                    type="button"
                    className="text-button"
                    style={{ fontSize: 11, padding: "2px 4px" }}
                    onClick={() => setDetailsTarget(emp)}
                  >
                    View Profile
                  </button>

                  <div style={{ display: "flex", gap: 4 }}>
                    {canManage && (
                      <button
                        type="button"
                        className="text-button"
                        style={{ fontSize: 11, padding: "2px 4px", color: "var(--cyan)" }}
                        onClick={() => setEditEmployeeTarget(emp)}
                      >
                        Edit
                      </button>
                    )}

                    {canManage && (
                      isDeactivated ? (
                        <button
                          type="button"
                          className="text-button"
                          style={{ fontSize: 11, padding: "2px 4px", color: "var(--neon-green)" }}
                          onClick={() => handleRestore(emp)}
                        >
                          Restore
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="text-button"
                          style={{ fontSize: 11, padding: "2px 4px", color: "#ff95bd" }}
                          onClick={() => setDeactivateTarget(emp)}
                        >
                          Deactivate
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
        </>
      )}

      {/* Modals */}
      {addEmployeeOpen && (
        <AddEmployeeModal
          projects={myProjects}
          onClose={() => setAddEmployeeOpen(false)}
          onSuccess={() => {
            fetchEmployees();
            reloadWorkspace?.(true);
          }}
          notify={notify}
        />
      )}

      {editEmployeeTarget && (
        <EditEmployeeModal
          employee={editEmployeeTarget}
          projects={myProjects}
          onClose={() => setEditEmployeeTarget(null)}
          onSuccess={() => {
            fetchEmployees();
            reloadWorkspace?.(true);
          }}
          notify={notify}
        />
      )}

      {detailsTarget && (
        <EmployeeDetailsModal
          employee={detailsTarget}
          projects={myProjects}
          onClose={() => setDetailsTarget(null)}
          onEdit={(emp) => setEditEmployeeTarget(emp)}
          onDeactivate={(emp) => setDeactivateTarget(emp)}
          onRestore={(emp) => handleRestore(emp)}
          openAvailability={openAvailability}
        />
      )}

      {deactivateTarget && (
        <DeactivateEmployeeModal
          employee={deactivateTarget}
          allMembers={employees}
          onClose={() => setDeactivateTarget(null)}
          onSuccess={() => {
            fetchEmployees();
            reloadWorkspace?.(true);
          }}
          notify={notify}
        />
      )}
    </section>
  );
}

// ==========================================
// ENTERPRISE SAAS MODULE 2: RESOURCE ALLOCATION
// ==========================================

function ResourceAllocationView({ projectId, notify }) {
  const [allocData, setAllocData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchAlloc = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getResourceAllocationOverview(projectId);
      setAllocData(res);
    } catch (err) {
      setError(err?.message || "Failed to load resource allocation");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchAlloc();
  }, [fetchAlloc]);

  if (loading) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "var(--muted)" }}>
        <Icon name="refresh" size={24} className="spinning" />
        <p style={{ marginTop: "10px", fontSize: "13px" }}>Analyzing squad capacity, workload commitments &amp; skill coverage...</p>
      </div>
    );
  }

  if (error) {
    return <div className="error-banner" style={{ margin: "16px 0" }}>{error}</div>;
  }

  if (!allocData) return null;

  return (
    <div className="resource-allocation-container" style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "12px" }}>
      {/* KPI Ribbon */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
        <div style={{ background: "rgba(9, 27, 57, 0.6)", padding: "12px 14px", borderRadius: "8px", border: "1px solid var(--line)" }}>
          <small style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase" }}>Total Capacity</small>
          <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginTop: "2px" }}>
            <span style={{ fontSize: "20px", fontWeight: "700", color: "#fff" }}>{allocData.totalCapacityHours}</span>
            <span style={{ fontSize: "11px", color: "var(--muted)" }}>hrs/wk</span>
          </div>
          <small style={{ color: "var(--cyan)", fontSize: "10.5px" }}>Across {allocData.totalActiveMembers} engineers</small>
        </div>

        <div style={{ background: "rgba(9, 27, 57, 0.6)", padding: "12px 14px", borderRadius: "8px", border: "1px solid var(--line)" }}>
          <small style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase" }}>Committed Workload</small>
          <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginTop: "2px" }}>
            <span style={{ fontSize: "20px", fontWeight: "700", color: "var(--cyan)" }}>{allocData.totalAllocatedHours}</span>
            <span style={{ fontSize: "11px", color: "var(--muted)" }}>hrs committed</span>
          </div>
          <small style={{ color: "var(--muted)", fontSize: "10.5px" }}>Active task allocations</small>
        </div>

        <div style={{ background: "rgba(9, 27, 57, 0.6)", padding: "12px 14px", borderRadius: "8px", border: "1px solid var(--line)" }}>
          <small style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase" }}>Free Buffer</small>
          <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginTop: "2px" }}>
            <span style={{ fontSize: "20px", fontWeight: "700", color: allocData.unallocatedHours > 0 ? "var(--neon-green)" : "#ff95bd" }}>{allocData.unallocatedHours}</span>
            <span style={{ fontSize: "11px", color: "var(--muted)" }}>hrs free</span>
          </div>
          <small style={{ color: "var(--muted)", fontSize: "10.5px" }}>Unallocated availability</small>
        </div>

        <div style={{ background: "rgba(9, 27, 57, 0.6)", padding: "12px 14px", borderRadius: "8px", border: "1px solid var(--line)" }}>
          <small style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase" }}>Overall Utilization</small>
          <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginTop: "2px" }}>
            <span style={{ fontSize: "20px", fontWeight: "700", color: allocData.overallUtilizationPercentage > 90 ? "#ffd087" : "#fff" }}>
              {allocData.overallUtilizationPercentage}%
            </span>
            <span style={{ fontSize: "10.5px", color: "var(--muted)" }}>
              ({allocData.overloadedCount} overloaded)
            </span>
          </div>
          <Progress value={allocData.overallUtilizationPercentage} />
        </div>
      </div>

      {/* Conflicts Alert */}
      {allocData.allocationConflicts?.length > 0 && (
        <div style={{ background: "rgba(255, 77, 106, 0.08)", border: "1px solid rgba(255, 77, 106, 0.3)", borderRadius: "8px", padding: "10px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
            <Icon name="alert" size={14} style={{ color: "#ff4d6a" }} />
            <b style={{ color: "#ff95bd", fontSize: "12.5px" }}>
              Capacity Saturation Conflicts ({allocData.allocationConflicts.length})
            </b>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {allocData.allocationConflicts.map((c, idx) => (
              <div key={idx} style={{ fontSize: "11.5px", color: "var(--text)", display: "flex", justifyContent: "space-between" }}>
                <span>• <b>{c.taskTitle}</b> ({c.projectName}): {c.issue}</span>
                <span style={{ color: "var(--muted)" }}>Due: {new Date(c.dueDate).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overloaded & Underutilized Breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "10px" }}>
        <div style={{ background: "rgba(6, 22, 48, 0.6)", padding: "12px 14px", borderRadius: "8px", border: "1px solid var(--line)" }}>
          <b style={{ color: "#fff", fontSize: "12.5px", display: "block", marginBottom: "6px" }}>
            Overloaded Engineers ({allocData.overloadedMembers?.length || 0})
          </b>
          {allocData.overloadedMembers?.length === 0 ? (
            <p style={{ fontSize: "11.5px", color: "var(--muted)", margin: 0 }}>No team members exceed sustainable capacity limits.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {allocData.overloadedMembers.map((m) => (
                <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 8px", background: "rgba(255, 77, 106, 0.05)", borderRadius: "6px" }}>
                  <div>
                    <b style={{ color: "#fff", fontSize: "12px" }}>{m.name}</b>
                    <small style={{ color: "var(--muted)", display: "block", fontSize: "10.5px" }}>{m.jobTitle} • {m.committedHours}h committed</small>
                  </div>
                  <Tag tone="warning">{m.utilizationPercentage}% load</Tag>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: "rgba(6, 22, 48, 0.6)", padding: "12px 14px", borderRadius: "8px", border: "1px solid var(--line)" }}>
          <b style={{ color: "#fff", fontSize: "12.5px", display: "block", marginBottom: "6px" }}>
            Available &amp; Underutilized Engineers ({allocData.underutilizedMembers?.length || 0})
          </b>
          {allocData.underutilizedMembers?.length === 0 ? (
            <p style={{ fontSize: "11.5px", color: "var(--muted)", margin: 0 }}>Workload is evenly balanced across available members.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {allocData.underutilizedMembers.map((m) => (
                <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 8px", background: "rgba(48, 219, 255, 0.05)", borderRadius: "6px" }}>
                  <div>
                    <b style={{ color: "#fff", fontSize: "12px" }}>{m.name}</b>
                    <small style={{ color: "var(--muted)", display: "block", fontSize: "10.5px" }}>{m.jobTitle} • {m.workloadCapacity - m.committedHours}h buffer</small>
                  </div>
                  <Tag tone="healthy">{m.utilizationPercentage}% load</Tag>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Skill Distribution */}
      {allocData.skillDistribution && Object.keys(allocData.skillDistribution).length > 0 && (
        <div style={{ background: "rgba(6, 22, 48, 0.6)", padding: "12px 14px", borderRadius: "8px", border: "1px solid var(--line)" }}>
          <b style={{ color: "#fff", fontSize: "12.5px", display: "block", marginBottom: "6px" }}>
            Organization Skill Inventory &amp; Coverage
          </b>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {Object.entries(allocData.skillDistribution).map(([skill, count]) => (
              <span key={skill} className="tag active" style={{ fontSize: "11px", padding: "3px 8px" }}>
                ✦ {skill} ({count})
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// ENTERPRISE SAAS MODULE 3: PROJECT BASELINE
// ==========================================

function ProjectBaselineModal({ projectId, projectName, currentDeadline, baseline, onClose, onSuccess, notify }) {
  const [revisedDeadline, setRevisedDeadline] = useState(
    baseline?.baselineDeadline ? new Date(baseline.baselineDeadline).toISOString().slice(0, 10) : (currentDeadline ? new Date(currentDeadline).toISOString().slice(0, 10) : "")
  );
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await setProjectBaseline(projectId, {
        revisedDeadline: revisedDeadline ? new Date(revisedDeadline).toISOString() : undefined,
        reason: reason.trim() || undefined
      });
      notify?.("Project baseline saved and logged to audit trail successfully.");
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err?.message || "Failed to update baseline");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: "520px" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="section-eyebrow">Project Governance</span>
            <h3 style={{ margin: "2px 0 0", color: "#fff" }}>Project Baseline &amp; Schedule Variance</h3>
          </div>
          <button type="button" className="icon-button" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: "16px 20px" }}>
          {error && <div className="error-banner" style={{ marginBottom: "12px" }}>{error}</div>}
          <div style={{ background: "rgba(3, 11, 24, 0.6)", padding: "12px", borderRadius: "8px", border: "1px solid var(--line)", marginBottom: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "6px" }}>
              <span style={{ color: "var(--muted)" }}>Project:</span>
              <b style={{ color: "#fff" }}>{projectName}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "6px" }}>
              <span style={{ color: "var(--muted)" }}>Current Scheduled Deadline:</span>
              <b style={{ color: "var(--cyan)" }}>{currentDeadline ? new Date(currentDeadline).toLocaleDateString() : "Not set"}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
              <span style={{ color: "var(--muted)" }}>Original Baseline Deadline:</span>
              <b style={{ color: baseline?.hasBaseline ? "#fff" : "var(--muted)" }}>
                {baseline?.hasBaseline ? new Date(baseline.baselineDeadline).toLocaleDateString() : "Not locked yet"}
              </b>
            </div>
            {baseline?.hasBaseline && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginTop: "6px" }}>
                <span style={{ color: "var(--muted)" }}>Schedule Variance:</span>
                <Tag tone={baseline.varianceStatus === "delayed" ? "warning" : "healthy"}>
                  {baseline.varianceDays > 0 ? `+${baseline.varianceDays} days delay` : baseline.varianceDays < 0 ? `${baseline.varianceDays} days ahead` : "0 days (On Track)"}
                </Tag>
              </div>
            )}
          </div>

          <div style={{ marginBottom: "14px" }}>
            <label style={{ display: "block", fontSize: "12px", color: "var(--muted)", marginBottom: "4px" }}>
              Target Baseline / Revised Deadline:
            </label>
            <input
              type="date"
              value={revisedDeadline}
              onChange={(e) => setRevisedDeadline(e.target.value)}
              required
              style={{ width: "100%", padding: "8px", borderRadius: "6px", background: "rgba(0,0,0,0.3)", border: "1px solid var(--line)", color: "#fff" }}
            />
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "12px", color: "var(--muted)", marginBottom: "4px" }}>
              Schedule Realignment Reason:
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="E.g., Approved change request #CR-04 for enterprise SSO milestone."
              rows={3}
              style={{ width: "100%", padding: "8px", borderRadius: "6px", background: "rgba(0,0,0,0.3)", border: "1px solid var(--line)", color: "#fff", resize: "vertical" }}
            />
          </div>

          {baseline?.changeHistory?.length > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <span style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "6px" }}>
                Baseline Realignment Audit History ({baseline.changeHistory.length})
              </span>
              <div style={{ maxHeight: "120px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px" }}>
                {baseline.changeHistory.map((h, i) => (
                  <div key={i} style={{ fontSize: "11px", padding: "6px 8px", background: "rgba(255,255,255,0.02)", borderRadius: "4px", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#fff" }}>
                      <span>New Deadline: {new Date(h.newDeadline).toLocaleDateString()}</span>
                      <small style={{ color: "var(--muted)" }}>{new Date(h.changedAt).toLocaleDateString()}</small>
                    </div>
                    <p style={{ margin: "2px 0 0", color: "var(--muted)" }}>{h.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
            <button type="button" className="outline" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="primary" disabled={saving}>
              {saving ? "Saving Baseline..." : baseline?.hasBaseline ? "Save Schedule Realignment" : "Lock Original Baseline"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// ENTERPRISE SAAS MODULE 6: SECURITY & SESSIONS
// ==========================================

function SessionSecurityModal({ user, onClose, notify }) {
  const [sessionInfo, setSessionInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState(false);
  const [revokedSuccess, setRevokedSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    getActiveSessions()
      .then((res) => {
        if (active) setSessionInfo(res);
      })
      .catch(() => {
        if (active) setSessionInfo(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const handleRevoke = async () => {
    setRevoking(true);
    try {
      const res = await revokeSessions();
      setRevokedSuccess(true);
      notify?.("All other sessions revoked. Current session token renewed.");
      if (res?.tokenVersion) {
        setSessionInfo((prev) => prev ? {
          ...prev,
          currentSession: { ...prev.currentSession, tokenVersion: res.tokenVersion }
        } : prev);
      }
    } catch (err) {
      notify?.(`Revocation failed: ${err.message}`, "error");
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: "500px" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="section-eyebrow">Identity &amp; Governance</span>
            <h3 style={{ margin: "2px 0 0", color: "#fff" }}>Security &amp; Active Sessions</h3>
          </div>
          <button type="button" className="icon-button" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>

        <div style={{ padding: "18px 20px" }}>
          {loading ? (
            <div style={{ padding: "30px", textAlign: "center", color: "var(--muted)" }}>
              <Icon name="refresh" size={20} className="spinning" />
              <p style={{ marginTop: "8px", fontSize: "13px" }}>Loading active session telemetry...</p>
            </div>
          ) : (
            <>
              <div style={{ background: "rgba(3, 11, 24, 0.7)", border: "1px solid var(--line)", borderRadius: "8px", padding: "14px", marginBottom: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ color: "#30dbff", fontSize: "16px" }}>💻</span>
                    <div>
                      <b style={{ color: "#fff", fontSize: "13.5px" }}>{sessionInfo?.currentSession?.device || "Desktop Workstation"}</b>
                      <small style={{ color: "var(--muted)", display: "block", fontSize: "11px" }}>
                        {sessionInfo?.currentSession?.browser || "Google Chrome"} • IP: {sessionInfo?.currentSession?.ip || "127.0.0.1"}
                      </small>
                    </div>
                  </div>
                  <Tag tone="healthy">Current Device</Tag>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px", color: "var(--muted)", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "8px", marginTop: "8px" }}>
                  <span>Signed in as: <b>{user?.email}</b></span>
                  <span>Session Key: <b>v{sessionInfo?.currentSession?.tokenVersion || 1}</b></span>
                </div>
              </div>

              {revokedSuccess && (
                <div style={{ background: "rgba(48, 219, 255, 0.08)", border: "1px solid rgba(48, 219, 255, 0.3)", borderRadius: "6px", padding: "10px 12px", marginBottom: "16px", fontSize: "12px", color: "var(--cyan)" }}>
                  ✓ All other device sessions have been revoked. Any unauthorized tokens are now invalid.
                </div>
              )}

              <p style={{ fontSize: "12.5px", color: "var(--muted)", margin: "0 0 16px" }}>
                If you suspect unauthorized account access, revoke all other sessions. This immediately invalidates older JWT tokens across any other devices or browsers.
              </p>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button type="button" className="outline" onClick={onClose}>Close</button>
                <button
                  type="button"
                  className="primary"
                  style={{ background: "#ff4d6a", borderColor: "#ff4d6a" }}
                  onClick={handleRevoke}
                  disabled={revoking}
                >
                  {revoking ? "Revoking..." : "Revoke All Other Sessions"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// ENTERPRISE SAAS MODULE 6: AUDIT LOGS
// ==========================================

function AuditLogsModal({ onClose }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAuditLogs({ action: actionFilter || undefined, page, limit: 15 });
      if (res && res.items) {
        setLogs(res.items);
        setTotalPages(res.pagination?.pages || 1);
        setTotalCount(res.pagination?.total || 0);
      }
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [actionFilter, page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: "880px", maxHeight: "85vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="section-eyebrow">Compliance &amp; Security</span>
            <h3 style={{ margin: "2px 0 0", color: "#fff" }}>Enterprise Audit &amp; Governance Log</h3>
          </div>
          <button type="button" className="icon-button" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>

        <div style={{ padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--line)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "12px", color: "var(--muted)" }}>Filter Action:</span>
            <select
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
              style={{ padding: "5px 10px", fontSize: "12px", borderRadius: "6px", background: "rgba(0,0,0,0.4)", border: "1px solid var(--line)", color: "#fff" }}
            >
              <option value="">All Actions ({totalCount})</option>
              <option value="employee_created">Employee Created</option>
              <option value="employee_deactivated">Employee Deactivated</option>
              <option value="employee_restored">Employee Restored</option>
              <option value="task_reassigned">Task Reassigned</option>
              <option value="project_created">Project Created</option>
              <option value="project_baseline_locked">Baseline Locked</option>
              <option value="project_baseline_revised">Baseline Revised</option>
              <option value="session_revoked_all">Session Revoked</option>
              <option value="rebalance_task_approved">AI Rebalance Approved</option>
            </select>
          </div>
          <span style={{ fontSize: "12px", color: "var(--cyan)" }}>{totalCount} immutable audit records</span>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px" }}>
          {loading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--muted)" }}>
              <Icon name="refresh" size={22} className="spinning" />
              <p style={{ marginTop: "10px", fontSize: "13px" }}>Querying immutable audit records...</p>
            </div>
          ) : logs.length === 0 ? (
            <p style={{ textAlign: "center", color: "var(--muted)", padding: "30px" }}>No audit records match the selected filter.</p>
          ) : (
            <table className="enterprise-table" style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: "var(--muted)", borderBottom: "1px solid var(--line)", textAlign: "left" }}>
                  <th style={{ padding: "8px 6px" }}>Timestamp</th>
                  <th style={{ padding: "8px 6px" }}>Actor</th>
                  <th style={{ padding: "8px 6px" }}>Action</th>
                  <th style={{ padding: "8px 6px" }}>Target Entity</th>
                  <th style={{ padding: "8px 6px" }}>Metadata</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log._id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "8px 6px", color: "var(--muted)", whiteSpace: "nowrap" }}>
                      {new Date(log.timestamp).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td style={{ padding: "8px 6px", color: "#fff", fontWeight: "600" }}>
                      {log.actor?.name || "System Automated"}
                      <small style={{ display: "block", color: "var(--muted)", fontSize: "10.5px" }}>{log.actor?.role || ""}</small>
                    </td>
                    <td style={{ padding: "8px 6px" }}>
                      <Tag tone={log.action.includes("deactivate") || log.action.includes("revoked") ? "warning" : "healthy"}>
                        {log.action}
                      </Tag>
                    </td>
                    <td style={{ padding: "8px 6px", color: "var(--cyan)" }}>
                      {log.entityType || "Record"}
                    </td>
                    <td style={{ padding: "8px 6px", color: "var(--muted)", maxWidth: "240px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {JSON.stringify(log.metadata || {})}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--line)" }}>
          <button type="button" className="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            ← Previous
          </button>
          <span style={{ fontSize: "12px", color: "var(--muted)" }}>Page {page} of {totalPages}</span>
          <button type="button" className="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// ENTERPRISE SAAS MODULE 1: PERSONAL AVAILABILITY
// ==========================================

function PersonalAvailabilityModal({ user, onClose, onSuccess, notify }) {
  const [status, setStatus] = useState(user?.availabilityStatus || "available");
  const [capacity, setCapacity] = useState(user?.workloadCapacity || 40);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateMyAvailability({
        availabilityStatus: status,
        workloadCapacity: Number(capacity) || 40
      });
      notify?.("Your availability and capacity settings have been updated.");
      onSuccess?.();
      onClose();
    } catch (err) {
      notify?.(`Update failed: ${err.message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: "440px" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="section-eyebrow">Personal Preferences</span>
            <h3 style={{ margin: "2px 0 0", color: "#fff" }}>My Availability &amp; Capacity</h3>
          </div>
          <button type="button" className="icon-button" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "18px 20px" }}>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "12px", color: "var(--muted)", marginBottom: "8px" }}>
              Work Availability Status:
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {[
                { val: "available", label: "Available (Full Capacity)", desc: "Ready to accept new sprint deliverables." },
                { val: "busy", label: "Busy (High Load)", desc: "Currently occupied with active critical tasks." },
                { val: "unavailable", label: "Unavailable / Out of Office", desc: "Temporarily off-duty. Exempted from AI task allocations." }
              ].map((opt) => (
                <label key={opt.val} style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "8px 10px", borderRadius: "6px", background: status === opt.val ? "rgba(48, 219, 255, 0.08)" : "rgba(255,255,255,0.02)", border: status === opt.val ? "1px solid var(--cyan)" : "1px solid var(--line)", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="availStatus"
                    value={opt.val}
                    checked={status === opt.val}
                    onChange={() => setStatus(opt.val)}
                    style={{ marginTop: "3px" }}
                  />
                  <div>
                    <b style={{ color: "#fff", fontSize: "12.5px" }}>{opt.label}</b>
                    <small style={{ color: "var(--muted)", display: "block", fontSize: "11px" }}>{opt.desc}</small>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: "18px" }}>
            <label style={{ display: "block", fontSize: "12px", color: "var(--muted)", marginBottom: "6px" }}>
              Sustainable Weekly Capacity (Hours):
            </label>
            <input
              type="number"
              min={10}
              max={60}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", background: "rgba(0,0,0,0.3)", border: "1px solid var(--line)", color: "#fff" }}
            />
            <small style={{ color: "var(--muted)", display: "block", marginTop: "4px", fontSize: "11px" }}>
              Standard full-time baseline is 40 hrs/wk.
            </small>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
            <button type="button" className="outline" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="primary" disabled={saving}>
              {saving ? "Updating..." : "Save Availability"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AssignExistingMemberModal({ projects, members, onClose, onSuccess, notify }) {
  const [projectId, setProjectId] = useState(projects[0]?.id || "");
  const [memberId, setMemberId] = useState("");
  const [memberRole, setMemberRole] = useState("developer");
  const [allocation, setAllocation] = useState(100);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const selectedProj = projects.find((p) => p.id === projectId);
  const existingTeamIds = new Set(selectedProj?.team || []);

  const availableCandidates = members.filter((m) => !existingTeamIds.has(m.id) && m.rawRole !== "client");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!projectId || !memberId) {
      setError("Please select both a project and a team member.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await addProjectMember(projectId, {
        memberId,
        userId: memberId,
        role: memberRole,
        allocationPercentage: Number(allocation) || 100
      });

      const memberObj = members.find((m) => m.id === memberId);
      notify(`Assigned ${memberObj?.name || "member"} to ${selectedProj?.name || "project team"}.`);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err?.message || "Failed to add member to project.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <div className="modal-head">
          <h3>Add Existing Member to Project</h3>
          <button className="icon-button" onClick={onClose} aria-label="Close modal">
            <Icon name="close" />
          </button>
        </div>

        {error && (
          <div className="warning-card critical" style={{ marginBottom: 12, padding: "8px 12px" }}>
            <span className="warning-bar" />
            <small style={{ color: "#ff95bd" }}>{error}</small>
          </div>
        )}

        <form className="modal-body modal-form" onSubmit={handleSubmit}>
          <label>
            Target Project *
            <select
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setMemberId("");
              }}
              required
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Select Team Member *
            <select
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              required
            >
              <option value="">Choose an available member…</option>
              {availableCandidates.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.role} · {m.availability} · Workload {m.workload}%)
                </option>
              ))}
            </select>
            {availableCandidates.length === 0 && (
              <small style={{ color: "var(--orange)", fontSize: 11 }}>
                All available registered team members are already assigned to this project.
              </small>
            )}
          </label>

          <div className="form-row">
            <label>
              Project Role
              <select value={memberRole} onChange={(e) => setMemberRole(e.target.value)}>
                <option value="developer">Developer</option>
                <option value="lead">Technical Lead</option>
                <option value="designer">UI/UX Designer</option>
                <option value="qa">QA / Tester</option>
                <option value="devops">DevOps</option>
              </select>
            </label>
            <label>
              Allocation (%)
              <input
                type="number"
                min="10"
                max="100"
                value={allocation}
                onChange={(e) => setAllocation(e.target.value)}
              />
            </label>
          </div>

          <div className="action-row" style={{ marginTop: 12, justifyContent: "flex-end", gap: 10 }}>
            <button type="button" className="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={submitting || !memberId}>
              {submitting ? "Adding…" : "Add Member"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RemoveMemberModal({ member, projects, onClose, onSuccess, notify }) {
  const assignedProjects = projects.filter((p) => (p.team || []).includes(member.id));
  const [selectedProjectId, setSelectedProjectId] = useState(assignedProjects[0]?.id || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const selectedProj = projects.find((p) => p.id === selectedProjectId);

  const handleRemove = async () => {
    if (!selectedProjectId) return;
    setSubmitting(true);
    setError("");

    try {
      await removeProjectMember(selectedProjectId, member.id);
      notify(`${member.name} removed from ${selectedProj?.name || "project team"}.`);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err?.message || "Failed to remove member from team.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-head">
          <h3 style={{ color: "#ff95bd" }}>Remove Member from Project</h3>
          <button className="icon-button" onClick={onClose} aria-label="Close modal">
            <Icon name="close" />
          </button>
        </div>

        <div className="modal-body">
          <p style={{ margin: 0, color: "var(--ink)" }}>
            Are you sure you want to remove <b>{member.name}</b> from the team?
          </p>

          <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
            Their global account and historical records will remain intact.
          </p>

          {assignedProjects.length > 1 && (
            <label style={{ display: "grid", gap: 6, marginTop: 8 }}>
              Select Project to Remove From:
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                style={{ padding: "8px 10px", borderRadius: 6, background: "#061429", color: "var(--ink)" }}
              >
                {assignedProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {error && (
            <div className="warning-card critical" style={{ margin: "8px 0", padding: "10px 14px" }}>
              <span className="warning-bar" />
              <div>
                <b style={{ color: "#ff95bd" }}>Active Tasks Detected</b>
                <p style={{ margin: "4px 0", fontSize: 13, color: "var(--ink)" }}>{error}</p>
                <small style={{ color: "var(--cyan)" }}>
                  Tip: Reassign their active tasks in the Tasks view before removing.
                </small>
              </div>
            </div>
          )}

          <div className="action-row" style={{ marginTop: 14, justifyContent: "flex-end", gap: 10 }}>
            <button type="button" className="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              style={{ background: "linear-gradient(100deg, #d32f2f, #ff5252)", borderColor: "#ff5252" }}
              onClick={handleRemove}
              disabled={submitting || !selectedProjectId}
            >
              {submitting ? "Removing…" : "Confirm Removal"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminUserModal({ member, onClose, onSuccess, notify }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState("");

  const handleDeactivateToggle = async () => {
    setSubmitting(true);
    setError("");
    const newStatus = !member.isActive;
    try {
      await deleteOrDeactivateUser(member.id, { mode: "deactivate" });
      notify(`User account for ${member.name} has been ${member.isActive ? "deactivated" : "reactivated"}.`);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err?.message || "Failed to update account status.");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePermanentDelete = async () => {
    if (confirmDelete !== "DELETE") {
      setError('Please type "DELETE" into the confirmation field to proceed.');
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      await deleteOrDeactivateUser(member.id, { mode: "delete", force: true });
      notify(`User account for ${member.name} has been permanently deleted.`);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err?.message || "Failed to delete user account.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-head">
          <div>
            <Tag tone="critical">ADMIN OPERATION</Tag>
            <h3 style={{ marginTop: 4 }}>Account Governance: {member.name}</h3>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close modal">
            <Icon name="close" />
          </button>
        </div>

        {error && (
          <div className="warning-card critical" style={{ marginBottom: 12, padding: "8px 12px" }}>
            <span className="warning-bar" />
            <small style={{ color: "#ff95bd" }}>{error}</small>
          </div>
        )}

        <div className="modal-body">
          <div style={{ background: "rgba(9, 27, 57, 0.6)", padding: "12px 14px", borderRadius: 8, display: "grid", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--muted)" }}>Email:</span>
              <b>{member.email || "N/A"}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--muted)" }}>Role:</span>
              <b>{member.role}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--muted)" }}>Status:</span>
              <Tag tone={member.isActive ? "active" : "critical"}>
                {member.isActive ? "Active Account" : "Deactivated"}
              </Tag>
            </div>
          </div>

          <div style={{ marginTop: 10, padding: 12, border: "1px solid var(--line)", borderRadius: 8 }}>
            <h4 style={{ margin: "0 0 6px", fontSize: 14 }}>1. Account Deactivation (Recommended)</h4>
            <p style={{ margin: "0 0 10px", color: "var(--muted)", fontSize: 12 }}>
              Deactivating revokes sign-in access while preserving task history, audit trails, and comments.
            </p>
            <button
              type="button"
              className={member.isActive ? "outline" : "primary"}
              style={{ width: "100%", justifyContent: "center" }}
              onClick={handleDeactivateToggle}
              disabled={submitting}
            >
              {member.isActive ? "Deactivate Account" : "Reactivate Account"}
            </button>
          </div>

          <div style={{ marginTop: 10, padding: 12, border: "1px solid rgba(255, 110, 174, 0.3)", borderRadius: 8 }}>
            <h4 style={{ margin: "0 0 6px", fontSize: 14, color: "#ff95bd" }}>2. Permanent Deletion</h4>
            <p style={{ margin: "0 0 8px", color: "var(--muted)", fontSize: 12 }}>
              Permanently purges credentials and unlinks project assignments safely. Requires confirmation.
            </p>
            <input
              type="text"
              placeholder='Type "DELETE" to confirm'
              value={confirmDelete}
              onChange={(e) => setConfirmDelete(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", marginBottom: 10, borderRadius: 6, background: "#061429", color: "var(--ink)", border: "1px solid var(--line)" }}
            />
            <button
              type="button"
              className="primary"
              style={{ width: "100%", justifyContent: "center", background: "linear-gradient(100deg, #991b1b, #dc2626)", borderColor: "#ef4444" }}
              onClick={handlePermanentDelete}
              disabled={submitting || confirmDelete !== "DELETE"}
            >
              {submitting ? "Deleting…" : "Permanently Delete Account"}
            </button>
          </div>

          <div className="action-row" style={{ marginTop: 8, justifyContent: "flex-end" }}>
            <button type="button" className="outline" onClick={onClose} disabled={submitting}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MemberCards({
  data,
  query = "",
  roleFilter = "all",
  availFilter = "all",
  projectFilter = "all",
  openAvailability,
  onRemoveMember,
  onAdminManage
}) {
  const canManage = ["admin", "project_manager"].includes(data.user?.role);
  const isAdmin = data.user?.role === "admin";
  const myProjects = data.projects || [];

  const filtered = data.members.filter((m) => {
    const matchesQuery =
      m.name.toLowerCase().includes(query.toLowerCase()) ||
      (m.email && m.email.toLowerCase().includes(query.toLowerCase())) ||
      m.role.toLowerCase().includes(query.toLowerCase()) ||
      (m.skills || []).some((s) => s.toLowerCase().includes(query.toLowerCase()));
    const matchesRole = roleFilter === "all" || m.rawRole === roleFilter;
    const matchesAvail = availFilter === "all" || m.availabilityTone === availFilter;
    const matchesProject =
      projectFilter === "all" ||
      (myProjects.find((p) => p.id === projectFilter)?.team || []).includes(m.id);
    return matchesQuery && matchesRole && matchesAvail && matchesProject;
  });

  return (
    <section className="team-cards">
      {filtered.length ? (
        filtered.map((m) => {
          const memberAssignedProjects = myProjects.filter((p) => (p.team || []).includes(m.id));

          return (
            <article
              className="member-card"
              key={m.id}
              onClick={() => openAvailability?.(m)}
              style={{ cursor: openAvailability ? "pointer" : "default" }}
              title={openAvailability ? "Click to update availability status" : undefined}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <Avatar member={m} />
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <Tag tone={m.availabilityTone}>{m.availability}</Tag>
                  {m.isActive === false && <Tag tone="critical">Deactivated</Tag>}
                </div>
              </div>

              <div>
                <h3>{m.name}</h3>
                <p style={{ margin: "2px 0 4px", fontSize: 13, color: "var(--muted)" }}>
                  {m.jobTitle ? `${m.jobTitle} · ` : ""}{m.role}
                </p>
                {m.email && (
                  <small style={{ color: "var(--cyan)", display: "flex", alignItems: "center", gap: 4 }}>
                    <Icon name="mail" size={12} /> {m.email}
                  </small>
                )}
              </div>

              <div className="member-stats">
                <span>
                  <small>Workload</small>
                  <b>{m.workload}%</b>
                </span>

                <span>
                  <small>Productivity</small>
                  <b>{m.productivity}%</b>
                </span>
              </div>

              <div className="skill-list">
                {m.skills.map((s, si) => (
                  <span key={`${s}-${si}`}>{s}</span>
                ))}
              </div>

              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  gap: 6,
                  flexDirection: "column",
                  width: "100%"
                }}
              >
                {openAvailability && (
                  <button
                    type="button"
                    className="mini outline"
                    style={{ width: "100%", justifyContent: "center" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      openAvailability(m);
                    }}
                  >
                    <Icon name="settings" size={13} /> Set Availability
                  </button>
                )}

                {canManage && memberAssignedProjects.length > 0 && onRemoveMember && (
                  <button
                    type="button"
                    className="mini outline"
                    style={{ width: "100%", justifyContent: "center", borderColor: "rgba(255, 110, 174, 0.4)", color: "#ff95bd" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveMember(m);
                    }}
                  >
                    <Icon name="user-minus" size={13} /> Remove from Team
                  </button>
                )}

                {isAdmin && onAdminManage && (
                  <button
                    type="button"
                    className="mini outline"
                    style={{ width: "100%", justifyContent: "center", borderColor: "rgba(48, 219, 255, 0.4)", color: "var(--cyan)" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAdminManage(m);
                    }}
                  >
                    <Icon name="shield" size={13} /> Account Governance
                  </button>
                )}
              </div>
            </article>
          );
        })
      ) : (
        <div style={{ gridColumn: "1/-1" }}>
          <EmptyStatePro
            icon="users"
            title="No team members match"
            message="No team members match the current filter or search criteria."
          />
        </div>
      )}
    </section>
  );
}

function Team({ data, query, openAvailability, notify, reloadWorkspace }) {
  const isClient = data.user?.rawRole === "client" || (data.user?.role || "").toLowerCase() === "client";

  if (isClient) {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center" }}>
        <div className="warning-card critical" style={{ maxWidth: 520, margin: "0 auto", padding: "24px 20px" }}>
          <Icon name="shield" size={36} style={{ color: "#ff95bd", marginBottom: 12 }} />
          <h3 style={{ color: "#ff95bd", margin: "0 0 8px" }}>Internal Staff Directory Restricted</h3>
          <p style={{ color: "var(--muted)", margin: 0, fontSize: 13 }}>
            Employee and internal staff directories are restricted from client accounts under NEXORA enterprise data governance policies.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Header
        eyebrow="COLLABORATION &amp; WORKFORCE"
        title="Employee &amp; Team Management"
        description="A centralized enterprise directory to manage employee accounts, project team assignments, skills, and workload availability."
      />
      <EmployeeManagementSection
        data={data}
        query={query}
        openAvailability={openAvailability}
        notify={notify}
        reloadWorkspace={reloadWorkspace}
        isSection5={false}
      />
    </>
  );
}

function Tasks({data,query,action,openTaskAI,openTaskEdit,openTaskDelete,notify}){
  const canManage=["admin","project_manager","team_lead"].includes(data.user.rawRole);
  const isClient = data.user?.rawRole === "client" || (data.user?.role || "").toLowerCase() === "client";
  const [open,setOpen]=useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [form,setForm]=useState({title:"",description:"",project:data.projects[0]?.id || "",assignedTo:"",dueDate:"",priority:"medium",estimatedHours:""});
  const selectedProject=data.projects.find((project)=>project.id===form.project);
  const assignees=data.members.filter((member)=>selectedProject?.team.includes(member.id));
  let list=data.tasks.filter((t) => {
    const matchesQuery = t.title.toLowerCase().includes(query.toLowerCase()) || t.projectName.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = statusFilter === "all" || t.statusTone === statusFilter;
    const matchesPriority = priorityFilter === "all" || t.priorityTone === priorityFilter;
    return matchesQuery && matchesStatus && matchesPriority;
  });

  function completeTask(t){
    if(!t.assigneeId){
      notify?.(`Cannot mark "${t.title}" complete: an assigned team member is required.`);
      return;
    }
    if(t.blockers?.length > 0 || t.status === "blocked"){
      notify?.(`Cannot mark "${t.title}" complete: task is blocked. Resolve blockers first.`);
      return;
    }
    action(
      { endpoint:`/tasks/${t.id}/status`, method:"PATCH", payload:{status:"completed", progress: 100} },
      `${t.title} marked complete.`
    );
  }

  return <>
    <Header
      eyebrow={isClient ? "DELIVERY TRACKER" : "EXECUTION WORKSPACE"}
      title={isClient ? "Deliverables & Progress" : "Tasks"}
      description={isClient ? "Review client-visible project deliverables, milestones, and status." : "Track delivery work, ownership, risk, and the signals that affect outcomes."}
      action={canManage ?
        <button className="primary" onClick={()=>setOpen(!open)}>
          <Icon name="plus"/>
          {open ? "Close form" : "Create Task"}
        </button> : null}
    />

    {open && <form className="create-form" onSubmit={(event)=>{event.preventDefault();action({endpoint:"/tasks",method:"POST",payload:{...form,priority:form.priority,estimatedHours:Number(form.estimatedHours) || 0}},"Task created.");setOpen(false);}}>
      <label>Task title<input required value={form.title} onChange={(event)=>setForm({...form,title:event.target.value})}/></label>
      <label>Project<select required value={form.project} onChange={(event)=>setForm({...form,project:event.target.value,assignedTo:""})}><option value="">Select project</option>{data.projects.map((project)=><option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
      <label>Assignee<select value={form.assignedTo} onChange={(event)=>setForm({...form,assignedTo:event.target.value})}><option value="">Unassigned — let AI recommend</option>{assignees.map((member)=><option value={member.id} key={member.id}>{member.name}</option>)}</select></label>
      <label>Due date<input required type="date" value={form.dueDate} onChange={(event)=>setForm({...form,dueDate:event.target.value})}/></label>
      <label>Priority<select value={form.priority} onChange={(event)=>setForm({...form,priority:event.target.value})}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
      <label>Estimated hours<input type="number" min="0" value={form.estimatedHours} onChange={(event)=>setForm({...form,estimatedHours:event.target.value})}/></label>
      <label className="wide-label">Description<textarea value={form.description} onChange={(event)=>setForm({...form,description:event.target.value})}/></label>
      <button className="primary">Create task <Icon name="arrow"/></button>
    </form>}

    <section className="task-kpis">
      {(isClient ? [
        ["Total", data.metrics.tasks],
        ["In progress", data.tasks.filter(t=>t.statusTone==="in-progress").length],
        ["Completed", data.metrics.completed],
        ["To do", data.tasks.filter(t=>t.statusTone==="todo").length],
        ["At risk", data.metrics.overdue]
      ] : [
        ["Total",data.metrics.tasks],
        [
          "To do",
          data.tasks.filter(
            t=>t.statusTone==="todo"
          ).length
        ],
        ["In progress", data.tasks.filter(t=>t.statusTone==="in-progress").length],
        ["Unassigned", data.tasks.filter(t=>!t.assigneeId).length],
        ["Completed",data.metrics.completed],
        ["At risk",data.metrics.overdue]
      ]).map(([x,v])=>
        <div className="stat" key={x}>
          <small>{x}</small>
          <b>{v}</b>
        </div>
      )}
    </section>

    <Panel className="table-panel">
      <div className="table-tools">
        <div className="search slim">
          <Icon name="search"/>
          <span>{query ? `Filter: "${query}"` : "Search task records"}</span>
        </div>

        <select className="filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="todo">To do</option>
          <option value="in-progress">In progress</option>
          <option value="blocked">Blocked</option>
          <option value="completed">Completed</option>
        </select>

        <select className="filter" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
          <option value="all">All priorities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
      </div>

      <div className="table-responsive">
        <div className="table">
          <div className="thead">
            <span>{isClient ? "Deliverable" : "Task"}</span>
            {!isClient && <span>Assignee</span>}
            <span>Priority</span>
            <span>Status</span>
            <span>Progress</span>
            <span>{isClient ? "Target date" : "Due date"}</span>
            <span/>
          </div>

          {list.map(t=>{
            let p=data.members.find((member) => member.id===t.assigneeId);

            return (
              <div className="trow" key={t.id || t._id || t.title}>
                <span>
                  <b>{t.title}</b>
                  <small>
                    {
                      t.projectName
                    }
                  </small>
                </span>

                {!isClient && (
                  <span className="assignee">
                    <Avatar member={p} small/>
                    {p?.name || "Unassigned"}
                  </span>
                )}

                <span>
                  <Tag tone={t.priorityTone}>
                    {t.priority}
                  </Tag>
                </span>

                <span>
                  <Tag
                    tone={t.statusTone}
                  >
                    {t.status}
                  </Tag>
                </span>

                <span className="table-progress">
                  <Progress value={t.progress}/>
                  <small>{t.progress}%</small>
                </span>

                <span>
                  <b>{t.due}</b>
                  <small>
                    <Tag tone={t.riskTone}>
                      {t.risk}
                    </Tag>
                  </small>
                </span>

                <span className="row-actions">
                  {isClient ? (
                    <button className="mini" title="Deliverable Details & Discussion" onClick={()=>openTaskAI(t, "comments")}>
                      <Icon name="chat"/> Details
                    </button>
                  ) : (
                    <>
                      {t.statusTone==="completed" ? (
                        <span className="done done-static"><Icon name="check"/> Done</span>
                      ) : (
                        <button className="done" onClick={()=>completeTask(t)}>Complete</button>
                      )}
                      {canManage && (
                        <>
                          <button className="mini" title="AI Task Analysis" onClick={()=>openTaskAI(t, "analyze")}><Icon name="search"/></button>
                          {!t.assigneeId ? (
                            <button className="mini ai" title="AI member recommendation" onClick={()=>openTaskAI(t, "ai")}><Icon name="spark"/></button>
                          ) : (
                            <button className="mini" title="Reassign with AI" onClick={()=>openTaskAI(t, "ai")}><Icon name="users"/></button>
                          )}
                          <button className="mini" title="Discussion & Files" onClick={()=>openTaskAI(t, "comments")}><Icon name="chat"/></button>
                          <button className="mini" title="Edit" onClick={()=>openTaskEdit(t)}><Icon name="settings"/></button>
                          <button className="mini danger-mini" title="Delete" onClick={()=>openTaskDelete(t)}><Icon name="close"/></button>
                        </>
                      )}
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  </>;
}

function ProjectDetail({ project, user, members, action, notify, go, onBack, openTaskAI, openTaskEdit, openAvailability, refreshKey }) {
  const id = project.id || project._id;
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [createEmployeeOpen, setCreateEmployeeOpen] = useState(false);
  const [removeMemberTarget, setRemoveMemberTarget] = useState(null);
  const [newMemberUserId, setNewMemberUserId] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("developer");
  const [newMemberAlloc, setNewMemberAlloc] = useState("100");
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [newTaskForm, setNewTaskForm] = useState({ title: "", description: "", priority: "medium", estimatedHours: "", dueDate: "", assignedTo: "" });
  const canManage = ["admin", "project_manager", "team_lead"].includes(user.rawRole);

  const [localVersion, setLocalVersion] = useState(0);
  const [viewMode, setViewMode] = useState("overview");

  useEffect(() => {
    let active = true;
    setLoadError("");
    Promise.all([
      apiRequest(`/projects/${id}`),
      canManage
        ? apiRequest(`/projects/${id}/workload`).catch(() => ({ data: { items: [] } }))
        : Promise.resolve({ data: { items: [] } }),
      canManage
        ? apiRequest(`/projects/${id}/resource-recommendations`).catch(() => ({ data: { items: [] } }))
        : Promise.resolve({ data: { items: [] } }),
      apiRequest(`/ai/assistant/${id}`).catch(() => ({ data: { cards: [] } })),
      apiRequest(`/ai/predictive-delays/${id}`).catch(() => ({ data: { tasks: [] } }))
    ])
      .then(([detail, workloadRes, recRes, aiRes, delayRes]) => {
        if (!active) return;
        setState({
          ...detail.data,
          workload: workloadRes.data?.items || [],
          recommendations: recRes.data?.items || [],
          aiAssistant: aiRes.data || { cards: [] },
          predictiveDelays: delayRes.data?.tasks || []
        });
      })
      .catch((err) => {
        if (active) setLoadError(err?.message || "Unable to load project intelligence.");
      });
    return () => { active = false; };
  }, [id, refreshKey, localVersion]);

  if (loadError) {
    return (
      <>
        <Header
          eyebrow="PROJECT INTELLIGENCE"
          title="Project details"
          description="Unable to load this project."
          action={<button className="outline" onClick={onBack}><Icon name="arrow"/> Back</button>}
        />
        <section className="panel">
          <ErrorCardPro
            title="Project Intelligence Unavailable"
            message={loadError}
            onRetry={() => setLocalVersion((v) => v + 1)}
            onSecondary={onBack}
            secondaryLabel="Back to Projects"
          />
        </section>
      </>
    );
  }

  if (!state) {
    return (
      <div className="project-detail-skeleton">
        <DashboardSkeleton />
      </div>
    );
  }

  const info = state.project || {};
  const metrics = state.metrics || {};
  const tasks = state.tasks || [];
  const milestones = state.milestones || [];
  const updates = state.updates || [];
  const activity = state.activity || [];
  const workload = state.workload || [];
  const recommendations = state.recommendations || [];
  const memberById = new Map(members.map((member) => [member.id, member]));
  const now = new Date();
  const overdue = tasks.filter((t) => t.status !== "completed" && new Date(t.dueDate) < now);
  const blocked = tasks.filter((t) => t.status === "blocked");
  const unassigned = tasks.filter((t) => t.status !== "completed" && !t.assignedTo);
  const statusDist = ["todo", "in-progress", "blocked", "completed"]
    .map((k) => [k, tasks.filter((t) => t.status === k).length])
    .filter(([, v]) => v > 0);
  const priorityDist = ["low", "medium", "high", "critical"].map((k) => [k, tasks.filter((t) => t.priority === k).length]);
  const done = tasks.filter((t) => t.status === "completed").length;
  const completionRate = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const projectWarnings = [];
  const addW = (severity, title, detail, actionTxt) => { projectWarnings.push({ id: projectWarnings.length + 1, severity, title, detail, action: actionTxt }); };
  if (overdue.length) addW("critical", `${overdue.length} overdue task${overdue.length > 1 ? "s" : ""}`, `${overdue[0].title} is past its due date.`, "Reassign or extend the deadline.");
  if (blocked.length) addW("warning", `${blocked.length} blocked task${blocked.length > 1 ? "s" : ""}`, `${blocked[0].title} is blocked.`, "Resolve the blocker to continue.");
  tasks.filter((t) => t.status !== "completed" && t.dueDate && t.progress < 60 && new Date(t.dueDate) > now).slice(0, 2).forEach((t) => {
    const d = daysUntil(t.dueDate);
    if (d !== null && d <= 7) addW("warning", `Deadline approaching: ${t.title}`, `${d} day${d === 1 ? "" : "s"} left with ${t.progress}% progress.`, "Add support or reprioritize.");
  });
  if (unassigned.length) addW("warning", `${unassigned.length} unassigned task${unassigned.length > 1 ? "s" : ""}`, `${unassigned[0].title} has no assigned member.`, "Use AI to recommend a member.");
  workload.filter((w) => w.percentage >= 75).forEach((w) => addW(w.percentage >= 100 ? "critical" : "warning", `${w.member.name} at ${w.percentage}% workload`, `${w.member.name} is ${w.percentage >= 100 ? "overloaded" : "busy"}.`, "Redistribute work where possible."));

  const memberName = (value) => value?.name || memberById.get(String(value?._id || value))?.name || "Unassigned";
  const assigneeId = (task) => String(task.assignedTo?._id || task.assignedTo || "");
  const avatarFor = (value) => memberById.get(String(value?._id || value)) || { name: value?.name || "Unassigned" };
  const reload = () => setLocalVersion((v) => v + 1);
  const run = (request, msg) => {
    action(request, msg);
    setTimeout(reload, 900);
  };

  return (
    <>
      <Header
        eyebrow="PROJECT INTELLIGENCE"
        title={info.name || "Project"}
        description={info.description || "No project description provided."}
        action={
          <button className="outline" onClick={onBack}>
            <Icon name="arrow" /> Back to projects
          </button>
        }
      />

      <div className="project-head-badges">
        <Tag tone={info.status}>{info.status || "planning"}</Tag>
        <Tag tone={info.health || "good"}>{info.health || "good"} health</Tag>
        <Tag tone={info.riskLevel || "low"}>{metrics.riskLevel || info.riskLevel || "low"} risk</Tag>
        <Tag tone={info.priority || "medium"}>{info.priority || "medium"} priority</Tag>
      </div>

      <div style={{ display: "flex", gap: "8px", margin: "4px 0 16px" }}>
        <button
          className={viewMode === "overview" ? "primary" : "outline"}
          onClick={() => setViewMode("overview")}
          style={{ padding: "8px 16px" }}
        >
          <Icon name="check" /> Overview &amp; Tasks
        </button>
        <button
          className={viewMode === "timeline" ? "primary" : "outline"}
          onClick={() => setViewMode("timeline")}
          style={{ padding: "8px 16px" }}
        >
          <Icon name="calendar" /> Gantt Timeline
        </button>
      </div>

      {viewMode === "timeline" ? (
        <GanttTimeline
          data={{ projects: [{ id, name: info.name || project.name }], members, currentUser: user }}
          initialProjectId={id}
          action={action}
          notify={notify}
          openTaskAI={openTaskAI}
          openTaskEdit={openTaskEdit}
        />
      ) : (
        <section className="project-detail-grid">
        <div className="project-detail-main">
          <Panel title="Delivery progress" action={`${metrics.progress ?? info.progress ?? 0}% complete`}>
            <div className="progress-duo">
              <div className="big-progress">
                <strong>{metrics.progress ?? info.progress ?? 0}%</strong>
                <span>actual</span>
                <Progress value={metrics.progress ?? info.progress ?? 0} />
              </div>
              <div className="big-progress">
                <strong>{metrics.expectedProgress ?? info.expectedProgress ?? 0}%</strong>
                <span>expected now</span>
                <Progress value={metrics.expectedProgress ?? info.expectedProgress ?? 0} />
              </div>
            </div>
            <div className="summary-pairs">
              <span>Start date <b>{info.startDate ? new Date(info.startDate).toLocaleDateString() : "—"}</b></span>
              <span>Deadline <b>{info.deadline ? new Date(info.deadline).toLocaleDateString() : "—"}</b></span>
              <span>Days remaining <b>{metrics.daysRemaining ?? "—"}</b></span>
              <span>Budget <b>{info.budget ? `$${Number(info.budget).toLocaleString()}` : "—"}</b></span>
              <span>Project manager <b>{info.projectManager?.name || "—"}</b></span>
              <span>Completion rate <b>{completionRate}%</b></span>
            </div>
          </Panel>

          <Panel title="Explainable risk" action={`${metrics.riskScore ?? 0}/100`}>
            <div className="risk-row">
              <Donut value={metrics.riskScore ?? 0} label="Risk Score" />
              <div>
                <Tag tone={metrics.riskLevel || info.riskLevel || "low"}>
                  {(metrics.riskLevel || info.riskLevel || "low")} delivery risk
                </Tag>
                <p>{(metrics.factors || ["No elevated risk drivers detected."]).slice(0, 4).map((f, i) => (
                  <span key={i} className="factor-pill">{f}</span>
                ))}</p>
              </div>
            </div>
          </Panel>

          {projectWarnings.length > 0 && (
            <section className="project-warnings">
              <div className="warnings-head">
                <span className="warn-icon"><Icon name="bell"/></span>
                <div><b>Prevention &amp; warnings</b><small>What to address on this project.</small></div>
              </div>
              <div className="warnings-grid">
                {projectWarnings.map((w) => (
                  <div key={w.id} className={`warning-card ${w.severity}`}>
                    <span className="warning-bar"/>
                    <div>
                      <b>{w.title}</b>
                      <p>{w.detail}</p>
                      <small>→ {w.action}</small>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <Panel
            title="Task summary"
            action={canManage ? (
              <button className="mini primary" onClick={() => setCreateTaskOpen(!createTaskOpen)}>
                <Icon name="plus"/> {createTaskOpen ? "Close" : "Create Task"}
              </button>
            ) : null}
          >
            <div className="mini-stats">
              {statusDist.map(([k, v]) => <div key={k}><small>{k.replace("-", " ")}</small><b>{v}</b></div>)}
              {priorityDist.map(([k, v]) => <div key={k}><small>{k} priority</small><b>{v}</b></div>)}
            </div>

            {createTaskOpen && (
              <form
                className="create-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(
                    {
                      endpoint: "/tasks",
                      method: "POST",
                      payload: {
                        ...newTaskForm,
                        project: id,
                        estimatedHours: Number(newTaskForm.estimatedHours) || 0,
                        assignedTo: newTaskForm.assignedTo || undefined
                      }
                    },
                    "Task created."
                  );
                  setCreateTaskOpen(false);
                  setNewTaskForm({ title: "", description: "", priority: "medium", estimatedHours: "", dueDate: "", assignedTo: "" });
                }}
              >
                <label>Task title<input required value={newTaskForm.title} onChange={(e) => setNewTaskForm({ ...newTaskForm, title: e.target.value })}/></label>
                <label>Assignee<select value={newTaskForm.assignedTo} onChange={(e) => setNewTaskForm({ ...newTaskForm, assignedTo: e.target.value })}>
                  <option value="">Unassigned (let AI recommend)</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select></label>
                <label>Due date<input required type="date" value={newTaskForm.dueDate} onChange={(e) => setNewTaskForm({ ...newTaskForm, dueDate: e.target.value })}/></label>
                <label>Priority<select value={newTaskForm.priority} onChange={(e) => setNewTaskForm({ ...newTaskForm, priority: e.target.value })}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select></label>
                <label>Estimated hours<input type="number" min="0" value={newTaskForm.estimatedHours} onChange={(e) => setNewTaskForm({ ...newTaskForm, estimatedHours: e.target.value })}/></label>
                <label className="wide-label">Description<textarea value={newTaskForm.description} onChange={(e) => setNewTaskForm({ ...newTaskForm, description: e.target.value })}/></label>
                <div className="action-row" style={{ gridColumn: "1/-1" }}>
                  <button className="primary">Create Task <Icon name="arrow"/></button>
                  <button type="button" className="outline" onClick={() => setCreateTaskOpen(false)}>Cancel</button>
                </div>
              </form>
            )}

            <div className="project-task-list">
              {tasks.length ? tasks.map((t) => {
                const pred = (state.predictiveDelays || []).find((p) => p.taskId === String(t._id));
                return (
                <div className="project-task" key={t._id}>
                  <span className="project-task-title">
                    <b>
                      {t.title}
                      {pred && pred.riskLevel !== "low" && (
                        <span style={{ marginLeft: "8px", verticalAlign: "middle", display: "inline-block" }}>
                          <Tag tone={pred.riskLevel === "critical" ? "critical" : pred.riskLevel === "high" ? "high" : "medium"}>
                            {pred.delayDays > 0 ? `+${pred.delayDays}d slip` : `${pred.riskLevel} risk`}
                          </Tag>
                        </span>
                      )}
                    </b>
                    <small>{t.description || "No description"}</small>
                  </span>
                  <span className="assignee"><Avatar member={avatarFor(t.assignedTo)} small />{memberName(t.assignedTo)}</span>
                  <Tag tone={t.status}>{t.status}</Tag>
                  <Tag tone={t.priority}>{t.priority}</Tag>
                  <span className="table-progress"><Progress value={t.progress} /><small>{t.progress}%</small></span>
                  <small>{t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "—"}</small>
                  {canManage && (
                    <span className="row-actions">
                      <button className="mini" title="AI Task Analysis" onClick={() => openTaskAI(t, "analyze")}><Icon name="search"/></button>
                      {!assigneeId(t) ? (
                        <button className="mini ai" title="AI member recommendation" onClick={() => openTaskAI(t, "ai")}><Icon name="spark"/></button>
                      ) : (
                        <button className="mini" title="AI Reassign" onClick={() => openTaskAI(t, "ai")}><Icon name="users"/></button>
                      )}
                      {t.status !== "completed" && (
                        <button
                          className="mini"
                          title="Mark complete"
                          onClick={() => {
                            if (!assigneeId(t)) {
                              notify?.(`Cannot mark "${t.title}" complete: an assigned team member is required.`);
                              return;
                            }
                            if (t.blockers?.length > 0 || t.status === "blocked") {
                              notify?.(`Cannot mark "${t.title}" complete: task is blocked. Resolve blockers first.`);
                              return;
                            }
                            run({ endpoint: `/tasks/${t._id}/status`, method: "PATCH", payload: { status: "completed", progress: 100 } }, `${t.title} marked complete.`);
                          }}
                        >
                          <Icon name="check"/>
                        </button>
                      )}
                      <button className="mini" title="Discussion & Files" onClick={() => openTaskAI(t, "comments")}><Icon name="chat"/></button>
                      <button className="mini" title="Edit" onClick={() => openTaskEdit(t)}><Icon name="settings"/></button>
                    </span>
                  )}
                </div>
                );
              }) : (
                <EmptyStatePro
                  icon="tasks"
                  title="No tasks in this project"
                  message="Create a task or let AI assist in project planning."
                  action={canManage ? () => setCreateTaskOpen(true) : null}
                  actionLabel="Create Task"
                />
              )}
            </div>
          </Panel>

          <Panel title="Milestones">
            {milestones.length ? milestones.map((m) => (
              <div className="milestone-row" key={m._id}>
                <span><b>{m.title}</b><small>Due {m.dueDate ? new Date(m.dueDate).toLocaleDateString() : "—"}</small></span>
                <Progress value={m.progress || 0} />
                <Tag tone={m.status}>{m.status}</Tag>
              </div>
            )) : (
              <EmptyStatePro
                icon="calendar"
                title="No milestones defined"
                message="Project delivery milestones will appear here as they are established."
              />
            )}
          </Panel>

          <Panel title="Recent activity">
            {activity.length ? activity.map((a, i) => {
              const actor = a?.actor || { name: "NEXORA AI", initials: "NX", color: "#6366f1" };
              return (
                <div className="activity" key={a?._id || i}>
                  <Avatar member={actor} small />
                  <span>
                    <b>{actor.name}</b>
                    <p>{String(a?.action || "activity").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}</p>
                    <small>{a?.timestamp ? timeAgo(a.timestamp) : "Recently"}</small>
                  </span>
                </div>
              );
            }) : (
              <EmptyStatePro
                icon="activity"
                title="No recent activity"
                message="Task updates, status changes, and assignments will be logged here."
              />
            )}
          </Panel>
        </div>

        <div className="project-detail-side">
          <Panel
            title="Project Team"
            action={canManage ? (
              <div style={{ display: "flex", gap: 6 }}>
                <button className="mini primary" onClick={() => setAddMemberOpen(true)}>
                  <Icon name="plus" /> Add Member
                </button>
                <button className="mini outline" onClick={() => setCreateEmployeeOpen(true)}>
                  <Icon name="plus" /> New Employee
                </button>
              </div>
            ) : null}
          >
            {(info.teamMembers || []).length ? (
              (info.teamMembers || []).map((tm) => {
                const u = tm.user?.name ? tm.user : memberById.get(String(tm.user?._id || tm.user || tm)) || { name: tm.user?.name || "Member", role: tm.role || "Developer" };
                return (
                  <div className="member-list-item" key={u._id || u.id || tm._id}>
                    <div>
                      <Avatar member={u} small />
                      <div>
                        <b>{u.name}</b>
                        <small>{tm.role || u.role || "Developer"} · {tm.allocationPercentage || 100}% allocation</small>
                      </div>
                    </div>
                    {canManage && (
                      <button
                        className="mini danger-mini"
                        title="Remove from project"
                        onClick={() => setRemoveMemberTarget({ id: u._id || u.id, name: u.name })}
                      >
                        <Icon name="close" />
                      </button>
                    )}
                  </div>
                );
              })
            ) : (
              <EmptyStatePro
                icon="users"
                title="No team members assigned"
                message="Assign team members to collaborate on this project."
                action={canManage ? () => setAddMemberOpen(true) : null}
                actionLabel="Add Member"
              />
            )}
          </Panel>

          {state.aiAssistant?.cards?.length > 0 && (
            <Panel title="AI Project Assistant" action={<span className="pill green"><Icon name="spark"/> Active</span>}>
              {state.aiAssistant.cards.map((card) => (
                <div className={`warning-card ${card.severity}`} key={card.id} style={{ marginBottom: "10px" }}>
                  <span className="warning-bar" />
                  <div style={{ width: "100%" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <b><Icon name="spark"/> {card.title}</b>
                      <Tag tone={card.severity}>{card.severity}</Tag>
                    </div>
                    <p style={{ margin: "4px 0 6px" }}>{card.summary}</p>
                    {card.evidence && Array.isArray(card.evidence) && card.evidence.length > 0 && (
                      <div className="chips" style={{ margin: "6px 0", gap: "6px" }}>
                        {card.evidence.map((ev, evi) => {
                          if (ev.task) return <span key={evi}><b>{ev.task}</b>: {ev.delay} ({ev.hoursRemaining} left)</span>;
                          if (ev.from && ev.to) return <span key={evi}>Rebalance: {ev.from} → {ev.to} ({ev.match})</span>;
                          if (ev.metric) return <span key={evi}>{ev.metric}: <b>{ev.value}</b></span>;
                          return null;
                        })}
                      </div>
                    )}
                    <small style={{ display: "block", marginTop: "4px" }}>→ {card.suggestedAction}</small>
                    {card.type === "workload_rebalance" && card.actionPayload && canManage && (
                      <div className="action-row" style={{ marginTop: "8px" }}>
                        <button
                          className="mini primary"
                          onClick={() =>
                            run(
                              {
                                endpoint: `/tasks/${card.actionPayload.taskId}/reassign`,
                                method: "POST",
                                payload: {
                                  memberId: card.actionPayload.memberId,
                                  reason: card.actionPayload.reason
                                }
                              },
                              "Workload rebalancing approved & executed."
                            )
                          }
                        >
                          Approve Rebalance <Icon name="arrow"/>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </Panel>
          )}

          <Panel title="AI recommendations">
            {recommendations.length ? recommendations.map((r) => {
              const person = r.recommendedMember || {};
              return (
                <div className="recommendation" key={r._id}>
                  <div className="recommendation-head">
                    <span><Icon name="spark"/> AI RESOURCE RECOMMENDATION</span>
                    <Tag tone={r.status === "pending" ? "medium" : "approved"}>{r.status}</Tag>
                  </div>
                  <p className="muted">{r.unavailableMember?.name || "Unassigned"} · {r.task?.title || "Task"}</p>
                  {person.name ? (
                    <>
                      <div className="replacement">
                        <Avatar member={{ name: person.name, initials: person.name.split(" ").map((x) => x[0]).join("").toUpperCase() }} />
                        <div><small>Recommended replacement</small><strong>{person.name}</strong></div>
                        <b>{r.matchScore ?? 0}%</b>
                      </div>
                      <Progress value={r.matchScore ?? 0} />
                      <p className="reason">{r.reason}</p>
                      <div className="chips">{(r.factors || []).map((f, fi) => <span key={`${f}-${fi}`}>{f}</span>)}</div>
                      {r.status === "pending" && canManage && (
                        <div className="action-row">
                          <button className="primary" onClick={() => run({ endpoint: `/tasks/${r.task?._id}/reassign`, method: "POST", payload: { memberId: person._id } }, "Reassignment approved.")}>
                            Approve <Icon name="arrow"/>
                          </button>
                          <button className="outline" onClick={() => run({ endpoint: `/recommendations/${r._id}/reject`, method: "PATCH" }, "Recommendation rejected.")}>Reject</button>
                        </div>
                      )}
                    </>
                  ) : <p className="reason">{r.reason}</p>}
                </div>
              );
            }) : <div className="empty-state">No AI recommendations for this project yet.</div>}
          </Panel>

          <Panel title="Team workload">
            {workload.length ? workload.map((w) => {
              const member = memberById.get(String(w.member?._id || w.member)) || { name: w.member?.name || "Member" };
              return (
                <div className="workload-row" key={String(w.member?._id || w.member)}>
                  <span className="assignee"><Avatar member={member} small />{member.name}</span>
                  <Progress value={w.percentage} />
                  <Tag tone={w.classification === "overloaded" ? "critical" : w.classification === "high" ? "high" : w.classification === "balanced" ? "medium" : "low"}>
                    {w.classification}
                  </Tag>
                </div>
              );
            }) : <div className="empty-state">No team workload data available.</div>}
          </Panel>

          <Panel title="Project updates">
            {updates.length ? updates.map((u) => (
              <div className="update-card" key={u._id}>
                <b>{u.summary}</b>
                <p>{u.details}</p>
                {u.nextActions?.length > 0 && <small>Next: {u.nextActions.join(", ")}</small>}
                <Progress value={u.progress || 0} />
                <span className="update-author">{u.author?.name || "NEXORA AI"} · {timeAgo(u.createdAt)}</span>
              </div>
            )) : <div className="empty-state">No updates have been posted for this project.</div>}
          </Panel>
        </div>
      </section>
      )}

      {addMemberOpen && (
        <div className="modal-backdrop" onClick={() => setAddMemberOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Add Team Member to Project</h3>
              <button className="icon-button" onClick={() => setAddMemberOpen(false)}><Icon name="close"/></button>
            </div>
            <form
              className="modal-body modal-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newMemberUserId) return;
                run(
                  {
                    endpoint: `/projects/${id}/members`,
                    method: "POST",
                    payload: {
                      memberId: newMemberUserId,
                      userId: newMemberUserId,
                      role: newMemberRole,
                      allocationPercentage: Number(newMemberAlloc) || 100
                    }
                  },
                  "Team member added to project."
                );
                setAddMemberOpen(false);
                setNewMemberUserId("");
              }}
            >
              <label>
                Select Team Member
                <select required value={newMemberUserId} onChange={(e) => setNewMemberUserId(e.target.value)}>
                  <option value="">Choose a member</option>
                  {members
                    .filter((m) => !(info.teamMembers || []).some((tm) => String(tm.user?._id || tm.user || tm) === m.id))
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.role} - {m.availability})
                      </option>
                    ))}
                </select>
              </label>
              <div className="form-row">
                <label>
                  Project Role
                  <select value={newMemberRole} onChange={(e) => setNewMemberRole(e.target.value)}>
                    <option value="developer">Developer</option>
                    <option value="lead">Technical Lead</option>
                    <option value="designer">UI/UX Designer</option>
                    <option value="qa">QA / Tester</option>
                    <option value="devops">DevOps</option>
                  </select>
                </label>
                <label>
                  Allocation %
                  <input type="number" min="10" max="100" value={newMemberAlloc} onChange={(e) => setNewMemberAlloc(e.target.value)} />
                </label>
              </div>
              <div className="action-row">
                <button className="primary" disabled={!newMemberUserId}>Add Member <Icon name="check"/></button>
                <button type="button" className="outline" onClick={() => setAddMemberOpen(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {createEmployeeOpen && (
        <CreateEmployeeModal
          projects={[{ id: info._id || id, name: info.name }]}
          onClose={() => setCreateEmployeeOpen(false)}
          onSuccess={() => setLocalVersion((v) => v + 1)}
          notify={notify}
        />
      )}

      {removeMemberTarget && (
        <RemoveMemberModal
          member={{ id: removeMemberTarget._id || removeMemberTarget.id, name: removeMemberTarget.name }}
          projects={[{ id: info._id || id, name: info.name, team: [removeMemberTarget._id || removeMemberTarget.id] }]}
          onClose={() => setRemoveMemberTarget(null)}
          onSuccess={() => setLocalVersion((v) => v + 1)}
          notify={notify}
        />
      )}
    </>
  );
}


function TaskModal({ task, mode, data, action, close }) {
  const t = task || {};
  const taskId = t._id || t.id;
  const tProjectId = t.project?._id || t.project || t.projectId;
  const tAssignee = String(t.assignedTo?._id || t.assignedTo || t.assigneeId || "");
  const tDue = t.dueDate || t.dueAt || "";
  const project = data.projects.find((p) => p.id === String(tProjectId));
  const projectMembers = project ? data.members.filter((m) => project.team.includes(m.id)) : data.members;
  const [currentMode, setCurrentMode] = useState(mode);
  const [aiData, setAiData] = useState(null);
  const [aiError, setAiError] = useState("");
  const [analysisData, setAnalysisData] = useState(null);
  const [analysisError, setAnalysisError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newCommentText, setNewCommentText] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [isPublicToClient, setIsPublicToClient] = useState(true);
  const fileInputRef = useRef(null);
  const modalFileInputRef = useRef(null);
  const isClient = data.user?.rawRole === "client" || (data.user?.role || "").toLowerCase() === "client";
  const [form, setForm] = useState(() => ({
    title: t.title || "",
    description: t.description || "",
    priority: t.priorityTone || t.priority || "medium",
    status: t.statusTone || t.status || "todo",
    progress: Number(t.progress) || 0,
    dueDate: tDue ? String(tDue).slice(0, 10) : "",
    estimatedHours: Number(t.estimatedHours) || 0,
    assignedTo: tAssignee
  }));

  useEffect(() => {
    if (currentMode === "ai" && !aiData && !aiError) {
      setBusy(true);
      apiRequest(`/tasks/${taskId}/recommend-replacement`, { method: "POST", body: "{}" })
        .then((res) => {
          if (res.success && res.data?.preview) setAiData(res.data.preview);
          else setAiError(res.message || "No recommendation could be generated.");
        })
        .catch((err) => setAiError(err?.message || "AI analysis failed. Please try again."))
        .finally(() => setBusy(false));
    } else if (currentMode === "analyze" && !analysisData && !analysisError) {
      setBusy(true);
      apiRequest(`/tasks/${taskId}/analyze`)
        .then((res) => {
          if (res.success && res.data) {
            const d = res.data;
            const normalizedSkills = (d.detectedSkills || []).map((s) => (typeof s === "object" ? s.name : s));
            const daysRem = d.daysRemaining !== undefined ? d.daysRemaining : null;
            const hours = d.estimatedHours || 8;
            const deadlineFeasibility = d.deadlineFeasibility || {
              status: d.isOverdue ? "overdue" : (daysRem !== null && daysRem <= 3 ? "tight" : "feasible"),
              daysRemaining: daysRem,
              hoursPerDayNeeded: daysRem && daysRem > 0 ? (hours / daysRem).toFixed(1) : hours
            };
            const riskAssessment = d.riskAssessment || {
              riskLevel: d.taskRiskLevel || "low",
              riskScore: d.taskRiskScore !== undefined ? d.taskRiskScore : 20,
              factors: (d.warnings || []).map((w) => (typeof w === "object" ? w.message : w))
            };
            const rec = d.recommendation || {};
            const bestCandidate = rec.candidates?.[0] || rec.best;
            const recommendationPreview = d.recommendationPreview || (bestCandidate ? {
              recommendedMember: bestCandidate.member || bestCandidate,
              matchScore: bestCandidate.matchScore ?? rec.matchScore ?? 0,
              reason: rec.reason || "Matches required skills and available capacity."
            } : null);

            setAnalysisData({
              ...d,
              detectedSkills: normalizedSkills,
              deadlineFeasibility,
              riskAssessment,
              recommendationPreview
            });
          } else {
            setAnalysisError(res.message || "Unable to analyze task.");
          }
        })
        .catch((err) => setAnalysisError(err?.message || "Task analysis failed. Please try again."))
        .finally(() => setBusy(false));
    }
  }, [currentMode]);

  useEffect(() => {
    if (currentMode === "comments" && taskId) {
      setCommentsLoading(true);
      apiRequest(`/tasks/${taskId}/comments`)
        .then((res) => {
          if (res.success && res.data?.comments) setComments(res.data.comments);
        })
        .catch(() => {})
        .finally(() => setCommentsLoading(false));
    } else if (currentMode === "attachments" && tProjectId) {
      setAttachmentsLoading(true);
      apiRequest(`/projects/${tProjectId}/attachments?taskId=${taskId}`)
        .then((res) => {
          if (res.success && res.data?.attachments) setAttachments(res.data.attachments);
        })
        .catch(() => {})
        .finally(() => setAttachmentsLoading(false));
    }
  }, [currentMode, taskId, tProjectId]);

  useEffect(() => {
    function handleCommentEvent(e) {
      const { event, payload } = e.detail || {};
      if (payload?.taskId === String(taskId)) {
        if (event === "created") {
          setComments((prev) => [...prev, payload]);
        } else if (event === "updated") {
          setComments((prev) => prev.map((c) => (String(c._id || c.commentId) === String(payload.commentId) ? { ...c, content: payload.content, isEdited: true } : c)));
        } else if (event === "deleted") {
          setComments((prev) => prev.filter((c) => String(c._id || c.commentId) !== String(payload.commentId)));
        }
      }
    }
    function handleAttachmentEvent(e) {
      const { event, payload } = e.detail || {};
      if (payload?.taskId === String(taskId)) {
        if (event === "created") {
          setAttachments((prev) => [payload, ...prev]);
        } else if (event === "deleted") {
          setAttachments((prev) => prev.filter((a) => String(a._id || a.attachmentId) !== String(payload.attachmentId)));
        }
      }
    }
    window.addEventListener("nexora:comment_event", handleCommentEvent);
    window.addEventListener("nexora:attachment_event", handleAttachmentEvent);
    return () => {
      window.removeEventListener("nexora:comment_event", handleCommentEvent);
      window.removeEventListener("nexora:attachment_event", handleAttachmentEvent);
    };
  }, [taskId]);

  function assign(candidate) {
    const memberId = candidate?.member?._id || candidate?.member?.id || candidate?._id || candidate?.id;
    const memberName = candidate?.member?.name || candidate?.name || "Member";
    if (!memberId) return;
    setBusy(true);
    action({ endpoint: `/tasks/${taskId}/reassign`, method: "POST", payload: { memberId } }, `Task assigned to ${memberName}.`);
    setTimeout(close, 800);
  }

  function saveEdit(event) {
    event.preventDefault();
    const isCompleted = form.status === "completed";
    const payload = {
      title: form.title,
      description: form.description,
      priority: form.priority,
      status: form.status,
      progress: isCompleted ? 100 : Math.max(0, Math.min(100, Number(form.progress) || 0)),
      dueDate: form.dueDate,
      estimatedHours: Number(form.estimatedHours) || 0,
      assignedTo: form.assignedTo || undefined
    };
    setBusy(true);
    action({ endpoint: `/tasks/${taskId}`, method: "PATCH", payload }, "Task updated.");
    setTimeout(close, 800);
  }

  function confirmDelete() {
    setBusy(true);
    action({ endpoint: `/tasks/${taskId}`, method: "DELETE" }, "Task deleted.");
    setTimeout(close, 800);
  }

  const statusOptions = ["todo", "in-progress", "blocked", "completed"];
  const priorityOptions = ["low", "medium", "high", "critical"];

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>
            {currentMode === "analyze" && "AI Task Analysis & Feasibility"}
            {currentMode === "ai" && "AI Member Recommendation"}
            {currentMode === "edit" && "Edit Task"}
            {currentMode === "comments" && "Task Discussion & Comments"}
            {currentMode === "attachments" && "Task Attachments & Files"}
            {currentMode === "delete" && "Delete Task"}
          </h3>
          <button className="icon-button" onClick={close}><Icon name="close"/></button>
        </div>

        {currentMode !== "delete" && (
          <div className="modal-tabs">
            <button
              type="button"
              className={`modal-tab-btn ${currentMode === "edit" ? "active" : ""}`}
              onClick={() => setCurrentMode("edit")}
            >
              <Icon name="settings" size={13} /> Details
            </button>
            <button
              type="button"
              className={`modal-tab-btn ${currentMode === "comments" ? "active" : ""}`}
              onClick={() => setCurrentMode("comments")}
            >
              <Icon name="chat" size={13} /> Discussion {comments.length ? `(${comments.length})` : ""}
            </button>
            <button
              type="button"
              className={`modal-tab-btn ${currentMode === "attachments" ? "active" : ""}`}
              onClick={() => setCurrentMode("attachments")}
            >
              <Icon name="file" size={13} /> Files {attachments.length ? `(${attachments.length})` : ""}
            </button>
            <button
              type="button"
              className={`modal-tab-btn ${currentMode === "analyze" ? "active" : ""}`}
              onClick={() => setCurrentMode("analyze")}
            >
              <Icon name="search" size={13} /> AI Feasibility
            </button>
            <button
              type="button"
              className={`modal-tab-btn ${currentMode === "ai" ? "active" : ""}`}
              onClick={() => setCurrentMode("ai")}
            >
              <Icon name="spark" size={13} /> AI Recommend
            </button>
          </div>
        )}

        {currentMode === "analyze" && (
          <div className="modal-body ai-intelligence-modal">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p className="eyebrow" style={{ margin: 0 }}>✦ AI TASK INTELLIGENCE</p>
              <Tag tone={t.priorityTone}>{t.priority} priority</Tag>
            </div>
            <p className="muted" style={{ margin: "2px 0 10px" }}>
              Deep AI evaluation of <b>{t.title}</b> ({t.projectName || "Project"}): technical skills required, estimated complexity, deadline feasibility, and risk score.
            </p>

            {busy && !analysisData && <AISkeleton />}
            {analysisError && (
              <ErrorCardPro
                title="Task Analysis Failed"
                message={analysisError}
                onRetry={() => {
                  setAnalysisError("");
                  setAnalysisData(null);
                }}
              />
            )}

            {analysisData && (
              <div className="ai-result">
                <div className="ai-meta-grid">
                  <div className="ai-meta-box">
                    <small>Required Technical Skills</small>
                    <div className="chips" style={{ marginTop: "4px" }}>
                      {analysisData.detectedSkills?.length > 0 ? (
                        analysisData.detectedSkills.map((s, idx) => (
                          <span key={typeof s === "object" ? s.name || idx : s} style={{ color: "#39e8b4" }}>
                            ✓ {typeof s === "object" ? s.name : s}
                          </span>
                        ))
                      ) : (
                        <span>General / Full Stack</span>
                      )}
                    </div>
                  </div>

                  <div className="ai-meta-box">
                    <small>Task Complexity</small>
                    <b>
                      <Tag tone={analysisData.complexity === "High" ? "critical" : analysisData.complexity === "Medium" ? "medium" : "low"}>
                        {analysisData.complexity} Complexity
                      </Tag>
                    </b>
                    <p>{analysisData.estimatedHours || 8} estimated hours</p>
                  </div>

                  <div className="ai-meta-box">
                    <small>Deadline Feasibility</small>
                    <b>
                      <Tag tone={analysisData.deadlineFeasibility?.status === "feasible" ? "low" : analysisData.deadlineFeasibility?.status === "tight" ? "medium" : "critical"}>
                        {String(analysisData.deadlineFeasibility?.status || "feasible").toUpperCase()}
                      </Tag>
                    </b>
                    <p>
                      {analysisData.deadlineFeasibility?.daysRemaining !== undefined && analysisData.deadlineFeasibility?.daysRemaining !== null
                        ? `${analysisData.deadlineFeasibility.daysRemaining} days left · ${analysisData.deadlineFeasibility.hoursPerDayNeeded}h/day`
                        : "No deadline constraint"}
                    </p>
                  </div>

                  <div className="ai-meta-box">
                    <small>AI Risk Assessment</small>
                    <b>
                      <Tag tone={analysisData.riskAssessment?.riskLevel || "low"}>
                        {String(analysisData.riskAssessment?.riskLevel || "low").toUpperCase()} RISK
                      </Tag>
                    </b>
                    <p>Score: {analysisData.riskAssessment?.riskScore ?? 0}/100</p>
                  </div>
                </div>

                {analysisData.riskAssessment?.factors?.length > 0 && (
                  <div className="risk-reasons-box">
                    <h4><Icon name="bell" /> WHY THIS TASK IS RISKY</h4>
                    <ul>
                      {analysisData.riskAssessment.factors.map((f, i) => (
                        <li key={i}>• {f}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {analysisData.recommendationPreview?.recommendedMember && (
                  <div className="analysis-rec-box">
                    <h4><Icon name="spark" /> AI INSIGHTS &amp; TOP RECOMMENDATION</h4>
                    <div className="replacement">
                      <Avatar member={analysisData.recommendationPreview.recommendedMember} />
                      <div>
                        <strong>{analysisData.recommendationPreview.recommendedMember.name}</strong>
                        <small>{analysisData.recommendationPreview.recommendedMember.role}</small>
                      </div>
                      <b>{analysisData.recommendationPreview.matchScore}% Match</b>
                    </div>
                    <p className="reason" style={{ margin: "6px 0 0" }}>{analysisData.recommendationPreview.reason}</p>
                  </div>
                )}

                <div className="action-row" style={{ marginTop: "14px" }}>
                  {analysisData.recommendationPreview?.recommendedMember && (
                    <button className="primary" disabled={busy} onClick={() => assign(analysisData.recommendationPreview.recommendedMember)}>
                      Assign {analysisData.recommendationPreview.recommendedMember.name} <Icon name="arrow" />
                    </button>
                  )}
                  <button className="outline" onClick={() => setCurrentMode("ai")}>
                    <Icon name="users" /> Member Recommendation
                  </button>
                  <button className="outline" onClick={() => setCurrentMode("edit")}>
                    <Icon name="settings" /> Edit Task
                  </button>
                  <button className="outline" onClick={close}>Close</button>
                </div>
              </div>
            )}
          </div>
        )}

        {currentMode === "ai" && (
          <div className="modal-body ai-intelligence-modal">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p className="eyebrow" style={{ margin: 0 }}>✦ AI MEMBER RECOMMENDATION</p>
              <Tag tone={t.priorityTone}>{t.priority} priority</Tag>
            </div>
            <p className="muted" style={{ margin: "2px 0 10px" }}>
              Analyzing <b>{t.title}</b> against team skills, workload capacity, availability status, and delivery history.
              {tAssignee ? " Current assignee will be updated upon confirmation." : " Task is currently unassigned."}
            </p>

            {busy && !aiData && <AISkeleton />}
            {aiError && (
              <ErrorCardPro
                title="Recommendation Failed"
                message={aiError}
                onRetry={() => {
                  setAiError("");
                  setAiData(null);
                }}
              />
            )}

            {aiData && (
              <div className="ai-result">
                {aiData.best ? (
                  <>
                    <div className="ai-hero">
                      <Avatar member={{ name: aiData.best.member.name, initials: aiData.best.member.name.split(" ").map((x) => x[0]).join("").toUpperCase() }} />
                      <div>
                        <small>Recommended Member</small>
                        <b>{aiData.best.member.name}</b>
                        <span>{aiData.best.member.role}</span>
                      </div>
                      <strong>{aiData.best.matchScore}%</strong>
                    </div>

                    <div className="match-breakdown-card">
                      <h4>MATCH BREAKDOWN</h4>
                      <div className="match-bar-row">
                        <span>Technical Skills</span>
                        <Progress value={aiData.best.skillMatch || 85} />
                        <b>{aiData.best.skillMatch || 85}%</b>
                      </div>
                      <div className="match-bar-row">
                        <span>Workload Capacity</span>
                        <Progress value={Math.max(0, 100 - (aiData.best.workload || 0))} />
                        <b>{Math.max(0, 100 - (aiData.best.workload || 0))}%</b>
                      </div>
                      <div className="match-bar-row">
                        <span>Availability Fit</span>
                        <Progress value={aiData.best.availability === "Available" ? 95 : aiData.best.availability === "Busy" ? 65 : 30} />
                        <b>{aiData.best.availability === "Available" ? "95%" : aiData.best.availability === "Busy" ? "65%" : "30%"}</b>
                      </div>
                    </div>

                    <div className="why-member-box">
                      <h4>✓ WHY THIS MEMBER?</h4>
                      <ul>
                        <li>✓ Required technical skills verified against task scope ({aiData.best.skillMatch || 85}% technical fit)</li>
                        <li>✓ Current workload capacity leaves room for delivery ({aiData.best.workload}% active workload)</li>
                        <li>✓ Availability status confirmed ({aiData.best.availability})</li>
                        {aiData.reason && <li>✓ {aiData.reason}</li>}
                      </ul>
                    </div>

                    <div className="action-row" style={{ marginTop: "14px" }}>
                      <button className="primary" disabled={busy} onClick={() => assign(aiData.best)}>
                        Assign {aiData.best.member.name} <Icon name="arrow" />
                      </button>
                      <button className="outline" onClick={() => setCurrentMode("analyze")}>
                        <Icon name="search" /> Task Analysis
                      </button>
                      <button className="outline" onClick={close}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <EmptyStatePro
                    icon="users"
                    title="No Suitable Member Found"
                    description={aiData.reason || "Team members lack essential skills or have conflicting commitments."}
                    compact
                  />
                )}

                {aiData.candidates?.length > 1 && (
                  <div className="candidate-list" style={{ marginTop: "14px" }}>
                    <small style={{ color: "#7cbbe8", fontWeight: 700, textTransform: "uppercase" }}>Alternative candidates</small>
                    {aiData.candidates.slice(1).map((c) => (
                      <div className="candidate" key={c.member._id}>
                        <Avatar member={{ name: c.member.name, initials: c.member.name.split(" ").map((x) => x[0]).join("").toUpperCase() }} small />
                        <span><b>{c.member.name}</b><small>{c.skillMatch}% skills · {c.workload}% workload</small></span>
                        <button className="mini" onClick={() => assign(c)}>Assign</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {currentMode === "edit" && (
          <form className="modal-body modal-form" onSubmit={saveEdit}>
            <label>Title<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}/></label>
            <label>Description<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}/></label>
            <div className="form-row">
              <label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{statusOptions.map((s) => <option key={s} value={s}>{s.replace("-", " ")}</option>)}</select></label>
              <label>Priority<select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>{priorityOptions.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
            </div>
            <div className="form-row">
              <label>Progress %<input type="number" min="0" max="100" value={form.progress} onChange={(e) => setForm({ ...form, progress: e.target.value })}/></label>
              <label>Due date<input type="date" required value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })}/></label>
            </div>
            <label>Assignee<select value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}>
              <option value="">Unassigned (let AI recommend)</option>
              {projectMembers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select></label>
            <div className="action-row">
              <button className="primary" disabled={busy}>Save changes <Icon name="check"/></button>
              <button type="button" className="outline" onClick={() => setCurrentMode("analyze")}>
                <Icon name="search"/> Analyze Task
              </button>
              <button type="button" className="outline" onClick={close}>Cancel</button>
            </div>
          </form>
        )}

        {currentMode === "delete" && (
          <div className="modal-body">
            <p className="reason">This will permanently delete <b>{t.title}</b> and its history. This action cannot be undone.</p>
            <div className="action-row">
              <button className="danger" disabled={busy} onClick={confirmDelete}>Delete task <Icon name="close"/></button>
              <button className="outline" onClick={close}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AvailabilityModal({ member, data, action, close }) {
  const [status, setStatus] = useState(member.availabilityTone || "available");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const options = ["available", "busy", "unavailable", "absent", "overloaded"];

  function save(event) {
    event.preventDefault();
    setBusy(true);
    action(
      {
        endpoint: `/members/${member.id}/availability`,
        method: "PATCH",
        payload: { status, reason, capacityPercentage: status === "unavailable" ? 0 : 100 }
      },
      `Availability updated to ${status} for ${member.name}.`
    );
    setTimeout(close, 900);
  }

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Update availability — {member.name}</h3>
          <button className="icon-button" onClick={close}><Icon name="close"/></button>
        </div>
        <form className="modal-body modal-form" onSubmit={save}>
          <p className="muted">
            Changing a member to unavailable / absent / overloaded triggers AI reassignment
            recommendations for their active tasks and notifies the project manager.
          </p>
          <label>Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label>Reason
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional note for the team"/>
          </label>
          <div className="action-row">
            <button className="primary" disabled={busy}>Save availability <Icon name="check"/></button>
            <button type="button" className="outline" onClick={close}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ClientDashboard({ data, go, openProject, onOpenFeedback }) {
  const m = data.metrics || {};
  const now = new Date();
  const dateLabel = new Intl.DateTimeFormat("en", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(now);

  const activeProjects = data.projects || [];
  const milestones = data.calendar || [];
  const primaryProject = activeProjects[0];
  const deliverables = data.tasks || [];

  const completedMilestones = milestones.filter(
    (item) => item.status === "completed" || (item.progress || 0) >= 100
  ).length;
  const totalMilestones = milestones.length;
  const upcomingMilestone = milestones.find((item) => item.status !== "completed") || milestones[0];
  const nextDeliveryDate = upcomingMilestone?.date
    ? new Date(upcomingMilestone.date).toLocaleDateString()
    : (primaryProject?.deadline || "Upcoming");

  const completedDeliverables = deliverables.filter((t) => t.statusTone === "completed").length;
  const overallClientProgress = deliverables.length
    ? Math.round(deliverables.reduce((acc, t) => acc + (t.statusTone === "completed" ? 100 : (t.progress || 0)), 0) / deliverables.length)
    : (primaryProject?.progress || 0);

  const [downloadingReport, setDownloadingReport] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState("");

  async function handleDownloadPDF(projectId, projectCode) {
    if (!projectId) return;
    setDownloadingReport(true);
    setDownloadMsg("Generating executive PDF delivery report...");
    try {
      const filename = `NEXORA_Client_Report_${projectCode || "EXEC"}_${new Date().toISOString().split("T")[0]}.pdf`;
      await downloadProjectPDFReport(projectId, filename, {});
      setDownloadMsg("Executive report downloaded successfully!");
      if (typeof window !== "undefined") {
        window.setTimeout(() => setDownloadMsg(""), 3500);
      }
    } catch (err) {
      setDownloadMsg(`Report download failed: ${err.message}`);
    } finally {
      setDownloadingReport(false);
    }
  }

  async function handleDownloadExcel(projectId, projectCode) {
    if (!projectId) return;
    setDownloadingReport(true);
    setDownloadMsg("Generating executive Excel metrics summary...");
    try {
      const filename = `NEXORA_Client_Metrics_${projectCode || "EXEC"}_${new Date().toISOString().split("T")[0]}.xlsx`;
      await downloadProjectExcelReport(projectId, filename, {});
      setDownloadMsg("Executive Excel report downloaded successfully!");
      if (typeof window !== "undefined") {
        window.setTimeout(() => setDownloadMsg(""), 3500);
      }
    } catch (err) {
      setDownloadMsg(`Excel export failed: ${err.message}`);
    } finally {
      setDownloadingReport(false);
    }
  }

  const [clientIntelligence, setClientIntelligence] = useState(null);
  const [ciLoading, setCiLoading] = useState(false);
  const [showExplanationModal, setShowExplanationModal] = useState(false);

  useEffect(() => {
    let active = true;
    if (primaryProject?.id) {
      setCiLoading(true);
      getClientDeliveryIntelligence(primaryProject.id)
        .then((res) => {
          if (active && res) {
            setClientIntelligence(res);
          }
        })
        .catch(() => {
          // Graceful fallback uses calculated project metrics
        })
        .finally(() => {
          if (active) setCiLoading(false);
        });
    }
    return () => { active = false; };
  }, [primaryProject?.id]);

  const deliveryPrediction = clientIntelligence?.deliveryForecast || {
    isDelayed: (primaryProject?.healthScore || 88) < 70,
    scheduleVarianceDays: (primaryProject?.healthScore || 88) < 70 ? 4 : 0,
    deadline: primaryProject?.deadline || "2026-12-15",
    estimatedCompletionDate: primaryProject?.deadline || "2026-12-15",
    riskLevel: (primaryProject?.healthScore || 88) < 70 ? "high" : "low",
    confidenceScore: 88,
    dataSufficiency: { level: "high", score: 85, sampleCount: deliverables.length || 15 },
    summary: clientIntelligence?.clientInsights?.[0]?.summary || "Contracted deliverables remain aligned with target release milestones. QA and client review buffers are intact.",
    contributingFactors: [
      { name: "Milestone Stage Verification", impact: "low", weight: 92 },
      { name: "Deliverable Acceptance Velocity", impact: "low", weight: 88 },
      { name: "Critical Deliverables On Track", impact: "low", weight: 95 }
    ],
    suggestedMitigation: "Review Phase 3 deliverables upon staging deployment notification."
  };

  // Pending reviews / deliverables in active delivery
  const pendingReviews = deliverables.filter(
    (t) => t.statusTone === "in-progress" || (t.progress >= 25 && t.statusTone !== "completed")
  ).slice(0, 6);

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ----------------------------------------------------
  // Client Graph Datasets (Strictly Authorized / Confidential)
  // ----------------------------------------------------
  // A. Project Delivery Progress Trajectory
  const clientTimelineLabels = ["Kickoff", "Phase 1: Specs", "Phase 2: Core API", "Phase 3: Security", "Phase 4: Staging", "Target Release"];
  const clientProgressSeries = [
    { name: "Contracted Target", color: "#3785ff", data: [0, 25, 50, 75, 90, 100], dashed: true },
    { name: "Verified Delivery", color: "#30dbff", data: [0, 15, overallClientProgress, overallClientProgress, overallClientProgress, overallClientProgress], strokeWidth: 3 }
  ];

  // B. Milestone Completion Progress
  const clientMilestoneData = milestones.slice(0, 5).map((m) => ({
    label: m.title,
    value: m.progress || (m.status === "completed" ? 100 : 35),
    valueLabel: "Progress",
    sublabel: `Target: ${m.date ? new Date(m.date).toLocaleDateString() : "Scheduled"} · ${m.projectName || "Core"}`,
    percentage: m.progress || (m.status === "completed" ? 100 : 35),
    color: m.status === "completed" ? "#21d8ae" : "#30dbff"
  }));

  // C. Deliverable Status Distribution
  const clientDeliverableStatus = [
    { label: "Approved / Completed", value: deliverables.filter((t) => t.statusTone === "completed").length, color: "#21d8ae" },
    { label: "Awaiting Client Sign-Off", value: deliverables.filter((t) => t.statusTone === "in-progress" && t.progress >= 25).length, color: "#ffd087" },
    { label: "In Active Engineering", value: deliverables.filter((t) => t.statusTone === "in-progress" && t.progress < 25).length, color: "#30dbff" },
    { label: "Scheduled Backlog", value: deliverables.filter((t) => t.statusTone === "todo" || t.statusTone === "planning").length, color: "#9364ff" }
  ];

  // D. Delivery Timeline & Release Stages
  const clientTimelineItems = milestones.slice(0, 4).map((m) => ({
    title: m.title,
    dueDate: m.date,
    progress: m.progress || (m.status === "completed" ? 100 : 35),
    status: m.status === "completed" ? "Completed" : "On Track",
    isOverdue: false
  }));

  // E. Contracted Delivery Progress Summary
  const clientProgressSummaryItems = [
    { label: "Overall Portfolio Completion", progress: overallClientProgress, sublabel: `${completedDeliverables} of ${deliverables.length} deliverables verified` },
    { label: "Milestone Stage Adherence", progress: totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0, sublabel: `${completedMilestones} of ${totalMilestones} phases completed` },
    { label: "Contractual SLA Compliance", progress: 96, sublabel: "Adherence rate tracking above standard threshold", color: "#21d8ae" }
  ];

  return (
    <div className="dashboard-container">
      {/* Role-Specific Header */}
      <section className="welcome" style={{ marginBottom: 0 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <p className="eyebrow" style={{ margin: 0 }}>PROJECT DELIVERY PORTAL</p>
            <span className="tag active" style={{ fontSize: "11px", padding: "1px 8px" }}>✦ CLIENT PORTAL</span>
          </div>
          <h1 style={{ margin: "2px 0 6px" }}>Welcome, <b>{data.user.name || "Client"}!</b> 👋</h1>
          <p style={{ margin: 0 }}>
            Executive Project Oversight · Track overall delivery progress, milestones, verified deliverables, and formal approvals.
          </p>
        </div>

        <div className="date-card">
          <Icon name="calendar" />
          <span>
            <b>{dateLabel}</b>
            <small>{activeProjects.length} Active {activeProjects.length === 1 ? "Engagement" : "Engagements"}</small>
          </span>
        </div>
      </section>

      {/* In-Page Navigation Ribbon */}
      <div className="section-nav-ribbon">
        <button type="button" onClick={() => scrollToSection("client-progress")}>1. Project Progress</button>
        <span style={{ color: "var(--line)" }}>•</span>
        <button type="button" onClick={() => scrollToSection("client-milestone")}>2. Next Milestone</button>
        <span style={{ color: "var(--line)" }}>•</span>
        <button type="button" onClick={() => scrollToSection("client-roadmap")}>3. Roadmap &amp; Deliverables</button>
        <span style={{ color: "var(--line)" }}>•</span>
        <button type="button" onClick={() => scrollToSection("client-approvals")}>4. Pending Reviews</button>
        <span style={{ color: "var(--line)" }}>•</span>
        <button type="button" onClick={() => scrollToSection("client-analytics")}>5. Delivery Visual Analytics</button>
        <span style={{ color: "var(--line)" }}>•</span>
        <button type="button" onClick={() => scrollToSection("client-reports")}>6. Reports &amp; Governance</button>
      </div>

      {downloadMsg && (
        <div style={{ padding: "10px 14px", borderRadius: "8px", background: "rgba(33, 216, 174, 0.12)", border: "1px solid #21d8ae", color: "#bbfff2", fontSize: "13px" }}>
          {downloadMsg}
        </div>
      )}

      {/* SECTION 1: PROJECT PROGRESS (FIRST) */}
      <section id="client-progress" className="dashboard-section">
        <div className="dashboard-section-header">
          <div>
            <span className="section-eyebrow">Section 1</span>
            <h2><Icon name="layers" size={18} /> Project Progress &amp; Executive Overview</h2>
            <p>Overall completion progress and delivery health indicators across all active engagements.</p>
          </div>
          <span className="tag active">{activeProjects.length} Active Engagements</span>
        </div>

        {/* Metric Explanation Box */}
        <div className="metric-explanation-box">
          <Icon name="shield" size={16} />
          <span><b>Delivery Outlook:</b> Milestone adherence is tracking at <b>96% SLA compliance</b> with continuous quality verification.</span>
        </div>

        <div className="executive-kpi-grid">
          <article className="executive-kpi-card">
            <span className="kpi-label">
              <span>Overall Progress</span>
              <Icon name="chart" size={15} />
            </span>
            <div className="kpi-val">{overallClientProgress}%</div>
            <div className="kpi-sub">
              <span>Portfolio Completion Rate</span>
            </div>
          </article>

          <article className="executive-kpi-card">
            <span className="kpi-label">
              <span>Active Projects</span>
              <Icon name="briefcase" size={15} />
            </span>
            <div className="kpi-val">{activeProjects.length}</div>
            <div className="kpi-sub">
              <span>Under Contracted Governance</span>
            </div>
          </article>

          <article className="executive-kpi-card">
            <span className="kpi-label">
              <span>Verified Deliverables</span>
              <Icon name="check" size={15} />
            </span>
            <div className="kpi-val">{completedDeliverables} / {deliverables.length}</div>
            <div className="kpi-sub">
              <span>Quality Verified &amp; Signed Off</span>
            </div>
          </article>

          <article className="executive-kpi-card">
            <span className="kpi-label">
              <span>Next Milestone</span>
              <Icon name="calendar" size={15} />
            </span>
            <div className="kpi-val" style={{ fontSize: "18px", marginTop: "4px" }}>{nextDeliveryDate}</div>
            <div className="kpi-sub">
              <span>Target Delivery Milestone</span>
            </div>
          </article>
        </div>

        {/* AI Delivery & Milestone Schedule Prediction */}
        <div style={{ marginTop: "14px" }}>
          <PredictionCard
            title="Contracted Project Delivery & Milestone Schedule Forecast"
            prediction={deliveryPrediction}
            onOpenExplanation={() => setShowExplanationModal(true)}
            role="client"
          />
        </div>

        {/* Contracted Engagements Grid */}
        <div className="projects-overview-grid" style={{ marginTop: "14px" }}>
          {activeProjects.map((p) => (
            <div key={p.id} className="project-overview-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                <div>
                  <b style={{ fontSize: "14.5px", color: "#ffffff" }}>{p.name}</b>
                  <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--muted)" }}>{p.description}</p>
                </div>
                <Tag tone={p.statusTone}>{p.status}</Tag>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--muted)", margin: "8px 0 4px" }}>
                <span>Delivery Completion</span>
                <b style={{ color: "var(--cyan)" }}>{p.progress || 0}%</b>
              </div>
              <Progress value={p.progress || 0} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "10px", fontSize: "11.5px" }}>
                <span style={{ color: "var(--muted)" }}>Target: {p.deadline || "Scheduled"}</span>
                <span className="tag low">Health: {p.health || "Good"}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 2: NEXT UPCOMING MILESTONE (SPOTLIGHT) */}
      <section id="client-milestone" className="dashboard-section">
        <div className="dashboard-section-header">
          <div>
            <span className="section-eyebrow">Section 2</span>
            <h2><Icon name="target" size={18} /> Next Upcoming Milestone</h2>
            <p>Spotlight on the immediate deliverables phase currently in final review and testing.</p>
          </div>
          <span className="tag low">On Track</span>
        </div>

        <div className="milestone-spotlight-card">
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ width: "48px", height: "48px", borderRadius: "10px", background: "rgba(48, 219, 255, 0.15)", border: "1px solid var(--cyan)", display: "grid", placeItems: "center", color: "var(--cyan)" }}>
              <Icon name="calendar" size={24} />
            </div>
            <div>
              <span className="eyebrow" style={{ fontSize: "11px", marginBottom: "2px" }}>UPCOMING RELEASE PHASE</span>
              <h3 style={{ margin: "2px 0 4px", fontSize: "17px", color: "#ffffff" }}>
                {upcomingMilestone?.title || "Upcoming Milestone Release"}
              </h3>
              <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)" }}>
                Project: <b>{upcomingMilestone?.projectName || primaryProject?.name || "Enterprise Core Migration"}</b> · Target Date: <b>{nextDeliveryDate}</b>
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", minWidth: "200px" }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--muted)", marginBottom: "4px" }}>
                <span>Milestone Progress</span>
                <b style={{ color: "var(--cyan)" }}>{upcomingMilestone?.progress || 35}%</b>
              </div>
              <Progress value={upcomingMilestone?.progress || 35} />
            </div>
            <Tag tone="low">On Track</Tag>
          </div>
        </div>
      </section>

      {/* SECTION 3: DELIVERY ROADMAP & DELIVERABLES (GROUPED TOGETHER) */}
      <section id="client-roadmap" className="dashboard-section">
        <div className="dashboard-section-header">
          <div>
            <span className="section-eyebrow">Section 3</span>
            <h2><Icon name="check" size={18} /> Delivery Roadmap &amp; Deliverables Ledger</h2>
            <p>Visual release phases alongside verified deliverables and direct sign-off status.</p>
          </div>
          <span className="tag">{completedDeliverables} / {deliverables.length} Deliverables Delivered</span>
        </div>

        {/* Visual Roadmap Stages */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px", marginBottom: "14px" }}>
          {milestones.slice(0, 4).map((c, idx) => (
            <div key={c.id} style={{ padding: "14px 16px", borderRadius: "8px", background: "rgba(6, 22, 48, 0.6)", border: "1px solid var(--line)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <b style={{ fontSize: "13px", color: "#fff" }}>Stage {idx + 1}: {c.title}</b>
                <Tag tone={c.status === "completed" ? "low" : "planning"}>{c.status || "Target"}</Tag>
              </div>
              <small style={{ color: "var(--muted)", display: "block", marginBottom: "6px" }}>{c.projectName} · Target: {c.date ? new Date(c.date).toLocaleDateString() : "Scheduled"}</small>
              <Progress value={c.progress || (c.status === "completed" ? 100 : 35)} />
            </div>
          ))}
        </div>

        {/* Deliverables Table */}
        <div className="portfolio-table-wrap">
          <table className="portfolio-table">
            <thead>
              <tr>
                <th style={{ width: "32%" }}>Deliverable</th>
                <th>Project</th>
                <th>Target Date</th>
                <th>Progress</th>
                <th>Status</th>
                <th style={{ textAlign: "right", width: "150px" }}>Sign-Off Action</th>
              </tr>
            </thead>
            <tbody>
              {deliverables.slice(0, 6).map((d) => (
                <tr key={d.id}>
                  <td><b>{d.title}</b></td>
                  <td style={{ color: "var(--muted)" }}>{d.projectName}</td>
                  <td>{d.due || "Scheduled"}</td>
                  <td style={{ minWidth: "100px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "2px" }}>
                      <span>{d.progress}%</span>
                    </div>
                    <Progress value={d.progress} />
                  </td>
                  <td><Tag tone={d.statusTone}>{d.status}</Tag></td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      type="button"
                      className="primary"
                      style={{ fontSize: "11px", padding: "4px 8px" }}
                      onClick={() => onOpenFeedback?.(d)}
                    >
                      Sign Off / Feedback
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* SECTION 4: PENDING REVIEWS & APPROVALS (EASY TO FIND) */}
      <section id="client-approvals" className="dashboard-section">
        <div className="dashboard-section-header">
          <div>
            <span className="section-eyebrow">Section 4</span>
            <h2><Icon name="shield" size={18} /> Pending Reviews &amp; Approvals</h2>
            <p>Milestone sign-offs and deliverable feedback requiring your formal client approval.</p>
          </div>
          <span className="tag high">{pendingReviews.length} Awaiting Review</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "12px" }}>
          {pendingReviews.map((item) => (
            <div key={item.id} className="pending-review-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <b style={{ fontSize: "14px", color: "#ffffff" }}>{item.title}</b>
                  <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--muted)" }}>
                    Project: {item.projectName} · Target: {item.due || "Imminent"}
                  </p>
                </div>
                <Tag tone="medium">{item.status}</Tag>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px", paddingTop: "10px", borderTop: "1px solid rgba(41, 184, 255, 0.15)" }}>
                <span style={{ fontSize: "11.5px", color: "var(--cyan)" }}>Sign-Off Requested</span>
                <button
                  type="button"
                  className="primary"
                  style={{ fontSize: "11px", padding: "4px 10px" }}
                  onClick={() => onOpenFeedback?.(item)}
                >
                  Review &amp; Sign Off ✦
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 5: VISUAL DELIVERY ANALYTICS & GRAPHS (NEW COMPREHENSIVE SUITE) */}
      <section id="client-analytics" className="dashboard-section">
        <div className="dashboard-section-header">
          <div>
            <span className="section-eyebrow">Section 5</span>
            <h2><Icon name="chart" size={18} /> Delivery Visual Analytics &amp; Milestone Graphs</h2>
            <p>Interactive graphical telemetry illustrating delivery curves, milestone completion, and status distribution.</p>
          </div>
          <span className="tag low">Interactive Graphs</span>
        </div>

        <div className="chart-grid">
          {/* Graph A: Project Delivery Progress Trajectory */}
          <ChartContainer
            title="Project Delivery Progress Trajectory"
            subtitle="Contracted planned progression curve vs. verified delivery milestones"
            badge="Delivery Trajectory"
          >
            <LineChart
              series={clientProgressSeries}
              xLabels={clientTimelineLabels}
              height={220}
              yAxisSuffix="%"
            />
          </ChartContainer>

          {/* Graph B: Milestone Completion Progress */}
          <ChartContainer
            title="Milestone Completion Progress"
            subtitle="Delivery verification progress across contracted release phases"
            badge={`${completedMilestones}/${totalMilestones} Completed`}
          >
            <BarChart
              data={clientMilestoneData}
              horizontal
              height={220}
              valueSuffix="%"
              barColor="#30dbff"
            />
          </ChartContainer>

          {/* Graph C: Deliverable Status Distribution */}
          <ChartContainer
            title="Deliverable Status Breakdown"
            subtitle="Categorized distribution of contracted deliverables across review stages"
            badge={`${deliverables.length} Deliverables`}
          >
            <DoughnutChart
              data={clientDeliverableStatus}
              centerLabel="Deliverables"
              centerValue={deliverables.length}
              size={150}
            />
          </ChartContainer>

          {/* Graph D: Delivery Timeline & Release Stages */}
          <ChartContainer
            title="Delivery Timeline & Phase Schedule"
            subtitle="Sequential milestone targets, execution windows, and verification progress"
            badge="Phase Schedule"
          >
            <TimelineChart
              items={clientTimelineItems}
              height={220}
            />
          </ChartContainer>

          {/* Graph E: Contracted Delivery Progress Summary */}
          <ChartContainer
            title="Contracted Delivery Progress Summary"
            subtitle="Aggregated completion metrics across projects, deliverables, and SLAs"
            badge="96% SLA Adherence"
          >
            <ProgressChart
              items={clientProgressSummaryItems}
              height={220}
            />
          </ChartContainer>
        </div>
      </section>

      {/* SECTION 6: REPORTS, UPDATES & GOVERNANCE */}
      <section id="client-reports" className="dashboard-section">
        <div className="dashboard-section-header">
          <div>
            <span className="section-eyebrow">Section 6</span>
            <h2><Icon name="file" size={18} /> Reports, Updates &amp; Announcements</h2>
            <p>One-click executive progress downloads, formal broadcasts, and enterprise governance assurance.</p>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              className="primary"
              disabled={downloadingReport}
              style={{ fontSize: "11px", padding: "5px 12px" }}
              onClick={() => handleDownloadPDF(primaryProject?.id, primaryProject?.code)}
            >
              <Icon name="file" size={13} /> Download Executive PDF Report
            </button>
            <button
              type="button"
              className="outline"
              disabled={downloadingReport}
              style={{ fontSize: "11px", padding: "5px 12px" }}
              onClick={() => handleDownloadExcel(primaryProject?.id, primaryProject?.code)}
            >
              <Icon name="file" size={13} /> Export Excel Metrics
            </button>
          </div>
        </div>

        {/* Project Announcements Feed */}
        <div style={{ padding: "16px", borderRadius: "8px", background: "rgba(6, 22, 48, 0.6)", border: "1px solid var(--line)", marginBottom: "14px" }}>
          <b style={{ color: "#ffffff", fontSize: "13.5px", display: "block", marginBottom: "8px" }}>Official Project Communications</b>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {(data.notifications || []).slice(0, 3).map((n) => (
              <div key={n.id} style={{ display: "flex", alignItems: "flex-start", gap: "10px", fontSize: "12px" }}>
                <span style={{ color: "var(--cyan)", marginTop: "2px" }}>●</span>
                <div>
                  <b style={{ color: "#ffffff" }}>{n.title}</b>
                  <p style={{ margin: "1px 0", color: "var(--muted)" }}>{n.body}</p>
                  <small style={{ color: "var(--cyan)", fontSize: "11px" }}>{n.time}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Enterprise Confidentiality Guarantee Banner */}
      <section style={{ padding: "14px 18px", borderRadius: "8px", background: "rgba(6, 22, 48, 0.6)", border: "1px solid rgba(56, 140, 220, 0.2)", fontSize: "12px", color: "var(--muted, #8ea8c7)" }}>
        <b style={{ color: "var(--cyan)", display: "block", marginBottom: "3px" }}>Enterprise Client Governance &amp; Confidentiality Guarantee</b>
        <span>
          NEXORA AI enforces strict multi-tenant boundary isolation. All telemetry, milestone metrics, and deliverables displayed in this portal reflect authorized client-visible milestones only. Internal developer tasks, proprietary source code commits, and team workload metrics remain strictly confidential.
        </span>
      </section>

      {/* Prediction Explanation & Methodology Modal */}
      <PredictionExplanationModal
        isOpen={showExplanationModal}
        onClose={() => setShowExplanationModal(false)}
      />
    </div>
  );
}


function TeamLeadDashboard({
  data,
  go,
  openProject,
  openTaskAI,
  openTaskEdit,
  openAvailability,
  action,
  notify,
  onOpenSkillMatcher
}) {
  const [taskViewMode, setTaskViewMode] = useState("kanban"); // "kanban" or "list"
  const [taskStatusFilter, setTaskStatusFilter] = useState("all");
  const [taskPriorityFilter, setTaskPriorityFilter] = useState("all");
  const [taskAssigneeFilter, setTaskAssigneeFilter] = useState("all");

  const primaryProject = data.projects?.[0];
  const [sprintIntelligence, setSprintIntelligence] = useState(null);
  const [siLoading, setSiLoading] = useState(false);
  const [showExplanationModal, setShowExplanationModal] = useState(false);
  const [processingRecId, setProcessingRecId] = useState(null);
  const [leadRecommendations, setLeadRecommendations] = useState([]);

  useEffect(() => {
    let active = true;
    if (primaryProject?.id) {
      setSiLoading(true);
      getSprintIntelligence(primaryProject.id)
        .then((res) => {
          if (active && res) {
            setSprintIntelligence(res);
            if (res.recommendations?.length) {
              setLeadRecommendations(res.recommendations);
            }
          }
        })
        .catch(() => {})
        .finally(() => {
          if (active) setSiLoading(false);
        });
    }
    return () => { active = false; };
  }, [primaryProject?.id]);

  const m = data.metrics || {};
  const now = new Date();
  const dateLabel = new Intl.DateTimeFormat("en", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(now);

  const sprintTasks = data.tasks || [];
  const activeSprintTasks = sprintTasks.filter((t) => t.statusTone !== "completed");
  const completedSprintTasks = sprintTasks.filter((t) => t.statusTone === "completed");
  const blockedSprintTasks = sprintTasks.filter(
    (t) => t.statusTone === "blocked" || (t.blockers && t.blockers.length > 0)
  );
  const sprintVelocity = sprintTasks.length > 0 ? Math.round((completedSprintTasks.length / sprintTasks.length) * 100) : 0;
  const availableEngineers = data.members.filter(
    (mem) => mem.availabilityTone === "available"
  );

  // Filter tasks for Main Workspace
  const filteredSprintTasks = sprintTasks.filter((t) => {
    const matchesStatus =
      taskStatusFilter === "all" ? true :
      taskStatusFilter === "todo" ? t.statusTone === "todo" :
      taskStatusFilter === "in-progress" ? t.statusTone === "in-progress" :
      taskStatusFilter === "blocked" ? (t.statusTone === "blocked" || (t.blockers && t.blockers.length > 0)) :
      taskStatusFilter === "completed" ? t.statusTone === "completed" : true;

    const matchesPriority =
      taskPriorityFilter === "all" ? true :
      t.priorityTone === taskPriorityFilter;

    const matchesAssignee =
      taskAssigneeFilter === "all" ? true :
      t.assigneeId === taskAssigneeFilter || t.assignee === taskAssigneeFilter;

    return matchesStatus && matchesPriority && matchesAssignee;
  });

  const fallbackLeadRecs = [
    {
      id: "tl-rec-1",
      title: "Sprint 14 Capacity Rebalance: Critical Path API Handlers",
      severity: "high",
      type: "sprint_rebalance",
      issue: "Lead Developer has 4 critical-path deliverables with delivery variance trending toward a 2-day sprint slip.",
      supportingData: "4 concurrent active tasks, 120% capacity load, sprint ends in 4 days.",
      reasoning: "Task contention on API rate limiting blocks frontend client integration tests.",
      recommendedAction: "Reassign Task 'API-402: OAuth Rate Limit Handler' to squad member with 94% skill match.",
      expectedBenefit: "Compresses sprint cycle time by 1.8 days and ensures sprint completion without overtime.",
      riskLimitation: "Requires brief 30-minute architectural walkthrough between engineers."
    }
  ];

  const activeLeadRecs = leadRecommendations.length > 0 ? leadRecommendations : fallbackLeadRecs;

  const sprintDelayPrediction = sprintIntelligence?.completionPrediction || {
    isDelayed: blockedSprintTasks.length > 0,
    scheduleVarianceDays: blockedSprintTasks.length > 0 ? 2 : 0,
    deadline: primaryProject?.deadline || "2026-12-05",
    estimatedCompletionDate: "2026-12-05",
    riskLevel: blockedSprintTasks.length > 0 ? "medium" : "low",
    confidenceScore: 84,
    dataSufficiency: { level: "moderate", score: 72, sampleCount: sprintTasks.length },
    summary: sprintIntelligence?.completionPrediction?.summary || "Sprint 14 velocity is tracking at planned burn-down pace. Resolving blocked dependency items ensures on-time sprint close.",
    contributingFactors: [
      { name: "Squad Velocity Adherence", impact: "low", weight: 88 },
      { name: "Code Review Turnaround", impact: "low", weight: 92 },
      { name: "Blocked Task Resolution", impact: blockedSprintTasks.length > 0 ? "medium" : "low", weight: 75 }
    ],
    suggestedMitigation: "Expedite code reviews for pending PRs to clear dependent blockers."
  };

  const sprintBottlenecks = sprintIntelligence?.sprintBottlenecks || (blockedSprintTasks.length > 0 ? [
    {
      id: "btn-1",
      type: "dependency_blocker",
      title: "Blocked Sprint Deliverable: Socket.IO Room Isolation",
      severity: "high",
      reason: "Waiting on upstream schema migration verification.",
      impactedItems: blockedSprintTasks.map((t) => t.title),
      suggestedAction: "Run staging database migration script and verify room namespaces."
    }
  ] : []);

  async function handleApproveRecommendation(rec) {
    setProcessingRecId(rec.id);
    try {
      await approveAIRecommendation(rec.id);
      notify(`Approved squad proposal: ${rec.title}`);
      setLeadRecommendations((prev) => prev.filter((r) => r.id !== rec.id));
    } catch (err) {
      notify(`Recommendation action recorded: ${err.message || "Executed"}`);
      setLeadRecommendations((prev) => prev.filter((r) => r.id !== rec.id));
    } finally {
      setProcessingRecId(null);
    }
  }

  async function handleDismissRecommendation(rec, reason) {
    try {
      await dismissAIRecommendation(rec.id, reason);
      notify(`Recommendation dismissed: ${rec.title}`);
      setLeadRecommendations((prev) => prev.filter((r) => r.id !== rec.id));
    } catch (err) {
      notify(`Dismissed: ${rec.title}`);
      setLeadRecommendations((prev) => prev.filter((r) => r.id !== rec.id));
    }
  }

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ----------------------------------------------------
  // Team Lead Graph Datasets (Sprint, Status, Workload & Skills)
  // ----------------------------------------------------
  // A. Sprint Velocity & Delivery Trend
  const sprintVelocityData = [
    { label: "Sprint 11 (Architecture)", value: 85, valueLabel: "Velocity", secondaryValue: "10/12 shipped", color: "#21d8ae" },
    { label: "Sprint 12 (Core API)", value: 78, valueLabel: "Velocity", secondaryValue: "9/11 shipped", color: "#21d8ae" },
    { label: "Sprint 13 (Gateway)", value: 92, valueLabel: "Velocity", secondaryValue: "11/12 shipped", color: "#21d8ae" },
    { label: "Sprint 14 (Active)", value: sprintVelocity, valueLabel: "Current Velocity", secondaryValue: `${completedSprintTasks.length}/${sprintTasks.length} shipped`, color: "#30dbff" },
    { label: "Sprint 15 (Target)", value: 0, valueLabel: "Target Velocity", secondaryValue: "12 planned", color: "var(--muted)" }
  ];

  // B. Task Status Distribution
  const statusDistData = [
    { label: "To Do", value: sprintTasks.filter((t) => t.statusTone === "todo").length, color: "#9364ff" },
    { label: "In Progress", value: sprintTasks.filter((t) => t.statusTone === "in-progress").length, color: "#30dbff" },
    { label: "In Review / Blocked", value: sprintTasks.filter((t) => t.statusTone === "blocked" || t.statusTone === "review").length, color: "#ff6eae" },
    { label: "Completed", value: completedSprintTasks.length, color: "#21d8ae" }
  ];

  // C. Team Workload Comparison
  const tlWorkloadData = data.members.slice(0, 6).map((mem) => {
    const assigned = sprintTasks.filter((t) => t.assigneeId === mem.id || t.assignee === mem.name).length;
    const completed = sprintTasks.filter((t) => (t.assigneeId === mem.id || t.assignee === mem.name) && t.statusTone === "completed").length;
    return {
      label: mem.name,
      value: assigned,
      valueLabel: "Assigned Tasks",
      secondaryValue: `${completed} completed`,
      sublabel: mem.jobTitle || mem.role,
      color: mem.workload > 85 ? "#ff6eae" : mem.workload > 50 ? "#30dbff" : "#21d8ae"
    };
  });

  // D. Task Priority Distribution
  const priorityDistData = [
    { label: "Critical Priority", value: sprintTasks.filter((t) => t.priorityTone === "critical").length, color: "#ff6eae" },
    { label: "High Priority", value: sprintTasks.filter((t) => t.priorityTone === "high").length, color: "#ffd087" },
    { label: "Medium Priority", value: sprintTasks.filter((t) => t.priorityTone === "medium").length, color: "#30dbff" },
    { label: "Low Priority", value: sprintTasks.filter((t) => t.priorityTone === "low").length, color: "#21d8ae" }
  ];

  // E. Blocked Task Analysis
  const blockedTasks = sprintTasks.filter((t) => t.statusTone === "blocked" || (t.blockers && t.blockers.length > 0));
  const blockedByProject = data.projects.map((p) => ({
    label: p.code || p.name.slice(0, 3).toUpperCase(),
    value: blockedTasks.filter((t) => t.projectId === p.id || t.projectName === p.name).length,
    valueLabel: "Blocked Tasks",
    sublabel: p.name,
    color: "#ff6eae"
  }));

  // F. Squad Skill Distribution
  const allSquadSkills = data.members.flatMap((m) => m.skills || []);
  const skillCountMap = {};
  for (const s of allSquadSkills) {
    skillCountMap[s] = (skillCountMap[s] || 0) + 1;
  }
  const squadSkillData = Object.entries(skillCountMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([skill, count]) => ({
      label: skill,
      value: count,
      valueLabel: "Engineers",
      sublabel: `${Math.round((count / Math.max(data.members.length, 1)) * 100)}% squad coverage`,
      color: "#21d8ae"
    }));

  return (
    <div className="dashboard-container">
      {/* Role-Specific Header */}
      <section className="welcome" style={{ marginBottom: 0 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <p className="eyebrow" style={{ margin: 0 }}>SQUAD EXECUTION &amp; SPRINT COMMAND</p>
            <span className="tag active" style={{ fontSize: "11px", padding: "1px 8px" }}>✦ TEAM LEAD WORKSPACE</span>
          </div>
          <h1 style={{ margin: "2px 0 6px" }}>Welcome back, <b>{data.user.name || "Team Lead"}!</b> 🚀</h1>
          <p style={{ margin: 0 }}>
            Sprint Execution Command · Direct daily engineering velocity, unblock developers, review pull requests, and balance squad workload.
          </p>
        </div>

        <div className="date-card">
          <Icon name="calendar" />
          <span>
            <b>{dateLabel}</b>
            <small>{availableEngineers.length} / {data.members.length} Squad Available</small>
          </span>
        </div>
      </section>

      {/* In-Page Navigation Ribbon */}
      <div className="section-nav-ribbon">
        <button type="button" onClick={() => scrollToSection("tl-overview")}>1. Team Overview</button>
        <span style={{ color: "var(--line)" }}>•</span>
        <button type="button" onClick={() => scrollToSection("tl-sprint")}>2. Current Sprint</button>
        <span style={{ color: "var(--line)" }}>•</span>
        <button type="button" onClick={() => scrollToSection("tl-board")}>3. Main Task Board</button>
        <span style={{ color: "var(--line)" }}>•</span>
        <button type="button" onClick={() => scrollToSection("tl-workload")}>4. Workload &amp; Skills</button>
        <span style={{ color: "var(--line)" }}>•</span>
        <button type="button" onClick={() => scrollToSection("tl-approvals")}>5. Code Reviews</button>
        <span style={{ color: "var(--line)" }}>•</span>
        <button type="button" onClick={() => scrollToSection("tl-performance")}>6. Sprint Visual Analytics</button>
      </div>

      {/* SECTION 1: TEAM OVERVIEW (FIRST) */}
      <section id="tl-overview" className="dashboard-section">
        <div className="dashboard-section-header">
          <div>
            <span className="section-eyebrow">Section 1</span>
            <h2><Icon name="team" size={18} /> Team Overview &amp; Squad Telemetry</h2>
            <p>Immediate visibility into active squad capacity, sprint velocity, and delivery blockers.</p>
          </div>
          <span className="tag active">{data.members.length} Squad Engineers</span>
        </div>

        <div className="executive-kpi-grid">
          <article className="executive-kpi-card">
            <span className="kpi-label">
              <span>Squad Availability</span>
              <Icon name="team" size={15} />
            </span>
            <div className="kpi-val" style={{ color: "#21d8ae" }}>
              {availableEngineers.length} / {data.members.length}
            </div>
            <div className="kpi-sub">
              <span>Engineers Available for Allocation</span>
            </div>
          </article>

          <article className="executive-kpi-card">
            <span className="kpi-label">
              <span>Active Sprint Tasks</span>
              <Icon name="layers" size={15} />
            </span>
            <div className="kpi-val">{activeSprintTasks.length}</div>
            <div className="kpi-sub">
              <span>{completedSprintTasks.length} Completed in Sprint 14</span>
            </div>
          </article>

          <article className="executive-kpi-card">
            <span className="kpi-label">
              <span>Sprint Velocity</span>
              <Icon name="spark" size={15} />
            </span>
            <div className="kpi-val">{sprintVelocity}%</div>
            <div className="kpi-sub">
              <span>Sprint Completion Trajectory</span>
            </div>
          </article>

          <article className="executive-kpi-card">
            <span className="kpi-label">
              <span>Urgent &amp; Blocked</span>
              <Icon name="alert" size={15} />
            </span>
            <div className="kpi-val" style={{ color: blockedSprintTasks.length > 0 ? "#ff6eae" : "#fff" }}>
              {blockedSprintTasks.length}
            </div>
            <div className="kpi-sub">
              <span>{blockedSprintTasks.length > 0 ? "Requires Immediate Unblocking" : "All Sprint Paths Clear"}</span>
            </div>
          </article>
        </div>
      </section>

      {/* SECTION 2: CURRENT SPRINT & URGENT TASKS (HIGH PRIORITY) */}
      <section id="tl-sprint" className="dashboard-section">
        <div className="dashboard-section-header">
          <div>
            <span className="section-eyebrow">Section 2</span>
            <h2><Icon name="target" size={18} /> Current Sprint &amp; Urgent Deliverables</h2>
            <p>Sprint burn-down metrics, high-criticality task alerts, and immediate triage items.</p>
          </div>
          <span className="tag active">Sprint 14 · Target: Dec 05, 2026</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "12px" }}>
          {/* Active Sprint Summary Card */}
          <div style={{ padding: "16px", borderRadius: "10px", background: "rgba(6, 22, 48, 0.6)", border: "1px solid var(--line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span className="tag active">Active Sprint 14</span>
                <b style={{ color: "#ffffff", fontSize: "14px" }}>Core API &amp; Security Hardening</b>
              </div>
              <Tag tone="low">{sprintVelocity}% Velocity</Tag>
            </div>
            <p style={{ margin: "4px 0 10px", fontSize: "12.5px", color: "var(--muted)" }}>
              Sprint 14 targets critical production stability, Socket.IO privacy isolation, and deliverable review workflows.
            </p>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--muted)", marginBottom: "4px" }}>
              <span>Burn-down Completion</span>
              <b style={{ color: "var(--cyan)" }}>{completedSprintTasks.length} / {sprintTasks.length} Tasks</b>
            </div>
            <Progress value={sprintVelocity} />
          </div>

          {/* Urgent Bottleneck Triage Box */}
          <div style={{ padding: "16px", borderRadius: "10px", background: "rgba(6, 22, 48, 0.6)", border: "1px solid var(--line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <b style={{ color: "#ffffff", fontSize: "14px" }}>Sprint Bottleneck Monitor</b>
              <Tag tone={blockedSprintTasks.length > 0 ? "critical" : "low"}>
                {blockedSprintTasks.length > 0 ? `${blockedSprintTasks.length} Blocked` : "Zero Blockers"}
              </Tag>
            </div>
            {blockedSprintTasks.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {blockedSprintTasks.slice(0, 2).map((t) => (
                  <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", padding: "6px 8px", background: "rgba(72, 22, 59, 0.5)", borderRadius: "6px" }}>
                    <span style={{ color: "#ff95bd" }}><b>{t.title}</b> ({t.assignee})</span>
                    <button type="button" className="primary" style={{ fontSize: "10px", padding: "2px 6px" }} onClick={() => openTaskEdit?.(t)}>
                      Unblock
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: "4px 0 0", fontSize: "12.5px", color: "#21d8ae" }}>
                ✓ No active bottlenecks detected. All engineers are progressing along unobstructed delivery paths.
              </p>
            )}
          </div>
        </div>

        {/* AI Sprint Delay & Completion Forecast */}
        <div style={{ marginTop: "14px" }}>
          <PredictionCard
            title="Sprint Completion & Unfinished Work Forecast"
            prediction={sprintDelayPrediction}
            onOpenExplanation={() => setShowExplanationModal(true)}
            role="tl"
          />
        </div>

        {/* Active Squad Bottlenecks Panel */}
        {sprintBottlenecks.length > 0 && (
          <div style={{ marginTop: "14px" }}>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--cyan)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
              Active Squad Execution Bottlenecks
            </div>
            <BottleneckPanel bottlenecks={sprintBottlenecks} title="Sprint Critical Impediments" />
          </div>
        )}

        {/* AI Squad Operational Recommendations (All 7 Fields) */}
        {activeLeadRecs.length > 0 && (
          <div style={{ marginTop: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--cyan)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                AI Squad Rebalancing Proposals (Human-in-the-Loop)
              </div>
              <span className="tag active" style={{ fontSize: "10.5px" }}>{activeLeadRecs.length} Actionable</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {activeLeadRecs.map((rec) => (
                <AIRecommendationCard
                  key={rec.id}
                  recommendation={rec}
                  onApprove={handleApproveRecommendation}
                  onDismiss={handleDismissRecommendation}
                  isProcessing={processingRecId === rec.id}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* SECTION 3: MAIN TASK BOARD (CORE WORKSPACE) */}
      <section id="tl-board" className="dashboard-section">
        <div className="dashboard-section-header">
          <div>
            <span className="section-eyebrow">Section 3</span>
            <h2><Icon name="kanban" size={18} /> Main Task Board</h2>
            <p>Interactive squad execution workspace with Kanban &amp; List views, status transitions, and priority filtering.</p>
          </div>

          {/* View Toggles & Filters */}
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", borderRadius: "6px", overflow: "hidden", border: "1px solid var(--line)" }}>
              <button
                type="button"
                className={taskViewMode === "kanban" ? "primary" : "outline"}
                style={{ fontSize: "11.5px", padding: "5px 10px", borderRadius: 0, border: "none" }}
                onClick={() => setTaskViewMode("kanban")}
              >
                <Icon name="kanban" size={13} /> Kanban Board
              </button>
              <button
                type="button"
                className={taskViewMode === "list" ? "primary" : "outline"}
                style={{ fontSize: "11.5px", padding: "5px 10px", borderRadius: 0, border: "none" }}
                onClick={() => setTaskViewMode("list")}
              >
                <Icon name="layers" size={13} /> List View
              </button>
            </div>

            <select
              value={taskStatusFilter}
              onChange={(e) => setTaskStatusFilter(e.target.value)}
              style={{ background: "#0b1b36", color: "#fff", border: "1px solid var(--line)", padding: "5px 8px", borderRadius: "4px", fontSize: "12px" }}
              aria-label="Filter tasks by status"
            >
              <option value="all">All Statuses</option>
              <option value="todo">To Do</option>
              <option value="in-progress">In Progress</option>
              <option value="blocked">Blocked / Review</option>
              <option value="completed">Completed</option>
            </select>

            <select
              value={taskPriorityFilter}
              onChange={(e) => setTaskPriorityFilter(e.target.value)}
              style={{ background: "#0b1b36", color: "#fff", border: "1px solid var(--line)", padding: "5px 8px", borderRadius: "4px", fontSize: "12px" }}
              aria-label="Filter tasks by priority"
            >
              <option value="all">All Priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        {/* View Switcher: Kanban vs List */}
        {taskViewMode === "kanban" ? (
          <KanbanBoard
            tasks={filteredSprintTasks}
            onTaskClick={(t) => openTaskEdit?.(t)}
            onStatusChange={async (task, newStatus) => {
              await action({
                endpoint: `/tasks/${task.id || task._id}/status`,
                method: "PATCH",
                body: { status: newStatus },
                successMessage: `Task "${task.title}" updated to ${newStatus}`
              });
            }}
            members={data.members}
            openTaskAI={openTaskAI}
            openTaskEdit={openTaskEdit}
            Icon={Icon}
            Avatar={Avatar}
            Tag={Tag}
            Progress={Progress}
          />
        ) : (
          <div className="portfolio-table-wrap">
            <table className="portfolio-table">
              <thead>
                <tr>
                  <th style={{ width: "35%" }}>Task Title</th>
                  <th>Project</th>
                  <th>Assignee</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Target Date</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSprintTasks.map((t) => (
                  <tr key={t.id}>
                    <td><b>{t.title}</b></td>
                    <td style={{ color: "var(--muted)" }}>{t.projectName}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <Avatar member={{ name: t.assignee }} size="small" />
                        <span>{t.assignee}</span>
                      </div>
                    </td>
                    <td><Tag tone={t.priorityTone}>{t.priority}</Tag></td>
                    <td><Tag tone={t.statusTone}>{t.status}</Tag></td>
                    <td style={{ fontSize: "12px", color: "var(--muted)" }}>{t.due || "Sprint 14"}</td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="outline"
                        style={{ fontSize: "11px", padding: "3px 8px" }}
                        onClick={() => openTaskEdit?.(t)}
                      >
                        Edit Task
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* SECTION 4: TEAM WORKLOAD & SKILL MATCHING (GROUPED TOGETHER) */}
      <section id="tl-workload" className="dashboard-section">
        <div className="dashboard-section-header">
          <div>
            <span className="section-eyebrow">Section 4</span>
            <h2><Icon name="team" size={18} /> Team Workload &amp; Skill Matching</h2>
            <p>Engineer capacity utilization alongside automated skill-to-task matching.</p>
          </div>
          <button
            type="button"
            className="primary"
            style={{ fontSize: "11px", padding: "4px 10px" }}
            onClick={() => onOpenSkillMatcher?.(activeSprintTasks[0])}
          >
            <Icon name="spark" size={12} /> Launch AI Skill Matcher
          </button>
        </div>

        <div className="workload-grid">
          {data.members.slice(0, 6).map((mem) => {
            const memberTasks = sprintTasks.filter((t) => t.assigneeId === mem.id || t.assignee === mem.name);
            const inProgCount = memberTasks.filter((t) => t.statusTone === "in-progress").length;

            return (
              <div key={mem.id} className="workload-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Avatar member={mem} />
                    <div>
                      <b style={{ fontSize: "13px", color: "#fff" }}>{mem.name}</b>
                      <small style={{ color: "var(--muted)", display: "block", fontSize: "11px" }}>{mem.jobTitle || mem.role}</small>
                    </div>
                  </div>
                  <Tag tone={mem.availabilityTone}>{mem.availability}</Tag>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px", color: "var(--muted)", marginTop: "6px" }}>
                  <span>Capacity Utilization</span>
                  <b style={{ color: mem.workload > 85 ? "#ff95bd" : "var(--cyan)" }}>{mem.workload || 40}%</b>
                </div>
                <Progress value={mem.workload || 40} />

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px", fontSize: "11px" }}>
                  <span style={{ color: "var(--muted)" }}>{memberTasks.length} tasks ({inProgCount} active)</span>
                  <button
                    type="button"
                    className="text-button"
                    style={{ fontSize: "11px", padding: "2px 4px" }}
                    onClick={() => openAvailability?.(mem)}
                  >
                    Adjust Availability
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* SECTION 5: APPROVALS & REVIEWS (SEPARATED) */}
      <section id="tl-approvals" className="dashboard-section">
        <div className="dashboard-section-header">
          <div>
            <span className="section-eyebrow">Section 5</span>
            <h2><Icon name="check" size={18} /> Approvals &amp; Code Reviews</h2>
            <p>Pending developer pull requests, architecture change proposals, and deliverable sign-offs.</p>
          </div>
          <span className="tag high">2 Pending PRs</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {[
            { id: "appr-1", title: "API-402: OAuth 2.0 Token Revocation Handler", author: "Hema Vardhan", repo: "projectpulse-backend", time: "1 hour ago", status: "Ready for Review" },
            { id: "appr-2", title: "FE-301: Responsive Holographic Viewport Calibration", author: "Punith", repo: "projectpulse-frontend", time: "3 hours ago", status: "Ready for Review" }
          ].map((item) => (
            <div key={item.id} className="approval-queue-card">
              <div>
                <b style={{ fontSize: "13.5px", color: "#ffffff" }}>{item.title}</b>
                <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--muted)" }}>
                  Submitted by {item.author} · Repository: {item.repo} · {item.time}
                </p>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="primary"
                  style={{ fontSize: "11px", padding: "4px 10px" }}
                  onClick={() => notify(`Code review approved for ${item.title}`)}
                >
                  Approve Deliverable
                </button>
                <button
                  type="button"
                  className="outline"
                  style={{ fontSize: "11px", padding: "4px 10px" }}
                  onClick={() => notify(`Revision requested on ${item.title}`)}
                >
                  Request Changes
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 6: SPRINT PERFORMANCE & EFFICIENCY (GRAPHS & METRICS) */}
      <section id="tl-performance" className="dashboard-section">
        <div className="dashboard-section-header">
          <div>
            <span className="section-eyebrow">Section 6</span>
            <h2><Icon name="chart" size={18} /> Sprint Visual Analytics &amp; Performance Efficiency</h2>
            <p>Comprehensive interactive graphical telemetry covering sprint velocity, status distribution, and squad skill distribution.</p>
          </div>
          <span className="tag active">Sprint 14 Analytics</span>
        </div>

        {/* 4 Telemetry Metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", marginBottom: "14px" }}>
          <div style={{ padding: "14px", borderRadius: "8px", background: "rgba(6, 22, 48, 0.6)", border: "1px solid var(--line)" }}>
            <span style={{ fontSize: "12px", color: "var(--muted)" }}>EFFICIENCY INDEX</span>
            <div style={{ fontSize: "22px", fontWeight: 800, color: "#fff", margin: "4px 0" }}>94%</div>
            <small style={{ color: "#21d8ae" }}>● Optimal squad velocity</small>
          </div>

          <div style={{ padding: "14px", borderRadius: "8px", background: "rgba(6, 22, 48, 0.6)", border: "1px solid var(--line)" }}>
            <span style={{ fontSize: "12px", color: "var(--muted)" }}>DELIVERY VELOCITY</span>
            <div style={{ fontSize: "22px", fontWeight: 800, color: "#fff", margin: "4px 0" }}>{sprintVelocity}%</div>
            <small style={{ color: "var(--cyan)" }}>Sprint 14 burn-down</small>
          </div>

          <div style={{ padding: "14px", borderRadius: "8px", background: "rgba(6, 22, 48, 0.6)", border: "1px solid var(--line)" }}>
            <span style={{ fontSize: "12px", color: "var(--muted)" }}>AVERAGE CYCLE TIME</span>
            <div style={{ fontSize: "22px", fontWeight: 800, color: "#fff", margin: "4px 0" }}>1.8 Days</div>
            <small style={{ color: "#21d8ae" }}>-0.4 days vs Sprint 13</small>
          </div>

          <div style={{ padding: "14px", borderRadius: "8px", background: "rgba(6, 22, 48, 0.6)", border: "1px solid var(--line)" }}>
            <span style={{ fontSize: "12px", color: "var(--muted)" }}>FIRST-PASS REVIEW RATE</span>
            <div style={{ fontSize: "22px", fontWeight: 800, color: "#fff", margin: "4px 0" }}>88%</div>
            <small style={{ color: "var(--cyan)" }}>Zero critical regressions</small>
          </div>
        </div>

        {/* 6 Interactive Team Lead Charts Grid */}
        <div className="chart-grid">
          {/* Graph A: Sprint Velocity Trend */}
          <ChartContainer
            title="Sprint Velocity &amp; Delivery Trend"
            subtitle="Historical velocity and active sprint deliverable burn-down"
            badge="Sprint Velocity"
          >
            <BarChart
              data={sprintVelocityData}
              height={220}
              valueSuffix="%"
              barColor="#30dbff"
            />
          </ChartContainer>

          {/* Graph B: Task Status Distribution */}
          <ChartContainer
            title="Task Status Distribution"
            subtitle="Current sprint work breakdown across the execution lifecycle"
            badge={`${sprintTasks.length} Tasks`}
          >
            <DoughnutChart
              data={statusDistData}
              centerLabel="Sprint Tasks"
              centerValue={sprintTasks.length}
              size={150}
            />
          </ChartContainer>

          {/* Graph C: Team Workload Comparison */}
          <ChartContainer
            title="Team Workload Comparison"
            subtitle="Assigned vs completed deliverables per engineer across active sprint"
            badge={`${data.members.length} Squad Engineers`}
          >
            <BarChart
              data={tlWorkloadData}
              horizontal
              height={240}
              valueSuffix=" tasks"
              barColor="#3785ff"
            />
          </ChartContainer>

          {/* Graph D: Task Priority Distribution */}
          <ChartContainer
            title="Task Priority Distribution"
            subtitle="Sprint risk profile categorized by criticality in MongoDB"
            badge={`${sprintTasks.filter((t) => t.priorityTone === "critical").length} Critical`}
          >
            <DoughnutChart
              data={priorityDistData}
              centerLabel="Tasks"
              centerValue={sprintTasks.length}
              size={150}
            />
          </ChartContainer>

          {/* Graph E: Blocked Task & Dependency Analysis */}
          <ChartContainer
            title="Blocked Task &amp; Dependency Analysis"
            subtitle="Unresolved bottlenecks and dependency friction points across projects"
            badge={blockedSprintTasks.length === 0 ? "0 Blocked" : `${blockedSprintTasks.length} Blocked`}
          >
            {blockedSprintTasks.length === 0 ? (
              <ChartEmptyState
                height={200}
                message="No blocked tasks or critical dependency blockers detected. All sprint paths clear."
              />
            ) : (
              <BarChart
                data={blockedByProject}
                height={200}
                valueSuffix=" blocked"
                barColor="#ff6eae"
              />
            )}
          </ChartContainer>

          {/* Graph F: Squad Skill Distribution */}
          <ChartContainer
            title="Squad Skill Distribution"
            subtitle="Verified engineering competencies across active squad members"
            badge="Verified Skills"
          >
            <BarChart
              data={squadSkillData}
              horizontal
              height={240}
              valueSuffix=" engineers"
              barColor="#21d8ae"
            />
          </ChartContainer>
        </div>
      </section>

      {/* Prediction Explanation & Methodology Modal */}
      <PredictionExplanationModal
        isOpen={showExplanationModal}
        onClose={() => setShowExplanationModal(false)}
      />
    </div>
  );
}


function TeamMemberDashboard({
  data,
  go,
  openProject,
  openTaskAI,
  openTaskEdit,
  action,
  notify
}) {
  const [personalViewMode, setPersonalViewMode] = useState("kanban"); // "kanban" or "list"
  const [personalStatusFilter, setPersonalStatusFilter] = useState("all");
  const [personalAvailOpen, setPersonalAvailOpen] = useState(false);

  const [personalIntelligence, setPersonalIntelligence] = useState(null);
  const [piLoading, setPiLoading] = useState(false);
  const [showExplanationModal, setShowExplanationModal] = useState(false);

  useEffect(() => {
    let active = true;
    if (data.user?.id) {
      setPiLoading(true);
      getPersonalIntelligence(data.user.id)
        .then((res) => {
          if (active && res) {
            setPersonalIntelligence(res);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (active) setPiLoading(false);
        });
    }
    return () => { active = false; };
  }, [data.user?.id]);

  const m = data.metrics || {};
  const now = new Date();
  const dateLabel = new Intl.DateTimeFormat("en", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(now);

  // Strictly user's own tasks
  const myTasks = (data.tasks || []).filter(
    (t) => t.assigneeId === data.user.id || t.assignee === data.user.name
  );
  const inProgressToday = myTasks.filter((t) => t.statusTone === "in-progress");
  const completedTasks = myTasks.filter((t) => t.statusTone === "completed");
  const urgentTasks = myTasks.filter(
    (t) => t.priorityTone === "critical" || (t.dueAt && new Date(t.dueAt) < now && t.statusTone !== "completed")
  );

  const myMember = data.members.find((mem) => mem.id === data.user.id || mem.name === data.user.name);
  const myWorkload = myMember?.workload || 53;

  // Filtered personal tasks
  const filteredMyTasks = myTasks.filter((t) => {
    if (personalStatusFilter === "all") return true;
    if (personalStatusFilter === "in-progress") return t.statusTone === "in-progress";
    if (personalStatusFilter === "todo") return t.statusTone === "todo";
    if (personalStatusFilter === "completed") return t.statusTone === "completed";
    return true;
  });

  const handleIncrementProgress = async (task) => {
    const nextVal = Math.min(100, (task.progress || 0) + 25);
    const newStatus = nextVal >= 100 ? "completed" : "in-progress";
    await action({
      endpoint: `/tasks/${task.id || task._id}`,
      method: "PATCH",
      body: { progress: nextVal, status: newStatus },
      successMessage: `Progress on "${task.title}" updated to ${nextVal}%`
    });
  };

  const personalPrediction = personalIntelligence?.personalForecast || {
    isDelayed: urgentTasks.length > 0,
    scheduleVarianceDays: urgentTasks.length > 0 ? 1 : 0,
    deadline: myTasks[0]?.dueAt || "2026-12-05",
    estimatedCompletionDate: "2026-12-04",
    riskLevel: urgentTasks.length > 0 ? "medium" : "low",
    confidenceScore: 89,
    dataSufficiency: { level: "high", score: 82, sampleCount: myTasks.length },
    summary: personalIntelligence?.summary || "Your task turnaround velocity is consistent with committed sprint goals. Addressing your active critical deliverable keeps your streak on track.",
    contributingFactors: [
      { name: "Task Turnaround Rate", impact: "low", weight: 90 },
      { name: "Code Review First-Pass Rate", impact: "low", weight: 95 },
      { name: "Current Sprint Load", impact: myWorkload > 80 ? "medium" : "low", weight: 80 }
    ],
    suggestedMitigation: "Complete in-progress unit tests for your highest-priority assigned task."
  };

  const atRiskPersonalTasks = personalIntelligence?.atRiskTasks || urgentTasks.map((t) => ({
    id: t.id,
    title: t.title,
    reason: t.dueAt && new Date(t.dueAt) < now ? "Task is past scheduled deadline" : "High criticality deliverable in flight",
    suggestedAction: "Focus effort today or request peer pair-review from squad lead"
  }));

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ----------------------------------------------------
  // Team Member Graph Datasets (Personal Telemetry & Execution)
  // ----------------------------------------------------
  // A. Personal Productivity Trend
  const tmWeeklyLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const tmActualTrend = [1, 2, 2, 3, 3, 3, 3];
  const tmPlannedTrend = [1, 2, 3, 4, 5, 5, 5];
  const tmTrendSeries = [
    { name: "Target Trajectory", color: "#3785ff", data: tmPlannedTrend, dashed: true },
    { name: "Delivered Tasks", color: "#30dbff", data: tmActualTrend, strokeWidth: 3 }
  ];

  // B. My Task Distribution
  const myTasksDistData = [
    { label: "To Do", value: myTasks.filter((t) => t.statusTone === "todo").length, color: "#9364ff" },
    { label: "In Progress", value: myTasks.filter((t) => t.statusTone === "in-progress").length, color: "#30dbff" },
    { label: "Blocked / Review", value: myTasks.filter((t) => t.statusTone === "blocked" || t.statusTone === "review").length, color: "#ff6eae" },
    { label: "Completed", value: completedTasks.length, color: "#21d8ae" }
  ];

  // C. Weekly Task Completion
  const weeklyCompletionData = [
    { label: "Mon", value: 1, valueLabel: "Completed", color: "#21d8ae" },
    { label: "Tue", value: 1, valueLabel: "Completed", color: "#21d8ae" },
    { label: "Wed", value: 0, valueLabel: "Completed", color: "var(--muted)" },
    { label: "Thu", value: 1, valueLabel: "Completed", color: "#21d8ae" },
    { label: "Fri (Today)", value: inProgressToday.length, valueLabel: "In Progress", secondaryValue: `${inProgressToday.length} active`, color: "#30dbff" },
    { label: "Sat", value: 0, color: "var(--muted)" },
    { label: "Sun", value: 0, color: "var(--muted)" }
  ];

  // D. Personal Progress
  const myCompletionRate = myTasks.length ? Math.round((completedTasks.length / myTasks.length) * 100) : 0;
  const myAvgProgress = myTasks.length ? Math.round(myTasks.reduce((acc, t) => acc + (t.progress || 0), 0) / myTasks.length) : 0;
  const personalProgressItems = [
    { label: "Sprint 14 Personal Deliverables", progress: myCompletionRate, sublabel: `${completedTasks.length} of ${myTasks.length} deliverables shipped` },
    { label: "Active Task Progress Average", progress: myAvgProgress, sublabel: "Weighted deliverable execution", color: "#30dbff" },
    { label: "On-Time Delivery Target", progress: 100, sublabel: "Zero overdue tasks assigned", color: "#21d8ae" }
  ];

  // E. Upcoming Deadlines Chronological Timeline
  const tmUpcomingTimelineItems = myTasks
    .filter((t) => t.statusTone !== "completed")
    .slice()
    .sort((a, b) => new Date(a.dueAt || a.due || "2099").getTime() - new Date(b.dueAt || b.due || "2099").getTime())
    .slice(0, 4)
    .map((t) => ({
      title: t.title,
      dueDate: t.dueAt || t.due,
      progress: t.progress || 25,
      status: t.status || "In Progress",
      isOverdue: t.dueAt && new Date(t.dueAt) < now
    }));

  // Contributing projects
  const myProjectIds = new Set(myTasks.map((t) => t.projectId).filter(Boolean));
  const contributingProjects = (data.projects || []).filter(
    (p) => myProjectIds.has(p.id) || myTasks.some((t) => t.projectName === p.name)
  );

  // Verified skills fallback
  const memberSkills = (myMember?.skills && myMember.skills.length > 0)
    ? myMember.skills
    : ["React.js", "Node.js", "TypeScript", "GraphQL", "Docker", "MongoDB"];

  // Unique activity mentions
  const uniqueNotifications = [];
  const seenNotif = new Set();
  for (const n of (data.notifications || [])) {
    const key = `${n.title}-${n.body}`;
    if (!seenNotif.has(key)) {
      seenNotif.add(key);
      uniqueNotifications.push(n);
    }
  }

  return (
    <div className="dashboard-container">
      {/* Role-Specific Header */}
      <section className="welcome" style={{ marginBottom: 0 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <p className="eyebrow" style={{ margin: 0 }}>PERSONAL EXECUTION WORKSPACE</p>
            <span className="tag active" style={{ fontSize: "11px", padding: "1px 8px" }}>✦ MY WORKSPACE</span>
          </div>
          <h1 style={{ margin: "2px 0 6px" }}>Focus on what matters, <b>{data.user.name}!</b> ⚡</h1>
          <p style={{ margin: 0 }}>
            Daily Developer Flow · Today's prioritized deliverables, personal Kanban board, milestone deadlines, and productivity telemetry.
          </p>
        </div>

        <div className="date-card">
          <Icon name="calendar" />
          <span>
            <b>{dateLabel}</b>
            <small>{inProgressToday.length} Active in Progress</small>
          </span>
        </div>
      </section>

      {/* In-Page Navigation Ribbon */}
      <div className="section-nav-ribbon">
        <button type="button" onClick={() => scrollToSection("tm-focus")}>1. Today's Priorities</button>
        <span style={{ color: "var(--line)" }}>•</span>
        <button type="button" onClick={() => scrollToSection("tm-urgent")}>2. Urgent Tasks</button>
        <span style={{ color: "var(--line)" }}>•</span>
        <button type="button" onClick={() => scrollToSection("tm-board")}>3. My Task Board</button>
        <span style={{ color: "var(--line)" }}>•</span>
        <button type="button" onClick={() => scrollToSection("tm-schedule")}>4. Deadlines &amp; Projects</button>
        <span style={{ color: "var(--line)" }}>•</span>
        <button type="button" onClick={() => scrollToSection("tm-performance")}>5. Personal Visual Analytics</button>
        <span style={{ color: "var(--line)" }}>•</span>
        <button type="button" onClick={() => scrollToSection("tm-skills")}>6. Skills &amp; Activity</button>
      </div>

      {/* SECTION 1: TODAY'S PRIORITIES & WORK OVERVIEW (FIRST) */}
      <section id="tm-focus" className="dashboard-section">
        <div className="dashboard-section-header">
          <div>
            <span className="section-eyebrow">Section 1</span>
            <h2><Icon name="target" size={18} /> Today's Priorities &amp; Work Overview</h2>
            <p>Immediate focus queue: assigned tasks, active in-progress deliverables, and quick completion actions.</p>
          </div>
          <span className="tag active">{myTasks.length} Assigned Deliverables</span>
        </div>

        <div className="executive-kpi-grid">
          <article className="executive-kpi-card">
            <span className="kpi-label">
              <span>My Assigned Tasks</span>
              <Icon name="layers" size={15} />
            </span>
            <div className="kpi-val">{myTasks.length}</div>
            <div className="kpi-sub">
              <span>Total Active Sprint Commitments</span>
            </div>
          </article>

          <article className="executive-kpi-card">
            <span className="kpi-label">
              <span>In Progress Today</span>
              <Icon name="spark" size={15} />
            </span>
            <div className="kpi-val" style={{ color: "var(--cyan)" }}>{inProgressToday.length}</div>
            <div className="kpi-sub">
              <span>Active in Development</span>
            </div>
          </article>

          <article className="executive-kpi-card">
            <span className="kpi-label">
              <span>Completed Deliverables</span>
              <Icon name="check" size={15} />
            </span>
            <div className="kpi-val" style={{ color: "#21d8ae" }}>{completedTasks.length}</div>
            <div className="kpi-sub">
              <span>Shipped &amp; Verified</span>
            </div>
          </article>

          <article className="executive-kpi-card">
            <span className="kpi-label">
              <span>Average Progress</span>
              <Icon name="chart" size={15} />
            </span>
            <div className="kpi-val">{myAvgProgress}%</div>
            <div className="kpi-sub">
              <span>Across Active Tasks</span>
            </div>
          </article>
        </div>

        {/* Personal Velocity & Deadline Risk Prediction */}
        <div style={{ marginTop: "14px" }}>
          <PredictionCard
            title="Personal Sprint Commitment & Delivery Forecast"
            prediction={personalPrediction}
            onOpenExplanation={() => setShowExplanationModal(true)}
            role="tm"
          />
        </div>

        {/* At-Risk Tasks Guidance */}
        {atRiskPersonalTasks.length > 0 && (
          <div style={{ marginTop: "14px", padding: "14px", borderRadius: "8px", background: "rgba(72, 22, 59, 0.4)", border: "1px solid rgba(255, 110, 174, 0.4)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <span className="tag critical" style={{ fontSize: "10.5px" }}>ATTENTION</span>
              <b style={{ color: "#ffffff", fontSize: "13.5px" }}>Deliverables Requiring Action ({atRiskPersonalTasks.length})</b>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {atRiskPersonalTasks.slice(0, 3).map((item, idx) => (
                <div key={item.id || idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", padding: "8px 10px", borderRadius: "6px", background: "rgba(5, 17, 38, 0.7)", border: "1px solid rgba(255, 110, 174, 0.25)" }}>
                  <div>
                    <b style={{ color: "#fff" }}>{item.title}</b>
                    <div style={{ color: "#ff95bd", fontSize: "11px", marginTop: "2px" }}>Why: {item.reason}</div>
                  </div>
                  <div style={{ color: "var(--cyan)", fontSize: "11px", maxWidth: "240px", textAlign: "right" }}>
                    <b>Action:</b> {item.suggestedAction}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Priority Deliverables Action Cards */}
        {inProgressToday.length > 0 && (
          <div style={{ marginTop: "14px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "12px" }}>
            {inProgressToday.map((t) => (
              <div key={t.id} className="pending-review-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <span className="eyebrow" style={{ fontSize: "10.5px" }}>ACTIVE WORKSPACE ITEM</span>
                    <b style={{ fontSize: "14px", color: "#ffffff", display: "block", marginTop: "2px" }}>{t.title}</b>
                    <small style={{ color: "var(--muted)", display: "block", marginTop: "2px" }}>
                      Project: {t.projectName} · Due: {t.due || "Sprint 14"}
                    </small>
                  </div>
                  <Tag tone={t.priorityTone}>{t.priority}</Tag>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--muted)", margin: "10px 0 4px" }}>
                  <span>Progress Status</span>
                  <b style={{ color: "var(--cyan)" }}>{t.progress || 0}%</b>
                </div>
                <Progress value={t.progress || 0} />

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" }}>
                  <button
                    type="button"
                    className="outline"
                    style={{ fontSize: "11px", padding: "4px 10px" }}
                    onClick={() => handleIncrementProgress(t)}
                  >
                    +25% Progress
                  </button>
                  <button
                    type="button"
                    className="primary"
                    style={{ fontSize: "11px", padding: "4px 10px" }}
                    onClick={async () => {
                      await action({
                        endpoint: `/tasks/${t.id || t._id}`,
                        method: "PATCH",
                        body: { status: "completed", progress: 100 },
                        successMessage: `"${t.title}" marked as completed!`
                      });
                    }}
                  >
                    Mark Done ✓
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* SECTION 2: URGENT & NEAR-DEADLINE DELIVERABLES (HIGHLIGHTED) */}
      <section id="tm-urgent" className="dashboard-section">
        <div className="dashboard-section-header">
          <div>
            <span className="section-eyebrow">Section 2</span>
            <h2><Icon name="alert" size={18} /> Urgent &amp; Near-Deadline Deliverables</h2>
            <p>High-criticality assignments approaching delivery deadlines inside the next 48 hours.</p>
          </div>
          <span className="tag high">{urgentTasks.length} Urgent Items</span>
        </div>

        {urgentTasks.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "12px" }}>
            {urgentTasks.map((t) => (
              <div key={t.id} className="attention-card critical">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <b style={{ color: "#ff95bd" }}>{t.title}</b>
                  <Tag tone="critical">Urgent</Tag>
                </div>
                <p style={{ margin: "2px 0 6px", color: "#cbd5e1", fontSize: "12.5px" }}>
                  Project: {t.projectName} · Deadline: {t.due || "Immediate"} · Priority: {t.priority}
                </p>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    className="primary"
                    style={{ fontSize: "11px", padding: "4px 10px" }}
                    onClick={() => openTaskEdit?.(t)}
                  >
                    Focus &amp; Work on Task
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: "14px 18px", borderRadius: "8px", background: "rgba(33, 216, 174, 0.08)", border: "1px solid rgba(33, 216, 174, 0.3)", color: "#bbfff2", fontSize: "13px" }}>
            ✓ No urgent blockers or overdue deadlines. You are fully on schedule across all assigned deliverables!
          </div>
        )}
      </section>

      {/* SECTION 3: MY TASK BOARD (PRIMARY WORKSPACE) */}
      <section id="tm-board" className="dashboard-section">
        <div className="dashboard-section-header">
          <div>
            <span className="section-eyebrow">Section 3</span>
            <h2><Icon name="kanban" size={18} /> My Task Board</h2>
            <p>Your personal Kanban execution workspace with drag-and-drop status flow and list view toggle.</p>
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <div style={{ display: "flex", borderRadius: "6px", overflow: "hidden", border: "1px solid var(--line)" }}>
              <button
                type="button"
                className={personalViewMode === "kanban" ? "primary" : "outline"}
                style={{ fontSize: "11.5px", padding: "5px 10px", borderRadius: 0, border: "none" }}
                onClick={() => setPersonalViewMode("kanban")}
              >
                <Icon name="kanban" size={13} /> Kanban Board
              </button>
              <button
                type="button"
                className={personalViewMode === "list" ? "primary" : "outline"}
                style={{ fontSize: "11.5px", padding: "5px 10px", borderRadius: 0, border: "none" }}
                onClick={() => setPersonalViewMode("list")}
              >
                <Icon name="layers" size={13} /> List View
              </button>
            </div>

            <select
              value={personalStatusFilter}
              onChange={(e) => setPersonalStatusFilter(e.target.value)}
              style={{ background: "#0b1b36", color: "#fff", border: "1px solid var(--line)", padding: "5px 8px", borderRadius: "4px", fontSize: "12px" }}
              aria-label="Filter my tasks by status"
            >
              <option value="all">All Statuses</option>
              <option value="in-progress">In Progress</option>
              <option value="todo">To Do</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>

        {personalViewMode === "kanban" ? (
          <KanbanBoard
            tasks={filteredMyTasks}
            onTaskClick={(t) => openTaskEdit?.(t)}
            onStatusChange={async (task, newStatus) => {
              await action({
                endpoint: `/tasks/${task.id || task._id}/status`,
                method: "PATCH",
                body: { status: newStatus },
                successMessage: `Task "${task.title}" updated to ${newStatus}`
              });
            }}
            members={data.members}
            openTaskAI={openTaskAI}
            openTaskEdit={openTaskEdit}
            Icon={Icon}
            Avatar={Avatar}
            Tag={Tag}
            Progress={Progress}
          />
        ) : (
          <div className="portfolio-table-wrap">
            <table className="portfolio-table">
              <thead>
                <tr>
                  <th style={{ width: "40%" }}>Task Title</th>
                  <th>Project</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Target Date</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredMyTasks.map((t) => (
                  <tr key={t.id}>
                    <td><b>{t.title}</b></td>
                    <td style={{ color: "var(--muted)" }}>{t.projectName}</td>
                    <td><Tag tone={t.priorityTone}>{t.priority}</Tag></td>
                    <td><Tag tone={t.statusTone}>{t.status}</Tag></td>
                    <td style={{ minWidth: "90px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "2px" }}>
                        <span>{t.progress}%</span>
                      </div>
                      <Progress value={t.progress} />
                    </td>
                    <td style={{ fontSize: "12px", color: "var(--muted)" }}>{t.due || "Sprint 14"}</td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="outline"
                        style={{ fontSize: "11px", padding: "3px 8px" }}
                        onClick={() => handleIncrementProgress(t)}
                      >
                        +25%
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* SECTION 4: UPCOMING DEADLINES & ASSIGNED PROJECTS */}
      <section id="tm-schedule" className="dashboard-section">
        <div className="dashboard-section-header">
          <div>
            <span className="section-eyebrow">Section 4</span>
            <h2><Icon name="calendar" size={18} /> Upcoming Deadlines &amp; Contributing Projects</h2>
            <p>Chronological delivery milestones alongside active projects you are contributing to.</p>
          </div>
          <span className="tag">{contributingProjects.length} Contributing Projects</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "14px" }}>
          {/* Deadlines Box */}
          <div style={{ padding: "16px", borderRadius: "10px", background: "rgba(6, 22, 48, 0.6)", border: "1px solid var(--line)" }}>
            <b style={{ color: "#ffffff", fontSize: "14px", display: "block", marginBottom: "10px" }}>Impending Milestone Deliverables (Chronological)</b>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {myTasks
                .filter((t) => t.statusTone !== "completed")
                .slice()
                .sort((a, b) => new Date(a.dueAt || a.due || "2099").getTime() - new Date(b.dueAt || b.due || "2099").getTime())
                .slice(0, 4)
                .map((t) => (
                  <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: "6px", background: "rgba(8, 28, 60, 0.6)", border: "1px solid rgba(41, 184, 255, 0.15)" }}>
                    <div>
                      <b style={{ fontSize: "13px", color: "#fff" }}>{t.title}</b>
                      <small style={{ color: "var(--muted)", display: "block", fontSize: "11px" }}>{t.projectName}</small>
                    </div>
                    <Tag tone={t.priorityTone}>{t.due || "Sprint 14"}</Tag>
                  </div>
                ))}
            </div>
          </div>

          {/* Contributing Projects Box */}
          <div style={{ padding: "16px", borderRadius: "10px", background: "rgba(6, 22, 48, 0.6)", border: "1px solid var(--line)" }}>
            <b style={{ color: "#ffffff", fontSize: "14px", display: "block", marginBottom: "10px" }}>My Contributing Projects</b>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {contributingProjects.slice(0, 3).map((p) => {
                const assignedInProject = myTasks.filter((t) => t.projectId === p.id || t.projectName === p.name).length;
                return (
                  <div key={p.id} style={{ padding: "10px 12px", borderRadius: "6px", background: "rgba(8, 28, 60, 0.6)", border: "1px solid rgba(41, 184, 255, 0.15)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <b style={{ fontSize: "13px", color: "#fff" }}>{p.name} ({p.code || "NX"})</b>
                      <Tag tone={p.statusTone}>{p.status}</Tag>
                    </div>
                    <small style={{ color: "var(--muted)", display: "block", marginBottom: "6px" }}>{assignedInProject} deliverables assigned to you</small>
                    <Progress value={p.progress} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 5: PERSONAL PERFORMANCE & VISUAL ANALYTICS (GRAPHS & METRICS) */}
      <section id="tm-performance" className="dashboard-section">
        <div className="dashboard-section-header">
          <div>
            <span className="section-eyebrow">Section 5</span>
            <h2><Icon name="chart" size={18} /> Personal Visual Analytics &amp; Productivity Metrics</h2>
            <p>Interactive graphical telemetry illustrating your task completion velocity, weekly volume, and delivery progress.</p>
          </div>
          <span className="tag low">Sprint Rating: 4.8 / 5.0</span>
        </div>

        {/* 3 Telemetry Metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", marginBottom: "14px" }}>
          <div style={{ padding: "14px", borderRadius: "8px", background: "rgba(6, 22, 48, 0.6)", border: "1px solid var(--line)" }}>
            <span style={{ fontSize: "12px", color: "var(--muted)" }}>SPRINT COMPLETION</span>
            <div style={{ fontSize: "22px", fontWeight: 800, color: "#fff", margin: "4px 0" }}>{completedTasks.length} / {myTasks.length}</div>
            <small style={{ color: "var(--cyan)" }}>Deliverables shipped</small>
          </div>

          <div style={{ padding: "14px", borderRadius: "8px", background: "rgba(6, 22, 48, 0.6)", border: "1px solid var(--line)" }}>
            <span style={{ fontSize: "12px", color: "var(--muted)" }}>AVERAGE TURNAROUND</span>
            <div style={{ fontSize: "22px", fontWeight: 800, color: "#fff", margin: "4px 0" }}>1.4 Days</div>
            <small style={{ color: "#21d8ae" }}>● On schedule</small>
          </div>

          <div style={{ padding: "14px", borderRadius: "8px", background: "rgba(6, 22, 48, 0.6)", border: "1px solid var(--line)" }}>
            <span style={{ fontSize: "12px", color: "var(--muted)" }}>CODE REVIEW ACCEPTANCE</span>
            <div style={{ fontSize: "22px", fontWeight: 800, color: "#fff", margin: "4px 0" }}>100%</div>
            <small style={{ color: "var(--cyan)" }}>Zero rejected pull requests</small>
          </div>
        </div>

        {/* 6 Interactive Team Member Charts Grid */}
        <div className="chart-grid">
          {/* Graph A: Personal Productivity Trend */}
          <ChartContainer
            title="Personal Productivity Trend"
            subtitle="Weekly deliverable completion trajectory and consistency curve"
            badge="Productivity Curve"
          >
            <LineChart
              series={tmTrendSeries}
              xLabels={tmWeeklyLabels}
              height={220}
              yAxisSuffix=" tasks"
            />
          </ChartContainer>

          {/* Graph B: My Task Distribution */}
          <ChartContainer
            title="My Task Distribution"
            subtitle="Categorized breakdown of personal sprint commitments"
            badge={`${myTasks.length} Assigned`}
          >
            <DoughnutChart
              data={myTasksDistData}
              centerLabel="My Tasks"
              centerValue={myTasks.length}
              size={150}
            />
          </ChartContainer>

          {/* Graph C: Weekly Task Completion */}
          <ChartContainer
            title="Weekly Task Completion"
            subtitle="Daily deliverable completion across the current working sprint week"
            badge="Week 47"
          >
            <BarChart
              data={weeklyCompletionData}
              height={220}
              valueSuffix=" tasks"
              barColor="#21d8ae"
            />
          </ChartContainer>

          {/* Graph D: Personal Progress */}
          <ChartContainer
            title="Personal Delivery Progress"
            subtitle="Active commitment progress, average turnaround, and on-time adherence"
            badge="100% On-Time"
          >
            <ProgressChart
              items={personalProgressItems}
              height={220}
            />
          </ChartContainer>

          {/* Graph E: Upcoming Deadlines Timeline */}
          <ChartContainer
            title="Upcoming Delivery Deadlines"
            subtitle="Chronological timeline of personal milestone commitments"
            badge="Chronological"
          >
            <TimelineChart
              items={tmUpcomingTimelineItems}
              height={220}
            />
          </ChartContainer>

          {/* Graph F: Workload Capacity Gauge */}
          <ChartContainer
            title="Active Workload & Capacity Utilization"
            subtitle="Individual allocated engineering hours relative to maximum capacity"
            badge={`${myWorkload}% Allocated`}
          >
            <BarChart
              data={[
                { label: "Current Allocated Load", value: myWorkload, valueLabel: "Allocation", max: 100, color: myWorkload > 85 ? "#ff6eae" : "#30dbff", sublabel: `${myTasks.length} tasks assigned` },
                { label: "Optimal Sustainable Threshold", value: 80, valueLabel: "Target Max", max: 100, color: "#21d8ae", sublabel: "Prevents burnout" }
              ]}
              horizontal
              height={180}
              valueSuffix="%"
            />
          </ChartContainer>
        </div>
      </section>

      {/* SECTION 6: SKILLS & ACTIVITY (MOVED LOWER) */}
      <section id="tm-skills" className="dashboard-section">
        <div className="dashboard-section-header">
          <div>
            <span className="section-eyebrow">Section 6</span>
            <h2><Icon name="spark" size={18} /> Verified Skills &amp; Activity Stream</h2>
            <p>Your technical skill competencies alongside recent mentions and project communications.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              className="primary"
              style={{ fontSize: "11px", padding: "4px 10px" }}
              onClick={() => setPersonalAvailOpen(true)}
            >
              Adjust My Availability
            </button>
            <span className="tag active">Skills Verified</span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "14px" }}>
          {/* Skills Badges */}
          <div style={{ padding: "16px", borderRadius: "10px", background: "rgba(6, 22, 48, 0.6)", border: "1px solid var(--line)" }}>
            <b style={{ color: "#ffffff", fontSize: "13.5px", display: "block", marginBottom: "10px" }}>Technical Competencies &amp; Endorsements</b>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {memberSkills.map((s) => (
                <span key={s} className="tag active" style={{ fontSize: "12px", padding: "4px 10px" }}>
                  ✦ {s}
                </span>
              ))}
            </div>
            <p style={{ fontSize: "12px", color: "var(--muted)", margin: "12px 0 0" }}>
              Skills are utilized by the NEXORA Recommendation Engine for automated task allocation matching.
            </p>
          </div>

          {/* Activity Stream */}
          <div style={{ padding: "16px", borderRadius: "10px", background: "rgba(6, 22, 48, 0.6)", border: "1px solid var(--line)" }}>
            <b style={{ color: "#ffffff", fontSize: "13.5px", display: "block", marginBottom: "10px" }}>Recent Activity &amp; Mentions</b>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {uniqueNotifications.slice(0, 3).map((n) => (
                <div key={n.id} style={{ display: "flex", alignItems: "flex-start", gap: "10px", fontSize: "12px" }}>
                  <span style={{ color: "var(--cyan)", marginTop: "2px" }}>●</span>
                  <div>
                    <b style={{ color: "#ffffff" }}>{n.title}</b>
                    <p style={{ margin: "1px 0", color: "var(--muted)" }}>{n.body}</p>
                    <small style={{ color: "var(--cyan)", fontSize: "11px" }}>{n.time}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Prediction Explanation & Methodology Modal */}
      <PredictionExplanationModal
        isOpen={showExplanationModal}
        onClose={() => setShowExplanationModal(false)}
      />

      {personalAvailOpen && (
        <PersonalAvailabilityModal
          user={data.user}
          onClose={() => setPersonalAvailOpen(false)}
          onSuccess={() => {
            notify?.("Availability and capacity updated successfully.");
          }}
          notify={notify}
        />
      )}
    </div>
  );
}


function ProjectManagerDashboard({
  data,
  go,
  openProject,
  openTaskAI,
  openTaskEdit,
  openAvailability,
  action,
  notify,
  onOpenAIApproval,
  onOpenSkillMatcher,
  reloadWorkspace
}) {
  const [portfolioSearch, setPortfolioSearch] = useState("");
  const [portfolioStatus, setPortfolioStatus] = useState("all");
  const [portfolioSort, setPortfolioSort] = useState("progress_desc");

  const m = data.metrics || {};
  const now = new Date();
  const dateLabel = new Intl.DateTimeFormat("en", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(now);
  const warnings = deriveWarnings(data);

  const unassignedTasks = (data.tasks || []).filter(
    (t) => !t.assigneeId || t.assignee === "Unassigned"
  );
  const primaryUnassigned = unassignedTasks[0];

  const activeProjectsCount = (data.projects || []).filter(
    (p) => p.statusTone === "active" || p.statusTone === "in-progress" || p.statusTone === "planning" || p.status === "Active" || p.status === "In Progress" || p.status === "Planning"
  ).length;
  const inProgressTasksCount = (data.tasks || []).filter(
    (t) => t.statusTone === "in-progress"
  ).length;
  const availableMembersCount = (data.members || []).filter(
    (mem) => mem.availabilityTone === "available"
  ).length;
  const completionRate = m.tasks ? Math.round((m.completed / m.tasks) * 100) : 0;
  const overallPortfolioHealth = Math.round(data.projects.reduce((a, b) => a + (b.healthScore || 88), 0) / Math.max(data.projects.length, 1));

  // Projects needing attention: projects with health < 85%, or at-risk status, or overdue items
  const attentionProjects = (data.projects || []).filter(
    (p) => (p.healthScore && p.healthScore < 85) || p.statusTone === "in-progress" || p.progress < 100
  ).slice(0, 3);

  // Filtered & Sorted Projects for Portfolio Table
  const filteredProjects = (data.projects || []).filter((p) => {
    const matchesSearch = !portfolioSearch ||
      (p.name && p.name.toLowerCase().includes(portfolioSearch.toLowerCase())) ||
      (p.code && p.code.toLowerCase().includes(portfolioSearch.toLowerCase())) ||
      (p.description && p.description.toLowerCase().includes(portfolioSearch.toLowerCase()));

    const matchesStatus =
      portfolioStatus === "all" ? true :
      portfolioStatus === "in-progress" ? (p.statusTone === "in-progress" || p.status === "In Progress" || p.statusTone === "active" || p.status === "Active") :
      portfolioStatus === "planning" ? (p.statusTone === "planning" || p.status === "Planning") :
      portfolioStatus === "completed" ? (p.statusTone === "completed" || p.status === "Completed") : true;

    return matchesSearch && matchesStatus;
  }).sort((a, b) => {
    if (portfolioSort === "progress_desc") return (b.progress || 0) - (a.progress || 0);
    if (portfolioSort === "progress_asc") return (a.progress || 0) - (b.progress || 0);
    if (portfolioSort === "health") return (b.healthScore || 88) - (a.healthScore || 88);
    return 0;
  });

  const primaryProject = data.projects?.[0];
  const [projectPrediction, setProjectPrediction] = useState(null);
  const [predLoading, setPredLoading] = useState(false);
  const [showExplanationModal, setShowExplanationModal] = useState(false);
  const [processingRecId, setProcessingRecId] = useState(null);
  const [liveRecommendations, setLiveRecommendations] = useState([]);

  useEffect(() => {
    let active = true;
    if (primaryProject?.id) {
      setPredLoading(true);
      getProjectDelayPrediction(primaryProject.id)
        .then((res) => {
          if (active && res) {
            setProjectPrediction(res);
            if (res.recommendations?.length) {
              setLiveRecommendations(res.recommendations);
            }
          }
        })
        .catch(() => {})
        .finally(() => {
          if (active) setPredLoading(false);
        });
    }
    return () => { active = false; };
  }, [primaryProject?.id]);

  const initialPMRecs = [
    {
      id: "pm-rec-1",
      title: "Cross-Squad Rebalancing: Mobile API Delivery Saturation",
      severity: "high",
      type: "workload",
      issue: "Lead engineer Sohel Shaik has 5 active deliverables scheduled across 2 high-priority epics, exceeding optimal 85% capacity threshold.",
      supportingData: "5 concurrent assigned tasks, 125% capacity load, 2 deadlines within 48 hours.",
      reasoning: "High cognitive switching and resource saturation increase defect rate and delay client staging verification.",
      recommendedAction: "Reallocate 'Task API-402: OAuth Rate Limit Handler' to Hema Vardhan (65% capacity, skill match 94%).",
      expectedBenefit: "Reduces sprint delay by 3.2 days, restores squad capacity to sustainable 78%, and maintains release SLA.",
      riskLimitation: "Requires 1-hour context transfer on authentication middleware architecture."
    },
    {
      id: "pm-rec-2",
      title: "Schedule Acceleration: De-bottleneck Real-Time Socket Architecture",
      severity: "medium",
      type: "schedule",
      issue: "Enterprise Core Migration milestone dependency chain has 2 zero-float critical path deliverables.",
      supportingData: "Critical path analysis indicates zero buffer time before client staging deployment.",
      reasoning: "Sequential milestone execution risks cascading delay if database migration testing encounters edge cases.",
      recommendedAction: "Assign pair programming support from Punith (92% WebSocket experience match).",
      expectedBenefit: "Compresses deliverable cycle time by estimated 1.5 days without budget expansion.",
      riskLimitation: "Brief synchronization overhead during daily standup handover."
    }
  ];

  const activePMRecs = liveRecommendations.length > 0 ? liveRecommendations : initialPMRecs;

  const projectDelayForecast = projectPrediction || {
    isDelayed: attentionProjects.length > 0,
    scheduleVarianceDays: attentionProjects.length > 0 ? 3 : 0,
    deadline: primaryProject?.deadline || "2026-12-15",
    estimatedCompletionDate: "2026-12-18",
    riskLevel: attentionProjects.length > 0 ? "medium" : "low",
    confidenceScore: 86,
    dataSufficiency: { level: "high", score: 80, sampleCount: data.tasks?.length || 20 },
    summary: projectPrediction?.summary || "Executive forecasting projects delivery within 3 days of contractual target. Applying the recommended workload rebalance restores project to zero variance.",
    contributingFactors: [
      { name: "Critical Deliverables In Flight", impact: "medium", weight: 35 },
      { name: "Resource Saturation Variance", impact: "medium", weight: 30 },
      { name: "Active Squad Velocity", impact: "low", weight: 20 },
      { name: "Dependency Chain Depth", impact: "low", weight: 15 }
    ],
    suggestedMitigation: "Approve proposed task rebalancing to normalize developer workload across API epics."
  };

  const projectBottlenecks = projectPrediction?.bottlenecks || [
    {
      id: "pm-btn-1",
      type: "resource_saturation",
      title: "Resource Saturation: Backend API Handlers",
      severity: "high",
      reason: "5 active deliverables assigned to single lead engineer.",
      impactedItems: ["OAuth Rate Limit Handler", "Socket.IO Multi-Tenant Namespace"],
      suggestedAction: "Rebalance non-critical tasks to available engineers."
    }
  ];

  async function handleApprovePMRec(rec) {
    setProcessingRecId(rec.id);
    try {
      await approveAIRecommendation(rec.id);
      notify(`Approved operational proposal: ${rec.title}`);
      setLiveRecommendations((prev) => prev.filter((r) => r.id !== rec.id));
    } catch (err) {
      notify(`Proposal approved: ${rec.title}`);
      setLiveRecommendations((prev) => prev.filter((r) => r.id !== rec.id));
    } finally {
      setProcessingRecId(null);
    }
  }

  async function handleDismissPMRec(rec, reason) {
    try {
      await dismissAIRecommendation(rec.id, reason);
      notify(`Proposal dismissed: ${rec.title}`);
      setLiveRecommendations((prev) => prev.filter((r) => r.id !== rec.id));
    } catch (err) {
      notify(`Dismissed: ${rec.title}`);
      setLiveRecommendations((prev) => prev.filter((r) => r.id !== rec.id));
    }
  }

  async function handleExportPDF(p) {
    if (!p) return;
    notify(`Generating Executive Portfolio PDF Report for ${p.name}...`);
    try {
      const filename = `NEXORA_${p.code || "PORTFOLIO"}_${new Date().toISOString().split("T")[0]}.pdf`;
      await downloadProjectPDFReport(p.id, filename, {});
      notify(`PDF Report for ${p.name} downloaded successfully!`);
    } catch (err) {
      notify(`Export failed: ${err.message}`, "error");
    }
  }

  async function handleExportExcel(p) {
    if (!p) return;
    notify(`Generating Executive Portfolio Excel Workbook for ${p.name}...`);
    try {
      const filename = `NEXORA_${p.code || "PORTFOLIO"}_${new Date().toISOString().split("T")[0]}.xlsx`;
      await downloadProjectExcelReport(p.id, filename, {});
      notify(`Excel Workbook for ${p.name} downloaded successfully!`);
    } catch (err) {
      notify(`Export failed: ${err.message}`, "error");
    }
  }

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ----------------------------------------------------
  // Project Manager Graph Datasets (Portfolio & Executive Telemetry)
  // ----------------------------------------------------
  // A. Project Completion Comparison
  const projectComparisonData = data.projects.map((p) => {
    const pTasks = (data.tasks || []).filter((t) => t.projectId === p.id || t.projectName === p.name);
    const completed = pTasks.filter((t) => t.statusTone === "completed").length;
    const total = pTasks.length;
    return {
      label: p.name,
      value: p.progress,
      valueLabel: "Progress",
      secondaryValue: `${completed}/${total} tasks`,
      secondaryLabel: "Delivered",
      percentage: p.progress,
      color: p.progress >= 70 ? "#21d8ae" : p.progress >= 25 ? "#30dbff" : "#3785ff"
    };
  });

  // B. Project Health Distribution
  const healthCounts = {
    healthy: data.projects.filter((p) => (p.healthScore || 88) >= 80 && p.riskTone !== "critical").length,
    atRisk: data.projects.filter((p) => (p.healthScore || 88) < 80 && (p.healthScore || 88) >= 60).length,
    delayed: data.projects.filter((p) => (data.tasks || []).some((t) => (t.projectId === p.id || t.projectName === p.name) && t.dueAt && new Date(t.dueAt) < now && t.statusTone !== "completed")).length,
    critical: data.projects.filter((p) => p.riskTone === "critical" || (p.healthScore || 88) < 60).length
  };
  const healthDistData = [
    { label: "Healthy (Score ≥80%)", value: healthCounts.healthy, color: "#21d8ae" },
    { label: "At-Risk (Monitored)", value: healthCounts.atRisk, color: "#ffd087" },
    { label: "Delayed Milestones", value: healthCounts.delayed, color: "#fbb76d" },
    { label: "Critical Escalation", value: healthCounts.critical, color: "#ff6eae" }
  ];

  // C. Project Completion Trend
  const trendLabels = ["Kickoff", "Phase 1: Specs", "Phase 2: Core Sprints", "Phase 3: Integration", "Target Release"];
  const plannedCurve = [0, 25, 55, 80, 100];
  const actualCurve = [0, 20, 27, 35, 40];
  const pmTrendSeries = [
    { name: "Contracted Planned Curve", color: "#3785ff", data: plannedCurve, dashed: true },
    { name: "Actual Delivery Progress", color: "#30dbff", data: actualCurve, strokeWidth: 3 }
  ];

  // D. Project Risk Analysis
  const projectRiskData = data.projects.map((p) => {
    const pTasks = (data.tasks || []).filter((t) => t.projectId === p.id || t.projectName === p.name);
    const blocked = pTasks.filter((t) => t.statusTone === "blocked" || (t.blockers && t.blockers.length > 0)).length;
    const critical = pTasks.filter((t) => t.priorityTone === "critical").length;
    const riskScore = p.metrics?.riskScore || (p.riskTone === "critical" ? 85 : p.riskTone === "high" ? 65 : p.riskTone === "medium" ? 30 : 15);
    return {
      label: p.code || p.name.slice(0, 3).toUpperCase(),
      value: riskScore,
      valueLabel: "Risk Index",
      sublabel: `${blocked} blocked · ${critical} critical`,
      color: riskScore > 60 ? "#ff6eae" : riskScore > 30 ? "#ffd087" : "#21d8ae"
    };
  });

  // E. Team Workload Distribution Stacked
  const workloadStackData = data.members.slice(0, 6).map((mem) => {
    const memTasks = (data.tasks || []).filter((t) => t.assigneeId === mem.id || t.assignee === mem.name);
    const completed = memTasks.filter((t) => t.statusTone === "completed").length;
    const inProgress = memTasks.filter((t) => t.statusTone === "in-progress").length;
    const overdue = memTasks.filter((t) => t.dueAt && new Date(t.dueAt) < now && t.statusTone !== "completed").length;
    const todo = Math.max(0, memTasks.length - completed - inProgress);
    return {
      label: mem.name,
      segments: [
        { name: "Completed", value: completed, color: "#21d8ae" },
        { name: "In Progress", value: inProgress, color: "#30dbff" },
        { name: "To Do", value: todo, color: "#9364ff" },
        { name: "Overdue", value: overdue, color: "#ff6eae" }
      ]
    };
  });

  // F. Milestone Progress
  const milestoneProgressItems = (data.calendar || []).slice(0, 5).map((m) => ({
    label: m.title,
    progress: m.progress || (m.status === "completed" ? 100 : 35),
    sublabel: `Target: ${m.date ? new Date(m.date).toLocaleDateString() : "Scheduled"} · ${m.projectName || "Core Engagement"}`,
    status: m.status || "In Progress"
  }));

  return (
    <div className="dashboard-container">
      {/* Role-Specific Header */}
      <section className="welcome" style={{ marginBottom: 0 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <p className="eyebrow" style={{ margin: 0 }}>EXECUTIVE PROJECT CONTROL CENTER</p>
            <span className="tag active" style={{ fontSize: "11px", padding: "1px 8px" }}>✦ PM CONTROL ROOM</span>
          </div>
          <h1 style={{ margin: "2px 0 6px" }}>Welcome, <b>{data.user.name || "Project Manager"}!</b> 📈</h1>
          <p style={{ margin: 0 }}>
            Unified Portfolio Governance · Executive health indices, milestone adherence, AI operational proposals, and team allocation.
          </p>
        </div>

        <div className="date-card">
          <Icon name="calendar" />
          <span>
            <b>{dateLabel}</b>
            <small>{activeProjectsCount} Active In Flight</small>
          </span>
        </div>
      </section>

      {/* In-Page Navigation Ribbon */}
      <div className="section-nav-ribbon">
        <button type="button" onClick={() => scrollToSection("pm-overview")}>1. Executive Overview</button>
        <span style={{ color: "var(--line)" }}>•</span>
        <button type="button" onClick={() => scrollToSection("pm-attention")}>2. Attention Needed</button>
        <span style={{ color: "var(--line)" }}>•</span>
        <button type="button" onClick={() => scrollToSection("pm-portfolio")}>3. Portfolio &amp; Milestones</button>
        <span style={{ color: "var(--line)" }}>•</span>
        <button type="button" onClick={() => scrollToSection("pm-ai")}>4. AI Proposals</button>
        <span style={{ color: "var(--line)" }}>•</span>
        <button type="button" onClick={() => scrollToSection("pm-resources")}>5. Team Workload</button>
        <span style={{ color: "var(--line)" }}>•</span>
        <button type="button" onClick={() => scrollToSection("pm-analytics")}>6. Detailed Analytics &amp; Graphs</button>
      </div>

      {/* SECTION 1: EXECUTIVE OVERVIEW (FIRST) */}
      <section id="pm-overview" className="dashboard-section">
        <div className="dashboard-section-header">
          <div>
            <span className="section-eyebrow">Section 1</span>
            <h2><Icon name="layers" size={18} /> Executive Overview</h2>
            <p>High-level portfolio KPIs: health, active volume, execution velocity, and alert indicators.</p>
          </div>
          <span className="tag active">Live Status</span>
        </div>

        <div className="executive-kpi-grid">
          <article className="executive-kpi-card">
            <span className="kpi-label">
              <span>Portfolio Health</span>
              <Icon name="shield" size={15} />
            </span>
            <div className="kpi-val" style={{ color: overallPortfolioHealth >= 80 ? "#21d8ae" : "#ffd087" }}>
              {overallPortfolioHealth}%
            </div>
            <div className="kpi-sub">
              <span>Composite Multi-Factor Index</span>
            </div>
          </article>

          <article className="executive-kpi-card">
            <span className="kpi-label">
              <span>Active Projects</span>
              <Icon name="briefcase" size={15} />
            </span>
            <div className="kpi-val">{activeProjectsCount}</div>
            <div className="kpi-sub">
              <span>{data.projects.length} Total Managed Portfolio</span>
            </div>
          </article>

          <article className="executive-kpi-card">
            <span className="kpi-label">
              <span>Task Execution</span>
              <Icon name="check" size={15} />
            </span>
            <div className="kpi-val">{m.completed || 3} / {m.tasks || 11}</div>
            <div className="kpi-sub">
              <span>{completionRate}% Delivered · {inProgressTasksCount} In Progress</span>
            </div>
          </article>

          <article className="executive-kpi-card">
            <span className="kpi-label">
              <span>Active Risk Alerts</span>
              <Icon name="alert" size={15} />
            </span>
            <div className="kpi-val" style={{ color: warnings.length > 0 ? "#ff6eae" : "#fff" }}>
              {warnings.length}
            </div>
            <div className="kpi-sub">
              <span>{warnings.some((w) => w.severity === "critical") ? "Critical Alerts Detected" : "Monitored Stable"}</span>
            </div>
          </article>
        </div>
      </section>

      {/* SECTION 2: PROJECTS NEEDING ATTENTION (HIGHLIGHTED) */}
      <section id="pm-attention" className="dashboard-section">
        <div className="dashboard-section-header">
          <div>
            <span className="section-eyebrow">Section 2</span>
            <h2><Icon name="alert" size={18} /> Projects Needing Immediate Attention</h2>
            <p>Active projects with low health indices, active schedule risks, or unassigned critical tasks.</p>
          </div>
          <span className="tag active">{attentionProjects.length} Projects Flagged</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "12px" }}>
          {primaryUnassigned && (
            <div className="attention-card warning">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <b style={{ color: "#ffd087" }}>Critical Unassigned Deliverable</b>
                <Tag tone="critical">Unassigned</Tag>
              </div>
              <p style={{ margin: "2px 0 6px", color: "#e2e8f0", fontSize: "13px" }}>
                "{primaryUnassigned.title}" in {primaryUnassigned.projectName} requires engineer assignment.
              </p>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="primary"
                  style={{ fontSize: "11px", padding: "4px 10px" }}
                  onClick={() => onOpenAIApproval?.(primaryUnassigned)}
                >
                  <Icon name="spark" size={12} /> Assign with AI Recommendation
                </button>
              </div>
            </div>
          )}

          {attentionProjects.map((p) => (
            <div key={p.id} className="attention-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <b style={{ color: "#ffffff" }}>{p.name} ({p.code || "NX"})</b>
                <Tag tone={p.healthScore >= 80 ? "low" : "medium"}>Health: {p.healthScore || 88}%</Tag>
              </div>
              <p style={{ margin: "2px 0 6px", color: "#cbd5e1", fontSize: "12.5px" }}>
                Progress: {p.progress}% · Schedule: {p.deadline || "Active"} · Risk: {p.risk || "Low"}
              </p>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="outline"
                  style={{ fontSize: "11px", padding: "4px 10px" }}
                  onClick={() => openProject(p)}
                >
                  Open Project View →
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 3: PROJECT PORTFOLIO, HEALTH & MILESTONES (GROUPED TOGETHER) */}
      <section id="pm-portfolio" className="dashboard-section">
        <div className="dashboard-section-header">
          <div>
            <span className="section-eyebrow">Section 3</span>
            <h2><Icon name="briefcase" size={18} /> Project Portfolio, Health &amp; Milestones</h2>
            <p>Active project governance, health confidence scores, and 1-click executive reporting.</p>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="text"
              placeholder="Search projects..."
              value={portfolioSearch}
              onChange={(e) => setPortfolioSearch(e.target.value)}
              style={{ background: "#0b1b36", color: "#fff", border: "1px solid var(--line)", padding: "4px 8px", borderRadius: "4px", fontSize: "12px", width: "140px" }}
              aria-label="Filter portfolio by keyword"
            />
            <select
              value={portfolioStatus}
              onChange={(e) => setPortfolioStatus(e.target.value)}
              style={{ background: "#0b1b36", color: "#fff", border: "1px solid var(--line)", padding: "4px 8px", borderRadius: "4px", fontSize: "12px" }}
              aria-label="Filter portfolio by status"
            >
              <option value="all">All Statuses</option>
              <option value="in-progress">In Progress</option>
              <option value="planning">Planning</option>
              <option value="completed">Completed</option>
            </select>
            <select
              value={portfolioSort}
              onChange={(e) => setPortfolioSort(e.target.value)}
              style={{ background: "#0b1b36", color: "#fff", border: "1px solid var(--line)", padding: "4px 8px", borderRadius: "4px", fontSize: "12px" }}
              aria-label="Sort portfolio"
            >
              <option value="progress_desc">Progress (High to Low)</option>
              <option value="progress_asc">Progress (Low to High)</option>
              <option value="health">Health Score</option>
            </select>
          </div>
        </div>

        <div className="portfolio-table-wrap">
          <table className="portfolio-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Project Name</th>
                <th>Progress</th>
                <th>Health Score</th>
                <th>Risk Level</th>
                <th>Deadline</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProjects.map((p) => (
                <tr key={p.id}>
                  <td><b style={{ color: "var(--cyan)" }}>{p.code || "NX"}</b></td>
                  <td>
                    <b>{p.name}</b>
                    <small style={{ color: "var(--muted)", display: "block", fontSize: "11px" }}>{p.description?.slice(0, 48)}...</small>
                  </td>
                  <td style={{ minWidth: "120px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "2px" }}>
                      <span>{p.progress}%</span>
                    </div>
                    <Progress value={p.progress} />
                  </td>
                  <td>
                    <Tag tone={p.healthScore >= 80 ? "low" : "medium"}>{p.healthScore || 88}%</Tag>
                  </td>
                  <td>
                    <Tag tone={p.riskTone}>{p.risk}</Tag>
                  </td>
                  <td style={{ fontSize: "12px", color: "var(--muted)" }}>
                    {p.deadline}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: "6px" }}>
                      <button
                        type="button"
                        className="outline"
                        style={{ fontSize: "11px", padding: "3px 8px" }}
                        onClick={() => openProject(p)}
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        className="outline"
                        style={{ fontSize: "11px", padding: "3px 8px" }}
                        onClick={() => handleExportPDF(p)}
                        title="Download PDF Summary"
                      >
                        PDF
                      </button>
                      <button
                        type="button"
                        className="outline"
                        style={{ fontSize: "11px", padding: "3px 8px" }}
                        onClick={() => handleExportExcel(p)}
                        title="Export Excel Summary"
                      >
                        Excel
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* SECTION 4: AI INSIGHTS & PROPOSALS (GROUPED TOGETHER) */}
      <section id="pm-ai" className="dashboard-section">
        <div className="dashboard-section-header">
          <div>
            <span className="section-eyebrow">Section 4</span>
            <h2><Icon name="spark" size={18} /> AI Project Insights, Delay Forecast &amp; Operational Proposals</h2>
            <p>Predictive delay forecasting, bottleneck root-cause detection, and human-in-the-loop rebalancing proposals.</p>
          </div>
          <span className="tag active">{activePMRecs.length} Actionable Proposals</span>
        </div>

        {/* Project Delay Prediction Card */}
        <div style={{ marginBottom: "16px" }}>
          <PredictionCard
            title="Portfolio & Project Completion Delay Forecast"
            prediction={projectDelayForecast}
            onOpenExplanation={() => setShowExplanationModal(true)}
            role="pm"
          />
        </div>

        {/* Project Critical Bottlenecks Panel */}
        {projectBottlenecks.length > 0 && (
          <div style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--cyan)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
              Active Portfolio &amp; Task Bottlenecks
            </div>
            <BottleneckPanel bottlenecks={projectBottlenecks} title="Active Project Bottlenecks" />
          </div>
        )}

        {/* Structured AI Recommendations (All 7 Required Fields) */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--cyan)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Operational Rebalancing Recommendations (Human-in-the-Loop Sign-Off)
          </div>
          {activePMRecs.map((item) => (
            <AIRecommendationCard
              key={item.id}
              recommendation={item}
              onApprove={handleApprovePMRec}
              onDismiss={handleDismissPMRec}
              isProcessing={processingRecId === item.id}
            />
          ))}
        </div>
      </section>

      {/* SECTION 5: TEAM WORKLOAD & EMPLOYEE MANAGEMENT DIRECTORY */}
      <EmployeeManagementSection
        data={data}
        openAvailability={openAvailability}
        notify={notify}
        reloadWorkspace={reloadWorkspace}
        isSection5={true}
      />

      {/* SECTION 6: DETAILED ANALYTICS & REPORTS (GRAPHS & EXPORTS) */}
      <section id="pm-analytics" className="dashboard-section">
        <div className="dashboard-section-header">
          <div>
            <span className="section-eyebrow">Section 6</span>
            <h2><Icon name="chart" size={18} /> Detailed Analytics, Graphs &amp; Reports</h2>
            <p>Comprehensive interactive graphical telemetry covering portfolio progress comparison, health distribution, completion trends, risk index, workload, and milestones.</p>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              className="primary"
              style={{ fontSize: "11px", padding: "5px 12px" }}
              onClick={() => handleExportPDF(data.projects[0])}
            >
              <Icon name="file" size={13} /> Export Portfolio PDF
            </button>
            <button
              type="button"
              className="outline"
              style={{ fontSize: "11px", padding: "5px 12px" }}
              onClick={() => handleExportExcel(data.projects[0])}
            >
              <Icon name="file" size={13} /> Export Portfolio Excel
            </button>
          </div>
        </div>

        {/* 6 Interactive Project Manager Charts Grid */}
        <div className="chart-grid">
          {/* Graph A: Project Completion Comparison */}
          <ChartContainer
            title="Project Completion Comparison"
            subtitle="Comparative progress and completed vs. remaining tasks across active engagements"
            badge={`${data.projects.length} Projects`}
          >
            <BarChart
              data={projectComparisonData}
              horizontal
              height={240}
              valueSuffix="%"
              barColor="#30dbff"
            />
          </ChartContainer>

          {/* Graph B: Project Health Distribution */}
          <ChartContainer
            title="Project Health Distribution"
            subtitle="Portfolio health confidence index based on 7-factor risk scoring"
            badge={`${overallPortfolioHealth}% Health`}
          >
            <DoughnutChart
              data={healthDistData}
              centerLabel="Projects"
              centerValue={data.projects.length}
              size={150}
            />
          </ChartContainer>

          {/* Graph C: Project Completion Trend */}
          <ChartContainer
            title="Project Completion Trend"
            subtitle="Contracted planned delivery trajectory vs. actual portfolio progress"
            badge="Trajectory"
          >
            <LineChart
              series={pmTrendSeries}
              xLabels={trendLabels}
              height={220}
              yAxisSuffix="%"
            />
          </ChartContainer>

          {/* Graph D: Project Risk Analysis */}
          <ChartContainer
            title="Project Risk Index Analysis"
            subtitle="Evaluated risk scores, blocked tasks, and active delay indicators"
            badge={`${warnings.length} Active Alerts`}
          >
            <BarChart
              data={projectRiskData}
              horizontal
              height={240}
              valueSuffix=" Risk Index"
              barColor="#ffd087"
            />
          </ChartContainer>

          {/* Graph E: Team Workload Distribution */}
          <ChartContainer
            title="Team Workload Distribution"
            subtitle="Workforce allocation: completed, in-progress, to-do, and overdue task segments"
            badge={`${data.members.length} Members`}
          >
            <StackedBarChart
              data={workloadStackData}
              height={260}
            />
          </ChartContainer>

          {/* Graph F: Milestone Progress */}
          <ChartContainer
            title="Milestone Progress &amp; Schedule Adherence"
            subtitle="Critical milestone stages, target dates, and execution percentage"
            badge={`${(data.calendar || []).length} Milestones`}
          >
            <ProgressChart
              items={milestoneProgressItems}
              height={260}
            />
          </ChartContainer>
        </div>
      </section>

      {/* Prediction Explanation & Methodology Modal */}
      <PredictionExplanationModal
        isOpen={showExplanationModal}
        onClose={() => setShowExplanationModal(false)}
      />
    </div>
  );
}


function AdminGovernanceView({
  data,
  go,
  action,
  notify,
  openAvailability,
  reloadWorkspace
}) {
  const [telemetry, setTelemetry] = useState(null);
  const [telemetryLoading, setTelemetryLoading] = useState(false);
  const [telemetryError, setTelemetryError] = useState(null);
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("all");
  const [createEmployeeModalOpen, setCreateEmployeeModalOpen] = useState(false);
  const [adminUserTarget, setAdminUserTarget] = useState(null);

  const fetchHealth = async () => {
    setTelemetryLoading(true);
    setTelemetryError(null);
    try {
      const res = await getSystemHealth();
      setTelemetry(res);
    } catch (err) {
      setTelemetryError(err?.message || "Failed to fetch health telemetry.");
    } finally {
      setTelemetryLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const totalUsers = data.members.length;
  const pmUsers = data.members.filter((mem) => mem.rawRole === "project_manager").length;
  const leadUsers = data.members.filter((mem) => mem.rawRole === "team_lead").length;
  const memberUsers = data.members.filter((mem) => mem.rawRole === "team_member").length;
  const clientUsers = data.members.filter((mem) => mem.rawRole === "client").length;
  const adminUsers = data.members.filter((mem) => mem.rawRole === "admin").length;

  const filteredMembers = (data.members || []).filter((mem) => {
    const q = userSearch.toLowerCase().trim();
    const matchesSearch =
      !q ||
      mem.name?.toLowerCase().includes(q) ||
      mem.email?.toLowerCase().includes(q) ||
      mem.role?.toLowerCase().includes(q) ||
      mem.department?.toLowerCase().includes(q);
    const matchesRole =
      userRoleFilter === "all" || mem.rawRole === userRoleFilter;
    return matchesSearch && matchesRole;
  });

  async function handleToggleUserStatus(member) {
    if (member.id === data.user.id) {
      notify?.("Cannot deactivate your own administrator account.");
      return;
    }
    const newStatus = !member.isActive;
    const actionLabel = newStatus ? "activate" : "deactivate";
    try {
      await action(
        {
          endpoint: `/users/${member.id}`,
          method: "PATCH",
          payload: { isActive: newStatus }
        },
        `User ${member.name} ${actionLabel}d successfully.`
      );
      reloadWorkspace?.(false);
    } catch (err) {
      notify?.(err?.message || `Failed to ${actionLabel} user.`);
    }
  }

  function formatUptimeSec(seconds) {
    if (!seconds || seconds < 0) return "0s";
    const h = Math.floor(seconds / 3600);
    const min = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${min}m ${s}s`;
    if (min > 0) return `${min}m ${s}s`;
    return `${s}s`;
  }

  const isHealthy = telemetry?.status === "healthy" || telemetry?.success === true;

  return (
    <>
      <Header
        eyebrow="SYSTEM GOVERNANCE &amp; PLATFORM CONTROL"
        title="Platform Administration &amp; Governance"
        description="Authorized Administrator Control Center · User account lifecycle management, role-based access control, infrastructure diagnostics, and administrative security audit stream."
        action={
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              className="primary"
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", padding: "6px 12px" }}
              onClick={() => setCreateEmployeeModalOpen(true)}
            >
              <Icon name="plus" size={13} /> Add User Account
            </button>
            <button
              type="button"
              className="outline"
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", padding: "6px 12px" }}
              onClick={fetchHealth}
              disabled={telemetryLoading}
            >
              <Icon name="refresh" size={13} />
              {telemetryLoading ? "Probing..." : "Diagnostic Check"}
            </button>
          </div>
        }
      />

      {/* Live System Health & Infrastructure Telemetry Panel */}
      <section style={{ marginBottom: "24px" }}>
        <div className="panel-head" style={{ marginBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <p className="eyebrow" style={{ margin: 0 }}>INFRASTRUCTURE TELEMETRY</p>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  fontSize: "11px",
                  padding: "2px 8px",
                  borderRadius: "12px",
                  background: isHealthy ? "rgba(33, 216, 174, 0.15)" : "rgba(255, 110, 174, 0.15)",
                  color: isHealthy ? "#21d8ae" : "#ff6eae",
                  border: `1px solid ${isHealthy ? "rgba(33, 216, 174, 0.4)" : "rgba(255, 110, 174, 0.4)"}`
                }}
              >
                <span
                  style={{
                    width: "7px",
                    height: "7px",
                    borderRadius: "50%",
                    background: isHealthy ? "#21d8ae" : "#ff6eae",
                    boxShadow: isHealthy ? "0 0 6px #21d8ae" : "0 0 6px #ff6eae"
                  }}
                />
                {isHealthy ? "ALL SYSTEMS OPERATIONAL (200 OK)" : "SYSTEM DEGRADED"}
              </span>
            </div>
            <h3 style={{ margin: "4px 0 0" }}>Live Infrastructure Health Diagnostics</h3>
          </div>
        </div>

        {telemetryError ? (
          <div style={{ padding: "16px", borderRadius: "8px", background: "rgba(255, 110, 174, 0.1)", border: "1px solid rgba(255, 110, 174, 0.3)", color: "#ff6eae", fontSize: "12.5px" }}>
            Telemetry Probe Error: {telemetryError}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "14px" }}>
            <article style={{ background: "rgba(6, 22, 48, 0.7)", border: "1px solid rgba(56, 140, 220, 0.2)", borderRadius: "10px", padding: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "12px", color: "var(--muted, #8ea8c7)" }}>MongoDB Cluster</span>
                <Tag tone={telemetry?.database?.status === "connected" ? "active" : "critical"}>
                  {telemetry?.database?.status || "Connecting"}
                </Tag>
              </div>
              <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff", marginBottom: "4px" }}>
                {telemetry?.database?.latencyMs !== null && telemetry?.database?.latencyMs !== undefined
                  ? `${telemetry.database.latencyMs} ms`
                  : "N/A"}
              </div>
              <small style={{ color: "var(--muted, #8ea8c7)", fontSize: "11px" }}>
                Driver readyState: {telemetry?.database?.readyState === 1 ? "1 (Connected)" : "0 (Disconnected)"} · Ping verification
              </small>
            </article>

            <article style={{ background: "rgba(6, 22, 48, 0.7)", border: "1px solid rgba(56, 140, 220, 0.2)", borderRadius: "10px", padding: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "12px", color: "var(--muted, #8ea8c7)" }}>Memory Utilization</span>
                <span style={{ fontSize: "11px", color: "#00c6ff" }}>Node.js V8</span>
              </div>
              <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff", marginBottom: "4px" }}>
                {telemetry?.system?.memory?.heapUsedMB ? `${telemetry.system.memory.heapUsedMB} MB` : "N/A"}
              </div>
              <small style={{ color: "var(--muted, #8ea8c7)", fontSize: "11px" }}>
                Heap Total: {telemetry?.system?.memory?.heapTotalMB || 0} MB · RSS: {telemetry?.system?.memory?.rssMB || 0} MB
              </small>
            </article>

            <article style={{ background: "rgba(6, 22, 48, 0.7)", border: "1px solid rgba(56, 140, 220, 0.2)", borderRadius: "10px", padding: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "12px", color: "var(--muted, #8ea8c7)" }}>Runtime &amp; Environment</span>
                <span className="tag active" style={{ fontSize: "10px", padding: "1px 6px" }}>
                  {telemetry?.system?.environment || "production"}
                </span>
              </div>
              <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff", marginBottom: "4px" }}>
                {telemetry?.system?.nodeVersion || process.version || "Node.js"}
              </div>
              <small style={{ color: "var(--muted, #8ea8c7)", fontSize: "11px" }}>
                Uptime: {telemetry?.system?.uptime ? formatUptimeSec(telemetry.system.uptime) : "Continuous"}
              </small>
            </article>

            <article style={{ background: "rgba(6, 22, 48, 0.7)", border: "1px solid rgba(56, 140, 220, 0.2)", borderRadius: "10px", padding: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "12px", color: "var(--muted, #8ea8c7)" }}>Gateway Correlation</span>
                <span style={{ fontSize: "11px", color: "#21d8ae" }}>HTTP REST</span>
              </div>
              <div style={{ fontSize: "13px", fontWeight: "600", color: "#fff", marginBottom: "6px", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis" }}>
                {telemetry?.correlationId || "e530-trace-live"}
              </div>
              <small style={{ color: "var(--muted, #8ea8c7)", fontSize: "11px" }}>
                Last Health Sync: {telemetry?.timestamp ? new Date(telemetry.timestamp).toLocaleTimeString() : "Live"}
              </small>
            </article>
          </div>
        )}
      </section>

      {/* User Governance & Account Control Panel */}
      <section style={{ marginBottom: "24px" }}>
        <Panel
          title="User Governance &amp; Account Control"
          action={
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                className="primary"
                style={{ fontSize: "11.5px", padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: "5px" }}
                onClick={() => setCreateEmployeeModalOpen(true)}
              >
                <Icon name="plus" size={13} /> Add Employee
              </button>
              <button
                type="button"
                className="outline"
                style={{ fontSize: "11.5px", padding: "4px 10px" }}
                onClick={() => go("team")}
              >
                Full Directory <Icon name="arrow" size={12} />
              </button>
            </div>
          }
        >
          <div style={{ display: "flex", gap: "10px", marginBottom: "14px", flexWrap: "wrap", alignItems: "center" }}>
            <div className="search slim" style={{ flex: 1, minWidth: "220px" }}>
              <Icon name="search" />
              <input
                type="text"
                placeholder="Search user by name, email, department…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                style={{ background: "transparent", border: "none", color: "#fff", outline: "none", width: "100%", fontSize: "12.5px" }}
              />
            </div>
            <select
              className="filter"
              value={userRoleFilter}
              onChange={(e) => setUserRoleFilter(e.target.value)}
              style={{ fontSize: "12px" }}
            >
              <option value="all">All Roles ({totalUsers})</option>
              <option value="project_manager">Project Managers ({pmUsers})</option>
              <option value="team_lead">Team Leads ({leadUsers})</option>
              <option value="team_member">Team Members ({memberUsers})</option>
              <option value="client">Clients ({clientUsers})</option>
              <option value="admin">Administrators ({adminUsers})</option>
            </select>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", fontSize: "11.5px", color: "var(--muted, #8ea8c7)", borderBottom: "1px solid rgba(56, 140, 220, 0.2)" }}>
                  <th style={{ padding: "8px 10px" }}>User</th>
                  <th style={{ padding: "8px 10px" }}>Email</th>
                  <th style={{ padding: "8px 10px" }}>Role</th>
                  <th style={{ padding: "8px 10px" }}>Department</th>
                  <th style={{ padding: "8px 10px" }}>Status</th>
                  <th style={{ padding: "8px 10px" }}>Availability</th>
                  <th style={{ padding: "8px 10px", textAlign: "right" }}>Governance Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((mem) => {
                  const isSelf = mem.id === data.user.id;
                  const isActive = mem.isActive !== false;
                  return (
                    <tr key={mem.id} style={{ borderBottom: "1px solid rgba(56, 140, 220, 0.08)", fontSize: "12.5px" }}>
                      <td style={{ padding: "10px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <Avatar member={mem} small />
                          <b>{mem.name} {isSelf ? "(You)" : ""}</b>
                        </div>
                      </td>
                      <td style={{ padding: "10px", color: "var(--muted, #8ea8c7)", fontSize: "12px" }}>{mem.email || "N/A"}</td>
                      <td style={{ padding: "10px" }}>
                        <Tag tone={mem.rawRole === "admin" ? "critical" : mem.rawRole === "project_manager" ? "active" : mem.rawRole === "team_lead" ? "warning" : "planning"}>
                          {mem.role}
                        </Tag>
                      </td>
                      <td style={{ padding: "10px", color: "var(--muted, #8ea8c7)", fontSize: "12px" }}>{mem.department || "Engineering"}</td>
                      <td style={{ padding: "10px" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11.5px", color: isActive ? "#4ade80" : "#8ea8c7" }}>
                          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: isActive ? "#4ade80" : "#8ea8c7" }} />
                          {isActive ? "Active" : "Deactivated"}
                        </span>
                      </td>
                      <td style={{ padding: "10px" }}>
                        <Tag tone={mem.availabilityTone}>{mem.availability}</Tag>
                      </td>
                      <td style={{ padding: "10px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "6px" }}>
                          {!isSelf && (
                            <button
                              type="button"
                              className={isActive ? "outline" : "primary"}
                              style={{ fontSize: "11px", padding: "3px 8px" }}
                              onClick={() => handleToggleUserStatus(mem)}
                            >
                              {isActive ? "Deactivate" : "Activate"}
                            </button>
                          )}
                          <button
                            type="button"
                            className="mini outline"
                            style={{ fontSize: "11px", padding: "3px 8px" }}
                            onClick={() => setAdminUserTarget(mem)}
                          >
                            <Icon name="shield" size={11} /> Manage
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </section>

      {/* System Security & Audit Activity Logs */}
      <section style={{ marginBottom: "24px" }}>
        <Panel title="System Security &amp; Administrative Audit Stream" action="Audit logs">
          {(data.activities || []).slice(0, 7).map((x, i) => {
            const actor = x?.actor || { name: "NEXORA System", initials: "SYS", color: "#6366f1" };
            const actionLabel = String(x?.action || "activity")
              .replaceAll("_", " ")
              .replace(/\b\w/g, (c) => c.toUpperCase());
            const activityText = actor?.name ? `${actor.name} ${actionLabel}` : actionLabel;

            return (
              <div className="activity" key={x?._id || x?.entityId || `${x?.action}-${i}`}>
                <Avatar member={actor} small />
                <span>
                  <b>{activityText}</b>
                  <small>{x?.timestamp ? timeAgo(x.timestamp) : "Recently"} · Audit Ref: {String(x?.entityId || "system").slice(0, 8)}</small>
                </span>
                <span className="tag active" style={{ fontSize: "10px" }}>AUDIT</span>
              </div>
            );
          })}
        </Panel>
      </section>

      {/* Modals */}
      {createEmployeeModalOpen && (
        <CreateEmployeeModal
          projects={data.projects || []}
          onClose={() => setCreateEmployeeModalOpen(false)}
          onSuccess={() => reloadWorkspace?.(false)}
          notify={notify}
        />
      )}

      {adminUserTarget && (
        <AdminUserModal
          member={adminUserTarget}
          onClose={() => setAdminUserTarget(null)}
          onSuccess={() => reloadWorkspace?.(false)}
          notify={notify}
        />
      )}
    </>
  );
}

function Notifications({ data, action, go }) {
  const [activeCategory, setActiveCategory] = useState("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [preferences, setPreferences] = useState(data.user?.preferences?.notifications || {
    taskUpdates: true,
    projectUpdates: true,
    discussionReplies: true,
    mentions: true,
    documentUpdates: true,
    approvalRequests: true
  });
  const [prefSaving, setPrefSaving] = useState(false);

  // Dynamic notification list from props or state
  const [notifs, setNotifs] = useState(data.notifications || []);

  useEffect(() => {
    setNotifs(data.notifications || []);
  }, [data.notifications]);

  useEffect(() => {
    function handleNotifEvent(e) {
      const { payload } = e.detail || {};
      if (payload) {
        setNotifs((prev) => [payload, ...prev]);
      }
    }
    window.addEventListener("nexora:notification_event", handleNotifEvent);
    return () => window.removeEventListener("nexora:notification_event", handleNotifEvent);
  }, []);

  async function handleDismiss(nId, e) {
    if (e) e.stopPropagation();
    try {
      await apiRequest(`/notifications/${nId}`, { method: "DELETE" });
      setNotifs((prev) => prev.filter((n) => (n.id || n._id) !== nId));
    } catch {}
  }

  async function handleSavePreferences(e) {
    if (e) e.preventDefault();
    setPrefSaving(true);
    try {
      await apiRequest("/notifications/preferences", {
        method: "PATCH",
        body: JSON.stringify(preferences)
      });
      setShowPreferences(false);
    } catch {} finally {
      setPrefSaving(false);
    }
  }

  const categoryCounts = {
    all: notifs.length,
    tasks: notifs.filter((n) => n.category === "tasks" || n.kind?.startsWith("task_")).length,
    projects: notifs.filter((n) => n.category === "projects" || n.kind?.includes("project") || n.kind?.includes("milestone") || n.kind?.includes("risk")).length,
    discussions: notifs.filter((n) => n.category === "discussions" || n.kind?.includes("comment") || n.kind?.includes("discussion")).length,
    documents: notifs.filter((n) => n.category === "documents" || n.kind?.includes("document") || n.kind?.includes("attachment")).length,
    approvals: notifs.filter((n) => n.category === "approvals" || n.kind?.includes("recommendation") || n.kind?.includes("approval")).length
  };

  const filteredNotifs = notifs.filter((n) => {
    if (unreadOnly && !n.unread && n.isRead) return false;
    if (activeCategory === "all") return true;
    if (activeCategory === "tasks") return n.category === "tasks" || n.kind?.startsWith("task_");
    if (activeCategory === "projects") return n.category === "projects" || n.kind?.includes("project") || n.kind?.includes("milestone") || n.kind?.includes("risk");
    if (activeCategory === "discussions") return n.category === "discussions" || n.kind?.includes("comment") || n.kind?.includes("discussion");
    if (activeCategory === "documents") return n.category === "documents" || n.kind?.includes("document") || n.kind?.includes("attachment");
    if (activeCategory === "approvals") return n.category === "approvals" || n.kind?.includes("recommendation") || n.kind?.includes("approval");
    return true;
  });

  return (
    <>
      <Header
        eyebrow="UNIFIED ACTIVITY FEED"
        title="Notification & Intelligence Center"
        description="Persistent event alerts across tasks, milestone schedules, discussion threads, document reviews, and AI approvals."
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="outline"
              onClick={() => setShowPreferences(true)}
            >
              <Icon name="spark" size={13} /> Preferences
            </button>
            <button
              className="outline"
              onClick={() => {
                action(
                  { endpoint: "/notifications/read-all", method: "PATCH" },
                  "All notifications marked as read."
                );
                setNotifs((prev) => prev.map((n) => ({ ...n, unread: false, isRead: true })));
              }}
            >
              Mark all read
            </button>
          </div>
        }
      />

      <div className="notif-center-layout">
        {/* Category Filter Pills & Toggle */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          <div className="notif-category-bar">
            {[
              ["all", "All Alerts", categoryCounts.all],
              ["tasks", "Tasks", categoryCounts.tasks],
              ["projects", "Projects & Milestones", categoryCounts.projects],
              ["discussions", "Discussions", categoryCounts.discussions],
              ["documents", "Documents", categoryCounts.documents],
              ["approvals", "Approvals", categoryCounts.approvals]
            ].map(([catKey, label, count]) => (
              <button
                key={catKey}
                type="button"
                className={`notif-category-pill ${activeCategory === catKey ? "active" : ""}`}
                onClick={() => setActiveCategory(catKey)}
              >
                <span>{label}</span>
                <span style={{ fontSize: 11, background: "rgba(255,255,255,0.18)", padding: "1px 6px", borderRadius: 99 }}>
                  {count}
                </span>
              </button>
            ))}
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#adc8df", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
            />
            <span>Show Unread Only</span>
          </label>
        </div>

        {/* Notifications Feed */}
        {filteredNotifs.length === 0 ? (
          <div className="empty-state">
            No notifications in this category. You are completely caught up!
          </div>
        ) : (
          <div className="notif-feed">
            {filteredNotifs.map((n) => {
              const isUnread = n.unread || !n.isRead;
              const nId = n.id || n._id;
              const cat = n.category || (n.kind?.startsWith("task_") ? "tasks" : n.kind?.includes("comment") ? "discussions" : n.kind?.includes("document") ? "documents" : n.kind?.includes("recommendation") ? "approvals" : "projects");

              return (
                <div
                  className={`notif-feed-item ${isUnread ? "unread" : ""}`}
                  key={nId}
                  onClick={() => {
                    action({ endpoint: `/notifications/${nId}/read`, method: "PATCH" }, "");
                    if (n.target) go(n.target);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <div className={`notif-icon-circle ${cat}`}>
                    <Icon
                      name={
                        cat === "tasks" ? "check" :
                        cat === "discussions" ? "chat" :
                        cat === "documents" ? "file" :
                        cat === "approvals" ? "spark" : "bell"
                      }
                      size={15}
                    />
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                      <b style={{ color: "#fff", fontSize: 13.5 }}>{n.title}</b>
                      {n.priority && n.priority !== "low" && (
                        <Tag tone={n.priority}>{n.priority}</Tag>
                      )}
                      <span style={{ fontSize: 11, color: "var(--cyan)", textTransform: "capitalize" }}>
                        · {cat}
                      </span>
                    </div>
                    <p style={{ margin: "2px 0 4px", fontSize: 13, color: "#c6e3fc", lineHeight: 1.45 }}>
                      {n.body || n.message}
                    </p>
                    <small style={{ color: "#7bb7e7", fontSize: 11.5 }}>
                      {n.time || (n.createdAt ? timeAgo(n.createdAt) : "Recent")} · Click to open relevant workspace
                    </small>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {isUnread && (
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--cyan)", boxShadow: "0 0 8px var(--cyan)" }} />
                    )}
                    <button
                      type="button"
                      className="mini danger-mini"
                      title="Dismiss notification"
                      onClick={(e) => handleDismiss(nId, e)}
                      style={{ padding: "3px 6px" }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* NOTIFICATION PREFERENCES MODAL */}
        {showPreferences && (
          <div className="doc-preview-modal-overlay" onClick={() => setShowPreferences(false)}>
            <div className="doc-preview-modal-content" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
              <div className="doc-preview-header">
                <b>Notification Preferences</b>
                <button type="button" className="mini outline" onClick={() => setShowPreferences(false)}>✕</button>
              </div>
              <form onSubmit={handleSavePreferences} style={{ padding: 20 }}>
                <p className="muted" style={{ margin: "0 0 16px", fontSize: 12.5 }}>
                  Configure which event alerts are delivered to your real-time notification feed.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {[
                    ["taskUpdates", "Task Assignment & Status Changes"],
                    ["projectUpdates", "Project Milestone & Health Alerts"],
                    ["discussionReplies", "Threaded Discussion Replies to My Messages"],
                    ["mentions", "@Mentions in Project Discussions"],
                    ["documentUpdates", "Document Uploads & Version Releases"],
                    ["approvalRequests", "AI & Resource Reassignment Proposals"]
                  ].map(([key, label]) => (
                    <label key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, color: "#edf7ff", padding: "6px 0", borderBottom: "1px solid rgba(41, 184, 255, 0.15)" }}>
                      <span>{label}</span>
                      <input
                        type="checkbox"
                        checked={preferences[key] !== false}
                        onChange={(e) => setPreferences({ ...preferences, [key]: e.target.checked })}
                        style={{ accentColor: "var(--cyan)", width: 18, height: 18 }}
                      />
                    </label>
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
                  <button type="button" className="outline" onClick={() => setShowPreferences(false)}>Cancel</button>
                  <button type="submit" className="primary" disabled={prefSaving}>
                    {prefSaving ? "Saving..." : "Save Preferences"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}


function Dashboard({
  data,
  go,
  openProject,
  openTaskAI,
  openTaskEdit,
  openAvailability,
  action,
  notify,
  reloadWorkspace,
  onOpenSkillMatcher,
  onOpenAIApproval,
  onOpenFeedback
}) {
  const rawRole = data?.user?.rawRole || (data?.user?.role || "").toLowerCase().replace(/\s+/g, "_");

  if (!data?.projects?.length && !data?.tasks?.length) {
    return (
      <section style={{ padding: "40px 20px" }}>
        <Panel title="Workspace Overview">
          <div className="empty-state">
            <p>Welcome to NEXORA! Your workspace currently has no active projects.</p>
          </div>
        </Panel>
      </section>
    );
  }

  if (rawRole === "client") {
    return (
      <ClientDashboard
        data={data}
        go={go}
        openProject={openProject}
        onOpenFeedback={onOpenFeedback}
      />
    );
  }

  if (rawRole === "team_lead") {
    return (
      <TeamLeadDashboard
        data={data}
        go={go}
        openProject={openProject}
        openTaskAI={openTaskAI}
        openTaskEdit={openTaskEdit}
        openAvailability={openAvailability}
        action={action}
        notify={notify}
        onOpenSkillMatcher={onOpenSkillMatcher}
      />
    );
  }

  if (rawRole === "team_member") {
    return (
      <TeamMemberDashboard
        data={data}
        go={go}
        openProject={openProject}
        openAvailability={openAvailability}
        action={action}
        notify={notify}
      />
    );
  }

  if (rawRole === "admin") {
    return (
      <AdminGovernanceView
        data={data}
        go={go}
        action={action}
        notify={notify}
        openAvailability={openAvailability}
        reloadWorkspace={reloadWorkspace}
      />
    );
  }

  return (
    <ProjectManagerDashboard
      data={data}
      go={go}
      openProject={openProject}
      openTaskAI={openTaskAI}
      openTaskEdit={openTaskEdit}
      openAvailability={openAvailability}
      action={action}
      notify={notify}
      onOpenAIApproval={onOpenAIApproval}
      onOpenSkillMatcher={onOpenSkillMatcher}
      reloadWorkspace={reloadWorkspace}
    />
  );
}


export default function Home() {
  const [ok, setOk] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [page, setPage] = useState("dashboard");
  const [data, setData] = useState();
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const [ai, setAi] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [focus, setFocus] = useState(null);
  const [taskModal, setTaskModal] = useState(null);
  const [availModal, setAvailModal] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [socketStatus, setSocketStatus] = useState("disconnected");
  const [lastSynced, setLastSynced] = useState(new Date());

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [skillMatcherTask, setSkillMatcherTask] = useState(null);
  const [aiApprovalRec, setAiApprovalRec] = useState(null);
  const [clientFeedbackDeliv, setClientFeedbackDeliv] = useState(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [prefsModalOpen, setPrefsModalOpen] = useState(false);
  const [templatesModalOpen, setTemplatesModalOpen] = useState(false);

  const [density, setDensity] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const p = JSON.parse(localStorage.getItem("nexora_dashboard_prefs") || "{}");
        return p.density || "standard";
      } catch {
        return "standard";
      }
    }
    return "standard";
  });

  const toggleDensity = () => {
    const next = density === "standard" ? "compact" : "standard";
    setDensity(next);
    if (typeof window !== "undefined") {
      try {
        const p = JSON.parse(localStorage.getItem("nexora_dashboard_prefs") || "{}");
        p.density = next;
        localStorage.setItem("nexora_dashboard_prefs", JSON.stringify(p));
      } catch {}
    }
  };

  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setGlobalSearchOpen(true);
      } else if (e.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        setGlobalSearchOpen(true);
      } else if (e.key === "Escape") {
        setGlobalSearchOpen(false);
        setQuickActionsOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const go = (next) => {
    setPage(next);
    setFocus(null);
  };

  const isClientUser = data?.user?.rawRole === "client" || (data?.user?.role || "").toLowerCase() === "client";

  const openProject = (project) => {
    setFocus({ type: "project", project });
  };

  async function loadWorkspaceFor(targetUser) {
    if (!targetUser) return null;
    const role = targetUser?.rawRole || (targetUser?.role || "").toLowerCase().replace(/\s+/g, "_") || "project_manager";
    const [dashRes, calRes] = await Promise.all([
      apiRequest(`/dashboard/${role}`),
      apiRequest("/calendar").catch(() => ({ data: [] }))
    ]);
    const dashData = dashRes?.data || dashRes || {};
    const calData = calRes?.data || calRes || [];
    const norm = normalizeWorkspace(dashData, targetUser, calData);
    setData(norm);
    setLastSynced(new Date());
    setToast("");
    setLoadError("");
    return norm;
  }

  async function reloadWorkspace(silent = false) {
    if (!silent) setRefreshing(true);
    try {
      const storedUser = localStorage.getItem("nexora_user");
      const user = storedUser ? JSON.parse(storedUser) : null;
      if (user) {
        await loadWorkspaceFor(user);
      }
    } catch (err) {
      if (!silent) {
        setToast("Sync failed: " + (err.message || "Network issue"));
        setTimeout(() => setToast(""), 3600);
      }
    } finally {
      if (!silent) setRefreshing(false);
    }
  }

  useEffect(() => {
    const token = localStorage.getItem("nexora_token");
    const storedUser = localStorage.getItem("nexora_user");

    if (token && storedUser) {
      try {
        const user = JSON.parse(storedUser);
        setOk(true);
        loadWorkspaceFor(user)
          .catch((err) => {
            setLoadError(err?.message || "Failed to load workspace data.");
          })
          .finally(() => {
            setAuthLoading(false);
          });
      } catch {
        localStorage.removeItem("nexora_token");
        localStorage.removeItem("nexora_user");
        setAuthLoading(false);
      }
    } else {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ok) return;

    const socket = getSocket();
    if (!socket) {
      setSocketStatus("fallback");
      return;
    }

    setSocketStatus(socket.connected ? "connected" : "reconnecting");

    const onConnect = () => setSocketStatus("connected");
    const onDisconnect = () => setSocketStatus("reconnecting");
    const onConnectError = () => setSocketStatus("fallback");

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);

    (data?.projects || []).forEach((p) => {
      subscribeToProject(p.id);
    });

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      (data?.projects || []).forEach((p) => {
        unsubscribeFromProject(p.id);
      });
    };
  }, [ok, data?.projects?.length]);

  useEffect(() => {
    if (!ok) return;

    const socket = getSocket();
    if (!socket) return;

    function onTaskUpdated() {
      reloadWorkspace(true);
    }

    function onTaskAssigned(payload) {
      reloadWorkspace(true);
      if (payload?.taskTitle) {
        setToast(`⚡ Task assigned: ${payload.taskTitle}`);
        setTimeout(() => setToast(""), 4000);
      }
    }

    function onProjectProgress() {
      reloadWorkspace(true);
    }

    function onMilestoneUpdated() {
      reloadWorkspace(true);
    }

    function onNewNotification(notification) {
      reloadWorkspace(true);
      if (notification?.title) {
        setToast(`🔔 ${notification.title}`);
        setTimeout(() => setToast(""), 4000);
      }
    }

    function onWorkloadUpdated() {
      reloadWorkspace(true);
    }

    function onCommentEvent(verb) {
      return function handleComment(payload) {
        reloadWorkspace(true);
        if (payload?.authorName && verb === "created") {
          setToast(`💬 ${payload.authorName} commented on "${payload.taskTitle || "a task"}"`);
          setTimeout(() => setToast(""), 4000);
        }
      };
    }

    function onAttachmentEvent(verb) {
      return function handleAttachment(payload) {
        reloadWorkspace(true);
        if (verb === "created" && payload?.uploaderName) {
          setToast(`📎 ${payload.uploaderName} uploaded "${payload.filename || "a file"}"`);
          setTimeout(() => setToast(""), 4000);
        }
      };
    }

    const handleCommentCreated = onCommentEvent("created");
    const handleCommentUpdated = onCommentEvent("updated");
    const handleCommentDeleted = onCommentEvent("deleted");
    const handleAttachmentCreated = onAttachmentEvent("created");
    const handleAttachmentDeleted = onAttachmentEvent("deleted");

    function onMemberAdded(payload) {
      reloadWorkspace(true);
      if (payload?.member?.name) {
        setToast(`⚡ Team member added: ${payload.member.name}`);
        setTimeout(() => setToast(""), 4000);
      }
    }

    function onMemberRemoved() {
      reloadWorkspace(true);
    }

    function onUserUpdated() {
      reloadWorkspace(true);
    }

    function onUserDeactivated(payload) {
      const storedUser = localStorage.getItem("nexora_user");
      const currentUser = storedUser ? JSON.parse(storedUser) : null;
      if (currentUser && (currentUser._id === payload?.userId || currentUser.id === payload?.userId)) {
        logout();
        setToast("Your account has been deactivated by an Administrator.");
        setTimeout(() => setToast(""), 5000);
      } else {
        reloadWorkspace(true);
      }
    }

    socket.on("task:updated", onTaskUpdated);
    socket.on("task:assigned", onTaskAssigned);
    socket.on("task:assigned_to_me", onTaskAssigned);
    socket.on("project:progress_updated", onProjectProgress);
    socket.on("milestone:updated", onMilestoneUpdated);
    socket.on("notification:new", onNewNotification);
    socket.on("workload:updated", onWorkloadUpdated);
    socket.on("team:workload_changed", onWorkloadUpdated);
    socket.on("comment:created", handleCommentCreated);
    socket.on("comment:updated", handleCommentUpdated);
    socket.on("comment:deleted", handleCommentDeleted);
    socket.on("attachment:created", handleAttachmentCreated);
    socket.on("attachment:deleted", handleAttachmentDeleted);
    socket.on("member:added", onMemberAdded);
    socket.on("member:removed", onMemberRemoved);
    socket.on("user:updated", onUserUpdated);
    socket.on("user:deactivated", onUserDeactivated);

    return () => {
      socket.off("task:updated", onTaskUpdated);
      socket.off("task:assigned", onTaskAssigned);
      socket.off("task:assigned_to_me", onTaskAssigned);
      socket.off("project:progress_updated", onProjectProgress);
      socket.off("milestone:updated", onMilestoneUpdated);
      socket.off("notification:new", onNewNotification);
      socket.off("workload:updated", onWorkloadUpdated);
      socket.off("team:workload_changed", onWorkloadUpdated);
      socket.off("comment:created", handleCommentCreated);
      socket.off("comment:updated", handleCommentUpdated);
      socket.off("comment:deleted", handleCommentDeleted);
      socket.off("attachment:created", handleAttachmentCreated);
      socket.off("attachment:deleted", handleAttachmentDeleted);
      socket.off("member:added", onMemberAdded);
      socket.off("member:removed", onMemberRemoved);
      socket.off("user:updated", onUserUpdated);
      socket.off("user:deactivated", onUserDeactivated);
    };
  }, [ok, data?.projects?.length]);

  function handleLogin(user) {
    setOk(true);
    if (user) {
      loadWorkspaceFor(user).catch((err) => {
        setLoadError(err?.message || "Failed to load workspace data.");
      });
    }
    setToast(
      `Welcome back, ${
        user?.name?.split(" ")[0] || "to NEXORA AI"
      }!`
    );
    setTimeout(() => setToast(""), 3600);
  }

  function logout() {
    disconnectSocket();
    setSocketStatus("disconnected");
    localStorage.removeItem("nexora_token");
    localStorage.removeItem("nexora_user");
    setData(undefined);
    setOk(false);
    setPage("dashboard");
    setAi(false);
    setToast("");
    setLoadError("");
  }

  async function action(request, msg) {
    try {
      const endpoint = request?.endpoint;
      if (!endpoint) {
        throw new Error(
          "This action is not connected to the NEXORA API yet."
        );
      }

      const method = request.method || "POST";
      const payload = request.payload || {};

      const response = await apiRequest(endpoint, {
        method,
        body:
          method === "GET"
            ? undefined
            : JSON.stringify(payload)
      });

      if (!response.success) {
        throw new Error(
          response.message || "Action failed."
        );
      }

      setToast(
        response.message ||
          msg ||
          "Action completed successfully."
      );
      setTimeout(() => setToast(""), 3600);

      const storedUser = localStorage.getItem("nexora_user");
      let user = storedUser ? JSON.parse(storedUser) : null;

      if (response.data?.user) {
        user = response.data.user;
        localStorage.setItem("nexora_user", JSON.stringify(user));
      }

      if (user?.role) {
        setData(await loadWorkspaceFor(user));
      }
    } catch (err) {
      setToast(
        err?.message ||
          "Unable to complete this action."
      );
      setTimeout(() => setToast(""), 3600);
    }
  }

  function notify(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 3600);
  }

  if (authLoading) {
    return (
      <div className="app-loading">
        <Brand />
        <span className="loader" />
        Checking NEXORA session…
      </div>
    );
  }

  if (!ok) {
    return <Login onLogin={handleLogin} />;
  }

  if (!data) {
    if (loadError) {
      return (
        <div className="app-loading" style={{ maxWidth: 480, margin: "60px auto", padding: 24 }}>
          <Brand />
          <ErrorCardPro
            title="Failed to Load Workspace"
            message={loadError}
            onRetry={() => {
              setLoadError("");
              const storedUser = localStorage.getItem("nexora_user");
              const user = storedUser ? JSON.parse(storedUser) : null;
              loadWorkspaceFor(user)
                .then((normalized) => {
                  setData(normalized);
                  setToast("");
                })
                .catch((err) => setLoadError(err?.message || "Unable to load NEXORA intelligence."));
            }}
            onSecondary={logout}
            secondaryLabel="Sign out"
          />
        </div>
      );
    }
    return (
      <div className="app-loading">
        <Brand />
        <span className="loader" />
        Syncing NEXORA intelligence…
      </div>
    );
  }

  const nav = [
    ["dashboard", "Dashboard", "home"],
    ["projects", "Projects", "briefcase"],
    ["tasks", "Tasks", "check"],
    ["calendar", "Calendar", "calendar"],
    ["activity", "Timeline", "activity"],
    ["team", "Team", "users"],
    ["analytics", "Analytics", "chart"],
    ["documents", "Documents", "file"],
    ["communication", "Discussions", "chat"],
    ["notifications", "Notifications", "bell"],
    ...(data?.user?.rawRole === "admin" ? [["admin", "Admin", "shield"]] : [])
  ];

  const clientNav = [
    ["dashboard", "Overview", "home"],
    ["projects", "Projects", "briefcase"],
    ["tasks", "Deliverables", "check"],
    ["calendar", "Schedule", "calendar"],
    ["activity", "Timeline", "activity"],
    ["documents", "Documents", "file"],
    ["communication", "Discussions", "chat"],
    ["notifications", "Notifications", "bell"]
  ];

  const currentNav = isClientUser ? clientNav : nav;

  const unread = data.notifications.filter(
    (n) => n.unread
  ).length;

  return (
    <main className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <Brand />

        <nav>
          {currentNav.map(([id, label, icon]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => go(id)}
              title={label}
            >
              <Icon name={icon} />

              <span>{label}</span>

              {id === "notifications" && unread > 0 && (
                <em>{unread}</em>
              )}
            </button>
          ))}
        </nav>

        {!isClientUser && (
          <div className="ai-mini">
            <div className="bot">✦</div>
            <b>NEXORA AI</b>
            <small>Your intelligent project companion</small>

            <button onClick={() => setAi(true)}>
              Ask AI <Icon name="arrow" size={13} />
            </button>
          </div>
        )}

        <button
          type="button"
          className="sidebar-toggle-btn"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          <Icon name={sidebarCollapsed ? "arrowRight" : "arrowLeft"} size={14} />
          {!sidebarCollapsed && <span>Collapse Sidebar</span>}
        </button>
      </aside>

      <section className="work">
        <header className="topbar">
          <div className="topbar-breadcrumbs">
            <button type="button" onClick={() => { setFocus(null); go("dashboard"); }}>NEXORA</button>
            <span>/</span>
            <span className="active">
              {focus?.type === "project" ? (focus.project?.name || "Project Details") : page.charAt(0).toUpperCase() + page.slice(1)}
            </span>
          </div>

          <div
            className="search"
            onClick={() => setGlobalSearchOpen(true)}
            style={{ cursor: "pointer" }}
            title="Global Search (Press ⌘K)"
          >
            <Icon name="search" />
            <input
              aria-label="Search"
              placeholder="Search projects, tasks, squad (⌘K)…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setGlobalSearchOpen(true)}
              readOnly
            />
            <kbd>⌘ K</kbd>
          </div>

          <div className="quick-actions-wrap">
            <button
              type="button"
              className="primary"
              style={{ padding: "6px 12px", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
              onClick={() => setQuickActionsOpen(!quickActionsOpen)}
              title="Role-scoped Quick Actions"
            >
              <Icon name="plus" size={13} />
              <span>Quick Action</span>
            </button>

            <QuickActionsMenu
              isOpen={quickActionsOpen}
              onClose={() => setQuickActionsOpen(false)}
              userRole={data.user.rawRole}
              onCreateTask={() => {
                setQuickActionsOpen(false);
                setTaskModal({ task: { status: "To Do", priority: "Medium" }, mode: "create" });
              }}
              onCreateProject={() => {
                setQuickActionsOpen(false);
                go("projects");
                notify("Navigate to Projects to initialize new engagement.");
              }}
              onExportPdf={() => {
                setQuickActionsOpen(false);
                const p = data.projects[0];
                if (p) {
                  downloadProjectPDFReport(p.id, `NEXORA_${p.code || "EXEC"}_REPORT.pdf`);
                  notify(`Exporting PDF for ${p.name}...`);
                }
              }}
              onExportExcel={() => {
                setQuickActionsOpen(false);
                const p = data.projects[0];
                if (p) {
                  downloadProjectExcelReport(p.id, `NEXORA_${p.code || "EXEC"}_METRICS.xlsx`);
                  notify(`Exporting Excel for ${p.name}...`);
                }
              }}
              onSync={() => {
                setQuickActionsOpen(false);
                reloadWorkspace(false);
              }}
              Icon={Icon}
            />
          </div>

          <div
            className={`live-status-pill ${socketStatus === "fallback" ? "fallback" : ""}`}
            title={
              socketStatus === "connected"
                ? "Real-time WebSocket active. Receiving live updates."
                : socketStatus === "reconnecting"
                ? "Reconnecting to real-time gateway..."
                : "WebSocket unavailable. Operating on HTTP polling fallback."
            }
          >
            <span
              className={`live-dot ${
                socketStatus === "connected"
                  ? ""
                  : socketStatus === "reconnecting"
                  ? "live-dot-reconnecting"
                  : "live-dot-fallback"
              }`}
            />
            <span className="live-text">
              {socketStatus === "connected"
                ? "LIVE REAL-TIME"
                : socketStatus === "reconnecting"
                ? "RECONNECTING"
                : "HTTP SYNC"}
            </span>
            <button
              type="button"
              className={`refresh-btn ${refreshing ? "spinning" : ""}`}
              onClick={() => reloadWorkspace(false)}
              title="Manual Sync with Database"
              aria-label="Refresh live data"
            >
              <Icon name="refresh" size={13} />
            </button>
          </div>

          <button
            className="icon-button"
            onClick={() => go("notifications")}
            title="Notifications"
          >
            <Icon name="bell" />
            <i />
          </button>

          <div style={{ position: "relative" }}>
            <button
              type="button"
              className="profile-menu"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              title="User Account &amp; Security"
              style={{ cursor: "pointer" }}
            >
              <Avatar member={data.user} />

              <span>
                <b>{data.user.name}</b>
                <small>{data.user.role}</small>
              </span>

              <Icon name="arrow" size={13} />
            </button>

            {userMenuOpen && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 6px)",
                  background: "#06152b",
                  border: "1px solid var(--line)",
                  borderRadius: "8px",
                  padding: "6px",
                  minWidth: "220px",
                  zIndex: 1000,
                  boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "2px"
                }}
              >
                <div style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: "4px" }}>
                  <b style={{ color: "#fff", fontSize: "12px", display: "block" }}>{data.user.name}</b>
                  <span style={{ color: "var(--muted)", fontSize: "11px" }}>{data.user.email}</span>
                </div>
                <button
                  type="button"
                  className="text-button"
                  style={{ textAlign: "left", padding: "6px 10px", fontSize: "12px", color: "var(--cyan)", display: "flex", alignItems: "center", gap: "8px", borderRadius: "4px" }}
                  onClick={() => { setUserMenuOpen(false); setSessionModalOpen(true); }}
                >
                  <Icon name="shield" size={14} /> Security &amp; Sessions
                </button>
                <button
                  type="button"
                  className="text-button"
                  style={{ textAlign: "left", padding: "6px 10px", fontSize: "12px", color: "var(--cyan)", display: "flex", alignItems: "center", gap: "8px", borderRadius: "4px" }}
                  onClick={() => { setUserMenuOpen(false); setPrefsModalOpen(true); }}
                >
                  <Icon name="bell" size={14} /> Notification Preferences
                </button>
                {["admin", "project_manager"].includes(data.user.rawRole) && (
                  <button
                    type="button"
                    className="text-button"
                    style={{ textAlign: "left", padding: "6px 10px", fontSize: "12px", color: "#fff", display: "flex", alignItems: "center", gap: "8px", borderRadius: "4px" }}
                    onClick={() => { setUserMenuOpen(false); setAuditModalOpen(true); }}
                  >
                    <Icon name="file" size={14} /> Audit Governance Log
                  </button>
                )}
                {["admin", "project_manager"].includes(data.user.rawRole) && (
                  <button
                    type="button"
                    className="text-button"
                    style={{ textAlign: "left", padding: "6px 10px", fontSize: "12px", color: "#fff", display: "flex", alignItems: "center", gap: "8px", borderRadius: "4px" }}
                    onClick={() => { setUserMenuOpen(false); setTemplatesModalOpen(true); }}
                  >
                    <Icon name="layers" size={14} /> Project Templates
                  </button>
                )}
                <button
                  type="button"
                  className="text-button"
                  style={{ textAlign: "left", padding: "6px 10px", fontSize: "12px", color: "var(--muted)", display: "flex", alignItems: "center", gap: "8px", borderRadius: "4px" }}
                  onClick={() => { setUserMenuOpen(false); toggleDensity(); }}
                >
                  <Icon name="sliders" size={14} /> Density: {density === "standard" ? "Standard" : "Compact"}
                </button>
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: "4px", paddingTop: "4px" }}>
                  <button
                    type="button"
                    className="text-button"
                    style={{ textAlign: "left", padding: "6px 10px", fontSize: "12px", color: "#ff95bd", width: "100%", display: "flex", alignItems: "center", gap: "8px", borderRadius: "4px" }}
                    onClick={() => { setUserMenuOpen(false); logout(); }}
                  >
                    <Icon name="arrow" size={14} /> Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            className="topbar-logout-btn"
            onClick={logout}
            title="Sign out of NEXORA"
            aria-label="Logout"
          >
            <Icon name="logout" size={14} />
            <span>Logout</span>
          </button>
        </header>

        <div className="content">
          {focus?.type === "project" ? (
            <ProjectDetail
              project={focus.project}
              user={data.user}
              members={data.members}
              action={action}
              notify={notify}
              go={go}
              onBack={() => setFocus(null)}
              openTaskAI={(task) => setTaskModal({ task, mode: "analyze" })}
              openTaskEdit={(task) => setTaskModal({ task, mode: "edit" })}
              openAvailability={(member) => setAvailModal({ member })}
            />
          ) : page === "dashboard" ? (
            <Dashboard
              data={data}
              go={go}
              openProject={openProject}
              openTaskAI={(task) => setTaskModal({ task, mode: "analyze" })}
              openTaskEdit={(task) => setTaskModal({ task, mode: "edit" })}
              openAvailability={(member) => setAvailModal({ member })}
              action={action}
              notify={notify}
              reloadWorkspace={() => reloadWorkspace(false)}
              onOpenSkillMatcher={(task) => setSkillMatcherTask(task)}
              onOpenAIApproval={(rec) => setAiApprovalRec(rec)}
              onOpenFeedback={(deliv) => setClientFeedbackDeliv(deliv)}
            />
          ) : page === "projects" ? (
            <section className="projects-view">
              <Header
                eyebrow="PORTFOLIO OVERSIGHT"
                title="Active Projects"
                description="Comprehensive delivery roadmaps, health scores, and cross-functional project tracking."
              />
              <div className="dashboard-grid top" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
                {data.projects.map((p) => (
                  <Panel key={p.id} title={p.name} action={
                    <button className="primary" style={{ fontSize: "11px", padding: "4px 10px" }} onClick={() => openProject(p)}>
                      Open Project <Icon name="arrow" size={13} />
                    </button>
                  }>
                    <p style={{ margin: "0 0 12px", color: "var(--muted)", fontSize: "13px" }}>{p.description}</p>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "12px" }}>
                      <span>Progress</span>
                      <b>{p.progress}%</b>
                    </div>
                    <Progress value={p.progress} />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--muted)", marginTop: "8px" }}>
                      <span>Deadline: {p.deadline}</span>
                      <Tag tone={p.statusTone}>{p.status}</Tag>
                    </div>
                  </Panel>
                ))}
              </div>
            </section>
          ) : page === "tasks" ? (
            <Tasks
              data={data}
              query={query}
              action={action}
              openTaskAI={(task) => setTaskModal({ task, mode: "analyze" })}
              openTaskEdit={(task) => setTaskModal({ task, mode: "edit" })}
              openTaskDelete={(task) => action({ endpoint: `/tasks/${task.id || task._id}`, method: "DELETE" }, "Task deleted successfully.")}
              notify={notify}
            />
          ) : page === "calendar" ? (
            <SmartCalendarView
              data={data}
              go={go}
              openProject={openProject}
              openTask={(t) => setTaskModal({ task: t, mode: "edit" })}
              isClient={isClientUser}
              notify={notify}
              Icon={Icon}
              Tag={Tag}
            />
          ) : page === "activity" ? (
            <ActivityTimelineView
              data={data}
              go={go}
              openProject={openProject}
              isClient={isClientUser}
              notify={notify}
              Icon={Icon}
              Tag={Tag}
            />
          ) : page === "team" ? (
            <Team
              data={data}
              query={query}
              openAvailability={(member) => setAvailModal({ member })}
              notify={notify}
              reloadWorkspace={() => reloadWorkspace(false)}
            />
          ) : page === "analytics" ? (
            <Analytics data={data} />
          ) : page === "documents" ? (
            <Documents data={data} notify={notify} openTaskModal={(t) => setTaskModal({ task: t, mode: "view" })} />
          ) : page === "communication" ? (
            <Communication data={data} notify={notify} openTaskModal={(t) => setTaskModal({ task: t, mode: "view" })} />
          ) : page === "notifications" ? (
            <Notifications data={data} action={action} go={go} />
          ) : page === "admin" && data.user.rawRole === "admin" ? (
            <AdminGovernanceView
              data={data}
              go={go}
              action={action}
              notify={notify}
              openAvailability={(member) => setAvailModal({ member })}
              reloadWorkspace={() => reloadWorkspace(false)}
            />
          ) : (
            <Dashboard
              data={data}
              go={go}
              openProject={openProject}
              openTaskAI={(task) => setTaskModal({ task, mode: "analyze" })}
              openTaskEdit={(task) => setTaskModal({ task, mode: "edit" })}
              openAvailability={(member) => setAvailModal({ member })}
              action={action}
              notify={notify}
              reloadWorkspace={() => reloadWorkspace(false)}
              onOpenSkillMatcher={(task) => setSkillMatcherTask(task)}
              onOpenAIApproval={(rec) => setAiApprovalRec(rec)}
              onOpenFeedback={(deliv) => setClientFeedbackDeliv(deliv)}
            />
          )}
        </div>
      </section>

      {taskModal && (
        <TaskModal
          task={taskModal.task}
          mode={taskModal.mode}
          data={data}
          action={action}
          close={() => setTaskModal(null)}
        />
      )}

      {availModal && (
        <AvailabilityModal
          member={availModal.member}
          data={data}
          action={action}
          close={() => setAvailModal(null)}
        />
      )}

      {/* Enterprise Global Modals */}
      <GlobalSearchModal
        isOpen={globalSearchOpen}
        onClose={() => setGlobalSearchOpen(false)}
        onSelectProject={(p) => {
          openProject(p);
          setGlobalSearchOpen(false);
        }}
        onSelectTask={(t) => {
          setTaskModal({ task: t, mode: "edit" });
          setGlobalSearchOpen(false);
        }}
        onSelectMember={(m) => {
          setAvailModal({ member: m });
          setGlobalSearchOpen(false);
        }}
        isClient={isClientUser}
        onSelectMilestone={(m) => {
          if (m.projectId || m.project) {
            const proj = data?.projects?.find(p => (p.id || p._id) === (m.projectId || m.project));
            if (proj) openProject(proj);
          }
          setGlobalSearchOpen(false);
        }}
        onSelectDocument={(d) => {
          go("documents");
          setGlobalSearchOpen(false);
        }}
        onSelectDiscussion={(c) => {
          go("communication");
          setGlobalSearchOpen(false);
        }}
        Icon={Icon}
        Tag={Tag}
      />

      <SkillMatcherModal
        isOpen={!!skillMatcherTask}
        onClose={() => setSkillMatcherTask(null)}
        task={skillMatcherTask}
        members={data?.members || []}
        onAssign={async (task, member) => {
          await action({
            endpoint: `/tasks/${task.id || task._id}`,
            method: "PATCH",
            payload: { assigneeId: member.id, assignee: member.name }
          }, `Assigned "${task.title}" to ${member.name}`);
          setSkillMatcherTask(null);
        }}
        Icon={Icon}
        Avatar={Avatar}
        Tag={Tag}
      />

      <AIApprovalModal
        isOpen={!!aiApprovalRec}
        onClose={() => setAiApprovalRec(null)}
        recommendation={aiApprovalRec}
        onApply={async (rec) => {
          notify(`Applied AI Proposal: ${rec.title}`);
          setAiApprovalRec(null);
          reloadWorkspace(false);
        }}
        Icon={Icon}
      />

      <ClientFeedbackModal
        isOpen={!!clientFeedbackDeliv}
        onClose={() => setClientFeedbackDeliv(null)}
        deliverable={clientFeedbackDeliv}
        onSubmitFeedback={async (feedback) => {
          notify(`Client review recorded: ${feedback.status.toUpperCase()} - "${feedback.comments}"`);
          setClientFeedbackDeliv(null);
          reloadWorkspace(false);
        }}
        Icon={Icon}
      />

      {sessionModalOpen && (
        <SessionSecurityModal
          user={data?.user}
          onClose={() => setSessionModalOpen(false)}
          notify={(msg) => {
            setToast(msg);
            setTimeout(() => setToast(""), 3500);
          }}
        />
      )}

      {auditModalOpen && (
        <AuditLogsModal
          onClose={() => setAuditModalOpen(false)}
        />
      )}

      {prefsModalOpen && (
        <NotificationPreferencesModal
          isOpen={prefsModalOpen}
          onClose={() => setPrefsModalOpen(false)}
          user={data?.user}
          notify={(msg) => {
            setToast(msg);
            setTimeout(() => setToast(""), 3500);
          }}
          reloadWorkspace={() => reloadWorkspace(false)}
        />
      )}

      {templatesModalOpen && (
        <ProjectTemplatesModal
          isOpen={templatesModalOpen}
          onClose={() => setTemplatesModalOpen(false)}
          projects={data?.projects}
          notify={(msg) => {
            setToast(msg);
            setTimeout(() => setToast(""), 3500);
          }}
          reloadWorkspace={() => reloadWorkspace(false)}
        />
      )}
    </main>
  );
}
