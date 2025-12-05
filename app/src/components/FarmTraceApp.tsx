import React, { useMemo, useState, useEffect } from "react";
import { useConnection, useAnchorWallet, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { AnchorProvider, Program, web3, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import MapComponent from "./MapComponent";
import SHA256 from 'crypto-js/sha256';

const PROGRAM_ID = new PublicKey("HYubBywfVs4LzqZnP5dqrnxYqCMHTCd2vqKLpvj8KofF");

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

function harvestBatchPDA(batchId: string, farmerPubkey: PublicKey) {
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from("harvest_batch"), Buffer.from(batchId), farmerPubkey.toBuffer()],
    PROGRAM_ID
  );
}

// Types
type Page = 'home' | 'register-plot' | 'plot-detail' | 'register-batch' | 'update-status' | 'generate-dds';

interface FarmPlot {
  plotId: string;
  farmerName: string;
  location: string;
  polygonHash: string;
  areaHectares: number;
  commodityType: string;
  isActive: boolean;
  isValidated: boolean;
  complianceScore: number;
}

interface HarvestBatch {
  batchId: string;
  farmPlot: string;
  weightKg: number;
  harvestTimestamp: number;
  status: string;
  complianceStatus: string;
  destination: string;
}

export default function FarmTraceApp() {
  const wallet = useAnchorWallet();
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const [program, setProgram] = useState<Program | null>(null);
  
  // Navigation
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [selectedPlot, setSelectedPlot] = useState<FarmPlot | null>(null);
  
  // Data
  const [farmPlots, setFarmPlots] = useState<FarmPlot[]>([]);
  const [harvestBatches, setHarvestBatches] = useState<HarvestBatch[]>([]);
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  
  // Form states
  const [plotId, setPlotId] = useState("");
  const [farmerName, setFarmerName] = useState("");
  const [location, setLocation] = useState("");
  const [polygonCoords, setPolygonCoords] = useState<string | null>(null);
  const [areaHectares, setAreaHectares] = useState<number | "">("");
  const [commodity, setCommodity] = useState<Commodity>("Cocoa");
  
  const [batchId, setBatchId] = useState("");
  const [batchWeight, setBatchWeight] = useState<number | "">("");
  
  const [statusDestination, setStatusDestination] = useState("");
  const [status, setStatus] = useState<BatchStatus>("Processing");
  const [ddsReport, setDdsReport] = useState<any | null>(null);

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
          const idl = await Program.fetchIdl(PROGRAM_ID, provider);
          if (!idl) throw new Error("IDL not found");
          const program = new Program(idl as any, provider);
          setProgram(program);
        } catch (err) {
          console.error("Error creating program:", err);
        }
      }
    };
    initProgram();
  }, [provider]);

  const handleCoordinatesChange = (coords: any) => {
    try {
      // coords expected to be array of lat/lng pairs
      const json = JSON.stringify(coords);
      setPolygonCoords(json);
    } catch (err) {
      console.error("Invalid polygon coordinates:", err);
    }
  };

  // Fetch all farm plots for the connected wallet
  const fetchFarmPlots = async () => {
    if (!program || !publicKey) return;
    
    try {
      setLoading(true);
      // Fetch all farm plots and filter client-side by farmer public key
      const accounts = await (program.account as any).farmPlot.all();
      
      const plots: FarmPlot[] = accounts
        .filter((acc: any) => acc.account.farmer.toString() === publicKey.toString())
        .map((acc: any) => ({
          plotId: acc.account.plotId,
          farmerName: acc.account.farmerName,
          location: acc.account.location,
          polygonHash: acc.account.polygonHash,
          areaHectares: acc.account.areaHectares,
          commodityType: parseCommodityType(acc.account.commodityType),
          isActive: acc.account.isActive,
          isValidated: acc.account.isValidated,
          complianceScore: acc.account.complianceScore,
        }));
      
      setFarmPlots(plots);
    } catch (err) {
      console.error("Error fetching farm plots:", err);
      setMessage({type: 'error', text: 'Failed to fetch farm plots. Check console for details.'});
    } finally {
      setLoading(false);
    }
  };

  // Fetch harvest batches for a specific plot
  const fetchHarvestBatches = async (plotId: string) => {
    if (!program || !publicKey) return;
    
    try {
      setLoading(true);
      // Fetch all harvest batches for this farmer
      const accounts = await program.account.harvestBatch.all();
      
      // Get the farm plot PDA to compare against
      const [farmPDA] = farmPlotPDA(plotId, publicKey);
      
      const batches: HarvestBatch[] = accounts
        .filter((acc: any) => {
          // Filter by farmer first
          return acc.account.farmer.toString() === publicKey.toString() &&
                // Then filter by farm plot
                acc.account.farmPlot.toString() === farmPDA.toString();
        })
        .map((acc: any) => ({
          batchId: acc.account.batchId,
          farmPlot: acc.account.farmPlot.toString(),
          weightKg: acc.account.weightKg.toNumber(),
          harvestTimestamp: acc.account.harvestTimestamp.toNumber(),
          status: parseStatus(acc.account.status),
          complianceStatus: parseComplianceStatus(acc.account.complianceStatus),
          destination: acc.account.destination,
        }));
      
      setHarvestBatches(batches);
    } catch (err) {
      console.error("Error fetching harvest batches:", err);
      setMessage({type: 'error', text: 'Failed to fetch harvest batches. Check console for details.'});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (publicKey && program && currentPage === 'home') {
      fetchFarmPlots();
    }
  }, [publicKey, program, currentPage]);

  useEffect(() => {
    if (publicKey && program && currentPage === 'plot-detail' && selectedPlot) {
      fetchHarvestBatches(selectedPlot.plotId);
    }
  }, [publicKey, program, currentPage, selectedPlot]);

  const registerFarmPlot = async () => {
    const validatorPublicKey = (import.meta as any).env.VITE_VALIDATOR_PUBLIC_KEY;
    console.log(program, publicKey, validatorPublicKey, polygonCoords);
    if (!program || !publicKey || !polygonCoords || !validatorPublicKey) {
      setMessage({type: 'error', text: "Please draw a polygon on the map and ensure validator is configured."});
      return;
    }
    
    setLoading(true);
    setMessage(null);

    try {
      const [farmPDA] = farmPlotPDA(plotId, publicKey);
      const regTimestamp = Math.floor(Date.now() / 1000);
      const polygonHash = SHA256(polygonCoords).toString();
      const validator = new PublicKey(validatorPublicKey);

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

      // Trigger backend validation
      try {
        const apiUrl = `${(import.meta as any).env.VITE_API_BASE_URL}/initiate-validation`;
        await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            plotId: plotId, 
            farmerKey: publicKey.toBase58(),
            polygonCoordinates: JSON.parse(polygonCoords) 
          })
        });
      } catch (backendError) {
        console.error("Backend validation trigger failed:", backendError);
      }

      setMessage({type: 'success', text: `Farm plot registered successfully! Tx: ${tx.slice(0, 8)}...`});
      
      // Reset form
      setPlotId("");
      setFarmerName("");
      setLocation("");
      setPolygonCoords(null);
      setAreaHectares("");
      
      // Navigate back to home after a brief delay
      setTimeout(() => {
        setCurrentPage('home');
        fetchFarmPlots();
      }, 2000);
      
    } catch (err: any) {
      console.error("registerFarmPlot error:", err);
      setMessage({type: 'error', text: err?.message || "Failed to register farm plot"});
    } finally {
      setLoading(false);
    }
  };

  const registerHarvestBatch = async () => {
    if (!program || !publicKey || !selectedPlot) return;
    
    setLoading(true);
    setMessage(null);
    
    try {
      const [farmPDA] = farmPlotPDA(selectedPlot.plotId, publicKey);
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

      setMessage({type: 'success', text: `Harvest batch registered! Tx: ${tx.slice(0, 8)}...`});
      
      // Reset form
      setBatchId("");
      setBatchWeight("");
      
      // Navigate back to plot detail after a brief delay
      setTimeout(() => {
        setCurrentPage('plot-detail');
        fetchHarvestBatches(selectedPlot.plotId);
      }, 2000);
      
    } catch (err: any) {
      console.error("registerHarvestBatch error:", err);
      setMessage({type: 'error', text: err?.message || "Failed to register harvest batch"});
    } finally {
      setLoading(false);
    }
  };

  const updateBatchStatus = async () => {
    if (!program || !publicKey) return;
    setLoading(true);
    setMessage(null);
    
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
      
      setMessage({type: 'success', text: `Batch status updated! Tx: ${tx.slice(0, 8)}...`});
    } catch (err: any) {
      console.error("updateBatchStatus error:", err);
      setMessage({type: 'error', text: err?.message || "Failed to update batch status"});
    } finally {
      setLoading(false);
    }
  };

  const generateDDS = async () => {
    if (!program || !publicKey || !selectedPlot) return;
    setLoading(true);
    setMessage(null);
    
    try {
      const [batchPDA] = harvestBatchPDA(batchId, publicKey);
      const [farmPDA] = farmPlotPDA(selectedPlot.plotId, publicKey);
      
      const dds: any = await program.methods
        .generateDdsData()
        .accounts({
          harvestBatch: batchPDA,
          farmPlot: farmPDA,
        })
        .view();
      
      setDdsReport(dds);
      setMessage({type: 'success', text: "DDS report generated successfully!"});
    } catch (err: any) {
      console.error("generateDDS error:", err);
      setMessage({type: 'error', text: err?.message || "Failed to generate DDS report"});
    } finally {
      setLoading(false);
    }
  };

  // Render different pages
  if (!publicKey) {
    return (
      <div className="w-full min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-6">
        <h1 className="text-3xl font-bold mb-4 bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
          FarmTrace: EUDR Compliance Dashboard
        </h1>
        <p className="text-slate-400 mb-6 text-center max-w-md">
          Connect your Solana wallet to manage farm plots and harvest batches.
        </p>
        <WalletMultiButton />
      </div>
    );
  }

  if (!program) {
    return (
      <div className="w-full min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-6">
        <h1 className="text-3xl font-bold mb-4 text-red-400">Error Loading Program</h1>
        <p className="text-slate-400 mb-6">Failed to initialize Anchor program.</p>
        <WalletMultiButton />
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-8 text-white">
      <header className="flex items-center justify-between mb-8 pb-4 border-b border-slate-700">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
            FarmTrace
          </h1>
          {currentPage !== 'home' && (
            <button
              onClick={() => {
                setCurrentPage('home');
                setMessage(null);
                setSelectedPlot(null);
              }}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm"
            >
              ← Back to Dashboard
            </button>
          )}
        </div>
        <WalletMultiButton />
      </header>

      {message && (
        <div className={`mb-6 p-4 rounded-lg border ${
          message.type === 'error'
            ? "bg-red-900/20 border-red-700 text-red-400" 
            : "bg-green-900/20 border-green-700 text-green-400"
        }`}>
          <p className="text-sm">{message.text}</p>
        </div>
      )}

      {/* HOME PAGE - List of Farm Plots */}
      {currentPage === 'home' && (
        <div>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">Your Farm Plots</h2>
            <button
              onClick={() => setCurrentPage('register-plot')}
              className="px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-medium"
            >
              + Register New Farm Plot
            </button>
          </div>

          {loading ? (
            <div className="text-center py-12 text-slate-400">Loading farm plots...</div>
          ) : farmPlots.length === 0 ? (
            <div className="text-center py-12 bg-slate-800 rounded-lg border border-slate-700">
              <p className="text-slate-400 mb-4">No farm plots registered yet.</p>
              <button
                onClick={() => setCurrentPage('register-plot')}
                className="px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-medium"
              >
                Register Your First Plot
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {farmPlots.map((plot) => (
                <div
                  key={plot.plotId}
                  onClick={() => {
                    setSelectedPlot(plot);
                    setCurrentPage('plot-detail');
                    fetchHarvestBatches(plot.plotId);
                  }}
                  className="p-6 bg-slate-800 border border-slate-700 rounded-lg hover:border-green-500 cursor-pointer transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-xl font-semibold text-green-400">{plot.plotId}</h3>
                    {plot.isValidated && (
                      <span className="px-2 py-1 bg-green-900/30 border border-green-700 rounded text-xs text-green-400">
                        ✓ Validated
                      </span>
                    )}
                  </div>
                  <p className="text-slate-400 text-sm mb-2">👤 {plot.farmerName}</p>
                  <p className="text-slate-400 text-sm mb-2">📍 {plot.location}</p>
                  <p className="text-slate-400 text-sm mb-2">🌾 {plot.commodityType}</p>
                  <p className="text-slate-400 text-sm">📏 {plot.areaHectares} hectares</p>
                  <div className="mt-4 pt-4 border-t border-slate-700">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500">Compliance Score</span>
                      <span className="text-lg font-bold text-blue-400">{plot.complianceScore}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* REGISTER PLOT PAGE */}
      {currentPage === 'register-plot' && (
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-6 text-green-400">📍 Register New Farm Plot</h2>
          <div className="p-6 bg-slate-800 border border-slate-700 rounded-lg">
            <p className="text-sm text-slate-400 mb-4">Draw the plot boundaries on the map below.</p>
            <div key="map-register">
              <MapComponent onCoordsChange={handleCoordinatesChange} />
            </div>
            
            {polygonCoords && (
              <div className="mt-3 p-2 bg-green-900/20 border border-green-700 rounded text-green-400 text-xs">
                ✓ Polygon drawn ({JSON.parse(polygonCoords).length} points)
              </div>
            )}
            
            <div className="mt-6 space-y-4">
              <input
                className="w-full p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500"
                placeholder="Plot ID (unique identifier)"
                value={plotId}
                onChange={(e) => setPlotId(e.target.value)}
              />
              <input
                className="w-full p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500"
                placeholder="Farmer Name"
                value={farmerName}
                onChange={(e) => setFarmerName(e.target.value)}
              />
              <input
                className="w-full p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500"
                placeholder="Location (e.g., Côte d'Ivoire)"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
              <input
                type="number"
                className="w-full p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500"
                placeholder="Area (hectares)"
                value={areaHectares as any}
                onChange={(e) => setAreaHectares(e.target.value === "" ? "" : Number(e.target.value))}
              />
              <select
                className="w-full p-3 bg-slate-900 border border-slate-700 rounded text-white"
                value={commodity}
                onChange={(e) => setCommodity(e.target.value as Commodity)}
              >
                {commodityOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              
              <button
                disabled={loading || !polygonCoords}
                onClick={registerFarmPlot}
                className="w-full px-4 py-3 rounded bg-green-600 hover:bg-green-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Processing..." : polygonCoords ? "Register Plot & Start Validation" : "Draw polygon on map first"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PLOT DETAIL PAGE - List of Harvest Batches */}
      {currentPage === 'plot-detail' && selectedPlot && (
        <div>
          <div className="mb-6 p-6 bg-slate-800 border border-slate-700 rounded-lg">
            <h2 className="text-2xl font-bold text-green-400 mb-2">{selectedPlot.plotId}</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-slate-500">Farmer</p>
                <p className="text-white">{selectedPlot.farmerName}</p>
              </div>
              <div>
                <p className="text-slate-500">Location</p>
                <p className="text-white">{selectedPlot.location}</p>
              </div>
              <div>
                <p className="text-slate-500">Commodity</p>
                <p className="text-white">{selectedPlot.commodityType}</p>
              </div>
              <div>
                <p className="text-slate-500">Area</p>
                <p className="text-white">{selectedPlot.areaHectares} ha</p>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold">Harvest Batches</h3>
            <div className="flex gap-3">
              <button
                onClick={() => setCurrentPage('update-status')}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg"
              >
                Update Status
              </button>
              <button
                onClick={() => setCurrentPage('generate-dds')}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg"
              >
                Generate DDS
              </button>
              <button
                onClick={() => setCurrentPage('register-batch')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                + Register Harvest Batch
              </button>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12 text-slate-400">Loading harvest batches...</div>
          ) : harvestBatches.length === 0 ? (
            <div className="text-center py-12 bg-slate-800 rounded-lg border border-slate-700">
              <p className="text-slate-400 mb-4">No harvest batches registered yet.</p>
              <button
                onClick={() => setCurrentPage('register-batch')}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium"
              >
                Register First Batch
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {harvestBatches.map((batch) => (
                <div
                  key={batch.batchId}
                  className="p-6 bg-slate-800 border border-slate-700 rounded-lg"
                >
                  <h4 className="text-lg font-semibold text-blue-400 mb-3">{batch.batchId}</h4>
                  <div className="space-y-2 text-sm">
                    <p className="text-slate-400">⚖️ Weight: <span className="text-white">{batch.weightKg} kg</span></p>
                    <p className="text-slate-400">📅 Harvest: <span className="text-white">{new Date(batch.harvestTimestamp * 1000).toLocaleDateString()}</span></p>
                    <p className="text-slate-400">📦 Status: <span className="text-white">{batch.status}</span></p>
                    <p className="text-slate-400">✓ Compliance: <span className="text-white">{batch.complianceStatus}</span></p>
                    {batch.destination && (
                      <p className="text-slate-400">📍 Destination: <span className="text-white">{batch.destination}</span></p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* REGISTER BATCH PAGE */}
      {currentPage === 'register-batch' && selectedPlot && (
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold mb-6 text-blue-400">📦 Register Harvest Batch</h2>
          <div className="p-6 bg-slate-800 border border-slate-700 rounded-lg">
            <p className="text-sm text-slate-400 mb-4">
              Registering batch for plot: <span className="text-white font-semibold">{selectedPlot.plotId}</span>
            </p>
            {!selectedPlot.isValidated && (
              <div className="mb-4 p-3 bg-yellow-900/20 border border-yellow-700 rounded text-yellow-400 text-sm">
                ⚠️ Warning: This plot has not been validated yet.
              </div>
            )}
            
            <div className="space-y-4">
              <input
                className="w-full p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500"
                placeholder="Batch ID (unique identifier)"
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
              />
              <input
                type="number"
                className="w-full p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500"
                placeholder="Weight (kg)"
                value={batchWeight as any}
                onChange={(e) => setBatchWeight(e.target.value === "" ? "" : Number(e.target.value))}
              />
              
              <button
                disabled={loading}
                onClick={registerHarvestBatch}
                className="w-full px-4 py-3 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50"
              >
                {loading ? "Processing..." : "Register Batch"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UPDATE STATUS PAGE */}
      {currentPage === 'update-status' && (
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold mb-6 text-purple-400">🔄 Update Batch Status</h2>
          <div className="p-6 bg-slate-800 border border-slate-700 rounded-lg">
            <div className="space-y-4">
              <input
                className="w-full p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500"
                placeholder="Batch ID"
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
              />
              <select
                className="w-full p-3 bg-slate-900 border border-slate-700 rounded text-white"
                value={status}
                onChange={(e) => setStatus(e.target.value as BatchStatus)}
              >
                {batchStatusOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <input
                className="w-full p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500"
                placeholder="Destination"
                value={statusDestination}
                onChange={(e) => setStatusDestination(e.target.value)}
              />
              
              <button
                disabled={loading}
                onClick={updateBatchStatus}
                className="w-full px-4 py-3 rounded bg-purple-600 hover:bg-purple-700 text-white font-medium disabled:opacity-50"
              >
                {loading ? "Processing..." : "Update Status"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GENERATE DDS PAGE */}
      {currentPage === 'generate-dds' && (
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-6 text-indigo-400">📄 Generate DDS Report</h2>
          <div className="p-6 bg-slate-800 border border-slate-700 rounded-lg">
            <div className="space-y-4 mb-6">
              <input
                className="w-full p-3 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500"
                placeholder="Batch ID"
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
              />
              
              <button
                disabled={loading}
                onClick={generateDDS}
                className="w-full px-4 py-3 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50"
              >
                {loading ? "Generating..." : "Generate DDS Report"}
              </button>
            </div>

            {ddsReport && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-3 text-indigo-400">DDS Report</h3>
                <pre className="p-4 bg-slate-900 rounded text-xs overflow-auto max-h-96 border border-slate-700 text-slate-300">
                  {JSON.stringify(ddsReport, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Helper functions
function parseCommodityType(type: any): string {
  if (type.cocoa) return 'Cocoa';
  if (type.coffee) return 'Coffee';
  if (type.palmOil) return 'Palm Oil';
  if (type.soy) return 'Soy';
  if (type.cattle) return 'Cattle';
  if (type.rubber) return 'Rubber';
  if (type.timber) return 'Timber';
  return 'Unknown';
}

function parseStatus(status: any): string {
  if (status.harvested) return 'Harvested';
  if (status.processing) return 'Processing';
  if (status.inTransit) return 'In Transit';
  if (status.delivered) return 'Delivered';
  return 'Unknown';
}

function parseComplianceStatus(status: any): string {
  if (status.compliant) return 'Compliant';
  if (status.pendingReview) return 'Pending Review';
  if (status.nonCompliant) return 'Non-Compliant';
  return 'Unknown';
}