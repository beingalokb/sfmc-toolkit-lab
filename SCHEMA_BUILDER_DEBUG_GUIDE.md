# MC Explorer - Enhanced Schema Builder Debug Guide

## Overview
The Schema Builder has been enhanced with comprehensive debugging and relationship filtering capabilities to help you understand and troubleshoot the graph visualization of your Salesforce Marketing Cloud assets.

## Key Enhancements

### 1. Relationship Filtering Logic
- **Connected Objects Only**: By default, only objects with actual relationships are shown
- **Orphan Detection**: Objects with no inbound or outbound relationships are identified and can optionally be displayed
- **Direct Relationships**: When objects are selected, the graph shows only direct (1-hop) relationships to avoid clutter

### 2. Debug Controls (Left Sidebar)
Located in the "Graph Controls" section:

#### Show Orphan Nodes Checkbox
- When enabled, displays objects that have no relationships in gray with dashed borders
- Helps identify isolated assets that might need attention
- Orphan nodes are marked with "(orphan)" in their labels

#### Show Debug Information Checkbox
- Enables a comprehensive debug panel overlay on the graph
- Provides real-time statistics and relationship analysis

### 3. Debug Panel Features
When debug mode is enabled, a detailed panel appears in the top-right corner showing:

#### Graph Overview
- Total Nodes: All objects processed
- Total Edges: All relationships detected
- Connected: Objects with at least one relationship
- Orphans: Objects with no relationships

#### Node Types Breakdown
- Count of each object type (Data Extensions, SQL Queries, etc.)
- Helps understand the composition of your SFMC environment

#### Relationship Types Analysis
- Count of each relationship type detected
- Examples: writes_to, reads_from, contains_query, etc.

#### Connected Objects List
- Detailed list of objects with relationships
- Shows inbound (↓) and outbound (↑) relationship counts
- Truncated list with scroll for large datasets

#### Orphan Objects List
- Objects with no detected relationships
- Helps identify unused or isolated assets

#### Relationships Summary
- List of detected relationships with types and labels
- Shows the actual data flow connections found

### 4. Enhanced Graph Statistics
The bottom of the Graph Controls shows:
- **Total Objects**: Objects from the API
- **Connected**: Objects with relationships
- **Orphans**: Objects without relationships  
- **Relationships**: Active relationships displayed

### 5. Visual Enhancements

#### Node Styling
- **Selected Objects**: Bold border, full opacity, bright colors
- **Related Objects**: Dashed border, reduced opacity, same color family
- **Orphan Objects**: Gray background, dashed border, reduced opacity

#### Edge Styling
- **Color-coded by relationship type**:
  - Green: Data writes (writes_to)
  - Blue: Data reads (reads_from)
  - Orange: Data imports
  - Purple: Journey entries
  - Gray: Containment relationships
  - Cyan: Filtering relationships

## Backend Debugging (Console Logs)

### Enhanced Server Logging
The backend now provides detailed console output:

```
🔍 [Graph] === STARTING ENHANCED GRAPH GENERATION ===
📊 [Graph] Input Data Extensions: 45 objects
📊 [Graph] Input SQL Queries: 23 objects
🎯 [Graph] Selection mode: FILTERED
🔗 [Graph] === STEP 1: DETECTING ALL RELATIONSHIPS ===
🔗 [Graph] Total relationships detected: 67
✅ [Graph] Selected: Data Extensions - Customer_Data (de_12345)
➡️  Related (outbound): SQL Queries - Update_Customer_Query (query_456)
📦 [Graph] Created 12 final nodes
🔗 [Graph] Created 8 final edges (filtered out 59)
✅ [Graph] Graph integrity validated
```

### Relationship Detection Logging
For each object type, detailed logs show:
- What relationships were searched for
- Which relationships were found
- Why objects were included or excluded

## Troubleshooting Common Issues

### "No relationships found for automation"
**Debug Steps:**
1. Enable debug mode
2. Check the "Connected Objects" list for the automation
3. Look at console logs for activity detection details
4. Verify automation activities have proper IDs/names

### "Graph shows unrelated objects"
**Debug Steps:**
1. Check if multiple objects are selected
2. Verify that only direct relationships are being shown
3. Use debug panel to see relationship types
4. Look for unexpected relationship detection in logs

### "Expected relationships missing"
**Debug Steps:**
1. Check SQL query text for proper DE references
2. Verify automation activity structure in debug logs
3. Look for case sensitivity issues in names/keys
4. Check if objects exist in both source and target

## Console Commands for Advanced Debugging

Open browser developer tools and use these commands:

```javascript
// Check current graph state
console.log('Graph elements:', window.cyRef?.current?.elements());

// Check selected objects
console.log('Selected objects:', selectedObjects);

// Check debug info
console.log('Debug info:', debugInfo);
```

## Best Practices

1. **Start Small**: Select 1-2 related objects first to understand the graph
2. **Use Debug Mode**: Always enable debug when troubleshooting
3. **Check Orphans**: Review orphan objects to identify unused assets
4. **Monitor Console**: Backend logs provide detailed relationship detection info
5. **Verify API Data**: Ensure your SFMC objects have proper relationships in the source system

## API Response Requirements

For optimal relationship detection, ensure your SFMC API responses include:

### SQL Queries
- `queryText` or `sqlStatement`: The actual SQL code
- `name`: Query name for matching

### Automations  
- `steps` or `activities`: Activity list
- Activity objects with `type`, `queryDefinitionId`, etc.

### Data Extensions
- `name`: DE name for SQL matching
- `externalKey`: Alternative identifier

### Journeys
- `entrySource`: Entry Data Extension reference

This enhanced debugging system helps you understand exactly how your SFMC assets are connected and why certain relationships appear or don't appear in the graph.
