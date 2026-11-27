import { Router } from 'express';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import * as c from '../controllers/controllers.js';
import { authenticate, authorizeRoles } from '../middleware/auth.js';

const authLimiter = rateLimit({
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 10),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many authentication attempts, please try again later' }
});

const registerLimiter = rateLimit({
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.REGISTER_RATE_LIMIT_MAX || 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many registration attempts, please try again later' }
});

const router = Router(); const safe = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'NEXORA AI Backend API is active and running',
    version: '1.0.0',
    endpoints: {
      health: '/api/v1/health',
      auth: '/api/v1/auth/login',
      dashboards: '/api/v1/dashboard/:role'
    },
    frontendApp: 'http://localhost:3000'
  });
});
router.get('/health', async (req, res) => {
  const isConnected = mongoose.connection.readyState === 1;
  let dbLatencyMs = null;
  let dbStatus = isConnected ? 'connected' : 'disconnected';

  if (isConnected && mongoose.connection.db) {
    try {
      const start = process.hrtime.bigint();
      await mongoose.connection.db.admin().ping();
      const end = process.hrtime.bigint();
      dbLatencyMs = Number(end - start) / 1e6;
    } catch {
      dbStatus = 'error';
    }
  }

  const healthy = isConnected && dbStatus === 'connected';
  const httpStatus = healthy ? 200 : 503;

  return res.status(httpStatus).json({
    success: healthy,
    status: healthy ? 'healthy' : 'unhealthy',
    database: {
      status: dbStatus,
      readyState: mongoose.connection.readyState,
      latencyMs: dbLatencyMs !== null ? Math.round(dbLatencyMs * 100) / 100 : null,
    },
    system: {
      uptime: Math.round(process.uptime()),
      memory: {
        heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100,
        heapTotalMB: Math.round(process.memoryUsage().heapTotal / 1024 / 1024 * 100) / 100,
        rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024 * 100) / 100,
      },
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development',
    },
    message: healthy ? 'NEXORA AI API is running' : 'Database connection unavailable or degraded',
    correlationId: req.correlationId || null,
    timestamp: new Date().toISOString(),
  });
});
router.post('/auth/register', registerLimiter, safe(c.register)); router.post('/auth/login', authLimiter, safe(c.login)); router.post('/auth/logout', authenticate, c.logout); router.get('/auth/me', authenticate, c.me);
router.get('/projects', authenticate, safe(c.listProjects)); router.post('/projects', authenticate, authorizeRoles('admin', 'project_manager'), safe(c.createProject)); router.get('/projects/:projectId', authenticate, safe(c.getProject)); router.patch('/projects/:projectId', authenticate, safe(c.updateProject)); router.delete('/projects/:projectId', authenticate, safe(c.deleteProject)); router.post('/projects/:projectId/members', authenticate, safe(c.addProjectMember)); router.delete('/projects/:projectId/members/:memberId', authenticate, safe(c.removeProjectMember)); router.post('/projects/:projectId/employees', authenticate, authorizeRoles('admin', 'project_manager'), safe(c.createEmployee));
router.get('/tasks', authenticate, safe(c.listTasks)); router.post('/tasks', authenticate, safe(c.createTask)); router.get('/tasks/:taskId', authenticate, safe(c.getTask)); router.get('/tasks/:taskId/analyze', authenticate, safe(c.taskAnalysis)); router.patch('/tasks/:taskId', authenticate, safe(c.updateTask)); router.put('/tasks/:taskId', authenticate, safe(c.updateTask)); router.delete('/tasks/:taskId', authenticate, safe(c.deleteTask)); router.patch('/tasks/:taskId/progress', authenticate, safe(c.updateTaskProgress)); router.put('/tasks/:taskId/progress', authenticate, safe(c.updateTaskProgress)); router.patch('/tasks/:taskId/status', authenticate, safe(c.updateTaskStatus)); router.put('/tasks/:taskId/status', authenticate, safe(c.updateTaskStatus)); router.patch('/tasks/:taskId/assign', authenticate, safe(c.assignTask));
router.get('/milestones', authenticate, safe(c.listMilestones)); router.post('/milestones', authenticate, safe(c.createMilestone)); router.patch('/milestones/:milestoneId', authenticate, safe(c.updateMilestone));
router.get('/dashboard/:role', authenticate, safe(c.dashboard)); router.get('/projects/:projectId/workload', authenticate, safe(c.workload)); router.get('/projects/:projectId/analytics', authenticate, safe(c.analytics)); router.get('/projects/:projectId/resource-recommendations', authenticate, safe(c.recommendations)); router.post('/tasks/:taskId/recommend-replacement', authenticate, safe(c.recommendReplacement)); router.post('/tasks/:taskId/reassign', authenticate, safe(c.reassignTask));
router.get('/members/:memberId/availability', authenticate, safe(c.getAvailability)); router.patch('/members/:memberId/availability', authenticate, safe(c.updateAvailability)); router.get('/users', authenticate, safe(c.listUsers)); router.get('/users/:userId', authenticate, safe(c.getUser)); router.patch('/users/:userId', authenticate, safe(c.updateUser)); router.delete('/users/:userId', authenticate, safe(c.deleteUser));

