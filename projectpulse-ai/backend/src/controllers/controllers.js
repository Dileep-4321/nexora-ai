import jwt from 'jsonwebtoken';
import fs from 'fs';
import { User, Project, Task, Milestone, ProjectUpdate, Notification, ActivityLog, MemberAvailability, TaskAssignmentHistory, ResourceRecommendation, ProjectRiskSnapshot, MemberSkill, Comment, Attachment, roles, availability } from '../models/index.js';
import { calculateProjectMetrics, projectWorkload, performanceFor, saveRecommendation, recommendationFor, analyzeTask } from '../services/metrics.js';
import { emitTaskUpdated, emitTaskAssigned, emitProjectProgressUpdated, emitMilestoneUpdated, emitNotification, emitActivity, emitWorkloadUpdated, emitMemberAdded, emitMemberRemoved, emitUserUpdated, emitUserDeactivated } from '../services/realtime.js';
import { predictTaskDelays, calculateWorkloadRebalance, detectProjectBottlenecks, getProjectAIAssistant, predictProjectDelay, getSprintIntelligence, getPersonalIntelligence, getClientDeliveryIntelligence, approveAIRecommendation, dismissAIRecommendation } from '../services/ai-advanced.js';
import { getProjectTimeline, updateTaskSchedule } from '../services/timeline.js';
import { createComment, getTaskComments, updateComment, deleteComment, saveAttachment, getAttachments, getAttachmentForDownload, deleteAttachment, getProjectDiscussions, toggleCommentReaction, toggleCommentPin, getMentionableUsers, saveAttachmentVersion, updateAttachmentReview, updateAttachmentMetadata, getAttachmentForPreview, getUserNotifications, getNotificationUnreadStats, dismissNotification, updateNotificationPreferences } from '../services/collaboration.js';
import { getProjectAdvancedAnalytics, getWorkspaceComparisonAnalytics } from '../services/analytics.js';
import { generateProjectPDFReport, generateProjectExcelReport } from '../services/reporting.js';
import { cache } from '../services/cache.js';
const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
const isId = (id) => /^[a-f\d]{24}$/i.test(id);
const manageRoles = ['admin', 'project_manager', 'team_lead'];
function requireId(id) { if (!isId(id)) throw Object.assign(new Error('Invalid resource identifier'), { status: 400 }); }
const memberId = (value) => value?._id || value;
function canAccessProject(user, project) { return user.role === 'admin' || [project.owner, project.projectManager, project.teamLead, project.client, ...(project.teamMembers || [])].filter(Boolean).map(memberId).map(String).includes(String(user._id)); }
async function loadProject(id) { requireId(id); const project = await Project.findById(id); if (!project) throw Object.assign(new Error('Project not found'), { status: 404 }); return project; }
async function audit(actor, action, entityType, entityId, metadata = {}) {
  const log = await ActivityLog.create({ actor, action, entityType, entityId, metadata });
  try {
    const projectId = metadata?.project || (entityType === 'Project' ? entityId : null);
    if (projectId) emitActivity(log, projectId);
  } catch {}
  return log;
}
function projectMemberIds(projects) { return [...new Set(projects.flatMap((project) => [project.owner, project.projectManager, project.teamLead, ...project.teamMembers].filter(Boolean).map(String)))]; }
async function canAccessMember(user, memberId) { if (String(user._id) === String(memberId) || user.role === 'admin') return true; const projects = (await Project.find()).filter((project) => canAccessProject(user, project)); return projectMemberIds(projects).includes(String(memberId)); }

export async function register(req, res) {
  const { name, email, password, role = 'team_member', jobTitle = '', department = 'Engineering', skills = [] } = req.body;
  if (!name || !email || !password || password.length < 8) {
    throw Object.assign(new Error('Name, valid email, and an 8+ character password are required'), { status: 400 });
  }
  const allowedRoles = ['admin', 'project_manager', 'team_lead', 'team_member', 'client'];
  if (!allowedRoles.includes(role) || role === 'project_owner') {
    throw Object.assign(new Error('Invalid role specified. Supported roles: admin, project_manager, team_lead, team_member, client'), { status: 400 });
  }
  if (await User.exists({ email: email.toLowerCase() })) {
    throw Object.assign(new Error('Email is already registered'), { status: 409 });
  }
  const parsedSkills = Array.isArray(skills)
    ? skills.map((s) => String(s).trim()).filter(Boolean)
    : typeof skills === 'string'
    ? skills.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  const defaultJobTitle = role === 'project_manager' ? 'Project Manager' : role === 'team_lead' ? 'Technical Lead' : role === 'client' ? 'Product Sponsor' : 'Software Engineer';
  const user = await User.create({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    password,
    role,
    jobTitle: jobTitle.trim() || defaultJobTitle,
    department: department.trim() || 'Engineering',
    skills: parsedSkills,
    workloadCapacity: role === 'client' ? 1 : 40
  });
  if (parsedSkills.length) {
    for (const skillName of parsedSkills) {
      await MemberSkill.create({
        member: user._id,
        skillName,
        proficiency: 'intermediate',
        experienceYears: 1
      });
    }
  }
  await audit(user._id, 'user_registered', 'User', user._id, { role });
  ok(res, { user: sanitize(user), token: tokenFor(user) }, 201);
}
export async function login(req, res) {
  const { email, password } = req.body;
  const resolvedEmail = typeof email === 'string' ? email : (typeof email?.email === 'string' ? email.email : '');
  const resolvedPassword = typeof password === 'string' ? password : (typeof email?.password === 'string' ? email.password : '');
  const rawEmail = resolvedEmail.toLowerCase();
  const aliasMap = { 'pm@nexora.ai': 'dileep@nexora.ai', 'lead@nexora.ai': 'sohel@nexora.ai', 'member@nexora.ai': 'hema@nexora.ai' };
  let user = await User.findOne({ email: rawEmail }).select('+password');
  if (!user && aliasMap[rawEmail]) {
    user = await User.findOne({ email: aliasMap[rawEmail] }).select('+password');
  }
  if (!user || !await user.comparePassword(resolvedPassword || '')) throw Object.assign(new Error('Incorrect email or password'), { status: 401 });
  if (!user.isActive || user.role === 'project_owner' || !roles.includes(user.role)) throw Object.assign(new Error('This account or role is not authorized to sign in'), { status: 401 });

  user.lastLogin = new Date();
  user.tokenVersion = user.tokenVersion || 1;
  const userAgent = req.headers['user-agent'] || '';
  user.lastActiveSession = {
    device: userAgent.includes('Mobile') ? 'Mobile Device' : 'Desktop Workstation',
    browser: userAgent.includes('Chrome') ? 'Google Chrome' : userAgent.includes('Firefox') ? 'Mozilla Firefox' : userAgent.includes('Safari') ? 'Apple Safari' : 'Modern Web Browser',
    ip: req.ip || req.connection?.remoteAddress || '127.0.0.1',
    loginTime: new Date()
  };
  await user.save();
  await audit(user._id, 'user_logged_in', 'User', user._id, { ip: user.lastActiveSession.ip });
  ok(res, { user: sanitize(user), token: tokenFor(user) });
}
export function me(req, res) { ok(res, { user: sanitize(req.user) }); } export function logout(req, res) { ok(res, { message: 'Logged out successfully' }); }
const tokenFor = (user) => jwt.sign({ sub: user._id, role: user.role, tokenVersion: user.tokenVersion || 1 }, process.env.JWT_SECRET || 'nexora-ai-local-secret-2026-project', { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });
function sanitize(user) { const item = user.toObject ? user.toObject() : user; delete item.password; return item; }

export async function listProjects(req, res) { const all = await Project.find().populate('projectManager teamLead client teamMembers', 'name role availabilityStatus'); const visible = all.filter((project) => canAccessProject(req.user, project)); const isClient = req.user.role === 'client'; const rows = await Promise.all(visible.map(async (project) => { const rawMetrics = await calculateProjectMetrics(project._id, false); if (isClient) { const item = project.toObject(); delete item.projectManager; delete item.teamLead; delete item.teamMembers; delete item.owner; return { ...item, metrics: { progress: rawMetrics.progress, expectedProgress: rawMetrics.expectedProgress, daysRemaining: rawMetrics.daysRemaining, riskScore: rawMetrics.riskScore, riskLevel: rawMetrics.riskLevel, health: rawMetrics.health, factors: (rawMetrics.factors || []).map(() => 'A delivery risk is being monitored.') } }; } return { ...project.toObject(), metrics: rawMetrics }; })); ok(res, { items: rows, pagination: { total: rows.length } }); }
export async function getProject(req, res) { const project = await loadProject(req.params.projectId); if (!canAccessProject(req.user, project)) throw Object.assign(new Error('Project access denied'), { status: 403 }); const isClient = req.user.role === 'client'; const [metrics, tasks, milestones, updates, activity] = await Promise.all([calculateProjectMetrics(project._id, false), Task.find({ project: project._id }).populate('assignedTo', 'name role availabilityStatus skills'), Milestone.find({ project: project._id }), ProjectUpdate.find({ project: project._id }).populate('author', 'name').sort('-createdAt'), isClient ? [] : ActivityLog.find({ entityId: project._id }).populate('actor', 'name').sort('-timestamp').limit(20)]); const output = project.toObject(); let sanitizedMetrics = metrics; if (isClient) { output.teamMembers = []; output.projectManager = undefined; output.teamLead = undefined; output.owner = undefined; tasks.forEach((t) => { t.assignedTo = undefined; t.actualHours = undefined; }); sanitizedMetrics = { progress: metrics.progress, expectedProgress: metrics.expectedProgress, daysRemaining: metrics.daysRemaining, riskScore: metrics.riskScore, riskLevel: metrics.riskLevel, health: metrics.health, factors: (metrics.factors || []).map(() => 'A delivery risk is being monitored.') }; } const safeTasks = isClient ? tasks.map((task) => ({ _id: task._id, title: task.title, description: task.description, project: task.project, status: task.status, priority: task.priority, progress: task.progress, dueDate: task.dueDate, riskLevel: task.riskLevel, blockers: task.blockers })) : tasks; ok(res, { project: output, metrics: sanitizedMetrics, tasks: safeTasks, milestones, updates, activity: isClient ? [] : activity }); }
export async function createProject(req, res) { const allowed = ['name', 'description', 'status', 'priority', 'startDate', 'deadline', 'budget', 'projectManager', 'teamLead', 'teamMembers', 'client']; const body = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key))); if (!body.name || !body.startDate || !body.deadline) throw Object.assign(new Error('Name, start date, and deadline are required'), { status: 400 }); const project = await Project.create({ ...body, owner: req.user._id, projectManager: body.projectManager || req.user._id }); await audit(req.user._id, 'project_created', 'Project', project._id); ok(res, { project }, 201); }
export async function updateProject(req, res) { const project = await loadProject(req.params.projectId); if (!manageRoles.includes(req.user.role) || !canAccessProject(req.user, project)) throw Object.assign(new Error('Project update denied'), { status: 403 }); const isPMOrAdmin = ['admin', 'project_manager'].includes(req.user.role); const allowed = isPMOrAdmin ? ['name', 'description', 'status', 'priority', 'deadline', 'budget', 'teamLead', 'teamMembers', 'client', 'projectManager'] : ['name', 'description', 'status', 'priority', 'deadline', 'teamMembers']; Object.assign(project, Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)))); await project.save(); await audit(req.user._id, 'project_updated', 'Project', project._id); ok(res, { project, metrics: await calculateProjectMetrics(project._id) }); }
export async function addProjectMember(req, res) {
  const project = await loadProject(req.params.projectId);
  if (!manageRoles.includes(req.user.role) || !canAccessProject(req.user, project)) {
    throw Object.assign(new Error('Project member update denied'), { status: 403 });
  }
  const memberIdVal = req.body.memberId || req.body.userId;
  requireId(memberIdVal);
  const member = await User.findById(memberIdVal);
  if (!member || !member.isActive) {
    throw Object.assign(new Error('User not found or inactive'), { status: 404 });
  }
  if (member.role === 'client') {
    throw Object.assign(new Error('Clients cannot be added as team members'), { status: 400 });
  }
  if (project.teamMembers.map(String).includes(String(member._id))) {
    throw Object.assign(new Error('User is already a member of this project team'), { status: 409 });
  }
  project.teamMembers.push(member._id);
  await project.save();
  const notif = await Notification.create({
    recipient: member._id,
    type: 'system',
    title: 'Added to project team',
    message: `You have been added to the team for ${project.name}.`,
    relatedProject: project._id
  });
  try { emitNotification(notif, member._id); } catch {}
  await audit(req.user._id, 'project_member_added', 'Project', project._id, { memberId: member._id });
  cache.invalidateProject(project._id);
  try { emitMemberAdded(project._id, member); } catch {}
  const metrics = await calculateProjectMetrics(project._id);
  try { emitProjectProgressUpdated(project._id, metrics); } catch {}
  ok(res, {
    project: await project.populate('teamMembers', 'name role email availabilityStatus skills jobTitle department'),
    metrics
  });
}

export async function removeProjectMember(req, res) {
  const project = await loadProject(req.params.projectId);
  if (!manageRoles.includes(req.user.role) || !canAccessProject(req.user, project)) {
    throw Object.assign(new Error('Project member update denied'), { status: 403 });
  }
  requireId(req.params.memberId);
  const activeTasks = await Task.countDocuments({
    project: project._id,
    assignedTo: req.params.memberId,
    status: { $ne: 'completed' }
  });
  if (activeTasks > 0) {
    throw Object.assign(new Error(`Verification failed: member has ${activeTasks} active task(s). Reassign them before removing the member.`), { status: 422 });
  }
  project.teamMembers = project.teamMembers.filter((id) => String(id) !== String(req.params.memberId));
  await project.save();
  const notif = await Notification.create({
    recipient: req.params.memberId,
    type: 'system',
    title: 'Removed from project team',
    message: `You have been removed from the team for ${project.name}.`,
    relatedProject: project._id
  });
  try { emitNotification(notif, req.params.memberId); } catch {}
  await audit(req.user._id, 'project_member_removed', 'Project', project._id, { memberId: req.params.memberId });
  cache.invalidateProject(project._id);
  try { emitMemberRemoved(project._id, req.params.memberId); } catch {}
  const metrics = await calculateProjectMetrics(project._id);
  try { emitProjectProgressUpdated(project._id, metrics); } catch {}
  ok(res, {
    project: await project.populate('teamMembers', 'name role email availabilityStatus skills jobTitle department'),
    metrics
  });
}

