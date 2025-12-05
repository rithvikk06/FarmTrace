// This service will contain the core logic for validating a farm plot.
import ee from '@google/earthengine';
import { promisify } from 'util';
import path from 'path';
import { config } from 'dotenv';
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';

// Load environment variables from .env file
config();

// --- GEE SETUP ---
const PRIVATE_KEY_FILE = path.join(__dirname, '..', 'gee-credentials.json');
let isGEEInitialized = false;

/**
 * Initializes the Google Earth Engine API client.
 * It authenticates using the private key file.
 * This function should be called once before any GEE operations.
 */
const initializeGEE = async () => {
    if (isGEEInitialized) {
        console.log('[GEE_Service] GEE is already initialized.');
        return;
    }

    console.log('[GEE_Service] Initializing Google Earth Engine...');
    
    // Promisify the GEE authentication and initialization methods
    const privateKey = require(PRIVATE_KEY_FILE);
    const eeAuthenticate = promisify(ee.data.authenticateViaPrivateKey);
    const eeInitialize = promisify(ee.initialize);

    await eeAuthenticate(privateKey);
    await eeInitialize(null, null);
    
    isGEEInitialized = true;
    console.log('[GEE_Service] GEE initialized successfully.');
};


interface PolygonCoordinates {
    lat: number;
    lng: number;
}

/**
 * Fetches satellite images from GEE for a given polygon and date range.
 * @param polygon The GEE geometry of the farm plot.
 * @param startDate The start date for the image search.
 * @param endDate The end date for the image search.
 * @returns A promise that resolves to a GEE Image object or null.
 */
const getGeeImage = async (polygon: ee.Geometry.Polygon, startDate: string, endDate: string): Promise<ee.Image | null> => {
    // Sentinel-2 MSI: MultiSpectral Instrument, Level-2A
    const imageCollection = ee.ImageCollection('COPERNICUS/S2_SR')
        .filterDate(startDate, endDate)
        .filterBounds(polygon)
        // Filter for images with low cloud cover
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
        // Sort by cloud cover percentage in ascending order
        .sort('CLOUDY_PIXEL_PERCENTAGE');

    const firstImage = imageCollection.first();
    const count = await promisify(imageCollection.size().getInfo)();

    if (count === 0) {
        console.warn(`[GEE_Service] No images found for date range: ${startDate} to ${endDate}`);
        return null;
    }

    // Clip the image to the exact polygon boundary
    return firstImage.clip(polygon);
}


/**
 * Fetches recent and historical satellite images from Google Earth Engine.
 * @param polygonCoordinates The geographic coordinates of the plot's boundary.
 * @returns A promise that resolves to an object with image URLs.
 */
const fetchImagesFromGEE = async (polygonCoordinates: PolygonCoordinates[]) => {
    console.log('[GEE_Service] Received coordinates for image fetching.');

    // GEE requires coordinates in [lng, lat] format.
    const geeCoords = polygonCoordinates.map(p => [p.lng, p.lat]);
    const plotPolygon = ee.Geometry.Polygon(geeCoords);

    // Define date ranges
    const today = new Date();
    const recentEndDate = today.toISOString().split('T')[0]; // YYYY-MM-DD
    today.setDate(today.getDate() - 30);
    const recentStartDate = today.toISOString().split('T')[0];

    today.setMonth(today.getMonth() - 3);
    const historicalEndDate = today.toISOString().split('T')[0];
    today.setDate(today.getDate() - 30);
    const historicalStartDate = today.toISOString().split('T')[0];

    console.log(`[GEE_Service] Recent date range: ${recentStartDate} to ${recentEndDate}`);
    console.log(`[GEE_Service] Historical date range: ${historicalStartDate} to ${historicalEndDate}`);

    // Fetch images for both periods
    const recentImage = await getGeeImage(plotPolygon, recentStartDate, recentEndDate);
    const historicalImage = await getGeeImage(plotPolygon, historicalStartDate, historicalEndDate);

    if (!recentImage || !historicalImage) {
        throw new Error("Could not retrieve valid images for one or both date ranges.");
    }

    // Define visualization parameters for an RGB image
    const visParams = {
        bands: ['B4', 'B3', 'B2'], // Red, Green, Blue
        min: 0,
        max: 3000,
    };

    // Get download URLs
    const getRecentUrl = promisify(recentImage.visualize(visParams).getDownloadURL);
    const getHistoricalUrl = promisify(historicalImage.visualize(visParams).getDownloadURL);

    const [recentUrl, historicalUrl] = await Promise.all([
        getRecentUrl({}),
        getHistoricalUrl({})
    ]);

    const imageUrls = {
        recent: recentUrl,
        historical: historicalUrl,
    };

    console.log('[GEE_Service] Image URLs fetched successfully.');
    return imageUrls;
};

