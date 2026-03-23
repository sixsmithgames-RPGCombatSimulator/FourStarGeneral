# Future Roadmap - Gameplay Enhancements

## Overview
This document outlines planned gameplay enhancements to improve tactical depth, visual feedback, and user experience in the Four Star General combat simulator.

---

## 1. Unit Pathing Visualization

### Concept
Display visual indicators showing where units are planning to move, providing clear tactical intent feedback.

### Implementation Details
- **Visual Style**: Green dotted line or arrow system
- **Path Animation**: Transparent and/or pulsing effect to indicate planned movement
- **Path Calculation**: Integration with existing pathfinding system
- **Display Conditions**: 
  - Show when unit is selected and has valid movement path
  - Display during movement planning phase
  - Fade or disappear when movement is executed

### Technical Considerations
- Render path overlay on the combat effects layer
- Calculate path using existing hex navigation system
- Handle path updates when obstacles or terrain changes
- Performance optimization for multiple simultaneous paths

### User Benefits
- Clear visual communication of unit intentions
- Better tactical planning and coordination
- Reduced cognitive load for movement planning
- Enhanced visual feedback for strategic decisions

---

## 2. Casualty and Damage Status Display

### Concept
Replace abstract numerical damage values with meaningful status indicators for units and fortifications.

### Personnel Status System
- **Killed**: Unit completely destroyed, removed from combat
- **Injured**: Unit damaged, reduced effectiveness but could be healed to full effectiveness
- **Wounded**: Unit damaged, not functional, no effectiveness but could be healed and returned to duty at reduced effectiveness
- **Severly Wounded**: Unit damaged, not functional, no effectiveness and can't be returned to duty
- **Future Extension**: Medical system for treating wounded personnel

### Vehicle Status System
- **Operational**: Full combat capability
- **Damaged**: Reduced combat effectiveness, mobility or firepower impaired
- **Disabled**: No combat capability, but could be repaired to funtion.
- **Destroyed**: Complete loss, vehicle removed from combat
- **Future Extension**: Repair system for damaged/disabled vehicles

### Visual Implementation
- Status icons overlaid on unit sprites
- No Color coding: Dont do something like Green (operational), Yellow (damaged/wounded), Red (disabled/destroyed). Give stats, values, this is data generals can act on
- Hover tooltips showing detailed status information

### Technical Considerations
- Extend unit data model with status tracking
- Update combat calculations to use status-based modifiers
- Integrate with existing damage system
- Status persistence across combat phases

### User Benefits
- More intuitive understanding of unit condition
- Clearer tactical decision-making based on unit status
- Foundation for future repair and medical systems
- Enhanced immersion through realistic damage representation

---

## 3. Fortification Damage System

### Concept
Implement dynamic fortification degradation based on attack type and intensity, where fortifications absorb damage and gradually lose protective value.

### Damage Scaling by Attack Type
- **Direct Assault (Infantry)**: High fortification damage
  - Breaching attacks, close combat assaults
  - Engineering equipment usage
  - Demolition charges
- **Suppressive Fire (Infantry)**: Minimal fortification damage
  - Standard small arms fire
  - Area suppression tactics
- **Anti-Fortification (Vehicles)**: Moderate to high fortification damage
  - Tank main guns, artillery
  - Demolition specialized units

### Fortification States
- **Intact**: Full protection value
- **Damaged**: Reduced protection (75% effectiveness)
- **Breached**: Minimal protection (50% effectiveness)
- **Severly Damaged**: Reduced protection (25% effectiveness)
- **Destroyed**: No protection benefit, remove fortification status from tile

### Visual Implementation
- Progressive fortification appearance changes with debris and destruction effects
- Status indicators showing fortification integrity

### Technical Considerations
- Extend fortification data model with damage tracking
- Modify combat calculations to check fortification status
- Implement damage absorption mechanics
- Balance damage values across different attack types
- Engineers can repair fortifications faster than building new ones, repair should not consume their entire turn
- Infantry units can repair fortifications but it consumes their entire turn

### User Benefits
- More realistic and tactical fortification warfare
- Strategic decision-making about fortification investment
- Clear visual feedback for fortification effectiveness
- Enhanced tactical depth through fortification management

---

## 4. Unit Context Menu System

### Concept
Implement right-click context menus directly on units for quick access to common actions and information.

### Menu Categories

#### Movement & Actions
- Move to location
- Attack target
- Entrench/Build fortifications
- Repair vehicles (if applicable)
- Treat wounded (if applicable)

#### Information
- Unit status and capabilities
- Current orders and intentions
- Combat history
- Equipment and ammunition status

#### Special Actions
- Call for support
- Request resupply
- Change combat stance
- Set patrol routes

### Implementation Details
- **Trigger**: Right-click on unit sprite
- **Menu Position**: Contextual positioning near unit
- **Visual Design**: Clean, intuitive, semi transparent interface without icons
- **Accessibility**: Keyboard navigation support
- **Performance**: Efficient menu creation and disposal

### Technical Considerations
- Event handling for unit selection and context menu
- Menu state management and cleanup
- Integration with existing unit action systems
- Responsive design for different screen sizes
- Menu customization based on unit type and capabilities

### User Benefits
- Streamlined unit management workflow
- Reduced panel navigation and menu hunting
- Faster command execution
- Improved accessibility for common actions
- Enhanced user experience through intuitive controls

---

## Implementation Priority

### Phase 1 (High Priority)
1. **Unit Pathing Visualization** - Core tactical feedback improvement
2. **Casualty Status Display** - Fundamental gameplay enhancement

### Phase 2 (Medium Priority)
3. **Fortification Damage System** - Tactical depth expansion
4. **Unit Context Menu** - User experience improvement

### Phase 3 (Future Extensions)
- Medical and repair systems
- Advanced fortification types
- Enhanced context menu features
- AI improvements for new systems

---

## Technical Dependencies

### Core Systems
- Existing pathfinding and movement system
- Current damage and combat calculation framework
- Unit data model and state management
- UI rendering and event handling systems

### New Components
- Status tracking and visualization system
- Fortification damage modeling
- Context menu framework
- Enhanced visual effects system

---

## Testing Considerations

### Unit Testing
- Status calculation accuracy
- Path visualization correctness
- Fortification damage scaling
- Context menu functionality

### Integration Testing
- Multi-system interaction
- Performance under heavy load
- User experience validation
- Cross-platform compatibility

### User Acceptance Testing
- Tactical gameplay impact
- Visual clarity and intuitiveness
- Learning curve assessment
- Accessibility compliance

---

## Conclusion

These enhancements will significantly improve the tactical depth, visual feedback, and user experience of the Four Star General combat simulator. The phased implementation approach allows for iterative development and testing, ensuring each feature is properly integrated and balanced before moving to the next phase.

The systems are designed to be extensible, providing a solid foundation for future gameplay mechanics and strategic options while maintaining the core tactical focus of the simulation.
