import jwt from 'jsonwebtoken';
import { User, roles } from '../models/index.js';

export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace(/^Bearer\s+/i, '') || req.query.token;
    if (!token) return res.status(401).json({ success: false, message: 'Authentication required' });

    const payload = jwt.verify(token, (process.env.JWT_SECRET || 'nexora-ai-local-secret-2026-project'));
    let user = await User.findById(payload.sub);

    if (!user) {
      if (payload.sub && payload.role && roles.includes(payload.role)) {
        user = { _id: payload.sub, role: payload.role, email: payload.email || 'mock@nexora.ai', isActive: true, name: 'Mock User' };
      } else {
        return res.status(401).json({ success: false, message: 'Session is no longer valid' });
      }
    } else if (!user.isActive || user.role === 'project_owner' || !roles.includes(user.role)) {
      return res.status(401).json({ success: false, message: 'Session is no longer valid' });
    } else if (payload.tokenVersion && user.tokenVersion && payload.tokenVersion < user.tokenVersion) {
      return res.status(401).json({ success: false, message: 'Session has been revoked. Please sign in again.' });
    }

    req.user = user;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

export const authorizeRoles = (...allowed) => (req, res, next) =>
  allowed.includes(req.user.role) ? next() : res.status(403).json({ success: false, message: 'You do not have permission for this action' });
