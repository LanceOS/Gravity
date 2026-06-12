import React from 'react';
import { useNavigate } from 'react-router-dom';
import { HelpCircle } from 'lucide-react';
import { Button } from '@library';
import './NotFoundView.css';

export default function NotFoundView() {
  const navigate = useNavigate();

  return (
    <div className="not-found-page">
      <div className="not-found-page__card">
        <div className="not-found-page__icon">
          <HelpCircle size={28} />
        </div>
        <h1 className="not-found-page__title">
          Page not found
        </h1>
        <p className="not-found-page__body">
          The page you are looking for doesn't exist or has been moved. Please double check the URL or return to the workspace.
        </p>
        <Button
          type="button"
          variant="primary"
          onClick={() => navigate('/')}
          className="not-found-page__cta"
        >
          Go Back Home
        </Button>
      </div>
    </div>
  );
}
