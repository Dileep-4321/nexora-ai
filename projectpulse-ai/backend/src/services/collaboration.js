import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { Comment, Attachment, Task, Project, User, Notification, ActivityLog } from '../models/index.js';
import { emitCommentCreated, emitCommentUpdated, emitCommentDeleted, emitAttachmentCreated, emitAttachmentDeleted, emitNotification, emitActivity, emitCommentReacted, emitCommentPinned, emitAttachmentUpdated, emitAttachmentReviewed, emitNotificationUnreadCount } from './realtime.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Upload storage directory outside of web root
export const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export function getUploadsDir() {
  return UPLOADS_DIR;
}

/**
 * Verifies that a target path strictly resides within the uploads directory.
 * Prevents directory traversal (../), absolute escapes, sibling directory prefix bypasses
 * (e.g. uploads_shadow), and symbolic link escapes when file exists.
 *
 * @param {string} targetPath - Relative or absolute path to check
 * @param {boolean} mustExist - If true, file must exist and symlink target is verified via realpath
 * @returns {string} The verified absolute target path
 */
export function verifyAttachmentPath(targetPath, mustExist = false) {
  if (!targetPath || typeof targetPath !== 'string') {
    throw Object.assign(new Error('Invalid attachment path'), { status: 400 });
  }

  const baseDir = path.resolve(UPLOADS_DIR);
  const resolvedTarget = path.resolve(targetPath);

  // Check directory containment using path.relative
  const rel = path.relative(baseDir, resolvedTarget);
  const isContained = rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);

  if (!isContained) {
    throw Object.assign(new Error('Security check failed: Path traversal detected'), { status: 400 });
  }

  // If file must exist on disk (e.g. for download or deletion)
  if (mustExist) {
    if (!fs.existsSync(resolvedTarget)) {
      throw Object.assign(new Error('Attachment file not found on disk'), { status: 404 });
    }

    try {
      const realBase = fs.realpathSync(baseDir);
      const realTarget = fs.realpathSync(resolvedTarget);
      const realRel = path.relative(realBase, realTarget);
      const realContained = realRel !== '' && !realRel.startsWith('..') && !path.isAbsolute(realRel);

      if (!realContained) {
        throw Object.assign(new Error('Security check failed: Symlink escape detected'), { status: 403 });
      }
      return realTarget;
    } catch (err) {
      if (err.status) throw err;
      throw Object.assign(new Error('Attachment file not found on disk'), { status: 404 });
    }
  }

  return resolvedTarget;
}

// 10 MB file size limit
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Allowed file extensions and corresponding MIME types
export const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.txt', '.csv', '.json', '.zip', '.docx', '.xlsx'
]);

export const DISALLOWED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.ps1', '.js', '.mjs',
  '.py', '.php', '.vbs', '.dll', '.scr', '.msi', '.jar',
  '.html', '.htm', '.svg'
]);

export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'text/plain',
  'text/csv',
  'application/json',
  'application/zip',
  'application/x-zip-compressed',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);

/**
 * Validates buffer against file type magic numbers
 */
export function validateMagicNumber(buffer, ext) {
  if (!buffer || buffer.length === 0) {
    return { valid: false, reason: 'Empty file payload' };
  }

  const normalizedExt = String(ext).toLowerCase();

  // PDF magic number: %PDF- (0x25 0x50 0x44 0x46)
  if (normalizedExt === '.pdf') {
    if (buffer.length < 4 || buffer[0] !== 0x25 || buffer[1] !== 0x50 || buffer[2] !== 0x44 || buffer[3] !== 0x46) {
      return { valid: false, reason: 'Invalid PDF signature: missing %PDF- magic bytes' };
    }
    return { valid: true };
  }

  // PNG magic number: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
  if (normalizedExt === '.png') {
    if (buffer.length < 8 || buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4E || buffer[3] !== 0x47) {
      return { valid: false, reason: 'Invalid PNG signature: missing PNG header magic bytes' };
    }
    return { valid: true };
  }

  // JPEG magic number: 0xFF 0xD8 0xFF
  if (normalizedExt === '.jpg' || normalizedExt === '.jpeg') {
    if (buffer.length < 3 || buffer[0] !== 0xFF || buffer[1] !== 0xD8 || buffer[2] !== 0xFF) {
      return { valid: false, reason: 'Invalid JPEG signature: missing SOI magic bytes' };
    }
    return { valid: true };
  }

  // GIF magic number: GIF87a or GIF89a (0x47 0x49 0x46 0x38)
  if (normalizedExt === '.gif') {
    if (buffer.length < 4 || buffer[0] !== 0x47 || buffer[1] !== 0x49 || buffer[2] !== 0x46 || buffer[3] !== 0x38) {
      return { valid: false, reason: 'Invalid GIF signature' };
    }
    return { valid: true };
  }

  // WebP magic number: RIFF (bytes 0-3) and WEBP (bytes 8-11)
  if (normalizedExt === '.webp') {
    if (buffer.length < 12) {
      return { valid: false, reason: 'Invalid WebP signature: file too short to contain RIFF/WEBP header' };
    }
    const isRiff = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
    const isWebp = buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
    if (!isRiff || !isWebp) {
      return { valid: false, reason: 'Invalid WebP signature: missing RIFF or WEBP container markers' };
    }
    return { valid: true };
  }

  // ZIP / DOCX / XLSX magic number: PK\x03\x04 (0x50 0x4B 0x03 0x04)
  if (normalizedExt === '.zip' || normalizedExt === '.docx' || normalizedExt === '.xlsx') {
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4B || buffer[2] !== 0x03 || buffer[3] !== 0x04) {
      return { valid: false, reason: 'Invalid archive signature: missing PK header magic bytes' };
    }
    return { valid: true };
  }

  // Plain text, CSV, JSON: verify no binary null bytes
  if (['.txt', '.csv', '.json'].includes(normalizedExt)) {
    const checkLength = Math.min(buffer.length, 1024);
    for (let i = 0; i < checkLength; i++) {
      if (buffer[i] === 0x00) {
        return { valid: false, reason: 'Binary control characters / null bytes detected in text file' };
      }
    }
    return { valid: true };
  }

  return { valid: true };
}

