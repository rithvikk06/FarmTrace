import React, { useState, useEffect } from "react";
import { useConnection, useAnchorWallet, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { AnchorProvider, Program, web3, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';

const PROGRAM_ID = new PublicKey("3JrzoVQatJZz6kAeX7T47SfbRnesm3HfU1BBKxcFKkxx");
const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const SYSVAR_RENT_PUBKEY = new PublicKey('SysvarRent111111111111111111111111111111111');

const commodityOptions = [
  "Cocoa", "Coffee", "PalmOil", "Soy", "Cattle", "Rubber", "Timber"
] as const;
type Commodity = typeof commodityOptions[number];

const batchStatusOptions = ["Harvested", "Processing", "InTransit", "Delivered"] as const;
type BatchStatus = typeof batchStatusOptions[number];

// PDA helpers
function farmPlotPDA(plotId: string, farmerPubkey: PublicKey) {
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from("farm_plot"), Buffer.from(plotId), farmerPubkey.toBuffer()],
    PROGRAM_ID
  );
}

function mintPDA(plotId: string, farmerPubkey: PublicKey) {
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from("mint"), Buffer.from(plotId), farmerPubkey.toBuffer()],
    PROGRAM_ID
  );
}

function metadataPDA(mint: PublicKey) {
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    METADATA_PROGRAM_ID
  );
}

function harvestBatchPDA(batchId: string, farmerPubkey: PublicKey) {
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from("harvest_batch"), Buffer.from(batchId), farmerPubkey.toBuffer()],
    PROGRAM_ID
  );
}

function verificationPDA(farmPlotKey: PublicKey, verifierKey: PublicKey, timestamp: number) {
  return web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("verification"),
      farmPlotKey.toBuffer(),
      verifierKey.toBuffer(),
      Buffer.from(new BN(timestamp).toArray("le", 8))
    ],
    PROGRAM_ID
  );
}

// Convert commodity to Rust enum format
function commodityToEnum(commodity: Commodity) {
  const map: Record<Commodity, string> = {
    "Cocoa": "cocoa",
    "Coffee": "coffee",
    "PalmOil": "palmOil",
    "Soy": "soy",
    "Cattle": "cattle",
    "Rubber": "rubber",
    "Timber": "timber"
  };
  return { [map[commodity]]: {} };
}

// Convert batch status to Rust enum format
function statusToEnum(status: BatchStatus) {
  const map: Record<BatchStatus, string> = {
    "Harvested": "harvested",
    "Processing": "processing",
    "InTransit": "inTransit",
    "Delivered": "delivered"
  };
  return { [map[status]]: {} };
}

type Page = "dashboard" | "register-plot" | "plot-details" | "register-batch" | "batch-details" | "update-status" | "verify-satellite";

interface FarmPlot {
  plotId: string;
  farmerName: string;
  location: string;
  coordinates: string;
  areaHectares: number;
  commodity: Commodity;
  pda: string;
  mint?: string;
}

interface HarvestBatch {
  batchId: string;
  weightKg: number;
  harvestTimestamp: number;
  status: string;
  destination: string;
  pda: string;
}

interface BatchUpdate {
  timestamp: number;
  status: string;
  destination: string;
  type: "status" | "verification";
  verificationHash?: string;
  noDeforestation?: boolean;
}

