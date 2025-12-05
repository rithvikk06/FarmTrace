// gee-test.ts
// Minimal Earth Engine thumbnail test

// @ts-ignore
import ee from '@google/earthengine';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
config({ path: path.resolve(__dirname, '..', '.env') });

// Adjust path to your key JSON (same as in your main code)
const KEY_PATH = path.resolve(__dirname, '..', process.env.GEE_PRIVATE_KEY_PATH as string); // or use your actual path

async function main() {
	console.log('[GEE_TEST] Starting test...');

	const keyJson = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
	console.log('[GEE_TEST] Read key file.');

	await new Promise<void>((resolve, reject) => {
		ee.data.authenticateViaPrivateKey(
			keyJson,
			() => {
				console.log('[GEE_TEST] Auth OK, initializing...');
				ee.initialize(null, null, () => {
					console.log('[GEE_TEST] Initialize OK.');
					resolve();
				}, (err: any) => {
					console.error('[GEE_TEST] Initialize error:', err);
					reject(err);
				});
			},
			(err: any) => {
				console.error('[GEE_TEST] Auth error:', err);
				reject(err);
			}
		);
	});

	console.log('[GEE_TEST] Building test image and region...');
	const testRegion = ee.Geometry.Point([-90.9663, 42.6740]).buffer(500).bounds();

	const collection = ee.ImageCollection('COPERNICUS/S2_SR')
		.filterBounds(testRegion)
		.filterDate('2024-07-01', '2024-07-10');

	const size = await new Promise<number>((resolve, reject) => {
		collection.size().getInfo((v: number, err: any) => {
			if (err) reject(err); else resolve(v);
		});
	});
	console.log('[GEE_TEST] collection size =', size);

	if (size === 0) {
		console.error('[GEE_TEST] No images found in this region/time window.');
		return;
	}

	const testImage = collection.first().visualize({
		bands: ['B4', 'B3', 'B2'],
		min: 0,
		max: 3000,
	});

	console.log('[GEE_TEST] Calling getThumbURL with callback...');
	testImage.getThumbURL(
		{ format: 'jpg', dimensions: 256, region: testRegion },
		(url: string, err: any) => {
			console.log('[GEE_TEST] CALLBACK url=', url, 'err=', err);
		}
	);

}

main().catch(err => {
	console.error('[GEE_TEST] Fatal error:', err);
});
