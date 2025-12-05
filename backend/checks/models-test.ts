// models-test.ts
import * as path from 'path';
import { config } from 'dotenv';

config({ path: path.resolve(__dirname, '..', '.env') });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY as string;
if (!GEMINI_API_KEY) {
	throw new Error('GEMINI_API_KEY is not set');
}

async function main() {
	const res = await fetch(
		'https://generativelanguage.googleapis.com/v1beta/models',
		{
			headers: {
				'Authorization': `Bearer ${GEMINI_API_KEY}`,
			},
		}
	);

	if (!res.ok) {
		console.error('Error response:', res.status, res.statusText);
		console.error(await res.text());
		return;
	}

	const data = await res.json();
	console.log(JSON.stringify(data, null, 2));
}

main().catch(err => {
	console.error('Fatal error:', err);
});
