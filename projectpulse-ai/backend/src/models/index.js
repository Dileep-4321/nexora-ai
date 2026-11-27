import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
const { Schema, model } = mongoose;
const roles = ['admin', 'project_manager', 'team_lead', 'team_member', 'client'];
const availability = ['available', 'busy', 'unavailable', 'absent', 'overloaded'];
const priority = ['low', 'medium', 'high', 'critical'];

const userSchema = new Schema({
  name: { type: String, required: true, trim: true }, email: { type: String, required: true, unique: true, lowercase: true, index: true }, password: { type: String, required: true, select: false },
  role: { type: String, enum: roles, required: true }, avatar: String, jobTitle: String, department: String, skills: [String],
  employeeId: { type: String, trim: true, index: true, sparse: true },
  phone: { type: String, trim: true },
  experienceYears: { type: Number, min: 0, default: 1 },
  availabilityStatus: { type: String, enum: availability, default: 'available' }, workloadCapacity: { type: Number, min: 1, default: 40 }, productivityScore: { type: Number, min: 0, max: 100, default: 0 }, isActive: { type: Boolean, default: true }, lastLogin: Date, preferences: { type: Schema.Types.Mixed, default: { deadlineAlerts: true, recommendationAlerts: true, weeklyDigest: true } },
  tokenVersion: { type: Number, default: 1 },
  lastActiveSession: {
    device: { type: String, default: 'Desktop Browser' },
    browser: { type: String, default: 'Chrome' },
    ip: { type: String, default: '127.0.0.1' },
    loginTime: { type: Date, default: Date.now }
  },
  deactivatedAt: Date,
  deactivatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  deactivationReason: String
}, { timestamps: true });
userSchema.pre('save', async function hashPassword(next) { if (!this.isModified('password')) return next(); this.password = await bcrypt.hash(this.password, 12); next(); });
userSchema.methods.comparePassword = function comparePassword(value) { return bcrypt.compare(value, this.password); };

