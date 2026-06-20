export type ActiveView = 'list' | 'board';

export interface ActiveViewContextType {
  activeView: ActiveView;
  setView: (view: ActiveView) => void;
}
