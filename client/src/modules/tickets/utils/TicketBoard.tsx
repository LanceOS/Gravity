import {
  getAssigneeAvatar,
  getPriorityColor,
  getPriorityIcon,
} from '../../../utils/ticketPresentation';

const PRIORITY_FILTER_VALUES: Array<[string, string]> = [
  ['', 'Any Priority'],
  ['urgent', 'Urgent'],
  ['high', 'High'],
  ['medium', 'Medium'],
  ['low', 'Low'],
  ['no_priority', 'No Priority'],
];

export { getPriorityIcon, getAssigneeAvatar, getPriorityColor };

export const PRIORITY_FILTER_OPTIONS = PRIORITY_FILTER_VALUES.map(([value, label]) => ({
  value,
  label,
}));
