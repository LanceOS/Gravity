import React, { useId } from 'react';
import { ChevronRight } from 'lucide-react';
import { Portal, FocusTrap, ClickAwayListener } from '../../utilities';
import './ContextMenu.css';

// ----------------------------------------------------
// Interfaces & Types
// ----------------------------------------------------

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  children?: ContextMenuItem[];
}

export interface ContextMenuProps {
  children: React.ReactNode;
  items?: ContextMenuItem[];
}

// ----------------------------------------------------
// Contexts
// ----------------------------------------------------

interface ContextMenuContextType {
  closeMenu: () => void;
}

const ContextMenuContext = React.createContext<ContextMenuContextType | null>(null);

export const MenuLevelContext = React.createContext<{
  level: number;
  activeSubmenuId: string | null;
  setActiveSubmenuId: (id: string | null) => void;
  requestSubmenuOpen: (id: string) => void;
  requestSubmenuClose: () => void;
  cancelSubmenuClose: () => void;
}>({
  level: 0,
  activeSubmenuId: null,
  setActiveSubmenuId: () => {},
  requestSubmenuOpen: () => {},
  requestSubmenuClose: () => {},
  cancelSubmenuClose: () => {},
});

// ----------------------------------------------------
// Components
// ----------------------------------------------------

export interface ContextMenuRootProps {
  children: React.ReactNode; // Trigger when content/items is provided, or menu content if trigger is provided
  trigger?: React.ReactNode;
  content?: React.ReactNode;
  items?: ContextMenuItem[];
}

export function ContextMenuRoot({ children, trigger, content, items }: ContextMenuRootProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [coords, setCoords] = React.useState({ x: 0, y: 0 });
  const [menuElement, setMenuElement] = React.useState<HTMLDivElement | null>(null);
  const [activeSubmenuId, setActiveSubmenuId] = React.useState<string | null>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setCoords({ x: e.clientX, y: e.clientY });
    setActiveSubmenuId(null);
    setIsOpen(true);
  };

  const closeMenu = React.useCallback(() => {
    setIsOpen(false);
    setActiveSubmenuId(null);
  }, []);

  // Handle positioning adjustments (edge-flipping)
  React.useLayoutEffect(() => {
    if (!isOpen || !menuElement) return;
    const menuRect = menuElement.getBoundingClientRect();
    const { x, y } = coords;
    
    let left = x;
    let top = y;

    // Horizontally check if it overflows window right edge
    if (x + menuRect.width > window.innerWidth) {
      left = Math.max(8, window.innerWidth - menuRect.width - 8);
    }
    // Vertically check if it overflows window bottom edge
    if (y + menuRect.height > window.innerHeight) {
      top = Math.max(8, window.innerHeight - menuRect.height - 8);
    }

    menuElement.style.left = `${left}px`;
    menuElement.style.top = `${top}px`;
  }, [isOpen, coords, menuElement]);

  // Focus the first item when menu opens
  React.useEffect(() => {
    if (isOpen && menuElement) {
      const firstItem = menuElement.querySelector('[data-menu-level="0"]') as HTMLElement | null;
      if (firstItem) {
        firstItem.focus();
      } else {
        menuElement.focus();
      }
    }
  }, [isOpen, menuElement]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      closeMenu();
      return;
    }

    const itemsList = Array.from(
      menuElement?.querySelectorAll('[data-menu-level="0"]') || []
    ) as HTMLElement[];
    if (itemsList.length === 0) return;

    const currentIndex = itemsList.indexOf(document.activeElement as HTMLElement);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % itemsList.length;
      itemsList[nextIndex].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + itemsList.length) % itemsList.length;
      itemsList[prevIndex].focus();
    }
  };

  // Determine actual trigger and menu content
  const actualTrigger = trigger || children;
  const actualContent = content || (trigger ? children : null);

  const contextValue = React.useMemo(() => ({ closeMenu }), [closeMenu]);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const requestSubmenuOpen = React.useCallback((id: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setActiveSubmenuId(id);
    }, 100);
  }, []);

  const requestSubmenuClose = React.useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setActiveSubmenuId(null);
    }, 200);
  }, []);

  const cancelSubmenuClose = React.useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const levelValue = React.useMemo(
    () => ({
      level: 0,
      activeSubmenuId,
      setActiveSubmenuId,
      requestSubmenuOpen,
      requestSubmenuClose,
      cancelSubmenuClose,
    }),
    [activeSubmenuId, requestSubmenuOpen, requestSubmenuClose, cancelSubmenuClose]
  );

  // Helper function to render legacy ContextMenuItem array
  const renderLegacyItems = (legacyItems: ContextMenuItem[], level = 0): React.ReactNode => {
    return legacyItems.map((item, idx) => {
      const hasChildren = item.children && item.children.length > 0;
      if (hasChildren) {
        return (
          <ContextMenuItemComponent key={idx} icon={item.icon} danger={item.danger}>
            {item.label}
            <ContextMenuSubMenu>
              {renderLegacyItems(item.children!, level + 1)}
            </ContextMenuSubMenu>
          </ContextMenuItemComponent>
        );
      }
      return (
        <ContextMenuItemComponent key={idx} onClick={item.onClick} icon={item.icon} danger={item.danger}>
          {item.label}
        </ContextMenuItemComponent>
      );
    });
  };

  return (
    <ContextMenuContext.Provider value={contextValue}>
      <MenuLevelContext.Provider value={levelValue}>
        <div onContextMenu={handleContextMenu} style={{ display: 'contents' }}>
          {actualTrigger}
        </div>
        {isOpen && (
          <Portal>
            <FocusTrap>
              <ClickAwayListener onClickAway={closeMenu}>
                <div
                  ref={setMenuElement}
                  role="menu"
                  aria-label="Context Menu"
                  tabIndex={-1}
                  className="context-menu-container"
                  onKeyDown={handleKeyDown}
                  style={{
                    position: 'fixed',
                    top: `${coords.y}px`,
                    left: `${coords.x}px`,
                  }}
                >
                  {items && items.length > 0 ? renderLegacyItems(items) : actualContent}
                </div>
              </ClickAwayListener>
            </FocusTrap>
          </Portal>
        )}
      </MenuLevelContext.Provider>
    </ContextMenuContext.Provider>
  );
}

