/**
 * War Room data type definitions.
 * These types support the Base Operations overlay interface.
 */
/**
 * Creates a default/empty war room data structure.
 * Useful for initialization or testing.
 */
export function createEmptyWarRoomData() {
    return {
        intelBriefs: [],
        reconReports: [],
        supplyStatus: {
            status: "adequate",
            note: "No supply data available."
        },
        requisitions: [],
        casualtyLedger: {
            kia: 0,
            wia: 0,
            mia: 0,
            updatedAt: new Date().toISOString()
        },
        engagementLog: [],
        logisticsSummary: {
            throughput: "No logistics data available."
        },
        commandOrders: [],
        readinessState: {
            level: "preparing",
            comment: "Awaiting deployment."
        },
        campaignClock: {
            day: 1,
            time: "0600",
            note: "Campaign start."
        }
    };
}
/**
 * Sample war room data for development/testing.
 */
export function createSampleWarRoomData() {
    return {
        intelBriefs: [
            {
                title: "Enemy Movement Detected",
                summary: "Increased armor activity in Sector 7. Possible offensive preparation.",
                classification: "CONFIDENTIAL",
                source: "SIGINT",
                timestamp: "2024-10-18T14:30:00Z"
            },
            {
                title: "Supply Line Vulnerability",
                summary: "Enemy recon units spotted near Route Blue. Recommend increased security.",
                classification: "SECRET",
                source: "Field Observer",
                timestamp: "2024-10-18T12:15:00Z"
            }
        ],
        reconReports: [
            {
                sector: "Grid 45-22",
                finding: "Enemy fortifications identified. Estimated battalion strength.",
                confidence: "High",
                reportedBy: "Recon Team Alpha",
                timestamp: "2024-10-18T13:45:00Z"
            },
            {
                sector: "Grid 38-19",
                finding: "Clear terrain. No enemy presence detected.",
                confidence: "Medium",
                reportedBy: "Recon Team Bravo",
                timestamp: "2024-10-18T11:30:00Z"
            }
        ],
        supplyStatus: {
            status: "adequate",
            note: "Current stock sufficient for 72 hours of operations.",
            stockLevel: 75,
            consumptionRate: 8
        },
        requisitions: [
            {
                item: "155mm Artillery Shells (500 rounds)",
                quantity: 500,
                status: "approved",
                requestedBy: "Arty Battalion CO",
                updatedAt: "2024-10-18T10:00:00Z"
            },
            {
                item: "Fuel Drums (200 units)",
                quantity: 200,
                status: "pending",
                requestedBy: "Logistics Officer",
                updatedAt: "2024-10-18T09:30:00Z"
            }
        ],
        casualtyLedger: {
            kia: 12,
            wia: 34,
            mia: 3,
            updatedAt: "2024-10-18T14:00:00Z"
        },
        engagementLog: [
            {
                theater: "Sector 5 (Hill 203)",
                result: "victory",
                note: "Enemy forced to withdraw. Position secured.",
                casualties: 8,
                timestamp: "2024-10-18T08:30:00Z"
            },
            {
                theater: "Sector 3 (Bridge Crossing)",
                result: "stalemate",
                note: "Heavy resistance. Unable to advance.",
                casualties: 15,
                timestamp: "2024-10-17T16:00:00Z"
            }
        ],
        logisticsSummary: {
            throughput: "87% of planned supply deliveries completed",
            bottleneck: "Route Red experiencing delays due to damaged bridge",
            efficiency: 87
        },
        commandOrders: [
            {
                title: "OPORD 24-10: Advance to Phase Line Blue",
                objective: "Secure high ground in Grid Square 42-28 by 1800 hours.",
                priority: "high",
                deadline: "2024-10-18T18:00:00Z"
            },
            {
                title: "FRAGO 03: Patrol Schedule",
                objective: "Maintain continuous patrols along eastern perimeter.",
                priority: "medium"
            }
        ],
        readinessState: {
            level: "combat ready",
            comment: "All units report green status. Ammunition and fuel at acceptable levels.",
            percentage: 92
        },
        campaignClock: {
            day: 3,
            time: "1430",
            note: "Operation Thunderbolt - Day 3",
            phase: "Advance"
        }
    };
}
