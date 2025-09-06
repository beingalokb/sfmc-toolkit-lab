// Debug script to test the specific DE selection issue
// This will help us identify where the error occurs in the graph generation

const path = require('path');

// Mock SFMC objects data structure similar to what would be returned from the API
const mockSfmcObjects = {
  'Data Extensions': [
    {
      id: 'A8C52BAE-CE16-4A52-A8EE-EA94659978F2',
      name: 'Test Data Extension',
      externalKey: 'test_de_key',
      description: 'Test DE for debugging',
      categoryId: 12345,
      createdDate: '2024-01-01T00:00:00.000Z',
      modifiedDate: '2024-01-01T00:00:00.000Z'
    }
  ],
  'Automations': [
    {
      id: '9fe4e098-4560-4601-b320-cc269a8c9061',
      name: 'Test Automation',
      description: 'Test automation',
      type: 'scheduled',
      steps: [
        {
          step: 1,
          activities: [
            {
              name: 'Query Activity 1',
              activityObjectId: 'c2f7e496-84dd-48e6-baf4-46e6196de066',
              targetDataExtensions: [
                {
                  id: 'A8C52BAE-CE16-4A52-A8EE-EA94659978F2',
                  name: 'Test Data Extension',
                  key: 'test_de_key'
                }
              ]
            }
          ]
        }
      ]
    }
  ],
  'SQL Queries': [
    {
      id: 'c2f7e496-84dd-48e6-baf4-46e6196de066',
      name: 'Test SQL Query',
      queryText: 'SELECT * FROM Test_Data_Extension',
      categoryId: 12345,
      createdDate: '2024-01-01T00:00:00.000Z',
      modifiedDate: '2024-01-01T00:00:00.000Z'
    }
  ]
};

// Test the specific selectedObjects parameter from the failing request
const selectedObjects = {
  'Data Extensions': {
    'de_A8C52BAE-CE16-4A52-A8EE-EA94659978F2': true
  }
};

// Load the server module to test the function
console.log('🔍 Testing DE selection with ID: de_A8C52BAE-CE16-4A52-A8EE-EA94659978F2');
console.log('📊 Mock SFMC Objects:', JSON.stringify(mockSfmcObjects, null, 2));
console.log('🎯 Selected Objects:', JSON.stringify(selectedObjects, null, 2));

try {
  // Import the graph generation function from server.js
  // Note: This requires modifying server.js to export the function or copy it here
  
  console.log('✅ Test setup complete. To run actual test, we need to extract the graph generation function.');
  console.log('The issue might be in:');
  console.log('1. Object ID format mismatch (de_ prefix handling)');
  console.log('2. Missing properties in object structure');
  console.log('3. Error in relationship traversal logic');
  console.log('4. Async operation error not properly caught');
  
} catch (error) {
  console.error('❌ Error in debug setup:', error);
}
