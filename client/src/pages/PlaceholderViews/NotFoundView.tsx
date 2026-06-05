import React from 'react';
import { Link } from 'react-router-dom';
import './PlaceholderViews.css';

export default function NotFoundView() {
  return (
    <div className="placeholder-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div className="notfound-wrapper">
        <div className="notfound-code">404</div>
        <h1 className="notfound-title">Path Not Found</h1>
        <p className="notfound-desc">
          The view path you are attempting to visit does not exist or has moved. 
          Please double check the address bar URL formatting.
        </p>
        <Link to="/" style={{ textDecoration: 'none' }}>
          <button className="notfound-btn">
            Go Back Home
          </button>
        </Link>
      </div>
    </div>
  );
}
