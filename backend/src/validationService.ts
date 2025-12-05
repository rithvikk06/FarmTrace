// @ts-ignore
import ee from '@google/earthengine';
import { promisify } from 'util';
import path from 'path';
import { config } from 'dotenv';
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import type { Farmtrace } from './types/farmtrace';
import * as idl from "./idl/farmtrace.json";

type PolygonCoordinates = number[][];

const urlToBase64 = async (url: string): Promise<string> => {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer).toString('base64');
  };

config({ path: path.resolve(__dirname, '..', '.env') });

const GEE_SERVICE_ACCOUNT = process.env.GEE_SERVICE_ACCOUNT;
const GEE_PRIVATE_KEY_PATH = path.resolve(__dirname, '..', process.env.GEE_PRIVATE_KEY_PATH as string);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY as string;

if (!GEE_SERVICE_ACCOUNT || !GEE_PRIVATE_KEY_PATH || !GEMINI_API_KEY) {
    throw new Error("Missing environment variables. Please check your .env file.");
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const geminiProVision = genAI.getGenerativeModel({ model: "gemini-pro-vision" });


const initializeGEE = () => new Promise<void>((resolve, reject) => {
    console.log('[GEE_Service] Initializing Google Earth Engine...');
    ee.data.authenticateViaPrivateKey(
        {
            client_email: GEE_SERVICE_ACCOUNT,
            private_key: require('fs').readFileSync(GEE_PRIVATE_KEY_PATH, 'utf8')
        },
        () => {
            console.log('[GEE_Service] GEE authentication successful.');
            ee.initialize(null, null, () => {
                console.log('[GEE_Service] GEE initialization successful.');
                resolve();
            }, (err: any) => {
                console.error('[GEE_Service] GEE initialization failed:', err);
                reject(err);
            });
        },
        (err: any) => {
            console.error('[GEE_Service] GEE authentication failed:', err);
            reject(err);
        }
    );
});

const fetchImagesFromGEE = (polygonCoordinates: PolygonCoordinates[]): Promise<{ recent: string, historical: string }> => {
    return new Promise((resolve, reject) => {
        try {
            console.log('[GEE_Service] Fetching images for polygon:', polygonCoordinates);
            const polygon = ee.Geometry.Polygon(polygonCoordinates);
            const region = polygon.bounds();

            const collection = ee.ImageCollection('COPERNICUS/S2_SR')
                .filterBounds(region)
                .sort('CLOUDY_PIXEL_PERCENTAGE', false);

            const recentImage = collection
                .filterDate(ee.Date(Date.now()).advance(-1, 'month'), ee.Date(Date.now()))
                .mosaic()
                .visualize({ bands: ['B4', 'B3', 'B2'], min: 0, max: 3000 });

            const historicalImage = collection
                .filterDate(ee.Date(Date.now()).advance(-4, 'month'), ee.Date(Date.now()).advance(-3, 'month'))
                .mosaic()
                .visualize({ bands: ['B4', 'B3', 'B2'], min: 0, max: 3000 });

            const getUrl = promisify(recentImage.getThumbURL.bind(recentImage));
            const getUrlHistorical = promisify(historicalImage.getThumbURL.bind(historicalImage));

            Promise.all([
                getUrl({ format: 'jpg', dimensions: 512, region: region.toGeoJSON() }),
                getUrlHistorical({ format: 'jpg', dimensions: 512, region: region.toGeoJSON() })
            ])
            .then(([recentUrl, historicalUrl]) => {
                console.log('[GEE_Service] Generated image URLs.');
                resolve({ recent: recentUrl, historical: historicalUrl });
            })
            .catch(err => {
                console.error('[GEE_Service] Failed to generate image URLs:', err);
                reject(err);
            });
        } catch (error) {
            console.error('[GEE_Service] An error occurred in fetchImagesFromGEE:', error);
            reject(error);
        }
    });
};

const detectDeforestation = async (recentImageUrl: string, historicalImageUrl: string): Promise<boolean> => {
    console.log('[LLM_Service] Received images for deforestation analysis:');
    console.log(`- Recent: ${recentImageUrl}`);
    console.log(`- Historical: ${historicalImageUrl}`);
    
    try {
        console.log('[LLM_Service] Fetching images and converting to Base64...');
        const [recentBase64, historicalBase64] = await Promise.all([
            urlToBase64(recentImageUrl),
            urlToBase64(historicalImageUrl),
        ]);

        const prompt = `Analyze these two satellite images of the same farm plot. The first image is recent, and the second image is historical (from 3 months ago).
        
        Compare the vegetation cover and land use between the two images.
        
        Specifically, look for signs of significant removal of natural forest or dense vegetation in the recent image compared to the historical image, which would indicate deforestation.
        
        Provide a JSON response with two fields:
        - "deforestationDetected": a boolean (true if deforestation is detected, false otherwise).
        - "explanation": a concise string explaining your reasoning.
        
        Example:
        {
          "deforestationDetected": true,
          "explanation": "Significant forest cover reduction in the recent image."
        }`;

        const imageParts = [
            {
                inlineData: {
                    mimeType: 'image/jpeg', // Assuming JPEG from GEE, adjust if needed
                    data: recentBase64,
                },
            },
            {
                inlineData: {
                    mimeType: 'image/jpeg',
                    data: historicalBase64,
                },
            },
        ];

        console.log('[LLM_Service] Sending images and prompt to Gemini LLM...');
        const result = await geminiProVision.generateContent(
            [
                prompt,
                ...imageParts
            ]
        );
        const response = result.response;
        const text = response.text();
        
        console.log('[LLM_Service] Raw LLM response:', text);

        let parsedResponse;
        try {
            // Clean the text by removing backticks and "json" label
            const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
            parsedResponse = JSON.parse(cleanedText);
        } catch (jsonError) {
            console.error('[LLM_Service] Failed to parse LLM response as JSON:', jsonError);
            console.error('[LLM_Service] Attempting regex extraction...');
            // Fallback: try to extract boolean and explanation using regex
            const deforestationMatch = text.match(/"deforestationDetected":\s*(true|false)/);
            const explanationMatch = text.match(/"explanation":\s*"(.*?)"/);
            if (deforestationMatch && explanationMatch) {
                parsedResponse = {
                    deforestationDetected: deforestationMatch[1] === 'true',
                    explanation: explanationMatch[1]
                };
            } else {
                throw new Error('LLM response not in expected JSON format and regex extraction failed.');
            }
        }
        

        const isDeforestation = parsedResponse.deforestationDetected;
        const explanation = parsedResponse.explanation;

        console.log(`[LLM_Service] LLM analysis complete. Deforestation detected: ${isDeforestation}. Explanation: ${explanation}`);
        return isDeforestation;

    } catch (error) {
        console.error('[LLM_Service] Error during LLM deforestation detection:', error);
        throw error;
    }
};
// Program ID from farmtrace/lib.rs
const PROGRAM_ID = new PublicKey("FwtvuwpaD8vnDttYg6h8x8bugkm47fuwoNKd9tfF7sCE");

// Validator keypair path
const VALIDATOR_KEYPAIR_PATH = path.join(__dirname, '..', 'validator-keypair.json');

const updateOnChainValidation = async (plotId: string, farmerKey: string) => {
    console.log(`[Solana_Service] Received request to validate plot ${plotId} on-chain.`);

    try {
        // 1. Load validator keypair
        const validatorKeypair = Keypair.fromSecretKey(
            Uint8Array.from(JSON.parse(require('fs').readFileSync(VALIDATOR_KEYPAIR_PATH, 'utf-8')))
        );

        // 2. Setup connection and provider
        const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
        const provider = new anchor.AnchorProvider(
            connection,
            new anchor.Wallet(validatorKeypair),
            { commitment: "confirmed" }
        );
        anchor.setProvider(provider);

        // 3. Initialize the program
        const program = new anchor.Program(idl as unknown as Farmtrace, provider);
        // 4. Derive PDA for the farmPlot
        const farmerPublicKey = new PublicKey(farmerKey);
        const [farmPlotPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from("farm_plot"), Buffer.from(plotId), farmerPublicKey.toBuffer()],
            PROGRAM_ID
        );

        // 5. Call the validateFarmPlot instruction
        const tx = await program.methods
            .validateFarmPlot()
            .accounts({
                farmPlot: farmPlotPDA,
                validator: validatorKeypair.publicKey,
            })
            .signers([validatorKeypair])
            .rpc();

        console.log(`[Solana_Service] On-chain validation transaction successful for plot ${plotId}: ${tx}`);
    } catch (error) {
        console.error(`[Solana_Service] Error during on-chain validation for plot ${plotId}:`, error);
        throw error; // Re-throw to propagate the error
    }
};


