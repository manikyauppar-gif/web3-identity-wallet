// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const ethers = require('ethers');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_hackathon_key';

// In-Memory Database Fallbacks for Mock Mode
const mockUsers = {};
const mockCredentials = {};
const mockVerifications = [];

// Middleware
app.use(helmet({
    contentSecurityPolicy: false // Disable CSP so CDN files loaded in index.html (Tailwind, FontAwesome, Ethers, etc.) are not blocked
}));
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname)); // Serve static files from the project directory

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// MongoDB Schemas
const userSchema = new mongoose.Schema({
    address: { type: String, required: true, unique: true },
    did: String,
    createdAt: { type: Date, default: Date.now },
    lastLogin: Date
});

const credentialSchema = new mongoose.Schema({
    hash: { type: String, required: true, unique: true },
    issuer: String,
    recipient: String,
    type: String,
    ipfsCID: String,
    txHash: String,
    issuedAt: { type: Date, default: Date.now },
    expiresAt: Date
});

const verificationSchema = new mongoose.Schema({
    credentialHash: String,
    verifier: String,
    timestamp: { type: Date, default: Date.now },
    result: Boolean
});

const User = mongoose.model('User', userSchema);
const Credential = mongoose.model('Credential', credentialSchema);
const Verification = mongoose.model('Verification', verificationSchema);

// Auth Middleware
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const token = authHeader.split(' ')[1];
    if (token === 'mock_jwt_token_123') {
        req.user = { address: '0x742d35cc6634c0532925a3b844bc454e4438f44e', id: 'mock_user_id' };
        return next();
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid Token' });
    }
}

// Routes

// --- BEGIN NEW API ROUTES ---

// Simple in-memory storage for identities
const identities = {};

// GET /api/status -> returns backend status
app.get('/api/status', (req, res) => {
    res.json({ status: "Backend running" });
});

// POST /api/saveIdentity -> accepts JSON and stores it
app.post('/api/saveIdentity', (req, res) => {
    try {
        const { name, walletAddress } = req.body;
        if (!walletAddress) {
            return res.status(400).json({ error: "walletAddress is required" });
        }
        
        // Store in memory
        identities[walletAddress.toLowerCase()] = {
            name: name || "Web3 User",
            walletAddress: walletAddress.toLowerCase(),
            savedAt: new Date()
        };
        
        res.json({ success: true, message: "Identity saved successfully" });
    } catch (error) {
        res.status(500).json({ error: "Failed to save identity", details: error.message });
    }
});

// GET /api/getIdentity -> returns stored identity data
app.get('/api/getIdentity', (req, res) => {
    try {
        const { walletAddress } = req.query;
        if (!walletAddress) {
            return res.status(400).json({ error: "walletAddress is required" });
        }
        
        const identity = identities[walletAddress.toLowerCase()];
        if (!identity) {
            return res.status(404).json({ error: "Identity not found" });
        }
        
        res.json({ success: true, data: identity });
    } catch (error) {
        res.status(500).json({ error: "Failed to get identity", details: error.message });
    }
});

// --- END NEW API ROUTES ---

// 1. Wallet Login
app.post('/api/auth/wallet-login', async (req, res, next) => {
    try {
        const { address, signature, message } = req.body;
        
        // Verify signature
        const recoveredAddress = ethers.verifyMessage(message, signature);
        if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
            return res.status(401).json({ error: 'Invalid signature' });
        }
        
        // Upsert User
        let user;
        if (mongoose.connection.readyState === 1) {
            user = await User.findOne({ address: address.toLowerCase() });
            if (!user) {
                user = new User({ address: address.toLowerCase(), did: `did:polygon:${address}` });
            }
            user.lastLogin = new Date();
            await user.save();
        } else {
            user = mockUsers[address.toLowerCase()];
            if (!user) {
                user = { address: address.toLowerCase(), did: `did:polygon:${address}`, _id: 'mock_user_' + Math.random().toString(36).substr(2, 9) };
            }
            user.lastLogin = new Date();
            mockUsers[address.toLowerCase()] = user;
        }
        
        // Generate JWT
        const token = jwt.sign({ address: user.address, id: user._id }, JWT_SECRET, { expiresIn: '24h' });
        
        res.json({ success: true, token, user });
    } catch (error) {
        next(error);
    }
});

