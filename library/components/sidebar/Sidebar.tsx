import React, { CSSProperties } from 'react';

export interface SidebarProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
}

export function Sidebar({ children, className, style, ...props }: SidebarProps) {
  return (
    <aside
      className={className}
      style={{
        width: '240px',
        height: '100%',
        backgroundColor: 'var(--color-base50)',
        borderRight: '1px solid var(--color-border-default)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        ...style,
      }}
      {...props}
    >
      {children}
    </aside>
  );
}

export function SidebarHeader({ children, className, style, ...props }: SidebarProps) {
  return (
    <div
      className={className}
      style={{
        padding: '16px 16px 8px 16px',
        flexShrink: 0,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

export function SidebarContent({ children, className, style, ...props }: SidebarProps) {
  return (
    <div
      className={className}
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '12px 8px',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

export function SidebarFooter({ children, className, style, ...props }: SidebarProps) {
  return (
    <div
      className={className}
      style={{
        padding: '8px',
        borderTop: '1px solid transparent', // Optional visual break
        flexShrink: 0,
        ...style,
      }}
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

export function SidebarGroup({ label, children, className, style, ...props }: SidebarGroupProps) {
  return (
    <div className={className} style={{ marginBottom: '16px', ...style }} {...props}>
      {label && (
        <div
          style={{
            fontSize: '10px',
            fontWeight: 600,
            color: 'var(--color-text-disabled)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            padding: '4px 8px 0 8px',
            marginBottom: '4px',
          }}
        >
          {label}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
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
  style,
  onMouseEnter,
  onMouseLeave,
  ...props
}: SidebarItemProps) {
  const [isHovered, setIsHovered] = React.useState(false);

  const baseStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: nested ? '5px 8px' : '6px 10px',
    borderRadius: '6px',
    fontSize: nested ? '12px' : '13px',
    color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
    background: active ? 'var(--color-border-default)' : isHovered ? 'rgba(255,255,255,0.03)' : 'transparent',
    fontWeight: active ? 500 : 400,
    cursor: 'pointer',
    border: 'none',
    textAlign: 'left',
    width: '100%',
    transition: 'background 0.1s, color 0.1s',
    ...style,
  };

  return (
    <button
      className={className}
      style={baseStyle}
      onMouseEnter={(e) => {
        setIsHovered(true);
        onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        setIsHovered(false);
        onMouseLeave?.(e);
      }}
      type="button"
      {...props}
    >
      {leftIcon && <span style={{ display: 'flex', alignItems: 'center' }}>{leftIcon}</span>}
      <span style={{ flex: 1, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
        {children}
      </span>
      {rightElement && <span>{rightElement}</span>}
    </button>
  );
}
