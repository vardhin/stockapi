const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const validator = require('validator');
require('dotenv').config();

// Security configuration
const SECRET_KEY = process.env.SECRET_KEY || crypto.randomBytes(32).toString('hex');
const ALGORITHM = 'HS256';
const ACCESS_TOKEN_EXPIRE_MINUTES = parseInt(process.env.ACCESS_TOKEN_EXPIRE_MINUTES) || 30;
const REFRESH_TOKEN_EXPIRE_DAYS = parseInt(process.env.REFRESH_TOKEN_EXPIRE_DAYS) || 7;
const MAX_LOGIN_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
const LOCKOUT_DURATION_MINUTES = parseInt(process.env.LOCKOUT_DURATION_MINUTES) || 15;
const SALT_ROUNDS = 12;

// Database path
const DB_PATH = path.join(__dirname, 'auth.db');

class AuthDatabase {
    constructor() {
        this.isInitialized = false;
        this.initDb();
    }

    async initDb() {
        if (this.isInitialized) return;
        
        return new Promise((resolve, reject) => {
            const db = new sqlite3.Database(DB_PATH, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                db.serialize(() => {
                    // Users table
                    db.run(`
                        CREATE TABLE IF NOT EXISTS users (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            email TEXT UNIQUE NOT NULL,
                            password_hash TEXT NOT NULL,
                            full_name TEXT NOT NULL,
                            is_active BOOLEAN DEFAULT TRUE,
                            email_verified BOOLEAN DEFAULT FALSE,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            last_login DATETIME,
                            password_reset_token TEXT,
                            password_reset_expires DATETIME
                        )
                    `);

                    // Login attempts table
                    db.run(`
                        CREATE TABLE IF NOT EXISTS login_attempts (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            email TEXT NOT NULL,
                            ip_address TEXT,
                            attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            success BOOLEAN DEFAULT FALSE
                        )
                    `);

                    // Active tokens table
                    db.run(`
                        CREATE TABLE IF NOT EXISTS active_tokens (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            user_id INTEGER NOT NULL,
                            token_hash TEXT NOT NULL,
                            token_type TEXT NOT NULL,
                            expires_at DATETIME NOT NULL,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY (user_id) REFERENCES users (id)
                        )
                    `, (err) => {
                        if (err) {
                            reject(err);
                        } else {
                            this.isInitialized = true;
                            resolve();
                        }
                    });
                });
                
                // Close this initialization connection
                db.close();
            });
        });
    }

    getConnection() {
        return new sqlite3.Database(DB_PATH);
    }

    createUser(email, passwordHash, fullName) {
        return new Promise((resolve, reject) => {
            const db = this.getConnection();
            const stmt = db.prepare(`
                INSERT INTO users (email, password_hash, full_name) 
                VALUES (?, ?, ?)
            `);

            stmt.run([email.toLowerCase(), passwordHash, fullName], function(err) {
                stmt.finalize();
                
                if (err) {
                    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                        reject(new Error('Email already registered'));
                    } else {
                        reject(err);
                    }
                } else {
                    resolve(this.lastID);
                }
                
                db.close();
            });
        });
    }

    getUserByEmail(email) {
        return new Promise((resolve, reject) => {
            const db = this.getConnection();
            const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
            
            stmt.get([email.toLowerCase()], (err, row) => {
                stmt.finalize();
                
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
                
                db.close();
            });
        });
    }

    getUserById(userId) {
        return new Promise((resolve, reject) => {
            const db = this.getConnection();
            const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
            
            stmt.get([userId], (err, row) => {
                stmt.finalize();
                
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
                
                db.close();
            });
        });
    }

    updateLastLogin(userId) {
        return new Promise((resolve, reject) => {
            const db = this.getConnection();
            const stmt = db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?');
            
            stmt.run([userId], (err) => {
                stmt.finalize();
                
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
                
                db.close();
            });
        });
    }

    logLoginAttempt(email, ipAddress, success) {
        return new Promise((resolve, reject) => {
            const db = this.getConnection();
            const stmt = db.prepare('INSERT INTO login_attempts (email, ip_address, success) VALUES (?, ?, ?)');
            
            stmt.run([email.toLowerCase(), ipAddress, success], (err) => {
                stmt.finalize();
                
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
                
                db.close();
            });
        });
    }

    getFailedLoginAttempts(email, minutes = null) {
        return new Promise((resolve, reject) => {
            const db = this.getConnection();
            let query, params;

            if (minutes) {
                query = `
                    SELECT COUNT(*) as count FROM login_attempts 
                    WHERE email = ? AND success = FALSE 
                    AND attempted_at > datetime('now', '-${minutes} minutes')
                `;
                params = [email.toLowerCase()];
            } else {
                query = `
                    SELECT COUNT(*) as count FROM login_attempts 
                    WHERE email = ? AND success = FALSE
                `;
                params = [email.toLowerCase()];
            }

            const stmt = db.prepare(query);
            stmt.get(params, (err, row) => {
                stmt.finalize();
                
                if (err) {
                    reject(err);
                } else {
                    resolve(row.count);
                }
                
                db.close();
            });
        });
    }

    clearLoginAttempts(email) {
        return new Promise((resolve, reject) => {
            const db = this.getConnection();
            const stmt = db.prepare('DELETE FROM login_attempts WHERE email = ?');
            
            stmt.run([email.toLowerCase()], (err) => {
                stmt.finalize();
                
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
                
                db.close();
            });
        });
    }

    storeToken(userId, token, tokenType, expiresAt) {
        return new Promise((resolve, reject) => {
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            const db = this.getConnection();
            const stmt = db.prepare('INSERT INTO active_tokens (user_id, token_hash, token_type, expires_at) VALUES (?, ?, ?, ?)');
            
            stmt.run([userId, tokenHash, tokenType, expiresAt.toISOString()], (err) => {
                stmt.finalize();
                
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
                
                db.close();
            });
        });
    }

    isTokenBlacklisted(token) {
        return new Promise((resolve, reject) => {
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            const db = this.getConnection();
            const stmt = db.prepare('SELECT COUNT(*) as count FROM active_tokens WHERE token_hash = ? AND expires_at > CURRENT_TIMESTAMP');
            
            stmt.get([tokenHash], (err, row) => {
                stmt.finalize();
                
                if (err) {
                    reject(err);
                } else {
                    resolve(row.count === 0);
                }
                
                db.close();
            });
        });
    }

    revokeToken(token) {
        return new Promise((resolve, reject) => {
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            const db = this.getConnection();
            const stmt = db.prepare('DELETE FROM active_tokens WHERE token_hash = ?');
            
            stmt.run([tokenHash], (err) => {
                stmt.finalize();
                
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
                
                db.close();
            });
        });
    }

    cleanupExpiredTokens() {
        return new Promise((resolve, reject) => {
            const db = this.getConnection();
            
            db.serialize(() => {
                const stmt1 = db.prepare('DELETE FROM active_tokens WHERE expires_at <= CURRENT_TIMESTAMP');
                const stmt2 = db.prepare("DELETE FROM login_attempts WHERE attempted_at < datetime('now', '-7 days')");
                
                stmt1.run((err) => {
                    stmt1.finalize();
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    stmt2.run((err) => {
                        stmt2.finalize();
                        if (err) {
                            reject(err);
                        } else {
                            resolve();
                        }
                        db.close();
                    });
                });
            });
        });
    }
}