// --- GEMINI LLM SETUP ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set. Please set it in your .env file.');
    // In a real application, you might want to throw an error or exit.
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY!); 
const geminiProVision = genAI.getGenerativeModel({ model: 'gemini-pro-vision' });

// Helper function to convert a URL to a Base64 string
async function urlToBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image from ${url}: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer).toString('base64');
}

/**
 * Uses a multimodal LLM (Gemini Pro Vision) to detect deforestation.
 * @param recentImageUrl URL of the recent satellite image.
 * @param historicalImageUrl URL of the historical satellite image.
 * @returns A promise that resolves to a boolean indicating if deforestation was detected.
 */
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
        const result = await geminiProVision.generateContent([prompt, ...imageParts], {
            safetySettings: [
              {
                category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                threshold: HarmBlockThreshold.BLOCK_NONE,
              },
              {
                category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                threshold: HarmBlockThreshold.BLOCK_NONE,
              },
              {
                category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                threshold: HarmBlockThreshold.BLOCK_NONE,
              },
              {
                category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                threshold: HarmBlockThreshold.BLOCK_NONE,
              },
            ],
          });
        const response = result.response;
        const text = response.text();
        
        console.log('[LLM_Service] Raw LLM response:', text);

        let parsedResponse;
        try {
            parsedResponse = JSON.parse(text);
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
        // Depending on desired behavior, you might want to:
        // 1. Re-throw the error to stop validation.
        // 2. Return 'false' (no deforestation detected due to error).
        // 3. Return 'true' (assume deforestation due to error - safer).
        // For now, let's re-throw to clearly show errors.
        throw error;
    }
};

import ee from '@google/earthengine';
import { promisify } from 'util';
import path from 'path';
import { config } from 'dotenv';
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { IDL as FarmTraceIDL } from '../../target/idl/farmtrace'; // Adjust path if necessary

// Load environment variables from .env file
config();

// --- GEE SETUP ---
const PRIVATE_KEY_FILE = path.join(__dirname, '..', 'gee-credentials.json');
let isGEEInitialized = false;

/**
 * Initializes the Google Earth Engine API client.
 * It authenticates using the private key file.
 * This function should be called once before any GEE operations.
 */
const initializeGEE = async () => {
    if (isGEEInitialized) {
        console.log('[GEE_Service] GEE is already initialized.');
        return;
    }

    console.log('[GEE_Service] Initializing Google Earth Engine...');
    
    // Promisify the GEE authentication and initialization methods
    const privateKey = require(PRIVATE_KEY_FILE);
    const eeAuthenticate = promisify(ee.data.authenticateViaPrivateKey);
    const eeInitialize = promisify(ee.initialize);

    await eeAuthenticate(privateKey);
    await eeInitialize(null, null);
    
    isGEEInitialized = true;
    console.log('[GEE_Service] GEE initialized successfully.');
};


interface PolygonCoordinates {
    lat: number;
    lng: number;
}

/**
 * Fetches satellite images from GEE for a given polygon and date range.
 * @param polygon The GEE geometry of the farm plot.
 * @param startDate The start date for the image search.
 * @param endDate The end date for the image search.
 * @returns A promise that resolves to a GEE Image object or null.
 */
const getGeeImage = async (polygon: ee.Geometry.Polygon, startDate: string, endDate: string): Promise<ee.Image | null> => {
    // Sentinel-2 MSI: MultiSpectral Instrument, Level-2A
    const imageCollection = ee.ImageCollection('COPERNICUS/S2_SR')
        .filterDate(startDate, endDate)
        .filterBounds(polygon)
        // Filter for images with low cloud cover
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
        // Sort by cloud cover percentage in ascending order
        .sort('CLOUDY_PIXEL_PERCENTAGE');

    const firstImage = imageCollection.first();
    const count = await promisify(imageCollection.size().getInfo)();

    if (count === 0) {
        console.warn(`[GEE_Service] No images found for date range: ${startDate} to ${endDate}`);
        return null;
    }

    // Clip the image to the exact polygon boundary
    return firstImage.clip(polygon);
}