export async function createEmployee(req, res) {
  const project = await loadProject(req.params.projectId);
  const isManager = req.user.role === 'admin' ||
    String(project.projectManager) === String(req.user._id) ||
    String(project.owner) === String(req.user._id);
  if (!isManager) {
    throw Object.assign(new Error('Unauthorized: Only the assigned Project Manager or Admin can create employee accounts for this project'), { status: 403 });
  }

  const { name, email, password, jobTitle, department, skills, availabilityStatus, workloadCapacity } = req.body;
  if (!name || !email || !password || password.length < 8) {
    throw Object.assign(new Error('Employee name, valid email, and an 8+ character password are required'), { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();
  if (await User.exists({ email: normalizedEmail })) {
    throw Object.assign(new Error('Email is already registered'), { status: 409 });
  }

  const parsedSkills = Array.isArray(skills)
    ? skills.map((s) => String(s).trim()).filter(Boolean)
    : typeof skills === 'string'
    ? skills.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    password,
    role: 'team_member',
    jobTitle: (jobTitle || '').trim() || 'Software Engineer',
    department: (department || '').trim() || 'Engineering',
    skills: parsedSkills,
    availabilityStatus: ['available', 'busy', 'unavailable', 'absent', 'overloaded'].includes(availabilityStatus) ? availabilityStatus : 'available',
    workloadCapacity: Number(workloadCapacity) > 0 ? Number(workloadCapacity) : 40,
    isActive: true
  });

  if (parsedSkills.length) {
    for (const skillName of parsedSkills) {
      await MemberSkill.create({
        member: user._id,
        skillName,
        proficiency: 'intermediate',
        experienceYears: 1
      });
    }
  }

  if (!project.teamMembers.map(String).includes(String(user._id))) {
    project.teamMembers.push(user._id);
    await project.save();
  }

  cache.invalidateProject(project._id);

  const notif = await Notification.create({
    recipient: user._id,
    type: 'system',
    title: 'Welcome to NEXORA',
    message: `Your account has been created and you have been added to ${project.name}.`,
    relatedProject: project._id
  });
  try { emitNotification(notif, user._id); } catch {}

  await audit(req.user._id, 'employee_created', 'User', user._id, {
    project: project._id,
    email: user.email,
    role: user.role
  });

  try { emitMemberAdded(project._id, user); } catch {}

  const sanitizedUser = sanitize(user);
  ok(res, {
    user: sanitizedUser,
    project: await project.populate('teamMembers', 'name role email availabilityStatus skills jobTitle department'),
    message: 'Employee account created and assigned to project team successfully'
  }, 201);
}

export async function listTasks(req, res) { const filter = {}; if (req.query.project) { const project = await loadProject(req.query.project); if (!canAccessProject(req.user, project)) throw Object.assign(new Error('Project access denied'), { status: 403 }); filter.project = project._id; } else if (req.user.role !== 'admin') { const accessible = (await Project.find()).filter((project) => canAccessProject(req.user, project)).map((project) => project._id); filter.project = { $in: accessible }; } if (req.user.role === 'team_member') filter.assignedTo = req.user._id; const tasks = await Task.find(filter).populate('project', 'name').populate('assignedTo', 'name availabilityStatus skills').sort({ dueDate: 1 }); const items = req.user.role === 'client' ? tasks.map((task) => ({ _id: task._id, title: task.title, description: task.description, project: task.project, status: task.status, priority: task.priority, progress: task.progress, dueDate: task.dueDate, riskLevel: task.riskLevel, blockers: task.blockers })) : tasks; ok(res, { items, tasks: items, pagination: { total: items.length } }); }
export async function createTask(req, res) { const project = await loadProject(req.body.project); if (!manageRoles.includes(req.user.role) || !canAccessProject(req.user, project)) throw Object.assign(new Error('Task creation denied'), { status: 403 }); const allowed = ['title', 'description', 'project', 'assignedTo', 'status', 'priority', 'progress', 'dueDate', 'estimatedHours', 'actualHours', 'requiredSkills', 'dependencies', 'blockers']; const body = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key))); if (!body.title || !body.dueDate) throw Object.assign(new Error('Title and due date are required'), { status: 400 }); if (body.assignedTo) { requireId(body.assignedTo); const isMember = project.teamMembers.map(memberId).map(String).includes(String(body.assignedTo)); if (!isMember) throw Object.assign(new Error('Assignee must be a project team member'), { status: 400 }); } else { delete body.assignedTo; } const task = await Task.create({ ...body, owner: body.assignedTo || undefined, createdBy: req.user._id }); await audit(req.user._id, 'task_created', 'Task', task._id, { project: project._id, assigned: Boolean(task.assignedTo) }); const metrics = await calculateProjectMetrics(project._id); try { emitTaskUpdated(task, metrics); } catch {} ok(res, { task, metrics }, 201); }
export async function updateTask(req, res) { requireId(req.params.taskId); const task = await Task.findById(req.params.taskId); if (!task) throw Object.assign(new Error('Task not found'), { status: 404 }); const project = await loadProject(task.project); const own = String(task.assignedTo) === String(req.user._id); if (!(manageRoles.includes(req.user.role) && canAccessProject(req.user, project)) && !own) throw Object.assign(new Error('Task update denied'), { status: 403 }); const allowed = own ? ['progress', 'status', 'blockers', 'actualHours'] : ['title', 'description', 'status', 'priority', 'progress', 'dueDate', 'estimatedHours', 'actualHours', 'requiredSkills', 'dependencies', 'blockers']; const oldStatus = task.status; const targetStatus = req.body.status !== undefined ? req.body.status : task.status; if (targetStatus === 'completed' && oldStatus !== 'completed') { if (oldStatus === 'blocked' || (task.blockers && task.blockers.length > 0)) { throw Object.assign(new Error('Verification failed: task is blocked. Resolve blockers and unblock before marking it completed.'), { status: 422 }); } if (!task.assignedTo && !req.body.assignedTo) { throw Object.assign(new Error('Verification failed: task cannot be marked completed while it has no assigned member'), { status: 422 }); } const checkProgress = req.body.progress !== undefined ? Number(req.body.progress) : task.progress; if (checkProgress < 100) { throw Object.assign(new Error(`Verification failed: task is only ${checkProgress}% complete. Update progress to 100% before marking it completed.`), { status: 422 }); } task.completedAt = new Date(); } Object.assign(task, Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)))); await task.save(); await audit(req.user._id, task.status === 'completed' ? 'task_completed' : 'task_updated', 'Task', task._id, { project: project._id }); const metrics = await calculateProjectMetrics(project._id); try { emitTaskUpdated(task, metrics); } catch {} ok(res, { task, metrics }); }
export const updateTaskProgress = updateTask; export const updateTaskStatus = updateTask;
export async function taskAnalysis(req, res) { requireId(req.params.taskId); const task = await Task.findById(req.params.taskId); if (!task) throw Object.assign(new Error('Task not found'), { status: 404 }); const project = await loadProject(task.project); if (req.user.role === 'client' || !(await canAccessProject(req.user, project))) throw Object.assign(new Error('Task analysis access denied'), { status: 403 }); const analysis = await analyzeTask(task._id); ok(res, analysis); }
export async function assignTask(req, res) { const task = await Task.findById(req.params.taskId); if (!task) throw Object.assign(new Error('Task not found'), { status: 404 }); const project = await loadProject(task.project); if (!manageRoles.includes(req.user.role) || !canAccessProject(req.user, project)) throw Object.assign(new Error('Assignment denied'), { status: 403 }); const assignee = await User.findById(req.body.assignedTo); if (!assignee || !project.teamMembers.map(String).includes(String(assignee._id))) throw Object.assign(new Error('Assignee must be a project member'), { status: 400 }); const old = task.assignedTo; task.assignedTo = assignee._id; task.owner = assignee._id; await task.save(); await TaskAssignmentHistory.create({ task: task._id, previousMember: old, newMember: assignee._id, reason: req.body.reason || 'Manual assignment', approvedBy: req.user._id }); await audit(req.user._id, 'task_assigned', 'Task', task._id); const metrics = await calculateProjectMetrics(project._id); try { emitTaskAssigned(task, assignee._id, old, metrics); } catch {} ok(res, { task, metrics }); }

export async function listMilestones(req, res) { const filter = {}; if (req.query.project) { const project = await loadProject(req.query.project); if (!canAccessProject(req.user, project)) throw Object.assign(new Error('Project access denied'), { status: 403 }); filter.project = project._id; } else { const visible = (await Project.find()).filter((project) => canAccessProject(req.user, project)).map((project) => project._id); filter.project = { $in: visible }; } const milestones = await Milestone.find(filter); ok(res, { items: milestones }); }
export async function createMilestone(req, res) { const project = await loadProject(req.body.project); if (!manageRoles.includes(req.user.role) || !canAccessProject(req.user, project)) throw Object.assign(new Error('Milestone creation denied'), { status: 403 }); const milestone = await Milestone.create(req.body); project.milestones.push(milestone._id); await project.save(); cache.invalidateProject(project._id); try { emitMilestoneUpdated(milestone); } catch {} ok(res, { milestone }, 201); }
export async function updateMilestone(req, res) { const milestone = await Milestone.findById(req.params.milestoneId); if (!milestone) throw Object.assign(new Error('Milestone not found'), { status: 404 }); const project = await loadProject(milestone.project); if (!manageRoles.includes(req.user.role) || !canAccessProject(req.user, project)) throw Object.assign(new Error('Milestone update denied'), { status: 403 }); Object.assign(milestone, Object.fromEntries(Object.entries(req.body).filter(([key]) => ['title', 'description', 'dueDate', 'status', 'progress'].includes(key)))); await milestone.save(); const metrics = await calculateProjectMetrics(project._id); try { emitMilestoneUpdated(milestone, metrics); } catch {} ok(res, { milestone, metrics }); }

