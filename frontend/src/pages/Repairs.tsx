import React, { useState, useEffect } from "react";
import axios from "axios";
import { useStore } from "../store/useStore";
import {
  Plus,
  Wrench,
  User,
  Clock,
  CheckCircle,
  AlertTriangle,
  FolderOpen
} from "lucide-react";

const COLUMNS = [
  { id: "RECEIVED", name: "Received", color: "border-blue-500/30 text-blue-400 bg-blue-500/5" },
  { id: "DIAGNOSING", name: "Diagnosing", color: "border-purple-500/30 text-purple-400 bg-purple-500/5" },
  { id: "WAITING_PARTS", name: "Waiting Parts", color: "border-rose-500/30 text-rose-400 bg-rose-500/5" },
  { id: "REPAIRING", name: "Repairing", color: "border-amber-500/30 text-amber-400 bg-amber-500/5" },
  { id: "READY", name: "Ready", color: "border-green-500/30 text-green-400 bg-green-500/5" },
  { id: "DELIVERED", name: "Delivered", color: "border-gray-500/30 text-gray-400 bg-gray-500/5" }
];

export default function Repairs() {
  const { addNotification } = useStore();
  const [jobs, setJobs] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);

  // Modals state
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<any | null>(null);

  // Forms state
  const [newJob, setNewJob] = useState({
    deviceName: "", imei: "", serialNumber: "", customerId: "",
    faultDescription: "", technicianId: "", estimatedDelivery: "", notes: ""
  });

  const [updateFields, setUpdateFields] = useState({
    status: "", technicianId: "", faultDescription: "",
    repairCost: 0, serviceCharge: 0, notes: "", partsUsed: [] as any[]
  });

  const [newPartName, setNewPartName] = useState("");
  const [newPartCost, setNewPartCost] = useState("");

  const loadData = async () => {
    try {
      const [jobsRes, staffRes, custRes] = await Promise.all([
        axios.get("/api/repairs"),
        axios.get("/api/auth/users"),
        axios.get("/api/accounting/customers")
      ]);
      setJobs(jobsRes.data);
      // Filter technicians from staff
      setTechnicians(staffRes.data.filter((u: any) => u.role === "TECHNICIAN" || u.role === "OWNER"));
      setCustomers(custRes.data);
    } catch (err) {
      addNotification("Failed to load repairs boards.", "warning");
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newJob.deviceName || !newJob.customerId || !newJob.faultDescription) {
      addNotification("Please fill in the required fields.", "warning");
      return;
    }
    try {
      await axios.post("/api/repairs", newJob);
      addNotification("Repair ticket generated successfully.", "success");
      setCreateOpen(false);
      loadData();
      setNewJob({
        deviceName: "", imei: "", serialNumber: "", customerId: "",
        faultDescription: "", technicianId: "", estimatedDelivery: "", notes: ""
      });
    } catch (err) {
      addNotification("Failed to save repair job.", "warning");
    }
  };

  const handleOpenEdit = (job: any) => {
    setSelectedJob(job);
    setUpdateFields({
      status: job.status,
      technicianId: job.technicianId || "",
      faultDescription: job.faultDescription,
      repairCost: job.repairCost || 0,
      serviceCharge: job.serviceCharge || 0,
      notes: job.notes || "",
      partsUsed: job.partsUsed || []
    });
    setEditOpen(true);
  };

  const handleUpdateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJob) return;

    try {
      await axios.put(`/api/repairs/${selectedJob.id}`, updateFields);
      addNotification("Repair ticket updated.", "success");
      setEditOpen(false);
      setSelectedJob(null);
      loadData();
    } catch (err) {
      addNotification("Failed to update repair.", "warning");
    }
  };

  const handleAddPart = () => {
    if (!newPartName || !newPartCost) return;
    const cost = Number(newPartCost);
    if (isNaN(cost)) return;

    const newPartList = [...updateFields.partsUsed, { name: newPartName, cost, qty: 1 }];
    const totalPartsCost = newPartList.reduce((acc, p) => acc + p.cost, 0);

    setUpdateFields({
      ...updateFields,
      partsUsed: newPartList,
      repairCost: totalPartsCost
    });

    setNewPartName("");
    setNewPartCost("");
  };

  const handleRemovePart = (index: number) => {
    const newPartList = updateFields.partsUsed.filter((_, idx) => idx !== index);
    const totalPartsCost = newPartList.reduce((acc, p) => acc + p.cost, 0);
    setUpdateFields({
      ...updateFields,
      partsUsed: newPartList,
      repairCost: totalPartsCost
    });
  };

  return (
    <div className="space-y-6 flex-1 flex flex-col min-h-0">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card border border-border p-5 rounded-2xl">
        <div>
          <h1 className="text-xl font-black tracking-tight text-foreground">Repairs Board</h1>
          <p className="text-xs text-muted-foreground">Track repair status columns and technician jobs assignment.</p>
        </div>

        <button
          onClick={() => setCreateOpen(true)}
          className="bg-primary hover:bg-primary/95 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition"
        >
          <Plus className="w-4 h-4" /> Create Ticket
        </button>
      </div>

      {/* Kanban Board Container */}
      <div className="flex-1 overflow-x-auto flex gap-4 pb-4 select-none min-h-[400px]">
        {COLUMNS.map((col) => {
          const colJobs = jobs.filter(j => j.status === col.id);
          return (
            <div key={col.id} className="w-72 flex-shrink-0 flex flex-col max-h-full">
              
              {/* Column Header */}
              <div className={`p-3 border border-b-0 rounded-t-2xl font-bold text-xs flex justify-between items-center ${col.color}`}>
                <span>{col.name}</span>
                <span className="bg-card text-[10px] px-2 py-0.5 rounded-lg border border-border font-extrabold">
                  {colJobs.length}
                </span>
              </div>

              {/* Cards List Area */}
              <div className="flex-1 bg-card/40 border border-border rounded-b-2xl p-3 space-y-3 overflow-y-auto min-h-[200px]">
                {colJobs.length === 0 ? (
                  <div className="text-center py-8 text-[10px] text-muted-foreground italic">No tickets.</div>
                ) : (
                  colJobs.map((job) => (
                    <button
                      key={job.id}
                      onClick={() => handleOpenEdit(job)}
                      className="w-full text-left bg-card hover:bg-secondary/40 border border-border hover:border-primary/40 p-4 rounded-xl space-y-3 transition shadow-sm cursor-pointer"
                    >
                      <div className="space-y-1">
                        <span className="text-[10px] text-muted-foreground font-bold tracking-wider block">ID: {job.id.substring(0, 8)}</span>
                        <h4 className="font-extrabold text-xs text-foreground line-clamp-1">{job.deviceName}</h4>
                        <p className="text-[10px] text-muted-foreground line-clamp-2 italic">{job.faultDescription}</p>
                      </div>

                      <div className="border-t border-border/50 pt-2 flex flex-col gap-1 text-[9px] text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5" />
                          <span>Client: {job.customer.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Wrench className="w-3.5 h-3.5" />
                          <span>Tech: {job.technician?.name || "Unassigned"}</span>
                        </div>
                        {job.estimatedDelivery && (
                          <div className="flex items-center gap-1.5 text-amber-500/90">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Due: {new Date(job.estimatedDelivery).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Ticket Modal */}
      {createOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50 px-4 overflow-y-auto">
          <div className="bg-card border border-border w-full max-w-md p-6 rounded-2xl shadow-2xl relative my-8">
            <h3 className="text-base font-bold text-foreground mb-4">Create Repair Ticket</h3>
            <form onSubmit={handleCreateJob} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Device Model *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. iPad Pro 11, Samsung S22"
                  value={newJob.deviceName}
                  onChange={(e) => setNewJob({ ...newJob, deviceName: e.target.value })}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Serial Number</label>
                  <input
                    type="text"
                    value={newJob.serialNumber}
                    onChange={(e) => setNewJob({ ...newJob, serialNumber: e.target.value })}
                    className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">IMEI Number (Phones)</label>
                  <input
                    type="text"
                    value={newJob.imei}
                    onChange={(e) => setNewJob({ ...newJob, imei: e.target.value })}
                    className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Select Customer *</label>
                <select
                  required
                  value={newJob.customerId}
                  onChange={(e) => setNewJob({ ...newJob, customerId: e.target.value })}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                >
                  <option value="">Choose customer...</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Assign Technician</label>
                <select
                  value={newJob.technicianId}
                  onChange={(e) => setNewJob({ ...newJob, technicianId: e.target.value })}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                >
                  <option value="">Leave Unassigned</option>
                  {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Estimated Delivery Date</label>
                <input
                  type="date"
                  value={newJob.estimatedDelivery}
                  onChange={(e) => setNewJob({ ...newJob, estimatedDelivery: e.target.value })}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Fault Description *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Describe hardware/software failures..."
                  value={newJob.faultDescription}
                  onChange={(e) => setNewJob({ ...newJob, faultDescription: e.target.value })}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                />
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="px-4 py-2 border border-border text-xs rounded hover:bg-secondary transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-white text-xs rounded hover:bg-primary/95 transition"
                >
                  Create Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Ticket Modal */}
      {editOpen && selectedJob && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50 px-4 overflow-y-auto">
          <div className="bg-card border border-border w-full max-w-md p-6 rounded-2xl shadow-2xl relative my-8">
            <h3 className="text-base font-bold text-foreground mb-4">Edit Repair Ticket ({selectedJob.deviceName})</h3>
            <form onSubmit={handleUpdateJob} className="space-y-4">
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Status</label>
                  <select
                    value={updateFields.status}
                    onChange={(e) => setUpdateFields({ ...updateFields, status: e.target.value })}
                    className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                  >
                    {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Assigned Tech</label>
                  <select
                    value={updateFields.technicianId}
                    onChange={(e) => setUpdateFields({ ...updateFields, technicianId: e.target.value })}
                    className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                  >
                    <option value="">Unassigned</option>
                    {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Parts Tracker Drawer section */}
              <div className="space-y-2 border border-border p-3 rounded-xl bg-secondary/30">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Spare Parts Used</label>
                <div className="space-y-1 max-h-24 overflow-y-auto text-[10px]">
                  {updateFields.partsUsed.length === 0 ? (
                    <p className="text-muted-foreground italic">No spare parts recorded.</p>
                  ) : (
                    updateFields.partsUsed.map((p, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-card p-1.5 rounded border border-border">
                        <span>{p.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground">Rs. {p.cost}</span>
                          <button
                            type="button"
                            onClick={() => handleRemovePart(idx)}
                            className="text-red-400 hover:text-red-300 font-bold"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Add new part row inputs */}
                <div className="flex gap-2 pt-2 border-t border-border/50">
                  <input
                    type="text"
                    placeholder="Part Name"
                    value={newPartName}
                    onChange={(e) => setNewPartName(e.target.value)}
                    className="flex-1 bg-secondary text-[10px] border border-border px-2 py-1 rounded focus:outline-none"
                  />
                  <input
                    type="number"
                    placeholder="Cost"
                    value={newPartCost}
                    onChange={(e) => setNewPartCost(e.target.value)}
                    className="w-16 bg-secondary text-[10px] border border-border px-2 py-1 rounded focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddPart}
                    className="bg-primary px-2.5 py-1 text-white text-[10px] rounded hover:bg-primary/95"
                  >
                    Add
                  </button>
                </div>
              </div>

               <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Parts Cost (Rs.)</label>
                  <input
                    type="number"
                    readOnly
                    value={updateFields.repairCost}
                    className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs text-muted-foreground focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Service Charge (Rs.)</label>
                  <input
                    type="number"
                    value={updateFields.serviceCharge}
                    onChange={(e) => setUpdateFields({ ...updateFields, serviceCharge: Number(e.target.value) })}
                    className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Fault Description</label>
                <textarea
                  rows={2}
                  value={updateFields.faultDescription}
                  onChange={(e) => setUpdateFields({ ...updateFields, faultDescription: e.target.value })}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Notes / Diagnostic Updates</label>
                <textarea
                  rows={2}
                  value={updateFields.notes}
                  onChange={(e) => setUpdateFields({ ...updateFields, notes: e.target.value })}
                  className="w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
                />
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => { setEditOpen(false); setSelectedJob(null); }}
                  className="px-4 py-2 border border-border text-xs rounded hover:bg-secondary transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-white text-xs rounded hover:bg-primary/95 transition"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
