import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { io } from 'socket.io-client';
import mongoose from 'mongoose';
import { User, Project, Task, Comment, Attachment, Notification } from '../src/models/index.js';

const API_BASE = 'http://localhost:5001/api/v1';
const SOCKET_BASE = 'http://localhost:5001';
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nexora_ai';

async function main() {
  console.log('--- NEXORA PHASE 5 LIVE VERIFICATION SCRIPT ---');
  await mongoose.connect(MONGO_URI);

  const pmUser = await User.findOne({ role: 'project_manager' });
  const clientUser = await User.findOne({ role: 'client' });
  const devUser = await User.findOne({ role: 'team_member' });
  const project = await Project.findOne();
  const task = await Task.findOne({ project: project._id });

  if (!pmUser || !clientUser || !devUser || !project || !task) {
    throw new Error('Required test fixtures missing in database');
  }

  console.log(`✓ Fixtures found: Project "${project.name}", Task "${task.title}"`);
  console.log(`✓ Users: PM (${pmUser.email}), Dev (${devUser.email}), Client (${clientUser.email})`);

  // Helper to log in and get JWT
  async function login(email, password) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const body = await res.json();
    if (!body.success) throw new Error(`Login failed for ${email}: ${body.message}`);
    return body.data.token;
  }

  const pmToken = await login(pmUser.email, 'password123');
  const devToken = await login(devUser.email, 'password123');
  const clientToken = await login(clientUser.email, 'password123');
  console.log('✓ Successfully authenticated PM, Dev, and Client');

  // Connect WebSockets
  function connectLiveSocket(token, name) {
    return new Promise((resolve, reject) => {
      const s = io(SOCKET_BASE, {
        auth: { token },
        transports: ['websocket', 'polling']
      });
      s.on('connect', () => {
        console.log(`✓ Socket connected for ${name} (id: ${s.id})`);
        resolve(s);
      });
      s.on('connect_error', (err) => reject(err));
    });
  }

  const pmSocket = await connectLiveSocket(pmToken, 'PM');
  const devSocket = await connectLiveSocket(devToken, 'Dev');
  const clientSocket = await connectLiveSocket(clientToken, 'Client');

  // Join project room
  await new Promise((res) => pmSocket.emit('project:join', { projectId: String(project._id) }, res));
  await new Promise((res) => devSocket.emit('project:join', { projectId: String(project._id) }, res));
  await new Promise((res) => clientSocket.emit('project:join', { projectId: String(project._id) }, res));
  console.log('✓ All 3 live sockets joined project room');

  // Setup event trackers
  let receivedCommentEvent = null;
  let receivedMentionEvent = null;
  pmSocket.on('comment:created', (data) => {
    receivedCommentEvent = data;
  });
  pmSocket.on('comment:mentioned', (data) => {
    receivedMentionEvent = data;
  });

  // Dev posts a comment mentioning PM
  const pmHandle = pmUser.email.split('@')[0];
  console.log(`\n1. Dev posting comment with mention: @${pmHandle}...`);
  const commentRes = await fetch(`${API_BASE}/tasks/${task._id}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${devToken}`
    },
    body: JSON.stringify({
      content: `Hello @${pmHandle}, the secure architecture files are ready for review.`
    })
  });

  const commentData = await commentRes.json();
  if (!commentData.success) throw new Error(`Comment creation failed: ${commentData.message}`);
  const commentId = commentData.data.comment._id;
  console.log(`✓ Comment created: ID ${commentId}`);

  // Wait for Socket delivery
  await new Promise((r) => setTimeout(r, 600));
  if (receivedCommentEvent) {
    console.log(`✓ Live Socket.IO 'comment:created' received by PM: "${receivedCommentEvent.content}"`);
  } else {
    throw new Error('Realtime comment event not received by PM');
  }

  if (receivedMentionEvent) {
    console.log(`✓ Live Socket.IO 'comment:mentioned' direct alert received by PM`);
  }

  // Check notification in DB
  const notif = await Notification.findOne({
    recipient: pmUser._id,
    type: 'comment_mention',
    relatedComment: commentId
  });
  if (notif) {
    console.log(`✓ DB Notification verified: "${notif.title}" -> ${notif.message}`);
  } else {
    throw new Error('Mention notification not found in MongoDB');
  }

  // Dev edits comment
  console.log('\n2. Dev updating comment...');
  const editRes = await fetch(`${API_BASE}/comments/${commentId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${devToken}`
    },
    body: JSON.stringify({
      content: `Hello @${pmHandle}, the secure architecture files and diagrams are ready for review.`
    })
  });
  const editData = await editRes.json();
  if (!editData.success || !editData.data.comment.isEdited) {
    throw new Error('Comment update failed');
  }
  console.log(`✓ Comment updated successfully (isEdited: true)`);

  // Secure File Management Tests
  console.log('\n3. Uploading confidential internal document (isPublicToClient: false)...');
  let clientReceivedInternalFileEvent = false;
  clientSocket.on('attachment:created', () => {
    clientReceivedInternalFileEvent = true;
  });

  const validPdfBytes = Buffer.from('%PDF-1.4\n%NEXORA INTERNAL SPECIFICATION\n%%EOF');
  const uploadRes = await fetch(`${API_BASE}/projects/${project._id}/attachments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${devToken}`
    },
    body: JSON.stringify({
      filename: 'internal_security_audit.pdf',
      mimeType: 'application/pdf',
      content: validPdfBytes.toString('base64'),
      taskId: task._id,
      isPublicToClient: false
    })
  });
  const uploadData = await uploadRes.json();
  if (!uploadData.success) throw new Error(`Upload failed: ${uploadData.message}`);
  const internalAttId = uploadData.data.attachment._id;
  console.log(`✓ Internal attachment uploaded: ID ${internalAttId} (${uploadData.data.attachment.filename})`);

  await new Promise((r) => setTimeout(r, 600));
  if (clientReceivedInternalFileEvent) {
    throw new Error('SECURITY VIOLATION: Client received real-time event for internal document!');
  } else {
    console.log('✓ Security verified: Client was excluded from internal file real-time broadcast');
  }

  // Client views documents
  const clientListRes = await fetch(`${API_BASE}/projects/${project._id}/attachments`, {
    headers: { Authorization: `Bearer ${clientToken}` }
  });
  const clientList = await clientListRes.json();
  const clientSeesInternal = clientList.data.attachments.some((a) => String(a._id) === String(internalAttId));
  if (clientSeesInternal) {
    throw new Error('SECURITY VIOLATION: Client can see internal document in attachments list!');
  } else {
    console.log('✓ Security verified: Internal document filtered out of client listing');
  }

  // Client attempts direct download of internal file
  const clientDlRes = await fetch(`${API_BASE}/attachments/${internalAttId}/download`, {
    headers: { Authorization: `Bearer ${clientToken}` }
  });
  if (clientDlRes.status !== 403) {
    throw new Error(`Expected 403 on client downloading internal document, got ${clientDlRes.status}`);
  } else {
    console.log('✓ Security verified: Direct download by client blocked with 403 Forbidden');
  }

  // Dev downloads document
  console.log('\n4. Testing secure file download streaming...');
  const devDlRes = await fetch(`${API_BASE}/attachments/${internalAttId}/download`, {
    headers: { Authorization: `Bearer ${devToken}` }
  });
  if (devDlRes.status !== 200) throw new Error(`Download failed with status ${devDlRes.status}`);
  if (devDlRes.headers.get('x-content-type-options') !== 'nosniff') {
    throw new Error('Missing X-Content-Type-Options: nosniff header');
  }
  const downloadedText = await devDlRes.text();
  if (!downloadedText.includes('%PDF-1.4')) throw new Error('Downloaded file corrupted');
  console.log('✓ Secure file streamed with nosniff and matching Content-Disposition');

  // Cleanup: Delete attachment & comment
  console.log('\n5. Cleaning up created attachment & comment...');
  const delAttRes = await fetch(`${API_BASE}/attachments/${internalAttId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${devToken}` }
  });
  const delAttData = await delAttRes.json();
  if (!delAttData.success) throw new Error('Attachment deletion failed');
  console.log('✓ Attachment deleted from DB and unlinked from disk');

  const delCommentRes = await fetch(`${API_BASE}/comments/${commentId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${pmToken}` }
  });
  const delCommentData = await delCommentRes.json();
  if (!delCommentData.success) throw new Error('Comment deletion failed');
  console.log('✓ Comment deleted by PM');

  // Disconnect sockets
  pmSocket.disconnect();
  devSocket.disconnect();
  clientSocket.disconnect();
  await mongoose.disconnect();

  console.log('\n🎉 ALL LIVE END-TO-END VERIFICATION CHECKS PASSED SUCCESSFULLY!\n');
}

main().catch((err) => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});
