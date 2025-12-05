// gee-check-access.ts
// Standalone script to test access to an Earth Engine image collection
// using collection.size().getInfo.

// @ts-ignore
import ee from '@google/earthengine';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';

// Load .env one level up from this file; adjust if needed
config({ path: path.resolve(__dirname, '..', '.env') });

// Dataset ID you want to test
const DATASET_ID = 'COPERNICUS/S2_SR_HARMONIZED';  // change to e.g. 'LANDSAT/LC09/C02/T1_L2'

// Path to your service account key JSON, via the same env var you already use
const KEY_PATH = path.resolve(__dirname, '..', process.env.GEE_PRIVATE_KEY_PATH as string); // or use your actual path

// A simple test region & dates; adjust if you want
const TEST_POINT = { lon: -90.9663, lat: 42.6740 };
const START_DATE = '2025-06-01';
const END_DATE = '2025-09-10';

async function main() {
	console.log('[GEE_CHECK] Starting access check for dataset:', DATASET_ID);
	console.log('[GEE_CHECK] Using key file:', KEY_PATH);

	const keyJson = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
	console.log('[GEE_CHECK] Read key file.');

	// Authenticate and initialize Earth Engine
	await new Promise<void>((resolve, reject) => {
		ee.data.authenticateViaPrivateKey(
			keyJson,
			() => {
				console.log('[GEE_CHECK] Auth OK, initializing...');
				ee.initialize(null, null, () => {
					console.log('[GEE_CHECK] Initialize OK.');
					resolve();
				}, (err: any) => {
					console.error('[GEE_CHECK] Initialize error:', err);
					reject(err);
				});
			},
			(err: any) => {
				console.error('[GEE_CHECK] Auth error:', err);
				reject(err);
			}
		);
	});

	// Build region and collection
	console.log('[GEE_CHECK] Building region and collection...');
	const region = ee.Geometry.Point([TEST_POINT.lon, TEST_POINT.lat]).buffer(500).bounds();
	const collection = ee.ImageCollection(DATASET_ID)
		.filterBounds(region)
		.filterDate(START_DATE, END_DATE);

	// Check size().getInfo
	console.log('[GEE_CHECK] Calling collection.size().getInfo...');
	const size = await new Promise<number>((resolve, reject) => {
		collection.size().getInfo((value: number, err: any) => {
			if (err) {
				reject(err);
			} else {
				resolve(value);
			}
		});
	});

	console.log(`[GEE_CHECK] DONE. Dataset=${DATASET_ID}, size=${size}`);
	console.log('[GEE_CHECK] If size >= 0 and no error, you have read access to this dataset in this region/time window.');
}

main().catch(err => {
	console.error('[GEE_CHECK] Fatal error:', err);
});
