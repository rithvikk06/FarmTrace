# Gemini Project Analysis: FarmTrace

## Project Overview

This repository contains **FarmTrace**, a full-stack decentralized application (dApp) built on the Solana blockchain. The project's primary goal is to provide a platform for agricultural supply chain traceability and compliance, specifically targeting the EU Deforestation-Free Regulation (EUDR).

The architecture is a monorepo composed of three main components:

1.  **On-Chain Program (`programs/farmtrace`):**
    *   An Anchor-based Solana program written in Rust.
    *   It allows for the registration of farm plots by storing a hash of their geographic polygon data.
    *   It includes a `validate_farm_plot` instruction that can only be called by a designated off-chain authority.
    *   It manages the lifecycle of `HarvestBatch` tokens, linking them to a validated `FarmPlot`.
    *   It can generate a Due Diligence Statement (DDS) for regulatory purposes.

2.  **Frontend (`app`):**
    *   A modern web application built with **React, TypeScript, and Vite**.
    *   It uses the Solana Wallet Adapter for wallet connectivity.
    *   It features an interactive map (using **Leaflet.js**) for users to draw farm plot polygons.
    *   It communicates directly with the Solana program to register plots and batches.
    *   It triggers the off-chain validation process by sending the plot data to the backend server.

3.  **Backend (`backend`):**
    *   A **Node.js, Express, and TypeScript** server that acts as the off-chain oracle for validation.
    *   It receives validation requests from the frontend.
    *   It is designed to integrate with **Google Earth Engine (GEE)** to fetch satellite imagery for the plot's coordinates.
    *   The workflow involves using a multimodal LLM (like Gemini) to analyze the imagery for deforestation.
    *   If the plot passes validation, the backend calls the `validate_farm_plot` instruction on the Solana program.

---

## Building and Running

### 1. Initial Setup

The project includes a comprehensive setup script. Run this once to install all required dependencies (Rust, Solana, Anchor, Node modules) and configure your local environment.

```bash
/bin/bash scripts/setup.sh
```

### 2. Running the Full Stack

To run the application, you will need to run the three main components, ideally in separate terminal windows.

#### A. Solana Local Validator

For development, run a local Solana validator.

```bash
# Start the local validator
solana-test-validator

# In another terminal, deploy your program
anchor deploy
```

#### B. Backend Service

The backend server listens for validation requests from the frontend.

```bash
# Navigate to the backend directory
cd backend

# Install dependencies (if not done by setup script)
npm install

# Run the server in development mode
npm run dev
```

The server will start on `http://localhost:3001`.

#### C. Frontend Application

The frontend is the main user interface.

```bash
# Navigate to the app directory
cd app

# Install dependencies (if not done by setup script)
npm install

# Run the frontend in development mode
npm run dev
```

The application will be available at `http://localhost:5173` (or another port specified by Vite).

### 3. Testing the Program

To run the on-chain program tests defined in `tests/farmtrace.js`:

```bash
# Run the anchor test suite from the root directory
anchor test
```
This command will start a fresh validator, deploy the program, and run the tests against it.

---

## Development Conventions

*   **Monorepo:** The project is organized as a monorepo. Use the root `package.json` for high-level commands.
*   **Languages:** Rust for on-chain logic, TypeScript for the frontend and backend.
*   **On-Chain Framework:** Anchor is used for the Solana program, providing a structured and safer development environment.
*   **Frontend Framework:** The frontend uses React with Vite for a fast development experience. State management is handled via React hooks.
*   **Backend Framework:** The backend is a standard Express server, designed to be a lightweight service for off-chain computation.
*   **Code Style:** The project is configured with Prettier and ESLint for consistent code formatting and quality.
*   **Validation Flow:** The core logic follows a specific pattern:
    1.  Frontend captures user input (polygon data).
    2.  Frontend sends an on-chain transaction to `register_farm_plot`, storing a *hash* of the data.
    3.  On success, the frontend sends the *full* polygon data to the off-chain backend.
    4.  The backend performs expensive computations (GEE, LLM).
    5.  The backend sends a final on-chain transaction to `validate_farm_plot`.
