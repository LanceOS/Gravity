# Optimistic UI Pattern

Gravity utilizes an Optimistic UI pattern for saving configurations and updating models (such as Teams and Projects) to ensure a fast, responsive user experience. 

When a user submits a form or updates a configuration, they should not be blocked by a loading spinner or full-page reload while the application waits for the server. Instead, the application predicts a successful outcome, immediately updates its local state (and the user interface), and processes the server request silently in the background.

## Implementation Strategy

The optimistic UI update flow consists of three distinct phases:

1. **Optimistic Cache Update (Immediate)**
   - The application intercepts the user's action and immediately alters the local data store (React Query cache) to reflect the expected changes.
   - The UI updates instantly because the components are subscribed to this cache.
   - Visual feedback (like a "Saved successfully" toast or inline text) is shown to the user immediately, signaling that the action was recognized and handled.

2. **Background Server Request (Async)**
   - A `PATCH`, `POST`, or `PUT` request is dispatched to the backend asynchronously.
   - Crucially, the component triggering the save **does not `await`** this request. This ensures the execution thread is not blocked, and the component doesn't enter a "loading" state.
   - If the request fails, the application rolls back the cache to its previous state and updates the UI feedback to display an error.

3. **Background Sync / Invalidation (Cleanup)**
   - Upon a successful server response, the application silently invalidates the relevant React Query keys.
   - React Query fetches the latest definitive state from the server in the background.
   - When the fresh data arrives, it overwrites the optimistic cache. Because the server data matches the optimistic data, the user notices no visual change.

## Code Example: Team Projects Manager

Below is a breakdown of how this pattern is implemented in the Team Projects Manager (`WorkspaceTeamProjectsPage.tsx` and `TicketContext.tsx`).

### 1. The Context / Mutation Setup

In the central context or custom hook (e.g., `TicketContext.tsx`), the React Query mutation is configured with `onMutate` to handle the cache update, and `onError` to handle rollbacks.

```tsx
  const updateProjectMutation = useMutation({
    mutationFn: async ({ id, updates }) => {
      return apiClient.patch(`/projects/${id}`, updates);
    },
    // 1. Optimistic Cache Update
    onMutate: async ({ id, updates }) => {
      const queryKey = queryKeys.projects(currentUser.id);
      const previousProjects = queryClient.getQueryData<Project[]>(queryKey);

      if (previousProjects) {
        queryClient.setQueryData<Project[]>(queryKey, (old) =>
          old ? old.map((p) => (p.id === id ? { ...p, ...updates } : p)) : []
        );
      }
      return { previousProjects };
    },
    // 2. Rollback on Error
    onError: (err, variables, context) => {
      if (context?.previousProjects) {
        queryClient.setQueryData(queryKeys.projects(currentUser.id), context.previousProjects);
      }
    },
    // 3. Background Sync
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects(currentUser.id) });
    },
  });
```

### 2. The Component Save Handler

In the component (`WorkspaceTeamProjectsPage.tsx`), the save handler updates local form states, provides immediate success feedback, and fires the mutation *without awaiting it*.

```tsx
  const handleSaveProject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // 1. Immediate UI Feedback
    setFeedback({ type: 'success', message: 'Project updated.' });
    setSavingProjectId(''); // Do not enter a loading state

    // 2. Optimistic Update for secondary queries (e.g., the Sidebar)
    queryClient.setQueryData(['sidebarTree', workspaceId], (current) => {
      // (Mapping logic to update the project name in the sidebar tree)
      return updatedSidebarTree;
    });

    // 3. Fire the background request (Promise is NOT awaited)
    onUpdateProject(selectedProject.id, {
      name: projectDraft.name,
      description: projectDraft.description,
    })
      .then(() => {
        // Trigger background sync for secondary queries on success
        void queryClient.invalidateQueries({ queryKey: ['sidebarTree', workspaceId] });
      })
      .catch((error) => {
        // Rollback secondary queries and show error on failure
        void queryClient.invalidateQueries({ queryKey: ['sidebarTree', workspaceId] });
        setFeedback({ type: 'error', message: 'Failed to update project.' });
      });
  };
```

### 3. Preventing Unintended Form Flashes

A common pitfall with background cache synchronization is that when the fresh data arrives from the server, the component receives a new object reference from the React Query hook. If the component blindly synchronizes its local form draft to this new object reference via a `useEffect`, the form will suddenly "reset" or the success message will flash away.

To fix this, we use a `useRef` to track the ID of the entity. The `useEffect` should only update the draft state if the user has *explicitly selected a different entity*, not when the object reference changes due to a cache refresh.

```tsx
  const prevSelectedProjectIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedProject) return;

    // Only reset the draft if the user selected a DIFFERENT project.
    // If the cache simply updated in the background, the ID remains the same.
    if (prevSelectedProjectIdRef.current !== selectedProject.id) {
      setProjectDraft(getProjectDraft(selectedProject));
      setFeedback(null);
      prevSelectedProjectIdRef.current = selectedProject.id;
    }
  }, [selectedProject]);
```

## When to Use This Pattern

Use this Optimistic UI pattern for:
- Editing metadata (names, descriptions, status, settings)
- Sorting, pinning, or favoriting items
- Archiving or un-archiving items
- Simple creations that don't immediately require server-generated IDs to function in the current view.

**Do NOT use this pattern for:**
- Actions that require strict server validation before the user can proceed (e.g., changing passwords, payments).
- Destructive actions where a rollback would be highly confusing (e.g., permanently deleting a team).
- Actions that heavily rely on complex server-side calculations that cannot be accurately predicted locally.

## Scaling to Enterprise-Grade Architecture

While the baseline pattern is excellent for most interactions, scaling to a high-concurrency, "enterprise-grade" system requires additional safeguards:

### 1. Centralize the Cache Logic
Avoid manually updating secondary caches (like `sidebarTree`) inside UI components.
**Best Practice:** The `onMutate` function inside your central data layer (e.g., `TicketContext`) should be responsible for updating all dependent queries. If the backend can return the fully updated entity hierarchy, the frontend can just merge it instead of replicating complex tree manipulations.

### 2. Debounce and Batch Rapid Requests
If a user is rapidly toggling settings or typing in a "save-on-blur" field, firing a `PATCH` request for every interaction floods the server and creates race conditions.
**Best Practice:** Use a debouncer. Bundle rapid updates into an `updates` object in a `useRef` and wait a few hundred milliseconds before flushing them to the server in a single network request. Gravity currently uses this advanced batched approach for updating Tickets.

### 3. Handle "Multi-player" Conflicts
Optimistic UI is great for the user making the edit, but if another user is editing the same project concurrently, purely relying on HTTP requests means User A's cache becomes stale immediately when User B saves.
**Best Practice:** Pair Optimistic UI with **Server-Sent Events (SSE)** or WebSockets. When any mutation succeeds, the server broadcasts an event. The frontend listens to this event and invalidates the cache, ensuring all connected users instantly see the update.

### 4. Robust Rollbacks and Error Handling
If the user's connection drops, a naive rollback might overwrite their subsequent local edits.
**Best Practice:** Implement retry logic with exponential backoff (e.g., React Query's default retry mechanisms). If the server is momentarily unreachable, the client attempts to resend the mutation 3-4 times before finally giving up, rolling back, and notifying the user.
