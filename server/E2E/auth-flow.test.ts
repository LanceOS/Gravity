import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();

describe('Server Auth Flow E2E', () => {
  it('should successfully run the entire authentication lifecycle', async () => {
    const testEmail = `e2e-user-${Date.now()}@gravity.dev`;
    const testPassword = 'securepassword123';
    const testName = 'E2E Tester';
    let cookieHeader = '';

    // 1. Reject sign-up with missing parameters
    const resSignUpMissing = await request(app)
      .post('/api/auth/sign-up')
      .send({
        name: '',
        email: testEmail,
        password: '',
      });
    expect(resSignUpMissing.status).toBe(400);
    expect(resSignUpMissing.body.error).toContain('required');

    // 2. Successfully register a new user
    const resSignUpSuccess = await request(app)
      .post('/api/auth/sign-up')
      .send({
        name: testName,
        email: testEmail,
        password: testPassword,
      });
    expect(resSignUpSuccess.status).toBe(200);
    expect(resSignUpSuccess.body.user).toBeDefined();
    expect(resSignUpSuccess.body.user.email).toBe(testEmail);
    expect(resSignUpSuccess.body.user.name).toBe(testName);
    expect(resSignUpSuccess.body.user.id).toBeDefined();
    expect(resSignUpSuccess.body.user.password).toBeUndefined(); // Should omit password for security

    // 3. Reject registration with a duplicate email
    const resSignUpDup = await request(app)
      .post('/api/auth/sign-up')
      .send({
        name: 'Another E2E Tester',
        email: testEmail,
        password: 'anotherpassword',
      });
    expect(resSignUpDup.status).toBe(422);
    expect(resSignUpDup.body.error).toMatch(/already|duplicate|exist/i);

    // 4. Reject sign-in with incorrect password
    const resSignInWrongPass = await request(app)
      .post('/api/auth/sign-in')
      .send({
        email: testEmail,
        password: 'wrongpassword',
      });
    expect(resSignInWrongPass.status).toBe(401);
    expect(resSignInWrongPass.body.error).toMatch(/invalid email or password/i);

    // 5. Reject sign-in with non-existent email
    const resSignInNonExistent = await request(app)
      .post('/api/auth/sign-in')
      .send({
        email: 'nonexistent@gravity.dev',
        password: testPassword,
      });
    expect(resSignInNonExistent.status).toBe(401);
    expect(resSignInNonExistent.body.error).toMatch(/invalid email or password/i);

    // 6. Successfully sign in registered user and return cookies
    const resSignInSuccess = await request(app)
      .post('/api/auth/sign-in')
      .send({
        email: testEmail,
        password: testPassword,
      });
    expect(resSignInSuccess.status).toBe(200);
    expect(resSignInSuccess.body.user).toBeDefined();
    expect(resSignInSuccess.body.user.email).toBe(testEmail);

    const cookies = resSignInSuccess.headers['set-cookie'];
    expect(cookies).toBeDefined();
    cookieHeader = Array.isArray(cookies) ? cookies.join('; ') : String(cookies);

    // 7. Resolve session successfully with active session cookies
    const resSessionSuccess = await request(app)
      .get('/api/auth/session')
      .set('Cookie', cookieHeader);
    expect(resSessionSuccess.status).toBe(200);
    expect(resSessionSuccess.body.user).toBeDefined();
    expect(resSessionSuccess.body.user.email).toBe(testEmail);
    expect(resSessionSuccess.body.session).toBeDefined();

    // 8. Fail to resolve session without valid cookies
    const resSessionNoCookies = await request(app).get('/api/auth/session');
    expect(resSessionNoCookies.status).toBe(401);
    expect(resSessionNoCookies.body.error).toBe('Unauthorized');

    // 9. Successfully sign out and clear session state
    const resSignOut = await request(app)
      .post('/api/auth/sign-out')
      .set('Cookie', cookieHeader);
    expect(resSignOut.status).toBe(200);
    expect(resSignOut.body.success).toBe(true);

    // Verify session is no longer active
    const resSessionAfterSignOut = await request(app)
      .get('/api/auth/session')
      .set('Cookie', cookieHeader);
    expect(resSessionAfterSignOut.status).toBe(401);
  });
});

