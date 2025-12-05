import { Keypair, PublicKey } from "@solana/web3.js";
import * as fs from 'fs';
import * as path from 'path';

// Define the path to your keypair file
// Assumes the script is run from the 'backend' directory or its parent,
// and the keypair is in 'backend/validator-keypair.json'.
const KEYPAIR_PATH = path.join(__dirname, '..', 'validator-keypair.json');

try {
    // Read the content of the keypair file
    const secretKeyArray = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8'));

    // Create a Keypair object from the secret key array
    const keypair = Keypair.fromSecretKey(Uint8Array.from(secretKeyArray));

    // Access the public key
    const publicKey = keypair.publicKey;

    console.log("Validator Public Key:", publicKey.toBase58());

} catch (error) {
    console.error("Error loading keypair or deriving public key:", error);
    process.exit(1); // Exit with an error code
}