// ----------------------------------------------------
// ContextMenu.Item Component
// ----------------------------------------------------

export interface ContextMenuItemProps {
  children: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  closeOnClick?: boolean;
}

export function ContextMenuItemComponent({
  children,
  icon,
  onClick,
  danger,
  disabled = false,
  closeOnClick = true,
}: ContextMenuItemProps) {
  const rootContext = React.useContext(ContextMenuContext);
  const {
    level,
    activeSubmenuId,
    setActiveSubmenuId,
    requestSubmenuOpen,
    requestSubmenuClose,
    cancelSubmenuClose,
  } = React.useContext(MenuLevelContext);
  const itemRef = React.useRef<HTMLButtonElement>(null);
  const itemId = useId();
  const [isHovered, setIsHovered] = React.useState(false);

  // Extract submenu child from children
  const childrenArray = React.Children.toArray(children);
  const submenu = childrenArray.find(
    (child) =>
      React.isValidElement(child) &&
      (child.type === ContextMenuSubMenu || (child.type as any).displayName === 'ContextMenuSubMenu')
  );
  const labelContent = childrenArray.filter(
    (child) =>
      !(
        React.isValidElement(child) &&
        (child.type === ContextMenuSubMenu || (child.type as any).displayName === 'ContextMenuSubMenu')
      )
  );

  const hasSubmenu = !!submenu;
  const isSubmenuOpen = activeSubmenuId === itemId;

  const handleMouseEnter = () => {
    if (disabled) return;
    setIsHovered(true);
    
    if (hasSubmenu) {
      requestSubmenuOpen(itemId);
    } else {
      requestSubmenuClose();
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    requestSubmenuClose();
  };

  const handleItemClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;

    if (hasSubmenu) {
      setActiveSubmenuId(isSubmenuOpen ? null : itemId);
    } else {
      onClick?.();
      if (closeOnClick) {
        rootContext?.closeMenu();
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      if (hasSubmenu) {
        setActiveSubmenuId(itemId);
      } else {
        onClick?.();
        if (closeOnClick) {
          rootContext?.closeMenu();
        }
      }
    } else if (e.key === 'ArrowRight') {
      if (hasSubmenu) {
        e.preventDefault();
        e.stopPropagation();
        setActiveSubmenuId(itemId);
      }
    }
  };

  const handleCloseSubmenu = () => {
    setActiveSubmenuId(null);
    itemRef.current?.focus();
  };

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ display: 'block', position: 'relative' }}
    >
      <button
        ref={itemRef}
        type="button"
        role="menuitem"
        aria-haspopup={hasSubmenu ? 'menu' : undefined}
        aria-expanded={hasSubmenu ? isSubmenuOpen : undefined}
        aria-disabled={disabled}
        data-menu-level={level}
        tabIndex={-1}
        className={`context-menu-item ${danger ? 'context-menu-item--danger' : ''}`}
        data-highlighted={isSubmenuOpen || isHovered ? 'true' : undefined}
        onClick={handleItemClick}
        onKeyDown={handleKeyDown}
      >
        {icon && <span style={{ display: 'inline-flex', flexShrink: 0 }}>{icon}</span>}
        <span style={{ flexGrow: 1 }}>{labelContent}</span>
        {hasSubmenu && (
          <ChevronRight size={13} style={{ marginLeft: 'auto', opacity: 0.7, flexShrink: 0 }} />
        )}
      </button>

      {isSubmenuOpen && submenu && (
        <div
          onMouseEnter={cancelSubmenuClose}
          onMouseLeave={requestSubmenuClose}
        >
          {React.cloneElement(submenu as React.ReactElement<any>, {
            parentItemRef: itemRef,
            onClose: handleCloseSubmenu,
          })}
        </div>
      )}
    </div>
  );
}

