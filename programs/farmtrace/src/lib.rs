use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount, mint_to, MintTo},
};
use mpl_token_metadata::{
    instructions::{CreateV1, CreateV1InstructionArgs},
    types::{Creator, TokenStandard},
};

declare_id!("3JrzoVQatJZz6kAeX7T47SfbRnesm3HfU1BBKxcFKkxx");

#[program]
pub mod farmtrace {
    use super::*;

    /// Register a new farm plot with geolocation data and mint NFT
    /// This creates the foundational NFT for EUDR compliance
    pub fn register_farm_plot(
        ctx: Context<RegisterFarmPlot>,
        plot_id: String,
        farmer_name: String,
        location: String,
        coordinates: String,
        area_hectares: f64,
        commodity_type: CommodityType,
        registration_timestamp: i64,
    ) -> Result<()> {
        let farm_plot = &mut ctx.accounts.farm_plot;
        
        // Validate inputs
        require!(plot_id.len() <= 32, ErrorCode::PlotIdTooLong);
        require!(coordinates.len() <= 128, ErrorCode::InvalidCoordinates);
        require!(area_hectares > 0.0, ErrorCode::InvalidArea);
        
        // Initialize farm plot data
        farm_plot.plot_id = plot_id.clone();
        farm_plot.farmer = ctx.accounts.farmer.key();
        farm_plot.farmer_name = farmer_name.clone();
        farm_plot.location = location.clone();
        farm_plot.coordinates = coordinates.clone();
        farm_plot.area_hectares = area_hectares;
        farm_plot.commodity_type = commodity_type;
        farm_plot.registration_timestamp = registration_timestamp;
        farm_plot.deforestation_risk = DeforestationRisk::Low;
        farm_plot.compliance_score = 100;
        farm_plot.last_verified = Clock::get()?.unix_timestamp;
        farm_plot.is_active = true;
        farm_plot.mint = ctx.accounts.mint.key();
        farm_plot.bump = ctx.bumps.farm_plot;
        
        // Mint 1 NFT token to farmer
        let farmer_key = ctx.accounts.farmer.key();
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"mint",
            plot_id.as_bytes(),
            farmer_key.as_ref(),
            &[ctx.bumps.mint],
        ]];
        
        mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.token_account.to_account_info(),
                    authority: ctx.accounts.mint.to_account_info(),
                },
                signer_seeds,
            ),
            1,
        )?;
        
        // Create metadata using mpl-token-metadata v4
        let commodity_str = match commodity_type {
            CommodityType::Cocoa => "Cocoa",
            CommodityType::Coffee => "Coffee",
            CommodityType::PalmOil => "Palm Oil",
            CommodityType::Soy => "Soy",
            CommodityType::Cattle => "Cattle",
            CommodityType::Rubber => "Rubber",
            CommodityType::Timber => "Timber",
        };
        
        let metadata_title = format!("FarmTrace: {}", plot_id);
        let metadata_uri = format!(
            "https://farmtrace.io/api/metadata/{}",
            ctx.accounts.mint.key()
        );
        
        // Use CreateV1 instruction from mpl-token-metadata v4
        let create_metadata_accounts_ix = CreateV1 {
            metadata: ctx.accounts.metadata.key(),
            master_edition: None,
            mint: (ctx.accounts.mint.key(), true),
            authority: ctx.accounts.mint.key(),
            payer: ctx.accounts.farmer.key(),
            update_authority: (ctx.accounts.mint.key(), true),
            system_program: ctx.accounts.system_program.key(),
            sysvar_instructions: anchor_lang::solana_program::sysvar::instructions::ID,
            spl_token_program: Some(ctx.accounts.token_program.key()),
        };
        
        let create_args = CreateV1InstructionArgs {
            name: metadata_title,
            symbol: "FARM".to_string(),
            uri: metadata_uri,
            seller_fee_basis_points: 0,
            creators: Some(vec![
                Creator {
                    address: ctx.accounts.farmer.key(),
                    verified: true,
                    share: 100,
                }
            ]),
            primary_sale_happened: false,
            is_mutable: true,
            token_standard: TokenStandard::NonFungible,
            collection: None,
            uses: None,
            collection_details: None,
            rule_set: None,
            decimals: Some(0),
            print_supply: None,
        };
        
        let create_ix = create_metadata_accounts_ix.instruction(create_args);
        
        anchor_lang::solana_program::program::invoke_signed(
            &create_ix,
            &[
                ctx.accounts.metadata.to_account_info(),
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.farmer.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.metadata_program.to_account_info(),
                ctx.accounts.sysvar_instructions.to_account_info(),
            ],
            signer_seeds,
        )?;
        
        emit!(FarmPlotRegistered {
            plot_id,
            farmer: farm_plot.farmer,
            mint: farm_plot.mint,
            coordinates: farm_plot.coordinates.clone(),
            timestamp: registration_timestamp,
        });
        
        msg!("Farm plot registered successfully with NFT!");
        Ok(())
    }

    /// Register a harvest batch linked to a farm plot
    /// This creates the supply chain traceability token
    pub fn register_harvest_batch(
        ctx: Context<RegisterHarvestBatch>,
        batch_id: String,
        weight_kg: u64,
        harvest_timestamp: i64,
    ) -> Result<()> {
        let batch = &mut ctx.accounts.harvest_batch;
        let farm_plot = &ctx.accounts.farm_plot;
        
        // Verify farm plot is compliant (EUDR requirement)
        require!(
            farm_plot.is_active && farm_plot.compliance_score >= 70,
            ErrorCode::NonCompliantFarm
        );
        
        require!(batch_id.len() <= 32, ErrorCode::BatchIdTooLong);
        require!(weight_kg > 0, ErrorCode::InvalidWeight);
        
        // Initialize harvest batch
        batch.batch_id = batch_id.clone();
        batch.farm_plot = farm_plot.key();
        batch.farmer = ctx.accounts.farmer.key();
        batch.weight_kg = weight_kg;
        batch.harvest_timestamp = harvest_timestamp;
        batch.commodity_type = farm_plot.commodity_type;
        batch.status = BatchStatus::Harvested;
        batch.compliance_status = ComplianceStatus::Compliant;
        batch.destination = String::new();
        batch.bump = ctx.bumps.harvest_batch;
        
        emit!(HarvestBatchRegistered {
            batch_id,
            farm_plot: batch.farm_plot,
            weight_kg,
            timestamp: harvest_timestamp,
        });
        
        msg!("Harvest batch registered successfully!");
        Ok(())
    }

    /// Record satellite verification for deforestation monitoring
    /// This is the oracle integration for EUDR compliance
    pub fn record_satellite_verification(
        ctx: Context<RecordSatelliteVerification>,
        verification_hash: String,
        no_deforestation: bool,
        verification_timestamp: i64,
    ) -> Result<()> {
        let farm_plot = &mut ctx.accounts.farm_plot;
        let verification = &mut ctx.accounts.verification;
        
        require!(verification_hash.len() <= 64, ErrorCode::InvalidHash);
        
        // Store verification data
        verification.farm_plot = farm_plot.key();
        verification.verifier = ctx.accounts.verifier.key();
        verification.verification_timestamp = verification_timestamp;
        verification.verification_hash = verification_hash.clone();
        verification.no_deforestation = no_deforestation;
        verification.verification_type = VerificationType::Satellite;
        verification.bump = ctx.bumps.verification;
        
        // Update farm compliance based on verification
        if !no_deforestation {
            farm_plot.deforestation_risk = DeforestationRisk::High;
            farm_plot.compliance_score = 0;
            msg!("WARNING: Deforestation detected!");
        } else {
            farm_plot.deforestation_risk = DeforestationRisk::Low;
            if farm_plot.compliance_score < 100 {
                farm_plot.compliance_score = 100;
            }
        }
        
        farm_plot.last_verified = verification.verification_timestamp;
        
        emit!(SatelliteVerificationRecorded {
            farm_plot: farm_plot.key(),
            verification_hash,
            compliant: no_deforestation,
            timestamp: verification.verification_timestamp,
        });
        
        msg!("Satellite verification recorded!");
        Ok(())
    }

    /// Generate DDS (Due Diligence Statement) data for EUDR
    /// This compiles all required data for regulatory submission
    pub fn generate_dds_data(
        ctx: Context<GenerateDDSData>,
    ) -> Result<DDSReport> {
        let batch = &ctx.accounts.harvest_batch;
        let farm_plot = &ctx.accounts.farm_plot;
        
        let dds_report = DDSReport {
            batch_id: batch.batch_id.clone(),
            plot_id: farm_plot.plot_id.clone(),
            farmer: farm_plot.farmer,
            coordinates: farm_plot.coordinates.clone(),
            commodity_type: farm_plot.commodity_type,
            harvest_timestamp: batch.harvest_timestamp,
            weight_kg: batch.weight_kg,
            no_deforestation_verified: farm_plot.deforestation_risk != DeforestationRisk::High,
            compliance_score: farm_plot.compliance_score,
            last_verified: farm_plot.last_verified,
            registration_timestamp: farm_plot.registration_timestamp,
        };
        
        emit!(DDSReportGenerated {
            batch_id: dds_report.batch_id.clone(),
            compliance_score: dds_report.compliance_score,
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        msg!("DDS report generated successfully!");
        Ok(dds_report)
    }
    
    /// Update batch status as it moves through supply chain
    /// Tracks: Harvested → Processing → InTransit → Delivered
    pub fn update_batch_status(
        ctx: Context<UpdateBatchStatus>,
        new_status: BatchStatus,
        destination: String,
        update_timestamp: i64, // Add timestamp as parameter
    ) -> Result<()> {
        let batch = &mut ctx.accounts.harvest_batch;
        let update = &mut ctx.accounts.status_update;
        
        require!(destination.len() <= 64, ErrorCode::DestinationTooLong);
        
        // Update the main batch account
        batch.status = new_status;
        batch.destination = destination.clone();
        
        // Store the historical update
        update.batch_id = batch.batch_id.clone();
        update.status = new_status;
        update.destination = destination.clone();
        update.timestamp = update_timestamp;
        update.bump = ctx.bumps.status_update;
        
        emit!(BatchStatusUpdated {
            batch_id: batch.batch_id.clone(),
            new_status: batch.status,
            destination,
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        msg!("Batch status updated successfully!");
        Ok(())
    }
}


// ============================================================================
// Account Structures
// ============================================================================

#[account]
pub struct FarmPlot {
    pub plot_id: String,                // max 32
    pub farmer: Pubkey,
    pub farmer_name: String,            // max 64
    pub location: String,               // max 64
    pub coordinates: String,            // max 128
    pub area_hectares: f64,
    pub commodity_type: CommodityType,
    pub registration_timestamp: i64,
    pub deforestation_risk: DeforestationRisk,
    pub compliance_score: u8,
    pub last_verified: i64,
    pub is_active: bool,
    pub mint: Pubkey,                   // NFT mint address
    pub bump: u8,
}

#[account]
pub struct HarvestBatch {
    pub batch_id: String,
    pub farm_plot: Pubkey,
    pub farmer: Pubkey,
    pub weight_kg: u64,
    pub harvest_timestamp: i64,
    pub commodity_type: CommodityType,
    pub status: BatchStatus,
    pub compliance_status: ComplianceStatus,
    pub destination: String,
    pub bump: u8,
}

#[account]
pub struct SatelliteVerification {
    pub farm_plot: Pubkey,
    pub verifier: Pubkey,
    pub verification_timestamp: i64,
    pub verification_hash: String,
    pub no_deforestation: bool,
    pub verification_type: VerificationType,
    pub bump: u8,
}

// ============================================================================
// Context Structures (with PDA seeds)
// ============================================================================

#[derive(Accounts)]
#[instruction(plot_id: String)]
pub struct RegisterFarmPlot<'info> {
    #[account(
        init,
        payer = farmer,
        space = 8 + 432,
        seeds = [b"farm_plot", plot_id.as_bytes(), farmer.key().as_ref()],
        bump
    )]
    pub farm_plot: Account<'info, FarmPlot>,
    
    #[account(
        init,
        payer = farmer,
        mint::decimals = 0,
        mint::authority = mint,
        seeds = [b"mint", plot_id.as_bytes(), farmer.key().as_ref()],
        bump
    )]
    pub mint: Account<'info, Mint>,
    
    #[account(
        init,
        payer = farmer,
        associated_token::mint = mint,
        associated_token::authority = farmer,
    )]
    pub token_account: Account<'info, TokenAccount>,
    
    /// CHECK: This is validated by Metaplex
    #[account(mut)]
    pub metadata: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub farmer: Signer<'info>,
    
    /// CHECK: Metaplex Token Metadata Program
    pub metadata_program: UncheckedAccount<'info>,
    
    /// CHECK: Sysvar instructions account for Metaplex CPI
    pub sysvar_instructions: UncheckedAccount<'info>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(batch_id: String)]
