/** Screen-space growth caps for non-geographic campaign map symbols at close zoom. */
export const CAMPAIGN_MAP_SYMBOL_ZOOM_CAP = Object.freeze({
  marker: 2.8,
  tile: 2.9,
  force: 2.55,
  contact: 2.85
});

/** Keeps geographic names readable without letting their text and outline balloon at close zoom. */
export const CAMPAIGN_MAP_LABEL_ZOOM_CAP = 2.8;