/**
 * Sanitizes original filename to prevent path traversal and script execution
 */
export function sanitizeFilename(rawName) {
  if (!rawName || typeof rawName !== 'string') {
    return 'unnamed_attachment.dat';
  }

  // Remove path separators and null bytes
  let clean = path.basename(rawName).replace(/[\0/\\]/g, '').trim();

  // Strip non-printable / control characters
  clean = clean.replace(/[\x00-\x1F\x7F]/g, '');

  // Prevent hidden files starting with dot
  clean = clean.replace(/^\.+/, '');

  if (!clean) {
    clean = 'unnamed_attachment';
  }

  const ext = path.extname(clean).toLowerCase();
  const base = path.basename(clean, ext).replace(/[^a-zA-Z0-9._-]/g, '_');

  return `${base || 'attachment'}${ext}`;
}

/**
 * Helper to check project membership
 */
export function checkProjectMembership(user, project) {
  if (user.role === 'admin') return true;
  const memberIds = [
    project.owner,
    project.projectManager,
    project.teamLead,
    project.client,
    ...(project.teamMembers || [])
  ].filter(Boolean).map((m) => String(m._id || m));

  return memberIds.includes(String(user._id || user.id));
}

/**
 * Extracts and resolves @mentions against active project users
 */
export async function resolveMentions(text, projectId) {
  if (!text || typeof text !== 'string') return [];

  const mentionTokens = text.match(/@([a-zA-Z0-9._-]+)/g) || [];
  if (mentionTokens.length === 0) return [];

  const handles = [...new Set(mentionTokens.map((t) => t.slice(1).toLowerCase()))];

  const project = await Project.findById(projectId).populate('teamMembers projectManager teamLead owner client');
  if (!project) return [];

  const allMembers = [
    project.owner,
    project.projectManager,
    project.teamLead,
    project.client,
    ...(project.teamMembers || [])
  ].filter(Boolean);

  const matchedUserIds = new Set();
  const matchedUsers = [];

  for (const member of allMembers) {
    const emailHandle = member.email ? member.email.split('@')[0].toLowerCase() : '';
    const nameHandle = member.name ? member.name.replace(/\s+/g, '').toLowerCase() : '';
    const firstName = member.name ? member.name.split(' ')[0].toLowerCase() : '';

    for (const h of handles) {
      if (h === emailHandle || h === nameHandle || h === firstName) {
        const idStr = String(member._id);
        if (!matchedUserIds.has(idStr)) {
          matchedUserIds.add(idStr);
          matchedUsers.push(member);
        }
      }
    }
  }

  return matchedUsers;
}

/**
 * Create a new task comment, parse mentions, and dispatch alerts
 */
