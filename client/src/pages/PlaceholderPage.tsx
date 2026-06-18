import { Link, useParams } from 'react-router-dom';

export default function PlaceholderPage() {
  const { id } = useParams();

  return (
    <div style={{ padding: '32px' }}>
      <h1>Legacy placeholder route</h1>
      <p>
        This route has moved. The legacy placeholder "{id}" is no longer available as a standalone view.
      </p>
      <Link to="/">Return to the application</Link>
    </div>
  );
}
