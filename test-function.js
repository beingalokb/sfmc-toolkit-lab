// Test script to check if generateLiveGraphDataEnhanced is properly defined
const fs = require('fs');

// Read the server.js file
const serverCode = fs.readFileSync('./server/server.js', 'utf8');

// Check if the function is defined
const functionRegex = /async function generateLiveGraphDataEnhanced/;
const functionMatch = serverCode.match(functionRegex);

console.log('Function defined:', !!functionMatch);

if (functionMatch) {
  // Find the function and check its structure
  const functionStart = serverCode.indexOf('async function generateLiveGraphDataEnhanced');
  const codeAfterFunction = serverCode.substring(functionStart);
  
  // Find the matching closing brace
  let braceCount = 0;
  let inFunction = false;
  let functionEnd = -1;
  
  for (let i = 0; i < codeAfterFunction.length; i++) {
    const char = codeAfterFunction[i];
    
    if (char === '{') {
      braceCount++;
      inFunction = true;
    } else if (char === '}') {
      braceCount--;
      if (inFunction && braceCount === 0) {
        functionEnd = i;
        break;
      }
    }
  }
  
  if (functionEnd > -1) {
    console.log('Function properly closed at position:', functionEnd);
    const functionCode = codeAfterFunction.substring(0, functionEnd + 1);
    console.log('Function length:', functionCode.length, 'characters');
  } else {
    console.log('ERROR: Function not properly closed!');
  }
} else {
  console.log('ERROR: Function not found!');
}
