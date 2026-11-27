"use client";

import React, { useState, useRef, useId } from "react";

// ============================================================
// 1. Chart Tooltip
// ============================================================
export function ChartTooltip({ active, x, y, title, items = [] }) {
  if (!active) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: `${x}px`,
        top: `${y}px`,
        transform: "translate(-50%, -115%)",
        pointerEvents: "none",
        zIndex: 50,
        minWidth: "130px",
        padding: "8px 12px",
        borderRadius: "8px",
        background: "rgba(5, 17, 38, 0.94)",
        border: "1px solid rgba(48, 219, 255, 0.4)",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.7), 0 0 12px rgba(48, 219, 255, 0.2)",
        backdropFilter: "blur(8px)",
        color: "#ffffff",
        fontSize: "12px",
        transition: "opacity 0.15s ease, transform 0.15s ease"
      }}
    >
      {title && (
        <div style={{ fontWeight: 700, marginBottom: "4px", color: "var(--cyan)", fontSize: "11.5px", letterSpacing: "0.2px" }}>
          {title}
        </div>
      )}
      {items.map((item, idx) => (
        <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", margin: "2px 0" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#a8bfdd" }}>
            {item.color && (
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: item.color, display: "inline-block" }} />
            )}
            {item.label}:
          </span>
          <b style={{ color: "#ffffff" }}>{item.value}</b>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// 2. Loading State
// ============================================================
export function ChartLoadingState({ height = 220, message = "Loading chart telemetry..." }) {
  return (
    <div
      style={{
        height: `${height}px`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "12px",
        color: "var(--muted)",
        fontSize: "13px"
      }}
    >
      <div
        style={{
          width: "28px",
          height: "28px",
          border: "2px solid rgba(48, 219, 255, 0.2)",
          borderTopColor: "var(--cyan)",
          borderRadius: "50%",
          animation: "spin 1s linear infinite"
        }}
      />
      <span>{message}</span>
    </div>
  );
}

// ============================================================
// 3. Empty State
// ============================================================
export function ChartEmptyState({ height = 200, message = "No records available for this visualization." }) {
  return (
    <div
      style={{
        height: `${height}px`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        color: "var(--muted)",
        fontSize: "12.5px",
        padding: "20px",
        textAlign: "center",
        background: "rgba(6, 20, 44, 0.4)",
        borderRadius: "8px",
        border: "1px dashed rgba(41, 184, 255, 0.2)"
      }}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>{message}</span>
    </div>
  );
}

// ============================================================
// 4. Chart Container
// ============================================================
export function ChartContainer({
  title,
  subtitle,
  action,
  icon,
  badge,
  loading = false,
  empty = false,
  emptyMessage,
  height = 240,
  children,
  style = {}
}) {
  return (
    <div
      className="chart-card-container"
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        padding: "16px",
        borderRadius: "10px",
        background: "rgba(7, 20, 43, 0.78)",
        border: "1px solid var(--line)",
        boxShadow: "0 6px 20px rgba(0, 0, 0, 0.45)",
        minHeight: `${height + 70}px`,
        ...style
      }}
    >
      {/* Chart Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px", gap: "10px", flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {icon && <span style={{ color: "var(--cyan)", display: "flex" }}>{icon}</span>}
            <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "#ffffff", letterSpacing: "0.2px" }}>
              {title}
            </h4>
            {badge && (
              <span className="tag low" style={{ fontSize: "10.5px", padding: "1px 7px" }}>
                {badge}
              </span>
            )}
          </div>
          {subtitle && (
            <p style={{ margin: "2px 0 0", fontSize: "11.5px", color: "var(--muted)", lineHeight: 1.4 }}>
              {subtitle}
            </p>
          )}
        </div>
        {action && <div>{action}</div>}
      </div>

      {/* Chart Content Area */}
      <div style={{ position: "relative", flex: 1, width: "100%", minHeight: `${height}px` }}>
        {loading ? (
          <ChartLoadingState height={height} />
        ) : empty ? (
          <ChartEmptyState height={height} message={emptyMessage} />
        ) : (
          children
        )}
      </div>
    </div>
  );
}