export async function createComment({ taskId = null, projectId = null, authorId, content, parentCommentId = null, userRole: _userRole, isPublicToClient }) {
  if (!content || !content.trim()) {
    throw Object.assign(new Error('Comment content cannot be empty'), { status: 400 });
  }

  if (content.length > 5000) {
    throw Object.assign(new Error('Comment content exceeds maximum limit of 5000 characters'), { status: 400 });
  }

  let task = null;
  let project = null;

  if (taskId) {
    task = await Task.findById(taskId);
    if (!task) {
      throw Object.assign(new Error('Task not found'), { status: 404 });
    }
    project = await Project.findById(task.project);
  } else if (projectId) {
    project = await Project.findById(projectId);
  } else {
    throw Object.assign(new Error('Either taskId or projectId is required'), { status: 400 });
  }

  if (!project) {
    throw Object.assign(new Error('Associated project not found'), { status: 404 });
  }

  const author = await User.findById(authorId);
  if (!author) {
    throw Object.assign(new Error('Author not found'), { status: 404 });
  }

  if (!checkProjectMembership(author, project)) {
    throw Object.assign(new Error('Access denied: not a member of this project'), { status: 403 });
  }

  // Validate parentComment if thread reply
  let parentComment = null;
  if (parentCommentId) {
    parentComment = await Comment.findById(parentCommentId);
    if (!parentComment || String(parentComment.project) !== String(project._id)) {
      throw Object.assign(new Error('Invalid parent message reference'), { status: 400 });
    }
  }

  // Resolve @mentions
  const mentionedUsers = await resolveMentions(content, project._id);
  const mentionIds = mentionedUsers.map((u) => u._id);

  const clientVisibility = _userRole === 'client' ? true : (isPublicToClient !== undefined ? Boolean(isPublicToClient) : true);

  const comment = await Comment.create({
    task: task ? task._id : undefined,
    project: project._id,
    author: author._id,
    content: content.trim(),
    parentComment: parentComment ? parentComment._id : null,
    mentions: mentionIds,
    isPublicToClient: clientVisibility
  });

  const populatedComment = await Comment.findById(comment._id)
    .populate('author', 'name email role avatar')
    .populate('mentions', 'name email role')
    .populate('parentComment', '_id content author');

  const snippet = content.length > 80 ? `${content.slice(0, 77)}...` : content;
  const contextTitle = task ? `task "${task.title}"` : `project "${project.name}"`;

  // 1. Dispatch mention notifications to mentioned users
  for (const mUser of mentionedUsers) {
    if (String(mUser._id) !== String(author._id)) {
      const notif = await Notification.create({
        recipient: mUser._id,
        type: 'comment_mention',
        category: 'discussions',
        title: 'Mentioned in discussion',
        message: `${author.name} mentioned you in ${contextTitle}: "${snippet}"`,
        relatedProject: project._id,
        relatedTask: task ? task._id : undefined,
        relatedComment: comment._id,
        priority: 'medium'
      });
      try {
        emitNotification(notif, mUser._id);
      } catch {}
    }
  }

  // 2. Dispatch reply notification to parent comment author if reply and not self
  if (parentComment && String(parentComment.author) !== String(author._id)) {
    const isAlreadyMentioned = mentionIds.some((id) => String(id) === String(parentComment.author));
    if (!isAlreadyMentioned) {
      const replyNotif = await Notification.create({
        recipient: parentComment.author,
        type: 'discussion_reply',
        category: 'discussions',
        title: 'New reply to your message',
        message: `${author.name} replied to your message in ${contextTitle}: "${snippet}"`,
        relatedProject: project._id,
        relatedTask: task ? task._id : undefined,
        relatedComment: comment._id,
        priority: 'medium'
      });
      try {
        emitNotification(replyNotif, parentComment.author);
      } catch {}
    }
  }

  // 3. Dispatch task comment notification to assignee if not author and not already mentioned/replied
  if (task && task.assignedTo && String(task.assignedTo) !== String(author._id)) {
    const isAlreadyMentioned = mentionIds.some((id) => String(id) === String(task.assignedTo));
    const isParentAuthor = parentComment && String(parentComment.author) === String(task.assignedTo);
    if (!isAlreadyMentioned && !isParentAuthor) {
      const notif = await Notification.create({
        recipient: task.assignedTo,
        type: 'task_comment',
        category: 'tasks',
        title: 'New comment on assigned task',
        message: `${author.name} commented on "${task.title}": "${snippet}"`,
        relatedProject: project._id,
        relatedTask: task._id,
        relatedComment: comment._id,
        priority: 'low'
      });
      try {
        emitNotification(notif, task.assignedTo);
      } catch {}
    }
  }

  // 4. Emit real-time comment created event
  try {
    emitCommentCreated(populatedComment, project._id);
  } catch {}

  // 5. Create ActivityLog
  try {
    const activity = await ActivityLog.create({
      actor: author._id,
      action: task ? 'task_comment_created' : 'project_discussion_created',
      entityType: 'Comment',
      entityId: comment._id,
      metadata: {
        task: task ? task._id : null,
        project: project._id,
        taskTitle: task ? task.title : null,
        projectName: project.name,
        mentionsCount: mentionIds.length,
        isReply: Boolean(parentComment)
      }
    });
    emitActivity(activity, project._id);
  } catch {}

  if (_userRole === 'client') {
    const obj = populatedComment.toObject();
    if (obj.author) delete obj.author.email;
    return obj;
  }

  return populatedComment;
}

/**
 * Get all comments for a task
 */
export async function getTaskComments(taskId, user) {
  const task = await Task.findById(taskId);
  if (!task) {
    throw Object.assign(new Error('Task not found'), { status: 404 });
  }

  const project = await Project.findById(task.project);
  if (!project) {
    throw Object.assign(new Error('Associated project not found'), { status: 404 });
  }

  if (!checkProjectMembership(user, project)) {
    throw Object.assign(new Error('Access denied: not a member of this project'), { status: 403 });
  }

  const isClient = user.role === 'client';
  const query = { task: taskId };
  if (isClient) {
    query.isPublicToClient = { $ne: false };
  }

  const comments = await Comment.find(query)
    .sort({ createdAt: 1 })
    .populate('author', 'name email role avatar')
    .populate('mentions', 'name email role');

  if (isClient) {
    return comments.map((c) => {
      const obj = c.toObject();
      if (obj.author) delete obj.author.email;
      if (Array.isArray(obj.mentions)) {
        obj.mentions = obj.mentions.map((m) => {
          const mObj = { ...m };
          delete mObj.email;
          return mObj;
        });
      }
      return obj;
    });
  }

  return comments;
}

/**
 * Update an existing comment
 */
