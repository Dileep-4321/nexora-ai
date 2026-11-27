export function getApiBaseUrl() {
  const configured =
    process.env.NEXT_PUBLIC_NEXORA_API_URL ||
    process.env.NEXT_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "NEXT_PUBLIC_NEXORA_API_URL is required in production but was not configured."
    );
  }
  return "http://localhost:5001/api/v1";
}

const REQUEST_TIMEOUT_MS = 15000;

function expireSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("nexora_token");
  localStorage.removeItem("nexora_user");
  window.dispatchEvent(new Event("nexora:session-expired"));
}

export async function apiRequest(path, options = {}) {
  const baseUrl = getApiBaseUrl();
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("nexora_token")
      : null;

  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401) expireSession();
      throw new Error(data.message || "Request failed");
    }

    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("The NEXORA API did not respond in time.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function registerUser(payload) {
  const response = await apiRequest("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!response.success || !response.data?.user || !response.data?.token) {
    throw new Error(response.message || "Registration response was incomplete.");
  }

  return response.data;
}

export async function loginUser(emailOrPayload, maybePassword) {
  const email =
    typeof emailOrPayload === "object" && emailOrPayload !== null
      ? emailOrPayload.email
      : emailOrPayload;
  const password =
    typeof emailOrPayload === "object" && emailOrPayload !== null
      ? emailOrPayload.password
      : maybePassword;

  const response = await apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
    }),
  });

  if (!response.success || !response.data?.user || !response.data?.token) {
    throw new Error(response.message || "Login response was incomplete.");
  }

  return response.data;
}

export async function getCurrentUser() {
  const response = await apiRequest("/auth/me");

  if (!response.success || !response.data?.user) {
    throw new Error("User session response was incomplete.");
  }

  return response.data;
}

export async function analyzeTask(taskId) {
  const response = await apiRequest(`/tasks/${taskId}/analyze`);
  return response.data;
}

export async function addProjectMember(projectId, memberData) {
  const response = await apiRequest(`/projects/${projectId}/members`, {
    method: "POST",
    body: JSON.stringify(memberData)
  });
  return response.data;
}

export async function removeProjectMember(projectId, memberId) {
  const response = await apiRequest(`/projects/${projectId}/members/${memberId}`, {
    method: "DELETE"
  });
  return response.data;
}

export async function createEmployeeAccount(projectId, employeeData) {
  const response = await apiRequest(`/projects/${projectId}/employees`, {
    method: "POST",
    body: JSON.stringify(employeeData)
  });
  return response.data;
}

// ==========================================
// EMPLOYEE MANAGEMENT MODULE APIS
// ==========================================

export async function listEmployees(params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.role) query.set("role", params.role);
  if (params.department) query.set("department", params.department);
  if (params.projectId) query.set("projectId", params.projectId);
  if (params.status) query.set("status", params.status);
  if (params.sort) query.set("sort", params.sort);
  const qs = query.toString() ? `?${query.toString()}` : "";
  const response = await apiRequest(`/employees${qs}`);
  return response.data || { items: [] };
}

export async function getEmployeeDetails(employeeId) {
  const response = await apiRequest(`/employees/${employeeId}`);
  return response.data;
}

export async function createEmployee(employeeData) {
  const response = await apiRequest("/employees", {
    method: "POST",
    body: JSON.stringify(employeeData)
  });
  return response.data;
}

export async function updateEmployee(employeeId, employeeData) {
  const response = await apiRequest(`/employees/${employeeId}`, {
    method: "PATCH",
    body: JSON.stringify(employeeData)
  });
  return response.data;
}

export async function deactivateEmployee(employeeId, { reason, reassignTasksTo, force } = {}) {
  const response = await apiRequest(`/employees/${employeeId}/deactivate`, {
    method: "POST",
    body: JSON.stringify({ reason, reassignTasksTo, force })
  });
  return response.data;
}

export async function restoreEmployee(employeeId) {
  const response = await apiRequest(`/employees/${employeeId}/restore`, {
    method: "POST"
  });
  return response.data;
}

export async function assignEmployeeProject(employeeId, projectId) {
  const response = await apiRequest(`/employees/${employeeId}/projects`, {
    method: "POST",
    body: JSON.stringify({ projectId })
  });
  return response.data;
}