pub struct RegisterHarvestBatch<'info> {
    #[account(
        init,
        payer = farmer,
        space = 8 + 250,
        seeds = [b"harvest_batch", batch_id.as_bytes(), farmer.key().as_ref()],
        bump
    )]
    pub harvest_batch: Account<'info, HarvestBatch>,
    
    #[account(
        seeds = [b"farm_plot", farm_plot.plot_id.as_bytes(), farmer.key().as_ref()],
        bump = farm_plot.bump
    )]
    pub farm_plot: Account<'info, FarmPlot>,
    
    #[account(mut)]
    pub farmer: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[account]
pub struct BatchStatusUpdate {
    pub batch_id: String,
    pub status: BatchStatus,
    pub destination: String,
    pub timestamp: i64,
    pub bump: u8,
}

#[derive(Accounts)]
#[instruction(new_status: BatchStatus, destination: String, update_timestamp: i64)]
pub struct UpdateBatchStatus<'info> {
    #[account(mut)]
    pub harvest_batch: Account<'info, HarvestBatch>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + 150,
        seeds = [
            b"batch_update",
            harvest_batch.batch_id.as_bytes(),
            &update_timestamp.to_le_bytes()
        ],
        bump
    )]
    pub status_update: Account<'info, BatchStatusUpdate>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(verification_hash: String, no_deforestation: bool, verification_timestamp: i64)]