// ============================================================
// 5. Bar Chart (Vertical & Horizontal)
// ============================================================
export function BarChart({
  data = [],
  horizontal = false,
  height = 220,
  valueSuffix = "",
  showValues = true,
  barColor = "var(--cyan)",
  emptyMessage = "No comparison records available."
}) {
  const [tooltip, setTooltip] = useState({ active: false, x: 0, y: 0, title: "", items: [] });
  const containerRef = useRef(null);

  if (!data || data.length === 0) {
    return <ChartEmptyState height={height} message={emptyMessage} />;
  }

  // Calculate max
  const maxValue = Math.max(
    ...data.map((d) => (d.max !== undefined ? d.max : Math.max(Number(d.value) || 0, Number(d.secondaryValue) || 0))),
    10
  );

  if (horizontal) {
    return (
      <div ref={containerRef} style={{ position: "relative", width: "100%", padding: "4px 0" }}>
        <ChartTooltip {...tooltip} />
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {data.map((item, idx) => {
            const val = Number(item.value) || 0;
            const pct = Math.min(100, Math.max(0, Math.round((val / maxValue) * 100)));
            const color = item.color || barColor;

            return (
              <div
                key={idx}
                onMouseEnter={(e) => {
                  const rect = containerRef.current?.getBoundingClientRect();
                  const targetRect = e.currentTarget.getBoundingClientRect();
                  setTooltip({
                    active: true,
                    x: (targetRect.left + targetRect.right) / 2 - (rect?.left || 0),
                    y: targetRect.top - (rect?.top || 0),
                    title: item.label,
                    items: [
                      { label: item.valueLabel || "Value", value: `${val}${valueSuffix}`, color },
                      ...(item.secondaryValue !== undefined ? [{ label: item.secondaryLabel || "Secondary", value: item.secondaryValue, color: "var(--purple)" }] : []),
                      ...(item.percentage !== undefined ? [{ label: "Completion", value: `${item.percentage}%`, color: "var(--green)" }] : [])
                    ]
                  });
                }}
                onMouseLeave={() => setTooltip({ active: false, x: 0, y: 0, title: "", items: [] })}
                style={{ cursor: "pointer", transition: "transform 0.15s ease" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "3px", fontSize: "12px" }}>
                  <span style={{ color: "#edf7ff", fontWeight: 600 }}>{item.label}</span>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    {item.sublabel && <small style={{ color: "var(--muted)", fontSize: "11px" }}>{item.sublabel}</small>}
                    {showValues && <b style={{ color: color }}>{val}{valueSuffix}</b>}
                  </div>
                </div>
                <div style={{ height: "8px", background: "rgba(17, 41, 73, 0.7)", borderRadius: "4px", overflow: "hidden", position: "relative" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${pct}%`,
                      background: color,
                      borderRadius: "4px",
                      transition: "width 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
                      boxShadow: `0 0 8px ${color}80`
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Vertical Bar Chart
  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", height: `${height}px`, display: "flex", flexDirection: "column" }}>
      <ChartTooltip {...tooltip} />
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-around", flex: 1, gap: "10px", paddingBottom: "24px", borderBottom: "1px solid var(--line)" }}>
        {data.map((item, idx) => {
          const val = Number(item.value) || 0;
          const pct = Math.min(100, Math.max(4, Math.round((val / maxValue) * 100)));
          const color = item.color || barColor;

          return (
            <div
              key={idx}
              onMouseEnter={(e) => {
                const rect = containerRef.current?.getBoundingClientRect();
                const targetRect = e.currentTarget.getBoundingClientRect();
                setTooltip({
                  active: true,
                  x: (targetRect.left + targetRect.right) / 2 - (rect?.left || 0),
                  y: targetRect.top - (rect?.top || 0),
                  title: item.label,
                  items: [
                    { label: item.valueLabel || "Total", value: `${val}${valueSuffix}`, color },
                    ...(item.secondaryValue !== undefined ? [{ label: item.secondaryLabel || "Secondary", value: item.secondaryValue, color: "var(--purple)" }] : []),
                    ...(item.sublabel ? [{ label: "Context", value: item.sublabel, color: "#fff" }] : [])
                  ]
                });
              }}
              onMouseLeave={() => setTooltip({ active: false, x: 0, y: 0, title: "", items: [] })}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "flex-end",
                height: "100%",
                cursor: "pointer",
                maxWidth: "60px"
              }}
            >
              {showValues && (
                <span style={{ fontSize: "11px", fontWeight: 700, color: color, marginBottom: "4px" }}>
                  {val}{valueSuffix}
                </span>
              )}
              <div
                style={{
                  width: "100%",
                  height: `${pct}%`,
                  background: color,
                  borderRadius: "4px 4px 0 0",
                  transition: "height 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
                  boxShadow: `0 0 10px ${color}60`
                }}
              />
              <span
                style={{
                  position: "absolute",
                  bottom: "4px",
                  fontSize: "11px",
                  color: "var(--muted)",
                  textAlign: "center",
                  maxWidth: "55px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis"
                }}
                title={item.label}
              >
                {item.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// 6. Stacked Bar Chart (Workload Breakdown)
// ============================================================
export function StackedBarChart({
  data = [],
  height = 240,
  emptyMessage = "No team workload distribution records available."
}) {
  const [tooltip, setTooltip] = useState({ active: false, x: 0, y: 0, title: "", items: [] });
  const containerRef = useRef(null);

  if (!data || data.length === 0) {
    return <ChartEmptyState height={height} message={emptyMessage} />;
  }

  // Calculate highest stack total for proportional scaling
  const maxStackTotal = Math.max(
    ...data.map((d) => (d.segments || []).reduce((acc, s) => acc + (Number(s.value) || 0), 0)),
    5
  );

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", display: "flex", flexDirection: "column", gap: "10px" }}>
      <ChartTooltip {...tooltip} />

      {/* Legend */}
      {data[0]?.segments && (
        <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", marginBottom: "4px", fontSize: "11.5px" }}>
          {data[0].segments.map((seg, idx) => (
            <div key={idx} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: seg.color }} />
              <span style={{ color: "var(--muted)" }}>{seg.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {data.map((row, rIdx) => {
          const total = (row.segments || []).reduce((acc, s) => acc + (Number(s.value) || 0), 0);
          const rowPct = Math.min(100, Math.max(6, Math.round((total / maxStackTotal) * 100)));

          return (
            <div
              key={rIdx}
              onMouseEnter={(e) => {
                const rect = containerRef.current?.getBoundingClientRect();
                const targetRect = e.currentTarget.getBoundingClientRect();
                setTooltip({
                  active: true,
                  x: (targetRect.left + targetRect.right) / 2 - (rect?.left || 0),
                  y: targetRect.top - (rect?.top || 0),
                  title: row.label,
                  items: [
                    { label: "Total Tasks", value: total, color: "#fff" },
                    ...(row.segments || []).map((s) => ({
                      label: s.name,
                      value: s.value,
                      color: s.color
                    }))
                  ]
                });
              }}
              onMouseLeave={() => setTooltip({ active: false, x: 0, y: 0, title: "", items: [] })}
              style={{ cursor: "pointer" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "3px", fontSize: "12px" }}>
                <span style={{ color: "#edf7ff", fontWeight: 600 }}>{row.label}</span>
                <span style={{ color: "var(--cyan)", fontWeight: 700, fontSize: "11.5px" }}>{total} tasks</span>
              </div>
              <div style={{ height: "10px", background: "rgba(17, 41, 73, 0.7)", borderRadius: "5px", display: "flex", overflow: "hidden", width: "100%" }}>
                <div style={{ display: "flex", height: "100%", width: `${rowPct}%`, borderRadius: "5px", overflow: "hidden" }}>
                  {(row.segments || []).map((seg, sIdx) => {
                    const segVal = Number(seg.value) || 0;
                    if (segVal === 0) return null;
                    const segWidth = (segVal / Math.max(total, 1)) * 100;
                    return (
                      <div
                        key={sIdx}
                        style={{
                          height: "100%",
                          width: `${segWidth}%`,
                          background: seg.color,
                          transition: "width 0.4s ease"
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// 7. Doughnut Chart
// ============================================================
export function DoughnutChart({
  data = [],
  centerValue,
  centerLabel = "Total",
  size = 150,
  strokeWidth = 18,
  emptyMessage = "No category data available."
}) {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const totalValue = data.reduce((acc, d) => acc + (Number(d.value) || 0), 0);

  if (!data || data.length === 0 || totalValue === 0) {
    return <ChartEmptyState height={size + 40} message={emptyMessage} />;
  }

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  let currentAngle = 0;
  const slices = data.map((d, idx) => {
    const val = Number(d.value) || 0;
    const ratio = totalValue > 0 ? val / totalValue : 0;
    const strokeDasharray = `${ratio * circumference} ${circumference}`;
    const strokeDashoffset = -currentAngle * circumference;
    currentAngle += ratio;
    const percent = Math.round(ratio * 100);

    return {
      ...d,
      ratio,
      strokeDasharray,
      strokeDashoffset,
      percent,
      color: d.color || ["#30dbff", "#3785ff", "#21d8ae", "#ff6eae", "#ffd087"][idx % 5]
    };
  });

  const activeSlice = hoveredIdx !== null ? slices[hoveredIdx] : null;

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-around", gap: "16px", flexWrap: "wrap", padding: "6px 0" }}>
      {/* SVG Doughnut Ring */}
      <div style={{ position: "relative", width: `${size}px`, height: `${size}px`, flexShrink: 0 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
          {/* Base Background Track */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="rgba(17, 41, 73, 0.6)"
            strokeWidth={strokeWidth}
          />
          {/* Segments */}
          {slices.map((slice, idx) => {
            if (slice.value === 0) return null;
            const isHovered = hoveredIdx === idx;
            return (
              <circle
                key={idx}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                strokeDasharray={slice.strokeDasharray}
                strokeDashoffset={slice.strokeDashoffset}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                style={{
                  cursor: "pointer",
                  transition: "stroke-width 0.2s ease, filter 0.2s ease",
                  filter: isHovered ? `drop-shadow(0 0 6px ${slice.color})` : "none"
                }}
              />
            );
          })}
        </svg>

        {/* Center Label */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            textAlign: "center"
          }}
        >
          <span style={{ fontSize: "18px", fontWeight: 800, color: activeSlice ? activeSlice.color : "#ffffff", lineHeight: 1.1 }}>
            {activeSlice ? activeSlice.value : (centerValue !== undefined ? centerValue : totalValue)}
          </span>
          <small style={{ fontSize: "10.5px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginTop: "2px" }}>
            {activeSlice ? `${activeSlice.percent}%` : centerLabel}
          </small>
        </div>
      </div>

      {/* Legend List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "130px", flex: 1 }}>
        {slices.map((slice, idx) => (
          <div
            key={idx}
            onMouseEnter={() => setHoveredIdx(idx)}
            onMouseLeave={() => setHoveredIdx(null)}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "12px",
              padding: "3px 6px",
              borderRadius: "4px",
              background: hoveredIdx === idx ? "rgba(48, 219, 255, 0.1)" : "transparent",
              cursor: "pointer",
              transition: "background 0.15s ease"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: slice.color }} />
              <span style={{ color: "#d2e4f7" }}>{slice.label}</span>
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <b style={{ color: "#ffffff" }}>{slice.value}</b>
              <small style={{ color: "var(--muted)", fontSize: "11px" }}>({slice.percent}%)</small>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// 8. Line Chart (Trends & Planned vs Actual)
// ============================================================
export function LineChart({
  series = [],
  xLabels = [],
  height = 200,
  yAxisSuffix = "%",
  showArea = true,
  emptyMessage = "No historical completion trend records available."
}) {
  const [tooltip, setTooltip] = useState({ active: false, x: 0, y: 0, title: "", items: [] });
  const containerRef = useRef(null);
  const gradientId = useId();

  if (!series || series.length === 0 || !series.some((s) => s.data && s.data.length > 0)) {
    return <ChartEmptyState height={height} message={emptyMessage} />;
  }

  const pointCount = Math.max(...series.map((s) => s.data?.length || 0), xLabels.length, 2);
  const maxY = Math.max(
    100,
    ...series.flatMap((s) => (s.data || []).map((d) => (typeof d === "number" ? d : d.y || 0)))
  );

  const paddingLeft = 32;
  const paddingRight = 16;
  const paddingTop = 16;
  const paddingBottom = 26;
  const chartWidth = 500;
  const chartHeight = height;

  const innerWidth = chartWidth - paddingLeft - paddingRight;
  const innerHeight = chartHeight - paddingTop - paddingBottom;

  // Grid lines (0, 25, 50, 75, 100)
  const gridTicks = [0, 25, 50, 75, 100];

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", height: `${height}px` }}>
      <ChartTooltip {...tooltip} />

      {/* Series Legend */}
      {series.length > 1 && (
        <div style={{ display: "flex", gap: "14px", justifyContent: "flex-end", marginBottom: "6px", fontSize: "11px" }}>
          {series.map((s, idx) => (
            <div key={idx} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <span style={{ width: "10px", height: "3px", background: s.color, borderRadius: "2px" }} />
              <span style={{ color: "var(--muted)" }}>{s.name}</span>
            </div>
          ))}
        </div>
      )}

      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        style={{ width: "100%", height: "100%", overflow: "visible" }}
      >
        <defs>
          {series.map((s, sIdx) => (
            <linearGradient key={sIdx} id={`${gradientId}-${sIdx}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.32" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0.0" />
            </linearGradient>
          ))}
        </defs>

        {/* Horizontal Grid lines */}
        {gridTicks.map((tick) => {
          const y = paddingTop + innerHeight - (tick / maxY) * innerHeight;
          return (
            <g key={tick}>
              <line
                x1={paddingLeft}
                y1={y}
                x2={paddingLeft + innerWidth}
                y2={y}
                stroke="rgba(41, 184, 255, 0.12)"
                strokeDasharray="4 4"
              />
              <text
                x={paddingLeft - 6}
                y={y + 3}
                fill="#7294b8"
                fontSize="9"
                textAnchor="end"
              >
                {tick}{yAxisSuffix}
              </text>
            </g>
          );
        })}

        {/* Series Paths */}
        {series.map((s, sIdx) => {
          const rawData = s.data || [];
          if (rawData.length === 0) return null;

          const points = rawData.map((d, idx) => {
            const val = typeof d === "number" ? d : d.y || 0;
            const x = paddingLeft + (idx / Math.max(rawData.length - 1, 1)) * innerWidth;
            const y = paddingTop + innerHeight - (val / maxY) * innerHeight;
            return { x, y, val, label: xLabels[idx] || (typeof d === "object" ? d.x : `P${idx + 1}`) };
          });

          const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
          const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${(paddingTop + innerHeight).toFixed(1)} L ${points[0].x.toFixed(1)} ${(paddingTop + innerHeight).toFixed(1)} Z`;

          return (
            <g key={sIdx}>
              {showArea && (
                <path d={areaD} fill={`url(#${gradientId}-${sIdx})`} />
              )}
              <path
                d={pathD}
                fill="none"
                stroke={s.color}
                strokeWidth={s.strokeWidth || 2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={s.dashed ? "5 4" : "none"}
                style={{ filter: `drop-shadow(0 0 6px ${s.color}60)` }}
              />

              {/* Data Points */}
              {points.map((p, pIdx) => (
                <circle
                  key={pIdx}
                  cx={p.x}
                  cy={p.y}
                  r="4"
                  fill="#030b18"
                  stroke={s.color}
                  strokeWidth="2"
                  onMouseEnter={(e) => {
                    const rect = containerRef.current?.getBoundingClientRect();
                    const targetRect = e.currentTarget.getBoundingClientRect();
                    setTooltip({
                      active: true,
                      x: (targetRect.left + targetRect.right) / 2 - (rect?.left || 0),
                      y: targetRect.top - (rect?.top || 0),
                      title: p.label,
                      items: [{ label: s.name || "Progress", value: `${p.val}${yAxisSuffix}`, color: s.color }]
                    });
                  }}
                  onMouseLeave={() => setTooltip({ active: false, x: 0, y: 0, title: "", items: [] })}
                  style={{ cursor: "pointer", transition: "r 0.15s ease" }}
                />
              ))}
            </g>
          );
        })}

        {/* X-Axis Labels */}
        {xLabels.map((lbl, idx) => {
          const x = paddingLeft + (idx / Math.max(xLabels.length - 1, 1)) * innerWidth;
          return (
            <text
              key={idx}
              x={x}
              y={chartHeight - 4}
              fill="#82a4c6"
              fontSize="9.5"
              textAnchor="middle"
            >
              {lbl}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ============================================================
// 9. Timeline & Gantt Chart Visualization
// ============================================================
export function TimelineChart({
  items = [],
  height = 200,
  emptyMessage = "No delivery schedule timeline available."
}) {
  if (!items || items.length === 0) {
    return <ChartEmptyState height={height} message={emptyMessage} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%", padding: "4px 0" }}>
      {items.map((item, idx) => {
        const progress = Math.min(100, Math.max(0, Number(item.progress) || 0));
        const statusTone = item.status === "completed" ? "low" : item.isOverdue ? "critical" : "in-progress";

        return (
          <div
            key={idx}
            style={{
              padding: "10px 12px",
              borderRadius: "8px",
              background: "rgba(6, 22, 48, 0.6)",
              border: "1px solid var(--line)"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "11px", color: "var(--cyan)", fontWeight: 700 }}>
                  Phase {idx + 1}
                </span>
                <b style={{ color: "#ffffff", fontSize: "13px" }}>{item.title}</b>
              </div>
              <span className={`tag ${statusTone}`} style={{ fontSize: "11px", padding: "1px 7px" }}>
                {item.status || "Scheduled"}
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px", color: "var(--muted)", marginBottom: "6px" }}>
              <span>Target: {item.dueDate ? new Date(item.dueDate).toLocaleDateString() : (item.date || "Scheduled")}</span>
              <b style={{ color: "var(--cyan)" }}>{progress}% Complete</b>
            </div>

            <div style={{ height: "6px", background: "rgba(17, 41, 73, 0.7)", borderRadius: "3px", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${progress}%`,
                  background: item.status === "completed" ? "#21d8ae" : "linear-gradient(90deg, #30dbff, #3785ff)",
                  borderRadius: "3px",
                  boxShadow: "0 0 8px rgba(48, 219, 255, 0.4)"
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// 10. Progress Chart
// ============================================================
export function ProgressChart({
  items = [],
  height = 200,
  emptyMessage = "No progress records available."
}) {
  if (!items || items.length === 0) {
    return <ChartEmptyState height={height} message={emptyMessage} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%" }}>
      {items.map((item, idx) => {
        const pct = Math.min(100, Math.max(0, Math.round(Number(item.percentage ?? item.progress) || 0)));
        const color = item.color || (pct >= 100 ? "#21d8ae" : pct >= 50 ? "#30dbff" : "#fbb76d");

        return (
          <div key={idx} style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px" }}>
              <span style={{ color: "#edf7ff", fontWeight: 600 }}>{item.label || item.title}</span>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                {item.sublabel && <small style={{ color: "var(--muted)", fontSize: "11px" }}>{item.sublabel}</small>}
                <b style={{ color }}>{pct}%</b>
              </div>
            </div>
            <div style={{ height: "7px", background: "rgba(17, 41, 73, 0.7)", borderRadius: "4px", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${pct}%`,
                  background: color,
                  borderRadius: "4px",
                  transition: "width 0.5s ease",
                  boxShadow: `0 0 6px ${color}80`
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
