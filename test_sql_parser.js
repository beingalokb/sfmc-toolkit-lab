// Test SQL Parser for _BusinessUnitUnsubscribes issue

function extractSourceDataExtensionsFromSQL(sqlText) {
  if (!sqlText || typeof sqlText !== 'string') {
    return [];
  }

  const sourceDataExtensions = [];
  
  try {
    // Convert to uppercase for easier parsing
    const sql = sqlText.toUpperCase();
    console.log('🔍 [SQL Parser] Analyzing SQL:', sqlText);
    console.log('🔍 [SQL Parser] Uppercase SQL:', sql);
    
    // Regular expressions to match table names in FROM and JOIN clauses
    const patterns = [
      /FROM\s+([^\s,\(\)]+)/gi,           // FROM table_name
      /JOIN\s+([^\s,\(\)]+)/gi,           // JOIN table_name  
      /LEFT\s+JOIN\s+([^\s,\(\)]+)/gi,    // LEFT JOIN table_name
      /RIGHT\s+JOIN\s+([^\s,\(\)]+)/gi,   // RIGHT JOIN table_name
      /INNER\s+JOIN\s+([^\s,\(\)]+)/gi,   // INNER JOIN table_name
      /OUTER\s+JOIN\s+([^\s,\(\)]+)/gi    // OUTER JOIN table_name
    ];
    
    patterns.forEach((pattern, patternIndex) => {
      console.log(`🔍 [SQL Parser] Testing pattern ${patternIndex}: ${pattern}`);
      pattern.lastIndex = 0; // Reset regex state
      let match;
      while ((match = pattern.exec(sql)) !== null) {
        console.log(`🔍 [SQL Parser] Found match:`, match);
        let tableName = match[1].trim();
        console.log(`🔍 [SQL Parser] Raw table name: "${tableName}"`);
        
        // Remove common SQL keywords and aliases
        tableName = tableName.replace(/\s+(AS|ON|WHERE|GROUP|ORDER|HAVING).*/i, '');
        tableName = tableName.replace(/\s+[a-zA-Z_][a-zA-Z0-9_]*$/, ''); // Remove alias
        
        // Clean up table name
        tableName = tableName.replace(/['"`,\[\]]/g, ''); // Remove quotes and brackets
        tableName = tableName.trim();
        
        console.log(`🔍 [SQL Parser] Cleaned table name: "${tableName}"`);
        
        // Skip if it's a common SQL keyword or function
        const sqlKeywords = ['SELECT', 'FROM', 'WHERE', 'ORDER', 'GROUP', 'HAVING', 'UNION', 'CASE', 'WHEN'];
        if (!sqlKeywords.includes(tableName) && tableName.length > 0) {
          // Convert back to original case for display
          const originalCase = extractOriginalCaseTableName(sqlText, tableName);
          console.log(`🔍 [SQL Parser] Original case: "${originalCase}"`);
          if (originalCase && !sourceDataExtensions.includes(originalCase)) {
            sourceDataExtensions.push(originalCase);
            console.log(`🔍 [SQL Parser] Added to results: "${originalCase}"`);
          }
        } else {
          console.log(`🔍 [SQL Parser] Skipping (keyword or empty): "${tableName}"`);
        }
      }
    });
    
    console.log(`🔍 [SQL Parser] Final result:`, sourceDataExtensions);
    
  } catch (error) {
    console.warn('⚠️ [SQL Parser] Error parsing SQL:', error.message);
  }
  
  return sourceDataExtensions;
}

function extractOriginalCaseTableName(sqlText, uppercaseTableName) {
  try {
    const regex = new RegExp(`\\b${uppercaseTableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const match = sqlText.match(regex);
    return match ? match[0] : uppercaseTableName.toLowerCase();
  } catch (error) {
    return uppercaseTableName.toLowerCase();
  }
}

// Test with the actual SQL query from the user's log
const actualSQL = `SELECT
    bu.BusinessUnitID,
    bu.SubscriberID,
    bu.SubscriberKey,
    bu.UnsubDateUTC,
    bu.UnsubReason
FROM
    _BusinessUnitUnsubscribes bu`;

console.log('=== Testing SQL Parser with Actual Query ===');
const result = extractSourceDataExtensionsFromSQL(actualSQL);
console.log('=== Final Result ===');
console.log('Source Data Extensions found:', result);
