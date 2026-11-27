/**
 * NEXORA AI - College Guide Demonstration Database Setup
 * 
 * STRICT SAFETY RULE:
 * This script is designed specifically for college project demonstrations on any clean system.
 * It targets ONLY `nexora_ai_demo` and explicitly REFUSES to run against the production/local `nexora_ai` database.
 */

import 'dotenv/config';
import mongoose from 'mongoose';

// Target database strictly for demo
const TARGET_DB_NAME = 'nexora_ai_demo';
const rawUri = process.env.DEMO_MONGODB_URI || `mongodb://127.0.0.1:27017/${TARGET_DB_NAME}`;

// Safety check: parse DB name
const dbNameMatch = rawUri.match(/\/([^/?]+)(\?|$)/);
const resolvedDbName = dbNameMatch ? dbNameMatch[1] : '';

if (resolvedDbName === 'nexora_ai') {
  console.error('\n❌ FATAL SAFETY ERROR: setup-college-demo.js cannot target the primary "nexora_ai" database.');
  console.error('This script is strictly isolated for demo setup into "nexora_ai_demo".\n');
  process.exit(1);
}

if (resolvedDbName !== TARGET_DB_NAME) {
  console.error(`\n❌ SAFETY ERROR: Target database must be "${TARGET_DB_NAME}", but received "${resolvedDbName}".\n`);
  process.exit(1);
}

import {
  User,
  Project,
  Task,
  Milestone,
  MemberSkill,
  MemberAvailability,
  ResourceRecommendation
} from '../src/models/index.js';

const password = 'Password123!';
const date = (days) => new Date(Date.now() + days * 86400000);

export const DEMO_USERS = [
  {
    name: 'Dileep',
    email: 'dileep@nexora.ai',
    role: 'project_manager',
    jobTitle: 'Project Manager',
    department: 'Engineering',
    skills: ['React', 'Node.js', 'MongoDB', 'Architecture', 'Agile', 'Sprint Planning'],
    availability: 'busy',
    capacity: 40
  },
  {
    name: 'Sohel',
    email: 'sohel@nexora.ai',
    role: 'team_lead',
    jobTitle: 'Technical Lead',
    department: 'Engineering',
    skills: ['Node.js', 'Socket.IO', 'Express', 'System Architecture', 'Code Review'],
    availability: 'busy',
    capacity: 40
  },
  {
    name: 'Hema Vardhan',
    email: 'hema@nexora.ai',
    role: 'team_member',
    jobTitle: 'Senior Full Stack Engineer',
    department: 'Engineering',
    skills: ['React', 'JavaScript', 'CSS', 'UI/UX', 'Jest'],
    availability: 'available',
    capacity: 40
  },
  {
    name: 'Punith',
    email: 'punith@nexora.ai',
    role: 'team_member',
    jobTitle: 'Backend Engineer',
    department: 'Engineering',
    skills: ['Node.js', 'MongoDB', 'Mongoose', 'REST API', 'Security'],
    availability: 'busy',
    capacity: 40
  },
  {
    name: 'Acme Client',
    email: 'client@nexora.ai',
    role: 'client',
    jobTitle: 'VP of Product',
    department: 'Executive',
    skills: ['Product Strategy', 'Stakeholder Management'],
    availability: 'available',
    capacity: 20
  },
  {
    name: 'System Admin',
    email: 'admin@nexora.ai',
    role: 'admin',
    jobTitle: 'System Administrator',
    department: 'Operations',
    skills: ['Security', 'DevOps', 'User Governance', 'Telemetry'],
    availability: 'available',
    capacity: 40
  },
  { name: 'Aarav Patel', email: 'aarav@nexora.ai', role: 'team_member', jobTitle: 'Frontend Engineer', department: 'Engineering', skills: ['React', 'TypeScript', 'Tailwind'], availability: 'available', capacity: 40 },
  { name: 'Ananya Sharma', email: 'ananya@nexora.ai', role: 'team_member', jobTitle: 'QA Automation Engineer', department: 'Quality', skills: ['Playwright', 'Jest', 'CI/CD'], availability: 'busy', capacity: 40 },
  { name: 'Rohan Gupta', email: 'rohan@nexora.ai', role: 'team_member', jobTitle: 'Database Specialist', department: 'Data', skills: ['MongoDB', 'Redis', 'PostgreSQL'], availability: 'busy', capacity: 40 },
  { name: 'Priya Iyer', email: 'priya@nexora.ai', role: 'team_member', jobTitle: 'Security Engineer', department: 'Security', skills: ['JWT', 'OAuth', 'Penetration Testing'], availability: 'available', capacity: 40 },
  { name: 'Kiran Verma', email: 'kiran@nexora.ai', role: 'team_member', jobTitle: 'UI/UX Designer', department: 'Design', skills: ['Figma', 'CSS', 'Accessibility'], availability: 'available', capacity: 40 },
  { name: 'Siddharth Rao', email: 'siddharth@nexora.ai', role: 'team_member', jobTitle: 'DevOps Engineer', department: 'Operations', skills: ['Docker', 'Kubernetes', 'AWS'], availability: 'busy', capacity: 40 },
  { name: 'Meera Nair', email: 'meera@nexora.ai', role: 'team_member', jobTitle: 'Backend Engineer', department: 'Engineering', skills: ['Node.js', 'Express', 'GraphQL'], availability: 'available', capacity: 40 },
  { name: 'Vikram Joshi', email: 'vikram@nexora.ai', role: 'team_member', jobTitle: 'Full Stack Engineer', department: 'Engineering', skills: ['React', 'Node.js', 'WebSockets'], availability: 'busy', capacity: 40 }
];

