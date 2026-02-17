import json

# Read the campaign JSON file
with open(r'C:\Users\Regan\Downloads\campaign01.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Get the tiles array
tiles = data['tiles']

# Filter out the incorrect Bot fortifications
# Remove Bot heavy fortifications with r values 18-23
# Remove Bot light fortifications with r values 25-29
filtered_tiles = []
for tile in tiles:
    tile_type = tile.get('tile', '')
    hex_r = tile.get('hex', {}).get('r', 0)

    # Skip Bot heavy fortifications with r 18-23
    if tile_type == 'botFortificationHeavy' and 18 <= hex_r <= 23:
        print(f"Removing botFortificationHeavy at q:{tile['hex']['q']}, r:{hex_r}")
        continue

    # Skip Bot light fortifications with r 25-29
    if tile_type == 'botFortificationLight' and 25 <= hex_r <= 29:
        print(f"Removing botFortificationLight at q:{tile['hex']['q']}, r:{hex_r}")
        continue

    filtered_tiles.append(tile)

print(f"\nRemoved {len(tiles) - len(filtered_tiles)} incorrect fortifications")

# Add NEW Bot Heavy Fortifications on French Coast (r 20-22)
new_heavy_fortifications = [
    {
        "tile": "botFortificationHeavy",
        "hex": {"q": 8, "r": 20},
        "forces": [
            {"unitType": "Artillery_155mm", "count": 4, "label": "Atlantic Wall - West Battery"},
            {"unitType": "Infantry_42", "count": 6, "label": "Coastal Defense Regiment"}
        ],
        "controlSinceDay": 1,
        "controlSinceSegment": 0,
        "rotation": 0
    },
    {
        "tile": "botFortificationHeavy",
        "hex": {"q": 15, "r": 21},
        "forces": [
            {"unitType": "Artillery_155mm", "count": 5, "label": "Festung Europa Heavy Battery"},
            {"unitType": "Infantry_42", "count": 7, "label": "Fortress Garrison"}
        ],
        "controlSinceDay": 1,
        "controlSinceSegment": 0,
        "rotation": 0
    },
    {
        "tile": "botFortificationHeavy",
        "hex": {"q": 22, "r": 20},
        "forces": [
            {"unitType": "Artillery_155mm", "count": 4, "label": "Central Atlantic Wall"},
            {"unitType": "Infantry_42", "count": 6, "label": "Bunker Defense"}
        ],
        "controlSinceDay": 1,
        "controlSinceSegment": 0,
        "rotation": 0
    },
    {
        "tile": "botFortificationHeavy",
        "hex": {"q": 28, "r": 21},
        "forces": [
            {"unitType": "Artillery_155mm", "count": 5, "label": "Le Havre Coastal Battery"},
            {"unitType": "Infantry_42", "count": 7, "label": "Port Defense Battalion"}
        ],
        "controlSinceDay": 1,
        "controlSinceSegment": 0,
        "rotation": 0
    },
    {
        "tile": "botFortificationHeavy",
        "hex": {"q": 35, "r": 22},
        "forces": [
            {"unitType": "Artillery_155mm", "count": 4, "label": "Eastern Sector Battery"},
            {"unitType": "Infantry_42", "count": 6, "label": "Coastal Artillery Crew"}
        ],
        "controlSinceDay": 1,
        "controlSinceSegment": 0,
        "rotation": 0
    },
    {
        "tile": "botFortificationHeavy",
        "hex": {"q": 42, "r": 21},
        "forces": [
            {"unitType": "Artillery_155mm", "count": 5, "label": "Far East Atlantic Wall"},
            {"unitType": "Infantry_42", "count": 7, "label": "Elite Coastal Defense"}
        ],
        "controlSinceDay": 1,
        "controlSinceSegment": 0,
        "rotation": 0
    }
]

# Add NEW Bot Light Fortifications slightly inland (r 23-25)
new_light_fortifications = [
    {
        "tile": "botFortificationLight",
        "hex": {"q": 10, "r": 23},
        "forces": [
            {"unitType": "Infantry_42", "count": 7, "label": "Secondary Defense Line West"},
            {"unitType": "Artillery_105mm", "count": 2, "label": "Support Artillery"}
        ],
        "controlSinceDay": 1,
        "controlSinceSegment": 0,
        "rotation": 0
    },
    {
        "tile": "botFortificationLight",
        "hex": {"q": 18, "r": 24},
        "forces": [
            {"unitType": "Infantry_42", "count": 8, "label": "Inland Defense Position"},
            {"unitType": "Artillery_105mm", "count": 3, "label": "Field Artillery"}
        ],
        "controlSinceDay": 1,
        "controlSinceSegment": 0,
        "rotation": 0
    },
    {
        "tile": "botFortificationLight",
        "hex": {"q": 25, "r": 23},
        "forces": [
            {"unitType": "Infantry_42", "count": 7, "label": "Reserve Defense Battalion"},
            {"unitType": "Artillery_105mm", "count": 2, "label": "Mobile Artillery"}
        ],
        "controlSinceDay": 1,
        "controlSinceSegment": 0,
        "rotation": 0
    },
    {
        "tile": "botFortificationLight",
        "hex": {"q": 32, "r": 24},
        "forces": [
            {"unitType": "Infantry_42", "count": 8, "label": "Fallback Position East"},
            {"unitType": "Artillery_105mm", "count": 3, "label": "Defensive Artillery"}
        ],
        "controlSinceDay": 1,
        "controlSinceSegment": 0,
        "rotation": 0
    },
    {
        "tile": "botFortificationLight",
        "hex": {"q": 40, "r": 25},
        "forces": [
            {"unitType": "Infantry_42", "count": 6, "label": "Eastern Inland Defense"},
            {"unitType": "Artillery_105mm", "count": 2, "label": "Support Guns"}
        ],
        "controlSinceDay": 1,
        "controlSinceSegment": 0,
        "rotation": 0
    }
]

# Add NEW Bot Naval Bases on French Coast (r 20-21)
new_naval_bases = [
    {
        "tile": "botNavalBase",
        "hex": {"q": 10, "r": 20},
        "forces": [
            {"unitType": "Destroyer", "count": 4, "label": "Cherbourg Naval Squadron"},
            {"unitType": "Patrol_Boat", "count": 5, "label": "Coastal Patrol"},
            {"unitType": "Infantry_42", "count": 7, "label": "Cherbourg Garrison"}
        ],
        "controlSinceDay": 1,
        "controlSinceSegment": 0
    },
    {
        "tile": "botNavalBase",
        "hex": {"q": 20, "r": 21},
        "forces": [
            {"unitType": "Destroyer", "count": 3, "label": "Western Kriegsmarine"},
            {"unitType": "Patrol_Boat", "count": 6, "label": "Harbor Defense Boats"},
            {"unitType": "Infantry_42", "count": 6, "label": "Port Security Battalion"}
        ],
        "controlSinceDay": 1,
        "controlSinceSegment": 0
    },
    {
        "tile": "botNavalBase",
        "hex": {"q": 28, "r": 20},
        "forces": [
            {"unitType": "Destroyer", "count": 5, "label": "Le Havre Naval Group"},
            {"unitType": "Patrol_Boat", "count": 4, "label": "Patrol Squadron"},
            {"unitType": "Infantry_42", "count": 8, "label": "Le Havre Kriegsmarine Garrison"}
        ],
        "controlSinceDay": 1,
        "controlSinceSegment": 0
    },
    {
        "tile": "botNavalBase",
        "hex": {"q": 40, "r": 21},
        "forces": [
            {"unitType": "Destroyer", "count": 4, "label": "Eastern Naval Squadron"},
            {"unitType": "Patrol_Boat", "count": 5, "label": "Coastal Defense Flotilla"},
            {"unitType": "Infantry_42", "count": 7, "label": "Eastern Port Garrison"}
        ],
        "controlSinceDay": 1,
        "controlSinceSegment": 0
    }
]

# Add NEW Bot logistics/airbases in underserved areas
# Northeast: q:42-48, r:22-26
# Southwest: q:6-12, r:30-33
new_bases = [
    # Northeast bases
    {
        "tile": "botLogistics",
        "hex": {"q": 44, "r": 23},
        "forces": [
            {"unitType": "Supply_Truck", "count": 5, "label": "Northeast Supply Hub"},
            {"unitType": "Infantry_42", "count": 4, "label": "Depot Security"}
        ],
        "controlSinceDay": 1,
        "controlSinceSegment": 0
    },
    {
        "tile": "botAirbase",
        "hex": {"q": 47, "r": 25},
        "forces": [
            {"unitType": "Interceptor", "count": 5, "label": "Northeast Air Defense"},
            {"unitType": "Bomber", "count": 2, "label": "Strike Squadron"}
        ],
        "controlSinceDay": 1,
        "controlSinceSegment": 0
    },
    # Southwest bases
    {
        "tile": "botLogistics",
        "hex": {"q": 8, "r": 31},
        "forces": [
            {"unitType": "Panzer_IV", "count": 4, "label": "Southwest Armored Reserve"},
            {"unitType": "Infantry_Elite", "count": 6, "label": "Elite Battalion"}
        ],
        "controlSinceDay": 1,
        "controlSinceSegment": 0
    },
    {
        "tile": "botAirbase",
        "hex": {"q": 11, "r": 33},
        "forces": [
            {"unitType": "Interceptor", "count": 4, "label": "Southwest Air Wing"},
            {"unitType": "Bomber", "count": 3, "label": "Tactical Bombers"}
        ],
        "controlSinceDay": 1,
        "controlSinceSegment": 0
    }
]

# Add all new tiles
print(f"\nAdding {len(new_heavy_fortifications)} new heavy fortifications...")
filtered_tiles.extend(new_heavy_fortifications)

print(f"Adding {len(new_light_fortifications)} new light fortifications...")
filtered_tiles.extend(new_light_fortifications)

print(f"Adding {len(new_naval_bases)} new naval bases...")
filtered_tiles.extend(new_naval_bases)

print(f"Adding {len(new_bases)} new logistics/airbases...")
filtered_tiles.extend(new_bases)

# Update the data with filtered and new tiles
data['tiles'] = filtered_tiles

# Write the updated JSON back to the file
with open(r'C:\Users\Regan\Downloads\campaign01.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print(f"\n[SUCCESS] Successfully updated campaign01.json")
print(f"  Total tiles: {len(filtered_tiles)}")
print(f"  - Removed: {len(tiles) - len(filtered_tiles) + len(new_heavy_fortifications) + len(new_light_fortifications) + len(new_naval_bases) + len(new_bases)} incorrect fortifications")
print(f"  - Added: {len(new_heavy_fortifications) + len(new_light_fortifications) + len(new_naval_bases) + len(new_bases)} new positions")
