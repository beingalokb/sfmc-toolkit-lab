#!/bin/bash

# Script to clean up MainApp.js for SFMC Toolkit Labs version

echo "Cleaning up MainApp.js for Labs version..."

# Create a backup
cp sfmc-toolkit-client/src/MainApp.js sfmc-toolkit-client/src/MainApp.js.backup

# Use sed to remove large blocks between specific markers
# Remove Object Explorer section (schemaBuilder)
sed -i '' '/parentNav === .schemaBuilder./,/^        }/d' sfmc-toolkit-client/src/MainApp.js

# Remove Preference Center section (preferencecenter)  
sed -i '' '/parentNav === .preferencecenter./,/^        }/d' sfmc-toolkit-client/src/MainApp.js

# Remove Email Auditing section (emailArchiving)
sed -i '' '/parentNav === .emailArchiving./,/^        }/d' sfmc-toolkit-client/src/MainApp.js

echo "Labs cleanup completed. Check sfmc-toolkit-client/src/MainApp.js"
echo "Backup saved as MainApp.js.backup"