export async function dashboard(req, res) { const isAllowedRole = req.params.role === req.user.role; if (!isAllowedRole) throw Object.assign(new Error('Dashboard role does not match your session'), { status: 403 }); const projects = (await Project.find()).filter((project) => canAccessProject(req.user, project)); const projectIds = projects.map((project) => project._id); const enriched = await Promise.all(projects.map(async (project) => ({ project, metrics: await calculateProjectMetrics(project._id, false) }))); const taskQuery = req.user.role === 'team_member' ? { assignedTo: req.user._id } : { project: { $in: projectIds } }; const tasks = await Task.find(taskQuery).populate('assignedTo project', 'name'); const client = req.user.role === 'client'; const scopeEntityIds = [...projectIds, ...tasks.map((task) => task._id)]; const memberIds = projectMemberIds(projects); const memberQuery = client ? null : ['admin', 'project_manager'].includes(req.user.role) ? { isActive: true, role: { $in: ['admin', 'project_manager', 'team_lead', 'team_member'] } } : { _id: { $in: memberIds.length ? memberIds : [req.user._id] }, isActive: true }; const [notifications, activity, members] = await Promise.all([Notification.find({ recipient: req.user._id }).sort('-createdAt').limit(8), client ? [] : ActivityLog.find({ $or: [{ actor: req.user._id }, { entityId: { $in: scopeEntityIds } }] }).populate('actor', 'name').sort('-timestamp').limit(8), client || !memberQuery ? [] : User.find(memberQuery).select('name email role jobTitle department skills availabilityStatus productivityScore isActive employeeId phone experienceYears deactivatedAt deactivatedBy deactivationReason').sort('name')]); const recommendations = client ? [] : await ResourceRecommendation.find({ project: { $in: projectIds }, status: 'pending' }).populate('task unavailableMember recommendedMember', 'title name role availabilityStatus'); const totals = { projects: enriched.length, tasks: tasks.length, completed: tasks.filter((task) => task.status === 'completed').length, overdue: tasks.filter((task) => task.status !== 'completed' && task.dueDate < new Date()).length, progress: enriched.length ? Math.round(enriched.reduce((sum, item) => sum + item.metrics.progress, 0) / enriched.length) : 0, highRisk: enriched.filter((item) => ['high', 'critical'].includes(item.metrics.riskLevel)).length }; if (req.user.role === 'team_member') totals.productivity = req.user.productivityScore ?? (await performanceFor(req.user._id)).productivityScore; const safeProjects = client ? enriched.map(({ project, metrics }) => { const item = project.toObject(); delete item.projectManager; delete item.teamLead; delete item.teamMembers; delete item.owner; return { project: item, metrics: { progress: metrics.progress, expectedProgress: metrics.expectedProgress, daysRemaining: metrics.daysRemaining, riskScore: metrics.riskScore, riskLevel: metrics.riskLevel, health: metrics.health, factors: metrics.factors.map(() => 'A delivery risk is being monitored.') } }; }) : enriched; const safeTasks = client ? tasks.map((task) => ({ _id: task._id, title: task.title, status: task.status, priority: task.priority, progress: task.progress, dueDate: task.dueDate, project: task.project })) : tasks; ok(res, { role: req.user.role, totals, projects: safeProjects, tasks: safeTasks, members, recommendations, notifications, activity }); }
export async function workload(req, res) { const project = await loadProject(req.params.projectId); if (!canAccessProject(req.user, project) || req.user.role === 'client') throw Object.assign(new Error('Workload access denied'), { status: 403 }); ok(res, { items: await projectWorkload(project._id) }); }
export async function recommendations(req, res) { const project = await loadProject(req.params.projectId); if (!canAccessProject(req.user, project) || req.user.role === 'client') throw Object.assign(new Error('Recommendation access denied'), { status: 403 }); const items = await ResourceRecommendation.find({ project: project._id }).populate('task unavailableMember recommendedMember', 'title name'); ok(res, { items }); }
export async function recommendReplacement(req, res) { const task = await Task.findById(req.params.taskId); if (!task) throw Object.assign(new Error('Task not found'), { status: 404 }); const project = await loadProject(task.project); if (!manageRoles.includes(req.user.role) || !canAccessProject(req.user, project)) throw Object.assign(new Error('Recommendation request denied'), { status: 403 }); const recommendation = await saveRecommendation(task._id); const notif = await Notification.create({ recipient: project.projectManager, type: 'resource_recommendation', title: 'AI replacement recommendation ready', message: `A replacement recommendation is ready for ${task.title}.`, priority: 'high', relatedProject: project._id, relatedTask: task._id }); try { emitNotification(notif, project.projectManager); } catch {} await audit(req.user._id, 'recommendation_created', 'ResourceRecommendation', recommendation._id); ok(res, { recommendation, preview: await recommendationFor(task._id) }, 201); }
export async function reassignTask(req, res) { const task = await Task.findById(req.params.taskId); if (!task) throw Object.assign(new Error('Task not found'), { status: 404 }); const project = await loadProject(task.project); if (!manageRoles.includes(req.user.role) || !canAccessProject(req.user, project)) throw Object.assign(new Error('Reassignment denied'), { status: 403 }); const recommendation = await ResourceRecommendation.findOne({ task: task._id, status: 'pending' }); const newMember = await User.findById(req.body.memberId || recommendation?.recommendedMember); if (!newMember || !project.teamMembers.map(String).includes(String(newMember._id))) throw Object.assign(new Error('A valid project member is required'), { status: 400 }); const previous = task.assignedTo; task.assignedTo = newMember._id; task.owner = newMember._id; await task.save(); const history = await TaskAssignmentHistory.create({ task: task._id, previousMember: previous, newMember: newMember._id, reason: req.body.reason || 'Approved AI recommendation', recommendation: recommendation?._id, approvedBy: req.user._id }); if (recommendation) { recommendation.status = 'approved'; recommendation.approvedBy = req.user._id; recommendation.approvedAt = new Date(); await recommendation.save(); } const n1 = await Notification.create({ recipient: newMember._id, type: 'system', title: 'New task assigned', message: `You have been assigned ${task.title}.`, relatedProject: project._id, relatedTask: task._id }); try { emitNotification(n1, newMember._id); } catch {} if (previous) { const n2 = await Notification.create({ recipient: previous, type: 'system', title: 'Task reassigned', message: `${task.title} has been reassigned.`, relatedProject: project._id, relatedTask: task._id }); try { emitNotification(n2, previous); } catch {} } await audit(req.user._id, 'task_reassigned', 'Task', task._id, { previous, newMember: newMember._id }); const metrics = await calculateProjectMetrics(project._id); try { emitTaskAssigned(task, newMember._id, previous, metrics); } catch {} ok(res, { task, history, metrics, message: 'Task reassigned successfully' }); }
export async function getAvailability(req, res) { requireId(req.params.memberId); if (req.user.role === 'client' || !await canAccessMember(req.user, req.params.memberId)) throw Object.assign(new Error('Availability access denied'), { status: 403 }); const items = await MemberAvailability.find({ member: req.params.memberId }).sort('-updatedAt'); ok(res, { items }); }
export async function updateAvailability(req, res) { requireId(req.params.memberId); const member = await User.findById(req.params.memberId); if (!member) throw Object.assign(new Error('Member not found'), { status: 404 }); const self = String(member._id) === String(req.user._id); if (!self && (!manageRoles.includes(req.user.role) || !(await canAccessMember(req.user, member._id)))) throw Object.assign(new Error('Availability update denied'), { status: 403 }); const valid = ['available', 'busy', 'unavailable', 'absent', 'overloaded']; if (!valid.includes(req.body.status)) throw Object.assign(new Error('Invalid availability status'), { status: 400 }); member.availabilityStatus = req.body.status; await member.save(); const record = await MemberAvailability.create({ member: member._id, status: req.body.status, availableFrom: req.body.availableFrom, availableUntil: req.body.availableUntil, capacityPercentage: req.body.capacityPercentage ?? 100, reason: req.body.reason, updatedBy: req.user._id }); const projects = await Project.find({ teamMembers: member._id }); if (['unavailable', 'absent', 'overloaded'].includes(member.availabilityStatus)) await Promise.all(projects.map(async (project) => { const affected = await Task.find({ project: project._id, assignedTo: member._id, status: { $in: ['todo', 'in-progress', 'blocked'] } }); for (const task of affected) { const recommendation = await saveRecommendation(task._id); if (project.projectManager) { const alertNotif = await Notification.create({ recipient: project.projectManager, type: 'member_unavailable', title: 'Resource availability alert', message: `${member.name} is ${member.availabilityStatus}; ${task.title} needs reassignment review.`, priority: 'high', relatedProject: project._id, relatedTask: task._id, relatedRecommendation: recommendation?._id }); try { emitNotification(alertNotif, project.projectManager); } catch {} } } await calculateProjectMetrics(project._id); })); await audit(req.user._id, 'member_availability_updated', 'User', member._id, { status: member.availabilityStatus }); try { emitWorkloadUpdated(member._id, { status: member.availabilityStatus }); } catch {} ok(res, { availability: record, member: sanitize(member) }); }
export async function listUsers(req, res) { if (req.user.role === 'client') throw Object.assign(new Error('Access denied: User directory is restricted from client accounts'), { status: 403 }); if (!manageRoles.includes(req.user.role)) return ok(res, { items: [sanitize(req.user)] }); const users = await User.find({ isActive: true, role: { $ne: 'project_owner' } }).select('-password').sort('name'); ok(res, { items: users }); }
export async function notifications(req, res) { const items = await Notification.find({ recipient: req.user._id }).sort('-createdAt'); ok(res, { items }); }
export async function markNotificationRead(req, res) { const item = await Notification.findOneAndUpdate({ _id: req.params.notificationId, recipient: req.user._id }, { isRead: true }, { new: true }); if (!item) throw Object.assign(new Error('Notification not found'), { status: 404 }); ok(res, { notification: item }); }
export async function analytics(req, res) { const project = await loadProject(req.params.projectId); if (!canAccessProject(req.user, project) || req.user.role === 'client') throw Object.assign(new Error('Analytics access denied'), { status: 403 }); const [metrics, riskTrend, skills] = await Promise.all([calculateProjectMetrics(project._id, false), ProjectRiskSnapshot.find({ project: project._id }).sort('timestamp').limit(30), MemberSkill.find({ member: { $in: project.teamMembers } })]); ok(res, { metrics, riskTrend, skills }); }
export async function listUpdates(req, res) { const visible = (await Project.find()).filter((project) => canAccessProject(req.user, project)); const ids = visible.map((project) => project._id); const items = await ProjectUpdate.find({ project: { $in: ids } }).populate('author', 'name role').populate('project', 'name code').sort('-createdAt'); ok(res, { items }); }

