/**
 * Barrel re-export for all shared ticket context utilities.
 *
 * Import from this index for the most ergonomic imports:
 *
 *   import { parseTimestamp, resetFilters } from '../context/shared';
 *
 * Or import from individual modules for tree-shaking clarity:
 *
 *   import { parseTimestamp } from '../context/shared/ticketTimestamps';
 */

export {
  parseTimestamp,
  shouldAcceptSseCommentUpdate,
  shouldAcceptSseTicketUpdate,
} from './ticketTimestamps';

export {
  candidateMatchesKey,
  combineTicketDetails,
  findTicketInList,
  getListQueryProjectId,
  hasEquivalentTicketFields,
  patchTicketInListById,
  patchTicketLabelAssignment,
  normalizeTicketPayload,
  normalizeCommentPayload,
} from './ticketCache';

export {
  initialFilters,
  resetFilters,
  type TicketFiltersState,
} from './filters';