class AuthManager {
    constructor() {
        this.db = new AuthDatabase();
        // Ensure database is initialized before starting cleanup
        this.initialize();
    }

    async initialize() {
        await this.db.initDb();
        // Start cleanup interval after initialization
        this.startCleanupInterval();
    }

    startCleanupInterval() {
        // Clean up expired tokens every hour
        setInterval(async () => {
            try {
                await this.db.cleanupExpiredTokens();
                console.log('Cleaned up expired tokens and old login attempts');
            } catch (error) {
                console.error('Error during cleanup:', error);
            }
        }, 3600000); // 1 hour
    }

    async hashPassword(password) {
        return await bcrypt.hash(password, SALT_ROUNDS);
    }

    async verifyPassword(plainPassword, hashedPassword) {
        return await bcrypt.compare(plainPassword, hashedPassword);
    }

    createAccessToken(data, expiresIn = null) {
        const payload = {
            ...data,
            type: 'access',
            iat: Math.floor(Date.now() / 1000)
        };

        const options = {
            algorithm: ALGORITHM,
            expiresIn: expiresIn || `${ACCESS_TOKEN_EXPIRE_MINUTES}m`
        };

        return jwt.sign(payload, SECRET_KEY, options);
    }

    createRefreshToken(data, expiresIn = null) {
        const payload = {
            ...data,
            type: 'refresh',
            iat: Math.floor(Date.now() / 1000)
        };

        const options = {
            algorithm: ALGORITHM,
            expiresIn: expiresIn || `${REFRESH_TOKEN_EXPIRE_DAYS}d`
        };

        return jwt.sign(payload, SECRET_KEY, options);
    }

