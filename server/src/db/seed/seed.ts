import { db } from '../index.js';
import {
  authUsers,
  userProfiles,
  workspaces,
  workspaceSettings,
  workspaceMembers,
  teams,
  projects,
  projectMembers,
  labels,
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

async function main() {
  console.log('🌱 Starting database seed...');

  // 1. Cleanup old seed data
  console.log('🧹 Cleaning up old seed data...');
  
  // Since we have multiple entities with 'seed-', we can delete based on LIKE prefix.
  // We should do it in reverse order of dependencies.
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
    await db.delete(userProfiles).where(inArray(userProfiles.userId, seedUserIds));
    await db.delete(authUsers).where(inArray(authUsers.id, seedUserIds));
  }

  // Define data configurations
  const wsConfigs = [
    {
      id: `${SEED_PREFIX}ws-team`,
      name: 'Team Workspace (Seeded)',
      key: 'TEAM',
      hierarchyMode: 'teams' as const,
      numUsers: 5,
      numProjects: 3,
      numTicketsPerProject: 25,
    },
    {
      id: `${SEED_PREFIX}ws-proj`,
      name: 'Project Workspace (Seeded)',
      key: 'PROJ',
      hierarchyMode: 'flat' as const,
      numUsers: 5,
      numProjects: 3,
      numTicketsPerProject: 25,
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

    // Create users for this workspace
    const userIds: string[] = [];
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
        role: u === 1 ? 'admin' : 'guest_contributor',
        createdAt: new Date(),
      });
    }

    const adminUserId = userIds[0];

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
        role: userId === adminUserId ? 'owner' : 'member',
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

      // Create Labels for the team
      const labelIds: string[] = [];
      for (const label of labelData) {
        const labelId = `${teamId}-label-${label.name.toLowerCase()}`;
        labelIds.push(labelId);
        await db.insert(labels).values({
          id: labelId,
          teamId,
          name: label.name,
          color: label.color,
          description: `Issues related to ${label.name}`,
          createdAt: new Date(),
        });
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
            role: userId === adminUserId ? 'admin' : 'developer',
            createdAt: new Date(),
          });
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
          const availableLabels = [...labelIds];
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
