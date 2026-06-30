import { db } from '../index.js';
import {
  authUsers,
  authAccounts,
  userProfiles,
  workspaces,
  workspaceSettings,
  workspaceMembers,
  teams,
  projects,
  projectMembers,
  labels,
  cycles,
  tickets,
  ticketLabels,
  ticketRelationships,
  comments,
} from '../schema.js';
import { eq, inArray, like } from 'drizzle-orm';

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomElement<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

function randomBoolean(chance = 0.5) {
  return Math.random() < chance;
}

const SEED_PREFIX = 'seed-';
const TEST_USER_ID = `${SEED_PREFIX}test-user`;

// Hash for 'password123' using better-auth/crypto
const TEST_USER_PASSWORD_HASH = '36f9442c31bb59aaddda66b21dea011b:42db6d551c9d2980725170922e9c24ff9bc4889ffbb7a6bd19489e59637348fff8eec8f2ed8f62dc4112a0a19ace67238988f8aea80d756ffb8fbf6e87703b32';

async function main() {
  console.log('🌱 Starting database seed...');

  // 1. Cleanup old seed data
  console.log('🧹 Cleaning up old seed data...');
  
  const allSeedUsersQuery = await db.select({ id: authUsers.id }).from(authUsers).where(like(authUsers.id, `${SEED_PREFIX}%`));
  const seedUserIds = allSeedUsersQuery.map(u => u.id);
  
  if (seedUserIds.length > 0) {
    await db.delete(comments).where(inArray(comments.userId, seedUserIds));
  }
  
  const allSeedTicketsQuery = await db.select({ id: tickets.id }).from(tickets).where(like(tickets.id, `${SEED_PREFIX}%`));
  const seedTicketIds = allSeedTicketsQuery.map(t => t.id);
  if (seedTicketIds.length > 0) {
    await db.delete(ticketLabels).where(inArray(ticketLabels.ticketId, seedTicketIds));
    await db.delete(ticketRelationships).where(inArray(ticketRelationships.ticketId, seedTicketIds));
    await db.delete(tickets).where(inArray(tickets.id, seedTicketIds));
  }
  
  const allSeedProjectsQuery = await db.select({ id: projects.id }).from(projects).where(like(projects.id, `${SEED_PREFIX}%`));
  const seedProjectIds = allSeedProjectsQuery.map(p => p.id);
  if (seedProjectIds.length > 0) {
    await db.delete(labels).where(inArray(labels.projectId, seedProjectIds));
    await db.delete(projectMembers).where(inArray(projectMembers.projectId, seedProjectIds));
    await db.delete(projects).where(inArray(projects.id, seedProjectIds));
  }
  
  const allSeedTeamsQuery = await db.select({ id: teams.id }).from(teams).where(like(teams.id, `${SEED_PREFIX}%`));
  const seedTeamIds = allSeedTeamsQuery.map(t => t.id);
  if (seedTeamIds.length > 0) {
    await db.delete(labels).where(inArray(labels.teamId, seedTeamIds));
    await db.delete(teams).where(inArray(teams.id, seedTeamIds));
  }

  const allSeedWorkspacesQuery = await db.select({ id: workspaces.id }).from(workspaces).where(like(workspaces.id, `${SEED_PREFIX}%`));
  const seedWorkspaceIds = allSeedWorkspacesQuery.map(w => w.id);
  if (seedWorkspaceIds.length > 0) {
    await db.delete(workspaceSettings).where(inArray(workspaceSettings.workspaceId, seedWorkspaceIds));
    await db.delete(workspaceMembers).where(inArray(workspaceMembers.workspaceId, seedWorkspaceIds));
    await db.delete(workspaces).where(inArray(workspaces.id, seedWorkspaceIds));
  }

  if (seedUserIds.length > 0) {
    await db.delete(authAccounts).where(inArray(authAccounts.userId, seedUserIds));
    await db.delete(userProfiles).where(inArray(userProfiles.userId, seedUserIds));
    await db.delete(authUsers).where(inArray(authUsers.id, seedUserIds));
  }

  // 2. Create Default Test User
  console.log('👤 Creating default test user (test@example.com / password123)...');
  await db.insert(authUsers).values({
    id: TEST_USER_ID,
    name: 'Test User',
    email: 'test@example.com',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await db.insert(authAccounts).values({
    id: `${SEED_PREFIX}test-account`,
    accountId: 'test@example.com',
    providerId: 'credential',
    userId: TEST_USER_ID,
    password: TEST_USER_PASSWORD_HASH,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await db.insert(userProfiles).values({
    userId: TEST_USER_ID,
    role: 'admin',
    createdAt: new Date(),
  });

  // Define data configurations
  const wsConfigs = [
    {
      id: `${SEED_PREFIX}ws-team-1`,
      name: 'Team Workspace 1 (Owner)',
      key: 'TEAM1',
      hierarchyMode: 'teams' as const,
      numUsers: 4, // Will add test user automatically
      numProjects: 3,
      numTicketsPerProject: 25,
      testUserRole: 'owner' as const,
    },
    {
      id: `${SEED_PREFIX}ws-proj-1`,
      name: 'Project Workspace 1 (Owner)',
      key: 'PROJ1',
      hierarchyMode: 'flat' as const,
      numUsers: 4,
      numProjects: 3,
      numTicketsPerProject: 25,
      testUserRole: 'owner' as const,
    },
    {
      id: `${SEED_PREFIX}ws-team-2`,
      name: 'Team Workspace 2 (Participant)',
      key: 'TEAM2',
      hierarchyMode: 'teams' as const,
      numUsers: 4,
      numProjects: 3,
      numTicketsPerProject: 25,
      testUserRole: 'member' as const,
    },
    {
      id: `${SEED_PREFIX}ws-proj-2`,
      name: 'Project Workspace 2 (Participant)',
      key: 'PROJ2',
      hierarchyMode: 'flat' as const,
      numUsers: 4,
      numProjects: 3,
      numTicketsPerProject: 25,
      testUserRole: 'member' as const,
    }
  ];

  const now = new Date();

  // Reusable seed labels
  const labelData = [
    { name: 'Bug', color: '#EF4444' },
    { name: 'Feature', color: '#3B82F6' },
    { name: 'Enhancement', color: '#10B981' },
    { name: 'Design', color: '#8B5CF6' },
    { name: 'Documentation', color: '#6B7280' }
  ];

  const statuses = ['todo', 'in_progress', 'in_review', 'done', 'backlog'];
  const priorities = ['urgent', 'high', 'medium', 'low', 'no_priority'];
  const sampleTitles = [
    "Implement new authentication flow", "Fix responsive layout on mobile",
    "Update dependencies to latest versions", "Refactor context menu component",
    "Add unit tests for ticket service", "Optimize database queries",
    "Create user onboarding tutorial", "Integrate with third-party payment API",
    "Design new dashboard metrics", "Fix memory leak in background worker"
  ];
  const sampleDescriptions = [
    "We need to implement this according to the latest design specs.",
    "This has been reported by multiple users. We should prioritize it.",
    "Let's make sure we maintain backwards compatibility.",
    "This is a technical debt item that needs addressing before the next major release.",
    "Check the attached mockups for reference."
  ];

  let ticketCounter = 1;

  for (const config of wsConfigs) {
    console.log(`\n🏢 Seeding ${config.name}...`);

    // Create other users for this workspace
    const userIds: string[] = [TEST_USER_ID];
    for (let u = 1; u <= config.numUsers; u++) {
      const userId = `${config.id}-user-${u}`;
      userIds.push(userId);
      await db.insert(authUsers).values({
        id: userId,
        name: `Seed ${config.key} User ${u}`,
        email: `seed-${config.key.toLowerCase()}-${u}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await db.insert(userProfiles).values({
        userId,
        role: u === 1 && config.testUserRole !== 'owner' ? 'admin' : 'guest_contributor',
        createdAt: new Date(),
      });
    }

    const adminUserId = config.testUserRole === 'owner' ? TEST_USER_ID : userIds[1];

    // Create workspace
    await db.insert(workspaces).values({
      id: config.id,
      name: config.name,
      key: config.key,
      workspaceKey: config.key,
      createdBy: adminUserId,
      createdAt: new Date(),
    });

    await db.insert(workspaceSettings).values({
      workspaceId: config.id,
      hierarchyMode: config.hierarchyMode,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    for (const userId of userIds) {
      await db.insert(workspaceMembers).values({
        workspaceId: config.id,
        userId,
        role: userId === TEST_USER_ID ? config.testUserRole : (userId === adminUserId ? 'owner' : 'member'),
        createdAt: new Date(),
      });
    }

    // Determine how many teams to create.
    const numTeams = config.hierarchyMode === 'teams' ? 2 : 1;
    const teamIds: string[] = [];

    for (let t = 1; t <= numTeams; t++) {
      const teamId = `${config.id}-team-${t}`;
      teamIds.push(teamId);
      await db.insert(teams).values({
        id: teamId,
        workspaceId: config.id,
        name: config.hierarchyMode === 'teams' ? `Team ${t}` : `Default Team`,
        description: 'Seeded team',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      
      // Cycles are not implemented yet, skipping cycle generation.

      // Create Labels for the team if in 'teams' mode
      const teamLabelIds: string[] = [];
      if (config.hierarchyMode === 'teams') {
        for (const label of labelData) {
          const labelId = `${teamId}-label-${label.name.toLowerCase()}`;
          teamLabelIds.push(labelId);
          await db.insert(labels).values({
            id: labelId,
            teamId,
            name: label.name,
            color: label.color,
            description: `Issues related to ${label.name}`,
            createdAt: new Date(),
          });
        }
      }

      // Create Projects
      const projectsThisTeam = Math.ceil(config.numProjects / numTeams);
      for (let p = 1; p <= projectsThisTeam; p++) {
        const projectId = `${teamId}-proj-${p}`;
        const projKey = `${config.key}${t}${p}`;
        await db.insert(projects).values({
          id: projectId,
          workspaceId: config.id,
          teamId,
          name: `Project ${p} (Team ${t})`,
          key: projKey,
          status: 'active',
          inviteCode: `INVITE-${projKey}`,
          createdBy: adminUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // Add all users to the project
        for (const userId of userIds) {
          await db.insert(projectMembers).values({
            projectId,
            userId,
            role: userId === TEST_USER_ID ? (config.testUserRole === 'owner' ? 'admin' : 'developer') : (userId === adminUserId ? 'admin' : 'developer'),
            createdAt: new Date(),
          });
        }

        // Create Labels for the project if in 'flat' mode
        const projectLabelIds: string[] = [];
        if (config.hierarchyMode === 'flat') {
          for (const label of labelData) {
            const labelId = `${projectId}-label-${label.name.toLowerCase()}`;
            projectLabelIds.push(labelId);
            await db.insert(labels).values({
              id: labelId,
              teamId,
              projectId,
              name: label.name,
              color: label.color,
              description: `Issues related to ${label.name}`,
              createdAt: new Date(),
            });
          }
        }

        // Create Tickets for this project
        const ticketIdsThisProject: string[] = [];
        for (let idx = 1; idx <= config.numTicketsPerProject; idx++) {
          const isSubticket = idx > Math.floor(config.numTicketsPerProject * 0.7); // 30% are sub-tickets
          const parentId = isSubticket && ticketIdsThisProject.length > 0 
            ? randomElement(ticketIdsThisProject) 
            : null;
          
          const ticketId = `${SEED_PREFIX}ticket-${ticketCounter}`;
          ticketIdsThisProject.push(ticketId);

          const pastDate = new Date(now);
          pastDate.setDate(pastDate.getDate() - randomInt(1, 60));

          await db.insert(tickets).values({
            id: ticketId,
            key: `${projKey}-${idx}`,
            title: `${randomElement(sampleTitles)} [${ticketCounter}]`,
            description: randomElement(sampleDescriptions),
            status: randomElement(statuses),
            priority: randomElement(priorities),
            assigneeId: randomBoolean(0.7) ? randomElement(userIds) : null,
            projectId,
            parentId,
            createdAt: pastDate,
            updatedAt: new Date(),
          });

          // Assign labels
          const numLabels = randomInt(1, 3);
          const selectedLabels = [];
          const availableLabels = config.hierarchyMode === 'teams' ? [...teamLabelIds] : [...projectLabelIds];
          for (let l = 0; l < numLabels; l++) {
            if (availableLabels.length > 0) {
              const labelIdx = randomInt(0, availableLabels.length - 1);
              selectedLabels.push(availableLabels[labelIdx]);
              availableLabels.splice(labelIdx, 1);
            }
          }
          
          for (const labelId of selectedLabels) {
            await db.insert(ticketLabels).values({
              ticketId,
              labelId,
            });
          }

          // Add comments
          if (randomBoolean(0.6)) {
            const numComments = randomInt(1, 4);
            for (let c = 0; c < numComments; c++) {
              const commentDate = new Date(pastDate);
              commentDate.setDate(commentDate.getDate() + randomInt(1, 10));
              
              await db.insert(comments).values({
                id: `${ticketId}-comment-${c}`,
                ticketId,
                userId: randomElement(userIds),
                body: `This is a sample comment about ${randomElement(sampleTitles).toLowerCase()}.`,
                createdAt: commentDate > now ? now : commentDate,
              });
            }
          }

          ticketCounter++;
        }
      }
    }
  }

  console.log('\n✅ Seed completed successfully!');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error during seeding:', err);
  process.exit(1);
});