export async function getTask(req, res) { requireId(req.params.taskId); const task = await Task.findById(req.params.taskId).populate('project', 'name teamMembers'); if (!task) throw Object.assign(new Error('Task not found'), { status: 404 }); const project = await loadProject(task.project._id); if (!canAccessProject(req.user, project)) throw Object.assign(new Error('Task access denied'), { status: 403 }); if (req.user.role === 'client') return ok(res, { task: { _id: task._id, title: task.title, description: task.description, project: { _id: task.project._id, name: task.project.name }, status: task.status, priority: task.priority, progress: task.progress, dueDate: task.dueDate, riskLevel: task.riskLevel, blockers: task.blockers } }); ok(res, { task: await task.populate('assignedTo owner', 'name role availabilityStatus skills') }); }
export async function deleteTask(req, res) { const task = await Task.findById(req.params.taskId); if (!task) throw Object.assign(new Error('Task not found'), { status: 404 }); const project = await loadProject(task.project); if (!manageRoles.includes(req.user.role) || !canAccessProject(req.user, project)) throw Object.assign(new Error('Task deletion denied'), { status: 403 }); await Task.deleteOne({ _id: task._id }); await audit(req.user._id, 'task_deleted', 'Task', task._id, { project: project._id }); ok(res, { message: 'Task deleted', metrics: await calculateProjectMetrics(project._id) }); }
export async function deleteProject(req, res) { const project = await loadProject(req.params.projectId); const isAuthorized = req.user.role === 'admin' || String(project.owner) === String(req.user._id) || String(project.projectManager) === String(req.user._id); if (!isAuthorized) throw Object.assign(new Error('Project deletion denied: only the assigned Project Manager or Owner can delete this project'), { status: 403 }); await Promise.all([Task.deleteMany({ project: project._id }), Milestone.deleteMany({ project: project._id }), ProjectUpdate.deleteMany({ project: project._id }), ResourceRecommendation.deleteMany({ project: project._id }), ProjectRiskSnapshot.deleteMany({ project: project._id }), Project.deleteOne({ _id: project._id })]); cache.invalidateProject(project._id); await audit(req.user._id, 'project_deleted', 'Project', project._id); ok(res, { message: 'Project deleted' }); }
export async function getUser(req, res) { requireId(req.params.userId); const user = await User.findById(req.params.userId).select('-password'); if (!user) throw Object.assign(new Error('Member not found'), { status: 404 }); if (req.user.role === 'client' || !await canAccessMember(req.user, user._id)) throw Object.assign(new Error('Member access denied'), { status: 403 }); const tasks = await Task.find({ assignedTo: user._id, status: { $ne: 'completed' } }).populate('project', 'name'); ok(res, { user, activeTasks: tasks }); }
export async function updateUser(req, res) { requireId(req.params.userId); const user = await User.findById(req.params.userId).select('+password'); if (!user) throw Object.assign(new Error('Member not found'), { status: 404 }); const self = String(user._id) === String(req.user._id); if ((!self && (!manageRoles.includes(req.user.role) || !await canAccessMember(req.user, user._id))) || req.user.role === 'client' && !self) throw Object.assign(new Error('Profile update denied'), { status: 403 }); const allowed = self ? ['name', 'jobTitle', 'department', 'skills', 'profileImage', 'password', 'preferences'] : ['name', 'jobTitle', 'department', 'skills', 'availabilityStatus', 'workloadCapacity', 'productivityScore', 'isActive']; const changes = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key))); if (changes.password) { if (!self) throw Object.assign(new Error('Password changes are restricted to the account owner'), { status: 403 }); if (!req.body.currentPassword) throw Object.assign(new Error('Current password is required to change password'), { status: 400 }); const isMatch = await user.comparePassword(req.body.currentPassword); if (!isMatch) throw Object.assign(new Error('Incorrect current password'), { status: 400 }); if (changes.password.length < 8) throw Object.assign(new Error('Password must be at least 8 characters'), { status: 400 }); } if (changes.skills) { const rawSkills = Array.isArray(changes.skills) ? changes.skills : String(changes.skills).split(','); const cleanSkills = rawSkills.map((s) => String(s).trim()).filter(Boolean); changes.skills = cleanSkills; for (const skillName of cleanSkills) { await MemberSkill.updateOne({ member: user._id, skillName: new RegExp(`^${skillName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i') }, { member: user._id, skillName, proficiency: 'intermediate', experienceYears: 2, lastUsed: new Date() }, { upsert: true }); } const cleanLower = cleanSkills.map((s) => s.toLowerCase()); const existing = await MemberSkill.find({ member: user._id }); for (const es of existing) { if (!cleanLower.includes(es.skillName.toLowerCase())) { await MemberSkill.deleteOne({ _id: es._id }); } } } Object.assign(user, changes); await user.save(); await audit(req.user._id, 'profile_updated', 'User', user._id); try { emitUserUpdated(user); } catch {} ok(res, { user: sanitize(user) }); }

export async function deleteUser(req, res) {
  if (req.user.role !== 'admin') {
    throw Object.assign(new Error('Access denied: Account deletion and deactivation requires Admin privileges'), { status: 403 });
  }

  requireId(req.params.userId);
  if (String(req.user._id) === String(req.params.userId)) {
    throw Object.assign(new Error('Self-deletion or deactivation of the active Admin account is prohibited'), { status: 400 });
  }

  const user = await User.findById(req.params.userId);
  if (!user) {
    throw Object.assign(new Error('User not found'), { status: 404 });
  }

  const mode = String(req.query.mode || req.body?.mode || 'deactivate').toLowerCase();
  const force = req.query.force === 'true' || req.body?.force === true;

  const [assignedTasksCount, managedProjectsCount, authoredCommentsCount, attachmentsCount] = await Promise.all([
    Task.countDocuments({ assignedTo: user._id }),
    Project.countDocuments({ $or: [{ projectManager: user._id }, { owner: user._id }, { teamLead: user._id }, { client: user._id }] }),
    Comment.countDocuments({ author: user._id }),
    Attachment.countDocuments({ uploadedBy: user._id })
  ]);

  const hasDependencies = assignedTasksCount > 0 || managedProjectsCount > 0 || authoredCommentsCount > 0 || attachmentsCount > 0;

  if (mode === 'delete') {
    if (hasDependencies && !force) {
      throw Object.assign(new Error(
        `Cannot permanently delete user: account is linked to ${assignedTasksCount} task(s), ${managedProjectsCount} project(s), ${authoredCommentsCount} comment(s), and ${attachmentsCount} file attachment(s). Use deactivation (mode=deactivate) or pass force=true to unlink dependencies.`
      ), { status: 409 });
    }

    if (assignedTasksCount > 0 || force) {
      await Task.updateMany(
        { $or: [{ assignedTo: user._id }, { owner: user._id }] },
        { $unset: { assignedTo: 1, owner: 1 } }
      );
    }

    const affectedProjects = await Project.find({
      $or: [
        { teamMembers: user._id },
        { projectManager: user._id },
        { owner: user._id },
        { teamLead: user._id },
        { client: user._id }
      ]
    });

    if (affectedProjects.length > 0) {
      await Project.updateMany(
        { projectManager: user._id },
        { $set: { projectManager: req.user._id } }
      );
      await Project.updateMany(
        { owner: user._id },
        { $set: { owner: req.user._id } }
      );
      await Project.updateMany(
        { teamLead: user._id },
        { $unset: { teamLead: 1 } }
      );
      await Project.updateMany(
        { client: user._id },
        { $unset: { client: 1 } }
      );
      await Project.updateMany(
        { teamMembers: user._id },
        { $pull: { teamMembers: user._id } }
      );

      for (const proj of affectedProjects) {
        cache.invalidateProject(proj._id);
      }
    }

    await MemberSkill.deleteMany({ member: user._id });
    await MemberAvailability.deleteMany({ member: user._id });
    await User.deleteOne({ _id: user._id });

    await audit(req.user._id, 'user_permanently_deleted', 'User', user._id, {
      deletedEmail: user.email,
      unlinkedTasks: assignedTasksCount
    });

    try { emitUserDeactivated(user._id, 'deleted'); } catch {}

    return ok(res, {
      message: `User account ${user.email} permanently deleted and dependencies safely unlinked`,
      mode: 'deleted',
      userId: user._id
    });
  }

  user.isActive = false;
  await user.save();

  const memberProjects = await Project.find({
    $or: [
      { teamMembers: user._id },
      { projectManager: user._id },
      { owner: user._id },
      { teamLead: user._id },
      { client: user._id }
    ]
  });
  for (const proj of memberProjects) {
    cache.invalidateProject(proj._id);
  }

  await audit(req.user._id, 'user_deactivated', 'User', user._id, {
    email: user.email,
    role: user.role
  });

  try { emitUserDeactivated(user._id, 'deactivated'); } catch {}

  return ok(res, {
    message: `User account ${user.email} deactivated successfully`,
    mode: 'deactivated',
    user: sanitize(user)
  });
}
export async function search(req, res) {
  const q = String(req.query.q || '').trim();
  if (!q) return ok(res, { projects: [], tasks: [], members: [], milestones: [], documents: [], discussions: [] });
  const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const visible = (await Project.find()).filter((project) => canAccessProject(req.user, project));
  const ids = visible.map((project) => project._id);
  const isClient = req.user.role === 'client';
  const accessibleMemberIds = isClient ? [] : projectMemberIds(visible);

  const [rawProjects, rawTasks, members, rawMilestones, rawDocs, rawComments] = await Promise.all([
    Project.find({ _id: { $in: ids }, $or: [{ name: rx }, { description: rx }] }).limit(6),
    Task.find({ project: { $in: ids }, $or: [{ title: rx }, { description: rx }] }).populate('project', 'name').limit(6),
    accessibleMemberIds.length ? User.find({ _id: { $in: accessibleMemberIds }, $or: [{ name: rx }, { email: rx }, { skills: rx }] }).select('name role jobTitle availabilityStatus employeeId').limit(6) : Promise.resolve([]),
    Milestone.find({ project: { $in: ids }, $or: [{ title: rx }, { description: rx }] }).populate('project', 'name').limit(6),
    Attachment.find({ project: { $in: ids }, ...(isClient ? { isPublicToClient: true } : {}), isArchived: false, $or: [{ originalName: rx }, { description: rx }] }).populate('project', 'name').limit(6),
    isClient ? Promise.resolve([]) : Comment.find({ project: { $in: ids }, content: rx }).populate('project', 'name').populate('author', 'name').limit(6)
  ]);

  const projects = isClient ? rawProjects.map((p) => {
    const item = p.toObject();
    delete item.projectManager;
    delete item.teamLead;
    delete item.teamMembers;
    delete item.owner;
    return item;
  }) : rawProjects;

  const tasks = isClient ? rawTasks.map((t) => ({
    _id: t._id, title: t.title, description: t.description, status: t.status,
    priority: t.priority, progress: t.progress, dueDate: t.dueDate,
    riskLevel: t.riskLevel, blockers: t.blockers, project: t.project
  })) : rawTasks;

  const documents = (rawDocs || []).map(d => ({
    _id: d._id,
    name: d.originalName,
    description: d.description,
    category: d.category,
    status: d.status,
    project: d.project
  }));

  const discussions = (rawComments || []).map(c => ({
    _id: c._id,
    content: c.content,
    author: c.author?.name || 'Team Member',
    project: c.project,
    createdAt: c.createdAt
  }));

  ok(res, {
    projects,
    tasks,
    members: isClient ? [] : members,
    milestones: rawMilestones,
    documents,
    discussions: isClient ? [] : discussions
  });
}

export async function calendar(req, res) {
  const projects = (await Project.find()).filter((project) => canAccessProject(req.user, project));
  const ids = projects.map((project) => project._id);
  const isClient = req.user.role === 'client';
  const isMember = req.user.role === 'team_member';
  const taskQuery = isMember ? { project: { $in: ids }, assignedTo: req.user._id } : { project: { $in: ids } };

  const [tasks, milestones, unavailabilities] = await Promise.all([
    isClient ? Task.find({ project: { $in: ids } }).select('title dueDate startDate status priority project').populate('project', 'name') : Task.find(taskQuery).select('title dueDate startDate status priority project assignedTo').populate('project', 'name').populate('assignedTo', 'name role'),
    Milestone.find({ project: { $in: ids } }).select('title dueDate startDate status project').populate('project', 'name'),
    isClient ? Promise.resolve([]) : MemberAvailability.find({ status: { $in: ['busy', 'unavailable'] } }).populate('member', 'name role')
  ]);

  const projectDeadlines = projects.map(p => ({
    _id: `proj-${p._id}`,
    kind: 'project_deadline',
    title: `${p.name} Target Release`,
    date: p.deadline,
    status: p.status,
    priority: p.priority,
    project: { _id: p._id, name: p.name }
  }));

  const events = [
    ...tasks.map((task) => ({
      _id: task._id,
      kind: 'task',
      title: task.title,
      date: task.dueDate,
      startDate: task.startDate,
      status: task.status,
      priority: task.priority,
      project: task.project,
      assignedTo: isClient ? undefined : task.assignedTo
    })),
    ...milestones.map((milestone) => ({
      _id: milestone._id,
      kind: 'milestone',
      title: milestone.title,
      date: milestone.dueDate,
      startDate: milestone.startDate,
      status: milestone.status,
      project: milestone.project
    })),
    ...projectDeadlines,
    ...(!isClient ? unavailabilities.map((u) => ({
      _id: u._id,
      kind: 'availability',
      title: `${u.member?.name || 'Member'} (${u.status})`,
      date: u.updatedAt || new Date(),
      status: u.status,
      member: u.member
    })) : [])
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  ok(res, { events });
}
export async function globalAnalytics(req, res) { const projects = (await Project.find()).filter((project) => canAccessProject(req.user, project)); const metrics = await Promise.all(projects.map((project) => calculateProjectMetrics(project._id, false))); const taskIds = projects.map((project) => project._id); const tasks = await Task.find({ project: { $in: taskIds } }); const status = ['todo', 'in-progress', 'completed', 'blocked'].map((key) => ({ name: key, value: tasks.filter((task) => task.status === key).length })); const isClient = req.user.role === 'client'; const workload = isClient ? [] : Object.values(metrics.flatMap((metric) => metric.workload).reduce((acc, entry) => { const id = String(entry.member._id); if (!acc[id] || acc[id].percentage < entry.percentage) acc[id] = entry; return acc; }, {})); ok(res, { projects: projects.map((project, index) => ({ name: project.name, progress: metrics[index].progress, ...(isClient ? {} : { riskScore: metrics[index].riskScore }) })), taskDistribution: status, workload, totals: { projects: projects.length, tasks: tasks.length, averageProgress: metrics.length ? Math.round(metrics.reduce((sum, metric) => sum + metric.progress, 0) / metrics.length) : 0 } }); }
export async function markAllNotificationsRead(req, res) { await Notification.updateMany({ recipient: req.user._id, isRead: false }, { isRead: true }); ok(res, { message: 'All notifications marked as read' }); }
export async function rejectRecommendation(req, res) { const recommendation = await ResourceRecommendation.findById(req.params.recommendationId); if (!recommendation) throw Object.assign(new Error('Recommendation not found'), { status: 404 }); const project = await loadProject(recommendation.project); if (!manageRoles.includes(req.user.role) || !canAccessProject(req.user, project)) throw Object.assign(new Error('Recommendation rejection denied'), { status: 403 }); recommendation.status = 'rejected'; recommendation.approvedBy = req.user._id; recommendation.approvedAt = new Date(); await recommendation.save(); await audit(req.user._id, 'recommendation_rejected', 'ResourceRecommendation', recommendation._id); ok(res, { recommendation }); }

export async function predictiveTaskDelays(req, res) {
  const project = await loadProject(req.params.projectId);
  if (!canAccessProject(req.user, project)) throw Object.assign(new Error('Project access denied'), { status: 403 });
  const delays = await predictTaskDelays(project._id);
  const isClient = req.user.role === 'client';
  const sanitized = isClient ? delays.map((t) => ({ ...t, assignee: t.assignee ? { name: t.assignee.name } : null })) : delays;
  ok(res, { tasks: sanitized });
}

export async function workloadRebalance(req, res) {
  const project = await loadProject(req.params.projectId);
  if (!manageRoles.includes(req.user.role) || !canAccessProject(req.user, project)) {
    throw Object.assign(new Error('Workload rebalancing access denied'), { status: 403 });
  }
  const data = await calculateWorkloadRebalance(project._id);
  ok(res, data);
}

export async function projectBottlenecks(req, res) {
  const project = await loadProject(req.params.projectId);
  if (!canAccessProject(req.user, project)) throw Object.assign(new Error('Project access denied'), { status: 403 });
  const data = await detectProjectBottlenecks(project._id);
  if (req.user.role === 'client') {
    data.bottlenecks = data.bottlenecks.filter((b) => b.type !== 'resource_saturation');
    data.bottleneckCount = data.bottlenecks.length;
  }
  ok(res, data);
}

export async function projectAIAssistant(req, res) {
  const project = await loadProject(req.params.projectId);
  if (!canAccessProject(req.user, project)) throw Object.assign(new Error('Project access denied'), { status: 403 });
  const assistant = await getProjectAIAssistant(project._id, req.user.role);
  ok(res, assistant);
}

export async function projectDelayPrediction(req, res) {
  const project = await loadProject(req.params.projectId);
  if (!canAccessProject(req.user, project)) throw Object.assign(new Error('Project access denied'), { status: 403 });
  const delayData = await predictProjectDelay(project._id);
  if (req.user.role === 'client') {
    delayData.contributingFactors = delayData.contributingFactors.map(() => 'Milestone delivery pacing is continuously evaluated.');
  }
  ok(res, delayData);
}

export async function sprintIntelligenceHandler(req, res) {
  const project = await loadProject(req.params.projectId);
  if (!canAccessProject(req.user, project)) throw Object.assign(new Error('Project access denied'), { status: 403 });
  if (req.user.role === 'client') throw Object.assign(new Error('Sprint intelligence is restricted to project staff'), { status: 403 });
  const sprintData = await getSprintIntelligence(project._id, req.user);
  ok(res, sprintData);
}

export async function personalIntelligenceHandler(req, res) {
  const targetUserId = req.query.userId || req.user._id;
  const personalData = await getPersonalIntelligence(targetUserId, req.user);
  ok(res, personalData);
}

export async function clientDeliveryIntelligenceHandler(req, res) {
  const project = await loadProject(req.params.projectId);
  if (!canAccessProject(req.user, project)) throw Object.assign(new Error('Project access denied'), { status: 403 });
  const clientData = await getClientDeliveryIntelligence(project._id, req.user);
  ok(res, clientData);
}

export async function approveAIRecommendationHandler(req, res) {
  const result = await approveAIRecommendation(req.params.recommendationId, req.user);
  ok(res, result);
}

export async function dismissAIRecommendationHandler(req, res) {
  const result = await dismissAIRecommendation(req.params.recommendationId, req.user, req.body?.reason);
  ok(res, result);
}

export async function getTimeline(req, res) {
  const project = await loadProject(req.params.projectId);
  if (!canAccessProject(req.user, project)) throw Object.assign(new Error('Project access denied'), { status: 403 });
  const timeline = await getProjectTimeline(project._id, req.user.role);
  ok(res, timeline);
}

export async function updateTaskScheduleHandler(req, res) {
  requireId(req.params.taskId);
  const task = await Task.findById(req.params.taskId);
  if (!task) throw Object.assign(new Error('Task not found'), { status: 404 });
  const project = await loadProject(task.project);
  if (!manageRoles.includes(req.user.role) || !canAccessProject(req.user, project)) {
    throw Object.assign(new Error('Task scheduling update denied'), { status: 403 });
  }
  const updatedTask = await updateTaskSchedule(task._id, req.body);
  const metrics = await calculateProjectMetrics(project._id);
  try {
    emitTaskUpdated(updatedTask, metrics);
  } catch {}
  await audit(req.user._id, 'task_schedule_updated', 'Task', task._id, {
    startDate: updatedTask.startDate,
    dueDate: updatedTask.dueDate,
    dependencies: updatedTask.dependencies,
    project: project._id
  });
  ok(res, { task: updatedTask, metrics, message: 'Task schedule updated successfully' });
}

export async function addDependency(req, res) {
  requireId(req.params.taskId);
  const task = await Task.findById(req.params.taskId);
  if (!task) throw Object.assign(new Error('Task not found'), { status: 404 });
  const project = await loadProject(task.project);
  if (!manageRoles.includes(req.user.role) || !canAccessProject(req.user, project)) {
    throw Object.assign(new Error('Dependency management denied'), { status: 403 });
  }
  const { dependsOnTaskId } = req.body;
  if (!dependsOnTaskId) throw Object.assign(new Error('dependsOnTaskId is required'), { status: 400 });
  const currentDeps = (task.dependencies || []).map(String);
  if (!currentDeps.includes(String(dependsOnTaskId))) {
    currentDeps.push(String(dependsOnTaskId));
  }
  const updatedTask = await updateTaskSchedule(task._id, { dependencies: currentDeps });
  const metrics = await calculateProjectMetrics(project._id);
  try {
    emitTaskUpdated(updatedTask, metrics);
  } catch {}
  await audit(req.user._id, 'task_dependency_added', 'Task', task._id, {
    dependsOn: dependsOnTaskId,
    project: project._id
  });
  ok(res, { task: updatedTask, metrics, message: 'Dependency added successfully' });
}

export async function removeDependency(req, res) {
  requireId(req.params.taskId);
  const task = await Task.findById(req.params.taskId);
  if (!task) throw Object.assign(new Error('Task not found'), { status: 404 });
  const project = await loadProject(task.project);
  if (!manageRoles.includes(req.user.role) || !canAccessProject(req.user, project)) {
    throw Object.assign(new Error('Dependency management denied'), { status: 403 });
  }
  const depId = String(req.params.depTaskId);
  const currentDeps = (task.dependencies || []).map(String).filter((id) => id !== depId);
  const updatedTask = await updateTaskSchedule(task._id, { dependencies: currentDeps });
  const metrics = await calculateProjectMetrics(project._id);
  try {
    emitTaskUpdated(updatedTask, metrics);
  } catch {}
  await audit(req.user._id, 'task_dependency_removed', 'Task', task._id, {
    removedDependency: depId,
    project: project._id
  });
  ok(res, { task: updatedTask, metrics, message: 'Dependency removed successfully' });
}

export async function getTaskCommentsHandler(req, res) {
  requireId(req.params.taskId);
  const comments = await getTaskComments(req.params.taskId, req.user);
  ok(res, { comments, items: comments });
}

export async function createCommentHandler(req, res) {
  requireId(req.params.taskId);
  const { content, isPublicToClient } = req.body || {};
  const comment = await createComment({
    taskId: req.params.taskId,
    authorId: req.user._id,
    content,
    userRole: req.user.role,
    isPublicToClient
  });
  ok(res, { comment }, 201);
}

export async function updateCommentHandler(req, res) {
  requireId(req.params.commentId);
  const { content } = req.body || {};
  const comment = await updateComment({
    commentId: req.params.commentId,
    userId: req.user._id,
    userRole: req.user.role,
    content
  });
  ok(res, { comment });
}

export async function deleteCommentHandler(req, res) {
  requireId(req.params.commentId);
  const result = await deleteComment({
    commentId: req.params.commentId,
    userId: req.user._id,
    userRole: req.user.role
  });
  ok(res, result);
}

export async function listAttachmentsHandler(req, res) {
  requireId(req.params.projectId);
  const taskId = req.query?.taskId || null;
  if (taskId) requireId(taskId);
  const attachments = await getAttachments({
    projectId: req.params.projectId,
    taskId,
    user: req.user
  });
  ok(res, { attachments });
}

export async function listTaskAttachmentsHandler(req, res) {
  requireId(req.params.taskId);
  const task = await Task.findById(req.params.taskId);
  if (!task) throw Object.assign(new Error('Task not found'), { status: 404 });
  const attachments = await getAttachments({
    projectId: task.project,
    taskId: task._id,
    user: req.user
  });
  ok(res, { attachments });
}

export async function uploadAttachmentHandler(req, res) {
  requireId(req.params.projectId);
  const { filename, mimeType, content, base64, data, taskId, isPublicToClient } = req.body || {};
  if (!filename) throw Object.assign(new Error('Filename is required'), { status: 400 });

  const rawBase64 = content || base64 || data;
  if (!rawBase64) throw Object.assign(new Error('File content payload is required (base64)'), { status: 400 });

  const cleanBase64 = String(rawBase64).includes(',') ? String(rawBase64).split(',')[1] : String(rawBase64);
  const buffer = Buffer.from(cleanBase64, 'base64');

  if (taskId) requireId(taskId);

  const attachment = await saveAttachment({
    projectId: req.params.projectId,
    taskId: taskId || null,
    user: req.user,
    filename,
    mimeType: mimeType || 'application/octet-stream',
    buffer,
    isPublicToClient: isPublicToClient !== undefined ? isPublicToClient : true
  });

  ok(res, { attachment }, 201);
}

export async function downloadAttachmentHandler(req, res) {
  requireId(req.params.attachmentId);
  const { attachment, filePath } = await getAttachmentForDownload({
    attachmentId: req.params.attachmentId,
    user: req.user
  });

  res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(attachment.filename)}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to stream attachment' });
    }
  });
  stream.pipe(res);
}

export async function deleteAttachmentHandler(req, res) {
  requireId(req.params.attachmentId);
  const result = await deleteAttachment({
    attachmentId: req.params.attachmentId,
    user: req.user
  });
  ok(res, result);
}

export async function getAdvancedAnalyticsHandler(req, res) {
  requireId(req.params.projectId);
  const data = await getProjectAdvancedAnalytics({
    projectId: req.params.projectId,
    startDate: req.query.startDate,
    endDate: req.query.endDate,
    user: req.user
  });
  ok(res, data);
}

export async function getComparisonAnalyticsHandler(req, res) {
  const data = await getWorkspaceComparisonAnalytics({
    user: req.user,
    startDate: req.query.startDate,
    endDate: req.query.endDate
  });
  ok(res, data);
}

export async function exportProjectPDFReportHandler(req, res) {
  requireId(req.params.projectId);
  const result = await generateProjectPDFReport({
    projectId: req.params.projectId,
    startDate: req.query.startDate,
    endDate: req.query.endDate,
    user: req.user
  });
  res.setHeader('Content-Type', result.mimeType || 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(result.buffer);
}

export async function exportProjectExcelReportHandler(req, res) {
  requireId(req.params.projectId);
  const result = await generateProjectExcelReport({
    projectId: req.params.projectId,
    startDate: req.query.startDate,
    endDate: req.query.endDate,
    user: req.user
  });
  res.setHeader('Content-Type', result.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(result.buffer);
}

// --- Phase 8: Advanced Discussion, Notification & Document Management Handlers ---

export async function getProjectDiscussionsHandler(req, res) {
  requireId(req.params.projectId);
  const taskId = req.query?.taskId || null;
  if (taskId) requireId(taskId);
  const result = await getProjectDiscussions({
    projectId: req.params.projectId,
    taskId,
    search: req.query?.search || '',
    user: req.user,
    page: req.query?.page || 1,
    limit: req.query?.limit || 50
  });
  ok(res, result);
}

export async function createProjectDiscussionHandler(req, res) {
  requireId(req.params.projectId);
  const { content, taskId, parentCommentId, isPublicToClient } = req.body || {};
  if (taskId) requireId(taskId);
  if (parentCommentId) requireId(parentCommentId);

  const comment = await createComment({
    projectId: req.params.projectId,
    taskId: taskId || null,
    authorId: req.user._id,
    content,
    parentCommentId: parentCommentId || null,
    userRole: req.user.role,
    isPublicToClient
  });
  ok(res, { comment }, 201);
}

export async function toggleCommentReactionHandler(req, res) {
  requireId(req.params.commentId);
  const { emoji } = req.body || {};
  const result = await toggleCommentReaction({
    commentId: req.params.commentId,
    userId: req.user._id,
    emoji,
    userRole: req.user.role
  });
  ok(res, result);
}

export async function toggleCommentPinHandler(req, res) {
  requireId(req.params.commentId);
  const result = await toggleCommentPin({
    commentId: req.params.commentId,
    user: req.user
  });
  ok(res, result);
}

export async function getMentionableUsersHandler(req, res) {
  requireId(req.params.projectId);
  const users = await getMentionableUsers({
    projectId: req.params.projectId,
    user: req.user
  });
  ok(res, { users });
}

export async function uploadAttachmentVersionHandler(req, res) {
  requireId(req.params.attachmentId);
  const { filename, mimeType, content, base64, data, changeDescription } = req.body || {};
  if (!filename) throw Object.assign(new Error('Filename is required'), { status: 400 });

  const rawBase64 = content || base64 || data;
  if (!rawBase64) throw Object.assign(new Error('File content payload is required (base64)'), { status: 400 });

  const cleanBase64 = String(rawBase64).includes(',') ? String(rawBase64).split(',')[1] : String(rawBase64);
  const buffer = Buffer.from(cleanBase64, 'base64');

  const attachment = await saveAttachmentVersion({
    attachmentId: req.params.attachmentId,
    user: req.user,
    filename,
    mimeType: mimeType || 'application/octet-stream',
    buffer,
    changeDescription: changeDescription || ''
  });

  ok(res, { attachment }, 201);
}

export async function updateAttachmentReviewHandler(req, res) {
  requireId(req.params.attachmentId);
  const { status, comments } = req.body || {};
  if (!status) throw Object.assign(new Error('Review status is required'), { status: 400 });

  const attachment = await updateAttachmentReview({
    attachmentId: req.params.attachmentId,
    user: req.user,
    status,
    comments: comments || ''
  });

  ok(res, { attachment });
}

export async function updateAttachmentMetadataHandler(req, res) {
  requireId(req.params.attachmentId);
  const { filename, description, isPublicToClient } = req.body || {};

  const attachment = await updateAttachmentMetadata({
    attachmentId: req.params.attachmentId,
    user: req.user,
    filename,
    description,
    isPublicToClient
  });

  ok(res, { attachment });
}

export async function previewAttachmentHandler(req, res) {
  requireId(req.params.attachmentId);
  const { filePath, mimeType, filename } = await getAttachmentForPreview({
    attachmentId: req.params.attachmentId,
    user: req.user
  });

  res.setHeader('Content-Type', mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to stream document preview' });
    }
  });
  stream.pipe(res);
}

export async function getUserNotificationsHandler(req, res) {
  const result = await getUserNotifications({
    userId: req.user._id,
    category: req.query?.category || 'all',
    unreadOnly: req.query?.unread === 'true' || req.query?.unread === true,
    page: req.query?.page || 1,
    limit: req.query?.limit || 50
  });
  ok(res, result);
}

export async function getNotificationUnreadStatsHandler(req, res) {
  const stats = await getNotificationUnreadStats(req.user._id);
  ok(res, stats);
}

export async function dismissNotificationHandler(req, res) {
  requireId(req.params.notificationId);
  const result = await dismissNotification({
    notificationId: req.params.notificationId,
    userId: req.user._id
  });
  ok(res, result);
}

export async function updateNotificationPreferencesHandler(req, res) {
  const result = await updateNotificationPreferences({
    userId: req.user._id,
    preferences: req.body || {}
  });
  ok(res, result);
}

// ==========================================
// MANAGER EMPLOYEE MANAGEMENT SYSTEM
// ==========================================

export async function generateNextEmployeeId() {
  const usersWithId = await User.find({ employeeId: { $regex: /^NEX-\d+$/i } }).select('employeeId');
  let maxNum = 1000;
  for (const u of usersWithId) {
    const match = u.employeeId?.match(/^NEX-(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  return `NEX-${maxNum + 1}`;
}

export async function listEmployeesHandler(req, res) {
  if (req.user.role === 'client') {
    throw Object.assign(new Error('Access denied: Employee management and directory is restricted from client accounts'), { status: 403 });
  }

  const { search, role, department, projectId, status, sort } = req.query;
  const isPMOrAdmin = ['admin', 'project_manager'].includes(req.user.role);

  let query = { role: { $nin: ['client', 'project_owner'] } };

  // Status filter
  if (status === 'deactivated') {
    query.isActive = false;
  } else if (status === 'active') {
    query.isActive = true;
  } else if (!status || status === 'all') {
    if (!isPMOrAdmin) query.isActive = true;
  }

  // Scoping for Team Lead / Team Member
  if (!isPMOrAdmin) {
    const userProjects = (await Project.find()).filter((p) => canAccessProject(req.user, p));
    const accessibleMemberIds = projectMemberIds(userProjects);
    query._id = { $in: accessibleMemberIds.length ? accessibleMemberIds : [req.user._id] };
    query.isActive = true;
  }

  // Project filter
  if (projectId && isId(projectId)) {
    const targetProject = await Project.findById(projectId);
    if (targetProject) {
      const projectMembers = [
        targetProject.owner,
        targetProject.projectManager,
        targetProject.teamLead,
        ...(targetProject.teamMembers || [])
      ].filter(Boolean).map(String);
      query._id = query._id
        ? { $in: (query._id.$in || []).filter((id) => projectMembers.includes(String(id))) }
        : { $in: projectMembers };
    }
  }

  // Role filter
  if (role && role !== 'all') {
    query.role = role;
  }

  // Department filter
  if (department && department !== 'all') {
    query.department = new RegExp(`^${department.trim()}$`, 'i');
  }

  // Search filter
  if (search && search.trim()) {
    const searchRegex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [
      { name: searchRegex },
      { email: searchRegex },
      { employeeId: searchRegex },
      { jobTitle: searchRegex },
      { department: searchRegex },
      { skills: searchRegex }
    ];
  }

  // Sort option
  let sortOption = { name: 1 };
  if (sort === 'experienceYears') {
    sortOption = { experienceYears: -1, name: 1 };
  } else if (sort === 'employeeId') {
    sortOption = { employeeId: 1 };
  } else if (sort === 'workload') {
    sortOption = { workloadCapacity: -1, name: 1 };
  } else if (sort === 'recent') {
    sortOption = { createdAt: -1 };
  }

  const users = await User.find(query).select('-password').sort(sortOption);
  const userIds = users.map((u) => u._id);

  // Batch query projects and tasks for workload enrichment
  const [allProjects, activeTasks] = await Promise.all([
    Project.find({
      $or: [
        { teamMembers: { $in: userIds } },
        { projectManager: { $in: userIds } },
        { teamLead: { $in: userIds } },
        { owner: { $in: userIds } }
      ]
    }).select('name code status deadline progress teamMembers projectManager teamLead owner'),
    Task.find({
      assignedTo: { $in: userIds },
      status: { $ne: 'completed' }
    }).select('title status priority dueDate estimatedHours assignedTo project').populate('project', 'name code')
  ]);

  const projectsByUser = new Map();
  const tasksByUser = new Map();

  for (const proj of allProjects) {
    const memberIdList = [
      ...proj.teamMembers.map(String),
      String(proj.projectManager || ''),
      String(proj.teamLead || ''),
      String(proj.owner || '')
    ].filter(Boolean);

    for (const uid of userIds) {
      const uStr = String(uid);
      if (memberIdList.includes(uStr)) {
        if (!projectsByUser.has(uStr)) projectsByUser.set(uStr, []);
        let roleInProject = 'Member';
        if (String(proj.projectManager) === uStr) roleInProject = 'Project Manager';
        else if (String(proj.teamLead) === uStr) roleInProject = 'Team Lead';
        else if (String(proj.owner) === uStr) roleInProject = 'Owner';

        projectsByUser.get(uStr).push({
          _id: proj._id,
          id: String(proj._id),
          name: proj.name,
          code: proj.code || proj.name?.slice(0, 3)?.toUpperCase() || 'NXR',
          status: proj.status,
          progress: proj.progress || 0,
          roleInProject
        });
      }
    }
  }

  for (const task of activeTasks) {
    const aStr = String(task.assignedTo);
    if (!tasksByUser.has(aStr)) tasksByUser.set(aStr, []);
    tasksByUser.get(aStr).push({
      _id: task._id,
      id: String(task._id),
      title: task.title,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      estimatedHours: task.estimatedHours || 0,
      projectName: task.project?.name || 'Project',
      projectCode: task.project?.code || 'NXR'
    });
  }

  const enrichedUsers = users.map((u) => {
    const uObj = sanitize(u);
    const uStr = String(u._id);
    const userAssignedProjects = projectsByUser.get(uStr) || [];
    const userActiveTasks = tasksByUser.get(uStr) || [];
    const activeHours = userActiveTasks.reduce((sum, t) => sum + (Number(t.estimatedHours) || 4), 0);
    const capacity = Number(u.workloadCapacity) || 40;
    const calculatedWorkload = Math.min(100, Math.round((activeHours / capacity) * 100));

    return {
      ...uObj,
      id: String(u._id),
      assignedProjects: userAssignedProjects,
      activeTasksCount: userActiveTasks.length,
      activeTasks: userActiveTasks.slice(0, 5),
      workloadHours: activeHours,
      workloadPercentage: calculatedWorkload,
      workload: calculatedWorkload
    };
  });

  ok(res, {
    items: enrichedUsers,
    total: enrichedUsers.length,
    activeCount: enrichedUsers.filter((u) => u.isActive).length,
    deactivatedCount: enrichedUsers.filter((u) => !u.isActive).length
  });
}

export async function getEmployeeDetailsHandler(req, res) {
  requireId(req.params.employeeId);
  if (req.user.role === 'client') {
    throw Object.assign(new Error('Access denied: Employee profiles are restricted from client accounts'), { status: 403 });
  }

  const user = await User.findById(req.params.employeeId).select('-password');
  if (!user) {
    throw Object.assign(new Error('Employee not found'), { status: 404 });
  }

  const isPMOrAdmin = ['admin', 'project_manager'].includes(req.user.role);
  if (!isPMOrAdmin && !await canAccessMember(req.user, user._id)) {
    throw Object.assign(new Error('Access denied: You are not authorized to view this employee'), { status: 403 });
  }

  const [assignedProjects, activeTasks, completedCount, skills, availabilityHistory, recentActivity] = await Promise.all([
    Project.find({
      $or: [
        { teamMembers: user._id },
        { projectManager: user._id },
        { teamLead: user._id },
        { owner: user._id }
      ]
    }).select('name code status deadline progress budget'),
    Task.find({ assignedTo: user._id, status: { $ne: 'completed' } }).populate('project', 'name code').sort('dueDate'),
    Task.countDocuments({ assignedTo: user._id, status: 'completed' }),
    MemberSkill.find({ member: user._id }).sort('-proficiency'),
    MemberAvailability.find({ member: user._id }).sort('-updatedAt').limit(5),
    ActivityLog.find({
      $or: [{ actor: user._id }, { entityId: user._id }]
    }).populate('actor', 'name').sort('-timestamp').limit(10)
  ]);

  const activeHours = activeTasks.reduce((sum, t) => sum + (Number(t.estimatedHours) || 4), 0);
  const capacity = Number(user.workloadCapacity) || 40;
  const calculatedWorkload = Math.min(100, Math.round((activeHours / capacity) * 100));

  ok(res, {
    employee: {
      ...sanitize(user),
      id: String(user._id),
      workloadPercentage: calculatedWorkload,
      workloadHours: activeHours
    },
    assignedProjects: assignedProjects.map((p) => ({
      _id: p._id,
      id: String(p._id),
      name: p.name,
      code: p.code || p.name?.slice(0, 3)?.toUpperCase() || 'NXR',
      status: p.status,
      deadline: p.deadline,
      progress: p.progress
    })),
    activeTasks: activeTasks.map((t) => ({
      _id: t._id,
      id: String(t._id),
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
      estimatedHours: t.estimatedHours || 0,
      progress: t.progress || 0,
      project: { _id: t.project?._id, name: t.project?.name, code: t.project?.code }
    })),
    completedTasksCount: completedCount,
    skills,
    availabilityHistory,
    recentActivity
  });
}

export async function createEmployeeHandler(req, res) {
  if (!['admin', 'project_manager'].includes(req.user.role)) {
    throw Object.assign(new Error('Unauthorized: Only Project Managers and Admins can create new employees'), { status: 403 });
  }

  const {
    name,
    email,
    employeeId,
    password,
    phone,
    jobTitle,
    department,
    skills,
    experienceYears,
    role = 'team_member',
    assignedProjectIds = [],
    projectId,
    availabilityStatus = 'available',
    workloadCapacity = 40
  } = req.body;

  if (!name || !name.trim()) {
    throw Object.assign(new Error('Employee full name is required'), { status: 400 });
  }
  if (!email || !email.trim()) {
    throw Object.assign(new Error('Official email address is required'), { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedEmail)) {
    throw Object.assign(new Error('Please provide a valid email address'), { status: 400 });
  }

  if (await User.exists({ email: normalizedEmail })) {
    throw Object.assign(new Error(`An account with email "${normalizedEmail}" already exists`), { status: 409 });
  }

  let finalEmployeeId = (employeeId || '').trim().toUpperCase();
  if (!finalEmployeeId) {
    finalEmployeeId = await generateNextEmployeeId();
  } else {
    if (await User.exists({ employeeId: finalEmployeeId })) {
      throw Object.assign(new Error(`Employee ID "${finalEmployeeId}" is already assigned to another staff member`), { status: 409 });
    }
  }

  const allowedRoles = ['team_member', 'team_lead', 'project_manager'];
  if (req.user.role === 'admin') allowedRoles.push('admin');
  if (!allowedRoles.includes(role)) {
    throw Object.assign(new Error(`Invalid role "${role}". Allowed roles: ${allowedRoles.join(', ')}`), { status: 400 });
  }

  const tempPassword = password && password.length >= 8
    ? password
    : `Nexora@${Math.floor(100000 + Math.random() * 900000)}!`;

  const parsedSkills = Array.isArray(skills)
    ? skills.map((s) => String(s).trim()).filter(Boolean)
    : typeof skills === 'string'
    ? skills.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const validAvailability = ['available', 'busy', 'unavailable'];
  const finalAvailability = validAvailability.includes(availabilityStatus) ? availabilityStatus : 'available';

  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    employeeId: finalEmployeeId,
    password: tempPassword,
    role,
    phone: (phone || '').trim(),
    jobTitle: (jobTitle || '').trim() || (role === 'team_lead' ? 'Technical Lead' : 'Software Engineer'),
    department: (department || '').trim() || 'Engineering',
    skills: parsedSkills,
    experienceYears: Number(experienceYears) >= 0 ? Number(experienceYears) : 1,
    availabilityStatus: finalAvailability,
    workloadCapacity: Number(workloadCapacity) > 0 ? Number(workloadCapacity) : 40,
    isActive: true
  });

  if (parsedSkills.length) {
    for (const skillName of parsedSkills) {
      await MemberSkill.create({
        member: user._id,
        skillName,
        proficiency: 'intermediate',
        experienceYears: Number(experienceYears) >= 1 ? Number(experienceYears) : 1
      });
    }
  }

  // Handle project assignments
  const projectList = [...new Set([
    ...(Array.isArray(assignedProjectIds) ? assignedProjectIds : [assignedProjectIds]),
    ...(projectId ? [projectId] : [])
  ].filter(Boolean))];

  if (projectList.length > 0) {
    for (const pId of projectList) {
      if (isId(pId)) {
        const proj = await Project.findById(pId);
        if (proj && !proj.teamMembers.map(String).includes(String(user._id))) {
          proj.teamMembers.push(user._id);
          await proj.save();
          cache.invalidateProject(proj._id);
          try {
            emitMemberAdded(proj._id, user);
            const m = await calculateProjectMetrics(proj._id);
            emitProjectProgressUpdated(proj._id, m);
          } catch {}
        }
      }
    }
  }

  // Notification for the new employee
  const notif = await Notification.create({
    recipient: user._id,
    type: 'system',
    title: 'Welcome to NEXORA',
    message: `Your employee profile (${finalEmployeeId}) has been established by ${req.user.name}.`,
    priority: 'medium'
  });
  try { emitNotification(notif, user._id); } catch {}

  // Audit log
  await audit(req.user._id, 'employee_created', 'User', user._id, {
    name: user.name,
    email: user.email,
    employeeId: user.employeeId,
    role: user.role,
    department: user.department,
    assignedProjects: projectList
  });

  try { emitUserUpdated(user); } catch {}

  ok(res, {
    message: `Employee ${user.name} (${finalEmployeeId}) created successfully`,
    employee: sanitize(user),
    temporaryPassword: tempPassword,
    assignedProjects: projectList
  }, 201);
}

export async function updateEmployeeHandler(req, res) {
  requireId(req.params.employeeId);
  if (!['admin', 'project_manager'].includes(req.user.role)) {
    throw Object.assign(new Error('Unauthorized: Only Project Managers and Admins can update employees'), { status: 403 });
  }

  const user = await User.findById(req.params.employeeId);
  if (!user) {
    throw Object.assign(new Error('Employee not found'), { status: 404 });
  }

  // Protect Admin accounts
  if (user.role === 'admin' && req.user.role !== 'admin') {
    throw Object.assign(new Error('Only Admins can modify Admin accounts'), { status: 403 });
  }

  const {
    name,
    email,
    employeeId,
    phone,
    jobTitle,
    department,
    skills,
    experienceYears,
    role,
    availabilityStatus,
    workloadCapacity,
    assignedProjectIds,
    isActive
  } = req.body;

  if (email && email.toLowerCase().trim() !== user.email) {
    const normalizedEmail = email.toLowerCase().trim();
    if (await User.exists({ email: normalizedEmail, _id: { $ne: user._id } })) {
      throw Object.assign(new Error(`Email "${normalizedEmail}" is already used by another account`), { status: 409 });
    }
    user.email = normalizedEmail;
  }

  if (employeeId && employeeId.trim().toUpperCase() !== user.employeeId) {
    const normalizedEmpId = employeeId.trim().toUpperCase();
    if (await User.exists({ employeeId: normalizedEmpId, _id: { $ne: user._id } })) {
      throw Object.assign(new Error(`Employee ID "${normalizedEmpId}" is already assigned to another account`), { status: 409 });
    }
    user.employeeId = normalizedEmpId;
  }

  if (name && name.trim()) user.name = name.trim();
  if (phone !== undefined) user.phone = String(phone).trim();
  if (jobTitle !== undefined) user.jobTitle = String(jobTitle).trim();
  if (department !== undefined) user.department = String(department).trim();
  if (experienceYears !== undefined && Number(experienceYears) >= 0) user.experienceYears = Number(experienceYears);
  if (workloadCapacity !== undefined && Number(workloadCapacity) > 0) user.workloadCapacity = Number(workloadCapacity);

  if (role && role !== user.role) {
    const allowedRoles = ['team_member', 'team_lead', 'project_manager'];
    if (req.user.role === 'admin') allowedRoles.push('admin');
    if (!allowedRoles.includes(role)) {
      throw Object.assign(new Error(`Invalid role "${role}"`), { status: 400 });
    }
    if (String(user._id) === String(req.user._id) && req.user.role === 'admin' && role !== 'admin') {
      throw Object.assign(new Error('Self-demotion of the active Admin account is prohibited'), { status: 400 });
    }
    user.role = role;
  }

  if (availabilityStatus && ['available', 'busy', 'unavailable', 'absent', 'overloaded'].includes(availabilityStatus)) {
    user.availabilityStatus = availabilityStatus;
  }

  if (typeof isActive === 'boolean') {
    user.isActive = isActive;
    if (!isActive) {
      user.availabilityStatus = 'unavailable';
      user.deactivatedAt = new Date();
      user.deactivatedBy = req.user._id;
    } else {
      user.deactivatedAt = null;
      user.deactivatedBy = null;
      user.deactivationReason = null;
    }
  }

  // Update skills
  if (skills !== undefined) {
    const cleanSkills = Array.isArray(skills)
      ? skills.map((s) => String(s).trim()).filter(Boolean)
      : typeof skills === 'string'
      ? skills.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    user.skills = cleanSkills;

    for (const skillName of cleanSkills) {
      await MemberSkill.updateOne(
        { member: user._id, skillName: new RegExp(`^${skillName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i') },
        { member: user._id, skillName, proficiency: 'intermediate', experienceYears: user.experienceYears || 2, lastUsed: new Date() },
        { upsert: true }
      );
    }
    const cleanLower = cleanSkills.map((s) => s.toLowerCase());
    const existing = await MemberSkill.find({ member: user._id });
    for (const es of existing) {
      if (!cleanLower.includes(es.skillName.toLowerCase())) {
        await MemberSkill.deleteOne({ _id: es._id });
      }
    }
  }

  // Update project assignments if provided
  if (Array.isArray(assignedProjectIds)) {
    const targetProjectIds = assignedProjectIds.filter(isId).map(String);
    const currentProjects = await Project.find({ teamMembers: user._id });
    const currentProjectIds = currentProjects.map((p) => String(p._id));

    // Projects to add to
    const toAdd = targetProjectIds.filter((pId) => !currentProjectIds.includes(pId));
    for (const pId of toAdd) {
      const proj = await Project.findById(pId);
      if (proj && !proj.teamMembers.map(String).includes(String(user._id))) {
        proj.teamMembers.push(user._id);
        await proj.save();
        cache.invalidateProject(proj._id);
      }
    }

    // Projects to remove from
    const toRemove = currentProjectIds.filter((pId) => !targetProjectIds.includes(pId));
    for (const pId of toRemove) {
      const proj = await Project.findById(pId);
      if (proj) {
        if (req.body.reassignTasksTo) {
          await Task.updateMany(
            { project: proj._id, assignedTo: user._id, status: { $ne: 'completed' } },
            { $set: { assignedTo: req.body.reassignTasksTo, owner: req.body.reassignTasksTo } }
          );
        }
        proj.teamMembers = proj.teamMembers.filter((m) => String(m) !== String(user._id));
        await proj.save();
        cache.invalidateProject(proj._id);
      }
    }
  }

  await user.save();
  await audit(req.user._id, 'employee_updated', 'User', user._id, {
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department
  });
  try { emitUserUpdated(user); } catch {}

  ok(res, {
    message: `Employee ${user.name} updated successfully`,
    employee: sanitize(user)
  });
}

export async function deactivateEmployeeHandler(req, res) {
  requireId(req.params.employeeId);
  if (!['admin', 'project_manager'].includes(req.user.role)) {
    throw Object.assign(new Error('Unauthorized: Only Project Managers and Admins can deactivate employees'), { status: 403 });
  }

  if (String(req.user._id) === String(req.params.employeeId)) {
    throw Object.assign(new Error('Self-deactivation is prohibited: you cannot deactivate your own account'), { status: 400 });
  }

  const user = await User.findById(req.params.employeeId);
  if (!user) {
    throw Object.assign(new Error('Employee not found'), { status: 404 });
  }

  if (user.role === 'admin' && req.user.role !== 'admin') {
    throw Object.assign(new Error('Project Managers cannot deactivate Admin accounts'), { status: 403 });
  }

  const activeTasks = await Task.find({
    assignedTo: user._id,
    status: { $ne: 'completed' }
  }).populate('project', 'name');

  const { reason = 'Deactivated by Project Manager', reassignTasksTo, force = false } = req.body;

  if (activeTasks.length > 0) {
    if (reassignTasksTo) {
      requireId(reassignTasksTo);
      const replacement = await User.findById(reassignTasksTo);
      if (!replacement || !replacement.isActive || replacement.role === 'client') {
        throw Object.assign(new Error('Invalid replacement team member: replacement must be an active internal staff member'), { status: 400 });
      }

      for (const task of activeTasks) {
        const prev = task.assignedTo;
        task.assignedTo = replacement._id;
        task.owner = replacement._id;
        await task.save();

        await TaskAssignmentHistory.create({
          task: task._id,
          previousMember: prev,
          newMember: replacement._id,
          reason: `Auto-reassigned due to deactivation of ${user.name}: ${reason}`,
          approvedBy: req.user._id
        });

        const notif = await Notification.create({
          recipient: replacement._id,
          type: 'system',
          title: 'Task reassigned to you',
          message: `Task "${task.title}" has been reassigned to you from ${user.name}.`,
          relatedProject: task.project?._id || task.project,
          relatedTask: task._id
        });
        try { emitNotification(notif, replacement._id); } catch {}
      }
    } else if (!force) {
      return res.status(409).json({
        success: false,
        hasActiveTasks: true,
        activeTasksCount: activeTasks.length,
        activeTasks: activeTasks.map((t) => ({
          _id: t._id,
          id: String(t._id),
          title: t.title,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate,
          project: { _id: t.project?._id, name: t.project?.name }
        })),
        message: `Cannot deactivate ${user.name}: this employee has ${activeTasks.length} active task(s). Please choose a replacement assignee to reassign deliverables or pass force=true.`
      });
    } else {
      await Task.updateMany(
        { assignedTo: user._id, status: { $ne: 'completed' } },
        { $unset: { assignedTo: 1, owner: 1 } }
      );
    }
  }

  user.isActive = false;
  user.availabilityStatus = 'unavailable';
  user.deactivatedAt = new Date();
  user.deactivatedBy = req.user._id;
  user.deactivationReason = reason;
  await user.save();

  const affectedProjects = await Project.find({
    $or: [{ teamMembers: user._id }, { projectManager: user._id }, { teamLead: user._id }]
  });
  for (const p of affectedProjects) {
    cache.invalidateProject(p._id);
    try {
      const m = await calculateProjectMetrics(p._id);
      emitProjectProgressUpdated(p._id, m);
    } catch {}
  }

  await audit(req.user._id, 'employee_deactivated', 'User', user._id, {
    name: user.name,
    email: user.email,
    employeeId: user.employeeId,
    reason,
    reassignedTo: reassignTasksTo || null,
    reassignedTasksCount: reassignTasksTo ? activeTasks.length : 0
  });

  try { emitUserDeactivated(user._id, 'deactivated'); } catch {}

  ok(res, {
    message: `Employee ${user.name} (${user.employeeId || user.email}) deactivated successfully`,
    employee: sanitize(user),
    reassignedTasksCount: reassignTasksTo ? activeTasks.length : 0
  });
}

export async function restoreEmployeeHandler(req, res) {
  requireId(req.params.employeeId);
  if (!['admin', 'project_manager'].includes(req.user.role)) {
    throw Object.assign(new Error('Unauthorized: Only Project Managers and Admins can restore employees'), { status: 403 });
  }

  const user = await User.findById(req.params.employeeId);
  if (!user) {
    throw Object.assign(new Error('Employee not found'), { status: 404 });
  }

  user.isActive = true;
  user.availabilityStatus = 'available';
  user.deactivatedAt = null;
  user.deactivatedBy = null;
  user.deactivationReason = null;
  await user.save();

  await audit(req.user._id, 'employee_restored', 'User', user._id, {
    name: user.name,
    email: user.email,
    employeeId: user.employeeId
  });

  try { emitUserUpdated(user); } catch {}

  ok(res, {
    message: `Employee account for ${user.name} (${user.employeeId || user.email}) has been restored to active status`,
    employee: sanitize(user)
  });
}

export async function assignEmployeeProjectHandler(req, res) {
  requireId(req.params.employeeId);
  if (!['admin', 'project_manager'].includes(req.user.role)) {
    throw Object.assign(new Error('Unauthorized: Only Project Managers and Admins can assign employees to projects'), { status: 403 });
  }

  const { projectId } = req.body;
  requireId(projectId);

  const [user, project] = await Promise.all([
    User.findById(req.params.employeeId),
    Project.findById(projectId)
  ]);

  if (!user || !user.isActive) throw Object.assign(new Error('Employee not found or inactive'), { status: 404 });
  if (!project) throw Object.assign(new Error('Project not found'), { status: 404 });
  if (user.role === 'client') throw Object.assign(new Error('Clients cannot be added to project delivery teams'), { status: 400 });

  if (project.teamMembers.map(String).includes(String(user._id))) {
    throw Object.assign(new Error(`${user.name} is already assigned to ${project.name}`), { status: 409 });
  }

  project.teamMembers.push(user._id);
  await project.save();
  cache.invalidateProject(project._id);

  const notif = await Notification.create({
    recipient: user._id,
    type: 'system',
    title: 'Assigned to Project',
    message: `You have been assigned to ${project.name} by ${req.user.name}.`,
    relatedProject: project._id
  });
  try { emitNotification(notif, user._id); } catch {}
  try {
    emitMemberAdded(project._id, user);
    const m = await calculateProjectMetrics(project._id);
    emitProjectProgressUpdated(project._id, m);
  } catch {}

  await audit(req.user._id, 'employee_assigned_to_project', 'Project', project._id, {
    employeeId: user._id,
    employeeName: user.name,
    projectName: project.name
  });

  ok(res, {
    message: `${user.name} assigned to ${project.name} successfully`,
    project: await project.populate('teamMembers', 'name role email availabilityStatus skills jobTitle department employeeId')
  });
}

export async function removeEmployeeProjectHandler(req, res) {
  requireId(req.params.employeeId);
  requireId(req.params.projectId);
  if (!['admin', 'project_manager'].includes(req.user.role)) {
    throw Object.assign(new Error('Unauthorized: Only Project Managers and Admins can unassign employees from projects'), { status: 403 });
  }

  const [user, project] = await Promise.all([
    User.findById(req.params.employeeId),
    Project.findById(req.params.projectId)
  ]);

  if (!user) throw Object.assign(new Error('Employee not found'), { status: 404 });
  if (!project) throw Object.assign(new Error('Project not found'), { status: 404 });

  const activeTasks = await Task.find({
    project: project._id,
    assignedTo: user._id,
    status: { $ne: 'completed' }
  });

  const { reassignTasksTo, force = false } = req.body || {};

  if (activeTasks.length > 0) {
    if (reassignTasksTo) {
      requireId(reassignTasksTo);
      const replacement = await User.findById(reassignTasksTo);
      if (!replacement || !replacement.isActive || replacement.role === 'client') {
        throw Object.assign(new Error('Invalid replacement team member'), { status: 400 });
      }

      for (const task of activeTasks) {
        const prev = task.assignedTo;
        task.assignedTo = replacement._id;
        task.owner = replacement._id;
        await task.save();

        await TaskAssignmentHistory.create({
          task: task._id,
          previousMember: prev,
          newMember: replacement._id,
          reason: `Reassigned due to removal of ${user.name} from ${project.name}`,
          approvedBy: req.user._id
        });
      }
    } else if (!force) {
      throw Object.assign(new Error(`Verification failed: ${user.name} has ${activeTasks.length} active task(s) in this project. Please select a replacement team member or confirm force unassignment.`), { status: 422 });
    } else {
      await Task.updateMany(
        { project: project._id, assignedTo: user._id, status: { $ne: 'completed' } },
        { $unset: { assignedTo: 1, owner: 1 } }
      );
    }
  }

  project.teamMembers = project.teamMembers.filter((id) => String(id) !== String(user._id));
  await project.save();
  cache.invalidateProject(project._id);

  const notif = await Notification.create({
    recipient: user._id,
    type: 'system',
    title: 'Unassigned from Project',
    message: `You have been unassigned from ${project.name}.`,
    relatedProject: project._id
  });
  try { emitNotification(notif, user._id); } catch {}
  try {
    emitMemberRemoved(project._id, user._id);
    const m = await calculateProjectMetrics(project._id);
    emitProjectProgressUpdated(project._id, m);
  } catch {}

  await audit(req.user._id, 'employee_unassigned_from_project', 'Project', project._id, {
    employeeId: user._id,
    employeeName: user.name,
    projectName: project.name
  });

  ok(res, {
    message: `${user.name} unassigned from ${project.name} successfully`,
    project: await project.populate('teamMembers', 'name role email availabilityStatus skills jobTitle department employeeId')
  });
}

// --- Enterprise SaaS Modules 2, 3 & 6 Handlers ---

export async function getActiveSessionsHandler(req, res) {
  const user = await User.findById(req.user._id).select('lastActiveSession tokenVersion lastLogin name email role');
  ok(res, {
    currentSession: {
      device: user.lastActiveSession?.device || 'Desktop Workstation',
      browser: user.lastActiveSession?.browser || 'Google Chrome',
      ip: user.lastActiveSession?.ip || '127.0.0.1',
      loginTime: user.lastActiveSession?.loginTime || user.lastLogin || new Date(),
      tokenVersion: user.tokenVersion || 1,
      isCurrent: true
    },
    user: { id: user._id, name: user.name, email: user.email, role: user.role }
  });
}

export async function revokeSessionsHandler(req, res) {
  const user = await User.findById(req.user._id);
  user.tokenVersion = (user.tokenVersion || 1) + 1;
  await user.save();
  await audit(user._id, 'session_revoked_all', 'User', user._id, { newVersion: user.tokenVersion });
  ok(res, {
    message: 'All other sessions have been revoked. Current session is refreshed.',
    token: tokenFor(user),
    tokenVersion: user.tokenVersion
  });
}

export async function getAuditLogsHandler(req, res) {
  if (!['admin', 'project_manager'].includes(req.user.role)) {
    throw Object.assign(new Error('Audit log access denied: only Project Managers and Administrators can view organization audit records'), { status: 403 });
  }
  const { action, actor, entityType, startDate, endDate, page = 1, limit = 50 } = req.query;
  const filter = {};
  if (action) filter.action = action;
  if (actor && isId(actor)) filter.actor = actor;
  if (entityType) filter.entityType = entityType;
  if (startDate || endDate) {
    filter.timestamp = {};
    if (startDate) filter.timestamp.$gte = new Date(startDate);
    if (endDate) filter.timestamp.$lte = new Date(endDate);
  }
  const skip = (Math.max(1, Number(page)) - 1) * Math.min(100, Math.max(1, Number(limit)));
  const [logs, total] = await Promise.all([
    ActivityLog.find(filter)
      .populate('actor', 'name email role employeeId')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(Math.min(100, Math.max(1, Number(limit)))),
    ActivityLog.countDocuments(filter)
  ]);
  ok(res, {
    items: logs,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / Number(limit))
    }
  });
}

