export function getAuthFailureMessage(isSignUp: boolean): string {
  return isSignUp
    ? 'Registration failed. Email might already exist.'
    : 'Invalid email or password.';
}

export function isAuthSubmissionInvalid(isSignUp: boolean, name: string, email: string, password: string): boolean {
  return !email || !password || (isSignUp && !name);
}