// --- MAIN VALIDATION ORCHESTRATOR ---

export const triggerValidation = async (plotId: string, farmerKey: string, polygonCoordinates: PolygonCoordinates[]) => {
    console.log(`[ValidationService] Starting validation for plot: ${plotId}`);

    try {
        // Step 1: Initialize GEE
        await initializeGEE();

        // Step 2: Fetch satellite imagery from GEE
        console.log(`[ValidationService] Fetching satellite imagery from GEE...`);
        const images = await fetchImagesFromGEE(polygonCoordinates);
        console.log(`[ValidationService] ...GEE image fetch complete.`, images);

        // Step 3: Perform deforestation detection with LLM
        console.log(`[ValidationService] Performing deforestation analysis with LLM...`);
        const isDeforestationDetected = await detectDeforestation(images.recent, images.historical);
        console.log(`[ValidationService] ...LLM analysis complete. Deforestation detected: ${isDeforestationDetected}`);

        // Step 4: Update on-chain validation status
        if (!isDeforestationDetected) {
            console.log(`[ValidationService] Updating on-chain validation status...`);
            await updateOnChainValidation(plotId, farmerKey);
            console.log(`[ValidationService] ...On-chain status updated successfully.`);
        } else {
            console.log(`[ValidationService] Validation failed: Deforestation detected. No on-chain update.`);
        }

        console.log(`[ValidationService] Validation process for plot ${plotId} completed.`);

    } catch (error) {
        console.error(`[ValidationService] FATAL: A critical error occurred during validation for plot ${plotId}:`, error);
    }
};