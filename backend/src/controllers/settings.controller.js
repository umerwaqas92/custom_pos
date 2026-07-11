"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// GET /api/settings - Fetch all settings
router.get("/", auth_1.protect, async (req, res) => {
    try {
        const settings = await prisma.systemSetting.findMany();
        const settingsMap = {};
        settings.forEach((s) => {
            settingsMap[s.key] = s.value;
        });
        res.json(settingsMap);
    }
    catch (err) {
        res.status(500).json({ error: "Failed to fetch settings." });
    }
});
// PUT /api/settings - Update settings (OWNER/MANAGER only)
router.put("/", auth_1.protect, (0, auth_1.restrictTo)("OWNER", "MANAGER"), async (req, res) => {
    try {
        const { settings } = req.body;
        console.log("Received settings:", settings);
        if (!settings || typeof settings !== "object") {
            return res.status(400).json({ error: "Invalid settings format." });
        }
        // Upsert each setting
        for (const [key, value] of Object.entries(settings)) {
            console.log("Upserting setting:", key, value);
            await prisma.systemSetting.upsert({
                where: { key },
                update: { value: String(value) },
                create: { key, value: String(value) },
            });
        }
        res.json({ message: "Settings updated successfully." });
    }
    catch (err) {
        console.error("Settings update error:", err);
        res.status(500).json({ error: "Failed to update settings.", details: err.message });
    }
});
exports.default = router;
