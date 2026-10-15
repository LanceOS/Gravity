# Workspace note audit export

Workspace Settings → Export Data → Export Notes downloads a UTF-8 JSON Lines (`.jsonl`) file. Only a workspace owner can start it. The owner receives private notes from every project and author in that workspace. Workspace admins, project owners, and members cannot use this endpoint.

Each line is one JSON record:

| Record | Contents |
| --- | --- |
| `header` | Format version, workspace, generation time, privacy policy, expected note count, and consistency policy. |
| `note` | Complete body, body SHA-256, title, project, author, version, and creation/update timestamps. A missing body is `null` and has a diagnostic. |
| `attachment_chunk` | Base64 bytes for a referenced attachment, with source note ID, target note ID, filename, and zero-based sequence. |
| `attachment_end` | Byte count, SHA-256, chunk count, and storage ETag for one attachment. Only attachments with this record are complete. |
| `diagnostic` | A missing, unavailable, changed, invalid, or out-of-workspace object/reference. |
| `manifest` | Final counts and `complete` flag. A complete file must end with this record and have `complete: true`. |

To reconstruct an attachment, group its chunks by `sourceNoteId`, `noteId`, and `filename`; sort by sequence; decode each chunk separately; concatenate the resulting bytes; then verify `attachment_end.bytes` and `attachment_end.sha256`. A partial storage read can leave chunks without an `attachment_end`; discard those chunks and inspect the diagnostic.

The server reads metadata in batches of 100 and streams attachment chunks with response backpressure. Each server process permits one active export per workspace and two active note exports in total. Closing the download cancels the export and its active object read. Browsers with the File System Access API write directly to disk; other browsers buffer the download before saving. The `workspace_note_export_events` table records initiation and final status (`completed`, `incomplete`, `failed`, or `cancelled`) with counts. `completed` means the server finished flushing the response; it cannot prove the browser saved or verified the file.

Each note's metadata is paired with its captured immutable body revision. Legacy `body.md` objects are checked for change during reading. Attachment reads use an ETag condition and include a checksum. The export is not a single point-in-time snapshot of the workspace: notes changed or deleted during the run can cause a count mismatch diagnostic, and attachments are captured when read. This is a readable audit export of current notes and referenced media, not a disaster recovery backup or an inventory of unreferenced storage objects.
