import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NoteEditor } from '../../src/modules/notes/components/NoteEditor';
const params = new URLSearchParams(location.search);
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient()}>
    <NoteEditor projectId={params.get('projectId')!} noteId={params.get('noteId')!} />
  </QueryClientProvider>,
);
