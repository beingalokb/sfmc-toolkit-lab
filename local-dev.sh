#!/bin/bash
set -e

# Go to project root if run from mc-explorer-client
if [ "$(basename $(pwd))" = "mc-explorer-client" ]; then
  cd ..
fi

# Install backend dependencies
echo "Installing backend dependencies..."
npm install

# Install frontend dependencies
echo "Installing frontend dependencies..."
cd mc-explorer-client
npm install

# Start backend server in background
cd ..
echo "Starting backend server in background..."
npm start &

# Start frontend (React app)
echo "Starting frontend (React app)..."
cd mc-explorer-client
npm start
