export interface AgentSimulatorProps {
  onClose: () => void;
}

export interface AgentLogEntry {
  type: 'info' | 'tool' | 'success' | 'error' | 'thought';
  text: string;
}