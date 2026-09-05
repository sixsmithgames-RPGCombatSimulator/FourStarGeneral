import "./domEnvironment.js";
import { runAllTests } from "./harness.js";

import "./CampaignProfessionalUi.contract.test.js";
import "./CampaignMapRenderer.render.test.js";
import "./CampaignCommandShell.test.js";
import "./CampaignBattleControl.test.js";
import "./campaign-audit-contracts.js";

process.env.TEST_FILTER ??= "^FSG_CAM_0(?:3[4-9]|[4-8][0-9])";
await runAllTests();