export default function FarmTraceApp() {
  const wallet = useAnchorWallet();
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const [program, setProgram] = useState<Program | null>(null);
  
  // Navigation
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [selectedPlot, setSelectedPlot] = useState<FarmPlot | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<HarvestBatch | null>(null);
  
  // Data
  const [farmPlots, setFarmPlots] = useState<FarmPlot[]>([]);
  const [harvestBatches, setHarvestBatches] = useState<HarvestBatch[]>([]);
  const [batchUpdates, setBatchUpdates] = useState<BatchUpdate[]>([]);
  const [ddsReport, setDdsReport] = useState<any | null>(null);
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initialize program
  useEffect(() => {
    const initProgram = async () => {
      if (wallet && connection) {
        try {
          const provider = new AnchorProvider(connection, wallet, {
            commitment: "confirmed",
            preflightCommitment: "confirmed"
          });
          const prog = await Program.at(PROGRAM_ID, provider);
          setProgram(prog);
        } catch (err) {
          console.error("Error creating program:", err);
        }
      }
    };
    initProgram();
  }, [wallet, connection]);

  // Load farm plots when wallet connects
  useEffect(() => {
    if (program && publicKey) {
      loadFarmPlots();
    }
  }, [program, publicKey]);

  const loadFarmPlots = async () => {
    if (!program || !publicKey) return;
    
    try {
      // Fetch ALL farm plots first, then filter in JavaScript
      const allPlots = await program.account.farmPlot.all();
      
      console.log("All plots fetched:", allPlots.length);
      
      // Filter for plots owned by the current user
      const userPlots = allPlots.filter((p: any) => {
        try {
          return p.account.farmer.toString() === publicKey.toString();
        } catch (err) {
          console.error("Error filtering plot:", err);
          return false;
        }
      });

      console.log("User plots:", userPlots.length);

      setFarmPlots(userPlots.map((p: any) => {
        console.log("Processing plot:", p.account);
        return {
          plotId: p.account.plotId || "",
          farmerName: p.account.farmerName || "",
          location: p.account.location || "",
          coordinates: p.account.coordinates || "",
          areaHectares: p.account.areaHectares || 0,
          commodity: parseCommodity(p.account.commodityType),
          pda: p.publicKey.toString(),
          mint: p.account.mint ? p.account.mint.toString() : ""
        };
      }));
    } catch (err) {
      console.error("Error loading farm plots:", err);
      setFarmPlots([]); // Set empty array on error
    }
  };

  const loadHarvestBatches = async (plot: FarmPlot) => {
    if (!program || !publicKey) return;
    
    try {
      const [plotPDA] = farmPlotPDA(plot.plotId, publicKey);
      
      // Fetch all batches and filter in JavaScript
      const allBatches = await program.account.harvestBatch.all();
      
      // Filter for batches linked to this farm plot
      const plotBatches = allBatches.filter((b: any) => 
        b.account.farmPlot.toString() === plotPDA.toString()
      );

      setHarvestBatches(plotBatches.map((b: any) => ({
        batchId: b.account.batchId,
        weightKg: b.account.weightKg.toNumber(),
        harvestTimestamp: b.account.harvestTimestamp.toNumber(),
        status: parseStatus(b.account.status),
        destination: b.account.destination,
        pda: b.publicKey.toString()
      })));
    } catch (err) {
      console.error("Error loading harvest batches:", err);
      setHarvestBatches([]);
    }
  };

  const loadBatchUpdates = async (batch: HarvestBatch, plot: FarmPlot) => {
    if (!program || !publicKey) return;
    
    const updates: BatchUpdate[] = [];
    
    // Add initial harvest as first update
    updates.push({
      timestamp: batch.harvestTimestamp,
      status: "Harvested",
      destination: "",
      type: "status"
    });
    
    try {
      // Fetch the current batch account to get current status
      const [batchPDA] = harvestBatchPDA(batch.batchId, publicKey);
      const batchAccount = await program.account.harvestBatch.fetch(batchPDA);
      
      // Get current status from batch account
      const currentStatus = parseStatus(batchAccount.status);
      
      // Try to fetch batch status updates if they exist
      try {
        // First check if the account type exists
        if (program.account.batchStatusUpdate) {
          const allBatchUpdates = await program.account.batchStatusUpdate.all();
          
          // Filter for updates related to this specific batch
          const batchUpdates = allBatchUpdates.filter((update: any) => 
            update.account.batchId === batch.batchId
          );
          
          // Add each batch status update to the timeline
          batchUpdates.forEach((update: any) => {
            updates.push({
              timestamp: update.account.timestamp.toNumber(),
              status: parseStatus(update.account.status),
              destination: update.account.destination || "",
              type: "status"
            });
          });
        } else {
          // If batchStatusUpdate account doesn't exist, check for events
          console.log("batchStatusUpdate account type not found in IDL");
          
          // Fallback: If current status is different from Harvested, add it
          if (currentStatus !== "Harvested") {
            updates.push({
              timestamp: batch.harvestTimestamp + 1,
              status: currentStatus,
              destination: batchAccount.destination || "",
              type: "status"
            });
          }
        }
      } catch (err) {
        console.log("Error fetching batch status updates:", err);
        // Fallback: If current status is different from Harvested, add it
        if (currentStatus !== "Harvested") {
          updates.push({
            timestamp: batch.harvestTimestamp + 1,
            status: currentStatus,
            destination: batchAccount.destination || "",
            type: "status"
          });
        }
      }
      
      // Fetch all verification records for this farm plot
      const [farmPDA] = farmPlotPDA(plot.plotId, publicKey);
      const allVerifications = await program.account.satelliteVerification.all();
      
      // Filter verifications for this farm plot
      const plotVerifications = allVerifications.filter((v: any) => 
        v.account.farmPlot.toString() === farmPDA.toString()
      );
      
      // Add verification updates
      plotVerifications.forEach((v: any) => {
        updates.push({
          timestamp: v.account.verificationTimestamp.toNumber(),
          status: "",
          destination: "",
          type: "verification",
          verificationHash: v.account.verificationHash,
          noDeforestation: v.account.noDeforestation
        });
      });
      
      // Sort by timestamp
      updates.sort((a, b) => a.timestamp - b.timestamp);
      
      setBatchUpdates(updates);
    } catch (err) {
      console.error("Error loading batch updates:", err);
      // Even on error, show at least the harvest event
      setBatchUpdates(updates);
    }
  };

  const parseCommodity = (type: any): Commodity => {
    if (type.cocoa) return "Cocoa";
    if (type.coffee) return "Coffee";
    if (type.palmOil) return "PalmOil";
    if (type.soy) return "Soy";
    if (type.cattle) return "Cattle";
    if (type.rubber) return "Rubber";
    if (type.timber) return "Timber";
    return "Cocoa";
  };

  const parseStatus = (status: any): string => {
    if (status.harvested) return "Harvested";
    if (status.processing) return "Processing";
    if (status.inTransit) return "In Transit";
    if (status.delivered) return "Delivered";
    return "Unknown";
  };

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 5000);
  };

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 5000);
  };

  if (!publicKey) {
    return (
      <div className="w-full min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
            FarmTrace
          </h1>
          <p className="text-slate-400 mb-8 max-w-md">
            EUDR Compliance Dashboard for Supply Chain Transparency
          </p>
          <WalletMultiButton />
        </div>
      </div>
    );
  }

  if (!program) {
    return (
      <div className="w-full min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-6">
        <h1 className="text-3xl font-bold mb-4 text-red-400">Error Loading Program</h1>
        <p className="text-slate-400 mb-6">Failed to initialize Anchor program</p>
        <WalletMultiButton />
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      <Header publicKey={publicKey} />
      
      {successMsg && (
        <div className="mx-8 mt-8 p-4 rounded-lg border bg-green-900/20 border-green-700 text-green-400">
          <p className="text-sm">{successMsg}</p>
        </div>
      )}
      
      {errorMsg && (
        <div className="mx-8 mt-8 p-4 rounded-lg border bg-red-900/20 border-red-700 text-red-400">
          <p className="text-sm">{errorMsg}</p>
        </div>
      )}

      {currentPage === "dashboard" && (
        <DashboardPage
          farmPlots={farmPlots}
          onRegisterPlot={() => setCurrentPage("register-plot")}
          onSelectPlot={(plot) => {
            setSelectedPlot(plot);
            loadHarvestBatches(plot);
            setCurrentPage("plot-details");
          }}
        />
      )}

      {currentPage === "register-plot" && (
        <RegisterPlotPage
          program={program}
          publicKey={publicKey}
          loading={loading}
          setLoading={setLoading}
          onSuccess={(plot) => {
            setFarmPlots([...farmPlots, plot]);
            showSuccess("Farm plot registered successfully!");
            setCurrentPage("dashboard");
          }}
          onError={showError}
          onCancel={() => setCurrentPage("dashboard")}
        />
      )}

      {currentPage === "plot-details" && selectedPlot && (
        <PlotDetailsPage
          plot={selectedPlot}
          batches={harvestBatches}
          onBack={() => setCurrentPage("dashboard")}
          onRegisterBatch={() => setCurrentPage("register-batch")}
          onSelectBatch={(batch) => {
            setSelectedBatch(batch);
            loadBatchUpdates(batch, selectedPlot);
            setDdsReport(null);
            setCurrentPage("batch-details");
          }}
        />
      )}

      {currentPage === "register-batch" && selectedPlot && (
        <RegisterBatchPage
          plot={selectedPlot}
          program={program}
          publicKey={publicKey}
          loading={loading}
          setLoading={setLoading}
          onSuccess={(batch) => {
            setHarvestBatches([...harvestBatches, batch]);
            showSuccess("Harvest batch registered successfully!");
            setCurrentPage("plot-details");
          }}
          onError={showError}
          onCancel={() => setCurrentPage("plot-details")}
        />
      )}

      {currentPage === "batch-details" && selectedBatch && selectedPlot && (
        <BatchDetailsPage
          plot={selectedPlot}
          batch={selectedBatch}
          updates={batchUpdates}
          onBack={() => setCurrentPage("plot-details")}
          onAddUpdate={() => setCurrentPage("update-status")}
          onAddVerification={() => setCurrentPage("verify-satellite")}
          onGenerateDDS={async () => {
            setLoading(true);
            try {
              const [batchPDA] = harvestBatchPDA(selectedBatch.batchId, publicKey);
              const [farmPDA] = farmPlotPDA(selectedPlot.plotId, publicKey);

              const dds: any = await program.methods
                .generateDdsData()
                .accounts({
                  harvestBatch: batchPDA,
                  farmPlot: farmPDA,
                })
                .view();

              setDdsReport(dds);
              showSuccess("DDS report generated successfully!");
            } catch (err: any) {
              console.error("generateDDS error:", err);
              showError(err?.message || "Failed to generate DDS report");
            } finally {
              setLoading(false);
            }
          }}
          ddsReport={ddsReport}
          loading={loading}
        />
      )}

      {currentPage === "update-status" && selectedBatch && selectedPlot && (
        <UpdateStatusPage
          batch={selectedBatch}
          plot={selectedPlot}
          program={program}
          publicKey={publicKey}
          loading={loading}
          setLoading={setLoading}
          onSuccess={(update) => {
            setBatchUpdates([...batchUpdates, update]);
            showSuccess("Batch status updated successfully!");
            setCurrentPage("batch-details");
          }}
          onError={showError}
          onCancel={() => setCurrentPage("batch-details")}
        />
      )}

      {currentPage === "verify-satellite" && selectedBatch && selectedPlot && (
        <VerifySatellitePage
          batch={selectedBatch}
          plot={selectedPlot}
          program={program}
          publicKey={publicKey}
          loading={loading}
          setLoading={setLoading}
          onSuccess={(update) => {
            setBatchUpdates([...batchUpdates, update]);
            showSuccess("Satellite verification recorded successfully!");
            setCurrentPage("batch-details");
          }}
          onError={showError}
          onCancel={() => setCurrentPage("batch-details")}
        />
      )}
    </div>
  );
}