const projectSchema = new Schema({
  name: { type: String, required: true, trim: true }, description: String, status: { type: String, enum: ['planning', 'active', 'on-hold', 'completed', 'in-progress'], default: 'planning' }, priority: { type: String, enum: priority, default: 'medium' },
  owner: { type: Schema.Types.ObjectId, ref: 'User' }, projectManager: { type: Schema.Types.ObjectId, ref: 'User', index: true }, teamLead: { type: Schema.Types.ObjectId, ref: 'User' }, teamMembers: [{ type: Schema.Types.ObjectId, ref: 'User', index: true, set: (v) => (v && typeof v === 'object' && v.user ? v.user : v) }], client: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  startDate: { type: Date, default: Date.now }, deadline: { type: Date, required: true }, progress: { type: Number, min: 0, max: 100, default: 0 }, expectedProgress: { type: Number, min: 0, max: 100, default: 0 }, health: { type: String, enum: ['excellent', 'good', 'warning', 'critical'], default: 'good' }, riskLevel: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'low' }, riskScore: { type: Number, min: 0, max: 100, default: 0 }, budget: { type: Number, min: 0, default: 0 }, milestones: [{ type: Schema.Types.ObjectId, ref: 'Milestone' }],
  baselineStartDate: Date, baselineDeadline: Date, baselineVarianceDays: { type: Number, default: 0 },
  baselineChangeHistory: [{
    previousDeadline: Date,
    newDeadline: Date,
    previousStartDate: Date,
    newStartDate: Date,
    reason: String,
    changedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now }
  }],
  isTemplate: { type: Boolean, default: false },
  templateCategory: { type: String, default: 'General' }
}, { timestamps: true });
const taskSchema = new Schema({
  title: { type: String, required: true, trim: true }, description: String, project: { type: Schema.Types.ObjectId, ref: 'Project', required: false, index: true }, owner: { type: Schema.Types.ObjectId, ref: 'User' }, assignedTo: { type: Schema.Types.ObjectId, ref: 'User', index: true }, createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['todo', 'in-progress', 'completed', 'blocked'], default: 'todo', index: true }, priority: { type: String, enum: priority, default: 'medium' }, progress: { type: Number, min: 0, max: 100, default: 0 }, startDate: Date, dueDate: { type: Date, required: true, index: true }, estimatedHours: { type: Number, min: 0, default: 0 }, actualHours: { type: Number, min: 0, default: 0 }, requiredSkills: [{ name: String, importance: { type: Number, min: 0, max: 1 } }], dependencies: [{ type: Schema.Types.ObjectId, ref: 'Task' }], blockers: [String], riskLevel: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'low' }, completedAt: Date,
  recurrence: {
    frequency: { type: String, enum: ['none', 'daily', 'weekly', 'monthly'], default: 'none' },
    interval: { type: Number, default: 1 },
    nextRun: Date,
    isPaused: { type: Boolean, default: false }
  }
}, { timestamps: true });
const milestoneSchema = new Schema({ title: { type: String, required: true }, description: String, project: { type: Schema.Types.ObjectId, ref: 'Project', required: false, index: true }, startDate: Date, dueDate: { type: Date, required: true }, status: { type: String, enum: ['pending', 'in-progress', 'completed'], default: 'pending' }, progress: { type: Number, min: 0, max: 100, default: 0 } }, { timestamps: true });
const projectUpdateSchema = new Schema({ project: { type: Schema.Types.ObjectId, ref: 'Project', required: true }, author: { type: Schema.Types.ObjectId, ref: 'User', required: true }, summary: { type: String, required: true }, details: String, progress: { type: Number, min: 0, max: 100 }, blockers: [String], nextActions: [String] }, { timestamps: true });
const notificationSchema = new Schema({
  recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: {
    type: String,
    enum: [
      'task_due', 'task_overdue', 'task_assigned', 'task_completed', 'task_reopened',
      'deadline_warning', 'risk_alert', 'member_unavailable', 'resource_recommendation',
      'reassignment', 'project_update', 'system', 'comment_mention', 'task_comment',
      'discussion_reply', 'discussion_new', 'document_uploaded', 'document_submitted',
      'document_approved', 'document_rejected', 'approval_requested', 'milestone_completed',
      'milestone_approaching'
    ],
    required: true
  },
  category: {
    type: String,
    enum: ['tasks', 'projects', 'discussions', 'documents', 'approvals', 'system'],
    default: 'system',
    index: true
  },
  title: String,
  message: String,
  priority: { type: String, enum: priority, default: 'medium' },
  relatedProject: { type: Schema.Types.ObjectId, ref: 'Project' },
  relatedTask: { type: Schema.Types.ObjectId, ref: 'Task' },
  relatedRecommendation: { type: Schema.Types.ObjectId, ref: 'ResourceRecommendation' },
  relatedComment: { type: Schema.Types.ObjectId, ref: 'Comment' },
  relatedAttachment: { type: Schema.Types.ObjectId, ref: 'Attachment' },
  isRead: { type: Boolean, default: false },
  readAt: Date,
  isDismissed: { type: Boolean, default: false }
}, { timestamps: true });
const activitySchema = new Schema({ actor: { type: Schema.Types.ObjectId, ref: 'User', index: true }, action: { type: String, required: true }, entityType: String, entityId: { type: Schema.Types.ObjectId, index: true }, metadata: Schema.Types.Mixed, timestamp: { type: Date, default: Date.now } });
const memberSkillSchema = new Schema({ member: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true }, skillName: { type: String, required: true }, proficiency: { type: String, enum: ['beginner', 'intermediate', 'advanced', 'expert'], required: true }, experienceYears: { type: Number, min: 0, default: 0 }, lastUsed: Date }, { timestamps: true });
const memberAvailabilitySchema = new Schema({ member: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true }, status: { type: String, enum: availability, required: true }, availableFrom: Date, availableUntil: Date, capacityPercentage: { type: Number, min: 0, max: 100, default: 100 }, reason: String, updatedBy: { type: Schema.Types.ObjectId, ref: 'User' } }, { timestamps: true });
const assignmentHistorySchema = new Schema({ task: { type: Schema.Types.ObjectId, ref: 'Task', required: true }, previousMember: { type: Schema.Types.ObjectId, ref: 'User' }, newMember: { type: Schema.Types.ObjectId, ref: 'User', required: true }, reason: String, recommendation: { type: Schema.Types.ObjectId, ref: 'ResourceRecommendation' }, approvedBy: { type: Schema.Types.ObjectId, ref: 'User' }, changedAt: { type: Date, default: Date.now } });
const recommendationSchema = new Schema({ project: { type: Schema.Types.ObjectId, ref: 'Project', required: false, index: true }, task: { type: Schema.Types.ObjectId, ref: 'Task', required: true }, unavailableMember: { type: Schema.Types.ObjectId, ref: 'User' }, recommendedMember: { type: Schema.Types.ObjectId, ref: 'User' }, candidateSnapshot: Schema.Types.Mixed, alternativeCandidates: [Schema.Types.Mixed], matchScore: { type: Number, min: 0, max: 100 }, factors: [String], reason: String, status: { type: String, enum: ['pending', 'approved', 'rejected', 'expired'], default: 'pending' }, approvedBy: { type: Schema.Types.ObjectId, ref: 'User' }, approvedAt: Date }, { timestamps: true });
const riskSnapshotSchema = new Schema({ project: { type: Schema.Types.ObjectId, ref: 'Project', required: false, index: true }, riskScore: { type: Number, min: 0, max: 100 }, riskLevel: { type: String, enum: ['low', 'medium', 'high', 'critical'] }, factors: [String], timestamp: { type: Date, default: Date.now } });
const performanceSnapshotSchema = new Schema({ member: { type: Schema.Types.ObjectId, ref: 'User', required: true }, project: { type: Schema.Types.ObjectId, ref: 'Project' }, productivityScore: { type: Number, min: 0, max: 100 }, completionRate: Number, workload: Number, timestamp: { type: Date, default: Date.now } });
const commentSchema = new Schema({
  task: { type: Schema.Types.ObjectId, ref: 'Task', required: false, index: true },
  project: { type: Schema.Types.ObjectId, ref: 'Project', required: false, index: true },
  author: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  content: { type: String, required: true, trim: true },
  mentions: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  parentComment: { type: Schema.Types.ObjectId, ref: 'Comment', default: null, index: true },
  reactions: [{
    emoji: { type: String, required: true },
    users: [{ type: Schema.Types.ObjectId, ref: 'User' }]
  }],
  isPinned: { type: Boolean, default: false, index: true },
  pinnedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  pinnedAt: Date,
  isPublicToClient: { type: Boolean, default: true },
  isEdited: { type: Boolean, default: false },
  editedAt: Date,
  isDeleted: { type: Boolean, default: false },
  deletedAt: Date
}, { timestamps: true });
const attachmentSchema = new Schema({
  filename: { type: String, required: true },
  storageName: { type: String, required: true },
  storagePath: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  project: { type: Schema.Types.ObjectId, ref: 'Project', required: false, index: true },
  task: { type: Schema.Types.ObjectId, ref: 'Task', index: true },
  isPublicToClient: { type: Boolean, default: true },
  status: {
    type: String,
    enum: ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'archived'],
    default: 'approved',
    index: true
  },
  currentVersion: { type: Number, default: 1 },
  description: { type: String, default: '' },
  versions: [{
    version: { type: Number, required: true },
    filename: { type: String, required: true },
    storageName: { type: String, required: true },
    storagePath: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    changeDescription: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
  }],
  reviewFeedback: {
    status: { type: String, enum: ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'archived'] },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    comments: String
  },
  isArchived: { type: Boolean, default: false, index: true }
}, { timestamps: true });