/**
 * Fetches recent and historical satellite images from Google Earth Engine.
 * @param polygonCoordinates The geographic coordinates of the plot's boundary.
 * @returns A promise that resolves to an object with image URLs.
 */
const fetchImagesFromGEE = async (polygonCoordinates: PolygonCoordinates[]) => {
    console.log('[GEE_Service] Received coordinates for image fetching.');

    // GEE requires coordinates in [lng, lat] format.
    const geeCoords = polygonCoordinates.map(p => [p.lng, p.lat]);
    const plotPolygon = ee.Geometry.Polygon(geeCoords);

    // Define date ranges
    const today = new Date();
    const recentEndDate = today.toISOString().split('T')[0]; // YYYY-MM-DD
    today.setDate(today.getDate() - 30);
    const recentStartDate = today.toISOString().split('T')[0];

    today.setMonth(today.getMonth() - 3);
    const historicalEndDate = today.toISOString().split('T')[0];
    today.setDate(today.getDate() - 30);
    const historicalStartDate = today.toISOString().split('T')[0];

    console.log(`[GEE_Service] Recent date range: ${recentStartDate} to ${recentEndDate}`);
    console.log(`[GEE_Service] Historical date range: ${historicalStartDate} to ${historicalEndDate}`);

    // Fetch images for both periods
    const recentImage = await getGeeImage(plotPolygon, recentStartDate, recentEndDate);
    const historicalImage = await getGeeImage(plotPolygon, historicalStartDate, historicalEndDate);

    if (!recentImage || !historicalImage) {
        throw new Error("Could not retrieve valid images for one or both date ranges.");
    }

    // Define visualization parameters for an RGB image
    const visParams = {
        bands: ['B4', 'B3', 'B2'], // Red, Green, Blue
        min: 0,
        max: 3000,
    };

    // Get download URLs
    const getRecentUrl = promisify(recentImage.visualize(visParams).getDownloadURL);
    const getHistoricalUrl = promisify(historicalImage.visualize(visParams).getDownloadURL);

    const [recentUrl, historicalUrl] = await Promise.all([
        getRecentUrl({}),
        getHistoricalUrl({})
    ]);

    const imageUrls = {
        recent: recentUrl,
        historical: historicalUrl,
    };

    console.log('[GEE_Service] Image URLs fetched successfully.');
    return imageUrls;
};

// --- GEMINI LLM SETUP ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set. Please set it in your .env file.');
    // In a real application, you might want to throw an error or exit.
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY!); 
const geminiProVision = genAI.getGenerativeModel({ model: 'gemini-pro-vision' });

// Helper function to convert a URL to a Base64 string
async function urlToBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image from ${url}: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer).toString('base64');
}

/**
 * Uses a multimodal LLM (Gemini Pro Vision) to detect deforestation.
 * @param recentImageUrl URL of the recent satellite image.
 * @param historicalImageUrl URL of the historical satellite image.
 * @returns A promise that resolves to a boolean indicating if deforestation was detected.
 */
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
        const result = await geminiProVision.generateContent([prompt, ...imageParts], {
            safetySettings: [
              {
                category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                threshold: HarmBlockThreshold.BLOCK_NONE,
              },
              {
                category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                threshold: HarmBlockThreshold.BLOCK_NONE,
              },
              {
                category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                threshold: HarmBlockThreshold.BLOCK_NONE,
              },
              {
                category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                threshold: HarmBlockThreshold.BLOCK_NONE,
              },
            ],
          });
        const response = result.response;
        const text = response.text();
        
        console.log('[LLM_Service] Raw LLM response:', text);

        let parsedResponse;
        try {
            parsedResponse = JSON.parse(text);
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
        // Depending on desired behavior, you might want to:
        // 1. Re-throw the error to stop validation.
        // 2. Return 'false' (no deforestation detected due to error).
        // 3. Return 'true' (assume deforestation due to error - safer).
        // For now, let's re-throw to clearly show errors.
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
        const connection = new Connection(anchor.web3.clusterApiUrl("devnet"), "confirmed");
        const provider = new anchor.AnchorProvider(
            connection,
            new anchor.Wallet(validatorKeypair),
            { commitment: "confirmed" }
        );
        anchor.setProvider(provider);

        // 3. Initialize the program
        // Assuming the IDL is accessible at '../../target/idl/farmtrace.json'
        const program = new Program(FarmTraceIDL, PROGRAM_ID, provider) as Program<FarmTrace>;

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