// Employee Management Module
router.get('/employees', authenticate, safe(c.listEmployeesHandler));
router.post('/employees', authenticate, authorizeRoles('admin', 'project_manager'), safe(c.createEmployeeHandler));
router.get('/employees/:employeeId', authenticate, safe(c.getEmployeeDetailsHandler));
router.patch('/employees/:employeeId', authenticate, authorizeRoles('admin', 'project_manager'), safe(c.updateEmployeeHandler));
router.put('/employees/:employeeId', authenticate, authorizeRoles('admin', 'project_manager'), safe(c.updateEmployeeHandler));
router.post('/employees/:employeeId/deactivate', authenticate, authorizeRoles('admin', 'project_manager'), safe(c.deactivateEmployeeHandler));
router.post('/employees/:employeeId/restore', authenticate, authorizeRoles('admin', 'project_manager'), safe(c.restoreEmployeeHandler));
router.post('/employees/:employeeId/projects', authenticate, authorizeRoles('admin', 'project_manager'), safe(c.assignEmployeeProjectHandler));
router.delete('/employees/:employeeId/projects/:projectId', authenticate, authorizeRoles('admin', 'project_manager'), safe(c.removeEmployeeProjectHandler));
router.get('/search', authenticate, safe(c.search)); router.get('/calendar', authenticate, safe(c.calendar)); router.get('/analytics', authenticate, safe(c.globalAnalytics)); router.get('/updates', authenticate, safe(c.listUpdates));
router.get('/notifications', authenticate, safe(c.notifications)); router.patch('/notifications/read-all', authenticate, safe(c.markAllNotificationsRead)); router.patch('/notifications/:notificationId/read', authenticate, safe(c.markNotificationRead)); router.patch('/recommendations/:recommendationId/reject', authenticate, safe(c.rejectRecommendation));
router.get('/ai/predictive-delays/:projectId', authenticate, safe(c.predictiveTaskDelays));
router.get('/ai/workload-rebalance/:projectId', authenticate, safe(c.workloadRebalance));
router.get('/ai/bottlenecks/:projectId', authenticate, safe(c.projectBottlenecks));
router.get('/ai/assistant/:projectId', authenticate, safe(c.projectAIAssistant));
router.get('/ai/project-delay/:projectId', authenticate, safe(c.projectDelayPrediction));
router.get('/analytics/sprint-intelligence/:projectId', authenticate, safe(c.sprintIntelligenceHandler));
router.get('/analytics/personal-intelligence', authenticate, safe(c.personalIntelligenceHandler));
router.get('/analytics/client-intelligence/:projectId', authenticate, safe(c.clientDeliveryIntelligenceHandler));
router.post('/ai/recommendations/:recommendationId/approve', authenticate, safe(c.approveAIRecommendationHandler));
router.post('/ai/recommendations/:recommendationId/dismiss', authenticate, safe(c.dismissAIRecommendationHandler));
router.get('/projects/:projectId/timeline', authenticate, safe(c.getTimeline));
router.patch('/tasks/:taskId/schedule', authenticate, safe(c.updateTaskScheduleHandler));
router.post('/tasks/:taskId/dependencies', authenticate, safe(c.addDependency));
router.delete('/tasks/:taskId/dependencies/:depTaskId', authenticate, safe(c.removeDependency));

router.get('/tasks/:taskId/comments', authenticate, safe(c.getTaskCommentsHandler));
router.post('/tasks/:taskId/comments', authenticate, safe(c.createCommentHandler));
router.patch('/comments/:commentId', authenticate, safe(c.updateCommentHandler));
router.delete('/comments/:commentId', authenticate, safe(c.deleteCommentHandler));

