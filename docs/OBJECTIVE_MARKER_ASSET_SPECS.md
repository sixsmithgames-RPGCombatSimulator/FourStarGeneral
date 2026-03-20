# Objective Marker Asset Specifications
## Four Star General - Professional Asset Requirements

### Overview
Objective markers are persistent UI elements that indicate critical map locations players must control. They must be instantly recognizable, visually distinct from unit sprites, and maintain clarity at all zoom levels.

---

## Asset Requirements

### 1. **Objective Icon Base (PNG with Alpha)**

**Purpose**: Primary identifier for objective hexes

**Specifications**:
- **Format**: PNG-24 with alpha channel
- **Dimensions**: 128x128px (will be scaled to ~44px in-game)
- **Resolution**: 2x scale for retina displays
- **Color Space**: sRGB

**Design Requirements**:
- **Symbol**: Five-pointed star or military objective marker (similar to NATO tactical symbols)
- **Style**: Bold, clean silhouette with minimal internal detail
- **Outline**: 3-4px solid border around the entire shape for visibility against any terrain
- **Inner Design**: Subtle gradient or shading to add depth without compromising clarity
- **Edge Treatment**: Crisp anti-aliasing, no soft glows in the asset itself (handled by engine)

**Visual Reference**:
- Style: Military tactical map markers, not decorative/fantasy stars
- Examples: NATO APP-6 objective symbols, Company of Heroes objective markers
- Silhouette must read clearly at 32px scale