export async function updateComment({ commentId, userId, userRole: _userRole, content }) {
  if (!content || !content.trim()) {
    throw Object.assign(new Error('Comment content cannot be empty'), { status: 400 });
  }

  const comment = await Comment.findById(commentId);
  if (!comment) {
    throw Object.assign(new Error('Comment not found'), { status: 404 });
  }

  // Only the comment author can edit comment content
  if (String(comment.author) !== String(userId)) {
    throw Object.assign(new Error('Access denied: only the comment author can edit this comment'), { status: 403 });
  }

  // Re-resolve mentions
  const mentionedUsers = await resolveMentions(content, comment.project);
  const mentionIds = mentionedUsers.map((u) => u._id);

  comment.content = content.trim();
  comment.mentions = mentionIds;
  comment.isEdited = true;
  comment.editedAt = new Date();

  await comment.save();

  const populated = await Comment.findById(comment._id)
    .populate('author', 'name email role avatar')
    .populate('mentions', 'name email role');

  try {
    emitCommentUpdated(populated, comment.project);
  } catch {}

  if (_userRole === 'client') {
    const obj = populated.toObject();
    if (obj.author) delete obj.author.email;
    return obj;
  }

  return populated;
}

/**
 * Delete a comment (Author, PM, or Admin)
 */
export async function deleteComment({ commentId, userId, userRole }) {
  const comment = await Comment.findById(commentId);
  if (!comment) {
    throw Object.assign(new Error('Comment not found'), { status: 404 });
  }

  const isAuthor = String(comment.author) === String(userId);
  const isManagerOrAdmin = ['admin', 'project_manager'].includes(userRole);

  if (!isAuthor && !isManagerOrAdmin) {
    throw Object.assign(new Error('Access denied: you do not have permission to delete this comment'), { status: 403 });
  }

  const taskId = comment.task;
  const projectId = comment.project;
  const isPublic = comment.isPublicToClient !== false;

  await Comment.findByIdAndDelete(commentId);

  try {
    emitCommentDeleted(commentId, taskId, projectId, isPublic);
  } catch {}

  return { success: true, message: 'Comment deleted successfully' };
}

/**
 * Save a new file attachment with strict validation
 */
export async function saveAttachment({ projectId, taskId = null, user, filename, mimeType, buffer, isPublicToClient = true, status = 'approved', description = '' }) {
  if (!buffer || !(buffer instanceof Buffer) || buffer.length === 0) {
    throw Object.assign(new Error('File content buffer is required'), { status: 400 });
  }

  if (buffer.length > MAX_FILE_SIZE) {
    throw Object.assign(new Error(`File size (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed limit of 10 MB`), { status: 400 });
  }

  const project = await Project.findById(projectId);
  if (!project) {
    throw Object.assign(new Error('Project not found'), { status: 404 });
  }

  if (!checkProjectMembership(user, project)) {
    throw Object.assign(new Error('Access denied: not a member of this project'), { status: 403 });
  }

  if (taskId) {
    const task = await Task.findById(taskId);
    if (!task) {
      throw Object.assign(new Error('Task not found'), { status: 404 });
    }
  }

  const cleanFilename = sanitizeFilename(filename);
  const ext = path.extname(cleanFilename).toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(ext) || DISALLOWED_EXTENSIONS.has(ext)) {
    throw Object.assign(new Error(`File extension '${ext}' is not permitted. Allowed formats: PDF, images (PNG, JPG, GIF, WebP), documents (TXT, CSV, JSON), archives (ZIP, DOCX, XLSX)`), { status: 400 });
  }

  const magicCheck = validateMagicNumber(buffer, ext);
  if (!magicCheck.valid) {
    throw Object.assign(new Error(`Security check failed: ${magicCheck.reason}`), { status: 400 });
  }

  // Generate safe storage filename and verify path isolation
  const randomSuffix = crypto.randomBytes(16).toString('hex');
  const storageName = `${Date.now()}_${randomSuffix}${ext}`;
  const storagePath = path.join(UPLOADS_DIR, storageName);

  // Path containment check
  const resolvedPath = verifyAttachmentPath(storagePath, false);

  // Write file to disk
  await fs.promises.writeFile(resolvedPath, buffer);

  // If user is client, ensure attachment is public to client
  const clientVisibility = user.role === 'client' ? true : Boolean(isPublicToClient);

  const initialVersion = {
    version: 1,
    filename: cleanFilename,
    storageName,
    storagePath: resolvedPath,
    mimeType: mimeType || 'application/octet-stream',
    size: buffer.length,
    uploadedBy: user._id,
    changeDescription: 'Initial upload',
    createdAt: new Date()
  };

  const docStatus = user.role === 'client' ? 'approved' : (status || 'approved');

  const attachment = await Attachment.create({
    filename: cleanFilename,
    storageName,
    storagePath: resolvedPath,
    mimeType: mimeType || 'application/octet-stream',
    size: buffer.length,
    uploadedBy: user._id,
    project: project._id,
    task: taskId || undefined,
    isPublicToClient: clientVisibility,
    status: docStatus,
    currentVersion: 1,
    description: description || '',
    versions: [initialVersion]
  });

  const populated = await Attachment.findById(attachment._id)
    .populate('uploadedBy', 'name email role avatar');

  try {
    emitAttachmentCreated(populated, project._id);
  } catch {}

  try {
    const activity = await ActivityLog.create({
      actor: user._id,
      action: 'file_attachment_uploaded',
      entityType: 'Attachment',
      entityId: attachment._id,
      metadata: {
        filename: cleanFilename,
        size: buffer.length,
        project: project._id,
        task: taskId || null,
        isPublicToClient: clientVisibility
      }
    });
    emitActivity(activity, project._id);
  } catch {}

  return populated;
}