router.get('/projects/:projectId/attachments', authenticate, safe(c.listAttachmentsHandler));
router.get('/tasks/:taskId/attachments', authenticate, safe(c.listTaskAttachmentsHandler));
router.post('/projects/:projectId/attachments', authenticate, safe(c.uploadAttachmentHandler));
router.get('/attachments/:attachmentId/download', authenticate, safe(c.downloadAttachmentHandler));
router.delete('/attachments/:attachmentId', authenticate, safe(c.deleteAttachmentHandler));

router.get('/projects/:projectId/advanced-analytics', authenticate, safe(c.getAdvancedAnalyticsHandler));
router.get('/analytics/comparison', authenticate, safe(c.getComparisonAnalyticsHandler));
router.get('/projects/:projectId/reports/pdf', authenticate, safe(c.exportProjectPDFReportHandler));
router.get('/projects/:projectId/reports/excel', authenticate, safe(c.exportProjectExcelReportHandler));


// Discussions & Team Collaboration
router.get('/projects/:projectId/discussions', authenticate, safe(c.getProjectDiscussionsHandler));
router.post('/projects/:projectId/discussions', authenticate, safe(c.createProjectDiscussionHandler));
router.post('/comments/:commentId/reactions', authenticate, safe(c.toggleCommentReactionHandler));
router.patch('/comments/:commentId/pin', authenticate, safe(c.toggleCommentPinHandler));
router.get('/projects/:projectId/mentionable-users', authenticate, safe(c.getMentionableUsersHandler));

// Documents & File Management
router.post('/attachments/:attachmentId/versions', authenticate, safe(c.uploadAttachmentVersionHandler));
router.patch('/attachments/:attachmentId/status', authenticate, safe(c.updateAttachmentReviewHandler));
router.patch('/attachments/:attachmentId', authenticate, safe(c.updateAttachmentMetadataHandler));
router.get('/attachments/:attachmentId/preview', authenticate, safe(c.previewAttachmentHandler));

// Notifications Center
router.get('/notifications/unread-count', authenticate, safe(c.getNotificationUnreadStatsHandler));
router.delete('/notifications/:notificationId', authenticate, safe(c.dismissNotificationHandler));
router.patch('/notifications/preferences', authenticate, safe(c.updateNotificationPreferencesHandler));

// Enterprise SaaS: Sessions, Audit, Baseline & Resource Allocation
router.get('/auth/sessions', authenticate, safe(c.getActiveSessionsHandler));
router.post('/auth/revoke-sessions', authenticate, safe(c.revokeSessionsHandler));
router.get('/audit-logs', authenticate, authorizeRoles('admin', 'project_manager'), safe(c.getAuditLogsHandler));
router.patch('/users/me/availability', authenticate, safe(c.updateMyAvailabilityHandler));
router.put('/users/me/availability', authenticate, safe(c.updateMyAvailabilityHandler));
router.get('/projects/:projectId/baseline', authenticate, safe(c.getProjectBaselineHandler));
router.post('/projects/:projectId/baseline', authenticate, authorizeRoles('admin', 'project_manager'), safe(c.setProjectBaselineHandler));
router.get('/resources/allocation-overview', authenticate, authorizeRoles('admin', 'project_manager', 'team_lead', 'team_member'), safe(c.getResourceAllocationOverviewHandler));

// Unified Activity Timeline (Role-Scoped)
router.get('/activity', authenticate, safe(c.getActivityTimelineHandler));

// Productivity: Project Templates & Task Recurrence
router.get('/project-templates', authenticate, safe(c.listProjectTemplatesHandler));
router.post('/projects/:projectId/template', authenticate, authorizeRoles('admin', 'project_manager'), safe(c.saveProjectAsTemplateHandler));
router.post('/projects/from-template', authenticate, authorizeRoles('admin', 'project_manager'), safe(c.createProjectFromTemplateHandler));
router.patch('/tasks/:taskId/recurrence', authenticate, safe(c.updateTaskRecurrenceHandler));

// CSV Import & Export Automation
router.get('/projects/:projectId/tasks/export-csv', authenticate, safe(c.exportTasksCsvHandler));
router.post('/projects/:projectId/tasks/import-preview', authenticate, safe(c.importTasksCsvPreviewHandler));
router.post('/projects/:projectId/tasks/import-commit', authenticate, safe(c.importTasksCsvCommitHandler));

export default router;