function Header({ publicKey }: { publicKey: PublicKey }) {
  return (
    <header className="flex items-center justify-between p-8 pb-6 border-b border-slate-700">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
          FarmTrace
        </h1>
        <p className="text-sm text-slate-400 mt-1">EUDR Compliance Dashboard</p>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-xs font-mono bg-slate-800 px-3 py-2 rounded border border-slate-700">
          {publicKey.toBase58().slice(0, 8)}...
        </div>
        <WalletMultiButton />
      </div>
    </header>
  );
}

function DashboardPage({ 
  farmPlots, 
  onRegisterPlot, 
  onSelectPlot 
}: { 
  farmPlots: FarmPlot[];
  onRegisterPlot: () => void;
  onSelectPlot: (plot: FarmPlot) => void;
}) {
  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-slate-200">Your Farm Plots</h2>
        <button
          onClick={onRegisterPlot}
          className="px-6 py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition-colors flex items-center gap-2"
        >
          <span>+</span>
          Register New Plot
        </button>
      </div>

      {farmPlots.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🌱</div>
          <h3 className="text-xl font-semibold text-slate-300 mb-2">No Farm Plots Yet</h3>
          <p className="text-slate-400 mb-6">Get started by registering your first farm plot</p>
          <button
            onClick={onRegisterPlot}
            className="px-6 py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition-colors"
          >
            Register Farm Plot
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {farmPlots.map((plot, idx) => (
            <button
              key={idx}
              onClick={() => onSelectPlot(plot)}
              className="p-6 bg-slate-800 border border-slate-700 rounded-lg hover:border-green-500 transition-all text-left"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-lg font-semibold text-green-400">{plot.plotId}</h3>
                <span className="text-2xl">📍</span>
              </div>
              <p className="text-sm text-slate-300 mb-1">{plot.farmerName}</p>
              <p className="text-xs text-slate-400 mb-2">{plot.location}</p>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{plot.areaHectares} hectares</span>
                <span className="px-2 py-1 bg-slate-900 rounded">{plot.commodity}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RegisterPlotPage({
  program,
  publicKey,
  loading,
  setLoading,
  onSuccess,
  onError,
  onCancel
}: {
  program: Program;
  publicKey: PublicKey;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  onSuccess: (plot: FarmPlot) => void;
  onError: (msg: string) => void;
  onCancel: () => void;
}) {
  const [plotId, setPlotId] = useState("");
  const [farmerName, setFarmerName] = useState("");
  const [location, setLocation] = useState("");
  const [coordinates, setCoordinates] = useState("");
  const [areaHectares, setAreaHectares] = useState<number | "">("");
  const [commodity, setCommodity] = useState<Commodity>("Cocoa");

  const handleSubmit = async () => {
    if (!plotId || !farmerName || !location || !coordinates || !areaHectares) {
      onError("Please fill in all fields");
      return;
    }

    setLoading(true);
    try {
      const [farmPDA] = farmPlotPDA(plotId, publicKey);
      const [mint] = mintPDA(plotId, publicKey);
      const [metadata] = metadataPDA(mint);
      const tokenAccount = await getAssociatedTokenAddress(mint, publicKey);
      
      const regTimestamp = Math.floor(Date.now() / 1000);

      const tx = await program.methods
        .registerFarmPlot(
          plotId,
          farmerName,
          location,
          coordinates,
          areaHectares as number,
          commodityToEnum(commodity),
          new BN(regTimestamp)
        )
        .accounts({
          farmPlot: farmPDA,
          mint: mint,
          tokenAccount: tokenAccount,
          metadata: metadata,
          farmer: publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          metadataProgram: METADATA_PROGRAM_ID, // ← ADD THIS!
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      console.log("Transaction signature:", tx);
      
      onSuccess({
        plotId,
        farmerName,
        location,
        coordinates,
        areaHectares: areaHectares as number,
        commodity,
        pda: farmPDA.toString(),
        mint: mint.toString()
      });
    } catch (err: any) {
      console.error("registerFarmPlot error:", err);
      onError(err?.message || "Failed to register farm plot");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <button
        onClick={onCancel}
        className="mb-6 text-slate-400 hover:text-white transition-colors flex items-center gap-2"
      >
        <span>←</span> Back to Dashboard
      </button>

      <div className="p-8 bg-slate-800 border border-slate-700 rounded-lg">
        <h2 className="text-2xl font-semibold mb-6 text-green-400">📍 Register Farm Plot</h2>

        <input 
          className="w-full mb-4 p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500" 
          placeholder="Plot ID (e.g., PLOT-001)" 
          value={plotId} 
          onChange={(e) => setPlotId(e.target.value)} 
        />
        
        <input 
          className="w-full mb-4 p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500" 
          placeholder="Farmer Name" 
          value={farmerName} 
          onChange={(e) => setFarmerName(e.target.value)} 
        />
        
        <input 
          className="w-full mb-4 p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500" 
          placeholder="Location (e.g., Côte d'Ivoire)" 
          value={location} 
          onChange={(e) => setLocation(e.target.value)} 
        />
        
        <input 
          className="w-full mb-4 p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500" 
          placeholder="Coordinates (e.g., 5.3599,-4.0083)" 
          value={coordinates} 
          onChange={(e) => setCoordinates(e.target.value)} 
        />
        
        <input 
          type="number" 
          className="w-full mb-4 p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500" 
          placeholder="Area (hectares)" 
          value={areaHectares as any} 
          onChange={(e) => setAreaHectares(e.target.value === "" ? "" : Number(e.target.value))} 
        />

        <select 
          className="w-full mb-6 p-3 bg-slate-900 border border-slate-700 rounded text-white" 
          value={commodity} 
          onChange={(e) => setCommodity(e.target.value as Commodity)}
        >
          {commodityOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <div className="flex gap-3">
          <button 
            onClick={onCancel}
            className="flex-1 px-4 py-3 rounded bg-slate-700 hover:bg-slate-600 text-white font-medium transition-colors"
          >
            Cancel
          </button>
          <button 
            disabled={loading} 
            onClick={handleSubmit} 
            className="flex-1 px-4 py-3 rounded bg-green-600 hover:bg-green-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Registering..." : "Register Plot"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PlotDetailsPage({
  plot,
  batches,
  onBack,
  onRegisterBatch,
  onSelectBatch
}: {
  plot: FarmPlot;
  batches: HarvestBatch[];
  onBack: () => void;
  onRegisterBatch: () => void;
  onSelectBatch: (batch: HarvestBatch) => void;
}) {
  return (
    <div className="p-8">
      <button
        onClick={onBack}
        className="mb-6 text-slate-400 hover:text-white transition-colors flex items-center gap-2"
      >
        <span>←</span> Back to Dashboard
      </button>

      <div className="mb-6 p-6 bg-slate-800 border border-slate-700 rounded-lg">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-green-400 mb-2">{plot.plotId}</h2>
            <p className="text-slate-300 mb-1">{plot.farmerName}</p>
            <p className="text-sm text-slate-400 mb-2">{plot.location}</p>
            <p className="text-xs text-slate-500">{plot.coordinates}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-400">Area</p>
            <p className="text-xl font-semibold text-white">{plot.areaHectares} ha</p>
            <p className="text-xs text-slate-500 mt-2 px-3 py-1 bg-slate-900 rounded">{plot.commodity}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-semibold text-slate-200">Harvest Batches</h3>
        <button
          onClick={onRegisterBatch}
          className="px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors flex items-center gap-2"
        >
          <span>+</span>
          Register New Batch
        </button>
      </div>

      {batches.length === 0 ? (
        <div className="text-center py-16 bg-slate-800 border border-slate-700 rounded-lg">
          <div className="text-6xl mb-4">📦</div>
          <h3 className="text-xl font-semibold text-slate-300 mb-2">No Harvest Batches Yet</h3>
          <p className="text-slate-400 mb-6">Register your first harvest batch for this plot</p>
          <button
            onClick={onRegisterBatch}
            className="px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
          >
            Register Batch
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {batches.map((batch, idx) => (
            <button
              key={idx}
              onClick={() => onSelectBatch(batch)}
              className="p-6 bg-slate-800 border border-slate-700 rounded-lg hover:border-blue-500 transition-all text-left"
            >
              <div className="flex items-start justify-between mb-3">
                <h4 className="text-lg font-semibold text-blue-400">{batch.batchId}</h4>
                <span className="text-2xl">📦</span>
              </div>
              <p className="text-sm text-slate-300 mb-2">{batch.weightKg} kg</p>
              <p className="text-xs text-slate-400 mb-2">
                {new Date(batch.harvestTimestamp * 1000).toLocaleDateString()}
              </p>
              <div className="flex items-center justify-between text-xs">
                <span className="px-2 py-1 bg-slate-900 rounded text-slate-400">{batch.status}</span>
                {batch.destination && (
                  <span className="text-slate-500">{batch.destination}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RegisterBatchPage({
  plot,
  program,
  publicKey,
  loading,
  setLoading,
  onSuccess,
  onError,
  onCancel
}: {
  plot: FarmPlot;
  program: Program;
  publicKey: PublicKey;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  onSuccess: (batch: HarvestBatch) => void;
  onError: (msg: string) => void;
  onCancel: () => void;
}) {
  const [batchId, setBatchId] = useState("");
  const [batchWeight, setBatchWeight] = useState<number | "">("");

  const handleSubmit = async () => {
    if (!batchId || !batchWeight) {
      onError("Please fill in all fields");
      return;
    }

    setLoading(true);
    try {
      const [farmPDA] = farmPlotPDA(plot.plotId, publicKey);
      const [batchPDA] = harvestBatchPDA(batchId, publicKey);
      const harvestTimestamp = Math.floor(Date.now() / 1000);

      const tx = await program.methods
        .registerHarvestBatch(
          batchId,
          new BN(batchWeight as number),
          new BN(harvestTimestamp)
        )
        .accounts({
          harvestBatch: batchPDA,
          farmPlot: farmPDA,
          farmer: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("Transaction signature:", tx);
      
      onSuccess({
        batchId,
        weightKg: batchWeight as number,
        harvestTimestamp,
        status: "Harvested",
        destination: "",
        pda: batchPDA.toString()
      });
    } catch (err: any) {
      console.error("registerHarvestBatch error:", err);
      onError(err?.message || "Failed to register harvest batch");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <button
        onClick={onCancel}
        className="mb-6 text-slate-400 hover:text-white transition-colors flex items-center gap-2"
      >
        <span>←</span> Back to {plot.plotId}
      </button>

      <div className="p-8 bg-slate-800 border border-slate-700 rounded-lg">
        <h2 className="text-2xl font-semibold mb-2 text-blue-400">📦 Register Harvest Batch</h2>
        <p className="text-sm text-slate-400 mb-6">For plot: {plot.plotId}</p>

        <input 
          className="w-full mb-4 p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500" 
          placeholder="Batch ID (e.g., BATCH-001)" 
          value={batchId} 
          onChange={(e) => setBatchId(e.target.value)} 
        />
        
        <input 
          type="number" 
          className="w-full mb-6 p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500" 
          placeholder="Weight (kg)" 
          value={batchWeight as any} 
          onChange={(e) => setBatchWeight(e.target.value === "" ? "" : Number(e.target.value))} 
        />

        <div className="flex gap-3">
          <button 
            onClick={onCancel}
            className="flex-1 px-4 py-3 rounded bg-slate-700 hover:bg-slate-600 text-white font-medium transition-colors"
          >
            Cancel
          </button>
          <button 
            disabled={loading} 
            onClick={handleSubmit} 
            className="flex-1 px-4 py-3 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Registering..." : "Register Batch"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BatchDetailsPage({
  plot,
  batch,
  updates,
  onBack,
  onAddUpdate,
  onAddVerification,
  onGenerateDDS,
  ddsReport,
  loading
}: {
  plot: FarmPlot;
  batch: HarvestBatch;
  updates: BatchUpdate[];
  onBack: () => void;
  onAddUpdate: () => void;
  onAddVerification: () => void;
  onGenerateDDS: () => void;
  ddsReport: any;
  loading: boolean;
}) {
  return (
    <div className="p-8">
      <button
        onClick={onBack}
        className="mb-6 text-slate-400 hover:text-white transition-colors flex items-center gap-2"
      >
        <span>←</span> Back to {plot.plotId}
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 p-6 bg-slate-800 border border-slate-700 rounded-lg">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-2xl font-semibold text-blue-400 mb-1">{batch.batchId}</h2>
              <p className="text-sm text-slate-400">Plot: {plot.plotId}</p>
            </div>
            <span className="text-4xl">📦</span>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500 mb-1">Weight</p>
              <p className="text-lg font-semibold text-white">{batch.weightKg} kg</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Harvest Date</p>
              <p className="text-lg font-semibold text-white">
                {new Date(batch.harvestTimestamp * 1000).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Current Status</p>
              <p className="text-sm px-3 py-1 bg-slate-900 rounded inline-block">{batch.status}</p>
            </div>
            {batch.destination && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Destination</p>
                <p className="text-sm text-slate-300">{batch.destination}</p>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 bg-slate-800 border border-slate-700 rounded-lg">
          <h3 className="text-lg font-semibold text-slate-200 mb-4">Actions</h3>
          <div className="space-y-3">
            <button
              onClick={onAddUpdate}
              className="w-full px-4 py-3 rounded bg-purple-600 hover:bg-purple-700 text-white font-medium transition-colors flex items-center justify-center gap-2"
            >
              <span>🔄</span>
              Update Status
            </button>
            <button
              onClick={onAddVerification}
              className="w-full px-4 py-3 rounded bg-yellow-600 hover:bg-yellow-700 text-white font-medium transition-colors flex items-center justify-center gap-2"
            >
              <span>🛰️</span>
              Add Verification
            </button>
            <button
              onClick={onGenerateDDS}
              disabled={loading}
              className="w-full px-4 py-3 rounded bg-green-600 hover:bg-green-700 text-white font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <span>📄</span>
              {loading ? "Generating..." : "Generate DDS"}
            </button>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <h3 className="text-xl font-semibold text-slate-200 mb-4">Update Timeline</h3>
        {updates.length === 0 ? (
          <div className="p-6 bg-slate-800 border border-slate-700 rounded-lg text-center text-slate-400">
            No updates recorded yet
          </div>
        ) : (
          <div className="space-y-3">
            {updates.slice().reverse().map((update, idx) => (
              <div
                key={idx}
                className="p-4 bg-slate-800 border border-slate-700 rounded-lg"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xl">
                        {update.type === "verification" ? "🛰️" : "🔄"}
                      </span>
                      <div>
                        <p className="font-semibold text-slate-200">
                          {update.type === "verification" ? "Satellite Verification" : "Status Update"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(update.timestamp * 1000).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    
                    {update.type === "status" ? (
                      <div className="ml-9">
                        <p className="text-sm text-slate-300 mb-1">
                          Status: <span className="px-2 py-1 bg-slate-900 rounded text-xs">{update.status}</span>
                        </p>
                        {update.destination && (
                          <p className="text-sm text-slate-400">Destination: {update.destination}</p>
                        )}
                      </div>
                    ) : (
                      <div className="ml-9">
                        <p className="text-sm text-slate-300 mb-1">
                          Deforestation Check: {" "}
                          <span className={`px-2 py-1 rounded text-xs ${
                            update.noDeforestation 
                              ? "bg-green-900/30 text-green-400" 
                              : "bg-red-900/30 text-red-400"
                          }`}>
                            {update.noDeforestation ? "✓ Passed" : "✗ Failed"}
                          </span>
                        </p>
                        {update.verificationHash && (
                          <p className="text-xs text-slate-500 font-mono">
                            Hash: {update.verificationHash.slice(0, 16)}...
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {ddsReport && (
        <div className="p-6 bg-slate-800 border border-green-700 rounded-lg">
          <h3 className="text-xl font-semibold text-green-400 mb-4">📄 Due Diligence Statement</h3>
          <pre className="p-4 bg-slate-900 rounded text-xs overflow-auto max-h-96 border border-slate-700 text-slate-300">
            {JSON.stringify(ddsReport, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function UpdateStatusPage({
  batch,
  plot,
  program,
  publicKey,
  loading,
  setLoading,
  onSuccess,
  onError,
  onCancel
}: {
  batch: HarvestBatch;
  plot: FarmPlot;
  program: Program;
  publicKey: PublicKey;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  onSuccess: (update: BatchUpdate) => void;
  onError: (msg: string) => void;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState<BatchStatus>("Processing");
  const [destination, setDestination] = useState("");

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const [batchPDA] = harvestBatchPDA(batch.batchId, publicKey);
      const updateTimestamp = Math.floor(Date.now() / 1000);
      
      // Derive the status_update PDA with the timestamp
      const [statusUpdatePDA] = web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("batch_update"),
          Buffer.from(batch.batchId),
          Buffer.from(new BN(updateTimestamp).toArray("le", 8))
        ],
        PROGRAM_ID
      );

      const tx = await program.methods
        .updateBatchStatus(
          statusToEnum(status),
          destination,
          new BN(updateTimestamp)
        )
        .accounts({
          harvestBatch: batchPDA,
          statusUpdate: statusUpdatePDA,
          authority: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("Transaction signature:", tx);
      
      onSuccess({
        timestamp: updateTimestamp,
        status,
        destination,
        type: "status"
      });
    } catch (err: any) {
      console.error("updateBatchStatus error:", err);
      onError(err?.message || "Failed to update batch status");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <button
        onClick={onCancel}
        className="mb-6 text-slate-400 hover:text-white transition-colors flex items-center gap-2"
      >
        <span>←</span> Back to {batch.batchId}
      </button>

      <div className="p-8 bg-slate-800 border border-slate-700 rounded-lg">
        <h2 className="text-2xl font-semibold mb-2 text-purple-400">🔄 Update Batch Status</h2>
        <p className="text-sm text-slate-400 mb-6">
          Batch: {batch.batchId} | Plot: {plot.plotId}
        </p>

        <label className="block text-sm font-medium text-slate-300 mb-2">New Status</label>
        <select 
          className="w-full mb-4 p-3 bg-slate-900 border border-slate-700 rounded text-white" 
          value={status} 
          onChange={(e) => setStatus(e.target.value as BatchStatus)}
        >
          {batchStatusOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <label className="block text-sm font-medium text-slate-300 mb-2">Destination (optional)</label>
        <input 
          className="w-full mb-6 p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500" 
          placeholder="e.g., Processing Facility A, Port of Rotterdam" 
          value={destination} 
          onChange={(e) => setDestination(e.target.value)} 
        />

        <div className="flex gap-3">
          <button 
            onClick={onCancel}
            className="flex-1 px-4 py-3 rounded bg-slate-700 hover:bg-slate-600 text-white font-medium transition-colors"
          >
            Cancel
          </button>
          <button 
            disabled={loading} 
            onClick={handleSubmit} 
            className="flex-1 px-4 py-3 rounded bg-purple-600 hover:bg-purple-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Updating..." : "Update Status"}
          </button>
        </div>
      </div>
    </div>
  );
}

function VerifySatellitePage({
  batch,
  plot,
  program,
  publicKey,
  loading,
  setLoading,
  onSuccess,
  onError,
  onCancel
}: {
  batch: HarvestBatch;
  plot: FarmPlot;
  program: Program;
  publicKey: PublicKey;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  onSuccess: (update: BatchUpdate) => void;
  onError: (msg: string) => void;
  onCancel: () => void;
}) {
  const [verificationHash, setVerificationHash] = useState("");
  const [noDeforestation, setNoDeforestation] = useState(true);

  const handleSubmit = async () => {
    if (!verificationHash) {
      onError("Please enter a verification hash");
      return;
    }

    setLoading(true);
    try {
      const [farmPDA] = farmPlotPDA(plot.plotId, publicKey);
      const timestamp = Math.floor(Date.now() / 1000);
      const [verifyPDA] = verificationPDA(farmPDA, publicKey, timestamp);

      const tx = await program.methods
        .recordSatelliteVerification(
          verificationHash,
          noDeforestation,
          new BN(timestamp)
        )
        .accounts({
          verification: verifyPDA,
          farmPlot: farmPDA,
          verifier: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("Transaction signature:", tx);
      
      onSuccess({
        timestamp,
        status: "",
        destination: "",
        type: "verification",
        verificationHash,
        noDeforestation
      });
    } catch (err: any) {
      console.error("recordSatelliteVerification error:", err);
      onError(err?.message || "Failed to record verification");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <button
        onClick={onCancel}
        className="mb-6 text-slate-400 hover:text-white transition-colors flex items-center gap-2"
      >
        <span>←</span> Back to {batch.batchId}
      </button>

      <div className="p-8 bg-slate-800 border border-slate-700 rounded-lg">
        <h2 className="text-2xl font-semibold mb-2 text-yellow-400">🛰️ Record Satellite Verification</h2>
        <p className="text-sm text-slate-400 mb-6">
          Batch: {batch.batchId} | Plot: {plot.plotId}
        </p>

        <label className="block text-sm font-medium text-slate-300 mb-2">Verification Hash</label>
        <input 
          className="w-full mb-4 p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500 font-mono text-sm" 
          placeholder="IPFS hash or oracle verification ID" 
          value={verificationHash} 
          onChange={(e) => setVerificationHash(e.target.value)} 
        />

        <label className="flex items-center gap-3 mb-6 p-4 bg-slate-900 rounded cursor-pointer hover:bg-slate-900/70 transition-colors">
          <input 
            type="checkbox" 
            checked={noDeforestation} 
            onChange={(e) => setNoDeforestation(e.target.checked)}
            className="w-5 h-5"
          />
          <div>
            <p className="text-sm font-medium text-slate-200">No deforestation detected</p>
            <p className="text-xs text-slate-500">Satellite imagery confirms no forest clearing</p>
          </div>
        </label>

        <div className="flex gap-3">
          <button 
            onClick={onCancel}
            className="flex-1 px-4 py-3 rounded bg-slate-700 hover:bg-slate-600 text-white font-medium transition-colors"
          >
            Cancel
          </button>
          <button 
            disabled={loading} 
            onClick={handleSubmit} 
            className="flex-1 px-4 py-3 rounded bg-yellow-600 hover:bg-yellow-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Recording..." : "Record Verification"}
          </button>
        </div>
      </div>
    </div>
  );
}