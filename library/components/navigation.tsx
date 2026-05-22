import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Portal } from '../utilities/Portal';
import { ClickAwayListener } from '../utilities/ClickAwayListener';

// Helper to join class names
function cn(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

// 1. Link
export interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  children: React.ReactNode;
}
export function Link({ children, className = '', style, ...props }: LinkProps) {
  return (
    <a
      className={cn('clickable', className)}
      style={{
        color: 'var(--accent-solid)',
        textDecoration: 'none',
        transition: 'color var(--transition-fast)',
        ...style,
      }}
      {...props}
    >
      {children}
    </a>
  );
}

// 2. Breadcrumbs
export interface BreadcrumbItem {
  label: string;
  href?: string;
}
export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  style?: React.CSSProperties;
}
export function Breadcrumbs({ items, style }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: '6px', ...style }}>
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <React.Fragment key={idx}>
            {item.href && !isLast ? (
              <Link href={item.href} style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                {item.label}
              </Link>
            ) : (
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: isLast ? 500 : 400,
                  color: isLast ? 'var(--text-heading)' : 'var(--text-muted)',
                }}
              >
                {item.label}
              </span>
            )}
            {!isLast && <ChevronRight size={13} style={{ color: 'var(--text-muted)' }} />}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

// 3. Pagination
export interface PaginationProps {
  current: number;
  total: number;
  onChange: (page: number) => void;
  style?: React.CSSProperties;
}
export function Pagination({ current, total, onChange, style }: PaginationProps) {
  return (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', ...style }}>
      <button
        type="button"
        disabled={current === 1}
        onClick={() => onChange(current - 1)}
        className="btn btn-sm clickable"
      >
        Prev
      </button>
      {Array.from({ length: total }, (_, i) => {
        const page = i + 1;
        const isCurrent = page === current;
        return (
          <button
            key={page}
            type="button"
            onClick={() => onChange(page)}
            className="btn btn-sm clickable"
            style={{
              minWidth: '32px',
              backgroundColor: isCurrent ? 'var(--accent-solid)' : 'var(--card-bg)',
              color: isCurrent ? '#ffffff' : 'var(--text-heading)',
              borderColor: isCurrent ? 'var(--accent-solid)' : 'var(--border)',
            }}
          >
            {page}
          </button>
        );
      })}
      <button
        type="button"
        disabled={current === total}
        onClick={() => onChange(current + 1)}
        className="btn btn-sm clickable"
      >
        Next
      </button>
    </div>
  );
}

// 4. Navbar
export interface NavbarProps {
  brand: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export function Navbar({ brand, actions, children, style }: NavbarProps) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 24px',
        backgroundColor: 'var(--card-bg)',
        borderBottom: '1px solid var(--border)',
        width: '100%',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-heading)' }}>{brand}</div>
        <nav style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>{children}</nav>
      </div>
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>{actions}</div>}
    </header>
  );
}

// 5. Sidebar
export interface SidebarProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}
export function Sidebar({ children, style }: SidebarProps) {
  return (
    <aside
      style={{
        width: '240px',
        height: '100%',
        backgroundColor: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '12px',
        flexShrink: 0,
        ...style,
      }}
    >
      {children}
    </aside>
  );
}

// 6. MegaMenu
export interface MegaMenuColumn {
  title: string;
  links: Array<{ label: string; href: string }>;
}
export interface MegaMenuProps {
  trigger: React.ReactNode;
  columns: MegaMenuColumn[];
}
export function MegaMenu({ trigger, columns }: MegaMenuProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <ClickAwayListener onClickAway={() => setIsOpen(false)}>
      <div style={{ position: 'relative' }}>
        <div onClick={() => setIsOpen(!isOpen)} className="clickable" style={{ display: 'inline-block' }}>
          {trigger}
        </div>
        {isOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              zIndex: 1000,
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-lg)',
              padding: '20px',
              display: 'flex',
              gap: '24px',
              marginTop: '8px',
              minWidth: '460px',
            }}
          >
            {columns.map((col, idx) => (
              <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '120px' }}>
                <div style={{ fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  {col.title}
                </div>
                {col.links.map((link, lIdx) => (
                  <Link key={lIdx} href={link.href} style={{ fontSize: '13px', color: 'var(--text)' }}>
                    {link.label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </ClickAwayListener>
  );
}

// 7. ContextMenu (Right click trigger)
export interface ContextMenuItem { icon?: React.ReactNode; danger?: boolean; children?: ContextMenuItem[];
  label: string;
  onClick?: () => void;
}
export interface ContextMenuProps {
  children: React.ReactNode;
  items: ContextMenuItem[];
}
export function ContextMenu({ children, items }: ContextMenuProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [pos, setPos] = React.useState({ x: 0, y: 0 });

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setPos({ x: e.clientX, y: e.clientY });
    setIsOpen(true);
  };

  return (
    <ClickAwayListener onClickAway={() => setIsOpen(false)}>
      <div onContextMenu={handleContextMenu} style={{ display: 'contents' }}>
        {children}
        {isOpen && (
          <Portal>
            <div
              style={{
                position: 'fixed',
                top: `${pos.y}px`,
                left: `${pos.x}px`,
                zIndex: 2000,
                backgroundColor: 'var(--card-bg)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-lg)',
                padding: '4px',
                minWidth: '140px',
              }}
            >
              {items.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    item.onClick?.();
                    setIsOpen(false);
                  }}
                  className="clickable"
                  style={{
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '13px',
                    cursor: 'pointer',
                    color: 'var(--text-heading)',
                  }}
                >
                  {item.label}
                </div>
              ))}
            </div>
          </Portal>
        )}
      </div>
    </ClickAwayListener>
  );
}

