import { Router } from "express";
import prisma from "../utils/db";
import { protect, restrictTo } from "../middleware/auth";

const router = Router();

// Create a Repair Job
router.post("/", protect, restrictTo("OWNER", "MANAGER", "CASHIER", "TECHNICIAN"), async (req, res) => {
  const { deviceName, imei, serialNumber, customerId, faultDescription, technicianId, estimatedDelivery, notes } = req.body;

  if (!deviceName || !customerId || !faultDescription) {
    return res.status(400).json({ error: "Device name, customer profile, and fault description are required." });
  }

  try {
    const job = await prisma.repairJob.create({
      data: {
        deviceName,
        imei: imei || null,
        serialNumber: serialNumber || null,
        customerId,
        faultDescription,
        technicianId: technicianId || null,
        status: "RECEIVED",
        estimatedDelivery: estimatedDelivery ? new Date(estimatedDelivery) : null,
        notes: notes || null,
        partsUsed: JSON.stringify([]),
        photos: JSON.stringify([])
      },
      include: {
        customer: true,
        technician: true
      }
    });
    return res.status(201).json(job);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to create repair ticket." });
  }
});

// List Repair Jobs
router.get("/", protect, async (req, res) => {
  const { status, technicianId, customerId } = req.query;
  try {
    const where: any = {};
    if (status) where.status = String(status);
    if (technicianId) where.technicianId = String(technicianId);
    if (customerId) where.customerId = String(customerId);

    const jobs = await prisma.repairJob.findMany({
      where,
      include: {
        customer: true,
        technician: true
      },
      orderBy: { createdAt: "desc" }
    });

    // Parse JSON fields
    const parsedJobs = jobs.map(j => ({
      ...j,
      partsUsed: j.partsUsed ? JSON.parse(j.partsUsed) : [],
      photos: j.photos ? JSON.parse(j.photos) : []
    }));

    return res.json(parsedJobs);
  } catch (error) {
    return res.status(500).json({ error: "Failed to load repair list." });
  }
});

// Fetch Single Repair Ticket Details
router.get("/:id", protect, async (req, res) => {
  const { id } = req.params;
  try {
    const job = await prisma.repairJob.findUnique({
      where: { id },
      include: {
        customer: true,
        technician: true
      }
    });

    if (!job) return res.status(404).json({ error: "Repair ticket not found." });

    return res.json({
      ...job,
      partsUsed: job.partsUsed ? JSON.parse(job.partsUsed) : [],
      photos: job.photos ? JSON.parse(job.photos) : []
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to load repair ticket details." });
  }
});

// Update Repair Job Details & Status
router.put("/:id", protect, restrictTo("OWNER", "MANAGER", "TECHNICIAN"), async (req, res) => {
  const { id } = req.params;
  const { status, technicianId, faultDescription, partsUsed, repairCost, serviceCharge, estimatedDelivery, notes } = req.body;

  try {
    const data: any = {};
    if (status) data.status = status;
    if (technicianId !== undefined) data.technicianId = technicianId || null;
    if (faultDescription) data.faultDescription = faultDescription;
    if (partsUsed) data.partsUsed = JSON.stringify(partsUsed); // expected array
    if (repairCost !== undefined) data.repairCost = Number(repairCost);
    if (serviceCharge !== undefined) data.serviceCharge = Number(serviceCharge);
    if (estimatedDelivery) data.estimatedDelivery = new Date(estimatedDelivery);
    if (notes !== undefined) data.notes = notes;

    const updated = await prisma.repairJob.update({
      where: { id },
      data,
      include: { customer: true, technician: true }
    });

    return res.json({
      ...updated,
      partsUsed: updated.partsUsed ? JSON.parse(updated.partsUsed) : [],
      photos: updated.photos ? JSON.parse(updated.photos) : []
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to update repair ticket." });
  }
});

// ==================== WARRANTY CLAIM ROUTES ====================

// File a Warranty Claim
router.post("/warranty-claims", protect, async (req, res) => {
  const { saleId, productId, notes } = req.body;
  if (!saleId || !productId) {
    return res.status(400).json({ error: "Sale ID and Product ID are required." });
  }

  try {
    const claim = await prisma.warrantyClaim.create({
      data: {
        saleId,
        productId,
        status: "PENDING",
        notes
      },
      include: {
        sale: { include: { customer: true } }
      }
    });
    return res.status(201).json(claim);
  } catch (error) {
    return res.status(500).json({ error: "Failed to submit warranty claim." });
  }
});

// List Warranty Claims
router.get("/warranty-claims", protect, async (req, res) => {
  try {
    const claims = await prisma.warrantyClaim.findMany({
      include: {
        sale: { include: { customer: true } }
      },
      orderBy: { claimDate: "desc" }
    });
    return res.json(claims);
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch warranty claims." });
  }
});

// Update Warranty Claim Status
router.put("/warranty-claims/:id", protect, restrictTo("OWNER", "MANAGER", "TECHNICIAN"), async (req, res) => {
  const { id } = req.params;
  const { status, resolutionDetails, notes } = req.body;

  try {
    const updated = await prisma.warrantyClaim.update({
      where: { id },
      data: {
        status,
        resolutionDetails,
        notes
      }
    });
    return res.json(updated);
  } catch (error) {
    return res.status(500).json({ error: "Failed to update warranty claim." });
  }
});

export default router;
