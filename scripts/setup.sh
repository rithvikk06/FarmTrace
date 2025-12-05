#!/bin/bash

echo "🚀 Setting up FarmTrace development environment..."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Rust is installed
if ! command -v rustc &> /dev/null; then
    echo "${YELLOW}Installing Rust...${NC}"
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
fi

# Check if Node.js (via NVM) is installed and install if not
if ! command -v nvm &> /dev/null; then
    echo "${YELLOW}Installing NVM (Node Version Manager)...${NC}"
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    # Source NVM for immediate use
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
    [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
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
fi

# Check if Anchor is installed
if ! command -v anchor &> /dev/null; then
    echo "${YELLOW}Installing Anchor...${NC}"
    cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
    avm install latest
    avm use latest
fi

# Install root dependencies
echo "${GREEN}Installing root dependencies...${NC}"
yarn install

# Setup Solana wallet
if [ ! -f ~/.config/solana/id.json ]; then
    echo "${YELLOW}Creating Solana wallet...${NC}"
    solana-keygen new --outfile ~/.config/solana/id.json --no-bip39-passphrase
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

# Update Anchor.toml
# Use sed -i or sed -i '' on macOS
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s/farmtrace = \".*\"/farmtrace = \"$PROGRAM_ID\"/" Anchor.toml
else
  sed -i "s/farmtrace = \".*\"/farmtrace = \"$PROGRAM_ID\"/" Anchor.toml
fi


echo "${GREEN}✅ Setup complete!${NC}"
echo ""
echo "Next steps:"
echo "1. anchor test          # Run tests"
echo "2. anchor deploy        # Deploy to devnet"
echo "3. cd app && yarn dev   # Start frontend"
echo "4. cd backend && npm run dev # Start backend"
