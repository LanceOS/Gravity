const http = require('http');

async function testAuth() {
  try {
    console.log('Testing Sign Up...');
    const resSignUp = await fetch('http://localhost:3000/api/auth/sign-up', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test User', email: 'test@example.com', password: 'password123' })
    });
    console.log('Sign Up Status:', resSignUp.status);
    console.log('Sign Up Body:', await resSignUp.text());

    console.log('Testing Sign In...');
    const resSignIn = await fetch('http://localhost:3000/api/auth/sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'password123' })
    });
    console.log('Sign In Status:', resSignIn.status);
    console.log('Sign In Body:', await resSignIn.text());

  } catch (err) {
    console.error(err);
  }
}
testAuth();
