const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Load environment variables
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "ieltsmock";
const ADMIN_EMAIL_PRIMARY = "hoshimjonov08@gmail.com";
const FALLBACK_ADMIN_EMAIL = "xoshimjonovxurshidbek5@gmail.com";

// We require User model directly
// If the path d:/mock/models/User exists, load it, otherwise define inline schema
let User;
try {
    User = require('../models/User');
} catch (e) {
    const userSchema = new mongoose.Schema({
        username: String,
        memberIdNumber: Number,
        memberId: String,
        name: String,
        email: { type: String, unique: true },
        password: { type: String, required: false },
        avatar: String,
        googleId: String,
        role: String,
        plan: String,
        isPremium: Boolean,
        premiumUntil: Date,
        authProviders: [String],
        createdAt: Date,
        lastLogin: Date
    });
    User = mongoose.model('User', userSchema);
}

async function runReset() {
    console.log("Starting production user reset script...");

    if (!MONGO_URI) {
        console.error("CRITICAL ERROR: MONGO_URI or MONGODB_URI is not set in environment.");
        process.exit(1);
    }

    try {
        console.log("Connecting to MongoDB database...");
        await mongoose.connect(MONGO_URI, {
            dbName: MONGO_DB_NAME
        });
        console.log("Connected to MongoDB successfully.");

        const adminEmailNormalized = ADMIN_EMAIL_PRIMARY.trim().toLowerCase();
        let adminUser = await User.findOne({ email: adminEmailNormalized });
        let adminStatus = "";
        let adminUserId = null;
        let adminEmailUsed = adminEmailNormalized;

        if (adminUser) {
            console.log(`Found primary admin user: ${adminUser.email}`);
            
            // Normalize existing admin properties
            adminUser.role = "admin";
            adminUser.email = adminEmailNormalized;
            
            if (!Array.isArray(adminUser.authProviders)) {
                adminUser.authProviders = [];
            }
            if (adminUser.authProviders.length === 0) {
                if (adminUser.googleId) {
                    adminUser.authProviders.push("google");
                }
                if (adminUser.password) {
                    adminUser.authProviders.push("password");
                }
            }
            
            await adminUser.save();
            adminStatus = `Preserved primary admin: ${adminUser.email}`;
            adminUserId = String(adminUser._id || adminUser.id);
        } else {
            console.log(`Primary admin email (${adminEmailNormalized}) not found. Creating fallback admin...`);
            
            const fallbackEmailNormalized = FALLBACK_ADMIN_EMAIL.trim().toLowerCase();
            adminUser = await User.findOne({ email: fallbackEmailNormalized });

            if (adminUser) {
                console.log(`Found existing fallback admin user: ${adminUser.email}`);
                adminUser.role = "admin";
                await adminUser.save();
                adminStatus = `Preserved fallback admin: ${adminUser.email}`;
                adminUserId = String(adminUser._id || adminUser.id);
                adminEmailUsed = fallbackEmailNormalized;
            } else {
                // Create fallback admin
                const password = process.env.ADMIN_PASSWORD;
                if (!password) {
                    console.error("CRITICAL ERROR: ADMIN_PASSWORD is required in environment to create fallback admin.");
                    await mongoose.disconnect();
                    process.exit(1);
                }

                const passwordHash = await bcrypt.hash(password, 10);
                
                // Let's get highest member ID number
                const highestUser = await User.findOne({}).sort("-memberIdNumber").select("memberIdNumber");
                let memberIdNumber = highestUser && highestUser.memberIdNumber ? highestUser.memberIdNumber + 1 : 2;
                if (memberIdNumber < 2) memberIdNumber = 2;
                const memberId = String(memberIdNumber).padStart(3, "0");

                adminUser = await User.create({
                    username: "admin",
                    memberIdNumber,
                    memberId,
                    name: "Admin",
                    email: fallbackEmailNormalized,
                    password: passwordHash,
                    role: "admin",
                    avatar: "",
                    googleId: null,
                    plan: "free",
                    isPremium: false,
                    premiumUntil: null,
                    authProviders: ["password"],
                    createdAt: new Date(),
                    lastLogin: null
                });

                adminStatus = `Created fallback admin: ${adminUser.email}`;
                adminUserId = String(adminUser._id || adminUser.id);
                adminEmailUsed = fallbackEmailNormalized;
            }
        }

        console.log(`Kept admin user ID is: ${adminUserId}`);

        // 7. Delete all other users
        const deleteUsersResult = await User.deleteMany({ email: { $ne: adminEmailUsed } });
        console.log(`Deleted other users from 'users' collection: ${deleteUsersResult.deletedCount}`);

        // 8. Clear auth/session related collections if they exist
        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();
        const namesToClear = ["sessions", "refreshtokens", "passwordresettokens", "verificationtokens"];
        let clearedCollectionsCount = 0;
        let clearedTokensCount = 0;

        for (const col of collections) {
            if (namesToClear.includes(col.name.toLowerCase())) {
                const result = await db.collection(col.name).deleteMany({});
                clearedCollectionsCount++;
                clearedTokensCount += result.deletedCount;
                console.log(`Cleared session collection: ${col.name} (${result.deletedCount} documents deleted)`);
            }
        }

        // 10. Clean up filesystem logs in data/user-progress.json and data/users.json
        const dataDir = path.join(__dirname, '..', 'data');
        const userProgressPath = path.join(dataDir, 'user-progress.json');
        const localUsersPath = path.join(dataDir, 'users.json');

        let cleanedProgressKeys = 0;
        let cleanedLocalUsers = 0;

        if (fs.existsSync(userProgressPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(userProgressPath, 'utf8'));
                if (data && data.users && typeof data.users === 'object') {
                    const originalKeysCount = Object.keys(data.users).length;
                    const cleanedUsers = {};
                    if (adminUserId && data.users[adminUserId]) {
                        cleanedUsers[adminUserId] = data.users[adminUserId];
                    }
                    data.users = cleanedUsers;
                    fs.writeFileSync(userProgressPath, JSON.stringify(data, null, 2), 'utf8');
                    cleanedProgressKeys = originalKeysCount - Object.keys(data.users).length;
                    console.log(`Cleaned filesystem progress logs: removed ${cleanedProgressKeys} records.`);
                }
            } catch (e) {
                console.error("Warning: failed to clean user-progress.json", e.message);
            }
        }

        if (fs.existsSync(localUsersPath)) {
            try {
                const users = JSON.parse(fs.readFileSync(localUsersPath, 'utf8'));
                if (Array.isArray(users)) {
                    const originalLength = users.length;
                    const filteredUsers = users.filter(u => String(u.email).toLowerCase() === adminEmailUsed);
                    fs.writeFileSync(localUsersPath, JSON.stringify(filteredUsers, null, 2), 'utf8');
                    cleanedLocalUsers = originalLength - filteredUsers.length;
                    console.log(`Cleaned local users backup: removed ${cleanedLocalUsers} records.`);
                }
            } catch (e) {
                console.error("Warning: failed to clean users.json", e.message);
            }
        }

        // Print safe summary
        console.log("\n===========================================");
        console.log("RESET USER SUMMARY:");
        console.log(`- Admin Status: ${adminStatus}`);
        console.log(`- Deleted Users Count: ${deleteUsersResult.deletedCount}`);
        console.log(`- Cleared Session Collections: ${clearedCollectionsCount}`);
        console.log(`- Cleared Tokens/Sessions Count: ${clearedTokensCount}`);
        console.log(`- Cleaned Progress Records: ${cleanedProgressKeys}`);
        console.log(`- Cleaned Local Backup Users: ${cleanedLocalUsers}`);
        console.log("===========================================");

        await mongoose.disconnect();
        console.log("Done.");
    } catch (err) {
        console.error("Reset script failed with error:", err);
        process.exit(1);
    }
}

runReset();
