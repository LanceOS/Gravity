# Note permissions

Notes belong to a project and have an author (`user_id`) and a visibility value. The API first requires membership in the project's workspace. Project membership is not a separate note permission today.

| Visibility | Read, list, search, download media | Edit body/title, upload media | Change visibility, delete note/media, run cleanup |
| --- | --- | --- | --- |
| Private | Author | Author | Author |
| Shared | Any member of the project's workspace | Any member of the project's workspace | Author, workspace owner, or workspace admin |

An inaccessible note ID returns 404 from note-specific API operations. This includes a workspace owner or admin requesting somebody else's private note. A caller outside the workspace is rejected by the workspace membership check. A shared note is scoped to its original project; selecting another project does not grant access.
Project owner status alone does not override note permissions.

Creation defaults to `private`. Authors can opt in with `visibility: "shared"` on creation or change visibility using a versioned PATCH. On a shared note, a workspace owner or admin can also change visibility; regular members cannot. The list and search predicates use the same private-or-shared rule as detail access and return the author and visibility so clients can label and manage shared notes.

The workspace note audit export is a deliberate exception: only the workspace owner can export all notes, including private notes, across that workspace. It is an administrative audit operation and does not grant owner access to private notes through the interactive note API. Background storage recovery jobs operate on durable deletion claims, not on a user's note permissions.

Migration `0019_note_visibility.sql` adds a non-null visibility column with a `private` default. Existing rows therefore keep their prior list/search visibility. No existing note becomes shared without an explicit author action.
