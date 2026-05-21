import React from 'react';
import { User, ChevronLeft, ChevronRight, Folder, File, ChevronDown } from 'lucide-react';

// Helper to join class names
function cn(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

// 1. Avatar
export interface AvatarProps {
  src?: string;
  name?: string;
  size?: 'sm' | 'md' | 'lg';
  style?: React.CSSProperties;
}
export function Avatar({ src, name, size = 'md', style }: AvatarProps) {
  const sizePx = { sm: '24px', md: '36px', lg: '48px' }[size];
  const fontSize = { sm: '10px', md: '13px', lg: '16px' }[size];

  const getInitials = () => {
    if (!name) return '';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  return (
    <div
      style={{
        width: sizePx,
        height: sizePx,
        borderRadius: 'var(--radius-full)',
        border: '1px solid var(--border)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--sidebar-bg)',
        overflow: 'hidden',
        color: 'var(--text-heading)',
        fontWeight: 500,
        fontSize,
        flexShrink: 0,
        ...style,
      }}
    >
      {src ? (
        <img src={src} alt={name || 'Avatar'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : name ? (
        getInitials()
      ) : (
        <User size={16} />
      )}
    </div>
  );
}

// 2. AvatarGroup
export interface AvatarGroupProps {
  children: React.ReactNode;
  max?: number;
  style?: React.CSSProperties;
}
export function AvatarGroup({ children, max = 4, style }: AvatarGroupProps) {
  const avatars = React.Children.toArray(children);
  const visibleAvatars = avatars.slice(0, max);
  const extraCount = avatars.length - max;

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', ...style }}>
      {visibleAvatars.map((av, idx) => (
        <div key={idx} style={{ marginLeft: idx > 0 ? '-8px' : '0px', zIndex: 10 - idx }}>
          {av}
        </div>
      ))}
      {extraCount > 0 && (
        <div
          style={{
            marginLeft: '-8px',
            zIndex: 0,
            width: '28px',
            height: '28px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'var(--sidebar-bg)',
            border: '1px solid var(--border)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '10px',
            fontWeight: 600,
            color: 'var(--text-muted)',
          }}
        >
          +{extraCount}
        </div>
      )}
    </div>
  );
}

// 3. Badge
export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'accent' | 'success' | 'error' | 'warning' | 'default';
  style?: React.CSSProperties;
}
export function Badge({ children, variant = 'default', style }: BadgeProps) {
  const variantStyles = {
    default: { backgroundColor: 'var(--sidebar-bg)', color: 'var(--text-muted)' },
    accent: { backgroundColor: 'var(--accent-glow)', color: 'var(--accent)', borderColor: 'var(--accent-border)' },
    success: { backgroundColor: 'rgba(59, 130, 246, 0.08)', color: 'var(--priority-low)', borderColor: 'rgba(59,130,246,0.18)' },
    error: { backgroundColor: 'rgba(239, 68, 68, 0.08)', color: 'var(--priority-high)', borderColor: 'rgba(239,68,68,0.18)' },
    warning: { backgroundColor: 'rgba(245, 158, 11, 0.08)', color: 'var(--priority-medium)', borderColor: 'rgba(245,158,11,0.18)' },
  };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 'var(--radius-xs)',
        fontSize: '11px',
        fontWeight: 500,
        border: '1px solid var(--border)',
        ...variantStyles[variant],
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// 4. Tag / Chip
export interface TagProps {
  label: string;
  onClose?: () => void;
  style?: React.CSSProperties;
}
export function Tag({ label, onClose, style }: TagProps) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '2px 8px',
        borderRadius: 'var(--radius-sm)',
        backgroundColor: 'var(--sidebar-bg)',
        border: '1px solid var(--border)',
        fontSize: '12px',
        color: 'var(--text)',
        ...style,
      }}
    >
      <span>{label}</span>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            color: 'var(--text-muted)',
            fontSize: '10px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

// 5. Image (with lazy loading and fallback)
export interface ImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fallback?: string;
}
export function Image({ src, fallback = 'https://placehold.co/100', alt, style, ...props }: ImageProps) {
  const [imgSrc, setImgSrc] = React.useState(src);
  const [error, setError] = React.useState(false);

  return (
    <img
      src={error ? fallback : imgSrc}
      alt={alt}
      loading="lazy"
      onError={() => {
        setError(true);
      }}
      style={{
        maxWidth: '100%',
        height: 'auto',
        borderRadius: 'var(--radius-md)',
        ...style,
      }}
      {...props}
    />
  );
}

