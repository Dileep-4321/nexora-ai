import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { User, Project } from '../models/index.js';

let io = null;

/**
 * Initializes the Socket.IO server attached to the HTTP server
 * @param {import('http').Server} httpServer
 * @param {object} options
 */
export function initRealtime(httpServer, options = {}) {
  const jwtSecret = process.env.JWT_SECRET?.trim();
  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is required to initialize Realtime service');
  }

  const allowedOrigins = options.allowedOrigins || [
    'http://localhost:3000',
    'http://localhost:3001',
    process.env.CLIENT_URL
  ].filter(Boolean);

  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
      credentials: true
    },
    pingTimeout: 30000,
    pingInterval: 25000,
    transports: ['websocket', 'polling']
  });

  // JWT Authentication Middleware for Socket.IO Handshake
  io.use(async (socket, next) => {
    try {
      const authHeader = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
      if (!authHeader) {
        return next(new Error('Authentication error: Missing token'));
      }

      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
      const secret = process.env.JWT_SECRET?.trim();
      if (!secret) {
        return next(new Error('Authentication error: Server JWT secret is not configured'));
      }

      let decoded;
      try {
        decoded = jwt.verify(token, secret);
      } catch {
        return next(new Error('Authentication error: Invalid or expired token'));
      }

      // Verify user still exists in database
      const userId = decoded.sub || decoded.id || decoded._id;
      const user = await User.findById(userId).select('name email role isActive');
      if (!user || !user.isActive) {
        return next(new Error('Authentication error: User inactive or not found'));
      }

      // Attach authenticated identity to socket
      socket.user = {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role
      };

      next();
    } catch (err) {
      next(new Error(`Authentication error: ${err.message}`));
    }
  });

  io.on('connection', (socket) => {
    const { id, role } = socket.user;

    // Join dedicated user room for targeted notifications & personal assignments
    const userRoom = `user:${id}`;
    socket.join(userRoom);

    // Join role room for administrative or role-wide system broadcasts
    socket.join(`role:${role}`);

    // Project Room Subscription with Server-Side Authorization Check
    const handleProjectJoin = async (data, ack) => {
      try {
        const projectId = typeof data === 'string' ? data : (data?.projectId || data?.id);
        if (!projectId) {
          if (typeof ack === 'function') ack({ success: false, error: 'Project ID required' });
          return;
        }

        const project = await Project.findById(projectId);
        if (!project) {
          if (typeof ack === 'function') ack({ success: false, error: 'Project not found' });
          return;
        }

        // Validate project membership
        const isManager = String(project.projectManager) === id || String(project.owner) === id;
        const isLead = String(project.teamLead) === id;
        const isClient = String(project.client) === id;
        const isMember = (project.teamMembers || []).map(String).includes(id);
        const isAdmin = role === 'admin';

        if (!isAdmin && !isManager && !isLead && !isClient && !isMember) {
          if (typeof ack === 'function') ack({ success: false, error: 'Access denied: not a member of this project' });
          return;
        }

        // Join primary project room (safe events: status, progress, milestones)
        socket.join(`project:${projectId}`);

        // If non-client, also join internal project room for sensitive activities & developer data
        if (role !== 'client') {
          socket.join(`project:${projectId}:internal`);
        }

        if (typeof ack === 'function') {
          ack({ success: true, projectId, role });
        }
      } catch (err) {
        if (typeof ack === 'function') ack({ success: false, error: err.message });
      }
    };
    socket.on('project:join', handleProjectJoin);
    socket.on('join:project', handleProjectJoin);

    // Leave project room handler
    socket.on('project:leave', (data, ack) => {
      const projectId = data?.projectId;
      if (projectId) {
        socket.leave(`project:${projectId}`);
        socket.leave(`project:${projectId}:internal`);
      }
      if (typeof ack === 'function') ack({ success: true });
    });

    socket.on('disconnect', (reason) => {
      // Explicit listener cleanup to prevent memory leaks across long-lived daemon connections
      socket.removeAllListeners('project:join');
      socket.removeAllListeners('project:leave');
      if (process.env.DEBUG) {
        console.info(`[Socket.IO] Client ${socket.id} (user: ${id}) disconnected: ${reason}`);
      }
    });
  });

  return io;
}

/**
 * Returns the active Socket.IO server instance
 */
export function getIO() {
  return io;
}

/**
 * Broadcast task updates to project rooms and targeted user
 */
