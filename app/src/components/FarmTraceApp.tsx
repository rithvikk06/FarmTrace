import React, { useMemo, useState, useEffect } from "react";
import { useConnection, useAnchorWallet, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { AnchorProvider, Program, web3, BN, Idl } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("FwtvuwpaD8vnDttYg6h8x8bugkm47fuwoNKd9tfF7sCE");

const commodityOptions = [
  "Cocoa", "Coffee", "PalmOil", "Soy", "Cattle", "Rubber", "Timber"
] as const;
type Commodity = typeof commodityOptions[number];

const batchStatusOptions = ["Harvested", "Processing", "InTransit", "Delivered"] as const;
type BatchStatus = typeof batchStatusOptions[number];

// -----------------------------
// Helpers: PDA derivation
// -----------------------------
function farmPlotPDA(plotId: string, farmerPubkey: PublicKey) {
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from("farm_plot"), Buffer.from(plotId), farmerPubkey.toBuffer()],
    PROGRAM_ID
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

export default function FarmTraceApp() {
  const wallet = useAnchorWallet();
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const [program, setProgram] = useState<Program | null>(null);

  console.log("publicKey", publicKey);
  console.log("wallet", wallet);

  const provider = useMemo(() => {
    if (!wallet) return null;
    return new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
      preflightCommitment: "confirmed"
    });
  }, [connection, wallet]);

  console.log("provider", provider);

  useEffect(() => {
    const initProgram = async () => {
      if (provider) {
        try {
          const program = await Program.at(PROGRAM_ID, provider);
          setProgram(program);
        } catch (err) {
          console.error("Error creating program:", err);
          setProgram(null);
        }
      }
    };

    initProgram();
  }, [provider]);

  console.log("program", program);

  // Debug: log program status
  useEffect(() => {
    if (program) {
      console.log("Program loaded successfully:", program.programId.toString());
      console.log("Available methods:", Object.keys(program.methods));
    }
  }, [program]);

  // Form state for plot registration
  const [plotId, setPlotId] = useState("");
  const [farmerName, setFarmerName] = useState("");
  const [location, setLocation] = useState("");
  const [coordinates, setCoordinates] = useState("");
  const [areaHectares, setAreaHectares] = useState<number | "">("");
  const [commodity, setCommodity] = useState<Commodity>("Cocoa");

  // Form state for batch
  const [batchId, setBatchId] = useState("");
  const [batchWeight, setBatchWeight] = useState<number | "">("");

  // Satellite verification
  const [verificationHash, setVerificationHash] = useState("");
  const [noDeforestation, setNoDeforestation] = useState(true);

  // Update status
  const [statusDestination, setStatusDestination] = useState("");
  const [status, setStatus] = useState<BatchStatus>("Processing");

  // DDS output
  const [ddsReport, setDdsReport] = useState<any | null>(null);

  // UI messages / loading states
  const [loading, setLoading] = useState(false);
  const [txMsg, setTxMsg] = useState<string | null>(null);

  // Guard: wallet
  if (!publicKey) {
    return (
      <div className="w-full min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
        <h1 className="text-3xl font-bold mb-4 text-gray-800">FarmTrace: EUDR Compliance Dashboard</h1>
        <p className="text-gray-600 mb-6 text-center max-w-md">
          Connect your Solana wallet to register farm plots, harvest batches, verify satellite data, and generate EUDR DDS reports.
        </p>
        <WalletMultiButton />
        <p className="text-xs text-gray-400 mt-4">Phantom or any Solana-compatible wallet supported.</p>
      </div>
    );
  }

  if (!program) {
    return (
      <div className="w-full min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
        <h1 className="text-3xl font-bold mb-4 text-red-600">Error Loading Program</h1>
        <p className="text-gray-600 mb-6">Failed to initialize Anchor program. Check console for details.</p>
        <WalletMultiButton />
      </div>
    );
  }

  // -------------------------
  // 1) Register Farm Plot
  // -------------------------
  const registerFarmPlot = async () => {
    if (!program || !publicKey) return;
    setLoading(true);
    setTxMsg(null);

    try {
      const [farmPDA] = farmPlotPDA(plotId, publicKey);
      const regTimestamp = Math.floor(Date.now() / 1000);

      console.log("Registering farm plot...");
      console.log("Farm PDA:", farmPDA.toString());
      console.log("Plot ID:", plotId);

      const tx = await program.methods
        .registerFarmPlot(
          plotId,
          farmerName,
          location,
          coordinates,
          areaHectares as number,
          { [commodity.charAt(0).toLowerCase() + commodity.slice(1)]: {} }, // Convert to camelCase
          new BN(regTimestamp)
        )
        .accounts({
          farmPlot: farmPDA,
          farmer: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("Transaction signature:", tx);
      setTxMsg(`Farm plot registered successfully! Tx: ${tx.slice(0, 8)}...`);
    } catch (err: any) {
      console.error("registerFarmPlot error:", err);
      setTxMsg("Error: " + (err?.message || err?.toString() || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  // -------------------------
  // 2) Register Harvest Batch
  // -------------------------
  const registerHarvestBatch = async () => {
    if (!program || !publicKey) return;
    setLoading(true);
    setTxMsg(null);

    try {
      const [farmPDA] = farmPlotPDA(plotId, publicKey);
      const [batchPDA] = harvestBatchPDA(batchId, publicKey);
      const harvestTimestamp = Math.floor(Date.now() / 1000);

      console.log("Registering harvest batch...");
      console.log("Batch PDA:", batchPDA.toString());
      console.log("Farm PDA:", farmPDA.toString());

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
      setTxMsg(`Harvest batch registered! Tx: ${tx.slice(0, 8)}...`);
    } catch (err: any) {
      console.error("registerHarvestBatch error:", err);
      setTxMsg("Error: " + (err?.message || err?.toString() || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  // -------------------------
  // 3) Record Satellite Verification
  // -------------------------
  const recordSatelliteVerification = async () => {
    if (!program || !publicKey) return;
    setLoading(true);
    setTxMsg(null);

    try {
      const [farmPDA] = farmPlotPDA(plotId, publicKey);
      const verifyTimestamp = Math.floor(Date.now() / 1000);
      const [verifyPDA] = verificationPDA(farmPDA, publicKey, verifyTimestamp);

      console.log("Recording satellite verification...");
      console.log("Verification PDA:", verifyPDA.toString());

      const tx = await program.methods
        .recordSatelliteVerification(
          verificationHash,
          noDeforestation,
          new BN(verifyTimestamp)
        )
        .accounts({
          verification: verifyPDA,
          farmPlot: farmPDA,
          verifier: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("Transaction signature:", tx);
      setTxMsg(`Satellite verification recorded! Tx: ${tx.slice(0, 8)}...`);
    } catch (err: any) {
      console.error("recordSatelliteVerification error:", err);
      setTxMsg("Error: " + (err?.message || err?.toString() || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  // -------------------------
  // 4) Update Batch Status
  // -------------------------
  const updateBatchStatus = async () => {
    if (!program || !publicKey) return;
    setLoading(true);
    setTxMsg(null);

    try {
      const [batchPDA] = harvestBatchPDA(batchId, publicKey);

      console.log("Updating batch status...");
      console.log("Batch PDA:", batchPDA.toString());

      const tx = await program.methods
        .updateBatchStatus(
          { [status.charAt(0).toLowerCase() + status.slice(1)]: {} }, // Convert to camelCase
          statusDestination
        )
        .accounts({
          harvestBatch: batchPDA,
          authority: publicKey,
        })
        .rpc();

      console.log("Transaction signature:", tx);
      setTxMsg(`Batch status updated! Tx: ${tx.slice(0, 8)}...`);
    } catch (err: any) {
      console.error("updateBatchStatus error:", err);
      setTxMsg("Error: " + (err?.message || err?.toString() || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  // -------------------------
  // 5) Generate DDS (view)
  // -------------------------
  const generateDDS = async () => {
    if (!program || !publicKey) return;
    setLoading(true);
    setTxMsg(null);

    try {
      const [batchPDA] = harvestBatchPDA(batchId, publicKey);
      const [farmPDA] = farmPlotPDA(plotId, publicKey);

      console.log("Generating DDS...");
      console.log("Batch PDA:", batchPDA.toString());
      console.log("Farm PDA:", farmPDA.toString());

      const dds: any = await program.methods
        .generateDdsData()
        .accounts({
          harvestBatch: batchPDA,
          farmPlot: farmPDA,
        })
        .view();

      console.log("DDS Report:", dds);
      setDdsReport(dds);
      setTxMsg("DDS report generated successfully!");
    } catch (err: any) {
      console.error("generateDDS error:", err);
      setTxMsg("Error: " + (err?.message || err?.toString() || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  // -------------------------
  // UI
  // -------------------------
  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-8 text-white">
      <header className="flex items-center justify-between mb-8 pb-4 border-b border-slate-700">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
            FarmTrace Control Panel
          </h1>
          <p className="text-sm text-slate-400 mt-1">EUDR Compliance Dashboard</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-xs font-mono bg-slate-800 px-3 py-2 rounded border border-slate-700">
            {publicKey?.toBase58().slice(0, 8)}...
          </div>
          <WalletMultiButton />
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Register Farm Plot */}
        <section className="p-6 bg-slate-800 border border-slate-700 rounded-lg">
          <h2 className="text-xl font-semibold mb-4 text-green-400">📍 Register Farm Plot</h2>

          <input 
            className="w-full mb-3 p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500" 
            placeholder="Plot ID (e.g., PLOT-001)" 
            value={plotId} 
            onChange={(e) => setPlotId(e.target.value)} 
          />
          <input 
            className="w-full mb-3 p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500" 
            placeholder="Farmer Name" 
            value={farmerName} 
            onChange={(e) => setFarmerName(e.target.value)} 
          />
          <input 
            className="w-full mb-3 p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500" 
            placeholder="Location (e.g., Côte d'Ivoire)" 
            value={location} 
            onChange={(e) => setLocation(e.target.value)} 
          />
          <textarea 
            className="w-full mb-3 p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500" 
            rows={2} 
            placeholder="Coordinates (e.g., 5.3599,-4.0083)" 
            value={coordinates} 
            onChange={(e) => setCoordinates(e.target.value)} 
          />
          <input 
            type="number" 
            className="w-full mb-3 p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500" 
            placeholder="Area (hectares)" 
            value={areaHectares as any} 
            onChange={(e) => setAreaHectares(e.target.value === "" ? "" : Number(e.target.value))} 
          />

          <select 
            className="w-full mb-4 p-3 bg-slate-900 border border-slate-700 rounded text-white" 
            value={commodity} 
            onChange={(e) => setCommodity(e.target.value as Commodity)}
          >
            {commodityOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <button 
            disabled={loading} 
            onClick={registerFarmPlot} 
            className="w-full px-4 py-3 rounded bg-green-600 hover:bg-green-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Processing..." : "Register Plot"}
          </button>
        </section>

        {/* Register Harvest Batch */}
        <section className="p-6 bg-slate-800 border border-slate-700 rounded-lg">
          <h2 className="text-xl font-semibold mb-4 text-blue-400">📦 Register Harvest Batch</h2>

          <input 
            className="w-full mb-3 p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500" 
            placeholder="Batch ID (e.g., BATCH-001)" 
            value={batchId} 
            onChange={(e) => setBatchId(e.target.value)} 
          />
          <input 
            type="number" 
            className="w-full mb-4 p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500" 
            placeholder="Weight (kg)" 
            value={batchWeight as any} 
            onChange={(e) => setBatchWeight(e.target.value === "" ? "" : Number(e.target.value))} 
          />

          <button 
            disabled={loading} 
            onClick={registerHarvestBatch} 
            className="w-full px-4 py-3 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Processing..." : "Register Batch"}
          </button>
        </section>

        {/* Satellite Verification */}
        <section className="p-6 bg-slate-800 border border-slate-700 rounded-lg">
          <h2 className="text-xl font-semibold mb-4 text-yellow-400">🛰️ Satellite Verification</h2>

          <input 
            className="w-full mb-3 p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500" 
            placeholder="Verification Hash (IPFS/oracle)" 
            value={verificationHash} 
            onChange={(e) => setVerificationHash(e.target.value)} 
          />
          <label className="flex items-center gap-3 mb-4 p-3 bg-slate-900 rounded cursor-pointer">
            <input 
              type="checkbox" 
              checked={noDeforestation} 
              onChange={(e) => setNoDeforestation(e.target.checked)}
              className="w-5 h-5"
            />
            <span className="text-sm">No deforestation detected</span>
          </label>

          <button 
            disabled={loading} 
            onClick={recordSatelliteVerification} 
            className="w-full px-4 py-3 rounded bg-yellow-600 hover:bg-yellow-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Processing..." : "Record Verification"}
          </button>
        </section>

        {/* Update Status & DDS */}
        <section className="p-6 bg-slate-800 border border-slate-700 rounded-lg">
          <h2 className="text-xl font-semibold mb-4 text-purple-400">🔄 Update & Report</h2>

          <h3 className="text-sm font-semibold mb-2 text-slate-400">Update Batch Status</h3>
          <select 
            className="w-full mb-3 p-3 bg-slate-900 border border-slate-700 rounded text-white" 
            value={status} 
            onChange={(e) => setStatus(e.target.value as BatchStatus)}
          >
            {batchStatusOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <input 
            className="w-full mb-3 p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500" 
            placeholder="Destination" 
            value={statusDestination} 
            onChange={(e) => setStatusDestination(e.target.value)} 
          />

          <button 
            disabled={loading} 
            onClick={updateBatchStatus} 
            className="w-full px-4 py-3 rounded bg-purple-600 hover:bg-purple-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors mb-4"
          >
            {loading ? "Processing..." : "Update Status"}
          </button>

          <hr className="border-slate-700 mb-4" />

          <h3 className="text-sm font-semibold mb-3 text-slate-400">📄 Generate DDS Report</h3>
          <button 
            disabled={loading} 
            onClick={generateDDS} 
            className="w-full px-4 py-3 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Generating..." : "Generate DDS"}
          </button>

          {ddsReport && (
            <div className="mt-4">
              <p className="text-xs text-slate-400 mb-2">DDS Report:</p>
              <pre className="p-3 bg-slate-900 rounded text-xs overflow-auto max-h-64 border border-slate-700">
                {JSON.stringify(ddsReport, null, 2)}
              </pre>
            </div>
          )}
        </section>
      </div>

      {txMsg && (
        <div className={`mt-6 p-4 rounded-lg border ${
          txMsg.includes("Error") 
            ? "bg-red-900/20 border-red-700 text-red-400" 
            : "bg-green-900/20 border-green-700 text-green-400"
        }`}>
          <p className="text-sm">{txMsg}</p>
        </div>
      )}
    </div>
  );
}