    async verifyToken(token, tokenType = 'access') {
        try {
            // Check if token is blacklisted
            const isBlacklisted = await this.db.isTokenBlacklisted(token);
            if (isBlacklisted) {
                throw new Error('Token has been revoked');
            }

            const payload = jwt.verify(token, SECRET_KEY);
            
            if (payload.type !== tokenType) {
                throw new Error('Invalid token type');
            }

            return payload;
        } catch (error) {
            throw new Error('Could not validate credentials');
        }
    }

    validatePassword(password) {
        const errors = [];
        
        if (password.length < 8) {
            errors.push('Password must be at least 8 characters long');
        }
        if (!/[A-Z]/.test(password)) {
            errors.push('Password must contain at least one uppercase letter');
        }
        if (!/[a-z]/.test(password)) {
            errors.push('Password must contain at least one lowercase letter');
        }
        if (!/\d/.test(password)) {
            errors.push('Password must contain at least one digit');
        }
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
            errors.push('Password must contain at least one special character');
        }

        return errors;
    }

    validateFullName(fullName) {
        const trimmed = fullName.trim();
        if (trimmed.length < 2) {
            return 'Full name must be at least 2 characters long';
        }
        if (!/^[a-zA-Z\s]+$/.test(trimmed)) {
            return 'Full name must contain only letters and spaces';
        }
        return null;
    }

    getClientIp(req) {
        const forwarded = req.headers['x-forwarded-for'];
        if (forwarded) {
            return forwarded.split(',')[0].trim();
        }
        return req.connection.remoteAddress || req.socket.remoteAddress || 
               (req.connection.socket ? req.connection.socket.remoteAddress : null);
    }

    async signup(userData, req) {
        await this.db.initDb(); // Ensure database is ready
        
        const { email, password, confirmPassword, fullName } = userData;

        // Validate email
        if (!validator.isEmail(email)) {
            throw new Error('Invalid email format');
        }

        // Validate password
        const passwordErrors = this.validatePassword(password);
        if (passwordErrors.length > 0) {
            throw new Error(passwordErrors[0]);
        }

        // Check password confirmation
        if (password !== confirmPassword) {
            throw new Error('Passwords do not match');
        }

        // Validate full name
        const nameError = this.validateFullName(fullName);
        if (nameError) {
            throw new Error(nameError);
        }

        // Hash password
        const passwordHash = await this.hashPassword(password);

        // Create user
        const userId = await this.db.createUser(email, passwordHash, fullName.trim());

        // Create tokens
        const accessTokenExpires = new Date(Date.now() + ACCESS_TOKEN_EXPIRE_MINUTES * 60 * 1000);
        const refreshTokenExpires = new Date(Date.now() + REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60 * 1000);

        const accessToken = this.createAccessToken({
            sub: userId.toString(),
            email: email
        });

        const refreshToken = this.createRefreshToken({
            sub: userId.toString(),
            email: email
        });

        // Store tokens
        await this.db.storeToken(userId, accessToken, 'access', accessTokenExpires);
        await this.db.storeToken(userId, refreshToken, 'refresh', refreshTokenExpires);

        // Update last login
        await this.db.updateLastLogin(userId);

        // Log successful signup
        const ipAddress = this.getClientIp(req);
        await this.db.logLoginAttempt(email, ipAddress, true);

        console.log(`User registered successfully: ${email}`);

        return {
            access_token: accessToken,
            refresh_token: refreshToken,
            token_type: 'bearer',
            expires_in: ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            user: {
                id: userId,
                email: email,
                fullName: fullName.trim()
            }
        };
    }

    async signin(userData, req) {
        await this.db.initDb(); // Ensure database is ready
        
        const { email, password } = userData;
        const ipAddress = this.getClientIp(req);

        // Validate email format
        if (!validator.isEmail(email)) {
            throw new Error('Invalid email format');
        }

        // Check for account lockout
        const failedAttempts = await this.db.getFailedLoginAttempts(email, LOCKOUT_DURATION_MINUTES);
        
        if (failedAttempts >= MAX_LOGIN_ATTEMPTS) {
            await this.db.logLoginAttempt(email, ipAddress, false);
            throw new Error(`Account temporarily locked due to too many failed attempts. Try again in ${LOCKOUT_DURATION_MINUTES} minutes.`);
        }

        // Get user
        const user = await this.db.getUserByEmail(email);
        if (!user) {
            await this.db.logLoginAttempt(email, ipAddress, false);
            // Add delay to prevent timing attacks
            await new Promise(resolve => setTimeout(resolve, 500));
            throw new Error('Invalid email or password');
        }

        // Check if user is active
        if (!user.is_active) {
            await this.db.logLoginAttempt(email, ipAddress, false);
            throw new Error('Account is deactivated');
        }

        // Verify password
        const isValidPassword = await this.verifyPassword(password, user.password_hash);
        if (!isValidPassword) {
            await this.db.logLoginAttempt(email, ipAddress, false);
            // Add delay to prevent timing attacks
            await new Promise(resolve => setTimeout(resolve, 500));
            throw new Error('Invalid email or password');
        }

        // Clear failed login attempts
        await this.db.clearLoginAttempts(email);

        // Create tokens
        const accessTokenExpires = new Date(Date.now() + ACCESS_TOKEN_EXPIRE_MINUTES * 60 * 1000);
        const refreshTokenExpires = new Date(Date.now() + REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60 * 1000);

        const accessToken = this.createAccessToken({
            sub: user.id.toString(),
            email: user.email
        });

        const refreshToken = this.createRefreshToken({
            sub: user.id.toString(),
            email: user.email
        });

        // Store tokens
        await this.db.storeToken(user.id, accessToken, 'access', accessTokenExpires);
        await this.db.storeToken(user.id, refreshToken, 'refresh', refreshTokenExpires);

        // Update last login
        await this.db.updateLastLogin(user.id);

        // Log successful login
        await this.db.logLoginAttempt(email, ipAddress, true);

        console.log(`User logged in successfully: ${email}`);

        return {
            access_token: accessToken,
            refresh_token: refreshToken,
            token_type: 'bearer',
            expires_in: ACCESS_TOKEN_EXPIRE_MINUTES * 60
        };
    }

    async refreshToken(refreshTokenStr) {
        const payload = await this.verifyToken(refreshTokenStr, 'refresh');
        const userId = parseInt(payload.sub);
        const email = payload.email;

        // Get user to ensure still active
        const user = await this.db.getUserById(userId);
        if (!user || !user.is_active) {
            throw new Error('User not found or inactive');
        }

        // Create new access token
        const accessTokenExpires = new Date(Date.now() + ACCESS_TOKEN_EXPIRE_MINUTES * 60 * 1000);
        const accessToken = this.createAccessToken({
            sub: userId.toString(),
            email: email
        });

        // Store new token
        await this.db.storeToken(userId, accessToken, 'access', accessTokenExpires);

        return {
            access_token: accessToken,
            refresh_token: refreshTokenStr,
            token_type: 'bearer',
            expires_in: ACCESS_TOKEN_EXPIRE_MINUTES * 60
        };
    }

    async logout(token) {
        await this.db.revokeToken(token);
        console.log('User logged out successfully');
    }

    async getCurrentUser(token) {
        const payload = await this.verifyToken(token);
        const userId = parseInt(payload.sub);

        const user = await this.db.getUserById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        if (!user.is_active) {
            throw new Error('User account is deactivated');
        }

        return {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            is_active: user.is_active,
            created_at: user.created_at,
            last_login: user.last_login
        };
    }

    // Middleware for extracting bearer token
    extractBearerToken(req) {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new Error('No bearer token provided');
        }
        return authHeader.substring(7);
    }

    // Express middleware for authentication
    authenticate() {
        return async (req, res, next) => {
            try {
                const token = this.extractBearerToken(req);
                const user = await this.getCurrentUser(token);
                req.user = user;
                req.token = token;
                next();
            } catch (error) {
                res.status(401).json({ error: error.message });
            }
        };
    }

    // Security headers middleware
    securityHeaders() {
        return (req, res, next) => {
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('X-Frame-Options', 'DENY');
            res.setHeader('X-XSS-Protection', '1; mode=block');
            res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
            next();
        };
    }
}

// Initialize auth manager
const authManager = new AuthManager();

module.exports = {
    AuthManager,
    authManager,
    // Export functions for use in routes
    signup: (userData, req) => authManager.signup(userData, req),
    signin: (userData, req) => authManager.signin(userData, req),
    refreshToken: (refreshToken) => authManager.refreshToken(refreshToken),
    logout: (token) => authManager.logout(token),
    getCurrentUser: (token) => authManager.getCurrentUser(token),
    authenticate: () => authManager.authenticate(),
    securityHeaders: () => authManager.securityHeaders(),
    extractBearerToken: (req) => authManager.extractBearerToken(req)
};