// Scalability & Performance Compound Indexes (Phase 7)
userSchema.index({ role: 1, isActive: 1 });
projectSchema.index({ status: 1, priority: 1 });
projectSchema.index({ projectManager: 1, status: 1 });
taskSchema.index({ project: 1, status: 1 });
taskSchema.index({ project: 1, dueDate: 1 });
taskSchema.index({ assignedTo: 1, status: 1 });
taskSchema.index({ project: 1, assignedTo: 1 });
milestoneSchema.index({ project: 1, dueDate: 1 });
milestoneSchema.index({ project: 1, status: 1 });
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
commentSchema.index({ task: 1, createdAt: -1 });
commentSchema.index({ project: 1, createdAt: -1 });
attachmentSchema.index({ project: 1, isPublicToClient: 1, createdAt: -1 });
attachmentSchema.index({ task: 1, isPublicToClient: 1 });
activitySchema.index({ entityId: 1, timestamp: -1 });
activitySchema.index({ actor: 1, timestamp: -1 });
riskSnapshotSchema.index({ project: 1, timestamp: -1 });
memberSkillSchema.index({ member: 1, skillName: 1 });
memberAvailabilitySchema.index({ member: 1, status: 1 });

export const User = model('User', userSchema); export const Project = model('Project', projectSchema); export const Task = model('Task', taskSchema); export const Milestone = model('Milestone', milestoneSchema); export const ProjectUpdate = model('ProjectUpdate', projectUpdateSchema); export const Notification = model('Notification', notificationSchema); export const ActivityLog = model('ActivityLog', activitySchema); export const MemberSkill = model('MemberSkill', memberSkillSchema); export const MemberAvailability = model('MemberAvailability', memberAvailabilitySchema); export const TaskAssignmentHistory = model('TaskAssignmentHistory', assignmentHistorySchema); export const ResourceRecommendation = model('ResourceRecommendation', recommendationSchema); export const ProjectRiskSnapshot = model('ProjectRiskSnapshot', riskSnapshotSchema); export const PerformanceSnapshot = model('PerformanceSnapshot', performanceSnapshotSchema);
export const Comment = model('Comment', commentSchema);
export const Attachment = model('Attachment', attachmentSchema);
export { roles, availability, priority };