/**
 * List attachments for project or task, enforcing client privacy
 */
export async function getAttachments({ projectId, taskId = null, user }) {
  const project = await Project.findById(projectId);
  if (!project) {
    throw Object.assign(new Error('Project not found'), { status: 404 });
  }

  if (!checkProjectMembership(user, project)) {
    throw Object.assign(new Error('Access denied: not a member of this project'), { status: 403 });
  }

  const query = { project: projectId };
  if (taskId) {
    query.task = taskId;
  }

  // Client privacy: client role can only see attachments marked as public to client
  if (user.role === 'client') {
    query.isPublicToClient = true;
  }

  const attachments = await Attachment.find(query)
    .sort({ createdAt: -1 })
    .populate('uploadedBy', 'name email role avatar');

  return attachments;
}

/**
 * Retrieve attachment metadata and verify file exists on disk for secure download
 */
export async function getAttachmentForDownload({ attachmentId, user }) {
  const attachment = await Attachment.findById(attachmentId);
  if (!attachment) {
    throw Object.assign(new Error('Attachment not found'), { status: 404 });
  }

  const project = await Project.findById(attachment.project);
  if (!project) {
    throw Object.assign(new Error('Associated project not found'), { status: 404 });
  }

  if (!checkProjectMembership(user, project)) {
    throw Object.assign(new Error('Access denied: not a member of this project'), { status: 403 });
  }

  // Client confidentiality gate
  if (user.role === 'client' && !attachment.isPublicToClient) {
    throw Object.assign(new Error('Access denied: attachment is confidential to internal team'), { status: 403 });
  }

  // Path containment & traversal verification
  const safePath = verifyAttachmentPath(attachment.storagePath, true);

  return {
    attachment,
    filePath: safePath
  };
}

/**
 * Delete an attachment (Author, PM, or Admin) and unlink from disk
 */
export async function deleteAttachment({ attachmentId, user }) {
  const attachment = await Attachment.findById(attachmentId);
  if (!attachment) {
    throw Object.assign(new Error('Attachment not found'), { status: 404 });
  }

  const isAuthor = String(attachment.uploadedBy) === String(user._id);
  const isManagerOrAdmin = ['admin', 'project_manager'].includes(user.role);

  if (!isAuthor && !isManagerOrAdmin) {
    throw Object.assign(new Error('Access denied: you do not have permission to delete this attachment'), { status: 403 });
  }

  const taskId = attachment.task;
  const projectId = attachment.project;

  // Remove file from disk with containment verification
  try {
    const safePath = verifyAttachmentPath(attachment.storagePath, true);
    await fs.promises.unlink(safePath);
  } catch (unlinkErr) {
    if (unlinkErr.status === 403) {
      throw unlinkErr;
    }
    // If file is already missing on disk (404), allow DB record cleanup to proceed
  }

  await Attachment.findByIdAndDelete(attachmentId);

  try {
    emitAttachmentDeleted(attachmentId, taskId, projectId);
  } catch {}

  try {
    const activity = await ActivityLog.create({
      actor: user._id,
      action: 'file_attachment_deleted',
      entityType: 'Attachment',
      entityId: attachmentId,
      metadata: {
        filename: attachment.filename,
        project: projectId,
        task: taskId || null
      }
    });
    emitActivity(activity, projectId);
  } catch {}

  return { success: true, message: 'Attachment deleted successfully' };
}


/**
 * Get project discussions (project-wide or task-filtered), supporting search, threads, and pins
 */
export async function getProjectDiscussions({ projectId, taskId = null, search = '', user, page = 1, limit = 50 }) {
  const project = await Project.findById(projectId);
  if (!project) {
    throw Object.assign(new Error('Project not found'), { status: 404 });
  }

  if (!checkProjectMembership(user, project)) {
    throw Object.assign(new Error('Access denied: not a member of this project'), { status: 403 });
  }

  const query = { project: projectId };
  if (taskId) {
    query.task = taskId;
  }
  if (user.role === 'client') {
    query.isPublicToClient = { $ne: false };
  }
  if (search && typeof search === 'string' && search.trim()) {
    query.content = { $regex: search.trim(), $options: 'i' };
  }

  const skip = (Math.max(1, Number(page)) - 1) * Math.max(1, Number(limit));
  const total = await Comment.countDocuments(query);

  const comments = await Comment.find(query)
    .sort({ isPinned: -1, createdAt: 1 })
    .skip(skip)
    .limit(Math.max(1, Number(limit)))
    .populate('author', 'name email role avatar jobTitle')
    .populate('mentions', 'name email role jobTitle')
    .populate('parentComment', '_id content author')
    .populate('pinnedBy', 'name role')
    .populate('reactions.users', 'name role avatar');

  if (user.role === 'client') {
    const sanitized = comments.map((c) => {
      const obj = c.toObject();
      if (obj.author) delete obj.author.email;
      if (Array.isArray(obj.mentions)) {
        obj.mentions = obj.mentions.map((m) => {
          const mObj = { ...m };
          delete mObj.email;
          return mObj;
        });
      }
      return obj;
    });
    return { discussions: sanitized, total, page: Number(page), limit: Number(limit) };
  }

  return { discussions: comments, total, page: Number(page), limit: Number(limit) };
}