// 6. Carousel
export interface CarouselProps {
  images: string[];
  style?: React.CSSProperties;
}
export function Carousel({ images, style }: CarouselProps) {
  const [idx, setIdx] = React.useState(0);

  const prev = () => setIdx((i) => (i > 0 ? i - 1 : images.length - 1));
  const next = () => setIdx((i) => (i < images.length - 1 ? i + 1 : 0));

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '200px',
        overflow: 'hidden',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)',
        ...style,
      }}
    >
      <img src={images[idx]} alt="Carousel slide" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      <button
        type="button"
        onClick={prev}
        className="btn btn-ghost clickable"
        style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', padding: '6px' }}
      >
        <ChevronLeft size={16} />
      </button>
      <button
        type="button"
        onClick={next}
        className="btn btn-ghost clickable"
        style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', padding: '6px' }}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

// 7. Card
export interface CardProps {
  title?: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}
export function Card({ title, extra, children, style, className = '' }: CardProps) {
  return (
    <div
      className={className}
      style={{
        backgroundColor: 'var(--card-bg)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        ...style,
      }}
    >
      {(title || extra) && (
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          {title && <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)' }}>{title}</h4>}
          {extra}
        </div>
      )}
      <div style={{ padding: '16px', fontSize: '13px' }}>{children}</div>
    </div>
  );
}