export function emitTaskUpdated(task, metrics = null) {
  if (!io) return;
  const projectId = String(task.project?._id || task.project);

  const payload = {
    taskId: String(task._id),
    title: task.title,
    status: task.status,
    progress: task.progress,
    priority: task.priority,
    assignedTo: task.assignedTo ? String(task.assignedTo._id || task.assignedTo) : null,
    completedAt: task.completedAt || null,
    blockers: task.blockers || [],
    projectId
  };

  // Broadcast to all authorized members of the project room
  io.to(`project:${projectId}`).emit('task:updated', payload);

  // If assigned to a specific user, also alert their personal room
  if (payload.assignedTo) {
    io.to(`user:${payload.assignedTo}`).emit('task:my_task_updated', payload);
  }

  // If metrics provided, update project progress
  if (metrics) {
    emitProjectProgressUpdated(projectId, metrics);
  }
}

/**
 * Broadcast task assignment changes
 */
export function emitTaskAssigned(task, newAssigneeId, oldAssigneeId = null, metrics = null) {
  if (!io) return;
  const projectId = String(task.project?._id || task.project);

  const payload = {
    taskId: String(task._id),
    title: task.title,
    assignedTo: newAssigneeId ? String(newAssigneeId) : null,
    previousAssignee: oldAssigneeId ? String(oldAssigneeId) : null,
    status: task.status,
    projectId
  };

  // Broadcast to project room
  io.to(`project:${projectId}`).emit('task:assigned', payload);

  // Notify newly assigned member
  if (newAssigneeId) {
    io.to(`user:${newAssigneeId}`).emit('task:assigned_to_me', {
      ...payload,
      message: `You have been assigned to task: ${task.title}`
    });
  }

  // Notify unassigned member
  if (oldAssigneeId && String(oldAssigneeId) !== String(newAssigneeId)) {
    io.to(`user:${oldAssigneeId}`).emit('task:unassigned_from_me', {
      ...payload,
      message: `Task reassigned: ${task.title}`
    });
  }

  if (metrics) {
    emitProjectProgressUpdated(projectId, metrics);
  }
}

/**
 * Broadcast project progress updates
 */
export function emitProjectProgressUpdated(projectId, metrics) {
  if (!io) return;
  const id = String(projectId);

  io.to(`project:${id}`).emit('project:progress_updated', {
    projectId: id,
    progress: metrics.progress ?? 0,
    health: metrics.health ?? 'good',
    risk: metrics.risk ?? { score: 0, band: 'low' },
    status: metrics.status || 'active'
  });
}

/**
 * Broadcast milestone updates
 */
export function emitMilestoneUpdated(milestone, metrics = null) {
  if (!io) return;
  const projectId = String(milestone.project?._id || milestone.project);

  const payload = {
    milestoneId: String(milestone._id),
    title: milestone.title,
    status: milestone.status,
    progress: milestone.progress,
    dueDate: milestone.dueDate,
    projectId
  };

  io.to(`project:${projectId}`).emit('milestone:updated', payload);

  if (metrics) {
    emitProjectProgressUpdated(projectId, metrics);
  }
}

/**
 * Direct real-time notification delivery to a user's personal room
 */
export function emitNotification(notification, recipientId) {
  if (!io) return;
  const targetUser = String(recipientId || notification.recipient);

  io.to(`user:${targetUser}`).emit('notification:new', {
    notificationId: String(notification._id),
    type: notification.type,
    title: notification.title,
    message: notification.message,
    priority: notification.priority || 'medium',
    relatedProject: notification.relatedProject ? String(notification.relatedProject) : null,
    relatedTask: notification.relatedTask ? String(notification.relatedTask) : null,
    createdAt: notification.createdAt || new Date().toISOString()
  });
}

/**
 * Broadcast internal team activity (masked from clients)
 */
export function emitActivity(activity, projectId) {
  if (!io) return;
  const id = String(projectId);

  // Broadcast only to internal project room (clients excluded)
  io.to(`project:${id}:internal`).emit('activity:new', {
    activityId: String(activity._id),
    action: activity.action,
    entityType: activity.entityType,
    entityId: String(activity.entityId),
    actorName: activity.actor?.name || 'Team Member',
    timestamp: activity.timestamp || new Date().toISOString()
  });
}

/**
 * Emit workload changes to specific member and managers
 */
export function emitWorkloadUpdated(memberId, workloadData) {
  if (!io) return;
  const targetId = String(memberId);

  // Send to user
  io.to(`user:${targetId}`).emit('workload:updated', {
    memberId: targetId,
    ...workloadData
  });

  // Also send to managers/leads
  io.to('role:project_manager').to('role:team_lead').emit('team:workload_changed', {
    memberId: targetId,
    ...workloadData
  });
}

