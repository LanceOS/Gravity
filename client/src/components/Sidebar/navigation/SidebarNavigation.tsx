import type { ButtonHTMLAttributes, JSX, ReactNode } from 'react';
import { SidebarGroup, SidebarItem, type SidebarGroupProps, type SidebarItemProps } from '@library';
import './SidebarNavigation.css';

interface SidebarNavigationRootProps {
  className?: string;
  children: ReactNode;
}

interface SidebarNavigationLabelProps {
  children: ReactNode;
}

interface SidebarNavigationListProps {
  children: ReactNode;
}

interface SidebarNavigationBranchProps {
  children: ReactNode;
}

interface SidebarNavigationItemLabelProps {
  icon?: ReactNode;
  children: ReactNode;
}

interface SidebarNavigationItemIconProps {
  children: ReactNode;
}

interface SidebarNavigationCollapseProps {
  collapsed: boolean;
  children: ReactNode;
}

interface SidebarNavigationSubItemsProps {
  children: ReactNode;
}

interface SidebarNavigationDotProps {
  color: string;
}

interface SidebarNavigationSectionHeaderProps {
  children: ReactNode;
}

interface SidebarNavigationGroupToggleProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  expanded: boolean;
  icon: ReactNode;
  children: ReactNode;
}

interface SidebarNavigationIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

type SidebarNavigationComponent = ((props: SidebarNavigationRootProps) => JSX.Element) & {
  Group: (props: SidebarGroupProps) => JSX.Element;
  Item: (props: SidebarItemProps) => JSX.Element;
  Label: (props: SidebarNavigationLabelProps) => JSX.Element;
  List: (props: SidebarNavigationListProps) => JSX.Element;
  Branch: (props: SidebarNavigationBranchProps) => JSX.Element;
  ItemLabel: (props: SidebarNavigationItemLabelProps) => JSX.Element;
  ItemIcon: (props: SidebarNavigationItemIconProps) => JSX.Element;
  Collapse: (props: SidebarNavigationCollapseProps) => JSX.Element;
  SubItems: (props: SidebarNavigationSubItemsProps) => JSX.Element;
  Empty: (props: SidebarNavigationLabelProps) => JSX.Element;
  Dot: (props: SidebarNavigationDotProps) => JSX.Element;
  CompletedText: (props: SidebarNavigationLabelProps) => JSX.Element;
  SectionHeader: (props: SidebarNavigationSectionHeaderProps) => JSX.Element;
  GroupToggle: (props: SidebarNavigationGroupToggleProps) => JSX.Element;
  IconButton: (props: SidebarNavigationIconButtonProps) => JSX.Element;
};

function joinClassNames(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}

function SidebarNavigationRoot({ className, children }: SidebarNavigationRootProps): JSX.Element {
  return <div className={joinClassNames('sidebar-navigation', className)}>{children}</div>;
}

function SidebarNavigationGroup(props: SidebarGroupProps): JSX.Element {
  return <SidebarGroup {...props} />;
}

function SidebarNavigationItem(props: SidebarItemProps): JSX.Element {
  return <SidebarItem {...props} />;
}

function SidebarNavigationLabel({ children }: SidebarNavigationLabelProps): JSX.Element {
  return <span className="sidebar-navigation__label">{children}</span>;
}

function SidebarNavigationList({ children }: SidebarNavigationListProps): JSX.Element {
  return <div className="sidebar-navigation__list">{children}</div>;
}

function SidebarNavigationBranch({ children }: SidebarNavigationBranchProps): JSX.Element {
  return <div className="sidebar-navigation__branch">{children}</div>;
}

function SidebarNavigationItemLabel({ icon, children }: SidebarNavigationItemLabelProps): JSX.Element {
  return (
    <div className="sidebar-navigation__item-label">
      {icon}
      <span className="sidebar-navigation__item-label-text">{children}</span>
    </div>
  );
}

function SidebarNavigationItemIcon({ children }: SidebarNavigationItemIconProps): JSX.Element {
  return <div className="sidebar-navigation__item-icon">{children}</div>;
}

function SidebarNavigationCollapse({ collapsed, children }: SidebarNavigationCollapseProps): JSX.Element {
  return (
    <div
      className={joinClassNames(
        'sidebar-navigation__collapse',
        collapsed && 'sidebar-navigation__collapse--collapsed'
      )}
      aria-hidden={collapsed}
    >
      <div className="sidebar-navigation__collapse-inner">
        {children}
      </div>
    </div>
  );
}

function SidebarNavigationSubItems({ children }: SidebarNavigationSubItemsProps): JSX.Element {
  return <div className="sidebar-navigation__sub-items">{children}</div>;
}

function SidebarNavigationEmpty({ children }: SidebarNavigationLabelProps): JSX.Element {
  return <div className="sidebar-navigation__empty">{children}</div>;
}

function SidebarNavigationDot({ color }: SidebarNavigationDotProps): JSX.Element {
  return <div className="sidebar-navigation__dot" style={{ background: color }} />;
}

function SidebarNavigationCompletedText({ children }: SidebarNavigationLabelProps): JSX.Element {
  return <span className="sidebar-navigation__completed">{children}</span>;
}

function SidebarNavigationSectionHeader({ children }: SidebarNavigationSectionHeaderProps): JSX.Element {
  return <div className="sidebar-navigation__section-header">{children}</div>;
}

function SidebarNavigationGroupToggle({
  expanded,
  icon,
  children,
  ...props
}: SidebarNavigationGroupToggleProps): JSX.Element {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      className="sidebar-navigation__group-toggle"
      {...props}
    >
      {icon}
      <span className="sidebar-navigation__group-toggle-label">{children}</span>
    </button>
  );
}

function SidebarNavigationIconButton({ children, ...props }: SidebarNavigationIconButtonProps): JSX.Element {
  return (
    <button type="button" className="sidebar-navigation__icon-button" {...props}>
      {children}
    </button>
  );
}

export const SidebarNavigation: SidebarNavigationComponent = Object.assign(SidebarNavigationRoot, {
  Group: SidebarNavigationGroup,
  Item: SidebarNavigationItem,
  Label: SidebarNavigationLabel,
  List: SidebarNavigationList,
  Branch: SidebarNavigationBranch,
  ItemLabel: SidebarNavigationItemLabel,
  ItemIcon: SidebarNavigationItemIcon,
  Collapse: SidebarNavigationCollapse,
  SubItems: SidebarNavigationSubItems,
  Empty: SidebarNavigationEmpty,
  Dot: SidebarNavigationDot,
  CompletedText: SidebarNavigationCompletedText,
  SectionHeader: SidebarNavigationSectionHeader,
  GroupToggle: SidebarNavigationGroupToggle,
  IconButton: SidebarNavigationIconButton,
});
