# MC Explorer - Refined Schema Builder Guide

## Overview
The Schema Builder has been comprehensively refined with advanced filtering, visual enhancements, and interactive debugging capabilities to provide clear visualization of your Salesforce Marketing Cloud asset relationships.

## 🎯 Key Refinements

### 1. Enhanced Relationship Filtering
- **Valid Relationships Only**: Edges are drawn only when valid backend relationships exist
- **Direct vs Indirect Classification**:
  - **Direct**: SQL → Target DE, Journey → Entry Source DE (solid lines)
  - **Indirect**: Automation → Activity → DE (dashed lines)  
  - **Metadata**: Filters, decisions (dotted lines)
- **Orphan Node Handling**: By default, nodes with no connections are hidden

### 2. Advanced Visual System

#### Node Styling
- **Selected Objects**: Bold gold borders, full opacity, bright colors
- **Related Objects**: Dashed borders, reduced opacity, same color family
- **Orphan Objects**: Gray background, dashed borders, reduced opacity
- **Highlighted Objects**: Gold border when clicked, connected nodes/edges highlighted

#### Edge Styling by Relationship Type
- **Solid Lines** (Direct Data Flow):
  - Green: Data writes (writes_to, updates_de)
  - Blue: Data reads (reads_from, imports_to_de)
  - Purple: Journey entries (journey_entry_source)
- **Dashed Lines** (Indirect/Workflow):
  - Gray: Contains relationships (contains_query, executes_query)
  - Purple: Automation execution (triggers_automation)
- **Dotted Lines** (Metadata):
  - Cyan: Filters and decisions (filters_de, uses_in_decision)

#### Vertical Node Grouping
Nodes are automatically arranged by type:
1. Data Extensions (top)
2. SQL Queries  
3. Automations
4. Journeys
5. Triggered Sends
6. Filters
7. File Transfers
8. Data Extracts (bottom)

### 3. Interactive Controls (Left Sidebar)

#### Graph Controls Section
- **Show orphan nodes**: Toggle to display isolated objects in gray
- **Show indirect relationships**: Toggle to include workflow/container relationships
- **Show debug information**: Enable comprehensive debug overlay

#### Enhanced Statistics Panel
- Total Objects, Connected, Orphans
- Total vs Displayed Relationships
- Relationship breakdown by type (Direct/Indirect/Metadata)
- Real-time filtering status

#### Interaction Guide
- Visual legend explaining line types and interaction patterns
- Instructions for node highlighting and selection

### 4. Advanced Debug Panel (Top-right overlay)

#### Graph Overview
- Total nodes, edges, connected, orphaned counts
- Real-time filtering statistics
- Current highlighting status

#### Relationship Levels Analysis
- **Direct**: Count with visual indicator (solid lines)
- **Indirect**: Count with visual indicator (dashed lines)  
- **Metadata**: Count with visual indicator (dotted lines)
- **Unknown**: Unclassified relationships

#### Node Types Breakdown
- Count by object type with color coding

#### Connection Details
- Connected objects with inbound/outbound counts
- Connection type indicators (direct, indirect, metadata)
- Orphan objects with isolation reasons

### 5. Interactive Highlighting System

#### Node Selection
- **Click any node** to highlight its connections
- **Connected nodes and edges** become prominently displayed
- **Unrelated elements** fade to background
- **Click again** to deselect and return to normal view

#### Visual Feedback
- **Gold borders** on selected nodes
- **Thicker, brighter edges** for connections
- **Clear button** in debug panel to reset highlighting
- **Status indicator** showing what's being highlighted

### 6. Relationship Legend (Bottom-left)
Real-time legend showing:
- Color-coded line types with explanations
- Current highlighting status
- Visual guide for understanding connections

## 🔧 How to Use the Refined System

### Basic Workflow
1. **Select objects** from the sidebar to focus on specific assets
2. **Use toggles** to control orphan and indirect relationship display
3. **Click nodes** to explore their connections interactively
4. **Enable debug mode** for detailed analysis and troubleshooting

### Advanced Debugging
1. **Enable "Show debug information"** for the overlay panel
2. **Review relationship levels** to understand connection types
3. **Check statistics** to see filtering effectiveness
4. **Use node highlighting** to trace data flow paths
5. **Monitor console logs** for detailed backend relationship detection

### Performance Optimization
- **Smart filtering** reduces visual clutter for large datasets
- **Relationship classification** enables selective display
- **Vertical grouping** improves spatial organization
- **Interactive highlighting** focuses attention without redrawing

## 🎨 Visual Design System

### Color Coding
- **Blue Family**: Data Extensions (foundation assets)
- **Green Family**: SQL Queries (data transformation)
- **Orange Family**: Automations (workflow orchestration)
- **Purple Family**: Journeys (customer engagement)
- **Red Family**: Triggered Sends (email delivery)
- **Cyan Family**: Filters (data filtering/decisions)
- **Yellow Family**: File Transfers (data import/export)
- **Brown Family**: Data Extracts (data export)

### Line Types
- **Solid**: Direct data movement (high importance)
- **Dashed**: Workflow containers (medium importance)  
- **Dotted**: Metadata relationships (low visual priority)

### Highlighting System
- **Gold**: Currently selected/highlighted elements
- **Bright colors**: Connected elements when highlighting
- **Faded**: Background elements when highlighting active

## 🔍 Troubleshooting Guide

### "No relationships showing"
1. Check if objects are actually connected in SFMC
2. Enable "Show indirect relationships" 
3. Review debug panel for relationship detection details
4. Verify SQL queries have proper DE references

### "Too many/few relationships"
1. Use "Show indirect relationships" toggle to control detail level
2. Enable orphan display to see all objects
3. Check relationship level breakdown in debug panel
4. Use node highlighting to focus on specific connections

### "Graph looks cluttered"
1. Disable "Show indirect relationships" for cleaner view
2. Hide orphan nodes to focus on connected assets
3. Use node highlighting to isolate specific data flows
4. Select fewer objects to reduce visual complexity

### "Expected connections missing"
1. Enable debug mode and check console logs
2. Verify relationship detection in backend
3. Check for case sensitivity in names/keys
4. Ensure objects exist in both source and target datasets

## 📊 Performance Features

### Efficient Rendering
- **Relationship classification** reduces unnecessary edge rendering
- **Connection mapping** enables fast relationship lookups
- **Smart filtering** processes only relevant relationships
- **Lazy evaluation** for complex relationship detection

### Interactive Responsiveness
- **Local highlighting** doesn't require server requests
- **Cached relationship data** for instant node selection
- **Optimized styling** for smooth animations
- **Efficient hit detection** for node interactions

## 🎯 Best Practices

### For Analysis
1. **Start with key objects** (critical Data Extensions or Automations)
2. **Use direct relationships first** to understand core data flow
3. **Add indirect relationships** to see workflow context
4. **Leverage highlighting** to trace specific data paths

### For Debugging
1. **Enable debug mode** for detailed analysis
2. **Check relationship levels** to understand connection types
3. **Use console logs** for backend relationship detection details
4. **Test node highlighting** to verify expected connections

### For Performance
1. **Select specific objects** rather than viewing all assets
2. **Use relationship toggles** to control visual complexity
3. **Hide orphans** unless specifically analyzing unused assets
4. **Clear highlighting** when switching between analysis areas

This refined Schema Builder provides a comprehensive, interactive visualization system that adapts to your analysis needs while maintaining clarity and performance for large SFMC environments.
