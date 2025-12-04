import React from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

const FarmTraceApp: React.FC = () => {
  const { publicKey } = useWallet();
  const { connection } = useConnection();

  // --------------------------------------------------
  // 1. If no wallet connected → show connection screen
  // --------------------------------------------------
  if (!publicKey) {
    return (
      <div className="w-full flex flex-col items-center justify-center bg-gray-50 p-6">
        <h1 className="text-3xl font-bold mb-4 text-gray-800">
          FarmTrace: EUDR Compliance Dashboard
        </h1>

        <p className="text-gray-600 mb-6 text-center max-w-md">
          Connect your Solana wallet to register farm plots, harvest batches,
          verify satellite data, and generate EUDR DDS reports.
        </p>

        <WalletMultiButton />

        <p className="text-xs text-gray-400 mt-4">
          Phantom or any Solana-compatible wallet supported.
        </p>
      </div>
    );
  }

  // --------------------------------------------------
  // 2. Wallet connected → show main app UI
  // --------------------------------------------------
  return (
    <div className="w-full min-h-screen bg-white p-8">
      <header className="flex items-center justify-between mb-10 border-b pb-4">
        <h1 className="text-2xl font-bold text-gray-900">
          FarmTrace Control Panel
        </h1>

        <WalletMultiButton />
      </header>

      <p className="text-gray-700 mb-6">
        Connected as:{" "}
        <span className="font-mono bg-gray-100 px-2 py-1 rounded">
          {publicKey.toBase58()}
        </span>
      </p>

      {/* ----------------------------------------------- */}
      {/* Replace these with forms you will build next */}
      {/* ----------------------------------------------- */}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Register farm plot */}
        <div className="p-6 bg-gray-50 border rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">
            🌍 Register Farm Plot
          </h2>
          <p className="text-gray-600">
            Form fields will go here...
          </p>
        </div>

        {/* Register harvest batch */}
        <div className="p-6 bg-gray-50 border rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">
            🌾 Register Harvest Batch
          </h2>
          <p className="text-gray-600">
            Form fields will go here...
          </p>
        </div>

        {/* Update batch status */}
        <div className="p-6 bg-gray-50 border rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">
            🚚 Update Batch Status
          </h2>
          <p className="text-gray-600">
            Form fields will go here...
          </p>
        </div>

        {/* Generate DDS */}
        <div className="p-6 bg-gray-50 border rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">
            📄 Generate DDS Report
          </h2>
          <p className="text-gray-600">
            Output UI will go here...
          </p>
        </div>
      </div>
    </div>
  );
};

export default FarmTraceApp;
