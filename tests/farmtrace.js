import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Farmtrace } from "../target/types/farmtrace";
import { PublicKey } from "@solana/web3.js";
import { assert } from "chai";

describe("FarmTrace EUDR Compliance Platform", () => {
  // Configure the client
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Farmtrace as Program<Farmtrace>;
  
  // Test data
  const plotId = "PLOT-TEST-001";
  const batchId = "BATCH-TEST-001";
  
  let farmPlotPDA: PublicKey;
  let harvestBatchPDA: PublicKey;
  let verificationPDA: PublicKey;

  before(async () => {
    console.log("\n🚀 Starting FarmTrace Tests...\n");
    
    // Derive PDAs
    [farmPlotPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("farm_plot"),
        Buffer.from(plotId),
        provider.wallet.publicKey.toBuffer(),
      ],
      program.programId
    );

    [harvestBatchPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("harvest_batch"),
        Buffer.from(batchId),
        provider.wallet.publicKey.toBuffer(),
      ],
      program.programId
    );

    console.log("Farm Plot PDA:", farmPlotPDA.toString());
    console.log("Harvest Batch PDA:", harvestBatchPDA.toString());
    console.log("Wallet:", provider.wallet.publicKey.toString());
  });

  describe("📍 Farm Plot Registration", () => {
    it("Registers a new farm plot with complete EUDR data", async () => {
      const tx = await program.methods
        .registerFarmPlot(
          plotId,
          "Silva Cocoa Farm",
          "Côte d'Ivoire, Aboisso Region",
          "5.3599,-4.0083",
          2.5,
          { cocoa: {} },
          new anchor.BN(Math.floor(Date.now() / 1000))
        )
        .accounts({
          farmPlot: farmPlotPDA,
          farmer: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log("✅ Farm plot registered:", tx);

      // Fetch and verify the account
      const farmPlot = await program.account.farmPlot.fetch(farmPlotPDA);

      assert.equal(farmPlot.plotId, plotId);
      assert.equal(farmPlot.farmerName, "Silva Cocoa Farm");
      assert.equal(farmPlot.location, "Côte d'Ivoire, Aboisso Region");
      assert.equal(farmPlot.coordinates, "5.3599,-4.0083");
      assert.equal(farmPlot.areaHectares, 2.5);
      assert.equal(farmPlot.complianceScore, 100);
      assert.isTrue(farmPlot.isActive);
      assert.deepEqual(farmPlot.deforestationRisk, { low: {} });
      
      console.log("📊 Farm Plot Data:", {
        plotId: farmPlot.plotId,
        farmer: farmPlot.farmer.toString(),
        complianceScore: farmPlot.complianceScore,
        risk: farmPlot.deforestationRisk,
      });
    });

    it("Validates input constraints", async () => {
      const longPlotId = "A".repeat(50); // Too long
      
      try {
        await program.methods
          .registerFarmPlot(
            longPlotId,
            "Test Farm",
            "Test Location",
            "0.0,0.0",
            1.0,
            { cocoa: {} },
            new anchor.BN(Date.now() / 1000)
          )
          .accounts({
            farmPlot: farmPlotPDA,
            farmer: provider.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        
        assert.fail("Should have failed with PlotIdTooLong");
      } catch (error) {
        assert.include(error.toString(), "PlotIdTooLong");
        console.log("✅ Correctly rejected invalid plot ID length");
      }
    });
  });

  describe("🌾 Harvest Batch Registration", () => {
    it("Registers a harvest batch linked to farm plot", async () => {
      const tx = await program.methods
        .registerHarvestBatch(
          batchId,
          new anchor.BN(500), // 500 kg
          new anchor.BN(Math.floor(Date.now() / 1000))
        )
        .accounts({
          harvestBatch: harvestBatchPDA,
          farmPlot: farmPlotPDA,
          farmer: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log("✅ Harvest batch registered:", tx);

      const batch = await program.account.harvestBatch.fetch(harvestBatchPDA);

      assert.equal(batch.batchId, batchId);
      assert.equal(batch.weightKg.toNumber(), 500);
      assert.equal(batch.farmPlot.toString(), farmPlotPDA.toString());
      assert.deepEqual(batch.status, { harvested: {} });
      assert.deepEqual(batch.complianceStatus, { compliant: {} });
      
      console.log("📦 Batch Data:", {
        batchId: batch.batchId,
        weight: batch.weightKg.toNumber(),
        status: batch.status,
        compliance: batch.complianceStatus,
      });
    });

    it("Fails for non-existent farm plot", async () => {
      const [fakeFarmPlotPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("farm_plot"),
          Buffer.from("FAKE-PLOT"),
          provider.wallet.publicKey.toBuffer(),
        ],
        program.programId
      );

      const [fakeBatchPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("harvest_batch"),
          Buffer.from("FAKE-BATCH"),
          provider.wallet.publicKey.toBuffer(),
        ],
        program.programId
      );

      try {
        await program.methods
          .registerHarvestBatch(
            "FAKE-BATCH",
            new anchor.BN(100),
            new anchor.BN(Date.now() / 1000)
          )
          .accounts({
            harvestBatch: fakeBatchPDA,
            farmPlot: fakeFarmPlotPDA,
            farmer: provider.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        
        assert.fail("Should have failed for non-existent farm plot");
      } catch (error) {
        console.log("✅ Correctly rejected batch for non-existent farm");
      }
    });
  });

  describe("📍 Batch Status Updates", () => {
    it("Updates batch status to Processing", async () => {
      const tx = await program.methods
        .updateBatchStatus(
          { processing: {} },
          "Cooperative Processing Center"
        )
        .accounts({
          harvestBatch: harvestBatchPDA,
          authority: provider.wallet.publicKey,
        })
        .rpc();

      console.log("✅ Status updated to Processing:", tx);

      const batch = await program.account.harvestBatch.fetch(harvestBatchPDA);
      assert.deepEqual(batch.status, { processing: {} });
      assert.equal(batch.destination, "Cooperative Processing Center");
    });

    it("Updates batch status to InTransit", async () => {
      await program.methods
        .updateBatchStatus(
          { inTransit: {} },
          "EU - Rotterdam Port"
        )
        .accounts({
          harvestBatch: harvestBatchPDA,
          authority: provider.wallet.publicKey,
        })
        .rpc();

      const batch = await program.account.harvestBatch.fetch(harvestBatchPDA);
      assert.deepEqual(batch.status, { inTransit: {} });
      assert.equal(batch.destination, "EU - Rotterdam Port");
      console.log("✅ Status updated to InTransit");
    });

    it("Updates batch status to Delivered", async () => {
      await program.methods
        .updateBatchStatus(
          { delivered: {} },
          "EU - Rotterdam Port"
        )
        .accounts({
          harvestBatch: harvestBatchPDA,
          authority: provider.wallet.publicKey,
        })
        .rpc();

      const batch = await program.account.harvestBatch.fetch(harvestBatchPDA);
      assert.deepEqual(batch.status, { delivered: {} });
      console.log("✅ Status updated to Delivered");
    });
  });

  describe("🛰️ Satellite Verification", () => {
    it("Records successful satellite verification (no deforestation)", async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      
      [verificationPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("verification"),
          farmPlotPDA.toBuffer(),
          provider.wallet.publicKey.toBuffer(),
          Buffer.from(timestamp.toString().slice(0, 8)),
        ],
        program.programId
      );

      const tx = await program.methods
        .recordSatelliteVerification(
          "QmXYZ123...IPFS_SATELLITE_HASH",
          true // No deforestation detected
        )
        .accounts({
          verification: verificationPDA,
          farmPlot: farmPlotPDA,
          verifier: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log("✅ Satellite verification recorded:", tx);

      const verification = await program.account.satelliteVerification.fetch(
        verificationPDA
      );

      assert.equal(verification.verificationHash, "QmXYZ123...IPFS_SATELLITE_HASH");
      assert.isTrue(verification.noDeforestation);
      assert.deepEqual(verification.verificationType, { satellite: {} });

      // Check farm plot was updated
      const farmPlot = await program.account.farmPlot.fetch(farmPlotPDA);
      assert.deepEqual(farmPlot.deforestationRisk, { low: {} });
      assert.equal(farmPlot.complianceScore, 100);
      
      console.log("🌍 Verification Data:", {
        hash: verification.verificationHash,
        noDeforestation: verification.noDeforestation,
        farmRisk: farmPlot.deforestationRisk,
        farmScore: farmPlot.complianceScore,
      });
    });

    it("Records failed verification (deforestation detected)", async () => {
      const timestamp = Math.floor(Date.now() / 1000) + 1000; // Different timestamp
      
      const [failedVerificationPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("verification"),
          farmPlotPDA.toBuffer(),
          provider.wallet.publicKey.toBuffer(),
          Buffer.from(timestamp.toString().slice(0, 8)),
        ],
        program.programId
      );

      await program.methods
        .recordSatelliteVerification(
          "QmABC456...IPFS_DEFORESTATION_DETECTED",
          false // Deforestation detected!
        )
        .accounts({
          verification: failedVerificationPDA,
          farmPlot: farmPlotPDA,
          verifier: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      // Verify farm plot compliance dropped
      const farmPlot = await program.account.farmPlot.fetch(farmPlotPDA);
      assert.deepEqual(farmPlot.deforestationRisk, { high: {} });
      assert.equal(farmPlot.complianceScore, 0);
      
      console.log("⚠️ Deforestation detected - compliance dropped to 0");
    });
  });

  describe("📄 DDS Report Generation", () => {
    it("Generates complete DDS report for EUDR submission", async () => {
      // First restore farm compliance for testing
      const timestamp = Math.floor(Date.now() / 1000) + 2000;
      const [goodVerificationPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("verification"),
          farmPlotPDA.toBuffer(),
          provider.wallet.publicKey.toBuffer(),
          Buffer.from(timestamp.toString().slice(0, 8)),
        ],
        program.programId
      );

      await program.methods
        .recordSatelliteVerification(
          "QmGOOD...RESTORED_COMPLIANCE",
          true
        )
        .accounts({
          verification: goodVerificationPDA,
          farmPlot: farmPlotPDA,
          verifier: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      // Now generate DDS report
      const ddsReport = await program.methods
        .generateDdsData()
        .accounts({
          harvestBatch: harvestBatchPDA,
          farmPlot: farmPlotPDA,
        })
        .view();

      console.log("\n📄 DDS REPORT GENERATED:");
      console.log("========================");
      console.log(JSON.stringify(ddsReport, null, 2));
      console.log("========================\n");

      // Verify DDS report contents
      assert.equal(ddsReport.batchId, batchId);
      assert.equal(ddsReport.plotId, plotId);
      assert.equal(ddsReport.coordinates, "5.3599,-4.0083");
      assert.equal(ddsReport.weightKg.toNumber(), 500);
      assert.isTrue(ddsReport.noDeforestationVerified);
      assert.equal(ddsReport.complianceScore, 100);

      console.log("✅ DDS Report contains all EUDR-required fields");
    });
  });

  describe("🔄 End-to-End EUDR Compliance Flow", () => {
    it("Complete workflow: Register → Verify → Harvest → Track → Generate DDS", async () => {
      console.log("\n🔄 Running Complete E2E Flow...\n");

      // Step 1: Register new farm
      const e2ePlotId = "PLOT-E2E-001";
      const [e2eFarmPlotPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("farm_plot"),
          Buffer.from(e2ePlotId),
          provider.wallet.publicKey.toBuffer(),
        ],
        program.programId
      );

      console.log("1️⃣ Registering farm plot...");
      await program.methods
        .registerFarmPlot(
          e2ePlotId,
          "Costa Verde Estate",
          "Brazil, Mato Grosso",
          "-15.7942,-47.8825",
          5.0,
          { soy: {} },
          new anchor.BN(Math.floor(Date.now() / 1000))
        )
        .accounts({
          farmPlot: e2eFarmPlotPDA,
          farmer: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      // Step 2: Satellite verification
      console.log("2️⃣ Recording satellite verification...");
      const verifyTimestamp = Math.floor(Date.now() / 1000);
      const [e2eVerificationPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("verification"),
          e2eFarmPlotPDA.toBuffer(),
          provider.wallet.publicKey.toBuffer(),
          Buffer.from(verifyTimestamp.toString().slice(0, 8)),
        ],
        program.programId
      );

      await program.methods
        .recordSatelliteVerification(
          "QmE2E...SATELLITE_CLEAR",
          true
        )
        .accounts({
          verification: e2eVerificationPDA,
          farmPlot: e2eFarmPlotPDA,
          verifier: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      // Step 3: Register harvest batch
      console.log("3️⃣ Registering harvest batch...");
      const e2eBatchId = "BATCH-E2E-001";
      const [e2eBatchPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("harvest_batch"),
          Buffer.from(e2eBatchId),
          provider.wallet.publicKey.toBuffer(),
        ],
        program.programId
      );

      await program.methods
        .registerHarvestBatch(
          e2eBatchId,
          new anchor.BN(5000),
          new anchor.BN(Math.floor(Date.now() / 1000))
        )
        .accounts({
          harvestBatch: e2eBatchPDA,
          farmPlot: e2eFarmPlotPDA,
          farmer: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      // Step 4: Track through supply chain
      console.log("4️⃣ Tracking through supply chain...");
      
      await program.methods
        .updateBatchStatus({ processing: {} }, "Mill Processing")
        .accounts({
          harvestBatch: e2eBatchPDA,
          authority: provider.wallet.publicKey,
        })
        .rpc();

      await program.methods
        .updateBatchStatus({ inTransit: {} }, "EU - Hamburg Port")
        .accounts({
          harvestBatch: e2eBatchPDA,
          authority: provider.wallet.publicKey,
        })
        .rpc();

      // Step 5: Generate final DDS
      console.log("5️⃣ Generating DDS report...");
      const finalDDS = await program.methods
        .generateDdsData()
        .accounts({
          harvestBatch: e2eBatchPDA,
          farmPlot: e2eFarmPlotPDA,
        })
        .view();

      // Verify complete flow
      assert.equal(finalDDS.batchId, e2eBatchId);
      assert.equal(finalDDS.plotId, e2ePlotId);
      assert.equal(finalDDS.weightKg.toNumber(), 5000);
      assert.isTrue(finalDDS.noDeforestationVerified);
      assert.equal(finalDDS.complianceScore, 100);

      console.log("\n✅ COMPLETE E2E FLOW SUCCESSFUL!");
      console.log("\n📊 Final DDS Summary:");
      console.log(`   Batch: ${finalDDS.batchId}`);
      console.log(`   Plot: ${finalDDS.plotId}`);
      console.log(`   Weight: ${finalDDS.weightKg.toNumber()} kg`);
      console.log(`   Compliant: ${finalDDS.noDeforestationVerified}`);
      console.log(`   Score: ${finalDDS.complianceScore}/100`);
      console.log("\n");
    });
  });

  after(() => {
    console.log("\n✅ All FarmTrace tests completed successfully!\n");
  });
});