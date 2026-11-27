import 'dotenv/config';
import { connectDatabase } from '../src/config/db.js';
import { User, Project, Task, Milestone, ProjectUpdate, MemberSkill, MemberAvailability, ProjectRiskSnapshot, ActivityLog, ResourceRecommendation } from '../src/models/index.js';
import { calculateProjectMetrics, saveRecommendation } from '../src/services/metrics.js';

const password = 'ProjectPulse@2026';
const people = [
  ['System Administrator', 'admin@projectpulse.ai', 'admin', 'Platform Administrator', ['Governance', 'Analytics']],
  ['Priya Sharma', 'priya.pm@projectpulse.ai', 'project_manager', 'Project Manager', ['Project Management', 'Risk Management', 'Agile']],
  ['Aisha Khan', 'aisha.lead@projectpulse.ai', 'team_lead', 'Technical Lead', ['JavaScript', 'React', 'Node.js', 'Python', 'Machine Learning']],
  ['Member Demo User', 'member@projectpulse.ai', 'team_member', 'Full-stack Engineer', ['React', 'Node.js', 'MongoDB', 'Testing']],
  ['Client Demo User', 'client@projectpulse.ai', 'client', 'Product Sponsor', []],
  ['Rahul Verma', 'rahul@projectpulse.ai', 'team_member', 'ML Engineer', ['Python', 'Machine Learning', 'Data Analysis']],
  ['Arjun Patel', 'arjun@projectpulse.ai', 'team_member', 'Backend Engineer', ['Node.js', 'Express', 'MongoDB', 'Testing']]
];
const date = (days) => new Date(Date.now() + days * 86400000);
async function upsertUser([name, email, role, jobTitle, skills]) { let user = await User.findOne({ email }); if (!user) user = await User.create({ name, email, password, role, jobTitle, department: 'Engineering', skills, workloadCapacity: role === 'client' ? 1 : 40 }); else { Object.assign(user, { name, role, jobTitle, skills }); await user.save(); } return user; }
await connectDatabase();
try {
  const users = Object.fromEntries((await Promise.all(people.map(upsertUser))).map((user) => [user.email, user]));
  const pm = users['priya.pm@projectpulse.ai']; const lead = users['aisha.lead@projectpulse.ai']; const member = users['member@projectpulse.ai']; const client = users['client@projectpulse.ai']; const rahul = users['rahul@projectpulse.ai']; const arjun = users['arjun@projectpulse.ai'];
  let project = await Project.findOne({ name: 'ProjectPulse AI – Intelligent Project Monitoring System' });
  if (!project) project = await Project.create({ name: 'ProjectPulse AI – Intelligent Project Monitoring System', description: 'An AI-powered platform for intelligent project monitoring, risk prediction, resource optimization and team performance analytics.', status: 'active', priority: 'high', owner: pm._id, projectManager: pm._id, teamLead: lead._id, teamMembers: [pm._id, lead._id, member._id, rahul._id, arjun._id], client: client._id, startDate: date(-28), deadline: date(19), budget: 250000 });
  const skillRows = [
    [lead, 'Python', 'expert', 4], [lead, 'Machine Learning', 'advanced', 3], [lead, 'React', 'expert', 4], [lead, 'Node.js', 'advanced', 3],
    [member, 'React', 'advanced', 2], [member, 'Node.js', 'advanced', 2], [member, 'MongoDB', 'intermediate', 2], [member, 'Testing', 'advanced', 2],
    [rahul, 'Python', 'expert', 3], [rahul, 'Machine Learning', 'expert', 3], [rahul, 'Data Analysis', 'advanced', 3],
    [arjun, 'Node.js', 'expert', 3], [arjun, 'Express', 'expert', 3], [arjun, 'MongoDB', 'advanced', 3], [arjun, 'Testing', 'advanced', 3]
  ];
  for (const [person, skillName, proficiency, experienceYears] of skillRows) await MemberSkill.updateOne({ member: person._id, skillName }, { member: person._id, skillName, proficiency, experienceYears, lastUsed: date(-2) }, { upsert: true });
  const availability = await MemberAvailability.findOne({ member: rahul._id, status: 'unavailable' }); if (!availability) { rahul.availabilityStatus = 'unavailable'; await rahul.save(); await MemberAvailability.create({ member: rahul._id, status: 'unavailable', capacityPercentage: 0, reason: 'Demo resource availability scenario', updatedBy: lead._id }); }
  const taskRows = [
    ['Requirement Analysis', lead, 'completed', 100, -19, 20, 18, 'medium', []], ['System Architecture Design', arjun, 'completed', 100, -15, 28, 26, 'high', []], ['Literature Review', member, 'completed', 100, -12, 16, 14, 'medium', []],
    ['UI Development', member, 'in-progress', 68, 7, 48, 30, 'high', [{ name: 'React', importance: .9 }]], ['Backend API Integration', arjun, 'in-progress', 58, 4, 52, 35, 'high', [{ name: 'Node.js', importance: .9 }, { name: 'MongoDB', importance: .7 }]],
    ['Risk Prediction Module', rahul, 'in-progress', 35, 5, 42, 17, 'critical', [{ name: 'Python', importance: .9 }, { name: 'Machine Learning', importance: 1 }]], ['Testing Module', arjun, 'todo', 0, 12, 32, 0, 'high', [{ name: 'Testing', importance: .9 }]],
    ['Project Documentation', member, 'todo', 20, 15, 22, 4, 'medium', []], ['Resource Optimization Module', lead, 'blocked', 40, 9, 38, 15, 'critical', [{ name: 'Python', importance: .7 }, { name: 'Machine Learning', importance: .9 }]], ['Deployment and Evaluation', arjun, 'todo', 0, 18, 30, 0, 'medium', [{ name: 'Node.js', importance: .6 }]]
  ];
  for (const [title, assignedTo, status, progress, dueDay, estimatedHours, actualHours, priority, requiredSkills] of taskRows) await Task.updateOne({ project: project._id, title }, { title, description: `${title} for the ProjectPulse AI delivery.`, project: project._id, owner: assignedTo._id, assignedTo: assignedTo._id, createdBy: pm._id, status, progress, dueDate: date(dueDay), estimatedHours, actualHours, priority, requiredSkills, blockers: status === 'blocked' ? ['Waiting for data validation criteria'] : [], completedAt: status === 'completed' ? date(-Math.abs(dueDay)) : undefined }, { upsert: true });
  const milestones = [['Discovery complete', -14, 'completed', 100], ['Core platform build', 6, 'in-progress', 62], ['AI validation', 13, 'pending', 25], ['Final evaluation', 19, 'pending', 0]];
  for (const [title, dueDay, status, progress] of milestones) { let milestone = await Milestone.findOneAndUpdate({ project: project._id, title }, { title, project: project._id, dueDate: date(dueDay), status, progress }, { upsert: true, new: true }); if (!project.milestones.map(String).includes(String(milestone._id))) project.milestones.push(milestone._id); } await project.save();
  await ProjectUpdate.updateOne({ project: project._id, summary: 'Core platform integration update' }, { project: project._id, author: pm._id, summary: 'Core platform integration update', details: 'The dashboard and API integration are progressing. AI module validation is the immediate focus.', progress: 55, blockers: ['ML engineer availability'], nextActions: ['Approve a replacement for risk prediction work'] }, { upsert: true });
  await ActivityLog.updateOne({ entityId: project._id, action: 'project_created' }, { actor: pm._id, action: 'project_created', entityType: 'Project', entityId: project._id, metadata: { source: 'seed' } }, { upsert: true });
  await calculateProjectMetrics(project._id); const risk = await calculateProjectMetrics(project._id, false); if (!await ProjectRiskSnapshot.countDocuments({ project: project._id })) await ProjectRiskSnapshot.insertMany([12, 18, 25, 31].map((offset, index) => ({ project: project._id, riskScore: Math.max(10, risk.riskScore - offset), riskLevel: 'medium', factors: ['Seeded historical snapshot'], timestamp: date(-12 + index * 3) })));
  const affected = await Task.findOne({ project: project._id, title: 'Risk Prediction Module' }); if (!await ResourceRecommendation.exists({ task: affected._id, status: 'pending' })) await saveRecommendation(affected._id);
  console.info('Seed complete. Demo project and accounts are ready.');
} finally { process.exit(0); }