// 8. Accordion / Collapse
export interface AccordionItem {
  id: string;
  title: string;
  content: React.ReactNode;
}
export interface AccordionProps {
  items: AccordionItem[];
  style?: React.CSSProperties;
}
export function Accordion({ items, style }: AccordionProps) {
  const [openIds, setOpenIds] = React.useState<Record<string, boolean>>({});

  const toggle = (id: string) => {
    setOpenIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', ...style }}>
      {items.map((item) => {
        const isOpen = !!openIds[item.id];
        return (
          <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
            <button
              type="button"
              onClick={() => toggle(item.id)}
              className="clickable"
              style={{
                width: '100%',
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--text-heading)',
              }}
            >
              <span>{item.title}</span>
              <span>{isOpen ? '▲' : '▼'}</span>
            </button>
            {isOpen && (
              <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', fontSize: '13px', color: 'var(--text)' }}>
                {item.content}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// 9. DescriptionList (Metadata block)
export interface DescriptionItem {
  key: string;
  value: React.ReactNode;
}
export interface DescriptionListProps {
  items: DescriptionItem[];
  style?: React.CSSProperties;
}
export function DescriptionList({ items, style }: DescriptionListProps) {
  return (
    <dl
      style={{
        display: 'grid',
        gridTemplateColumns: 'max-content 1fr',
        gap: '8px 16px',
        margin: 0,
        fontSize: '13px',
        ...style,
      }}
    >
      {items.map((item, idx) => (
        <React.Fragment key={idx}>
          <dt style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{item.key}</dt>
          <dd style={{ margin: 0, color: 'var(--text-heading)' }}>{item.value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

// 10. Statistic / KeyValue
export interface StatisticProps {
  title: string;
  value: string | number;
  suffix?: React.ReactNode;
  style?: React.CSSProperties;
}
export function Statistic({ title, value, suffix, style }: StatisticProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', ...style }}>
      <div className="label">{title}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
        <span style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-heading)' }}>{value}</span>
        {suffix && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{suffix}</span>}
      </div>
    </div>
  );
}

// 11. Table
export interface ColumnConfig<T> {
  key: keyof T | string;
  title?: string;
  header?: string;
  render?: (row: T) => React.ReactNode;
  width?: string | number;
}
export interface TableProps<T> {
  columns: ColumnConfig<T>[];
  data: T[];
  style?: React.CSSProperties;
}
export function Table<T>({ columns, data, style }: TableProps<T>) {
  return (
    <div className="scroll-container" style={{ width: '100%', overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', ...style }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--sidebar-bg)' }}>
            {columns.map((col, idx) => (
              <th key={idx} style={{ padding: '10px 12px', fontWeight: 500, color: 'var(--text-muted)', width: col.width }}>
                {col.title || col.header || String(col.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rIdx) => (
            <tr key={rIdx} style={{ borderBottom: rIdx < data.length - 1 ? '1px solid var(--border)' : 'none' }}>
              {columns.map((col, cIdx) => (
                <td key={cIdx} style={{ padding: '10px 12px', color: 'var(--text-heading)' }}>
                  {col.render ? col.render(row) : (row[col.key as keyof T] as any)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 12. DataGrid (Enterprise DOM Virtualized Grid scrolling 10k+ rows easily)
export interface DataGridProps<T> {
  columns: ColumnConfig<T>[];
  data: T[];
  rowHeight?: number;
  height?: number;
  style?: React.CSSProperties;
}
export function DataGrid<T>({ columns, data, rowHeight = 36, height = 360, style }: DataGridProps<T>) {
  const [scrollTop, setScrollTop] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const totalHeight = data.length * rowHeight;
  const startIndex = Math.floor(scrollTop / rowHeight);
  const visibleCount = Math.ceil(height / rowHeight);
  const buffer = 5;
  const bufferedStartIndex = Math.max(0, startIndex - buffer);
  const bufferedEndIndex = Math.min(data.length - 1, startIndex + visibleCount + buffer);

  const visibleRows = React.useMemo(() => {
    const rows = [];
    for (let i = bufferedStartIndex; i <= bufferedEndIndex; i++) {
      if (data[i]) {
        rows.push({ index: i, item: data[i] });
      }
    }
    return rows;
  }, [data, bufferedStartIndex, bufferedEndIndex]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="scroll-container"
      style={{
        position: 'relative',
        overflow: 'auto',
        height: `${height}px`,
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--card-bg)',
        width: '100%',
        ...style,
      }}
    >
      {/* Header Sticky */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          backgroundColor: 'var(--sidebar-bg)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          height: `${rowHeight}px`,
          alignItems: 'center',
          fontWeight: 500,
          fontSize: '13px',
          color: 'var(--text-muted)',
        }}
      >
        {columns.map((col, idx) => (
          <div key={idx} style={{ flex: 1, padding: '0 12px', width: col.width, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {col.title || col.header || String(col.key)}
          </div>
        ))}
      </div>

      {/* Grid Scrollable Canvas */}
      <div style={{ position: 'relative', height: `${totalHeight + rowHeight}px`, width: '100%' }}>
        {visibleRows.map((row) => (
          <div
            key={row.index}
            style={{
              position: 'absolute',
              top: `${row.index * rowHeight + rowHeight}px`,
              left: 0,
              right: 0,
              height: `${rowHeight}px`,
              display: 'flex',
              alignItems: 'center',
              borderBottom: '1px solid var(--border)',
              backgroundColor: 'var(--card-bg)',
              fontSize: '13px',
            }}
          >
            {columns.map((col, cIdx) => (
              <div key={cIdx} style={{ flex: 1, padding: '0 12px', width: col.width, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-heading)' }}>
                {col.render ? col.render(row.item) : (row.item[col.key as keyof T] as any)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// 13. KanbanBoard
export interface KanbanCard {
  id: string;
  title: string;
  status: string;
  content: React.ReactNode;
}
export interface KanbanBoardProps {
  columns: { id: string; title: string }[];
  cards: KanbanCard[];
  onCardMove?: (cardId: string, nextStatus: string) => void;
  style?: React.CSSProperties;
}
export function KanbanBoard({ columns, cards, onCardMove, style }: KanbanBoardProps) {
  return (
    <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', width: '100%', height: '100%', minHeight: '320px', ...style }}>
      {columns.map((col) => {
        const colCards = cards.filter((card) => card.status === col.id);
        return (
          <div
            key={col.id}
            style={{
              flex: 1,
              minWidth: '240px',
              backgroundColor: 'var(--sidebar-bg)',
              borderRadius: 'var(--radius-md)',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-heading)' }}>{col.title}</span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  backgroundColor: 'var(--border)',
                  color: 'var(--text-muted)',
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-full)',
                }}
              >
                {colCards.length}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flexGrow: 1 }}>
              {colCards.map((card) => (
                <div
                  key={card.id}
                  style={{
                    backgroundColor: 'var(--card-bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '12px',
                    boxShadow: 'var(--shadow-sm)',
                    cursor: 'grab',
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-heading)', marginBottom: '6px' }}>{card.title}</div>
                  <div>{card.content}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// 14. Timeline
export interface TimelineEvent {
  title: string;
  time: string;
  description?: React.ReactNode;
}
export interface TimelineProps {
  events: TimelineEvent[];
  style?: React.CSSProperties;
}
export function Timeline({ events, style }: TimelineProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative', paddingLeft: '20px', ...style }}>
      {/* Vert line */}
      <div
        style={{
          position: 'absolute',
          left: '4px',
          top: '4px',
          bottom: '4px',
          width: '2px',
          backgroundColor: 'var(--border)',
        }}
      />
      {events.map((evt, idx) => (
        <div key={idx} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {/* Dot */}
          <div
            style={{
              position: 'absolute',
              left: '-20px',
              top: '4px',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: 'var(--accent-solid)',
              border: '2px solid var(--card-bg)',
            }}
          />
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>{evt.time}</div>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-heading)' }}>{evt.title}</div>
          {evt.description && <div style={{ fontSize: '12px', color: 'var(--text)' }}>{evt.description}</div>}
        </div>
      ))}
    </div>
  );
}

// Helpers for CalendarView
const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

// 15. CalendarView (Month grid calendar)
export interface CalendarViewProps {
  currentDate?: Date;
  events?: Array<{ date: Date; label: string; color?: string }>;
  style?: React.CSSProperties;
}
export function CalendarView({ currentDate = new Date(), events = [], style }: CalendarViewProps) {
  const daysInMonth = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth());
  const firstDay = getFirstDayOfMonth(currentDate.getFullYear(), currentDate.getMonth());

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', ...style }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', backgroundColor: 'var(--sidebar-bg)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'center' }}>
        <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-heading)' }}>
          {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
        </span>
      </div>
      {/* Week Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)', textAlign: 'center', backgroundColor: 'var(--card-bg)' }}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} style={{ padding: '6px', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
            {d}
          </div>
        ))}
      </div>
      {/* Days Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', backgroundColor: 'var(--border)', gap: '1px' }}>
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} style={{ backgroundColor: 'var(--card-bg)', minHeight: '60px' }} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dayDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
          const dayEvents = events.filter(
            (evt) =>
              evt.date.getDate() === day &&
              evt.date.getMonth() === currentDate.getMonth() &&
              evt.date.getFullYear() === currentDate.getFullYear()
          );

          return (
            <div
              key={day}
              style={{
                backgroundColor: 'var(--card-bg)',
                minHeight: '60px',
                padding: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-heading)' }}>{day}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto' }}>
                {dayEvents.map((evt, eIdx) => (
                  <div
                    key={eIdx}
                    style={{
                      fontSize: '9px',
                      padding: '1px 4px',
                      borderRadius: 'var(--radius-xs)',
                      backgroundColor: evt.color || 'var(--accent-glow)',
                      color: 'var(--text-heading)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {evt.label}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 16. TreeView (Nested tree nodes list)
export interface TreeViewNode {
  id: string;
  label: string;
  isFolder?: boolean;
  children?: TreeViewNode[];
}
export interface TreeViewProps {
  nodes: TreeViewNode[];
  onNodeClick?: (node: TreeViewNode) => void;
  style?: React.CSSProperties;
}
export function TreeView({ nodes, onNodeClick, style }: TreeViewProps) {
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderNode = (node: TreeViewNode) => {
    const isFolder = !!node.isFolder;
    const isExpanded = !!expanded[node.id];

    return (
      <div key={node.id} style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          onClick={() => onNodeClick?.(node)}
          className="clickable"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '4px 8px',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            fontSize: '13px',
            color: 'var(--text-heading)',
          }}
        >
          {isFolder ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                type="button"
                onClick={(e) => toggleExpand(node.id, e)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
              >
                <ChevronDown size={14} style={{ transform: isExpanded ? 'none' : 'rotate(-90deg)', transition: 'transform var(--transition-fast)' }} />
              </button>
              <Folder size={14} style={{ color: 'var(--accent)' }} />
            </div>
          ) : (
            <File size={14} style={{ color: 'var(--text-muted)' }} />
          )}
          <span>{node.label}</span>
        </div>
        {isFolder && isExpanded && node.children && (
          <div style={{ paddingLeft: '16px', display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border)', marginLeft: '12px' }}>
            {node.children.map((child) => renderNode(child))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', ...style }}>
      {nodes.map((node) => renderNode(node))}
    </div>
  );
}

// 17. DenseTable
export interface DenseColumnDefinition<T> {
  key: string;
  header: string;
  width: string;
  align?: 'left' | 'right' | 'center';
  render: (row: T) => React.ReactNode;
}

export interface DenseTableProps<T> {
  columns: DenseColumnDefinition<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  selectedRowId?: string;
  getRowId: (row: T) => string;
}

export function DenseTable<T>({
  columns,
  data,
  onRowClick,
  selectedRowId,
  getRowId
}: DenseTableProps<T>) {
  const tableRef = React.useRef<HTMLTableElement>(null);

  // Enable keyboard-driven table navigation
  React.useEffect(() => {
    const table = tableRef.current;
    if (!table) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement;
      if (!active || active.getAttribute('role') !== 'row') return;

      const rows = Array.from(table.querySelectorAll('tbody tr[role="row"]')) as HTMLElement[];
      const currentIndex = rows.indexOf(active);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = rows[currentIndex + 1];
        if (next) next.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = rows[currentIndex - 1];
        if (prev) prev.focus();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        active.click();
      }
    };

    table.addEventListener('keydown', handleKeyDown);
    return () => table.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div 
      style={{
        overflowX: 'auto',
        width: '100%',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        backgroundColor: 'var(--card-bg)'
      }}
    >
      <table
        ref={tableRef}
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          borderSpacing: 0,
          textAlign: 'left',
          fontFamily: 'var(--mono)',
          fontSize: '11px'
        }}
      >
        <thead>
          <tr
            style={{
              backgroundColor: 'var(--sidebar-bg)',
              borderBottom: '1px solid var(--border)',
              height: 'var(--table-row-height, 26px)'
            }}
          >
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  padding: '2px var(--space-2, 8px)',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  width: col.width,
                  textAlign: col.align || 'left',
                  textTransform: 'uppercase',
                  fontSize: '10px',
                  letterSpacing: '0.05em',
                  userSelect: 'none'
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => {
            const rowId = getRowId(row);
            const isSelected = selectedRowId === rowId;
            return (
              <tr
                key={rowId}
                role="row"
                tabIndex={0}
                onClick={() => onRowClick?.(row)}
                style={{
                  borderBottom: '1px solid var(--border)',
                  height: 'var(--table-row-height, 26px)',
                  cursor: onRowClick ? 'pointer' : 'default',
                  backgroundColor: isSelected ? 'var(--accent-glow)' : 'transparent',
                  outline: 'none',
                  transition: 'background-color var(--transition-fast, 0.1s ease)'
                }}
                className="dense-table-row"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={{
                      padding: '0 var(--space-2, 8px)',
                      textAlign: col.align || 'left',
                      color: isSelected 
                        ? 'var(--text-heading)' 
                        : 'var(--text)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// 18. DenseVirtualList
export interface DenseVirtualListProps<T> {
  items: T[];
  height: number;
  rowHeight: number;
  buffer?: number;
  renderRow: (item: T, index: number, style: React.CSSProperties) => React.ReactNode;
}

export function DenseVirtualList<T>({
  items,
  height,
  rowHeight,
  buffer = 5,
  renderRow
}: DenseVirtualListProps<T>) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = React.useState(0);

  const onScroll = React.useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const totalHeight = items.length * rowHeight;
  
  const { startIndex, endIndex } = React.useMemo(() => {
    const visibleCount = Math.ceil(height / rowHeight);
    const start = Math.floor(scrollTop / rowHeight);
    
    const boundedStart = Math.max(0, start - buffer);
    const boundedEnd = Math.min(items.length - 1, start + visibleCount + buffer);
    
    return { startIndex: boundedStart, endIndex: boundedEnd };
  }, [scrollTop, items.length, height, rowHeight, buffer]);

  const visibleItems = React.useMemo(() => {
    const renderedRange: React.ReactNode[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
      const item = items[i];
      if (!item) continue;

      const style: React.CSSProperties = {
        position: 'absolute',
        top: 0,
        transform: `translate3d(0, ${i * rowHeight}px, 0)`,
        left: 0,
        right: 0,
        height: `${rowHeight}px`,
        willChange: 'transform'
      };

      renderedRange.push(renderRow(item, i, style));
    }
    return renderedRange;
  }, [startIndex, endIndex, items, rowHeight, renderRow]);

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      style={{
        height: `${height}px`,
        overflowY: 'auto',
        overflowX: 'hidden',
        position: 'relative',
        outline: 'none',
        backgroundColor: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)'
      }}
      role="grid"
      aria-rowcount={items.length}
    >
      <div
        style={{
          height: `${totalHeight}px`,
          width: '100%',
          position: 'relative'
        }}
      >
        {visibleItems}
      </div>
    </div>
  );
}

// 16. List and ListItem
export interface ListItemProps {
  children: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
  selected?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

export function ListItem({ children, icon, onClick, selected = false, style, className = '' }: ListItemProps) {
  return (
    <li
      onClick={onClick}
      className={cn('lib-list-item', className)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: 'var(--space-2) var(--space-3)',
        borderRadius: 'var(--radius-sm)',
        cursor: onClick ? 'pointer' : 'default',
        backgroundColor: selected ? 'var(--accent-dim)' : 'transparent',
        color: selected ? 'var(--accent)' : 'var(--text-heading)',
        transition: 'background-color var(--transition-fast), color var(--transition-fast)',
        userSelect: 'none',
        ...style
      }}
    >
      {icon && <span style={{ display: 'inline-flex', flexShrink: 0 }}>{icon}</span>}
      <div style={{ flexGrow: 1, minWidth: 0 }}>{children}</div>
    </li>
  );
}

export interface ListProps {
  children: React.ReactNode;
  ordered?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

export function List({ children, ordered = false, style, className = '' }: ListProps) {
  const Tag = ordered ? 'ol' : 'ul';
  return (
    <Tag
      className={cn('lib-list', className)}
      style={{
        listStyle: 'none',
        padding: 0,
        margin: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-1)',
        ...style
      }}
    >
      {children}
    </Tag>
  );
}


