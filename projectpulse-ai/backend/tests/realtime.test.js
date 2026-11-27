import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import jwt from 'jsonwebtoken';
import { io as Client } from 'socket.io-client';
import express from 'express';
import mongoose from 'mongoose';
import { initRealtime, emitTaskUpdated, emitNotification } from '../src/services/realtime.js';
import { User, Project } from '../src/models/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'nexora-ai-local-secret-2026-project';
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nexora_ai_demo';

test('Real-time Socket.IO Server Security & Room Isolation', async (t) => {
  let server;
  let port;
  let ioServer;
  let pmUser;
  let clientUser;
  let project;

  t.before(async () => {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(MONGO_URI);
    }

    pmUser = await User.findOne({ role: 'project_manager' });
    clientUser = await User.findOne({ role: 'client' });
    project = await Project.findOne();

    const app = express();
    server = http.createServer(app);
    ioServer = initRealtime(server, { allowedOrigins: ['*'] });

    await new Promise((resolve) => {
      server.listen(0, () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  t.after(async () => {
    try { await mongoose.disconnect(); } catch {}

    if (ioServer) ioServer.close();
    if (server) await new Promise((r) => server.close(r));
  });

  await t.test('1. Rejects unauthenticated connections with missing token', async () => {
    await new Promise((resolve) => {
      const client = Client(`http://localhost:${port}`, {
        transports: ['websocket'],
        reconnection: false
      });

      client.on('connect_error', (err) => {
        assert.ok(err.message.includes('Missing token'));
        client.close();
        resolve();
      });
    });
  });

  await t.test('2. Rejects unauthenticated connections with invalid token', async () => {
    await new Promise((resolve) => {
      const client = Client(`http://localhost:${port}`, {
        auth: { token: 'invalid.bogus.jwt' },
        transports: ['websocket'],
        reconnection: false
      });

      client.on('connect_error', (err) => {
        assert.ok(err.message.includes('Invalid or expired token'));
        client.close();
        resolve();
      });
    });
  });

  await t.test('3. Successfully authenticates valid JWT and assigns user identity', async () => {
    const token = jwt.sign(
      { id: pmUser._id, role: pmUser.role, email: pmUser.email, name: pmUser.name },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    await new Promise((resolve, reject) => {
      const client = Client(`http://localhost:${port}`, {
        auth: { token },
        transports: ['websocket'],
        reconnection: false
      });

      client.on('connect', () => {
        assert.ok(client.connected);
        client.close();
        resolve();
      });

      client.on('connect_error', (err) => {
        client.close();
        reject(err);
      });
    });
  });

  await t.test('4. Rejects joining unauthorized project room', async () => {
    const fakeProjectUser = await User.create({
      name: 'Unauthorized Stranger',
      email: `stranger-${Date.now()}@test.com`,
      password: 'Password123!',
      role: 'team_member',
      isActive: true
    });

    const token = jwt.sign(
      { id: fakeProjectUser._id, role: fakeProjectUser.role, email: fakeProjectUser.email, name: fakeProjectUser.name },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    await new Promise((resolve) => {
      const client = Client(`http://localhost:${port}`, {
        auth: { token },
        transports: ['websocket'],
        reconnection: false
      });

      client.on('connect', () => {
        client.emit('project:join', { projectId: String(project._id) }, (res) => {
          assert.equal(res.success, false);
          assert.ok(res.error.includes('Access denied'));
          client.close();
          resolve();
        });
      });
    });

    await User.deleteOne({ _id: fakeProjectUser._id });
  });

  await t.test('5. Allows joining authorized project room and receives live task event', async () => {
    const token = jwt.sign(
      { id: pmUser._id, role: pmUser.role, email: pmUser.email, name: pmUser.name },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    await new Promise((resolve) => {
      const client = Client(`http://localhost:${port}`, {
        auth: { token },
        transports: ['websocket'],
        reconnection: false
      });

      client.on('connect', () => {
        client.emit('project:join', { projectId: String(project._id) }, (res) => {
          assert.equal(res.success, true);
          assert.equal(res.projectId, String(project._id));

          client.on('task:updated', (payload) => {
            assert.equal(payload.taskId, 'test-task-123');
            assert.equal(payload.status, 'in_progress');
            client.close();
            resolve();
          });

          // Trigger server broadcast
          emitTaskUpdated({
            _id: 'test-task-123',
            title: 'Real-time Test Task',
            status: 'in_progress',
            progress: 50,
            priority: 'high',
            project: project._id
          });
        });
      });
    });
  });

  await t.test('6. Delivers personal notifications directly to target user room', async () => {
    const token = jwt.sign(
      { id: clientUser._id, role: clientUser.role, email: clientUser.email, name: clientUser.name },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    await new Promise((resolve) => {
      const client = Client(`http://localhost:${port}`, {
        auth: { token },
        transports: ['websocket'],
        reconnection: false
      });

      client.on('connect', () => {
        client.on('notification:new', (notif) => {
          assert.equal(notif.title, 'Stakeholder Milestone Notice');
          assert.equal(notif.priority, 'high');
          client.close();
          resolve();
        });

        // Emit direct notification
        emitNotification({
          _id: 'notif-123',
          type: 'system',
          title: 'Stakeholder Milestone Notice',
          message: 'Q4 Milestone completed ahead of schedule',
          priority: 'high'
        }, clientUser._id);
      });
    });
  });
});
