# Cycle lifecycle API

Cycles belong to a team. `GET /cycles?teamId=...` (or `?projectId=...`) and
`GET /cycles/:cycleId` require membership in the team's workspace. Completed
cycles remain readable in both endpoints. A request that supplies both team and
project IDs must name a project in that team.

Workspace owners and admins can `POST /cycles`, `PATCH /cycles/:cycleId`, and
`DELETE /cycles/:cycleId`. Create accepts a team ID or a project ID. Edit accepts
only `name`, `startDate`, `endDate`, and `completed`; it cannot move a cycle to
another team. Names are trimmed and must be nonempty. Dates must be real ISO
calendar dates (`YYYY-MM-DD`) or ISO timestamps with an explicit UTC offset;
`startDate` must be earlier than `endDate`. Invalid input returns 400.
`POST /cycles/:cycleId/complete` and `POST /cycles/:cycleId/reopen` are explicit
completion actions with the same write permissions.

**Active schedule rule:** Noncompleted cycles in the same team cannot have
overlapping half-open `[startDate, endDate)` intervals. Adjacent cycles may share
an endpoint. Completed cycles do not reserve dates; reopening one checks the
rule again. Create, edit, and reopen return 409 on overlap. Lifecycle writes
lock the team row before checking and writing, so concurrent API requests for
one team are serialized. This rule applies to API lifecycle writes; legacy or
direct database writes are outside the API contract.

Deletion returns 409 while any ticket references the cycle. Ticket assignment
locks its cycle row, and deletion locks the same row before checking references.
After the last assignment is removed, deletion succeeds and invalidates the
workspace sidebar cache. Create and edit also invalidate that cache.
