import React, { useMemo, useState, useEffect } from "react";
import { useConnection, useAnchorWallet, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { AnchorProvider, Program, web3, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import MapComponent from "./MapComponent"; // Import the map
import SHA256 from 'crypto-js/sha256';

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

// NOTE: verificationPDA has been removed as it's no longer needed.

export default function FarmTraceApp() {
  const wallet = useAnchorWallet();
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const [program, setProgram] = useState<Program | null>(null);

  const provider = useMemo(() => {
    if (!wallet) return null;
    return new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
      preflightCommitment: "confirmed"
    });
  }, [connection, wallet]);

  useEffect(() => {
    const initProgram = async () => {
      if (provider) {
        try {
          // NOTE: We need to use the new IDL. For now, assuming it's loaded correctly.
          const idl = await Program.fetchIdl(PROGRAM_ID, provider);
          if (!idl) {
            throw new Error("IDL not found");
          }
          // Use the provider overload of Program in this Anchor release: (idl, provider)
          const program = new Program(idl as any, provider);
          setProgram(program);
        } catch (err) {
          console.error("Error creating program:", err);
          setProgram(null);
        }
      }
    };

    initProgram();
  }, [provider]);

  useEffect(() => {
    if (program) {
      console.log("Program loaded successfully:", program.programId.toString());
    }
  }, [program]);

  // Form state for plot registration
  const [plotId, setPlotId] = useState("");
  const [farmerName, setFarmerName] = useState("");
  const [location, setLocation] = useState("");
  const [polygonCoords, setPolygonCoords] = useState<string | null>(null); // Will store simplified coords as JSON string
  const [areaHectares, setAreaHectares] = useState<number | "">("");
  const [commodity, setCommodity] = useState<Commodity>("Cocoa");
  const [validatorKey, setValidatorKey] = useState(""); // State for validator's public key

  // Form state for batch
  const [batchId, setBatchId] = useState("");
  const [batchWeight, setBatchWeight] = useState<number | "">("");
  
  // Update status
  const [statusDestination, setStatusDestination] = useState("");
  const [status, setStatus] = useState<BatchStatus>("Processing");

  // DDS output
  const [ddsReport, setDdsReport] = useState<any | null>(null);

  // UI messages / loading states
  const [loading, setLoading] = useState(false);
  const [txMsg, setTxMsg] = useState<string | null>(null);
  
  const handleCoordinatesChange = (latlngs: L.LatLng[]) => {
    // Simplify the coordinates and store as a JSON string
    const simplifiedCoords = latlngs.map(p => [p.lat, p.lng]);
    setPolygonCoords(JSON.stringify(simplifiedCoords));
  };


  if (!publicKey) {
    return (
      <div className="w-full min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
        <h1 className="text-3xl font-bold mb-4 text-gray-800">FarmTrace: EUDR Compliance Dashboard</h1>
        <p className="text-gray-600 mb-6 text-center max-w-md">
          Connect your Solana wallet to register farm plots, harvest batches, and generate EUDR DDS reports.
        </p>
        <WalletMultiButton />
      </div>
    );
  }

  if (!program) {
    return (
      <div className="w-full min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
        <h1 className="text-3xl font-bold mb-4 text-red-600">Error Loading Program</h1>
        <p className="text-gray-600 mb-6">Failed to initialize Anchor program. Check your connection and Program ID.</p>
        <WalletMultiButton />
      </div>
    );
  }

  // -------------------------
  // 1) Register Farm Plot
  // -------------------------
  const registerFarmPlot = async () => {
    if (!program || !publicKey || !polygonCoords || !validatorKey) {
        setTxMsg("Error: Please draw a polygon on the map and provide a validator key.");
        return;
    }
    setLoading(true);
    setTxMsg(null);

    let registrationTxMsg = "";

    try {
      const [farmPDA] = farmPlotPDA(plotId, publicKey);
      const regTimestamp = Math.floor(Date.now() / 1000);
      const polygonHash = SHA256(polygonCoords).toString();
      const validator = new PublicKey(validatorKey);

      console.log("Registering farm plot...");
      const tx = await program.methods
        .registerFarmPlot(
          plotId,
          farmerName,
          location,
          polygonHash,
          areaHectares as number,
          { [commodity.charAt(0).toLowerCase() + commodity.slice(1)]: {} },
          new BN(regTimestamp)
        )
        .accounts({
          farmPlot: farmPDA,
          farmer: publicKey,
          validator: validator,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("Transaction signature:", tx);
      registrationTxMsg = `Farm plot registered! Tx: ${tx.slice(0, 4)}...`;
      setTxMsg(registrationTxMsg + " Initiating automatic validation...");

      // Trigger backend validation
      try {
        const response = await fetch('http://localhost:3001/initiate-validation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            plotId: plotId, 
            farmerKey: publicKey.toBase58(),
            polygonCoordinates: JSON.parse(polygonCoords) 
          })
        });

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`Backend validation trigger failed: ${errorData}`);
        }
        
        const res = await response.json();
        console.log("Backend validation response:", res);
        setTxMsg(registrationTxMsg + " Validation process started successfully.");

      } catch (backendError: any) {
        console.error("Backend trigger error:", backendError);
        setTxMsg(registrationTxMsg + " WARNING: Could not start automatic validation. " + backendError.message);
      }

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
    // ... (This function remains largely the same, but relies on a validated plot)
    if (!program || !publicKey) return;
    setLoading(true);
    setTxMsg(null);

    try {
      const [farmPDA] = farmPlotPDA(plotId, publicKey);
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
      setTxMsg(`Harvest batch registered! Tx: ${tx.slice(0, 8)}...`);
    } catch (err: any) {
      console.error("registerHarvestBatch error:", err);
      setTxMsg("Error: " + (err?.message || err?.toString() || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  // -------------------------
  // 3) Update Batch Status
  // -------------------------
  const updateBatchStatus = async () => {
    // ... (This function is unchanged)
    if (!program || !publicKey) return;
    setLoading(true);
    setTxMsg(null);

    try {
      const [batchPDA] = harvestBatchPDA(batchId, publicKey);

      const tx = await program.methods
        .updateBatchStatus(
          { [status.charAt(0).toLowerCase() + status.slice(1)]: {} },
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
  // 4) Generate DDS (view)
  // -------------------------
  const generateDDS = async () => {
    // ... (This function is unchanged, but will now show the hash)
    if (!program || !publicKey) return;
    setLoading(true);
    setTxMsg(null);

    try {
      const [batchPDA] = harvestBatchPDA(batchId, publicKey);
      const [farmPDA] = farmPlotPDA(plotId, publicKey);

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

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-8 text-white">
      <header className="flex items-center justify-between mb-8 pb-4 border-b border-slate-700">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
            FarmTrace Control Panel
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <WalletMultiButton />
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Register Farm Plot */}
        <section className="p-6 bg-slate-800 border border-slate-700 rounded-lg">
          <h2 className="text-xl font-semibold mb-4 text-green-400">📍 1. Register Farm Plot</h2>
          
          <p className="text-sm text-slate-400 mb-2">Draw the plot boundaries on the map.</p>
          <MapComponent onCoordsChange={handleCoordinatesChange} />

          <input className="w-full my-3 p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500" placeholder="Plot ID" value={plotId} onChange={(e) => setPlotId(e.target.value)} />
          <input className="w-full mb-3 p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500" placeholder="Farmer Name" value={farmerName} onChange={(e) => setFarmerName(e.target.value)} />
          <input className="w-full mb-3 p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500" placeholder="Location (e.g., Côte d'Ivoire)" value={location} onChange={(e) => setLocation(e.target.value)} />
          <input type="number" className="w-full mb-3 p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500" placeholder="Area (hectares)" value={areaHectares as any} onChange={(e) => setAreaHectares(e.target.value === "" ? "" : Number(e.target.value))} />
          <input className="w-full mb-3 p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500" placeholder="Validator Public Key" value={validatorKey} onChange={(e) => setValidatorKey(e.target.value)} />

          <select className="w-full mb-4 p-3 bg-slate-900 border border-slate-700 rounded text-white" value={commodity} onChange={(e) => setCommodity(e.target.value as Commodity)}>
            {commodityOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <button disabled={loading} onClick={registerFarmPlot} className="w-full px-4 py-3 rounded bg-green-600 hover:bg-green-700 text-white font-medium disabled:opacity-50">
            {loading ? "Processing..." : "Register Plot & Start Validation"}
          </button>
        </section>

        {/* Register Harvest Batch */}
        <section className="p-6 bg-slate-800 border border-slate-700 rounded-lg">
          <h2 className="text-xl font-semibold mb-4 text-blue-400">📦 2. Register Harvest Batch</h2>
          <p className="text-sm text-slate-400 mb-4">Requires plot to be successfully validated by the backend service.</p>
          <input className="w-full mb-3 p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500" placeholder="Plot ID (must match registered plot)" value={plotId} onChange={(e) => setPlotId(e.target.value)} />
          <input className="w-full mb-3 p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500" placeholder="Batch ID" value={batchId} onChange={(e) => setBatchId(e.target.value)} />
          <input type="number" className="w-full mb-4 p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500" placeholder="Weight (kg)" value={batchWeight as any} onChange={(e) => setBatchWeight(e.target.value === "" ? "" : Number(e.target.value))} />
          <button disabled={loading} onClick={registerHarvestBatch} className="w-full px-4 py-3 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50">
            {loading ? "Processing..." : "Register Batch"}
          </button>
        </section>

        {/* Update Status & DDS */}
        <section className="p-6 bg-slate-800 border border-slate-700 rounded-lg col-span-1 lg:col-span-2">
          <h2 className="text-xl font-semibold mb-4 text-purple-400">🔄 3. Update & Report</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold mb-2 text-slate-400">Update Batch Status</h3>
              <input className="w-full mb-3 p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500" placeholder="Batch ID to Update" value={batchId} onChange={(e) => setBatchId(e.target.value)} />
              <select className="w-full mb-3 p-3 bg-slate-900 border border-slate-700 rounded text-white" value={status} onChange={(e) => setStatus(e.target.value as BatchStatus)}>
                {batchStatusOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <input className="w-full mb-3 p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500" placeholder="Destination" value={statusDestination} onChange={(e) => setStatusDestination(e.target.value)} />
              <button disabled={loading} onClick={updateBatchStatus} className="w-full px-4 py-3 rounded bg-purple-600 hover:bg-purple-700 text-white font-medium disabled:opacity-50">
                {loading ? "Processing..." : "Update Status"}
              </button>
            </div>
            
            <div>
              <h3 className="text-sm font-semibold mb-3 text-slate-400">📄 Generate DDS Report</h3>
              <input className="w-full mb-3 p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500" placeholder="Plot ID for Report" value={plotId} onChange={(e) => setPlotId(e.target.value)} />
              <input className="w-full mb-3 p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500" placeholder="Batch ID for Report" value={batchId} onChange={(e) => setBatchId(e.target.value)} />
              <button disabled={loading} onClick={generateDDS} className="w-full px-4 py-3 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50">
                {loading ? "Generating..." : "Generate DDS"}
              </button>

              {ddsReport && (
                <div className="mt-4">
                  <pre className="p-3 bg-slate-900 rounded text-xs overflow-auto max-h-64 border border-slate-700">
                    {JSON.stringify(ddsReport, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {txMsg && (
        <div className={`mt-6 p-4 rounded-lg border ${
          txMsg.includes("Error") || txMsg.includes("WARNING")
            ? "bg-red-900/20 border-red-700 text-red-400" 
            : "bg-green-900/20 border-green-700 text-green-400"
        }`}>
          <p className="text-sm">{txMsg}</p>
        </div>
      )}
    </div>
  );
}