/**
 * Toggle emoji reaction on a message
 */
export async function toggleCommentReaction({ commentId, userId, emoji, userRole }) {
  if (!emoji || typeof emoji !== 'string') {
    throw Object.assign(new Error('Valid emoji string is required'), { status: 400 });
  }

  const comment = await Comment.findById(commentId);
  if (!comment) {
    throw Object.assign(new Error('Comment not found'), { status: 404 });
  }

  const project = await Project.findById(comment.project);
  if (!project) {
    throw Object.assign(new Error('Associated project not found'), { status: 404 });
  }

  const user = await User.findById(userId);
  if (!user || !checkProjectMembership(user, project)) {
    throw Object.assign(new Error('Access denied: not a member of this project'), { status: 403 });
  }

  if (userRole === 'client' && comment.isPublicToClient === false) {
    throw Object.assign(new Error('Access denied: private internal comment'), { status: 403 });
  }

  if (!Array.isArray(comment.reactions)) {
    comment.reactions = [];
  }

  let reactionEntry = comment.reactions.find((r) => r.emoji === emoji);
  const uidStr = String(userId);

  if (!reactionEntry) {
    comment.reactions.push({ emoji, users: [userId] });
  } else {
    const userIndex = reactionEntry.users.findIndex((u) => String(u._id || u) === uidStr);
    if (userIndex >= 0) {
      reactionEntry.users.splice(userIndex, 1);
      if (reactionEntry.users.length === 0) {
        comment.reactions = comment.reactions.filter((r) => r.emoji !== emoji);
      }
    } else {
      reactionEntry.users.push(userId);
    }
  }

  await comment.save();

  const populated = await Comment.findById(comment._id)
    .populate('reactions.users', 'name role avatar');

  try {
    emitCommentReacted(commentId, populated.reactions, comment.project, comment.isPublicToClient !== false);
  } catch {}

  return { commentId, reactions: populated.reactions };
}

/**
 * Toggle pinned status for a discussion comment (PM, Lead, Admin only)
 */
export async function toggleCommentPin({ commentId, user }) {
  if (!['admin', 'project_manager', 'team_lead'].includes(user.role)) {
    throw Object.assign(new Error('Access denied: only Project Managers and Team Leads can pin messages'), { status: 403 });
  }

  const comment = await Comment.findById(commentId);
  if (!comment) {
    throw Object.assign(new Error('Comment not found'), { status: 404 });
  }

  const project = await Project.findById(comment.project);
  if (!project || !checkProjectMembership(user, project)) {
    throw Object.assign(new Error('Access denied: not a member of this project'), { status: 403 });
  }

  comment.isPinned = !comment.isPinned;
  comment.pinnedBy = comment.isPinned ? user._id : null;
  comment.pinnedAt = comment.isPinned ? new Date() : null;

  await comment.save();

  try {
    emitCommentPinned(commentId, comment.isPinned, comment.project, comment.isPublicToClient !== false);
  } catch {}

  return { commentId, isPinned: comment.isPinned, pinnedAt: comment.pinnedAt };
}

/**
 * List mentionable users for a project (enforcing client confidentiality)
 */
export async function getMentionableUsers({ projectId, user }) {
  const project = await Project.findById(projectId).populate('teamMembers projectManager teamLead owner client');
  if (!project) {
    throw Object.assign(new Error('Project not found'), { status: 404 });
  }

  if (!checkProjectMembership(user, project)) {
    throw Object.assign(new Error('Access denied: not a member of this project'), { status: 403 });
  }

  const isClient = user.role === 'client';
  const members = [
    project.owner,
    project.projectManager,
    project.teamLead,
    ...(isClient ? [] : (project.teamMembers || [])),
    ...(isClient ? [] : [project.client])
  ].filter(Boolean);

  const seen = new Set();
  const result = [];

  for (const m of members) {
    const idStr = String(m._id);
    if (!seen.has(idStr)) {
      seen.add(idStr);
      result.push({
        _id: m._id,
        name: m.name,
        handle: m.email ? m.email.split('@')[0] : m.name.replace(/\s+/g, '').toLowerCase(),
        role: m.role,
        jobTitle: m.jobTitle || 'Team Member',
        avatar: m.avatar || null
      });
    }
  }

  return result;
}

/**
 * Upload a new version for an existing document, archiving previous version
 */
