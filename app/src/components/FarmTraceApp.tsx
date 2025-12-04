import React, { useMemo, useState } from "react";
import { useConnection, useAnchorWallet, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { AnchorProvider, Program, web3, BN } from "@coral-xyz/anchor";
import idl from "../idl/farmtrace.json";
import { PublicKey, SystemProgram } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey((idl as any).metadata.address);

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

export default function FarmTraceApp() {
  const wallet = useAnchorWallet();
  const { publicKey } = useWallet();
  const { connection } = useConnection();

  const provider = useMemo(() => {
    if (!wallet) return null;
    return new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
  }, [connection, wallet]);

  const program = useMemo(() => {
    if (!provider) return null;
    return new Program(idl as any, PROGRAM_ID, provider);
  }, [provider]);

  // Form state for plot registration
  const [plotId, setPlotId] = useState("");
  const [farmerName, setFarmerName] = useState("");
  const [location, setLocation] = useState("");
  const [coordinates, setCoordinates] = useState(""); // GeoJSON string or "lat,lng"
  const [areaHectares, setAreaHectares] = useState<number | "">("");
  const [commodity, setCommodity] = useState<Commodity>("Cocoa");
  const [regTimestamp] = useState<number>(Math.floor(Date.now() / 1000));

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

  // -------------------------
  // 1) Register Farm Plot
  // -------------------------
  const registerFarmPlot = async () => {
    if (!program || !publicKey) return;
    setLoading(true);
    setTxMsg(null);

    try {
      // derive PDA
      const [farmPDA, farmBump] = farmPlotPDA(plotId, publicKey);

      // call anchor method
      // NOTE: anchor expects the enum type as the exact variant; client helper uses object with key = variant name
      const commodityArg = { [commodity]: {} };

      await program.methods
        .registerFarmPlot(
          plotId,
          farmerName,
          location,
          coordinates,
          Number(areaHectares),
          commodityArg,
          new BN(regTimestamp)
        )
        .accounts({
          farmPlot: farmPDA,
          farmer: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: "confirmed" });

      setTxMsg("Farm plot registered successfully");
    } catch (err: any) {
      console.error("registerFarmPlot err:", err);
      setTxMsg("Error: " + (err?.message ?? String(err)));
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

      await program.methods
        .registerHarvestBatch(batchId, new BN(Number(batchWeight)), new BN(Math.floor(Date.now() / 1000)))
        .accounts({
          harvestBatch: batchPDA,
          farmPlot: farmPDA,
          farmer: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: "confirmed" });

      setTxMsg("Harvest batch registered");
    } catch (err: any) {
      console.error("registerHarvestBatch err:", err);
      setTxMsg("Error: " + (err?.message ?? String(err)));
    } finally {
      setLoading(false);
    }
  };

  // -------------------------
  // 3) Record Satellite Verification (oracle)
  // -------------------------
  const recordSatelliteVerification = async () => {
    if (!program || !publicKey) return;
    setLoading(true);
    setTxMsg(null);

    try {
      const [farmPDA] = farmPlotPDA(plotId, publicKey);

      // The program creates a verification account with PDA including timestamp – we must pass accounts exactly
      // derive a fresh PDA for the verification account using a timestamp seed – but on client we can't call Clock::get()
      // so we use anchor to init (program will use Clock when building seeds). We'll instead call method and let it init
      await program.methods
        .recordSatelliteVerification(verificationHash, noDeforestation)
        .accounts({
          verification: web3.Keypair.generate().publicKey, // Anchor will expect an init account; alternative is to use PDA that program expects; adjust as needed
          farmPlot: farmPDA,
          verifier: publicKey,
          systemProgram: SystemProgram.programId,
        })
        // Note: Depending on your program, init PDA may require the client to pass the correct PDA; adjust as necessary.
        .rpc({ commitment: "confirmed" });

      setTxMsg("Satellite verification recorded");
    } catch (err: any) {
      console.error("recordSatelliteVerification err:", err);
      setTxMsg("Error: " + (err?.message ?? String(err)));
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

      const statusArg = { [status]: {} };

      await program.methods
        .updateBatchStatus(statusArg, statusDestination)
        .accounts({
          harvestBatch: batchPDA,
          authority: publicKey,
        })
        .rpc({ commitment: "confirmed" });

      setTxMsg("Batch status updated");
    } catch (err: any) {
      console.error("updateBatchStatus err:", err);
      setTxMsg("Error: " + (err?.message ?? String(err)));
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

      // Anchor's view() returns the struct if program supports returning it (your program does)
      const dds: any = await program.methods
        .generateDdsData()
        .accounts({
          harvestBatch: batchPDA,
          farmPlot: farmPDA,
        })
        .view();

      setDdsReport(dds);
      setTxMsg("DDS generated");
    } catch (err: any) {
      console.error("generateDDS err:", err);
      setTxMsg("Error: " + (err?.message ?? String(err)));
    } finally {
      setLoading(false);
    }
  };

  // -------------------------
  // Small UI / form
  // -------------------------
  return (
    <div className="w-full min-h-screen bg-zinc-800 p-8">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">FarmTrace Control Panel</h1>
        <div className="flex items-center gap-4">
          <div className="font-mono text-sm">{publicKey?.toBase58()}</div>
          <WalletMultiButton />
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Register Farm Plot */}
        <section className="p-4 border rounded">
          <h2 className="font-semibold mb-2">Register Farm Plot</h2>

          <input className="w-full mb-2 p-2 border rounded" placeholder="Plot ID" value={plotId} onChange={(e) => setPlotId(e.target.value)} />
          <input className="w-full mb-2 p-2 border rounded" placeholder="Farmer Name" value={farmerName} onChange={(e) => setFarmerName(e.target.value)} />
          <input className="w-full mb-2 p-2 border rounded" placeholder="Location (village/region)" value={location} onChange={(e) => setLocation(e.target.value)} />
          <textarea className="w-full mb-2 p-2 border rounded" rows={3} placeholder="Coordinates (GeoJSON or 'lat,lng')" value={coordinates} onChange={(e) => setCoordinates(e.target.value)} />
          <input type="number" className="w-full mb-2 p-2 border rounded" placeholder="Area (hectares)" value={areaHectares as any} onChange={(e) => setAreaHectares(e.target.value === "" ? "" : Number(e.target.value))} />

          <select className="w-full mb-2 p-2 border rounded" value={commodity} onChange={(e) => setCommodity(e.target.value as Commodity)}>
            {commodityOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <button disabled={loading} onClick={registerFarmPlot} className="px-4 py-2 rounded bg-blue-600 text-white">
            {loading ? "Sending..." : "Register Plot"}
          </button>
        </section>

        {/* Register Harvest Batch */}
        <section className="p-4 border rounded">
          <h2 className="font-semibold mb-2">Register Harvest Batch</h2>

          <input className="w-full mb-2 p-2 border rounded" placeholder="Batch ID" value={batchId} onChange={(e) => setBatchId(e.target.value)} />
          <input type="number" className="w-full mb-2 p-2 border rounded" placeholder="Weight (kg)" value={batchWeight as any} onChange={(e) => setBatchWeight(e.target.value === "" ? "" : Number(e.target.value))} />

          <button disabled={loading} onClick={registerHarvestBatch} className="px-4 py-2 rounded bg-green-600 text-white">
            {loading ? "Sending..." : "Register Batch"}
          </button>
        </section>

        {/* Satellite Verification */}
        <section className="p-4 border rounded">
          <h2 className="font-semibold mb-2">Record Satellite Verification</h2>

          <input className="w-full mb-2 p-2 border rounded" placeholder="Verification Hash (IPFS/oracle)" value={verificationHash} onChange={(e) => setVerificationHash(e.target.value)} />
          <label className="flex items-center gap-2 mb-2">
            <input type="checkbox" checked={noDeforestation} onChange={(e) => setNoDeforestation(e.target.checked)} />
            No deforestation detected (true/false)
          </label>

          <button disabled={loading} onClick={recordSatelliteVerification} className="px-4 py-2 rounded bg-yellow-600 text-white">
            {loading ? "Sending..." : "Record Verification"}
          </button>
        </section>

        {/* Update status & DDS */}
        <section className="p-4 border rounded">
          <h2 className="font-semibold mb-2">Update Batch Status</h2>

          <select className="w-full mb-2 p-2 border rounded" value={status} onChange={(e) => setStatus(e.target.value as BatchStatus)}>
            {batchStatusOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <input className="w-full mb-2 p-2 border rounded" placeholder="Destination" value={statusDestination} onChange={(e) => setStatusDestination(e.target.value)} />

          <button disabled={loading} onClick={updateBatchStatus} className="px-4 py-2 rounded bg-indigo-600 text-white mb-4">
            {loading ? "Sending..." : "Update Status"}
          </button>

          <hr className="mb-4" />

          <h3 className="font-semibold mb-2">Generate DDS Report</h3>
          <button disabled={loading} onClick={generateDDS} className="px-4 py-2 rounded bg-gray-800 text-white">
            {loading ? "Generating..." : "Generate DDS"}
          </button>

          {ddsReport && (
            <pre className="mt-3 p-2 bg-gray-100 rounded text-xs overflow-auto">{JSON.stringify(ddsReport, null, 2)}</pre>
          )}
        </section>
      </div>

      {txMsg && <div className="mt-4 p-2 bg-gray-200 rounded">{txMsg}</div>}
    </div>
  );
}
