import { useParams, useSearchParams } from 'react-router-dom';

export default function PlaceholderPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const query = searchParams.get('query');

  return (
    <div style={{ padding: '2rem', color: 'white' }}>
      <h1>Placeholder Page</h1>
      <p>URL Parameter ID: {id}</p>
      <p>Query Parameter: {query}</p>
    </div>
  );
}
