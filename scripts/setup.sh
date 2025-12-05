#!/bin/bash

echo "🚀 Setting up FarmTrace development environment..."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# --- Ensure shell environment is updated after installations ---
# Source Cargo environment
if [ -f "$HOME/.cargo/env" ]; then
    source "$HOME/.cargo/env"
fi

# Add Solana to PATH if it exists
if [ -d "$HOME/.local/share/solana/install/active_release/bin" ]; then
    export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
fi

# Source NVM if it exists
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    . "$NVM_DIR/nvm.sh"
fi


# --- Installation Checks ---

# Check if Rust is installed
if ! command -v rustc &> /dev/null; then
    echo "${YELLOW}Installing Rust...${NC}"
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
fi

# Set Rust to latest stable to avoid conflicts
echo "${GREEN}Setting Rust toolchain to stable...${NC}"
rustup default stable

# Check if Node.js (via NVM) is installed and install if not
if ! command -v nvm &> /dev/null; then
    echo "${YELLOW}Installing NVM (Node Version Manager)...${NC}"
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    # Source NVM for immediate use
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
fi

# Install and use latest LTS Node.js
if ! command -v node &> /dev/null; then
    echo "${YELLOW}Installing Node.js (LTS) via NVM...${NC}"
    nvm install --lts
    nvm use --lts
fi

# Install Yarn globally if not already installed
if ! command -v yarn &> /dev/null; then
    echo "${YELLOW}Installing Yarn globally...${NC}"
    npm install -g yarn
fi

# Check if Solana is installed
if ! command -v solana &> /dev/null; then
    echo "${YELLOW}Installing Solana...${NC}"
    sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
    export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
fi

# Check if Anchor is installed
if ! command -v anchor &> /dev/null; then
    echo "${YELLOW}Installing Anchor...${NC}"
    cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
    avm install latest
    avm use latest
fi

# --- Project Setup ---

# Remove package-lock.json files to avoid yarn conflicts
echo "${GREEN}Removing package-lock.json files...${NC}"
find . -name 'package-lock.json' -type f -delete

# Install root dependencies
echo "${GREEN}Installing root dependencies...${NC}"
yarn install

# Setup Solana wallet
if [ ! -f "~/.config/solana/id.json" ]; then
    echo "${YELLOW}Creating Solana wallet...${NC}"
    solana-keygen new --outfile "~/.config/solana/id.json" --no-bip39-passphrase
fi

# Configure Solana
echo "${GREEN}Configuring Solana for devnet...${NC}"
solana config set --url devnet

# Airdrop SOL
echo "${GREEN}Requesting devnet airdrop...${NC}"
solana airdrop 2 || echo "${YELLOW}Airdrop may have failed, try again later${NC}"

# Setup frontend
cd app
echo "${GREEN}Installing frontend dependencies...${NC}"
yarn install
cd ..

# Setup backend
cd backend
echo "${GREEN}Installing backend dependencies...${NC}"
yarn install
cd ..

# Build program
echo "${GREEN}Building Anchor program...${NC}"
anchor build

# Update program ID
echo "${GREEN}Updating program IDs...${NC}"
PROGRAM_ID=$(solana address -k target/deploy/farmtrace-keypair.json)
echo "Program ID: $PROGRAM_ID"

# Update Anchor.toml (cross-platform compatible)
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s/farmtrace = \".*\"/farmtrace = \"$PROGRAM_ID\"/" Anchor.toml
else
  sed -i "s/farmtrace = \".*\"/farmtrace = \"$PROGRAM_ID\"/" Anchor.toml
fi

echo "${GREEN}✅ Setup complete! You may need to restart your terminal for all changes to take effect.${NC}"
echo ""
echo "Next steps:"
echo "1. source ~/.bashrc       # To update your current terminal"
echo "2. anchor test          # Run tests"
echo "3. anchor deploy        # Deploy to devnet"
echo "4. cd app && yarn dev   # Start frontend"
echo "5. cd backend && npm run dev # Start backend"