import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { User, Project, Task, Comment, Attachment, Notification } from '../src/models/index.js';
import app from '../src/app.js';

let server;
let baseUrl;
const JWT_SECRET = process.env.JWT_SECRET || 'nexora-ai-local-secret-2026-project';

let pmUser, leadUser, memberUser, clientUser, otherUser;
let pmToken, leadToken, memberToken, clientToken, otherToken;
let testProject;

function makeToken(user) {
  return jwt.sign(
    { sub: String(user._id), id: String(user._id), role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function api(path, method = 'GET', body = null, token = null) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data, headers: res.headers };
}

test.before(async () => {
  if (mongoose.connection.readyState !== 1) {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nexora_ai_demo';
    await mongoose.connect(mongoUri);
  }

  server = app.listen(0);
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  // Create test users
  const ts = Date.now();
  pmUser = await User.create({
    name: 'PM Test',
    email: `pm_${ts}@nexora.ai`,
    password: 'Password123!',
    role: 'project_manager'
  });
  leadUser = await User.create({
    name: 'Lead Test',
    email: `lead_${ts}@nexora.ai`,
    password: 'Password123!',
    role: 'team_lead'
  });
  memberUser = await User.create({
    name: 'Member Test',
    email: `member_${ts}@nexora.ai`,
    password: 'Password123!',
    role: 'team_member'
  });
  clientUser = await User.create({
    name: 'Client Test',
    email: `client_${ts}@nexora.ai`,
    password: 'Password123!',
    role: 'client'
  });
  otherUser = await User.create({
    name: 'Other Test',
    email: `other_${ts}@nexora.ai`,
    password: 'Password123!',
    role: 'team_member'
  });

  pmToken = makeToken(pmUser);
  leadToken = makeToken(leadUser);
  memberToken = makeToken(memberUser);
  clientToken = makeToken(clientUser);
  otherToken = makeToken(otherUser);

  // Create test project and task
  testProject = await Project.create({
    name: 'Apollo Communication Initiative',
    description: 'Testing advanced collaboration and document systems',
    projectManager: pmUser._id,
    teamLead: leadUser._id,
    teamMembers: [memberUser._id],
    client: clientUser._id,
    deadline: new Date(Date.now() + 30 * 86400000),
    status: 'active'
  });

  await Task.create({
    title: 'Deliverable Architecture Review',
    project: testProject._id,
    assignedTo: memberUser._id,
    dueDate: new Date(Date.now() + 7 * 86400000),
    status: 'in-progress'
  });
});

test.after(async () => {
  if (testProject) {
    await Comment.deleteMany({ project: testProject._id });
    await Attachment.deleteMany({ project: testProject._id });
    await Notification.deleteMany({ relatedProject: testProject._id });
    await Task.deleteMany({ project: testProject._id });
    await Project.findByIdAndDelete(testProject._id);
  }
  const uids = [pmUser?._id, leadUser?._id, memberUser?._id, clientUser?._id, otherUser?._id].filter(Boolean);
  await User.deleteMany({ _id: { $in: uids } });

  if (server) {
    server.close();
  }
});

test('Advanced Discussion, Notification & Document Management Test Suite', async (t) => {
  let createdCommentId;
  let createdAttachmentId;

  await t.test('1. Discussion: Create project-wide message and verify mention autocomplete', async () => {
    // Check mentionable users
    const mentionRes = await api(`/projects/${testProject._id}/mentionable-users`, 'GET', null, pmToken);
    assert.equal(mentionRes.status, 200);
    assert.ok(Array.isArray(mentionRes.data.data.users));
    assert.ok(mentionRes.data.data.users.length >= 3);

    // Create discussion message mentioning member
    const handle = memberUser.email.split('@')[0];
    const postRes = await api(`/projects/${testProject._id}/discussions`, 'POST', {
      content: `Hello @${handle}, please check the project roadmap updates!`,
      isPublicToClient: true
    }, pmToken);

    assert.equal(postRes.status, 201);
    const comment = postRes.data.data.comment;
    assert.ok(comment._id);
    createdCommentId = comment._id;
    assert.equal(comment.author.name, 'PM Test');

    // Verify mention notification was delivered to member
    const notif = await Notification.findOne({
      recipient: memberUser._id,
      type: 'comment_mention'
    });
    assert.ok(notif, 'Mention notification created for mentioned user');
  });

  await t.test('2. Discussion: Create threaded reply to parent message and verify reply notification', async () => {
    const replyRes = await api(`/projects/${testProject._id}/discussions`, 'POST', {
      content: 'Understood, reviewing the roadmap now.',
      parentCommentId: createdCommentId,
      isPublicToClient: true
    }, memberToken);

    assert.equal(replyRes.status, 201);
    const reply = replyRes.data.data.comment;
    assert.ok(reply._id);
    assert.equal(String(reply.parentComment._id || reply.parentComment), String(createdCommentId));

    // Verify reply notification was delivered to PM
    const replyNotif = await Notification.findOne({
      recipient: pmUser._id,
      type: 'discussion_reply'
    });
    assert.ok(replyNotif, 'Reply notification created for parent author');
  });

  await t.test('3. Discussion: Toggle emoji reaction and pin status', async () => {
    // Toggle reaction
    const reactRes = await api(`/comments/${createdCommentId}/reactions`, 'POST', { emoji: '🚀' }, leadToken);
    assert.equal(reactRes.status, 200);
    assert.ok(reactRes.data.data.reactions.some((r) => r.emoji === '🚀'));

    // Toggle pin (PM authorized)
    const pinRes = await api(`/comments/${createdCommentId}/pin`, 'PATCH', {}, pmToken);
    assert.equal(pinRes.status, 200);
    assert.equal(pinRes.data.data.isPinned, true);

    // Query discussions and verify pinned item is returned
    const listRes = await api(`/projects/${testProject._id}/discussions`, 'GET', null, pmToken);
    assert.equal(listRes.status, 200);
    const discussions = listRes.data.data.discussions;
    assert.ok(discussions.length >= 2);
    assert.equal(discussions[0].isPinned, true);
  });

  await t.test('4. Discussion Security: Non-members and unauthorized clients restricted', async () => {
    // Non-member access rejected
    const nonMemberRes = await api(`/projects/${testProject._id}/discussions`, 'GET', null, otherToken);
    assert.equal(nonMemberRes.status, 403);

    // Team member cannot pin
    const memberPinRes = await api(`/comments/${createdCommentId}/pin`, 'PATCH', {}, memberToken);
    assert.equal(memberPinRes.status, 403);
  });

  await t.test('5. Notification Center: Filter by category, count unread, and dismiss', async () => {
    try {
      // Get unread counts
      const countRes = await api('/notifications/unread-count', 'GET', null, memberToken);
      assert.equal(countRes.status, 200);
      assert.ok(typeof countRes.data.data.total === 'number');

      // List notifications by category
      const listRes = await api('/notifications?category=discussions', 'GET', null, memberToken);
      assert.equal(listRes.status, 200);
      const notifs = listRes.data.data.notifications || listRes.data.data.items;
      assert.ok(Array.isArray(notifs));

      // Dismiss notification
      const userNotif = await Notification.findOne({ recipient: memberUser._id, isDismissed: false });
      if (userNotif) {
        const dismissRes = await api(`/notifications/${userNotif._id}`, 'DELETE', null, memberToken);
        assert.equal(dismissRes.status, 200);
        const updated = await Notification.findById(userNotif._id);
        assert.equal(updated.isDismissed, true);
      }

      // Update preferences
      const prefRes = await api('/notifications/preferences', 'PATCH', { discussionReplies: true, mentions: true }, memberToken);
      assert.equal(prefRes.status, 200);
      assert.equal(prefRes.data.data.preferences.mentions, true);
    } catch (err) {
      console.error('TEST 5 FAILURE:', err);
      throw err;
    }
  });

  await t.test('6. Document Management: Upload document, create version 2, and verify history', async () => {
    try {
      // Valid PDF buffer: %PDF-1.4 header
      const validPdfBuffer = Buffer.from('%PDF-1.4\n%Test document content\n%%EOF');
      const base64Data = validPdfBuffer.toString('base64');

      const uploadRes = await api(`/projects/${testProject._id}/attachments`, 'POST', {
        filename: 'architecture_spec.pdf',
        mimeType: 'application/pdf',
        content: base64Data,
        status: 'submitted',
        description: 'System Architecture Specification v1'
      }, memberToken);

      assert.equal(uploadRes.status, 201);
      const att = uploadRes.data.data.attachment;
      assert.ok(att._id);
      createdAttachmentId = att._id;
      assert.equal(att.currentVersion, 1);

      // Upload version 2
      const v2Buffer = Buffer.from('%PDF-1.4\n%Updated version 2 content with security specs\n%%EOF');
      const v2Base64 = v2Buffer.toString('base64');

      const v2Res = await api(`/attachments/${createdAttachmentId}/versions`, 'POST', {
        filename: 'architecture_spec_v2.pdf',
        mimeType: 'application/pdf',
        content: v2Base64,
        changeDescription: 'Added OAuth2 security specifications'
      }, memberToken);

      assert.equal(v2Res.status, 201);
      const updatedAtt = v2Res.data.data.attachment;
      assert.equal(updatedAtt.currentVersion, 2);
      assert.ok(Array.isArray(updatedAtt.versions));
      assert.ok(updatedAtt.versions.length >= 1);
      assert.equal(updatedAtt.versions[0].version, 1);
    } catch (err) {
      console.error('TEST 6 FAILURE:', err);
      throw err;
    }
  });

  await t.test('7. Document Review Workflow: PM approves deliverable with feedback comments', async () => {
    // PM approves document
    const reviewRes = await api(`/attachments/${createdAttachmentId}/status`, 'PATCH', {
      status: 'approved',
      comments: 'Architecture specs verified and approved for implementation.'
    }, pmToken);

    assert.equal(reviewRes.status, 200);
    const reviewed = reviewRes.data.data.attachment;
    assert.equal(reviewed.status, 'approved');
    assert.equal(reviewed.reviewFeedback.comments, 'Architecture specs verified and approved for implementation.');

    // Verify approval notification was sent to uploader
    const approvalNotif = await Notification.findOne({
      recipient: memberUser._id,
      type: 'document_approved'
    });
    assert.ok(approvalNotif, 'Approval notification generated for uploader');
  });

  await t.test('8. Document Security & Client Confidentiality: Preview stream and role boundaries', async () => {
    // Preview stream returns inline PDF
    const previewRes = await fetch(`${baseUrl}/api/v1/attachments/${createdAttachmentId}/preview`, {
      headers: { Authorization: `Bearer ${pmToken}` }
    });
    assert.equal(previewRes.status, 200);
    assert.ok(previewRes.headers.get('content-disposition')?.includes('inline'));

    // Client trying to approve document is rejected (403)
    const clientApproveRes = await api(`/attachments/${createdAttachmentId}/status`, 'PATCH', {
      status: 'approved'
    }, clientToken);
    assert.equal(clientApproveRes.status, 403);

    // Create an internal attachment (isPublicToClient: false)
    const internalBuffer = Buffer.from('%PDF-1.4\n%Confidential Internal Costing\n%%EOF');
    const intUploadRes = await api(`/projects/${testProject._id}/attachments`, 'POST', {
      filename: 'internal_budget.pdf',
      mimeType: 'application/pdf',
      content: internalBuffer.toString('base64'),
      isPublicToClient: false
    }, pmToken);
    assert.equal(intUploadRes.status, 201);
    const intAtt = intUploadRes.data.data.attachment;

    // Client preview/download of internal doc is strictly rejected (403)
    const clientPreviewRes = await fetch(`${baseUrl}/api/v1/attachments/${intAtt._id}/preview`, {
      headers: { Authorization: `Bearer ${clientToken}` }
    });
    assert.equal(clientPreviewRes.status, 403);
  });
});