export async function updateMyAvailabilityHandler(req, res) {
  const { availabilityStatus, workloadCapacity, skills } = req.body;
  const user = await User.findById(req.user._id);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
  if (availabilityStatus && availability.includes(availabilityStatus)) {
    user.availabilityStatus = availabilityStatus;
  }
  if (workloadCapacity && Number(workloadCapacity) > 0) {
    user.workloadCapacity = Number(workloadCapacity);
  }
  if (Array.isArray(skills)) {
    user.skills = skills.map(String).map(s => s.trim()).filter(Boolean);
  }
  await user.save();
  await audit(user._id, 'profile_availability_updated', 'User', user._id, {
    availabilityStatus: user.availabilityStatus,
    workloadCapacity: user.workloadCapacity
  });
  ok(res, { user: sanitize(user), message: 'Availability and personal profile updated successfully' });
}

export async function getProjectBaselineHandler(req, res) {
  const project = await loadProject(req.params.projectId);
  if (!canAccessProject(req.user, project)) throw Object.assign(new Error('Project access denied'), { status: 403 });
  const isClient = req.user.role === 'client';

  const baselineStart = project.baselineStartDate || project.startDate;
  const baselineDeadline = project.baselineDeadline || project.deadline;
  const currentDeadline = new Date(project.deadline);
  const varianceDays = baselineDeadline ? Math.round((currentDeadline - new Date(baselineDeadline)) / 86400000) : 0;

  ok(res, {
    projectId: project._id,
    projectName: project.name,
    hasBaseline: Boolean(project.baselineDeadline),
    baselineStartDate: baselineStart,
    baselineDeadline: baselineDeadline,
    currentStartDate: project.startDate,
    currentDeadline: project.deadline,
    varianceDays,
    varianceStatus: varianceDays > 0 ? 'delayed' : varianceDays < 0 ? 'ahead' : 'on_track',
    changeHistory: isClient ? [] : (project.baselineChangeHistory || [])
  });
}

