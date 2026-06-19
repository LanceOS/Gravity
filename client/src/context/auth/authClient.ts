import { createAuthClient } from 'better-auth/react';
import { adminClient } from 'better-auth/client/plugins';

const getBaseURL = () => {
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
    return 'http://localhost:3000/api/auth';
  }
  return '/api/auth';
};

export const authClient = createAuthClient({
  baseURL: getBaseURL(),
  plugins: [
    adminClient()
  ]
});