pub struct RecordSatelliteVerification<'info> {
    #[account(
        init,
        payer = verifier,
        space = 8 + 180,
        seeds = [
            b"verification",
            farm_plot.key().as_ref(),
            verifier.key().as_ref(),
            &verification_timestamp.to_le_bytes()
        ],
        bump
    )]
    pub verification: Account<'info, SatelliteVerification>,
    
    #[account(
        mut,
        seeds = [b"farm_plot", farm_plot.plot_id.as_bytes(), farm_plot.farmer.as_ref()],
        bump = farm_plot.bump
    )]
    pub farm_plot: Account<'info, FarmPlot>,
    
    #[account(mut)]
    pub verifier: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct GenerateDDSData<'info> {
    #[account(
        seeds = [b"harvest_batch", harvest_batch.batch_id.as_bytes(), harvest_batch.farmer.as_ref()],
        bump = harvest_batch.bump
    )]
    pub harvest_batch: Account<'info, HarvestBatch>,
    
    #[account(
        seeds = [b"farm_plot", farm_plot.plot_id.as_bytes(), farm_plot.farmer.as_ref()],
        bump = farm_plot.bump
    )]
    pub farm_plot: Account<'info, FarmPlot>,
}

// ============================================================================
// Enums
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum CommodityType {
    Cocoa,
    Coffee,
    PalmOil,
    Soy,
    Cattle,
    Rubber,
    Timber,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum DeforestationRisk {
    Low,
    Medium,
    High,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum BatchStatus {
    Harvested,
    Processing,
    InTransit,
    Delivered,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum ComplianceStatus {
    Compliant,
    PendingReview,
    NonCompliant,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum VerificationType {
    Satellite,
    Audit,
    Manual,
}

// ============================================================================
// Events (for indexing and monitoring)
// ============================================================================

#[event]
pub struct FarmPlotRegistered {
    pub plot_id: String,
    pub farmer: Pubkey,
    pub mint: Pubkey,
    pub coordinates: String,
    pub timestamp: i64,
}

#[event]
pub struct HarvestBatchRegistered {
    pub batch_id: String,
    pub farm_plot: Pubkey,
    pub weight_kg: u64,
    pub timestamp: i64,
}

#[event]
pub struct BatchStatusUpdated {
    pub batch_id: String,
    pub new_status: BatchStatus,
    pub destination: String,
    pub timestamp: i64,
}

#[event]
pub struct SatelliteVerificationRecorded {
    pub farm_plot: Pubkey,
    pub verification_hash: String,
    pub compliant: bool,
    pub timestamp: i64,
}

#[event]
pub struct DDSReportGenerated {
    pub batch_id: String,
    pub compliance_score: u8,
    pub timestamp: i64,
}

// ============================================================================
// DDS Report Structure
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct DDSReport {
    pub batch_id: String,
    pub plot_id: String,
    pub farmer: Pubkey,
    pub coordinates: String,
    pub commodity_type: CommodityType,
    pub harvest_timestamp: i64,
    pub weight_kg: u64,
    pub no_deforestation_verified: bool,
    pub compliance_score: u8,
    pub last_verified: i64,
    pub registration_timestamp: i64,
}

// ============================================================================
// Error Codes
// ============================================================================

#[error_code]
pub enum ErrorCode {
    #[msg("Farm is not compliant with EUDR requirements")]
    NonCompliantFarm,
    #[msg("Plot ID is too long (max 32 characters)")]
    PlotIdTooLong,
    #[msg("Batch ID is too long (max 32 characters)")]
    BatchIdTooLong,
    #[msg("Invalid coordinates format")]
    InvalidCoordinates,
    #[msg("Invalid area (must be > 0)")]
    InvalidArea,
    #[msg("Invalid weight (must be > 0)")]
    InvalidWeight,
    #[msg("Destination string is too long")]
    DestinationTooLong,
    #[msg("Invalid verification hash")]
    InvalidHash,
}