ContextMenuItemComponent.displayName = 'ContextMenuItem';

// ----------------------------------------------------
// ContextMenu.SubMenu Component
// ----------------------------------------------------

export interface ContextMenuSubMenuProps {
  children: React.ReactNode;
  parentItemRef?: React.RefObject<HTMLButtonElement | null>;
  onClose?: () => void;
}

export function ContextMenuSubMenu({ children, parentItemRef, onClose }: ContextMenuSubMenuProps) {
  const { level } = React.useContext(MenuLevelContext);
  const [activeSubmenuId, setActiveSubmenuId] = React.useState<string | null>(null);
  const [submenuElement, setSubmenuElement] = React.useState<HTMLDivElement | null>(null);

  const subLevel = level + 1;

  // Position adjacent to parent item with edge-flipping logic
  React.useLayoutEffect(() => {
    if (!submenuElement || !parentItemRef?.current) return;
    const parentRect = parentItemRef.current.getBoundingClientRect();
    const subRect = submenuElement.getBoundingClientRect();

    // Default position: opens to the right of the parent item, aligned with its top
    let left = parentRect.right + 2;
    let top = parentRect.top;

    // Check if it overflows the right side of the screen
    if (left + subRect.width > window.innerWidth) {
      // Flip left
      left = parentRect.left - subRect.width - 2;
    }

    // Check if it overflows the bottom of the screen
    if (top + subRect.height > window.innerHeight) {
      top = Math.max(8, window.innerHeight - subRect.height - 8);
    }

    submenuElement.style.left = `${left}px`;
    submenuElement.style.top = `${top}px`;
  }, [parentItemRef, submenuElement]);

  // Focus the first item in this submenu on mount
  React.useEffect(() => {
    if (submenuElement) {
      const firstItem = submenuElement.querySelector(
        `[data-menu-level="${subLevel}"]`
      ) as HTMLElement | null;
      if (firstItem) {
        firstItem.focus();
      } else {
        submenuElement.focus();
      }
    }
  }, [subLevel, submenuElement]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose?.();
      return;
    }

    const itemsList = Array.from(
      submenuElement?.querySelectorAll(`[data-menu-level="${subLevel}"]`) || []
    ) as HTMLElement[];
    if (itemsList.length === 0) return;

    const currentIndex = itemsList.indexOf(document.activeElement as HTMLElement);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % itemsList.length;
      itemsList[nextIndex].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + itemsList.length) % itemsList.length;
      itemsList[prevIndex].focus();
    }
  };

  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const requestSubmenuOpen = React.useCallback((id: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setActiveSubmenuId(id);
    }, 100);
  }, []);

  const requestSubmenuClose = React.useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setActiveSubmenuId(null);
    }, 200);
  }, []);

  const cancelSubmenuClose = React.useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const levelValue = React.useMemo(
    () => ({
      level: subLevel,
      activeSubmenuId,
      setActiveSubmenuId,
      requestSubmenuOpen,
      requestSubmenuClose,
      cancelSubmenuClose,
    }),
    [subLevel, activeSubmenuId, requestSubmenuOpen, requestSubmenuClose, cancelSubmenuClose]
  );

  return (
    <Portal>
      <MenuLevelContext.Provider value={levelValue}>
        <div
          ref={setSubmenuElement}
          role="menu"
          aria-label="Submenu"
          tabIndex={-1}
          className="context-menu-container"
          onKeyDown={handleKeyDown}
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
          }}
        >
          {children}
        </div>
      </MenuLevelContext.Provider>
    </Portal>
  );
}

ContextMenuSubMenu.displayName = 'ContextMenuSubMenu';

// ----------------------------------------------------
// ContextMenu Export Namespace
// ----------------------------------------------------

const ContextMenuBase = function ContextMenu({ children, items }: ContextMenuProps) {
  return <ContextMenuRoot items={items}>{children}</ContextMenuRoot>;
};

export const ContextMenu = Object.assign(ContextMenuBase, {
  Root: ContextMenuRoot,
  Item: ContextMenuItemComponent,
  SubMenu: ContextMenuSubMenu,
});

export default ContextMenu;
