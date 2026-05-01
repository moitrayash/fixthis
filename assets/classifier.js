/* Fix This — classifier.
   Lightweight, deterministic. Sub-millisecond classification.
   Two stages: (1) emergency screen, (2) DRO classification.
   Replaceable with server-side LLM later — same input/output contract.
*/
window.CLASSIFIER = (function () {

  const EMERGENCY_PATTERNS = [
    { re: /\b(fire|burning|smoke pouring|flames|wildfire|building on fire)\b/i, tier: "LIFE_THREAT" },
    { re: /\b(gun|gunshot|shooting|shooter|stab|stabbing|stabbed|knife attack|hostage)\b/i, tier: "LIFE_THREAT" },
    { re: /\b(unconscious|not breathing|cardiac|heart attack|stroke|seizure|choking|overdose|od'?ing)\b/i, tier: "LIFE_THREAT" },
    { re: /\b(suicide|suicidal|jumping|kill (myself|themselves)|self.?harm)\b/i, tier: "CORNELL_HEALTH" },
    { re: /\b(bleeding heavily|severe bleeding|won't stop bleeding|major injury|broken bone|impaled)\b/i, tier: "LIFE_THREAT" },
    { re: /\b(gas leak|carbon monoxide|chemical spill|hazmat|explosion|bomb)\b/i, tier: "LIFE_THREAT" },
    { re: /\b(drowning|trapped|collapsed|building collapse|electrocut)/i, tier: "LIFE_THREAT" },
    { re: /\b(assault|attacked|mugged|robbed|robbery|burglary in progress|break.?in)\b/i, tier: "LIFE_THREAT" },
    { re: /\b(emergency|911|call (the )?cops|need ambulance)\b/i, tier: "LIFE_THREAT" },
    { re: /\b(swallowed|poisoned|poisoning|ate something)\b.{0,40}\b(bleach|pill|chemical|cleaner|soap)\b/i, tier: "POISON" },
  ];

  const VOCAB = {
    ROADS: [
      [/\b(pothole|potholes)\b/i, 5],
      [/\b(road|street|asphalt|pavement|tarmac)\b/i, 2],
      [/\b(crosswalk|sidewalk|curb|kerb)\b/i, 3],
      [/\b(sinkhole|crater|crack(ed)? road|cracked street)\b/i, 4],
      [/\b(road sign|stop sign|yield sign|missing sign)\b/i, 3],
      [/\b(speed bump|speedbump|traffic island|lane mark)\b/i, 3],
    ],
    WATER: [
      [/\b(water|leak|leaking|leakage|burst|flood|flooded|flooding)\b/i, 4],
      [/\b(pipe|pipes|plumbing|drain|drainage|sewer|sewage|hydrant)\b/i, 4],
      [/\b(no water|no hot water|low pressure|brown water|smelly water)\b/i, 5],
      [/\b(toilet|sink|faucet|tap|shower)\b.{0,20}\b(broken|leak|won'?t|stuck|clogged)\b/i, 5],
    ],
    WASTE: [
      [/\b(trash|garbage|rubbish|litter|dumping|dumped)\b/i, 4],
      [/\b(bin|dumpster|recycling|compost)\b/i, 3],
      [/\b(missed (pickup|collection)|overflow|smelly)\b/i, 4],
    ],
    PARKS: [
      [/\b(park|playground|swing|slide|bench|gazebo|trail)\b/i, 3],
      [/\b(tree|branch|fallen tree|dead tree|stump)\b/i, 4],
      [/\b(graffiti|vandalism|tagged|spray paint)\b/i, 3],
      [/\b(grass|weeds|lawn|bushes|hedge|flower bed)\b/i, 2],
    ],
    TRANSIT: [
      [/\b(bus|tcat|bus stop|bus shelter|transit)\b/i, 4],
      [/\b(shuttle|station|terminal|route)\b/i, 2],
      [/\b(driver|fare|schedule)\b/i, 2],
      [/\b(lost (something|item|bag|phone))\b.{0,30}\b(bus|tcat)\b/i, 5],
    ],
    LIGHTING: [
      [/\b(streetlight|street light|lamp post|lamppost|lamp ?post)\b/i, 5],
      [/\b(light|lighting|lamp|bulb)\b.{0,20}\b(out|off|broken|dark|flicker|burnt|burned)\b/i, 4],
      [/\b(dark (street|alley|path)|too dark|no lights)\b/i, 4],
      [/\b(blue light|emergency phone|call box)\b/i, 5],
    ],
    BUILDINGS: [
      [/\b(door|window|wall|ceiling|roof|floor|stair|stairs|elevator|lift)\b/i, 3],
      [/\b(broken|busted|cracked|leaking|stuck|jammed|won'?t (open|close|lock))\b/i, 2],
      [/\b(bed|bedframe|bunk|mattress|desk|chair|furniture)\b/i, 4],
      [/\b(heat|heating|hvac|ac|air conditioning|too hot|too cold|no heat)\b/i, 4],
      [/\b(mold|mould|mildew|damp|water damage)\b/i, 4],
      [/\b(dorm|room|apartment|hallway|bathroom|kitchen)\b/i, 2],
    ],
    IT: [
      [/\b(wifi|wi-?fi|internet|network|router|ethernet|red.?rover|eduroam)\b/i, 5],
      [/\b(printer|projector|monitor|computer|laptop|kiosk)\b.{0,20}\b(broken|down|not working|won'?t)\b/i, 5],
      [/\b(login|password|account|netid)\b/i, 4],
    ],
    ANIMAL: [
      [/\b(dog|cat|stray|lost pet|missing pet|animal|wildlife|raccoon|skunk|bat|squirrel|deer)\b/i, 4],
      [/\b(dead (animal|deer|squirrel|bird))\b/i, 5],
      [/\b(in the building|in (my|the) room|got inside)\b.{0,40}\b(animal|bat|mouse|rat|squirrel)\b/i, 5],
    ],
    SAFETY: [
      [/\b(asbestos|lead paint|chemical|spill|spilled|hazmat|hazardous)\b/i, 5],
      [/\b(unsafe|dangerous|hazard)\b/i, 3],
      [/\b(carbon monoxide|gas leak)\b/i, 5],
      [/\b(fire|smoke|flames|burning)\b/i, 4],
      [/\b(fire alarm|smoke detector|sprinkler)\b/i, 5],
      [/\b(collapsed|injured|injury)\b/i, 3],
    ],
  };

  function detectEmergency(text) {
    const t = (text || "").trim();
    if (!t) return null;
    for (const p of EMERGENCY_PATTERNS) {
      if (p.re.test(t)) {
        return { tier: p.tier, info: window.ROUTING.EMERGENCY[p.tier] };
      }
    }
    return null;
  }

  function classify(text) {
    const t = (text || "").trim();
    if (!t) return { key: "GENERAL", confidence: 0, scores: {} };

    const scores = {};
    let total = 0;
    for (const key of Object.keys(VOCAB)) {
      const patterns = VOCAB[key];
      let s = 0;
      for (const [re, w] of patterns) if (re.test(t)) s += w;
      if (s > 0) { scores[key] = s; total += s; }
    }

    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) return { key: "GENERAL", confidence: 0, scores };
    const [topKey, topScore] = sorted[0];
    const second = sorted[1] ? sorted[1][1] : 0;
    const confidence = total === 0 ? 0 : Math.min(1, (topScore - second) / Math.max(topScore, 1) + topScore / 10);
    return { key: topKey, confidence, scores };
  }

  return { classify, detectEmergency };
})();