**Color Notes**:
- Provide in NEUTRAL GOLD (#f5c46d) - engine will recolor for different states
- OR provide 3 separate versions: Neutral (gold), Friendly (green #22c55e), Enemy (red #ef4444)

---

### 2. **Objective Badge Background (PNG with Alpha)**

**Purpose**: Circular backdrop that sits behind the star icon

**Specifications**:
- **Format**: PNG-24 with alpha channel
- **Dimensions**: 96x96px (will be scaled to ~36px in-game)
- **Resolution**: 2x scale for retina displays

**Design Requirements**:
- **Shape**: Perfect circle with polished metal/UI panel appearance
- **Material**: Brushed metal, tactical display panel, or mil-spec equipment aesthetic
- **Border**: Raised/beveled edge suggesting physical depth (2-3px)
- **Center**: Slightly recessed area where star will overlay
- **Lighting**: Subtle top-light gradient suggesting 3D form
- **Texture**: Fine grain or panel lines - must not be noisy at small scale

**Style Notes**:
- Think: Aircraft HUD elements, tank periscope reticles, military equipment panels
- NOT: Fantasy game UI, comic book badges, civilian map markers
- Reference: Heads-up displays from military simulators, tactical equipment overlays

---

### 3. **Status Label Background (PNG with Alpha, 9-Slice)**

**Purpose**: Rounded pill shape for text labels ("OBJECTIVE", "SECURED", "2/8")

**Specifications**:
- **Format**: PNG-24 with alpha channel
- **Dimensions**: 80x24px (9-slice compatible)
- **9-Slice Borders**: 12px left, 12px right, 0px top/bottom
- **Resolution**: 2x scale for retina displays

**Design Requirements**:
- **Shape**: Rounded rectangle (12px border radius)
- **Fill**: Semi-transparent dark background (70-80% opacity black)
- **Border**: 2px solid border, color will be set by engine based on status
- **Material**: Tactical UI panel with subtle texture
- **Lighting**: Very subtle inner shadow for depth

**Notes**:
- Must stretch horizontally without distortion
- Corner radius must remain consistent when stretched
- Engine will apply border color: Gold (neutral), Green (friendly), Red (enemy)

---

### 4. **Glow/Pulse Overlay (PNG with Alpha)**

**Purpose**: Radial glow effect that pulses around active objectives

**Specifications**:
- **Format**: PNG-24 with alpha channel
- **Dimensions**: 256x256px (large to prevent pixelation when scaled)
- **Resolution**: 2x scale for retina displays

**Design Requirements**:
- **Shape**: Perfect circle with soft, radial falloff
- **Gradient**: Center 80% opacity to edge 0% opacity (smooth easing)
- **Color**: Provide in white (#ffffff) - engine will tint based on status
- **Edge**: Completely transparent at edges (no hard cutoff)
- **Inner Detail**: Can include subtle energy/scan-line effects near center

**Style Notes**:
- Reference: Radar pings, sonar displays, tactical scanner overlays
- Should suggest electronic/sensor activity, not magic effects
- Subtle is better - will be animated by engine

---

### 5. **Rotating Ring Decoration (PNG with Alpha)**

**Purpose**: Circular tech-style ring that rotates around objective marker

**Specifications**:
- **Format**: PNG-24 with alpha channel
- **Dimensions**: 128x128px
- **Resolution**: 2x scale for retina displays

**Design Requirements**:
- **Shape**: Circular ring with 8-12 evenly spaced tick marks or segments
- **Style**: Technical/mechanical appearance (gear teeth, range markers, or scan arcs)
- **Thickness**: Ring should be 2-3px thick
- **Gaps**: Dashed or segmented pattern (60% solid, 40% gaps recommended)
- **Color**: Semi-transparent (50% opacity) - provide in white, engine will tint
- **Asymmetry**: Optional directional indicator (chevron/arrow) to enhance rotation visibility

**Style Notes**:
- Think: Radar sweep, targeting reticle, military range finder
- Reference: Heads-up targeting systems, artillery fire control displays

---

## Additional Guidelines

### Visual Consistency
All objective marker assets must:
- Match the game's current unit sprite aesthetic (WWII tactical, top-down perspective)
- Use consistent lighting (top-down, 45° angle)
- Maintain readable silhouettes at 50% scale
- Avoid pure black (#000000) - use dark grays for better blending

### Color Palette Integration
Current game palette includes:
- **Primary UI Gold**: #f5c46d (objective/neutral)
- **Friendly Green**: #22c55e
- **Enemy Red**: #ef4444
- **Background Darks**: #080a11, #10141e
- **Subtle Highlights**: #f5f5f5 (30-40% opacity)

Assets should work harmoniously with these colors when tinted by the engine.

### Technical Notes
- All assets exported at 2x resolution for retina displays
- Save with full alpha channel (not pre-multiplied)
- No embedded color profiles (use sRGB color space)
- Optimize with lossless compression (PNGQuant or similar)
- Avoid anti-aliasing artifacts on pure transparent areas

---

## Alternative: Icon Font Option

If preferred for scalability and color flexibility:

**Specifications**:
- **Format**: SVG exported to icon font (WOFF2)
- **Icons Needed**:
  - Objective star/marker (neutral)
  - Secured checkmark/shield
  - Enemy alert/warning symbol
- **Viewport**: 512x512 units
- **Stroke Width**: 48 units (thick, bold)
- **Style**: Single-weight, military tactical symbols

---

## Deliverables Checklist

- [ ] Objective icon base (128x128, PNG-24)
- [ ] Badge background (96x96, PNG-24)
- [ ] Status label background (80x24, PNG-24, 9-slice ready)
- [ ] Glow overlay (256x256, PNG-24)
- [ ] Rotating ring (128x128, PNG-24)
- [ ] **Optional**: 3 color variants (neutral, friendly, enemy) OR single white version for engine tinting
- [ ] **Optional**: SVG source files for future modifications
- [ ] Asset manifest/guide with recommended in-game scaling and positioning

---

## Reference Visual Style

Based on the game's existing aesthetic:
- **Period**: WWII (1939-1945)
- **Perspective**: Top-down tactical view
- **Art Style**: Stylized realism with clear silhouettes
- **UI Language**: Military/tactical, utilitarian, readable
- **Inspiration**: Historical tactical maps, period military equipment, analog instruments

**Example Games with Similar Aesthetic**:
- Company of Heroes (objective markers)
- Hearts of Iron IV (map icons)
- Steel Division (tactical overlays)
- Combat Mission (objective indicators)

---

## Implementation Notes

Assets will be rendered as SVG overlays on hex grid using:
- CSS filters for glow effects
- Transform animations for rotation
- Opacity animations for pulsing
- Dynamic color tinting based on control status

Designers should optimize for:
- Sharp rendering at 32-48px display size
- Clarity against varied terrain backgrounds
- Instant recognizability in peripheral vision
- Distinct silhouette from unit sprites

---

**Contact**: Provide assets in a `/assets/ui/objectives/` directory structure
**Timeline**: [To be specified]
**Questions**: [Contact info]