export async function removeEmployeeProject(employeeId, projectId, { reassignTasksTo, force } = {}) {
  const response = await apiRequest(`/employees/${employeeId}/projects/${projectId}`, {
    method: "DELETE",
    body: JSON.stringify({ reassignTasksTo, force })
  });
  return response.data;
}

export async function deleteOrDeactivateUser(userId, { mode = "deactivate", force = false } = {}) {
  const params = new URLSearchParams();
  if (mode) params.set("mode", mode);
  if (force) params.set("force", "true");
  const qs = params.toString() ? `?${params.toString()}` : "";
  const response = await apiRequest(`/users/${userId}${qs}`, {
    method: "DELETE"
  });
  return response.data;
}

export async function listAllUsers() {
  const response = await apiRequest("/users");
  return response.data?.items || [];
}

export async function getAnalytics(projectId = "") {
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
  const response = await apiRequest(`/analytics${query}`);
  return response.data;
}

export async function downloadAttachmentFile(attachmentId, filename) {
  const baseUrl = getApiBaseUrl();
  const token = typeof window !== "undefined" ? localStorage.getItem("nexora_token") : null;
  const res = await fetch(`${baseUrl}/attachments/${attachmentId}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || "Download failed");
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "attachment";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export async function downloadProjectPDFReport(projectId, filename, { startDate, endDate } = {}) {
  const baseUrl = getApiBaseUrl();
  const token = typeof window !== "undefined" ? localStorage.getItem("nexora_token") : null;
  const params = new URLSearchParams();
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const res = await fetch(`${baseUrl}/projects/${projectId}/reports/pdf${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || "PDF generation failed");
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || `NEXORA_Report_${projectId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export async function downloadProjectExcelReport(projectId, filename, { startDate, endDate } = {}) {
  const baseUrl = getApiBaseUrl();
  const token = typeof window !== "undefined" ? localStorage.getItem("nexora_token") : null;
  const params = new URLSearchParams();
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const res = await fetch(`${baseUrl}/projects/${projectId}/reports/excel${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || "Excel generation failed");
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || `NEXORA_Report_${projectId}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export async function getAdvancedProjectAnalytics(projectId, { startDate, endDate } = {}) {
  const params = new URLSearchParams();
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const res = await apiRequest(`/projects/${projectId}/advanced-analytics${qs}`);
  return res.data;
}

export async function getComparisonAnalytics({ startDate, endDate } = {}) {
  const params = new URLSearchParams();
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const res = await apiRequest(`/analytics/comparison${qs}`);
  return res.data;
}

export async function getSystemHealth() {
  const baseUrl = getApiBaseUrl();
  const token = typeof window !== "undefined" ? localStorage.getItem("nexora_token") : null;
  const res = await fetch(`${baseUrl}/health`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!res.ok) {
    throw new Error(`Health check returned status ${res.status}`);
  }
  return res.json();
}

export async function globalSearch(q) {
  if (!q || !q.trim()) return { projects: [], tasks: [], members: [] };
  const res = await apiRequest(`/search?q=${encodeURIComponent(q.trim())}`);
  return res.data || { projects: [], tasks: [], members: [] };
}

export async function markAllNotificationsAsRead() {
  const res = await apiRequest("/notifications/read-all", {
    method: "PATCH"
  });
  return res.data;
}

export async function markNotificationAsRead(notificationId) {
  const res = await apiRequest(`/notifications/${notificationId}/read`, {
    method: "PATCH"
  });
  return res.data;
}

export async function getProjectDelayPrediction(projectId) {
  const res = await apiRequest(`/ai/project-delay/${projectId}`);
  return res.data;
}

export async function getSprintIntelligence(projectId) {
  const res = await apiRequest(`/analytics/sprint-intelligence/${projectId}`);
  return res.data;
}

export async function getPersonalIntelligence(userId) {
  const qs = userId ? `?userId=${userId}` : "";
  const res = await apiRequest(`/analytics/personal-intelligence${qs}`);
  return res.data;
}

export async function getClientDeliveryIntelligence(projectId) {
  const res = await apiRequest(`/analytics/client-intelligence/${projectId}`);
  return res.data;
}

export async function approveAIRecommendation(recommendationId) {
  const res = await apiRequest(`/ai/recommendations/${recommendationId}/approve`, {
    method: "POST"
  });
  return res.data;
}

export async function dismissAIRecommendation(recommendationId, reason) {
  const res = await apiRequest(`/ai/recommendations/${recommendationId}/dismiss`, {
    method: "POST",
    body: JSON.stringify({ reason })
  });
  return res.data;
}

// ==========================================
// ENTERPRISE SAAS MODULES 2, 3 & 6 APIS
// ==========================================

export async function getActiveSessions() {
  const res = await apiRequest("/auth/sessions");
  return res.data;
}

export async function revokeSessions() {
  const res = await apiRequest("/auth/revoke-sessions", {
    method: "POST"
  });
  if (res.data?.token) {
    if (typeof window !== "undefined") {
      localStorage.setItem("nexora_token", res.data.token);
    }
  }
  return res.data;
}

export async function getAuditLogs(params = {}) {
  const query = new URLSearchParams();
  if (params.action) query.set("action", params.action);
  if (params.actor) query.set("actor", params.actor);
  if (params.entityType) query.set("entityType", params.entityType);
  if (params.startDate) query.set("startDate", params.startDate);
  if (params.endDate) query.set("endDate", params.endDate);
  if (params.page) query.set("page", params.page);
  if (params.limit) query.set("limit", params.limit);
  const qs = query.toString() ? `?${query.toString()}` : "";
  const res = await apiRequest(`/audit-logs${qs}`);
  return res.data;
}

export async function updateMyAvailability(payload) {
  const res = await apiRequest("/users/me/availability", {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  return res.data;
}

export async function getProjectBaseline(projectId) {
  const res = await apiRequest(`/projects/${projectId}/baseline`);
  return res.data;
}

export async function setProjectBaseline(projectId, payload = {}) {
  const res = await apiRequest(`/projects/${projectId}/baseline`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return res.data;
}

export async function getResourceAllocationOverview(projectId) {
  const qs = projectId ? `?projectId=${projectId}` : "";
  const res = await apiRequest(`/resources/allocation-overview${qs}`);
  return res.data;
}

export async function getActivityTimeline(params = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set("page", params.page);
  if (params.limit) query.set("limit", params.limit);
  if (params.projectId) query.set("projectId", params.projectId);
  if (params.action) query.set("action", params.action);
  if (params.startDate) query.set("startDate", params.startDate);
  if (params.endDate) query.set("endDate", params.endDate);
  const qs = query.toString() ? `?${query.toString()}` : "";
  const res = await apiRequest(`/activity${qs}`);
  return res.data || { items: [], pagination: { total: 0 } };
}

export async function listProjectTemplates() {
  const res = await apiRequest("/project-templates");
  return res.data?.items || [];
}

export async function saveProjectAsTemplate(projectId, category = "General") {
  const res = await apiRequest(`/projects/${projectId}/template`, {
    method: "POST",
    body: JSON.stringify({ category })
  });
  return res.data;
}

export async function createProjectFromTemplate(payload) {
  const res = await apiRequest("/projects/from-template", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return res.data;
}

export async function updateTaskRecurrence(taskId, payload) {
  const res = await apiRequest(`/tasks/${taskId}/recurrence`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  return res.data;
}

export async function downloadTasksCsv(projectId, projectName = "project") {
  const token = typeof window !== "undefined" ? localStorage.getItem("nexora_token") : null;
  const url = `${getApiBaseUrl()}/projects/${projectId}/tasks/export-csv`;
  const res = await fetch(url, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  });
  if (!res.ok) throw new Error("Failed to export tasks CSV");
  const blob = await res.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = `${projectName.toLowerCase().replace(/[^a-z0-9]/g, "-")}-tasks.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(blobUrl);
}

export async function importTasksCsvPreview(projectId, rows) {
  const res = await apiRequest(`/projects/${projectId}/tasks/import-preview`, {
    method: "POST",
    body: JSON.stringify({ projectId, rows })
  });
  return res.data;
}

export async function importTasksCsvCommit(projectId, tasks) {
  const res = await apiRequest(`/projects/${projectId}/tasks/import-commit`, {
    method: "POST",
    body: JSON.stringify({ projectId, tasks })
  });
  return res.data;
}

export async function updateNotificationPreferences(preferences) {
  const res = await apiRequest("/notifications/preferences", {
    method: "PATCH",
    body: JSON.stringify(preferences)
  });
  return res.data;
}



