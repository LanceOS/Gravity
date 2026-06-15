import { Skeleton } from '@library';

export interface WorkspaceManagementLoadingSkeletonProps {
  layoutClassName: string;
  cardClassName: string;
  listClassName: string;
  itemClassName: string;
  editorCardClassName: string;
  itemLineWidths?: [string, string, string];
}

export function WorkspaceManagementLoadingSkeleton({
  layoutClassName,
  cardClassName,
  listClassName,
  itemClassName,
  editorCardClassName,
  itemLineWidths = ['50%', '80%', '60%'],
}: WorkspaceManagementLoadingSkeletonProps) {
  const [firstItemWidth, secondItemWidth, thirdItemWidth] = itemLineWidths;

  return (
    <div className={layoutClassName}>
      <div className={cardClassName} style={{ padding: 'var(--space-lg) var(--space-md)' }}>
        <Skeleton variant="text" width="40%" height={20} style={{ marginBottom: 'var(--space-md)' }} />
        <div className={listClassName}>
          {[1, 2, 3].map((item) => (
            <div key={item} className={itemClassName} style={{ cursor: 'default' }}>
              <Skeleton variant="text" width={firstItemWidth} height={14} style={{ marginBottom: 'var(--space-xs)' }} />
              <Skeleton variant="text" width={secondItemWidth} height={18} />
              <Skeleton variant="text" width={thirdItemWidth} height={12} />
            </div>
          ))}
        </div>
      </div>
      <div className={editorCardClassName} style={{ padding: 'var(--space-md)' }}>
        <Skeleton variant="text" width="30%" height={20} style={{ marginBottom: 'var(--space-md)' }} />
        <Skeleton variant="rect" width="100%" height={150} />
      </div>
    </div>
  );
}
