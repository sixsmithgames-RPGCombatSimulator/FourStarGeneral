export function setMissionStartedUI(started: boolean): void {
  const beginBattleButton = document.getElementById("beginBattle");
  const endMissionButton = document.getElementById("endMissionButton");

  if (beginBattleButton) {
    beginBattleButton.classList.toggle("hidden", started);
  }

  if (endMissionButton) {
    endMissionButton.classList.toggle("hidden", !started);
  }
}