/**
 * Broadcast newly created task comment to project room and alert mentioned users
 */
export function emitCommentCreated(comment, projectId) {
  if (!io) return;
  const id = String(projectId);
  const isPublic = comment.isPublicToClient !== false;
  const payload = {
    commentId: String(comment._id),
    taskId: String(comment.task?._id || comment.task),
    projectId: id,
    content: comment.content,
    isPublicToClient: isPublic,
    author: comment.author ? {
      _id: String(comment.author._id || comment.author),
      name: comment.author.name || 'Team Member',
      role: comment.author.role || 'team_member',
      avatar: comment.author.avatar || null
    } : null,
    mentions: (comment.mentions || []).map((m) => ({
      _id: String(m._id || m),
      name: m.name || ''
    })),
    isEdited: Boolean(comment.isEdited),
    createdAt: comment.createdAt || new Date().toISOString()
  };

  // Broadcast to appropriate room
  if (isPublic) {
    io.to(`project:${id}`).emit('comment:created', payload);
  } else {
    io.to(`project:${id}:internal`).emit('comment:created', payload);
  }

  // Directly notify each mentioned user's personal room
  if (Array.isArray(comment.mentions)) {
    for (const m of comment.mentions) {
      const mentionUserId = String(m._id || m);
      io.to(`user:${mentionUserId}`).emit('comment:mentioned', {
        ...payload,
        message: `${payload.author?.name || 'Someone'} mentioned you in a comment`
      });
    }
  }
}

/**
 * Broadcast updated task comment to project room
 */
export function emitCommentUpdated(comment, projectId) {
  if (!io) return;
  const id = String(projectId);
  const isPublic = comment.isPublicToClient !== false;
  const payload = {
    commentId: String(comment._id),
    taskId: String(comment.task?._id || comment.task),
    projectId: id,
    content: comment.content,
    isPublicToClient: isPublic,
    isEdited: true,
    editedAt: comment.editedAt || new Date().toISOString()
  };

  if (isPublic) {
    io.to(`project:${id}`).emit('comment:updated', payload);
  } else {
    io.to(`project:${id}:internal`).emit('comment:updated', payload);
  }
}

/**
 * Broadcast deleted task comment to project room
 */
export function emitCommentDeleted(commentId, taskId, projectId, isPublicToClient = true) {
  if (!io) return;
  const id = String(projectId);
  const payload = {
    commentId: String(commentId),
    taskId: String(taskId),
    projectId: id
  };

  if (isPublicToClient) {
    io.to(`project:${id}`).emit('comment:deleted', payload);
  } else {
    io.to(`project:${id}:internal`).emit('comment:deleted', payload);
  }
}

/**
 * Broadcast new attachment metadata (with client privacy filtering)
 */
export function emitAttachmentCreated(attachment, projectId) {
  if (!io) return;
  const id = String(projectId);
  const payload = {
    attachmentId: String(attachment._id),
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    size: attachment.size,
    uploadedBy: attachment.uploadedBy ? {
      _id: String(attachment.uploadedBy._id || attachment.uploadedBy),
      name: attachment.uploadedBy.name || 'Team Member',
      role: attachment.uploadedBy.role || 'team_member'
    } : null,
    projectId: id,
    taskId: attachment.task ? String(attachment.task._id || attachment.task) : null,
    isPublicToClient: Boolean(attachment.isPublicToClient),
    createdAt: attachment.createdAt || new Date().toISOString()
  };

  if (attachment.isPublicToClient) {
    // Visible to all authorized project members including client
    io.to(`project:${id}`).emit('attachment:created', payload);
  } else {
    // Internal only: exclude client room
    io.to(`project:${id}:internal`).emit('attachment:created', payload);
  }
}

/**
 * Broadcast deleted attachment to project room
 */
export function emitAttachmentDeleted(attachmentId, taskId, projectId) {
  if (!io) return;
  const id = String(projectId);
  io.to(`project:${id}`).emit('attachment:deleted', {
    attachmentId: String(attachmentId),
    taskId: taskId ? String(taskId) : null,
    projectId: id
  });
}

/**
 * Broadcast team member added to project
 */
