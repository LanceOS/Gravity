import { createAuthClient } from 'better-auth/react';


const getBaseURL = () => {
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
    return 'http://localhost:3000/api/auth';
  }
  if (typeof window !== 'undefined' && window.location) {
    return `${window.location.origin}/api/auth`;
  }
  return '/api/auth';
};

export const authClient = createAuthClient({
  baseURL: getBaseURL(),
});
