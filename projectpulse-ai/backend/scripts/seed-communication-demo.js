import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { User, Project, Task, Comment, Attachment, Notification } from '../src/models/index.js';
import { UPLOADS_DIR } from '../src/services/collaboration.js';

async function seedCommunicationDemo() {
  await mongoose.connect('mongodb://localhost:27017/nexora_ai_demo');
  console.log('Connected to MongoDB');

  const pm = await User.findOne({ email: 'dileep@nexora.ai' });
  const lead = await User.findOne({ email: 'sohel@nexora.ai' });
  const member = await User.findOne({ email: 'hema@nexora.ai' });
  const client = await User.findOne({ email: 'client@nexora.ai' });

  if (!pm || !lead || !member || !client) {
    console.error('Required users not found');
    process.exit(1);
  }

  const projects = await Project.find({});
  const p1 = projects.find(p => p.name === 'Enterprise Core Migration') || projects[0];

  const tasksP1 = await Task.find({ project: p1._id });
  const taskDb = tasksP1.find(t => t.title.includes('Database Replica')) || tasksP1[0];
  const taskClient = tasksP1.find(t => t.title.includes('Client Deliverables')) || tasksP1[2];

  // 1. SEED COMMENTS / DISCUSSIONS (only if count is 0)
  const existingComments = await Comment.countDocuments({ project: p1._id });
  if (existingComments === 0) {
    console.log('Seeding discussion comments...');

    // Pinned Announcement by PM
    const pinnedAnnouncement = await Comment.create({
      project: p1._id,
      author: pm._id,
      content: '📢 **Sprint 3 Architecture Milestone Kickoff**\nWelcome team! We are targeting 100% completion on Database Replica Set and Socket.IO Room Isolation this cycle. Please review architectural docs and tag @sohel for technical design reviews.',
      isPinned: true,
      pinnedBy: pm._id,
      pinnedAt: new Date(Date.now() - 3600000 * 24),
      isPublicToClient: true,
      reactions: [
        { emoji: '🚀', users: [lead._id, member._id, client._id] },
        { emoji: '🔥', users: [lead._id, member._id] },
        { emoji: '👍', users: [client._id] }
      ],
      mentions: [lead._id]
    });

    // Pinned announcement reply by Team Lead
    await Comment.create({
      project: p1._id,
      author: lead._id,
      content: 'Confirmed @dileep. Replica failover testing is underway and we will have the benchmark report uploaded by end of day today.',
      parentComment: pinnedAnnouncement._id,
      isPinned: false,
      isPublicToClient: true,
      reactions: [
        { emoji: '🙌', users: [pm._id, member._id] }
      ],
      mentions: [pm._id]
    });

    // General discussion with threaded reply
    const generalComment = await Comment.create({
      project: p1._id,
      author: lead._id,
      content: 'Hey @hema, please ensure the multi-tenant room isolation verifies handshake tokens prior to namespace attachment. Let me know if you need any pairing on the socket adapter.',
      isPinned: false,
      isPublicToClient: false, // Internal
      reactions: [
        { emoji: '💡', users: [member._id] },
        { emoji: '👍', users: [pm._id] }
      ],
      mentions: [member._id]
    });

    await Comment.create({
      project: p1._id,
      author: member._id,
      content: 'Understood @sohel! Completed the token claims extraction and unit tests are passing. Pushing the PR shortly for review.',
      parentComment: generalComment._id,
      isPinned: false,
      isPublicToClient: false, // Internal
      reactions: [
        { emoji: '✅', users: [lead._id] },
        { emoji: '❤️', users: [lead._id, pm._id] }
      ],
      mentions: [lead._id]
    });

    // Client-facing query by Client
    const clientComment = await Comment.create({
      project: p1._id,
      author: client._id,
      content: 'Hello NEXORA team, will the responsive deliverables dashboard preview be available for stakeholder review by Thursday afternoon?',
      isPinned: false,
      isPublicToClient: true,
      reactions: [
        { emoji: '👀', users: [pm._id] }
      ]
    });

    await Comment.create({
      project: p1._id,
      author: pm._id,
      content: 'Hi Acme team, yes! @hema has wrapped up the client dashboard components and we will publish the interactive staging demo on Thursday at 2 PM EST.',
      parentComment: clientComment._id,
      isPinned: false,
      isPublicToClient: true,
      reactions: [
        { emoji: '🎉', users: [client._id] }
      ],
      mentions: [member._id]
    });

    // Task-specific discussion
    if (taskDb) {
      await Comment.create({
        project: p1._id,
        task: taskDb._id,
        author: lead._id,
        content: 'Task Discussion: Checking progress with @hema on this task requirement. MongoDB secondary node replica arbiter election latency is under 180ms.',
        isPinned: false,
        isPublicToClient: false,
        reactions: [
          { emoji: '⚡', users: [member._id] }
        ],
        mentions: [member._id]
      });
    }

    console.log('Discussions seeded successfully');
  }

  // 2. SEED SAMPLE DOCUMENTS IN ATTACHMENT COLLECTION & DISK
  const existingDocs = await Attachment.countDocuments({ project: p1._id });
  if (existingDocs === 0) {
    console.log('Seeding documents and file fixtures...');

    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    // Helper to generate minimal valid PDF buffer
    function createMinimalPdfBuffer(title) {
      const content = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>\nendobj\n4 0 obj\n<< /Length 80 >>\nstream\nBT\n/F1 20 Tf\n80 720 Td\n(${title}) Tj\nET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000286 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n416\n%%EOF\n`;
      return Buffer.from(content, 'utf8');
    }

    // Helper to generate minimal valid 1x1 PNG buffer
    function createMinimalPngBuffer() {
      // 1x1 8-bit PNG
      return Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR header
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // width=1, height=1
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, // 8-bit truecolor
        0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, // IDAT chunk
        0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
        0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d,
        0xb0, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, // IEND chunk
        0x44, 0xae, 0x42, 0x60, 0x82
      ]);
    }

    // Doc 1: Architecture Blueprint (v2, Approved, Client-Safe)
    const pdfBuf1 = createMinimalPdfBuffer('NEXORA System Architecture Blueprint v2');
    const storageName1 = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}.pdf`;
    const storagePath1 = path.join(UPLOADS_DIR, storageName1);
    fs.writeFileSync(storagePath1, pdfBuf1);

    await Attachment.create({
      filename: 'NEXORA_System_Architecture_Blueprint_v2.pdf',
      storageName: storageName1,
      storagePath: storagePath1,
      mimeType: 'application/pdf',
      size: pdfBuf1.length,
      uploadedBy: lead._id,
      project: p1._id,
      isPublicToClient: true,
      status: 'approved',
      currentVersion: 2,
      description: 'Production architecture diagram detailing replica set topology and WebSocket cluster isolation.',
      versions: [
        {
          version: 1,
          filename: 'NEXORA_System_Architecture_Blueprint_v1.pdf',
          storageName: storageName1,
          storagePath: storagePath1,
          mimeType: 'application/pdf',
          size: pdfBuf1.length,
          uploadedBy: lead._id,
          createdAt: new Date(Date.now() - 3600000 * 48),
          changeDescription: 'Initial architectural draft.'
        },
        {
          version: 2,
          filename: 'NEXORA_System_Architecture_Blueprint_v2.pdf',
          storageName: storageName1,
          storagePath: storagePath1,
          mimeType: 'application/pdf',
          size: pdfBuf1.length,
          uploadedBy: lead._id,
          createdAt: new Date(Date.now() - 3600000 * 12),
          changeDescription: 'Incorporated client privacy safeguards and socket room isolation.'
        }
      ],
      reviewFeedback: {
        status: 'approved',
        reviewedBy: pm._id,
        reviewedAt: new Date(Date.now() - 3600000 * 6),
        comments: 'Approved for client delivery and technical signoff.'
      }
    });

    // Doc 2: Sprint 3 Deliverables Summary (v1, Submitted, Client-Safe)
    const pdfBuf2 = createMinimalPdfBuffer('Sprint 3 Deliverables Milestone Summary');
    const storageName2 = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}.pdf`;
    const storagePath2 = path.join(UPLOADS_DIR, storageName2);
    fs.writeFileSync(storagePath2, pdfBuf2);

    await Attachment.create({
      filename: 'Sprint_3_Deliverables_Summary.pdf',
      storageName: storageName2,
      storagePath: storagePath2,
      mimeType: 'application/pdf',
      size: pdfBuf2.length,
      uploadedBy: member._id,
      project: p1._id,
      task: taskClient ? taskClient._id : undefined,
      isPublicToClient: true,
      status: 'submitted',
      currentVersion: 1,
      description: 'Formal deliverable review package submitted for Project Manager signoff.',
      versions: [
        {
          version: 1,
          filename: 'Sprint_3_Deliverables_Summary.pdf',
          storageName: storageName2,
          storagePath: storagePath2,
          mimeType: 'application/pdf',
          size: pdfBuf2.length,
          uploadedBy: member._id,
          createdAt: new Date(Date.now() - 3600000 * 8),
          changeDescription: 'First release candidate for Sprint 3 milestones.'
        }
      ]
    });

    // Doc 3: Internal Cost & Resource Allocation (v1, Internal Team Only, Draft)
    const pdfBuf3 = createMinimalPdfBuffer('Internal Resource & Budget Breakdown - Confidential');
    const storageName3 = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}.pdf`;
    const storagePath3 = path.join(UPLOADS_DIR, storageName3);
    fs.writeFileSync(storagePath3, pdfBuf3);

    await Attachment.create({
      filename: 'Sprint_Cost_Breakdown_Internal.pdf',
      storageName: storageName3,
      storagePath: storagePath3,
      mimeType: 'application/pdf',
      size: pdfBuf3.length,
      uploadedBy: pm._id,
      project: p1._id,
      isPublicToClient: false, // Internal confidential
      status: 'draft',
      currentVersion: 1,
      description: 'Proprietary financial analysis and developer resource allocation sheet.',
      versions: [
        {
          version: 1,
          filename: 'Sprint_Cost_Breakdown_Internal.pdf',
          storageName: storageName3,
          storagePath: storagePath3,
          mimeType: 'application/pdf',
          size: pdfBuf3.length,
          uploadedBy: pm._id,
          createdAt: new Date(Date.now() - 3600000 * 18),
          changeDescription: 'Initial financial modeling.'
        }
      ]
    });

    // Doc 4: High-Fidelity UI Mockup (PNG, Approved, Client-Safe)
    const pngBuf = createMinimalPngBuffer();
    const storageName4 = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}.png`;
    const storagePath4 = path.join(UPLOADS_DIR, storageName4);
    fs.writeFileSync(storagePath4, pngBuf);

    await Attachment.create({
      filename: 'Client_Dashboard_High_Fidelity_Mockup.png',
      storageName: storageName4,
      storagePath: storagePath4,
      mimeType: 'image/png',
      size: pngBuf.length,
      uploadedBy: member._id,
      project: p1._id,
      task: taskClient ? taskClient._id : undefined,
      isPublicToClient: true,
      status: 'approved',
      currentVersion: 1,
      description: 'Pixel-perfect wireframe preview of the client project status dashboard.',
      versions: [
        {
          version: 1,
          filename: 'Client_Dashboard_High_Fidelity_Mockup.png',
          storageName: storageName4,
          storagePath: storagePath4,
          mimeType: 'image/png',
          size: pngBuf.length,
          uploadedBy: member._id,
          createdAt: new Date(Date.now() - 3600000 * 20),
          changeDescription: 'Exported Figma visual design prototype.'
        }
      ],
      reviewFeedback: {
        status: 'approved',
        reviewedBy: lead._id,
        reviewedAt: new Date(Date.now() - 3600000 * 15),
        comments: 'UX looks superb and fully compliant with branding standards.'
      }
    });

    console.log('Documents seeded successfully');
  }

  // 3. SEED RICH NOTIFICATIONS (for PM, Lead, Client across categories)
  const pmNotifsCount = await Notification.countDocuments({ recipient: pm._id });
  if (pmNotifsCount === 0) {
    console.log('Seeding notifications for PM...');
    await Notification.create([
      {
        recipient: pm._id,
        type: 'approval_requested',
        category: 'approvals',
        title: 'Review Requested: Sprint 3 Deliverables Summary',
        message: 'Hema Vardhan submitted Sprint 3 Deliverables Summary for project Enterprise Core Migration.',
        priority: 'high',
        relatedProject: p1._id,
        isRead: false
      },
      {
        recipient: pm._id,
        type: 'document_uploaded',
        category: 'documents',
        title: 'New Document Uploaded',
        message: 'Sohel uploaded NEXORA System Architecture Blueprint v2 (application/pdf).',
        priority: 'medium',
        relatedProject: p1._id,
        isRead: false
      },
      {
        recipient: pm._id,
        type: 'discussion_reply',
        category: 'discussions',
        title: 'Reply on Sprint 3 Kickoff',
        message: 'Sohel replied: "Confirmed @dileep. Replica failover testing is underway..."',
        priority: 'medium',
        relatedProject: p1._id,
        isRead: false
      },
      {
        recipient: pm._id,
        type: 'milestone_approaching',
        category: 'projects',
        title: 'Milestone Approaching: Architecture Signoff',
        message: 'Milestone "Core Architecture Signoff" is due in 3 days with 85% progress.',
        priority: 'medium',
        relatedProject: p1._id,
        isRead: true
      }
    ]);
  }

  const clientNotifsCount = await Notification.countDocuments({ recipient: client._id });
  if (clientNotifsCount === 0) {
    console.log('Seeding notifications for Client...');
    await Notification.create([
      {
        recipient: client._id,
        type: 'discussion_reply',
        category: 'discussions',
        title: 'Project Update from Dileep',
        message: 'Dileep replied to your query regarding the deliverables dashboard preview.',
        priority: 'medium',
        relatedProject: p1._id,
        isRead: false
      },
      {
        recipient: client._id,
        type: 'document_approved',
        category: 'documents',
        title: 'Deliverable Approved: Architecture Blueprint',
        message: 'NEXORA System Architecture Blueprint v2 has been approved and published to client deliverables.',
        priority: 'low',
        relatedProject: p1._id,
        isRead: false
      }
    ]);
  }

  console.log('Communication & Document seeding completed successfully!');
  await mongoose.disconnect();
}

seedCommunicationDemo().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
