import React from 'react';
import './Sidebar.css';

export interface SidebarProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
}

function joinClassNames(...classNames: Array<string | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}

function getTextContent(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(getTextContent).join('');
  }

  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return getTextContent(node.props.children);
  }

  return '';
}

export function Sidebar({ children, className, ...props }: SidebarProps) {
  return (
    <aside
      className={joinClassNames('sidebar', className)}
      {...props}
    >
      {children}
    </aside>
  );
}

export function SidebarHeader({ children, className, ...props }: SidebarProps) {
  return (
    <div
      className={joinClassNames('sidebar__header', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function SidebarContent({ children, className, ...props }: SidebarProps) {
  return (
    <div
      className={joinClassNames('sidebar__content', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function SidebarFooter({ children, className, ...props }: SidebarProps) {
  return (
    <div
      className={joinClassNames('sidebar__footer', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export interface SidebarGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: React.ReactNode;
  children: React.ReactNode;
}

export function SidebarGroup({ label, children, className, ...props }: SidebarGroupProps) {
  return (
    <div className={joinClassNames('sidebar-group', className)} {...props}>
      {label && (
        <div className="sidebar-group-label">{label}</div>
      )}
      <div className="sidebar-group__items">
        {children}
      </div>
    </div>
  );
}

export interface SidebarItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  leftIcon?: React.ReactNode;
  rightElement?: React.ReactNode;
  nested?: boolean;
}

export function SidebarItem({
  active,
  leftIcon,
  rightElement,
  nested,
  children,
  className,
  title,
  ...props
}: SidebarItemProps) {
  const itemLabel = getTextContent(children).trim();

  return (
    <button
      className={joinClassNames(
        'sidebar-item',
        nested ? 'sidebar-item--nested' : undefined,
        active ? 'sidebar-item--active' : undefined,
        className,
      )}
      aria-current={active ? 'page' : undefined}
      {...props}
      type="button"
      title={title ?? (itemLabel || undefined)}
    >
      {leftIcon && <span className="sidebar-item__icon">{leftIcon}</span>}
      <span className="sidebar-item__content">
        {children}
      </span>
      {rightElement && <span className="sidebar-item__right">{rightElement}</span>}
    </button>
  );
}
