// This service will contain the core logic for validating a farm plot.
import ee from '@google/earthengine';
import { promisify } from 'util';
import path from 'path';

// --- GEE SETUP ---

// Path to your service account's private key file.
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

// --- SIMULATED FUNCTIONS (UNCHANGED) ---

const detectDeforestation = async (recentImageUrl: string, historicalImageUrl: string) => {
    console.log('[LLM_Service] Received images for deforestation analysis:');
    console.log(`- Recent: ${recentImageUrl}`);
    console.log(`- Historical: ${historicalImageUrl}`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    const isDeforestation = false;
    console.log(`[LLM_Service] Simulated analysis complete. Deforestation detected: ${isDeforestation}`);
    return isDeforestation;
};

const updateOnChainValidation = async (plotId: string) => {
    console.log(`[Solana_Service] Received request to validate plot ${plotId} on-chain.`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log(`[Solana_Service] Simulated on-chain transaction successful for plot ${plotId}.`);
};


// --- MAIN VALIDATION ORCHESTRATOR ---

export const triggerValidation = async (plotId: string, polygonCoordinates: PolygonCoordinates[]) => {
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
            await updateOnChainValidation(plotId);
            console.log(`[ValidationService] ...On-chain status updated successfully.`);
        } else {
            console.log(`[ValidationService] Validation failed: Deforestation detected. No on-chain update.`);
        }

        console.log(`[ValidationService] Validation process for plot ${plotId} completed.`);

    } catch (error) {
        console.error(`[ValidationService] FATAL: A critical error occurred during validation for plot ${plotId}:`, error);
    }
};
