import { MetadataRepository, type NoteMetadata } from '../repositories.js';
import { canAccessNote, type NoteActor, type NoteAction } from '../policy.js';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import type { NoteTransaction } from '../reference-lock.js';
import { projects, workspaceMembers, workspaces } from '../../workspaces/schema.js';

export { canAccessNote } from '../policy.js';
export type { NoteActor, NoteAction } from '../policy.js';

export class NoteAccessDeniedError extends Error {
  constructor() { super('NOTE_ACCESS_DENIED'); }
}

/** Read the current role rather than trusting a role or cached membership from a caller. */
export async function currentNoteActor(projectId: string, userId: string, executor: typeof db | NoteTransaction = db, lock = false): Promise<NoteActor | null> {
  if (!lock) {
    const [row] = await executor.select({ role: workspaceMembers.role, createdBy: workspaces.createdBy })
      .from(projects).innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
      .leftJoin(workspaceMembers, and(eq(workspaceMembers.workspaceId, projects.workspaceId), eq(workspaceMembers.userId, userId)))
      .where(eq(projects.id, projectId)).limit(1);
    const role = row?.role ?? (row?.createdBy === userId ? 'owner' : null);
    return role ? { userId, workspaceRole: role } : null;
  }
  const projectQuery = executor.select({ workspaceId: projects.workspaceId }).from(projects).where(eq(projects.id, projectId));
  const [project] = await (lock ? projectQuery.for('share') : projectQuery);
  if (!project) return null;
  const memberQuery = executor.select({ role: workspaceMembers.role }).from(workspaceMembers).where(and(
    eq(workspaceMembers.workspaceId, project.workspaceId), eq(workspaceMembers.userId, userId),
  ));
  const [member] = await (lock ? memberQuery.for('share') : memberQuery);
  if (member?.role) return { userId, workspaceRole: member.role };
  const ownerQuery = executor.select({ createdBy: workspaces.createdBy }).from(workspaces).where(eq(workspaces.id, project.workspaceId));
  const [workspace] = await (lock ? ownerQuery.for('share') : ownerQuery);
  return workspace?.createdBy === userId ? { userId, workspaceRole: 'owner' } : null;
}

export async function noteProjectExists(projectId: string): Promise<boolean> {
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1);
  return !!project;
}

export async function currentWorkspaceOwner(workspaceId: string, userId: string): Promise<boolean> {
  const [row] = await db.select({ role: workspaceMembers.role, createdBy: workspaces.createdBy })
    .from(workspaces).leftJoin(workspaceMembers, and(
      eq(workspaceMembers.workspaceId, workspaces.id), eq(workspaceMembers.userId, userId),
    )).where(eq(workspaces.id, workspaceId)).limit(1);
  return row?.role ? row.role === 'owner' : row?.createdBy === userId;
}

export async function requireCurrentNoteActor(projectId: string, actor: NoteActor): Promise<NoteActor> {
  const current = await currentNoteActor(projectId, actor.userId);
  if (!current) throw new NoteAccessDeniedError();
  return current;
}

export async function authorizedNote(
  noteId: string, projectId: string, actor: NoteActor, action: NoteAction,
): Promise<NoteMetadata | null> {
  return (await authorizedNoteAccess(noteId, projectId, actor, action))?.note ?? null;
}

export async function authorizedNoteAccess(
  noteId: string, projectId: string, actor: NoteActor, action: NoteAction,
): Promise<{ note: NoteMetadata; actor: NoteActor } | null> {
  const current = await currentNoteActor(projectId, actor.userId);
  if (!current) return null;
  const note = await MetadataRepository.getNoteMetadata(noteId);
  return note?.projectId === projectId && canAccessNote(note, current, action) ? { note, actor: current } : null;
}
