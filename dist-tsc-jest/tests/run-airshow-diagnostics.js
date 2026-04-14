import "./domEnvironment.js";
import { runAllTests } from "./harness.js";
import "./AirShow.fighterMotion.test.js";
(async () => {
    await runAllTests();
})();
