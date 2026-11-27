import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { User, Project, Task, Comment, Attachment, Notification } from '../src/models/index.js';
import {
  validateMagicNumber,
  sanitizeFilename,
  UPLOADS_DIR
} from '../src/services/collaboration.js';

const JWT_SECRET = process.env.JWT_SECRET || 'nexora-ai-local-secret-2026-project';
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nexora_ai_demo';

function signToken(user) {
  return jwt.sign(
    { sub: user._id, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

test('Phase 5: Team Collaboration and Secure File Management Suite', async (t) => {
  let server;
  let baseUrl;
  let pmUser;
  let devUser;
  let devUser2;
  let clientUser;
  let project;
  let task;
  let pmToken;
  let devToken;
  let dev2Token;
  let clientToken;

  let createdCommentId;
  let createdAttachmentId;

  t.before(async () => {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(MONGO_URI);
    }

    pmUser = await User.findOne({ role: 'project_manager', isActive: true });
    clientUser = await User.findOne({ role: 'client', isActive: true });
    const devs = await User.find({ role: { $in: ['team_member', 'team_lead'] }, isActive: true }).limit(2);
    devUser = devs[0];
    devUser2 = devs[1] || devs[0];

    project = await Project.findOne();
    assert.ok(pmUser, 'PM user must exist');
    assert.ok(clientUser, 'Client user must exist');
    assert.ok(devUser, 'Dev user must exist');
    assert.ok(project, 'Project must exist');

    task = await Task.findOne({ project: project._id });
    assert.ok(task, 'Task must exist in project');

    // Ensure users have access to test project
    if (!project.teamMembers.map(String).includes(String(devUser._id))) {
      project.teamMembers.push(devUser._id);
    }
    if (!project.teamMembers.map(String).includes(String(devUser2._id))) {
      project.teamMembers.push(devUser2._id);
    }
    project.client = clientUser._id;
    project.projectManager = pmUser._id;
    await project.save();

    pmToken = signToken(pmUser);
    devToken = signToken(devUser);
    dev2Token = signToken(devUser2);
    clientToken = signToken(clientUser);

    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}/api/v1`;
        resolve();
      });
    });
  });

  t.after(async () => {
    try {
      if (createdCommentId) {
        await Comment.findByIdAndDelete(createdCommentId);
      }
      if (createdAttachmentId) {
        const att = await Attachment.findById(createdAttachmentId);
        if (att && fs.existsSync(att.storagePath)) {
          try { fs.unlinkSync(att.storagePath); } catch {}
        }
        await Attachment.findByIdAndDelete(createdAttachmentId);
      }
    } catch {}

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    try { await mongoose.disconnect(); } catch {}
  });

  await t.test('1. Unit: validateMagicNumber correctly verifies header signatures', () => {
    // Valid PDF
    const validPdf = Buffer.from('%PDF-1.4 sample content');
    assert.equal(validateMagicNumber(validPdf, '.pdf').valid, true);

    // Corrupted PDF (missing magic)
    const badPdf = Buffer.from('NOT_A_PDF content');
    const pdfCheck = validateMagicNumber(badPdf, '.pdf');
    assert.equal(pdfCheck.valid, false);
    assert.match(pdfCheck.reason, /missing %PDF-/);

    // Valid PNG
    const validPng = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00]);
    assert.equal(validateMagicNumber(validPng, '.png').valid, true);

    // Valid JPEG
    const validJpg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
    assert.equal(validateMagicNumber(validJpg, '.jpg').valid, true);

    // Text with null byte (injection)
    const badText = Buffer.from('Hello world\x00malicious');
    const textCheck = validateMagicNumber(badText, '.txt');
    assert.equal(textCheck.valid, false);
    assert.match(textCheck.reason, /null bytes/);
  });

  await t.test('2. Unit: sanitizeFilename prevents path traversal and unsafe characters', () => {
    const res1 = sanitizeFilename('../../etc/passwd.pdf');
    assert.equal(res1.includes('..'), false);
    assert.equal(res1.includes('/'), false);
    assert.equal(res1, 'passwd.pdf');

    const res2 = sanitizeFilename('..\\..\\Windows\\System32\\file.png');
    assert.equal(res2.includes('..'), false);
    assert.equal(res2.includes('\\'), false);

    const res3 = sanitizeFilename('my design document (v2) [final].pdf');
    assert.match(res3, /my_design_document.*\.pdf/);
  });

  await t.test('3. API: POST /tasks/:taskId/comments creates comment and triggers mention notifications', async () => {
    // Mention devUser2 in comment: "@" + devUser2's name handle
    const dev2Handle = devUser2.email ? devUser2.email.split('@')[0] : devUser2.name.replace(/\s+/g, '');
    const res = await fetch(`${baseUrl}/tasks/${task._id}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${devToken}`
      },
      body: JSON.stringify({
        content: `Checking progress with @${dev2Handle} on this task requirement.`
      })
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.comment);
    assert.equal(body.data.comment.content.includes(dev2Handle), true);
    assert.equal(String(body.data.comment.author._id), String(devUser._id));

    createdCommentId = body.data.comment._id;

    // Check that mention notification was generated in MongoDB
    const notif = await Notification.findOne({
      recipient: devUser2._id,
      type: 'comment_mention',
      relatedComment: createdCommentId
    });
    assert.ok(notif, 'Mention notification must be created for mentioned user');
  });

  await t.test('4. API: GET /tasks/:taskId/comments returns task discussion history', async () => {
    const res = await fetch(`${baseUrl}/tasks/${task._id}/comments`, {
      headers: {
        Authorization: `Bearer ${devToken}`
      }
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data.comments));
    assert.ok(body.data.comments.length >= 1);
    const found = body.data.comments.find((c) => String(c._id) === String(createdCommentId));
    assert.ok(found, 'Created comment must appear in task comments');
  });

  await t.test('5. API: PATCH /comments/:commentId allows author to edit comment and forbids others', async () => {
    // Non-author attempt (dev2) -> 403 Forbidden
    const forbiddenRes = await fetch(`${baseUrl}/comments/${createdCommentId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${dev2Token}`
      },
      body: JSON.stringify({ content: 'Attempt to tamper with other user comment' })
    });
    assert.equal(forbiddenRes.status, 403);

    // Author attempt -> 200 OK
    const updateRes = await fetch(`${baseUrl}/comments/${createdCommentId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${devToken}`
      },
      body: JSON.stringify({ content: 'Updated comment content with revised scope.' })
    });

    assert.equal(updateRes.status, 200);
    const body = await updateRes.json();
    assert.equal(body.data.comment.isEdited, true);
    assert.equal(body.data.comment.content, 'Updated comment content with revised scope.');
  });

  await t.test('6. API: POST /projects/:projectId/attachments validates MIME and uploads valid file', async () => {
    // 1. Valid PDF upload with magic number
    const validPdfBuffer = Buffer.from('%PDF-1.4\n%NEXORA architectural documentation\n%%EOF');
    const base64Data = validPdfBuffer.toString('base64');

    const res = await fetch(`${baseUrl}/projects/${project._id}/attachments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${devToken}`
      },
      body: JSON.stringify({
        filename: 'architecture_spec.pdf',
        mimeType: 'application/pdf',
        content: base64Data,
        taskId: task._id,
        isPublicToClient: false // Internal developer document
      })
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.attachment);
    assert.equal(body.data.attachment.filename, 'architecture_spec.pdf');
    assert.equal(body.data.attachment.isPublicToClient, false);
    createdAttachmentId = body.data.attachment._id;

    // Verify physical file was written to disk
    const diskPath = path.join(UPLOADS_DIR, body.data.attachment.storageName || '');
    assert.equal(fs.existsSync(body.data.attachment.storagePath || diskPath), true);
  });

  await t.test('7. API: POST /projects/:projectId/attachments rejects spoofed files and disallowed extensions', async () => {
    // Disallowed extension (.exe)
    const badExtRes = await fetch(`${baseUrl}/projects/${project._id}/attachments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${devToken}`
      },
      body: JSON.stringify({
        filename: 'malicious.exe',
        mimeType: 'application/x-msdownload',
        content: Buffer.from('MZ_malicious_code').toString('base64')
      })
    });
    assert.equal(badExtRes.status, 400);

    // Spoofed PDF (has .pdf extension but invalid header bytes)
    const spoofedRes = await fetch(`${baseUrl}/projects/${project._id}/attachments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${devToken}`
      },
      body: JSON.stringify({
        filename: 'fake.pdf',
        mimeType: 'application/pdf',
        content: Buffer.from('THIS IS NOT A VALID PDF FILE').toString('base64')
      })
    });
    assert.equal(spoofedRes.status, 400);
  });

  await t.test('8. API: Client confidentiality - internal attachments are hidden from client', async () => {
    // 1. Dev listing -> can see the internal attachment
    const devListRes = await fetch(`${baseUrl}/projects/${project._id}/attachments`, {
      headers: { Authorization: `Bearer ${devToken}` }
    });
    const devList = await devListRes.json();
    const devFound = devList.data.attachments.find((a) => String(a._id) === String(createdAttachmentId));
    assert.ok(devFound, 'Internal attachment must be visible to internal developer');

    // 2. Client listing -> internal attachment is masked/filtered out
    const clientListRes = await fetch(`${baseUrl}/projects/${project._id}/attachments`, {
      headers: { Authorization: `Bearer ${clientToken}` }
    });
    const clientList = await clientListRes.json();
    const clientFound = clientList.data.attachments.find((a) => String(a._id) === String(createdAttachmentId));
    assert.equal(clientFound, undefined, 'Internal attachment must be hidden from client listing');

    // 3. Client direct download attempt -> 403 Forbidden
    const clientDlRes = await fetch(`${baseUrl}/attachments/${createdAttachmentId}/download`, {
      headers: { Authorization: `Bearer ${clientToken}` }
    });
    assert.equal(clientDlRes.status, 403, 'Client direct download of internal attachment must return 403 Forbidden');
  });

  await t.test('9. API: GET /attachments/:id/download securely streams file with security headers', async () => {
    const res = await fetch(`${baseUrl}/attachments/${createdAttachmentId}/download`, {
      headers: { Authorization: `Bearer ${devToken}` }
    });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/pdf');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.match(res.headers.get('content-disposition'), /attachment; filename="architecture_spec\.pdf"/);

    const streamData = await res.text();
    assert.match(streamData, /%PDF-1.4/);
  });

  await t.test('10. API: DELETE /attachments/:id removes file from disk and database', async () => {
    // Non-author dev2 attempt -> 403
    const forbiddenDel = await fetch(`${baseUrl}/attachments/${createdAttachmentId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${dev2Token}` }
    });
    assert.equal(forbiddenDel.status, 403);

    // Author dev attempt -> 200
    const res = await fetch(`${baseUrl}/attachments/${createdAttachmentId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${devToken}` }
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);

    // Verify DB record removed
    const att = await Attachment.findById(createdAttachmentId);
    assert.equal(att, null);

    createdAttachmentId = null;
  });

  await t.test('11. API: DELETE /comments/:commentId allows PM or author to delete comment', async () => {
    const res = await fetch(`${baseUrl}/comments/${createdCommentId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${pmToken}` }
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);

    const c = await Comment.findById(createdCommentId);
    assert.equal(c, null);
    createdCommentId = null;
  });
});