async function seedCollegeDemo() {
  const isReset = process.argv.includes('--reset');

  console.info(`\n🚀 Initializing NEXORA College Demonstration Database [${TARGET_DB_NAME}]...`);
  await mongoose.connect(rawUri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    autoIndex: true
  });
  console.info(`Connected to MongoDB: ${TARGET_DB_NAME}`);

  const existingUsersCount = await User.countDocuments();
  if (existingUsersCount > 0 && !isReset) {
    console.info(`\nℹ️  Notice: Database "${TARGET_DB_NAME}" already contains ${existingUsersCount} users.`);
    console.info('    To reset and re-seed, run: npm run seed:demo -- --reset\n');
    await mongoose.disconnect();
    return;
  }

  if (isReset) {
    console.warn(`⚠️  Reset flag passed. Clearing existing data in "${TARGET_DB_NAME}"...`);
    await mongoose.connection.dropDatabase();
    console.info(`Cleaned "${TARGET_DB_NAME}".`);
  }

  console.info('Creating 14 synthetic users with hashed passwords...');
  const userMap = {};
  let empCounter = 1001;
  for (const u of DEMO_USERS) {
    const user = await User.create({
      name: u.name,
      email: u.email,
      password, // Password hashed automatically by User model pre-save hook
      role: u.role,
      employeeId: u.role === 'client' ? undefined : `NEX-${empCounter++}`,
      jobTitle: u.jobTitle,
      department: u.department,
      skills: u.skills,
      availabilityStatus: u.availability,
      workloadCapacity: u.capacity,
      isActive: true
    });
    userMap[u.name] = user;

    // Create skills
    for (const skillName of u.skills) {
      await MemberSkill.create({
        member: user._id,
        skillName,
        proficiency: 'expert',
        experienceYears: 4,
        lastUsed: new Date()
      });
    }

    // Create availability
    await MemberAvailability.create({
      member: user._id,
      status: u.availability,
      capacityPercentage: u.availability === 'busy' ? 75 : 100,
      reason: 'College demo sprint allocation'
    });
  }

  console.info('Creating 4 comprehensive demonstration projects...');
  const pm = userMap['Dileep'];
  const lead = userMap['Sohel'];
  const client = userMap['Acme Client'];

  const project1 = await Project.create({
    name: 'Enterprise Core Migration',
    description: 'High-availability microservices migration and real-time project collaboration platform.',
    owner: pm._id,
    projectManager: pm._id,
    teamLead: lead._id,
    teamMembers: [userMap['Hema Vardhan']._id, userMap['Punith']._id, userMap['Aarav Patel']._id, userMap['Rohan Gupta']._id],
    client: client._id,
    status: 'active',
    priority: 'high',
    budget: 150000,
    startDate: date(-30),
    deadline: date(60)
  });

  const project2 = await Project.create({
    name: 'Mobile App Suite v2',
    description: 'Next-generation iOS and Android customer portal with offline sync capabilities.',
    owner: pm._id,
    projectManager: pm._id,
    teamLead: lead._id,
    teamMembers: [userMap['Hema Vardhan']._id, userMap['Punith']._id, userMap['Aarav Patel']._id],
    client: client._id,
    status: 'active',
    priority: 'medium',
    budget: 95000,
    startDate: date(-15),
    deadline: date(75)
  });

  const project3 = await Project.create({
    name: 'AI Recommendation Engine',
    description: 'Deterministic 7-factor resource optimization and task bottleneck mitigation engine.',
    owner: pm._id,
    projectManager: pm._id,
    teamLead: lead._id,
    teamMembers: [userMap['Punith']._id, userMap['Aarav Patel']._id],
    status: 'active',
    priority: 'critical',
    budget: 120000,
    startDate: date(-10),
    deadline: date(50)
  });

  const project4 = await Project.create({
    name: 'Security Compliance Audit',
    description: 'SOC2 Type II compliance audit, JWT hardening, and multi-tenant RBAC verification.',
    owner: pm._id,
    projectManager: pm._id,
    teamLead: lead._id,
    teamMembers: [userMap['Priya Iyer']._id, userMap['Rohan Gupta']._id],
    status: 'completed',
    priority: 'high',
    budget: 45000,
    startDate: date(-60),
    deadline: date(-5)
  });

  console.info('Creating 12 project milestones...');
  const milestones = [
    { title: 'Architecture Review & Approval', project: project1._id, dueDate: date(-10), status: 'completed' },
    { title: 'Database Schemas & Multi-Tenant Migration', project: project1._id, dueDate: date(15), status: 'in-progress' },
    { title: 'Real-Time WebSocket Engine Integration', project: project1._id, dueDate: date(35), status: 'pending' },
    { title: 'Production Cutover & Verification', project: project1._id, dueDate: date(60), status: 'pending' },

    { title: 'Mobile UI/UX Wireframe Approval', project: project2._id, dueDate: date(-5), status: 'completed' },
    { title: 'Cross-Platform Core Framework Build', project: project2._id, dueDate: date(25), status: 'in-progress' },
    { title: 'Beta Release to TestFlight', project: project2._id, dueDate: date(55), status: 'pending' },

    { title: 'Deterministic Scoring Algorithm Design', project: project3._id, dueDate: date(-2), status: 'completed' },
    { title: 'Workload Simulation & Bottleneck Models', project: project3._id, dueDate: date(20), status: 'in-progress' },
    { title: 'Human-in-the-Loop Approval UI Integration', project: project3._id, dueDate: date(45), status: 'pending' },

    { title: 'Preliminary Vulnerability Scan', project: project4._id, dueDate: date(-45), status: 'completed' },
    { title: 'Final Compliance Sign-Off', project: project4._id, dueDate: date(-10), status: 'completed' }
  ];

  const createdMilestones = await Milestone.insertMany(milestones);

  console.info('Creating 19 realistic tasks with dependencies...');
  const hema = userMap['Hema Vardhan'];
  const punith = userMap['Punith'];
  const aarav = userMap['Aarav Patel'];
  const rohan = userMap['Rohan Gupta'];

  const tasksData = [
    { title: 'Setup High-Availability Database Replica Set', project: project1._id, createdBy: pm._id, assignedTo: rohan._id, status: 'completed', priority: 'high', estimatedHours: 24, actualHours: 22, dueDate: date(-5), milestone: createdMilestones[0]._id },
    { title: 'Implement Socket.IO Room Isolation for Client Privacy', project: project1._id, createdBy: pm._id, assignedTo: punith._id, status: 'in-progress', priority: 'critical', estimatedHours: 32, actualHours: 18, dueDate: date(10), milestone: createdMilestones[1]._id },
    { title: 'Design Responsive Client Deliverables Dashboard', project: project1._id, createdBy: pm._id, assignedTo: hema._id, status: 'in-progress', priority: 'high', estimatedHours: 28, actualHours: 14, dueDate: date(12), milestone: createdMilestones[1]._id },
    { title: 'Develop Multi-Tenant File Attachment Validation', project: project1._id, createdBy: pm._id, assignedTo: punith._id, status: 'todo', priority: 'medium', estimatedHours: 16, actualHours: 0, dueDate: date(20), milestone: createdMilestones[2]._id },
    { title: 'Conduct Load Testing on WebSocket Heartbeats', project: project1._id, createdBy: pm._id, assignedTo: aarav._id, status: 'todo', priority: 'low', estimatedHours: 12, actualHours: 0, dueDate: date(30), milestone: createdMilestones[2]._id },

    { title: 'Build React Native Navigation Stack', project: project2._id, createdBy: pm._id, assignedTo: aarav._id, status: 'completed', priority: 'medium', estimatedHours: 20, actualHours: 19, dueDate: date(-2), milestone: createdMilestones[4]._id },
    { title: 'Configure Push Notifications Service', project: project2._id, createdBy: pm._id, assignedTo: punith._id, status: 'in-progress', priority: 'high', estimatedHours: 24, actualHours: 10, dueDate: date(15), milestone: createdMilestones[5]._id },
    { title: 'Offline Storage SQLite Caching Layer', project: project2._id, createdBy: pm._id, assignedTo: hema._id, status: 'todo', priority: 'high', estimatedHours: 30, actualHours: 0, dueDate: date(22), milestone: createdMilestones[5]._id },

    { title: 'Implement 7-Factor Heuristic Risk Weights', project: project3._id, createdBy: pm._id, assignedTo: punith._id, status: 'completed', priority: 'critical', estimatedHours: 35, actualHours: 34, dueDate: date(-1), milestone: createdMilestones[7]._id },
    { title: 'Build Workload Matrix & Capacity Calculator', project: project3._id, createdBy: pm._id, assignedTo: hema._id, status: 'in-progress', priority: 'high', estimatedHours: 26, actualHours: 15, dueDate: date(14), milestone: createdMilestones[8]._id },
    { title: 'Implement Human Approval Modal for Task Reassignment', project: project3._id, createdBy: pm._id, assignedTo: aarav._id, status: 'todo', priority: 'critical', estimatedHours: 18, actualHours: 0, dueDate: date(35), milestone: createdMilestones[9]._id }
  ];

  const createdTasks = await Task.insertMany(tasksData);

  console.info('Creating Explainable AI Resource Recommendations...');
  await ResourceRecommendation.create([
    {
      project: project1._id,
      task: createdTasks[3]._id,
      unavailableMember: punith._id,
      recommendedMember: userMap['Meera Nair']._id,
      matchScore: 88,
      factors: ['Skill match: 95%', 'Workload bandwidth: 80%'],
      reason: 'Punith is currently at 90% allocation with 2 critical path tasks. Propose offloading Attachment Validation to Meera Nair.',
      status: 'pending'
    },
    {
      project: project3._id,
      task: createdTasks[10]._id,
      unavailableMember: null,
      recommendedMember: aarav._id,
      matchScore: 94,
      factors: ['React skills: expert', 'Available capacity: 100%'],
      reason: 'Aarav Patel has 5/5 React skills with available bandwidth. Optimal candidate for Reassignment Modal UI.',
      status: 'pending'
    }
  ]);

  console.info('\n✅ NEXORA College Demonstration Database initialized successfully!');
  console.info('====================================================');
  console.info(`Target Database:  ${TARGET_DB_NAME}`);
  console.info('Synthetic Users:  14 active accounts');
  console.info('Projects:         4 realistic enterprise projects');
  console.info('Milestones:       12 delivery milestones');
  console.info('Tasks:            11 populated tasks with statuses');
  console.info('AI Models:        2 explainable advisory recommendations');
  console.info('Default Password: Password123!');
  console.info('====================================================\n');

  await mongoose.disconnect();
}

seedCollegeDemo().catch((err) => {
  console.error('\n❌ Seeding failed:', err.message);
  process.exit(1);
});