export async function setProjectBaselineHandler(req, res) {
  const project = await loadProject(req.params.projectId);
  if (!manageRoles.includes(req.user.role) || !canAccessProject(req.user, project)) {
    throw Object.assign(new Error('Baseline modification denied: only managers can modify baselines'), { status: 403 });
  }
  const { reason, revisedDeadline, revisedStartDate } = req.body;
  const prevDeadline = project.baselineDeadline || project.deadline;
  const prevStart = project.baselineStartDate || project.startDate;

  if (!project.baselineDeadline) {
    project.baselineStartDate = project.startDate;
    project.baselineDeadline = project.deadline;
  }

  if (revisedDeadline) {
    const newDead = new Date(revisedDeadline);
    if (Number.isNaN(newDead.getTime())) throw Object.assign(new Error('Invalid revisedDeadline'), { status: 400 });

    project.baselineChangeHistory = project.baselineChangeHistory || [];
    project.baselineChangeHistory.push({
      previousDeadline: prevDeadline,
      newDeadline: newDead,
      previousStartDate: prevStart,
      newStartDate: revisedStartDate ? new Date(revisedStartDate) : project.startDate,
      reason: reason || 'Approved project schedule realignment',
      changedBy: req.user._id,
      changedAt: new Date()
    });

    project.deadline = newDead;
    if (revisedStartDate) project.startDate = new Date(revisedStartDate);
    project.baselineVarianceDays = Math.round((newDead - new Date(project.baselineDeadline)) / 86400000);
    await project.save();

    await audit(req.user._id, 'project_baseline_revised', 'Project', project._id, {
      previousDeadline: prevDeadline,
      newDeadline: newDead,
      reason
    });
  } else {
    project.baselineStartDate = project.startDate;
    project.baselineDeadline = project.deadline;
    project.baselineVarianceDays = 0;
    await project.save();
    await audit(req.user._id, 'project_baseline_locked', 'Project', project._id);
  }

  const metrics = await calculateProjectMetrics(project._id);
  cache.invalidateProject(project._id);
  ok(res, { project, metrics, message: 'Project baseline saved successfully' });
}

