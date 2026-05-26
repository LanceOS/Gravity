import { useState, useCallback } from 'react';
import { useTickets } from '../../../context/TicketContext';
import { getAuthFailureMessage, isAuthSubmissionInvalid } from '../utils';

export function useAuthForm() {
  const { signIn, signUp } = useTickets();
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    
    if (isAuthSubmissionInvalid(isSignUp, name, email, password)) {
      setErrorMsg('Please fill in all required fields.');
      return;
    }

    setLoading(true);
    try {
      let success = false;
      if (isSignUp) {
        success = await signUp(name, email, password);
      } else {
        success = await signIn(email, password);
      }

      if (!success) {
        setErrorMsg(getAuthFailureMessage(isSignUp));
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred during authentication.');
    } finally {
      setLoading(false);
    }
  }, [isSignUp, name, email, password, signIn, signUp]);

  const toggleMode = useCallback(() => {
    setIsSignUp((prev) => !prev);
    setErrorMsg('');
  }, []);

  return {
    isSignUp,
    name,
    setName,
    email,
    setEmail,
    password,
    setPassword,
    loading,
    errorMsg,
    handleSubmit,
    toggleMode,
  };
}
