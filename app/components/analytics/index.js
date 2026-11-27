"use client";

import React, { useState } from "react";

// ============================================================
// 1. Data Sufficiency Badge Component
// ============================================================
export function DataSufficiencyBadge({ sufficiency = {}, showDetails = false }) {
  const [openTooltip, setOpenTooltip] = useState(false);

  const level = (sufficiency.level || "moderate").toLowerCase();
  const score = sufficiency.score !== undefined ? sufficiency.score : 65;
  const sampleCount = sufficiency.sampleCount !== undefined ? sufficiency.sampleCount : (sufficiency.taskCount || 0);

  const badgeConfig = {
    high: {
      label: "High Data Sufficiency",
      color: "#21d8ae",
      bg: "rgba(33, 216, 174, 0.12)",
      border: "rgba(33, 216, 174, 0.4)",
      desc: "Robust historical telemetry available (>75% coverage). High prediction statistical confidence."
    },
    moderate: {
      label: "Moderate Data Sufficiency",
      color: "#30dbff",
      bg: "rgba(48, 219, 255, 0.12)",
      border: "rgba(48, 219, 255, 0.4)",
      desc: "Adequate baseline sprint data (45–74% coverage). Velocity projections calibrated with active tasks."
    },
    low: {
      label: "Low Data Sufficiency",
      color: "#fbb76d",
      bg: "rgba(251, 183, 109, 0.12)",
      border: "rgba(251, 183, 109, 0.4)",
      desc: "Limited baseline samples (20–44% coverage). Predictions rely on deterministic heuristics."
    },
    insufficient_data: {
      label: "Insufficient Data",
      color: "#ff6eae",
      bg: "rgba(255, 110, 174, 0.12)",
      border: "rgba(255, 110, 174, 0.4)",
      desc: "Fewer than 3 closed tasks. Statistical predictions pending further completed task telemetry."
    }
  };

  const config = badgeConfig[level] || badgeConfig.moderate;

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpenTooltip(!openTooltip)}
        onMouseEnter={() => setOpenTooltip(true)}
        onMouseLeave={() => setOpenTooltip(false)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          padding: "3px 8px",
          borderRadius: "99px",
          background: config.bg,
          border: `1px solid ${config.border}`,
          color: config.color,
          fontSize: "11px",
          fontWeight: 700,
          cursor: "pointer",
          letterSpacing: "0.2px",
          whiteSpace: "nowrap"
        }}
        title="Click to view data sufficiency details"
      >
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: config.color,
            boxShadow: `0 0 6px ${config.color}`
          }}
        />
        <span>{config.label}</span>
        <span style={{ opacity: 0.75, fontSize: "10px" }}>({score}%)</span>
      </button>

      {/* Tooltip Card */}
      {openTooltip && (
        <div
          style={{
            position: "absolute",
            bottom: "125%",
            right: 0,
            zIndex: 100,
            width: "260px",
            padding: "10px 12px",
            borderRadius: "8px",
            background: "rgba(5, 17, 38, 0.96)",
            border: `1px solid ${config.border}`,
            boxShadow: "0 10px 25px rgba(0, 0, 0, 0.7), 0 0 15px rgba(48, 219, 255, 0.15)",
            backdropFilter: "blur(10px)",
            color: "#ffffff",
            fontSize: "11.5px",
            lineHeight: 1.45,
            pointerEvents: "none"
          }}
        >
          <div style={{ fontWeight: 700, color: config.color, marginBottom: "4px" }}>
            {config.label} ({score}% Score)
          </div>
          <div style={{ color: "#cbd5e1", marginBottom: "6px" }}>{config.desc}</div>
          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--muted)", fontSize: "10.5px", borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: "5px" }}>
            <span>Analyzed Samples:</span>
            <b style={{ color: "#fff" }}>{sampleCount} items</b>
          </div>
        </div>
      )}

      {showDetails && (
        <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "3px" }}>
          {config.desc}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 2. Prediction Card Component (Project Delay / Milestone Risk)
