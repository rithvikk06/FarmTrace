# **FarmTrace — Blockchain-Powered EUDR Compliance & Supply Chain Traceability**

FarmTrace is a blockchain-based supply chain traceability platform designed to help agricultural producers comply with the **EU Deforestation Regulation (EUDR)**. The system enables farmers, cooperatives, exporters, and regulators to interact through **tamper-proof**, **plot-level**, **verifiable** records — ensuring agricultural commodities are deforestation-free and fully traceable from origin to export.

Built on **Solana**, FarmTrace leverages **Program Derived Accounts (PDAs)**, interactive mapping tools, satellite-based deforestation monitoring, and automated Due Diligence Statement generation to make compliance simple, scalable, and fraud-resistant.

---

## 🚜 **Key Features**

### **🌍 Plot-Level Geolocation & Registration**
- Draw polygon boundaries on an interactive map.
- GeoJSON coordinates are hashed using SHA-256.
- Farm Plot PDAs store immutable identifiers and metadata.

### **🚫 Automated Deforestation Verification**
- Backend analysis uses satellite imagery and land-cover models.
- LLMs evaluate deforestation risk.
- Signed verification proofs are submitted on-chain.
- Only verified plots can create harvest batches.

### **📦 Full Harvest Batch Traceability**
- Each harvest batch is linked to a specific plot.
- PDAs track:
  - Commodity type  
  - Weight  
  - Status (Harvested → Processing → InTransit → Delivered)  
  - Timestamps & supply chain events  
- Ensures an unbreakable chain of custody.

### **📄 Auto-Generated EUDR Due Diligence Statements**
- Aggregates geolocation data, batch history, verification results, and compliance scores.
- Generates importer-ready DDS files.
- Provides transparent, tamper-proof compliance evidence.

### **⚡ Solana-Powered Smart Contract Enforcement**
- Enforces EUDR eligibility rules at protocol level.
- $0.00001 transaction fees enable global accessibility.
- Extremely high throughput supports large-scale agricultural networks.

---

# 🧠 **Technical Overview**

## ❗ The Problem

The EU Deforestation Regulation requires:
1. Plot-level traceability with polygon coordinates.
2. Proof of no deforestation after December 31, 2020.
3. A tamper-proof chain of custody across the entire supply chain.
4. A Due Diligence Statement (DDS) for every shipment.

Centralized databases struggle because they:
- Cannot provide cryptographic trust guarantees.
- Are easy to tamper with.
- Require middlemen trust across multiple countries.
- Lack verifiable auditability.
- Introduce single points of failure.

Blockchain solves these issues with immutability, transparency, and decentralized trust — but only if it's affordable and scalable.

---

# 🏗 **Architecture**

FarmTrace uses a hybrid **on-chain + off-chain** model:

## **1. On-Chain (Solana Program via Anchor)**

Three primary PDA types:

### **Farm Plot PDA**
Stores:
- Polygon coordinate hash  
- Plot metadata (ID, farmer, location)  
- Compliance score  
- Links to satellite verification results  

### **Harvest Batch PDA**
Stores:
- Parent plot  
- Commodity data  
- Weight & timestamps  
- Current supply chain status  
- Destination & next handler  

### **Satellite Verification PDA**
Stores:
- Deforestation analysis results  
- LLM assessment summaries  
- Verification timestamps  
- Backend signatures  

Smart contracts enforce:
- Only verified plots can register harvest batches.
- Valid transitions through the supply chain (Harvested → Delivered).
- Regulatory business rules defined by EUDR.

---

## **2. Off-Chain Satellite + AI Engine**
- Monitors plots for land-cover changes.
- Uses Google Earth Engine, Sentinel-2, Landsat.
- LLM interprets pixel changes and vegetation indices.
- Signs results and commits them on-chain via `record_satellite_verification`.

---

## **3. Frontend (React + Solana Wallet Adapter)**
- Interactive polygon drawing tool (GeoJSON-based).
- Wallet authentication (Phantom/Solflare).
- Dashboard for:
  - Plot registration  
  - Batch creation  
  - Supply chain updates  
  - DDS generation  

Coordinates → SHA256 → submission on-chain.

---

# 🛠 **Solana Tools Used**

- **Anchor Framework**
- **Program Derived Accounts (PDAs)**
- **Anchor Events**
- **Cross-Program Invocations (CPI)**
- **IDL-based frontend integration**

---

# ⚡ **Why Solana?**

### **💸 Ultra-Low Fees**
Ethereum gas fees ($5–$50) are impossible for smallholder farmers earning $2–$5/day.  
Solana fees: **$0.00001**  
→ Register **100 batches for ~$0.01**.

### **📱 Easy for Low-Tech Users**
Mobile wallets make onboarding seamless.

### **🚀 Massive Scalability**
Agricultural supply chains generate huge transaction bursts during harvest season.  
Solana’s 50,000+ TPS handles it effortlessly.

---

# 📦 **Project Structure**

