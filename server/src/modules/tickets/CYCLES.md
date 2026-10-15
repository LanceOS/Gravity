# Cycle lifecycle API

Cycles belong to a team. `GET /cycles?teamId=...` (or `?projectId=...`) and
`GET /cycles/:cycleId` require membership in the team's workspace. Completed
cycles remain readable in both endpoints. A request that supplies both team and
project IDs must name a project in that team.

Workspace owners can `POST /cycles`, `PATCH /cycles/:cycleId`, and
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
one team are serialized. Team reassignment locks both teams and rejects a move
that would overlap their active cycles. Legacy or direct database writes are
outside the API overlap contract.

Deletion returns 409 while any ticket references the cycle. Ticket assignment
locks its cycle row, and deletion locks the same row before checking references.
The `tickets.cycle_id` foreign key also prevents direct writes from creating
new dangling references or deleting a referenced cycle. It is installed as
`NOT VALID` in PostgreSQL so existing orphaned IDs remain for a separate repair.
After the last assignment is removed, deletion succeeds and invalidates the
workspace sidebar cache. Create and edit also invalidate that cache.

`GET /cycles/:cycleId/progress` uses the same team read authorization as cycle
detail and remains available after completion. It returns `summary` with ticket
counts (`total`, `completed`, `remaining`, and all six workflow statuses),
`historyAvailableFrom`, `historyUnavailableBefore`, and `dailyRemaining` points
with UTC dates and counts. `completed` counts `done`; `remaining` is total minus
done, so canceled tickets remain visible in the status breakdown and count as
remaining. Summary reads current ticket rows across every project in the team.

The progress event ledger records membership and status transitions in the
same transaction as ticket writes. Each UTC daily point reflects events before
the next midnight, or before the cycle end/current time on a partial day.
Daily deltas are maintained in the same transaction, so progress reads scale
with the number of active days rather than every historical ticket event.
PostgreSQL serves the cycle, current summary, day deltas, and partial-day events
from one read-only repeatable-read snapshot, preventing a concurrent ticket
commit from mixing different progress states in one response.
Historical points are never recomputed from present ticket rows. New cycles
start tracking when created. Cycles created before the ledger have null
`historyAvailableFrom` and no daily points until their first ticket change;
that write records a baseline at the current time. Earlier dates stay marked
unavailable. Removing or deleting a ticket records an exit while keeping its
earlier event history. Deleting the cycle itself removes its ledger rows.
Direct SQL changes to ticket cycle or status fields are outside the application
ledger contract and must be accompanied by equivalent progress writes.
