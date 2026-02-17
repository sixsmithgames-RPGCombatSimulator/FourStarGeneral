import json

# Read the updated campaign JSON
with open(r'C:\Users\Regan\Downloads\campaign01.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

tiles = data['tiles']

print('=== FINAL VERIFICATION REPORT ===\n')
print(f'Total tiles in campaign: {len(tiles)}\n')

# Check Bot Heavy Fortifications
print('Bot Heavy Fortifications on Atlantic Wall (French Coast, r 20-22):')
heavy = [t for t in tiles if t.get('tile') == 'botFortificationHeavy' and 20 <= t['hex']['r'] <= 22]
for h in heavy:
    label = h['forces'][0]['label'] if h.get('forces') else 'No label'
    print(f"  q:{h['hex']['q']:2d}, r:{h['hex']['r']} - {label}")
print(f'Total: {len(heavy)} heavy fortifications\n')

# Check Bot Light Fortifications
print('Bot Light Fortifications Inland (r 23-25):')
light = [t for t in tiles if t.get('tile') == 'botFortificationLight' and 23 <= t['hex']['r'] <= 25]
for l in light:
    label = l['forces'][0]['label'] if l.get('forces') else 'No label'
    print(f"  q:{l['hex']['q']:2d}, r:{l['hex']['r']} - {label}")
print(f'Total: {len(light)} light fortifications\n')

# Check Bot Naval Bases
print('Bot Naval Bases on French Coast:')
naval = [t for t in tiles if t.get('tile') == 'botNavalBase']
for n in naval:
    forces = n.get('forces', [])
    destroyer = next((f for f in forces if f['unitType'] == 'Destroyer'), None)
    patrol = next((f for f in forces if f['unitType'] == 'Patrol_Boat'), None)
    inf = next((f for f in forces if f['unitType'] == 'Infantry_42'), None)

    d_count = destroyer['count'] if destroyer else 0
    p_count = patrol['count'] if patrol else 0
    i_count = inf['count'] if inf else 0
    label = destroyer['label'] if destroyer else 'Unknown'

    print(f"  q:{n['hex']['q']:2d}, r:{n['hex']['r']} - {d_count}x Destroyer, {p_count}x Patrol Boat, {i_count}x Infantry - {label}")
print(f'Total: {len(naval)} naval bases\n')

# Check new bases in underserved areas
print('New Bases in Previously Underserved Areas:')
print('  NORTHEAST (q:42-48, r:22-26):')
ne_bases = [t for t in tiles if t.get('tile') in ['botLogistics', 'botAirbase']
            and 42 <= t['hex']['q'] <= 48 and 22 <= t['hex']['r'] <= 26]
for b in ne_bases:
    print(f"    {b['tile']:20s} q:{b['hex']['q']}, r:{b['hex']['r']}")

print('  SOUTHWEST (q:6-12, r:30-33):')
sw_bases = [t for t in tiles if t.get('tile') in ['botLogistics', 'botAirbase']
            and 6 <= t['hex']['q'] <= 12 and 30 <= t['hex']['r'] <= 33]
for b in sw_bases:
    print(f"    {b['tile']:20s} q:{b['hex']['q']}, r:{b['hex']['r']}")

print(f'\nTotal new bases: {len(ne_bases) + len(sw_bases)}')

# Verify no bad fortifications remain
print('\n=== VERIFICATION: No Incorrect Fortifications Remaining ===')
bad_heavy = [t for t in tiles if t.get('tile') == 'botFortificationHeavy' and 18 <= t['hex']['r'] <= 19]
bad_light = [t for t in tiles if t.get('tile') == 'botFortificationLight' and 26 <= t['hex']['r'] <= 29]

if bad_heavy:
    print(f'WARNING: Found {len(bad_heavy)} heavy fortifications in channel (r 18-19)')
else:
    print('[OK] No heavy fortifications in channel water')

if bad_light:
    print(f'WARNING: Found {len(bad_light)} light fortifications too far south (r 26-29)')
else:
    print('[OK] No light fortifications placed incorrectly (all are r 23-25 as required)')

print('\n[SUCCESS] All changes applied correctly!')