export async function saveAttachmentVersion({ attachmentId, user, filename, mimeType, buffer, changeDescription = '' }) {
  if (!buffer || !(buffer instanceof Buffer) || buffer.length === 0) {
    throw Object.assign(new Error('File content buffer is required'), { status: 400 });
  }

  if (buffer.length > MAX_FILE_SIZE) {
    throw Object.assign(new Error(`File size (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed limit of 10 MB`), { status: 400 });
  }

  const attachment = await Attachment.findById(attachmentId);
  if (!attachment) {
    throw Object.assign(new Error('Document not found'), { status: 404 });
  }

  const project = await Project.findById(attachment.project);
  if (!project || !checkProjectMembership(user, project)) {
    throw Object.assign(new Error('Access denied: not a member of this project'), { status: 403 });
  }

  const cleanFilename = sanitizeFilename(filename);
  const ext = path.extname(cleanFilename).toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(ext) || DISALLOWED_EXTENSIONS.has(ext)) {
    throw Object.assign(new Error(`File extension '${ext}' is not permitted`), { status: 400 });
  }

  const magicCheck = validateMagicNumber(buffer, ext);
  if (!magicCheck.valid) {
    throw Object.assign(new Error(`Security check failed: ${magicCheck.reason}`), { status: 400 });
  }

  // Archive current active file as a previous version
  const previousVersionNumber = attachment.currentVersion || 1;
  if (!Array.isArray(attachment.versions)) {
    attachment.versions = [];
  }

  attachment.versions.push({
    version: previousVersionNumber,
    filename: attachment.filename,
    storageName: attachment.storageName,
    storagePath: attachment.storagePath,
    mimeType: attachment.mimeType,
    size: attachment.size,
    uploadedBy: attachment.uploadedBy,
    changeDescription: changeDescription || `Replaced by version ${previousVersionNumber + 1}`,
    createdAt: attachment.updatedAt || attachment.createdAt
  });

  // Save new version to disk
  const randomSuffix = crypto.randomBytes(16).toString('hex');
  const storageName = `${Date.now()}_v${previousVersionNumber + 1}_${randomSuffix}${ext}`;
  const storagePath = path.join(UPLOADS_DIR, storageName);
  const resolvedPath = verifyAttachmentPath(storagePath, false);

  await fs.promises.writeFile(resolvedPath, buffer);

  // Update attachment record
  attachment.filename = cleanFilename;
  attachment.storageName = storageName;
  attachment.storagePath = resolvedPath;
  attachment.mimeType = mimeType || 'application/octet-stream';
  attachment.size = buffer.length;
  attachment.uploadedBy = user._id;
  attachment.currentVersion = previousVersionNumber + 1;
  attachment.status = 'submitted'; // new versions re-enter review workflow

  await attachment.save();

  const populated = await Attachment.findById(attachment._id)
    .populate('uploadedBy', 'name email role avatar')
    .populate('versions.uploadedBy', 'name email role');

  try {
    emitAttachmentUpdated(populated, project._id);
  } catch {}

  // Dispatch notification to PM & TL
  const notifyRecipients = [project.projectManager, project.teamLead].filter(
    (id) => id && String(id) !== String(user._id)
  );

  for (const rId of notifyRecipients) {
    try {
      const notif = await Notification.create({
        recipient: rId,
        type: 'document_uploaded',
        category: 'documents',
        title: 'New document version uploaded',
        message: `${user.name} uploaded version ${attachment.currentVersion} of "${attachment.filename}" in ${project.name}`,
        relatedProject: project._id,
        relatedAttachment: attachment._id,
        priority: 'medium'
      });
      emitNotification(notif, rId);
    } catch {}
  }

  return populated;
}

/**
 * Review workflow: approve, reject, or submit document
 */
export async function updateAttachmentReview({ attachmentId, user, status, comments = '' }) {
  const validStatuses = ['draft', 'submitted', 'under_review', 'approved', 'rejected'];
  if (!validStatuses.includes(status)) {
    throw Object.assign(new Error(`Invalid document review status. Allowed: ${validStatuses.join(', ')}`), { status: 400 });
  }

  const attachment = await Attachment.findById(attachmentId);
  if (!attachment) {
    throw Object.assign(new Error('Document not found'), { status: 404 });
  }

  const project = await Project.findById(attachment.project);
  if (!project || !checkProjectMembership(user, project)) {
    throw Object.assign(new Error('Access denied: not a member of this project'), { status: 403 });
  }

  // Approval / rejection authorization
  if (['approved', 'rejected'].includes(status)) {
    const canApprove = ['admin', 'project_manager', 'team_lead'].includes(user.role);
    if (!canApprove) {
      throw Object.assign(new Error('Access denied: only Project Managers, Team Leads, or Admins can approve or reject documents'), { status: 403 });
    }
  }

  attachment.status = status;
  attachment.reviewFeedback = {
    status,
    reviewedBy: user._id,
    reviewedAt: new Date(),
    comments: comments ? String(comments).trim() : ''
  };

  await attachment.save();

  const populated = await Attachment.findById(attachment._id)
    .populate('uploadedBy', 'name email role avatar')
    .populate('reviewFeedback.reviewedBy', 'name role avatar');

  try {
    emitAttachmentReviewed(populated, project._id);
  } catch {}

  // Notify document uploader of review outcome
  if (attachment.uploadedBy && String(attachment.uploadedBy) !== String(user._id)) {
    try {
      const notifType = status === 'approved' ? 'document_approved' : status === 'rejected' ? 'document_rejected' : 'document_submitted';
      const notif = await Notification.create({
        recipient: attachment.uploadedBy,
        type: notifType,
        category: 'documents',
        title: `Document ${status.replace('_', ' ').toUpperCase()}: "${attachment.filename}"`,
        message: `${user.name} marked "${attachment.filename}" as ${status.replace('_', ' ')}${comments ? `: "${comments}"` : '.'}`,
        relatedProject: project._id,
        relatedAttachment: attachment._id,
        priority: status === 'rejected' ? 'high' : 'medium'
      });
      emitNotification(notif, attachment.uploadedBy);
    } catch {}
  }

  return populated;
}

