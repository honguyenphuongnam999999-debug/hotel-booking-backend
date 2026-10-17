const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const bcrypt = require("bcryptjs");

process.env.JWT_SECRET = "auth-route-test-secret";

const pool = require("../src/config/db");
const users = [];
let nextId = 1;

pool.query = async (sql, params = []) => {
    if (sql.includes("EXISTS (SELECT 1 FROM users WHERE LOWER(email)")) {
        const email = params[0];
        const phone = params[1];
        return { rows: [{
            email_exists: users.some((user) => user.email.toLowerCase() === email),
            phone_exists: users.some((user) => user.phone === phone)
        }] };
    }
    if (sql.includes("INSERT INTO users")) {
        const [email, password_hash, full_name, phone] = params;
        if (users.some((user) => user.email === email || user.phone === phone)) {
            const error = new Error("duplicate key");
            error.code = "23505";
            throw error;
        }
        const user = {
            id: `test-user-${nextId++}`,
            email,
            full_name,
            phone,
            avatar: null,
            created_at: new Date().toISOString(),
            password_hash
        };
        users.push(user);
        const { password_hash: ignored, ...publicUser } = user;
        return { rows: [publicUser] };
    }
    if (sql.includes("SELECT id, email, full_name, phone, avatar, created_at, password_hash")) {
        return { rows: users.filter((user) => user.email.toLowerCase() === params[0]) };
    }
    if (sql.includes("UPDATE users SET last_login_at")) return { rows: [] };
    if (sql.includes("SELECT id, email, full_name, phone, avatar, created_at FROM users")) {
        return { rows: users.filter((user) => user.id === params[0]).map(({ password_hash, ...user }) => user) };
    }
    throw new Error(`Unexpected SQL in test: ${sql}`);
};

const app = express();
app.use(express.json());
app.use("/api/auth", require("../src/routes/auth"));
let server;
let baseUrl;

test.before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function request(path, { method = "POST", body, token } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
            ...(body ? { "content-type": "application/json" } : {}),
            ...(token ? { authorization: `Bearer ${token}` } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { status: response.status, body: await response.json() };
}

test("register stores bcrypt hash and does not return it", async () => {
    const result = await request("/api/auth/register", {
        body: { email: "one@example.com", password: "password123", full_name: "One User", phone: "100" }
    });
    assert.equal(result.status, 201);
    assert.equal(result.body.success, true);
    assert.equal("password_hash" in result.body.user, false);
    assert.equal(await bcrypt.compare("password123", users[0].password_hash), true);
});

test("register rejects missing fields", async () => {
    const result = await request("/api/auth/register", { body: { email: "missing@example.com" } });
    assert.equal(result.status, 400);
});

test("register reports duplicate email, phone, and both independently", async () => {
    users.push({ email: "email@example.com", phone: "200" });
    users.push({ email: "phone@example.com", phone: "300" });
    for (const [body, expectedKeys] of [
        [{ email: "email@example.com", phone: "400" }, ["email"]],
        [{ email: "new@example.com", phone: "300" }, ["phone"]],
        [{ email: "email@example.com", phone: "300" }, ["email", "phone"]]
    ]) {
        const result = await request("/api/auth/register", {
            body: { ...body, password: "password123", full_name: "Duplicate" }
        });
        assert.equal(result.status, 409);
        assert.deepEqual(Object.keys(result.body.errors).sort(), expectedKeys.sort());
    }
});

test("login checks bcrypt password, returns JWT and never returns hash", async () => {
    const result = await request("/api/auth/login", {
        body: { email: "one@example.com", password: "password123" }
    });
    assert.equal(result.status, 200);
    assert.ok(result.body.token);
    assert.equal("password_hash" in result.body.data, false);
    assert.equal("password_hash" in result.body, false);
});

test("login gives the same unauthorized response for unknown email and wrong password", async () => {
    const wrongPassword = await request("/api/auth/login", {
        body: { email: "one@example.com", password: "incorrect" }
    });
    const unknownEmail = await request("/api/auth/login", {
        body: { email: "unknown@example.com", password: "incorrect" }
    });
    assert.equal(wrongPassword.status, 401);
    assert.deepEqual(unknownEmail, wrongPassword);
});

test("JWT continues to authorize auth/me", async () => {
    const login = await request("/api/auth/login", {
        body: { email: "one@example.com", password: "password123" }
    });
    const profile = await request("/api/auth/me", { method: "GET", token: login.body.token });
    assert.equal(profile.status, 200);
    assert.equal(profile.body.data.email, "one@example.com");
    assert.equal("password_hash" in profile.body.data, false);
});

test("logout requires a valid JWT and responds successfully", async () => {
    const login = await request("/api/auth/login", {
        body: { email: "one@example.com", password: "password123" }
    });
    const rejected = await request("/api/auth/logout");
    const loggedOut = await request("/api/auth/logout", { token: login.body.token });
    assert.equal(rejected.status, 401);
    assert.equal(loggedOut.status, 200);
});
