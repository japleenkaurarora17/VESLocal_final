import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { startServer, server } from '../server.js';
import mongoose from 'mongoose';
let activePort = null;
let runningServer = null;

// Helper to make HTTP requests against express app
function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: activePort,
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: parsed
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

test('VESLocal Full-Stack Experiment API Test Suite', async (t) => {
  // Setup: Start server on ephemeral port (0)
  runningServer = await startServer(0);
  activePort = runningServer.address().port;

  t.after(async () => {
  if (runningServer?.listening) {
    await new Promise((resolve, reject) => {
      runningServer.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  await mongoose.disconnect();
});

  let createdStudentId = null;
  let authToken = null;
  let adminAuthToken = null;

  // 1. Health Check
  await t.test('GET /api/health should return status healthy', async () => {
    const res = await request({ path: '/api/health', method: 'GET' });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.status, 'healthy');
    assert.ok(res.body.timestamp);
    assert.ok(res.body.database);
  });

  // 2. Student CRUD - Validation Check
  await t.test('POST /api/students should reject invalid email without @ves.ac.in', async () => {
    const res = await request({
      path: '/api/students',
      method: 'POST'
    }, {
      name: 'Test Student',
      email: 'invalid@gmail.com',
      department: 'Information Technology',
      year: 'First Year'
    });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.success, false);
  });

  // 3. Student CRUD - Create Valid Student
  await t.test('POST /api/students should create new student with valid official email', async () => {
    const res = await request({
      path: '/api/students',
      method: 'POST'
    }, {
      name: 'Aarav Gupta',
      email: `aarav.${Date.now()}@ves.ac.in`,
      department: 'Computer Engineering',
      year: 'Second Year',
      skills: ['Python', 'Django', 'PostgreSQL'],
      bio: 'Enthusiastic backend coder looking for frontend teammates!'
    });
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data);
    createdStudentId = res.body.data._id || res.body.data.id;
    assert.ok(createdStudentId);
  });

  // 4. Student CRUD - List Students
  await t.test('GET /api/students should list students array', async () => {
    const res = await request({ path: '/api/students', method: 'GET' });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.data.length > 0);
  });

  // 5. Student CRUD - Get by ID
  await t.test('GET /api/students/:id should fetch single student', async () => {
    const res = await request({ path: `/api/students/${createdStudentId}`, method: 'GET' });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.name, 'Aarav Gupta');
  });

  // 6. Auth - Register & JWT Issue
  await t.test('POST /api/auth/register should register user and return JWT', async () => {
    const res = await request({
      path: '/api/auth/register',
      method: 'POST'
    }, {
      name: 'Simran Singh',
      email: `simran.${Date.now()}@ves.ac.in`,
      password: 'StrongPassword123!',
      department: 'Information Technology',
      year: 'Third Year'
    });
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.token);
    assert.strictEqual(res.body.user.role, 'student');
    authToken = res.body.token;
  });

  // 7. Auth - Login
  await t.test('POST /api/auth/login should authenticate user and return token', async () => {
    const res = await request({
      path: '/api/auth/login',
      method: 'POST'
    }, {
     email: 'admin.moderator@ves.ac.in',
password: process.env.ADMIN_PASSWORD
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.token);
    assert.strictEqual(res.body.user.role, 'admin');
    adminAuthToken = res.body.token;
  });

  // 8. Security - Access Protected Route
  await t.test('GET /api/auth/me should succeed with valid Bearer token', async () => {
    const res = await request({
      path: '/api/auth/me',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.user);
  });

  // 9. Security - Reject Protected Route Without Token
  await t.test('GET /api/auth/me should return 401 Unauthorized without token', async () => {
    const res = await request({ path: '/api/auth/me', method: 'GET' });
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.success, false);
  });

  // 10. Security - Role Based Authorization Check
  await t.test('DELETE /api/students/:id should return 403 Forbidden for non-admin user', async () => {
    const res = await request({
      path: `/api/students/${createdStudentId}`,
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.success, false);
  });

  // 11. Admin Access - Delete Allowed for Admin
  await t.test('DELETE /api/students/:id should return 200 OK for admin role', async () => {
    const res = await request({
      path: `/api/students/${createdStudentId}`,
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminAuthToken}` }
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
  });
});