/**
 * Update document metadata (rename or description)
 */
export async function updateAttachmentMetadata({ attachmentId, user, filename, description, isPublicToClient }) {
  const attachment = await Attachment.findById(attachmentId);
  if (!attachment) {
    throw Object.assign(new Error('Document not found'), { status: 404 });
  }

  const project = await Project.findById(attachment.project);
  if (!project || !checkProjectMembership(user, project)) {
    throw Object.assign(new Error('Access denied: not a member of this project'), { status: 403 });
  }

  const isAuthor = String(attachment.uploadedBy) === String(user._id);
  const isManager = ['admin', 'project_manager'].includes(user.role);
  if (!isAuthor && !isManager) {
    throw Object.assign(new Error('Access denied: you do not have permission to edit this document metadata'), { status: 403 });
  }

  if (filename && typeof filename === 'string' && filename.trim()) {
    const clean = sanitizeFilename(filename.trim());
    const oldExt = path.extname(attachment.filename).toLowerCase();
    const newExt = path.extname(clean).toLowerCase();
    attachment.filename = newExt ? clean : `${clean}${oldExt}`;
  }

  if (description !== undefined) {
    attachment.description = String(description).trim();
  }

  if (isPublicToClient !== undefined && user.role !== 'client') {
    attachment.isPublicToClient = Boolean(isPublicToClient);
  }

  await attachment.save();

  const populated = await Attachment.findById(attachment._id)
    .populate('uploadedBy', 'name email role avatar');

  try {
    emitAttachmentUpdated(populated, project._id);
  } catch {}

  return populated;
}

/**
 * Secure file preview verification
 */
export async function getAttachmentForPreview({ attachmentId, user }) {
  const attachment = await Attachment.findById(attachmentId);
  if (!attachment) {
    throw Object.assign(new Error('Document not found'), { status: 404 });
  }

  const project = await Project.findById(attachment.project);
  if (!project || !checkProjectMembership(user, project)) {
    throw Object.assign(new Error('Access denied: not a member of this project'), { status: 403 });
  }

  if (user.role === 'client' && !attachment.isPublicToClient) {
    throw Object.assign(new Error('Access denied: document is confidential to internal team'), { status: 403 });
  }

  const safePath = verifyAttachmentPath(attachment.storagePath, true);

  return {
    attachment,
    filePath: safePath,
    mimeType: attachment.mimeType,
    filename: attachment.filename
  };
}

/**
 * Filtered notifications for unified notification center
 */
export async function getUserNotifications({ userId, category = 'all', unreadOnly = false, page = 1, limit = 50 }) {
  const query = {
    recipient: userId,
    isDismissed: { $ne: true }
  };

  if (category && category !== 'all') {
    query.category = category;
  }

  if (unreadOnly === true || unreadOnly === 'true') {
    query.isRead = false;
  }

  const skip = (Math.max(1, Number(page)) - 1) * Math.max(1, Number(limit));
  const total = await Notification.countDocuments(query);
  const unreadCount = await Notification.countDocuments({ recipient: userId, isRead: false, isDismissed: { $ne: true } });

  const notifications = await Notification.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Math.max(1, Number(limit)))
    .populate('relatedProject', 'name status')
    .populate('relatedTask', 'title status priority')
    .populate('relatedComment', 'content author')
    .populate('relatedAttachment', 'filename mimeType size status');

  return { notifications, total, unreadCount, page: Number(page), limit: Number(limit) };
}

/**
 * Unread notification counts breakdown by category
 */
export async function getNotificationUnreadStats(userId) {
  const baseQuery = { recipient: userId, isRead: false, isDismissed: { $ne: true } };
  const total = await Notification.countDocuments(baseQuery);

  const categories = ['tasks', 'projects', 'discussions', 'documents', 'approvals', 'system'];
  const breakdown = {};

  await Promise.all(
    categories.map(async (cat) => {
      breakdown[cat] = await Notification.countDocuments({ ...baseQuery, category: cat });
    })
  );

  return { total, categories: breakdown };
}

/**
 * Dismiss a notification
 */
export async function dismissNotification({ notificationId, userId }) {
  const notif = await Notification.findOneAndUpdate(
    { _id: notificationId, recipient: userId },
    { isDismissed: true },
    { new: true }
  );

  if (!notif) {
    throw Object.assign(new Error('Notification not found'), { status: 404 });
  }

  const unreadCount = await Notification.countDocuments({ recipient: userId, isRead: false, isDismissed: { $ne: true } });
  try {
    emitNotificationUnreadCount(userId, unreadCount);
  } catch {}

  return { success: true, message: 'Notification dismissed successfully' };
}

/**
 * Update user notification preferences
 */
export async function updateNotificationPreferences({ userId, preferences }) {
  const user = await User.findById(userId);
  if (!user) {
    throw Object.assign(new Error('User not found'), { status: 404 });
  }

  if (!user.preferences) {
    user.preferences = {};
  }

  user.preferences.notifications = {
    ...(user.preferences.notifications || {}),
    ...(preferences || {})
  };

  user.markModified('preferences');
  await user.save();

  return { success: true, preferences: user.preferences.notifications };
}
