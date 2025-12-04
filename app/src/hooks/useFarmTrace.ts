import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Program, AnchorProvider, web3, BN, Idl } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { useState, useCallback, useMemo } from 'react';
import idl from '../idl/farmtrace.json';

const PROGRAM_ID = new PublicKey(import.meta.env.VITE_PROGRAM_ID || 'Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS');

export interface FarmPlotData {
  plotId: string;
  farmerName: string;
  location: string;
  coordinates: string;
  areaHectares: number;
  commodityType: string;
  complianceScore: number;
  deforestationRisk: string;
  lastVerified: Date;
  isActive: boolean;
}

export interface HarvestBatchData {
  batchId: string;
  farmPlot: string;
  weightKg: number;
  harvestTimestamp: Date;
  status: string;
  complianceStatus: string;
  destination: string;
}

export interface DDSReport {
  batchId: string;
  plotId: string;
  farmer: string;
  coordinates: string;
  commodityType: string;
  harvestTimestamp: Date;
  weightKg: number;
  noDeforestationVerified: boolean;
  complianceScore: number;
  lastVerified: Date;
  registrationTimestamp: Date;
}

export const useFarmTrace = () => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get Anchor provider
  const provider = useMemo(() => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      return null;
    }
    return new AnchorProvider(
      connection,
      wallet as any,
      { commitment: 'confirmed' }
    );
  }, [connection, wallet]);

  // Get program instance
  const program = useMemo(() => {
    if (!provider) return null;
    return new Program(idl as Idl, PROGRAM_ID, provider);
  }, [provider]);

  // Derive PDA for farm plot
  const getFarmPlotPDA = useCallback(
    (plotId: string, farmer: PublicKey) => {
      return PublicKey.findProgramAddressSync(
        [
          Buffer.from('farm_plot'),
          Buffer.from(plotId),
          farmer.toBuffer(),
        ],
        PROGRAM_ID
      );
    },
    []
  );

  // Derive PDA for harvest batch
  const getHarvestBatchPDA = useCallback(
    (batchId: string, farmer: PublicKey) => {
      return PublicKey.findProgramAddressSync(
        [
          Buffer.from('harvest_batch'),
          Buffer.from(batchId),
          farmer.toBuffer(),
        ],
        PROGRAM_ID
      );
    },
    []
  );

  // Register a new farm plot
  const registerFarmPlot = useCallback(
    async (data: {
      plotId: string;
      farmerName: string;
      location: string;
      coordinates: string;
      areaHectares: number;
      commodityType: number;
    }) => {
      if (!program || !wallet.publicKey) {
        throw new Error('Wallet not connected');
      }

      setLoading(true);
      setError(null);

      try {
        const [farmPlotPDA] = getFarmPlotPDA(data.plotId, wallet.publicKey);

        const tx = await program.methods
          .registerFarmPlot(
            data.plotId,
            data.farmerName,
            data.location,
            data.coordinates,
            data.areaHectares,
            getCommodityEnum(data.commodityType),
            new BN(Math.floor(Date.now() / 1000))
          )
          .accounts({
            farmPlot: farmPlotPDA,
            farmer: wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        console.log('Farm plot registered:', tx);
        return { success: true, signature: tx, farmPlotPDA: farmPlotPDA.toString() };
      } catch (err: any) {
        console.error('Error registering farm plot:', err);
        setError(err.message);
        return { success: false, error: err.message };
      } finally {
        setLoading(false);
      }
    },
    [program, wallet, getFarmPlotPDA]
  );

  // Register a harvest batch
  const registerHarvestBatch = useCallback(
    async (data: {
      batchId: string;
      plotId: string;
      weightKg: number;
    }) => {
      if (!program || !wallet.publicKey) {
        throw new Error('Wallet not connected');
      }

      setLoading(true);
      setError(null);

      try {
        const [farmPlotPDA] = getFarmPlotPDA(data.plotId, wallet.publicKey);
        const [harvestBatchPDA] = getHarvestBatchPDA(data.batchId, wallet.publicKey);

        const tx = await program.methods
          .registerHarvestBatch(
            data.batchId,
            new BN(data.weightKg),
            new BN(Math.floor(Date.now() / 1000))
          )
          .accounts({
            harvestBatch: harvestBatchPDA,
            farmPlot: farmPlotPDA,
            farmer: wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        console.log('Harvest batch registered:', tx);
        return { success: true, signature: tx, harvestBatchPDA: harvestBatchPDA.toString() };
      } catch (err: any) {
        console.error('Error registering harvest batch:', err);
        setError(err.message);
        return { success: false, error: err.message };
      } finally {
        setLoading(false);
      }
    },
    [program, wallet, getFarmPlotPDA, getHarvestBatchPDA]
  );

  // Update batch status
  const updateBatchStatus = useCallback(
    async (
      batchId: string,
      newStatus: number,
      destination: string
    ) => {
      if (!program || !wallet.publicKey) {
        throw new Error('Wallet not connected');
      }

      setLoading(true);
      setError(null);

      try {
        const [harvestBatchPDA] = getHarvestBatchPDA(batchId, wallet.publicKey);

        const tx = await program.methods
          .updateBatchStatus(
            getStatusEnum(newStatus),
            destination
          )
          .accounts({
            harvestBatch: harvestBatchPDA,
            authority: wallet.publicKey,
          })
          .rpc();

        console.log('Batch status updated:', tx);
        return { success: true, signature: tx };
      } catch (err: any) {
        console.error('Error updating batch status:', err);
        setError(err.message);
        return { success: false, error: err.message };
      } finally {
        setLoading(false);
      }
    },
    [program, wallet, getHarvestBatchPDA]
  );

  // Record satellite verification
  const recordSatelliteVerification = useCallback(
    async (
      plotId: string,
      verificationHash: string,
      noDeforestation: boolean
    ) => {
      if (!program || !wallet.publicKey) {
        throw new Error('Wallet not connected');
      }

      setLoading(true);
      setError(null);

      try {
        const [farmPlotPDA] = getFarmPlotPDA(plotId, wallet.publicKey);
        const timestamp = Math.floor(Date.now() / 1000);
        
        const [verificationPDA] = PublicKey.findProgramAddressSync(
          [
            Buffer.from('verification'),
            farmPlotPDA.toBuffer(),
            wallet.publicKey.toBuffer(),
            Buffer.from(timestamp.toString().slice(0, 8)),
          ],
          PROGRAM_ID
        );

        const tx = await program.methods
          .recordSatelliteVerification(verificationHash, noDeforestation)
          .accounts({
            verification: verificationPDA,
            farmPlot: farmPlotPDA,
            verifier: wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        console.log('Satellite verification recorded:', tx);
        return { success: true, signature: tx };
      } catch (err: any) {
        console.error('Error recording verification:', err);
        setError(err.message);
        return { success: false, error: err.message };
      } finally {
        setLoading(false);
      }
    },
    [program, wallet, getFarmPlotPDA]
  );

  // Fetch farm plot data
  const getFarmPlotData = useCallback(
    async (plotId: string, farmer?: PublicKey): Promise<FarmPlotData | null> => {
      if (!program) return null;

      try {
        const farmerKey = farmer || wallet.publicKey;
        if (!farmerKey) return null;

        const [farmPlotPDA] = getFarmPlotPDA(plotId, farmerKey);
        const farmPlotAccount = await program.account.farmPlot.fetch(farmPlotPDA);

        return {
          plotId: farmPlotAccount.plotId,
          farmerName: farmPlotAccount.farmerName,
          location: farmPlotAccount.location,
          coordinates: farmPlotAccount.coordinates,
          areaHectares: farmPlotAccount.areaHectares,
          commodityType: parseCommodityType(farmPlotAccount.commodityType),
          complianceScore: farmPlotAccount.complianceScore,
          deforestationRisk: parseRisk(farmPlotAccount.deforestationRisk),
          lastVerified: new Date(farmPlotAccount.lastVerified.toNumber() * 1000),
          isActive: farmPlotAccount.isActive,
        };
      } catch (err: any) {
        console.error('Error fetching farm plot:', err);
        return null;
      }
    },
    [program, wallet, getFarmPlotPDA]
  );

  // Fetch harvest batch data
  const getHarvestBatchData = useCallback(
    async (batchId: string, farmer?: PublicKey): Promise<HarvestBatchData | null> => {
      if (!program) return null;

      try {
        const farmerKey = farmer || wallet.publicKey;
        if (!farmerKey) return null;

        const [harvestBatchPDA] = getHarvestBatchPDA(batchId, farmerKey);
        const batchAccount = await program.account.harvestBatch.fetch(harvestBatchPDA);

        return {
          batchId: batchAccount.batchId,
          farmPlot: batchAccount.farmPlot.toString(),
          weightKg: batchAccount.weightKg.toNumber(),
          harvestTimestamp: new Date(batchAccount.harvestTimestamp.toNumber() * 1000),
          status: parseStatus(batchAccount.status),
          complianceStatus: parseComplianceStatus(batchAccount.complianceStatus),
          destination: batchAccount.destination,
        };
      } catch (err: any) {
        console.error('Error fetching harvest batch:', err);
        return null;
      }
    },
    [program, wallet, getHarvestBatchPDA]
  );

  // Generate DDS report
  const generateDDSReport = useCallback(
    async (batchId: string, plotId: string): Promise<DDSReport | null> => {
      if (!program || !wallet.publicKey) return null;

      setLoading(true);
      setError(null);

      try {
        const [farmPlotPDA] = getFarmPlotPDA(plotId, wallet.publicKey);
        const [harvestBatchPDA] = getHarvestBatchPDA(batchId, wallet.publicKey);

        const ddsData = await program.methods
          .generateDdsData()
          .accounts({
            harvestBatch: harvestBatchPDA,
            farmPlot: farmPlotPDA,
          })
          .view();

        return {
          batchId: ddsData.batchId,
          plotId: ddsData.plotId,
          farmer: ddsData.farmer.toString(),
          coordinates: ddsData.coordinates,
          commodityType: parseCommodityType(ddsData.commodityType),
          harvestTimestamp: new Date(ddsData.harvestTimestamp.toNumber() * 1000),
          weightKg: ddsData.weightKg.toNumber(),
          noDeforestationVerified: ddsData.noDeforestationVerified,
          complianceScore: ddsData.complianceScore,
          lastVerified: new Date(ddsData.lastVerified.toNumber() * 1000),
          registrationTimestamp: new Date(ddsData.registrationTimestamp.toNumber() * 1000),
        };
      } catch (err: any) {
        console.error('Error generating DDS report:', err);
        setError(err.message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [program, wallet, getFarmPlotPDA, getHarvestBatchPDA]
  );

  return {
    loading,
    error,
    registerFarmPlot,
    registerHarvestBatch,
    updateBatchStatus,
    recordSatelliteVerification,
    getFarmPlotData,
    getHarvestBatchData,
    generateDDSReport,
    getFarmPlotPDA,
    getHarvestBatchPDA,
  };
};

// Helper functions for enum conversion
function getCommodityEnum(type: number) {
  const types = ['cocoa', 'coffee', 'palmOil', 'soy', 'cattle', 'rubber', 'timber'];
  return { [types[type]]: {} };
}

function getStatusEnum(status: number) {
  const statuses = ['harvested', 'processing', 'inTransit', 'delivered'];
  return { [statuses[status]]: {} };
}

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

function parseRisk(risk: any): string {
  if (risk.low) return 'low';
  if (risk.medium) return 'medium';
  if (risk.high) return 'high';
  return 'unknown';
}

function parseStatus(status: any): string {
  if (status.harvested) return 'Harvested';
  if (status.processing) return 'Processing';
  if (status.inTransit) return 'In Transit';
  if (status.delivered) return 'Delivered';
  return 'Unknown';
}

function parseComplianceStatus(status: any): string {
  if (status.compliant) return 'compliant';
  if (status.pendingReview) return 'pending-review';
  if (status.nonCompliant) return 'non-compliant';
  return 'unknown';
}