export function emitMemberAdded(projectId, member) {
  if (!io) return;
  const id = String(projectId);
  const payload = {
    projectId: id,
    member: {
      _id: String(member._id),
      name: member.name,
      email: member.email,
      role: member.role,
      jobTitle: member.jobTitle || 'Team Member',
      department: member.department || 'Engineering',
      skills: member.skills || [],
      availabilityStatus: member.availabilityStatus || 'available'
    }
  };

  io.to(`project:${id}:internal`).emit('member:added', payload);
  io.to(`user:${member._id}`).emit('project:member_added', payload);
}

/**
 * Broadcast team member removed from project
 */
export function emitMemberRemoved(projectId, memberId) {
  if (!io) return;
  const id = String(projectId);
  const targetId = String(memberId);
  const payload = {
    projectId: id,
    memberId: targetId
  };

  io.to(`project:${id}:internal`).emit('member:removed', payload);
  io.to(`user:${targetId}`).emit('project:member_removed', payload);
}

/**
 * Broadcast user profile or role update
 */
export function emitUserUpdated(user) {
  if (!io) return;
  const payload = {
    userId: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    jobTitle: user.jobTitle,
    department: user.department,
    skills: user.skills || [],
    availabilityStatus: user.availabilityStatus,
    isActive: Boolean(user.isActive)
  };

  io.to(`user:${user._id}`).emit('user:updated', payload);
  io.to('role:admin').to('role:project_manager').emit('user:updated', payload);
}

/**
 * Broadcast user account deactivation or deletion
 */
export function emitUserDeactivated(userId, mode = 'deactivated') {
  if (!io) return;
  const targetId = String(userId);
  const payload = {
    userId: targetId,
    mode,
    timestamp: new Date().toISOString()
  };

  io.to(`user:${targetId}`).emit('user:deactivated', payload);
  io.to('role:admin').to('role:project_manager').emit('user:deactivated', payload);
}

/**
 * Broadcast reaction toggled on a discussion comment
 */
export function emitCommentReacted(commentId, reactions, projectId, isPublicToClient = true) {
  if (!io) return;
  const id = String(projectId);
  const payload = {
    commentId: String(commentId),
    projectId: id,
    reactions
  };
  if (isPublicToClient) {
    io.to(`project:${id}`).emit('comment:reacted', payload);
  } else {
    io.to(`project:${id}:internal`).emit('comment:reacted', payload);
  }
}

/**
 * Broadcast discussion pin state toggled
 */
export function emitCommentPinned(commentId, isPinned, projectId, isPublicToClient = true) {
  if (!io) return;
  const id = String(projectId);
  const payload = {
    commentId: String(commentId),
    projectId: id,
    isPinned: Boolean(isPinned)
  };
  if (isPublicToClient) {
    io.to(`project:${id}`).emit('comment:pinned', payload);
  } else {
    io.to(`project:${id}:internal`).emit('comment:pinned', payload);
  }
}

/**
 * Broadcast attachment metadata update / version increment
 */
export function emitAttachmentUpdated(attachment, projectId) {
  if (!io) return;
  const id = String(projectId);
  const payload = {
    attachmentId: String(attachment._id),
    filename: attachment.filename,
    currentVersion: attachment.currentVersion || 1,
    status: attachment.status || 'approved',
    size: attachment.size,
    isPublicToClient: Boolean(attachment.isPublicToClient),
    projectId: id,
    updatedAt: attachment.updatedAt || new Date().toISOString()
  };
  if (attachment.isPublicToClient) {
    io.to(`project:${id}`).emit('attachment:updated', payload);
  } else {
    io.to(`project:${id}:internal`).emit('attachment:updated', payload);
  }
}

/**
 * Broadcast attachment review workflow status change
 */
export function emitAttachmentReviewed(attachment, projectId) {
  if (!io) return;
  const id = String(projectId);
  const payload = {
    attachmentId: String(attachment._id),
    filename: attachment.filename,
    status: attachment.status,
    reviewFeedback: attachment.reviewFeedback,
    isPublicToClient: Boolean(attachment.isPublicToClient),
    projectId: id,
    updatedAt: attachment.updatedAt || new Date().toISOString()
  };
  if (attachment.isPublicToClient) {
    io.to(`project:${id}`).emit('attachment:reviewed', payload);
  } else {
    io.to(`project:${id}:internal`).emit('attachment:reviewed', payload);
  }
}

/**
 * Broadcast notification unread count update to user
 */
export function emitNotificationUnreadCount(userId, unreadCount) {
  if (!io) return;
  io.to(`user:${userId}`).emit('notification:count', { unreadCount });
}