export async function getResourceAllocationOverviewHandler(req, res) {
  if (req.user.role === 'client') {
    throw Object.assign(new Error('Resource allocation access denied for client accounts'), { status: 403 });
  }
  const projectId = req.query.projectId;
  let projects = [];
  if (projectId) {
    const p = await loadProject(projectId);
    if (!canAccessProject(req.user, p)) throw Object.assign(new Error('Project access denied'), { status: 403 });
    projects = [p];
  } else {
    projects = (await Project.find()).filter((p) => canAccessProject(req.user, p));
  }

  const projectIds = projects.map(p => p._id);
  const isPM = ['admin', 'project_manager'].includes(req.user.role);
  const memberQuery = isPM
    ? { isActive: true, role: { $in: ['team_member', 'team_lead', 'project_manager'] } }
    : { _id: { $in: projectMemberIds(projects) }, isActive: true };

  const [members, allTasks] = await Promise.all([
    User.find(memberQuery).select('name email role employeeId department jobTitle skills availabilityStatus workloadCapacity productivityScore isActive phone experienceYears'),
    Task.find({ project: { $in: projectIds }, status: { $ne: 'completed' } }).populate('assignedTo project', 'name')
  ]);

  let totalCapacityHours = 0;
  let totalAllocatedHours = 0;
  const memberBreakdown = [];
  const overloadedMembers = [];
  const underutilizedMembers = [];
  const skillFrequency = {};

  for (const m of members) {
    const weeklyCapacity = m.workloadCapacity || 40;
    totalCapacityHours += weeklyCapacity;
    const assignedTasks = allTasks.filter(t => String(t.assignedTo?._id || t.assignedTo) === String(m._id));
    const activeTasksCount = assignedTasks.length;
    const committedHours = assignedTasks.reduce((sum, t) => sum + (t.estimatedHours || 8), 0);
    totalAllocatedHours += committedHours;
    const utilizationPct = Math.round((committedHours / weeklyCapacity) * 100);

    const mSkills = (m.skills || []).map(s => String(s).toLowerCase());
    mSkills.forEach(s => {
      skillFrequency[s] = (skillFrequency[s] || 0) + 1;
    });

    const row = {
      id: m._id,
      name: m.name,
      email: m.email,
      employeeId: m.employeeId || 'NEX-0000',
      role: m.role,
      department: m.department || 'Engineering',
      jobTitle: m.jobTitle || 'Engineer',
      availabilityStatus: m.availabilityStatus,
      workloadCapacity: weeklyCapacity,
      committedHours,
      activeTasksCount,
      utilizationPercentage: utilizationPct,
      status: utilizationPct > 100 ? 'overloaded' : utilizationPct < 50 ? 'underutilized' : 'balanced'
    };

    memberBreakdown.push(row);
    if (utilizationPct > 100 || m.availabilityStatus === 'overloaded') overloadedMembers.push(row);
    else if (utilizationPct < 50 && m.availabilityStatus === 'available') underutilizedMembers.push(row);
  }

  const unallocatedHours = Math.max(0, totalCapacityHours - totalAllocatedHours);
  const overallUtilizationPct = totalCapacityHours ? Math.round((totalAllocatedHours / totalCapacityHours) * 100) : 0;

  const now = new Date();
  const allocationConflicts = [];
  for (const t of allTasks) {
    const assignee = memberBreakdown.find(m => String(m.id) === String(t.assignedTo?._id || t.assignedTo));
    if (assignee && assignee.status === 'overloaded' && t.dueDate && (new Date(t.dueDate) - now < 7 * 86400000)) {
      allocationConflicts.push({
        taskId: t._id,
        taskTitle: t.title,
        projectName: t.project?.name || 'Project',
        assigneeName: assignee.name,
        dueDate: t.dueDate,
        issue: `${assignee.name} is overloaded (${assignee.utilizationPercentage}%) with near-term deadline (${new Date(t.dueDate).toLocaleDateString()})`
      });
    }
  }

  ok(res, {
    totalCapacityHours,
    totalAllocatedHours,
    unallocatedHours,
    overallUtilizationPercentage: overallUtilizationPct,
    overloadedCount: overloadedMembers.length,
    underutilizedCount: underutilizedMembers.length,
    totalActiveMembers: members.length,
    members: memberBreakdown,
    overloadedMembers,
    underutilizedMembers,
    allocationConflicts,
    skillDistribution: skillFrequency
  });
}