// ============================================================
export function PredictionCard({
  title = "Project Completion & Delay Forecast",
  prediction = {},
  onOpenExplanation = null,
  role = "pm"
}) {
  const isDelayed = prediction.isDelayed;
  const scheduleVariance = prediction.scheduleVarianceDays || 0;
  const riskLevel = (prediction.riskLevel || (isDelayed ? "critical" : "low")).toLowerCase();
  const sufficiency = prediction.dataSufficiency || { level: "moderate", score: 68, sampleCount: 12 };
  const contributingFactors = prediction.contributingFactors || [];
  const confidence = prediction.confidenceScore !== undefined ? prediction.confidenceScore : 82;

  const riskBadgeStyles = {
    critical: { label: "CRITICAL DELAY", color: "#ff6eae", bg: "rgba(255, 110, 174, 0.15)", border: "#ff6eae" },
    high: { label: "HIGH RISK", color: "#ff6eae", bg: "rgba(255, 110, 174, 0.15)", border: "#ff6eae" },
    medium: { label: "MODERATE RISK", color: "#fbb76d", bg: "rgba(251, 183, 109, 0.15)", border: "#fbb76d" },
    low: { label: "ON TRACK", color: "#21d8ae", bg: "rgba(33, 216, 174, 0.15)", border: "#21d8ae" }
  };

  const riskStyle = riskBadgeStyles[riskLevel] || riskBadgeStyles.low;

  return (
    <div
      style={{
        padding: "16px",
        borderRadius: "10px",
        background: "linear-gradient(180deg, rgba(7, 24, 52, 0.88), rgba(4, 15, 34, 0.82))",
        border: `1px solid ${isDelayed ? "rgba(255, 110, 174, 0.45)" : "var(--line)"}`,
        boxShadow: isDelayed ? "0 4px 20px rgba(255, 110, 174, 0.15)" : "0 4px 18px rgba(0, 0, 0, 0.4)",
        display: "flex",
        flexDirection: "column",
        gap: "12px"
      }}
    >
      {/* Header Row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px", flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <span
              style={{
                padding: "2px 8px",
                borderRadius: "4px",
                fontSize: "11px",
                fontWeight: 800,
                color: riskStyle.color,
                background: riskStyle.bg,
                border: `1px solid ${riskStyle.border}`
              }}
            >
              {riskStyle.label}
            </span>
            <DataSufficiencyBadge sufficiency={sufficiency} />
          </div>
          <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#fff" }}>
            {title}
          </h3>
        </div>

        {onOpenExplanation && (
          <button
            type="button"
            onClick={onOpenExplanation}
            className="outline"
            style={{ fontSize: "11px", padding: "4px 10px" }}
            title="Inspect statistical methodology and contributing weights"
          >
            ✦ Why this prediction?
          </button>
        )}
      </div>

      {/* Core Variance & Forecast Numbers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
          gap: "10px",
          padding: "10px 12px",
          borderRadius: "8px",
          background: "rgba(5, 17, 38, 0.7)",
          border: "1px solid rgba(48, 219, 255, 0.15)"
        }}
      >
        <div>
          <span style={{ fontSize: "10.5px", color: "var(--muted)", textTransform: "uppercase" }}>Schedule Variance</span>
          <div style={{ fontSize: "18px", fontWeight: 800, color: scheduleVariance > 0 ? "#ff6eae" : "#21d8ae", marginTop: "2px" }}>
            {scheduleVariance > 0 ? `+${scheduleVariance} Days Delay` : scheduleVariance < 0 ? `${scheduleVariance} Days Ahead` : "On Schedule"}
          </div>
        </div>

        <div>
          <span style={{ fontSize: "10.5px", color: "var(--muted)", textTransform: "uppercase" }}>Target Deadline</span>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff", marginTop: "4px" }}>
            {prediction.deadline ? new Date(prediction.deadline).toLocaleDateString() : "Contracted End"}
          </div>
        </div>

        <div>
          <span style={{ fontSize: "10.5px", color: "var(--muted)", textTransform: "uppercase" }}>Estimated Completion</span>
          <div style={{ fontSize: "14px", fontWeight: 700, color: isDelayed ? "#ff95bd" : "var(--cyan)", marginTop: "4px" }}>
            {prediction.estimatedCompletionDate ? new Date(prediction.estimatedCompletionDate).toLocaleDateString() : "Pending"}
          </div>
        </div>

        <div>
          <span style={{ fontSize: "10.5px", color: "var(--muted)", textTransform: "uppercase" }}>Model Confidence</span>
          <div style={{ fontSize: "15px", fontWeight: 700, color: "#21d8ae", marginTop: "3px" }}>
            {confidence}%
          </div>
        </div>
      </div>

      {/* Summary Narrative */}
      {prediction.summary && (
        <p style={{ margin: 0, fontSize: "12.5px", color: "#cbd5e1", lineHeight: 1.5 }}>
          {prediction.summary}
        </p>
      )}

      {/* Contributing Factors */}
      {contributingFactors.length > 0 && (
        <div>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--cyan)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Primary Contributing Factors
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {contributingFactors.map((factor, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: "12px",
                  padding: "6px 10px",
                  borderRadius: "6px",
                  background: "rgba(9, 27, 57, 0.45)",
                  border: "1px solid rgba(41, 184, 255, 0.15)"
                }}
              >
                <span style={{ color: "#e2e8f0" }}>{factor.factor || factor.name}</span>
                <span
                  style={{
                    color: factor.impact === "critical" ? "#ff6eae" : factor.impact === "high" ? "#fbb76d" : "var(--cyan)",
                    fontWeight: 700,
                    fontSize: "11.5px"
                  }}
                >
                  {factor.weight ? `${factor.weight}% impact` : factor.impact || "moderate"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommended Immediate Mitigation */}
      {prediction.suggestedMitigation && (
        <div
          style={{
            padding: "8px 12px",
            borderRadius: "6px",
            background: "rgba(33, 216, 174, 0.08)",
            border: "1px solid rgba(33, 216, 174, 0.3)",
            fontSize: "12px",
            color: "#bbfff2"
          }}
        >
          <b>Recommended Mitigation:</b> {prediction.suggestedMitigation}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 3. AI Recommendation Card Component (All 7 Required Fields)
// ============================================================
export function AIRecommendationCard({
  recommendation = {},
  onApprove = null,
  onDismiss = null,
  isProcessing = false
}) {
  const [showDismissInput, setShowDismissInput] = useState(false);
  const [dismissReason, setDismissReason] = useState("");

  const {
    id,
    title = "Workload & Schedule Rebalancing Proposal",
    severity = "medium",
    // Field 1: Identified Issue
    problem = recommendation.issue || "Uneven workload distribution across active engineering sprints.",
    // Field 2: Supporting Data
    supportingData = recommendation.metrics || recommendation.evidence || "Developer assigned 48 weekly hours against 40h standard baseline capacity.",
    // Field 3: Reasoning
    reasoning = recommendation.why || "High cognitive switching and resource saturation increase code review churn and defect rates.",
    // Field 4: Recommended Action
    recommendation: recommendedAction = recommendation.action || "Reassign 2 non-critical backend tasks to available squad members.",
    // Field 5: Expected Benefit
    expectedBenefit = recommendation.benefit || "Lowers sprint delivery risk by 3.4 days and avoids burnout without altering release target.",
    // Field 6: Risk / Limitation
    riskLimitation = recommendation.risk || recommendation.limitation || "Brief 1-hour context transfer required between assigned engineers.",
    // Category / Metadata
    category = recommendation.type || "workload"
  } = recommendation;

  const severityTone = severity === "critical" || severity === "high" ? "critical" : "medium";
  const badgeColor = severityTone === "critical" ? "#ff6eae" : "#fbb76d";

  return (
    <div
      className="ai-recommendation-card"
      style={{
        padding: "16px",
        borderRadius: "10px",
        background: "linear-gradient(180deg, rgba(8, 25, 54, 0.9), rgba(4, 16, 36, 0.85))",
        border: "1px solid rgba(41, 184, 255, 0.28)",
        boxShadow: "0 6px 20px rgba(0, 0, 0, 0.45)",
        display: "flex",
        flexDirection: "column",
        gap: "12px"
      }}
    >
      {/* Top Bar: Title & Severity */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              padding: "2px 7px",
              borderRadius: "4px",
              fontSize: "10.5px",
              fontWeight: 800,
              color: badgeColor,
              background: severityTone === "critical" ? "rgba(255, 110, 174, 0.15)" : "rgba(251, 183, 109, 0.15)",
              border: `1px solid ${badgeColor}`
            }}
          >
            {severity.toUpperCase()}
          </span>
          <span style={{ fontSize: "11px", color: "var(--cyan)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            {category}
          </span>
        </div>
        <span style={{ fontSize: "11px", color: "var(--muted)" }}>✦ AI Predictive Advisory</span>
      </div>

      <h4 style={{ margin: 0, fontSize: "14.5px", fontWeight: 700, color: "#fff" }}>
        {title}
      </h4>

      {/* Field 1: Identified Issue */}
      <div style={{ fontSize: "12.5px", color: "#e2e8f0" }}>
        <b style={{ color: "#ff95bd" }}>1. Identified Issue:</b> {problem}
      </div>

      {/* Field 2: Supporting Data */}
      <div
        style={{
          padding: "8px 12px",
          borderRadius: "6px",
          background: "rgba(5, 17, 38, 0.75)",
          border: "1px solid rgba(48, 219, 255, 0.18)",
          fontSize: "12px",
          color: "#cbd5e1"
        }}
      >
        <b style={{ color: "var(--cyan)" }}>2. Supporting Telemetry:</b> {supportingData}
      </div>

      {/* Field 3: Reasoning */}
      <div style={{ fontSize: "12px", color: "#94a3b8" }}>
        <b style={{ color: "#cbd5e1" }}>3. Algorithmic Reasoning:</b> {reasoning}
      </div>

      {/* Field 4: Recommended Action */}
      <div
        style={{
          padding: "8px 12px",
          borderRadius: "6px",
          background: "rgba(33, 216, 174, 0.08)",
          border: "1px solid rgba(33, 216, 174, 0.3)",
          fontSize: "12px",
          color: "#bbfff2"
        }}
      >
        <b style={{ color: "#21d8ae" }}>4. Recommended Action:</b> {recommendedAction}
      </div>

      {/* Fields 5 & 6: Expected Benefit and Risk / Limitation Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "8px" }}>
        <div style={{ padding: "8px 10px", borderRadius: "6px", background: "rgba(9, 27, 57, 0.4)", border: "1px solid rgba(33, 216, 174, 0.2)", fontSize: "11.5px" }}>
          <b style={{ color: "#21d8ae", display: "block", marginBottom: "2px" }}>5. Expected Benefit:</b>
          <span style={{ color: "#e2e8f0" }}>{expectedBenefit}</span>
        </div>

        <div style={{ padding: "8px 10px", borderRadius: "6px", background: "rgba(9, 27, 57, 0.4)", border: "1px solid rgba(251, 183, 109, 0.2)", fontSize: "11.5px" }}>
          <b style={{ color: "#fbb76d", display: "block", marginBottom: "2px" }}>6. Risk / Limitation:</b>
          <span style={{ color: "#e2e8f0" }}>{riskLimitation}</span>
        </div>
      </div>

      {/* Field 7: Human-in-the-Loop Actions (Approve / Dismiss) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", marginTop: "4px", flexWrap: "wrap", borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: "10px" }}>
        <div style={{ fontSize: "11px", color: "var(--muted)" }}>
          Requires human review before executing assignment changes.
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {!showDismissInput ? (
            <>
              <button
                type="button"
                className="outline"
                style={{ fontSize: "11.5px", padding: "6px 12px" }}
                disabled={isProcessing}
                onClick={() => setShowDismissInput(true)}
              >
                Dismiss...
              </button>
              <button
                type="button"
                className="primary"
                style={{ fontSize: "11.5px", padding: "6px 14px" }}
                disabled={isProcessing}
                onClick={() => onApprove && onApprove(recommendation)}
              >
                {isProcessing ? "Executing..." : "✓ Approve & Apply"}
              </button>
            </>
          ) : (
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <input
                type="text"
                placeholder="Reason for dismissal (optional)..."
                value={dismissReason}
                onChange={(e) => setDismissReason(e.target.value)}
                style={{
                  padding: "5px 10px",
                  fontSize: "11.5px",
                  borderRadius: "6px",
                  background: "#051126",
                  border: "1px solid var(--line)",
                  color: "#fff",
                  minWidth: "180px"
                }}
              />
              <button
                type="button"
                className="outline"
                style={{ fontSize: "11px", padding: "5px 10px", color: "#ff95bd" }}
                onClick={() => {
                  if (onDismiss) onDismiss(recommendation, dismissReason);
                  setShowDismissInput(false);
                }}
              >
                Confirm Dismissal
              </button>
              <button
                type="button"
                className="text-button"
                style={{ fontSize: "11px" }}
                onClick={() => setShowDismissInput(false)}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 4. Bottleneck Detection Panel
// ============================================================
export function BottleneckPanel({ bottlenecks = [], title = "Active Operational Bottlenecks" }) {
  if (!bottlenecks || bottlenecks.length === 0) {
    return (
      <div
        style={{
          padding: "16px",
          borderRadius: "8px",
          background: "rgba(9, 27, 57, 0.45)",
          border: "1px dashed var(--line)",
          textAlign: "center",
          color: "var(--muted)",
          fontSize: "12.5px"
        }}
      >
        ✦ Zero active bottlenecks detected. Sprint and delivery pipeline progressing smoothly.
      </div>
    );
  }

  const typeConfig = {
    delivery_delay: { label: "DELIVERY DELAY", color: "#ff6eae", icon: "⏳" },
    resource_saturation: { label: "RESOURCE OVERLOAD", color: "#fbb76d", icon: "⚡" },
    dependency_blocker: { label: "DEPENDENCY BLOCKER", color: "#ff6eae", icon: "🔒" },
    stuck_in_progress: { label: "STUCK IN PROGRESS", color: "#30dbff", icon: "⚠️" },
    milestone_risk: { label: "MILESTONE AT RISK", color: "#ffd087", icon: "🚩" }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {bottlenecks.map((item, idx) => {
        const config = typeConfig[item.type] || { label: (item.type || "BOTTLENECK").toUpperCase(), color: "#ff6eae", icon: "⚠️" };
        return (
          <div
            key={item.id || idx}
            style={{
              padding: "12px 14px",
              borderRadius: "8px",
              background: "linear-gradient(180deg, rgba(7, 22, 48, 0.85), rgba(5, 17, 38, 0.8))",
              border: `1px solid ${item.severity === "critical" ? "rgba(255, 110, 174, 0.45)" : "var(--line)"}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "12px",
              flexWrap: "wrap"
            }}
          >
            <div style={{ flex: 1, minWidth: "240px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <span
                  style={{
                    padding: "2px 7px",
                    borderRadius: "4px",
                    fontSize: "10px",
                    fontWeight: 800,
                    color: config.color,
                    background: "rgba(0, 0, 0, 0.3)",
                    border: `1px solid ${config.color}`
                  }}
                >
                  {config.icon} {config.label}
                </span>
                <b style={{ color: "#ffffff", fontSize: "13.5px" }}>{item.title}</b>
              </div>

              <div style={{ fontSize: "12px", color: "#cbd5e1", marginTop: "4px" }}>
                <b>Root Cause:</b> {item.description || item.reason}
              </div>

              {item.impactedItems && item.impactedItems.length > 0 && (
                <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "4px" }}>
                  <span>Impacted Deliverables: </span>
                  <span style={{ color: "#fff" }}>{item.impactedItems.join(", ")}</span>
                </div>
              )}
            </div>

            {item.suggestedAction && (
              <div
                style={{
                  padding: "6px 10px",
                  borderRadius: "6px",
                  background: "rgba(48, 219, 255, 0.08)",
                  border: "1px solid rgba(48, 219, 255, 0.25)",
                  fontSize: "11.5px",
                  color: "var(--cyan)",
                  maxWidth: "280px"
                }}
              >
                <b>Suggested Action:</b> {item.suggestedAction}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// 5. Prediction Explanation Modal Dialog
// ============================================================
export function PredictionExplanationModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(1, 6, 15, 0.85)",
        backdropFilter: "blur(6px)",
        padding: "16px"
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "680px",
          maxHeight: "90vh",
          overflowY: "auto",
          borderRadius: "12px",
          background: "linear-gradient(180deg, #071937, #040e22)",
          border: "1px solid rgba(48, 219, 255, 0.4)",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.8), 0 0 25px rgba(48, 219, 255, 0.2)",
          padding: "24px",
          color: "#ffffff"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "18px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <span className="tag active" style={{ fontSize: "10.5px" }}>✦ METHODOLOGY DISCLOSURE</span>
              <span style={{ fontSize: "12px", color: "var(--cyan)" }}>NEXORA Advanced Intelligence</span>
            </div>
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 800 }}>
              Algorithmic Forecasting &amp; Prediction Methodology
            </h2>
          </div>
          <button
            type="button"
            className="outline"
            onClick={onClose}
            style={{ padding: "4px 10px", fontSize: "12px" }}
          >
            ✕ Close
          </button>
        </div>

        {/* Core Architectural Disclosure */}
        <div
          style={{
            padding: "12px 14px",
            borderRadius: "8px",
            background: "rgba(48, 219, 255, 0.08)",
            border: "1px solid rgba(48, 219, 255, 0.25)",
            fontSize: "12.5px",
            lineHeight: 1.5,
            color: "#e2e8f0",
            marginBottom: "16px"
          }}
        >
          <b style={{ color: "var(--cyan)" }}>Scientific Transparency Notice:</b> NEXORA uses deterministic, velocity-based statistical forecasting and seven-factor project health models rather than unexplainable black-box machine learning. Every calculation is reproducible, mathematically auditable, and grounded in your active project telemetry.
        </div>

        {/* The Seven-Factor Scoring Model */}
        <h4 style={{ margin: "14px 0 8px", fontSize: "13.5px", color: "var(--cyan)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          The Seven-Factor Project Health Algorithm
        </h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "16px" }}>
          {[
            { factor: "1. Deadline Risk", weight: "20%", desc: "Proximity to contracted milestone deadline vs. remaining scope" },
            { factor: "2. Delay Risk", weight: "20%", desc: "Ratio of overdue and off-schedule active deliverables" },
            { factor: "3. Progress Risk", weight: "20%", desc: "Expected vs. verified completion rate trajectory" },
            { factor: "4. Priority Risk", weight: "15%", desc: "Concentration of high/critical deliverables currently in flight" },
            { factor: "5. Blocker Risk", weight: "10%", desc: "Impediments and blocked technical dependencies" },
            { factor: "6. Workload Risk", weight: "10%", desc: "Team resource capacity utilization and overtime balance" },
            { factor: "7. Productivity Risk", weight: "5%", desc: "Historical sprint turnaround and cycle time adherence" }
          ].map((item, idx) => (
            <div
              key={idx}
              style={{
                padding: "8px 10px",
                borderRadius: "6px",
                background: "rgba(9, 27, 57, 0.5)",
                border: "1px solid rgba(41, 184, 255, 0.15)",
                fontSize: "11.5px"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, color: "#fff" }}>
                <span>{item.factor}</span>
                <span style={{ color: "var(--cyan)" }}>{item.weight}</span>
              </div>
              <div style={{ color: "var(--muted)", fontSize: "10.5px", marginTop: "2px" }}>{item.desc}</div>
            </div>
          ))}
        </div>

        {/* Data Sufficiency Assessment Tiers */}
        <h4 style={{ margin: "14px 0 8px", fontSize: "13.5px", color: "var(--cyan)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Data Sufficiency Assessment Tiers
        </h4>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "18px" }}>
          {[
            { level: "High (Score ≥ 75%)", color: "#21d8ae", desc: "Sufficient historical completed tasks; high predictive fidelity and confidence." },
            { level: "Moderate (Score 45–74%)", color: "#30dbff", desc: "Adequate baseline sprint data; projections calibrated with active tasks." },
            { level: "Low (Score 20–44%)", color: "#fbb76d", desc: "Limited completed sample pool; projections rely on standard velocity defaults." },
            { level: "Insufficient (< 20%)", color: "#ff6eae", desc: "Fewer than 3 closed tasks; statistical predictions pending further baseline data." }
          ].map((tier, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "6px 10px",
                borderRadius: "6px",
                background: "rgba(9, 27, 57, 0.3)",
                border: `1px solid ${tier.color}33`,
                fontSize: "11.5px"
              }}
            >
              <b style={{ color: tier.color }}>{tier.level}</b>
              <span style={{ color: "#cbd5e1", fontSize: "11px" }}>{tier.desc}</span>
            </div>
          ))}
        </div>

        {/* Human-in-the-Loop Safeguard */}
        <div
          style={{
            padding: "10px 12px",
            borderRadius: "6px",
            background: "rgba(33, 216, 174, 0.08)",
            border: "1px solid rgba(33, 216, 174, 0.3)",
            fontSize: "12px",
            color: "#bbfff2"
          }}
        >
          <b>Human Oversight Protocol:</b> NEXORA never automatically reassigns engineers, alters committed schedules, or modifies client milestones without explicit project manager or squad lead authorization.
        </div>
      </div>
    </div>
  );
}
