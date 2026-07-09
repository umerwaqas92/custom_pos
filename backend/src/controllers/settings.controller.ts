import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { protect, restrictTo } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

// GET /api/settings - Fetch all settings
router.get("/", protect, async (req: Request, res: Response) => {
  try {
    const settings = await prisma.systemSetting.findMany();
    const settingsMap: Record<string, string> = {};
    settings.forEach((s) => {
      settingsMap[s.key] = s.value;
    });
    res.json(settingsMap);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch settings." });
  }
});

// PUT /api/settings - Update settings (OWNER/MANAGER only)
router.put("/", protect, restrictTo("OWNER", "MANAGER"), async (req: Request, res: Response) => {
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
  } catch (err: any) {
    console.error("Settings update error:", err);
    res.status(500).json({ error: "Failed to update settings.", details: err.message });
  }
});

export default router;
