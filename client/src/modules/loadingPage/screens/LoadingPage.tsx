import './LoadingPage.css';

interface LoadingPageProps {
  title?: string;
  subtitle?: string;
}

export function LoadingPage({
  title = 'Loading workspace...',
  subtitle = 'Fetching your projects and settings.',
}: LoadingPageProps) {
  return (
    <div className="loading-page">
      <div className="loading-page__panel">
        <div className="loading-page__title">{title}</div>
        <div className="loading-page__subtitle">{subtitle}</div>
      </div>
    </div>
  );
}