// 8. DropdownMenu
export interface DropdownMenuProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
}
export function DropdownMenu({ trigger, children }: DropdownMenuProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <ClickAwayListener onClickAway={() => setIsOpen(false)}>
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <div onClick={() => setIsOpen(!isOpen)} className="clickable" style={{ display: 'contents' }}>
          {trigger}
        </div>
        {isOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              zIndex: 1000,
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-md)',
              padding: '4px',
              minWidth: '140px',
              marginTop: '4px',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
          >
            {children}
          </div>
        )}
      </div>
    </ClickAwayListener>
  );
}

// 9. Tabs (W3C WAI-ARIA tablist, tab, tabpanel)
export interface TabItem {
  id: string;
  label: string;
  content: React.ReactNode;
}
export interface TabsProps {
  items: TabItem[];
  defaultTab?: string;
  style?: React.CSSProperties;
}
export function Tabs({ items, defaultTab, style }: TabsProps) {
  const [activeTab, setActiveTab] = React.useState(defaultTab || items[0]?.id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', ...style }}>
      {/* Tab List */}
      <div
        role="tablist"
        aria-label="Tabs navigation"
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border)',
          gap: '16px',
          marginBottom: '12px',
        }}
      >
        {items.map((item) => {
          const isSelected = item.id === activeTab;
          return (
            <button
              key={item.id}
              role="tab"
              aria-selected={isSelected}
              aria-controls={`panel-${item.id}`}
              id={`tab-${item.id}`}
              onClick={() => setActiveTab(item.id)}
              className="clickable"
              style={{
                border: 'none',
                background: 'none',
                padding: '8px 4px',
                fontSize: '13px',
                fontWeight: isSelected ? 500 : 400,
                color: isSelected ? 'var(--accent-solid)' : 'var(--text-muted)',
                cursor: 'pointer',
                borderBottom: isSelected ? '2px solid var(--accent-solid)' : '2px solid transparent',
                transition: 'color var(--transition-fast), border-bottom-color var(--transition-fast)',
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {/* Tab Panels */}
      {items.map((item) => {
        const isSelected = item.id === activeTab;
        return (
          <div
            key={item.id}
            id={`panel-${item.id}`}
            role="tabpanel"
            aria-labelledby={`tab-${item.id}`}
            hidden={!isSelected}
          >
            {isSelected && item.content}
          </div>
        );
      })}
    </div>
  );
}

// 10. Stepper
export interface StepperProps {
  steps: string[];
  activeStep: number;
  style?: React.CSSProperties;
}
export function Stepper({ steps, activeStep, style }: StepperProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', ...style }}>
      {steps.map((step, idx) => {
        const isCompleted = idx < activeStep;
        const isActive = idx === activeStep;
        return (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', flex: idx < steps.length - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  backgroundColor: isCompleted || isActive ? 'var(--accent-solid)' : 'var(--border)',
                  color: isCompleted || isActive ? '#ffffff' : 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: 500,
                }}
              >
                {idx + 1}
              </div>
              <span
                style={{
                  fontSize: '13px',
                  color: isActive ? 'var(--text-heading)' : 'var(--text-muted)',
                  fontWeight: isActive ? 500 : 400,
                }}
              >
                {step}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div
                style={{
                  height: '2px',
                  backgroundColor: isCompleted ? 'var(--accent-solid)' : 'var(--border)',
                  flexGrow: 1,
                  margin: '0 12px',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// 11. Scrollspy
export interface ScrollspyProps {
  targets: string[];
  children: React.ReactNode;
  style?: React.CSSProperties;
}
export function Scrollspy({ targets, children, style }: ScrollspyProps) {
  const [activeId, setActiveId] = React.useState('');

  React.useEffect(() => {
    const handleScroll = () => {
      let currentActive = '';
      for (const target of targets) {
        const el = document.getElementById(target);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 120) {
            currentActive = target;
          }
        }
      }
      setActiveId(currentActive);
    };

    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [targets]);

  return (
    <div style={{ display: 'flex', gap: '16px', ...style }}>
      <nav style={{ width: '120px', display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
        {targets.map((tgt) => (
          <a
            key={tgt}
            href={`#${tgt}`}
            className="clickable"
            style={{
              fontSize: '13px',
              textDecoration: 'none',
              color: activeId === tgt ? 'var(--accent-solid)' : 'var(--text-muted)',
              fontWeight: activeId === tgt ? 500 : 400,
            }}
          >
            {tgt}
          </a>
        ))}
      </nav>
      <div style={{ flexGrow: 1 }}>{children}</div>
    </div>
  );
}

// 12. Affix / StickyHeader
export interface AffixProps {
  offsetTop?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}
export function Affix({ offsetTop = 0, children, style }: AffixProps) {
  return (
    <div
      style={{
        position: 'sticky',
        top: `${offsetTop}px`,
        zIndex: 100,
        backgroundColor: 'var(--card-bg)',
        width: '100%',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