// ==========================================
// UNIFIED ACTIVITY TIMELINE (ROLE-SCOPED)
// ==========================================
export async function getActivityTimelineHandler(req, res) {
  const visible = (await Project.find()).filter((p) => canAccessProject(req.user, p));
  const projectIds = visible.map((p) => p._id);
  const isClient = req.user.role === 'client';
  const isMember = req.user.role === 'team_member';

  const { page = 1, limit = 40, projectId, action: actionFilter, startDate, endDate } = req.query;
  const skip = (Math.max(1, Number(page)) - 1) * Math.min(100, Math.max(1, Number(limit)));

  const filter = {};
  if (projectId) {
    if (!projectIds.some(id => String(id) === String(projectId))) {
      throw Object.assign(new Error('Project access denied'), { status: 403 });
    }
    filter.entityId = projectId;
  } else if (isClient) {
    filter.entityId = { $in: projectIds };
    filter.action = { $in: [
      'project_created', 'project_updated', 'milestone_completed',
      'document_uploaded', 'document_approved', 'project_update_published'
    ] };
  } else if (isMember) {
    filter.$or = [
      { actor: req.user._id },
      { entityId: { $in: projectIds } }
    ];
  } else {
    filter.entityId = { $in: projectIds };
  }

  if (actionFilter) {
    if (!isClient || ['project_created', 'project_updated', 'milestone_completed', 'document_uploaded', 'document_approved'].includes(actionFilter)) {
      filter.action = actionFilter;
    }
  }

  if (startDate || endDate) {
    filter.timestamp = {};
    if (startDate) filter.timestamp.$gte = new Date(startDate);
    if (endDate) filter.timestamp.$lte = new Date(endDate);
  }

  const [logs, total] = await Promise.all([
    ActivityLog.find(filter)
      .populate('actor', isClient ? 'role' : 'name email role employeeId')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(Math.min(100, Math.max(1, Number(limit)))),
    ActivityLog.countDocuments(filter)
  ]);

  const sanitized = isClient ? logs.map(l => {
    const item = l.toObject();
    item.actor = { name: 'NEXORA Delivery Team', role: 'team' };
    if (item.metadata?.employeeId) delete item.metadata.employeeId;
    if (item.metadata?.user) delete item.metadata.user;
    return item;
  }) : logs;

  ok(res, {
    items: sanitized,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / Number(limit))
    }
  });
}

// ==========================================
// PRODUCTIVITY: PROJECT TEMPLATES
// ==========================================
export async function listProjectTemplatesHandler(req, res) {
  if (req.user.role === 'client') {
    throw Object.assign(new Error('Client access to project templates is restricted'), { status: 403 });
  }
  const templates = await Project.find({ isTemplate: true }).select('name description templateCategory priority status deadline budget');
  ok(res, { items: templates });
}

export async function saveProjectAsTemplateHandler(req, res) {
  if (!['admin', 'project_manager'].includes(req.user.role)) {
    throw Object.assign(new Error('Only Project Managers and Administrators can save project templates'), { status: 403 });
  }
  const project = await loadProject(req.params.projectId);
  project.isTemplate = true;
  project.templateCategory = req.body.category || project.templateCategory || 'Standard Portfolio';
  await project.save();
  await audit(req.user._id, 'project_template_saved', 'Project', project._id, { category: project.templateCategory });
  ok(res, { project });
}

export async function createProjectFromTemplateHandler(req, res) {
  if (!['admin', 'project_manager'].includes(req.user.role)) {
    throw Object.assign(new Error('Only Project Managers and Administrators can instantiate templates'), { status: 403 });
  }
  const { templateId, name, startDate, deadline, client: clientId } = req.body;
  if (!name || !startDate || !deadline) {
    throw Object.assign(new Error('Project name, start date, and deadline are required'), { status: 400 });
  }
  const template = await Project.findById(templateId);
  if (!template) throw Object.assign(new Error('Template not found'), { status: 404 });

  const newProject = await Project.create({
    name,
    description: template.description || `${name} (Instantiated from template: ${template.name})`,
    status: 'planning',
    priority: template.priority || 'medium',
    startDate: new Date(startDate),
    deadline: new Date(deadline),
    owner: req.user._id,
    projectManager: req.user._id,
    client: clientId || template.client,
    budget: template.budget || 0,
    isTemplate: false
  });

  const templateMilestones = await Milestone.find({ project: template._id });
  for (const m of templateMilestones) {
    await Milestone.create({
      title: m.title,
      description: m.description,
      project: newProject._id,
      dueDate: new Date(deadline),
      status: 'pending'
    });
  }

  await audit(req.user._id, 'project_created_from_template', 'Project', newProject._id, { templateId: template._id });
  ok(res, { project: newProject }, 201);
}

// ==========================================
// RECURRING TASKS CONFIGURATION
// ==========================================
export async function updateTaskRecurrenceHandler(req, res) {
  if (req.user.role === 'client') {
    throw Object.assign(new Error('Clients cannot configure task recurrence'), { status: 403 });
  }
  const task = await Task.findById(req.params.taskId);
  if (!task) throw Object.assign(new Error('Task not found'), { status: 404 });
  const project = await loadProject(task.project);
  if (!canAccessProject(req.user, project)) {
    throw Object.assign(new Error('Project access denied'), { status: 403 });
  }

  const { frequency = 'weekly', interval = 1, isPaused = false } = req.body;
  task.recurrence = {
    frequency,
    interval: Number(interval) || 1,
    isPaused: Boolean(isPaused),
    nextRun: new Date(Date.now() + (frequency === 'daily' ? 86400000 : frequency === 'weekly' ? 7 * 86400000 : 30 * 86400000))
  };
  await task.save();
  await audit(req.user._id, 'task_recurrence_updated', 'Task', task._id, { recurrence: task.recurrence });
  ok(res, { task });
}

// ==========================================
// CSV IMPORT & EXPORT
// ==========================================
export async function exportTasksCsvHandler(req, res) {
  const { projectId } = req.params;
  const project = await loadProject(projectId);
  if (!canAccessProject(req.user, project)) {
    throw Object.assign(new Error('Project access denied'), { status: 403 });
  }
  const isClient = req.user.role === 'client';
  const query = { project: project._id };
  if (isClient) query.isPublicToClient = { $ne: false };

  const tasks = await Task.find(query).populate('assignedTo', 'name email');
  let csv = 'Task ID,Title,Status,Priority,Due Date,Estimated Hours,Actual Hours,Progress' + (isClient ? '\n' : ',Assignee\n');
  for (const t of tasks) {
    const row = [
      String(t._id),
      `"${(t.title || '').replace(/"/g, '""')}"`,
      t.status,
      t.priority,
      t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : '',
      t.estimatedHours || 0,
      t.actualHours || 0,
      `${t.progress || 0}%`
    ];
    if (!isClient) {
      row.push(`"${(t.assignedTo?.name || 'Unassigned').replace(/"/g, '""')}"`);
    }
    csv += row.join(',') + '\n';
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${project.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-tasks.csv"`);
  res.status(200).send(csv);
}

export async function importTasksCsvPreviewHandler(req, res) {
  if (req.user.role === 'client') {
    throw Object.assign(new Error('Clients cannot import tasks'), { status: 403 });
  }
  const { projectId, rows = [] } = req.body;
  const project = await loadProject(projectId);
  if (!canAccessProject(req.user, project)) {
    throw Object.assign(new Error('Project access denied'), { status: 403 });
  }

  const existingTasks = await Task.find({ project: project._id }).select('title');
  const existingTitles = new Set(existingTasks.map(t => t.title.toLowerCase().trim()));

  const validRows = [];
  const errorRows = [];
  let duplicates = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const title = String(r.title || r.Title || '').trim();
    const dueDate = r.dueDate || r.DueDate || r['Due Date'];
    if (!title) {
      errorRows.push({ row: i + 1, error: 'Missing title' });
      continue;
    }
    if (!dueDate || isNaN(new Date(dueDate).getTime())) {
      errorRows.push({ row: i + 1, error: 'Invalid or missing due date' });
      continue;
    }
    if (existingTitles.has(title.toLowerCase())) {
      duplicates++;
    }
    validRows.push({
      title,
      dueDate: new Date(dueDate),
      status: ['todo', 'in-progress', 'completed', 'blocked'].includes(r.status?.toLowerCase()) ? r.status.toLowerCase() : 'todo',
      priority: ['low', 'medium', 'high', 'critical'].includes(r.priority?.toLowerCase()) ? r.priority.toLowerCase() : 'medium',
      estimatedHours: Number(r.estimatedHours || r['Estimated Hours']) || 4
    });
  }

  ok(res, {
    totalRows: rows.length,
    validCount: validRows.length,
    errorCount: errorRows.length,
    duplicateCount: duplicates,
    validRows: validRows.slice(0, 10),
    errorRows
  });
}

export async function importTasksCsvCommitHandler(req, res) {
  if (!['admin', 'project_manager', 'team_lead'].includes(req.user.role)) {
    throw Object.assign(new Error('Only Project Managers and Team Leads can import tasks'), { status: 403 });
  }
  const { projectId, tasks = [] } = req.body;
  const project = await loadProject(projectId);
  if (!canAccessProject(req.user, project)) {
    throw Object.assign(new Error('Project access denied'), { status: 403 });
  }

  const createdTasks = [];
  for (const t of tasks) {
    if (t.title && t.dueDate) {
      const created = await Task.create({
        title: t.title,
        description: t.description || 'Imported via CSV automation batch',
        project: project._id,
        dueDate: new Date(t.dueDate),
        status: t.status || 'todo',
        priority: t.priority || 'medium',
        estimatedHours: Number(t.estimatedHours) || 4,
        owner: req.user._id,
        createdBy: req.user._id
      });
      createdTasks.push(created);
    }
  }

  await audit(req.user._id, 'tasks_csv_imported', 'Project', project._id, { count: createdTasks.length });
  ok(res, { importedCount: createdTasks.length, tasks: createdTasks });
}