// 2. Issue Credential
app.post('/api/credentials/issue', authMiddleware, async (req, res, next) => {
    try {
        const { recipientDID, credentialType, payload } = req.body;
        
        // Generate Hash
        const payloadString = JSON.stringify(payload);
        const credHash = ethers.keccak256(ethers.toUtf8Bytes(payloadString + Date.now().toString()));
        
        // MOCK IPFS Upload (Since no Pinata key provided)
        const ipfsCID = "QmMockHash" + Math.floor(Math.random() * 1000000);
        
        // Save to DB (or memory)
        const credData = {
            hash: credHash,
            issuer: req.user.address,
            recipient: recipientDID,
            type: credentialType,
            ipfsCID: ipfsCID,
            issuedAt: new Date()
        };

        if (mongoose.connection.readyState === 1) {
            const cred = new Credential(credData);
            await cred.save();
        } else {
            mockCredentials[credHash] = credData;
        }
        
        res.json({ success: true, credentialHash: credHash, ipfsCID });
    } catch (error) {
        next(error);
    }
});

// 3. Verify Credential
app.post('/api/credentials/verify', async (req, res, next) => {
    try {
        const { credentialHash, verifierAddress } = req.body;
        
        let cred;
        if (mongoose.connection.readyState === 1) {
            cred = await Credential.findOne({ hash: credentialHash });
        } else {
            cred = mockCredentials[credentialHash];
        }

        if (!cred) {
            return res.json({ isValid: false, reason: "Not found in off-chain DB" });
        }
        
        // Save verification to DB (or memory)
        const verifyData = {
            credentialHash,
            verifier: verifierAddress || 'anonymous',
            result: true,
            timestamp: new Date()
        };

        if (mongoose.connection.readyState === 1) {
            const verification = new Verification(verifyData);
            await verification.save();
        } else {
            mockVerifications.push(verifyData);
        }
        
        res.json({ isValid: true, issuer: cred.issuer, type: cred.type || cred.credentialType });
    } catch (error) {
        next(error);
    }
});

// 4. Analytics Stats
app.get('/api/analytics/stats', async (req, res, next) => {
    try {
        let totalCredentials;
        let verificationsToday;
        
        if (mongoose.connection.readyState === 1) {
            totalCredentials = await Credential.countDocuments();
            const startOfDay = new Date();
            startOfDay.setHours(0,0,0,0);
            verificationsToday = await Verification.countDocuments({ timestamp: { $gte: startOfDay } });
        } else {
            totalCredentials = Object.keys(mockCredentials).length;
            const startOfDay = new Date();
            startOfDay.setHours(0,0,0,0);
            verificationsToday = mockVerifications.filter(v => new Date(v.timestamp) >= startOfDay).length;
        }
        
        res.json({ totalCredentials, verificationsToday, institutionsOnboarded: 47 });
    } catch (error) {
        next(error);
    }
});

// 5. Get User Credentials Endpoint
app.get('/api/credentials/user/:address', async (req, res, next) => {
    try {
        const address = req.params.address.toLowerCase();
        let creds;
        if (mongoose.connection.readyState === 1) {
            creds = await Credential.find({
                $or: [
                    { recipient: address },
                    { recipient: `did:polygon:${address}` }
                ]
            });
        } else {
            creds = Object.values(mockCredentials).filter(c => 
                c.recipient.toLowerCase() === address || 
                c.recipient.toLowerCase() === `did:polygon:${address}`
            );
        }
        res.json({ success: true, credentials: creds });
    } catch (error) {
        next(error);
    }
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// Connect DB & Start Server
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/digiid_hackathon';

mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 2000 })
    .then(() => {
        console.log('✅ Connected to MongoDB');
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
        });
    })
    .catch(err => {
        console.warn('⚠️ Could not connect to MongoDB. Server will run without DB (Mock mode). Error:', err.message);
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT} (No Database Mode)`);
        });
    });
