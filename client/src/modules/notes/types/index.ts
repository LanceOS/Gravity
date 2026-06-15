export interface NoteMetadata {
  id: string;
  projectId: string;
  userId: string;
  title: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Note extends NoteMetadata {
  body: string;
}
