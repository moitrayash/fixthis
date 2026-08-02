/* Fix This — routing table
   Maps department-of-responsibility (DRO) keys to the actual Cornell/Ithaca
   office that owns the issue, with fallback contacts.

   Designed to be REGION-SWAPPABLE: change the active region object and the
   whole app re-routes. Today: Ithaca + Cornell. Future: any city.

   Sources (verified May 2026): see /CONTACTS.md
*/

window.ROUTING = (function () {

  // --- Emergency tiers (always checked first) ---
  const EMERGENCY = {
    LIFE_THREAT: {
      label: "Life-threatening emergency",
      // We never auto-dial. We prompt the user and provide the number.
      number: "911",
      note: "Police, Fire, EMS"
    },
    CORNELL_POLICE: {
      label: "Cornell University Police",
      number: "607-255-1111",
      note: "Non-emergency campus dispatch, 24/7"
    },
    ITHACA_POLICE_NONEMERG: {
      label: "Ithaca Police (non-emergency)",
      number: "607-272-3245",
      note: "City of Ithaca PD non-emergency line"
    },
    CORNELL_HEALTH: {
      label: "Cornell Health (24h)",
      number: "607-255-5155",
      note: "Health-related concerns, mental health"
    },
    POISON: {
      label: "Poison Control",
      number: "1-800-222-1222",
      note: "National Poison Control"
    }
  };

  // --- Departments of Responsibility (DROs) ---
  // Each DRO has a primary owner (first responder) and may have a fallback chain.
  const DROS = {
    ROADS: {
      key: "ROADS",
      label: "Roads & Pavements",
      icon: "🛣️",
      color: "#374151",
      examples: "potholes, broken pavement, faded crosswalks, sinkholes",
      owners: [
        { scope: "City of Ithaca", email: "dpw@cityofithaca.org", phone: "607-272-1718", web: "https://www.cityofithacany.gov/387/Report", hours: "Mon–Fri 7:30a–4p" },
        { scope: "Town of Ithaca", email: "publicworks@town.ithaca.ny.us", phone: "607-273-1656", hours: "Mon–Fri 7a–3:30p" },
        { scope: "Cornell campus roads", email: "fcs-help@cornell.edu", phone: "607-255-5322", hours: "24/7 EMCS" }
      ]
    },
    WATER: {
      key: "WATER",
      label: "Water & Plumbing",
      icon: "💧",
      color: "#0369a1",
      examples: "burst pipes, leaks, hydrant problems, no water, flooding",
      owners: [
        { scope: "Ithaca Water & Sewer", email: "wsewer@cityofithaca.org", phone: "607-272-1717", hours: "Mon–Fri 7a–3:30p, after-hours via dispatch" },
        { scope: "Cornell housing plumbing", email: "scl-facilities@cornell.edu", phone: "607-255-0328", hours: "Mon–Fri 8a–4p" }
      ]
    },
    WASTE: {
      key: "WASTE",
      label: "Waste & Sanitation",
      icon: "🗑️",
      color: "#65a30d",
      examples: "missed pickup, illegal dumping, overflowing bins, recycling",
      owners: [
        { scope: "Tompkins County Recycling", email: "recycle@tompkins-co.org", phone: "607-273-6632" },
        { scope: "City of Ithaca Sanitation", email: "dpw@cityofithaca.org", phone: "607-272-1718" },
        { scope: "Cornell campus", email: "rmps@cornell.edu", phone: "607-255-3495" }
      ]
    },
    PARKS: {
      key: "PARKS",
      label: "Parks & Horticulture",
      icon: "🌳",
      color: "#15803d",
      examples: "fallen tree, damaged playground, vandalism in park, dead plants",
      owners: [
        { scope: "Ithaca Parks & Forestry", email: "parks@cityofithaca.org", phone: "607-272-1718" },
        { scope: "Cornell Grounds", email: "grounds@cornell.edu", phone: "607-255-3370" }
      ]
    },
    TRANSIT: {
      key: "TRANSIT",
      label: "Public Transit",
      icon: "🚌",
      color: "#7c3aed",
      examples: "broken bus stop, schedule complaint, lost item on bus, shelter damage",
      owners: [
        { scope: "TCAT", email: "tcat@tcatmail.com", phone: "607-277-7433", hours: "Mon–Fri 8a–5p" },
        { scope: "Cornell Transportation", email: "transportation@cornell.edu", phone: "607-255-4600", hours: "Mon–Fri 7:30a–4p" }
      ]
    },
    LIGHTING: {
      key: "LIGHTING",
      label: "Street Lighting",
      icon: "💡",
      color: "#ca8a04",
      examples: "dark streetlight, flickering lamp, blue-light phone broken, lamp pole down",
      owners: [
        { scope: "NYSEG (city poles)", email: "outage@nyseg.com", phone: "1-800-572-1131", hours: "24/7" },
        { scope: "Cornell campus lighting", email: "fcs-help@cornell.edu", phone: "607-255-5322" }
      ]
    },
    BUILDINGS: {
      key: "BUILDINGS",
      label: "Buildings & Structures",
      icon: "🏢",
      color: "#b91c1c",
      examples: "broken bedframe, leaking roof, busted door, broken window, HVAC, mold",
      owners: [
        { scope: "Cornell Housing Maintenance", email: "scl-facilities@cornell.edu", phone: "607-255-0328", hours: "Mon–Fri 8a–4p, after-hours via EMCS" },
        { scope: "Cornell after-hours (EMCS)", email: "fcs-help@cornell.edu", phone: "607-255-5322", hours: "24/7" },
        { scope: "Ithaca Building Dept", email: "building@cityofithaca.org", phone: "607-274-6508" }
      ]
    },
    IT: {
      key: "IT",
      label: "Network & IT",
      icon: "🖥️",
      color: "#1e40af",
      examples: "wifi down, login issues, broken printer, projector dead",
      owners: [
        { scope: "Cornell IT Service Desk", email: "itservicedesk@cornell.edu", phone: "607-255-5500", hours: "24/7" }
      ]
    },
    ANIMAL: {
      key: "ANIMAL",
      label: "Animals & Wildlife",
      icon: "🐾",
      color: "#a16207",
      examples: "stray dog, lost pet, dead animal, wildlife in building",
      owners: [
        { scope: "SPCA Tompkins (shelter)", email: "info@spcaonline.com", phone: "607-257-1822" },
        { scope: "Tompkins Animal Control (emergency)", email: "ac@spcaonline.com", phone: "607-592-6773", hours: "Emergency line" }
      ]
    },
    SAFETY: {
      key: "SAFETY",
      label: "Environmental Health & Safety",
      icon: "⚠️",
      color: "#991b1b",
      examples: "chemical spill, asbestos, unsafe condition, hazmat",
      owners: [
        { scope: "Cornell EHS", email: "askehs@cornell.edu", phone: "607-255-8200", hours: "Mon–Fri 8a–4:30p, 911 for emergency" }
      ]
    },
    GENERAL: {
      key: "GENERAL",
      label: "General",
      icon: "📨",
      color: "#52525b",
      examples: "anything that doesn't fit elsewhere — we'll route it",
      owners: [
        { scope: "Fix This triage queue", email: "triage@fixthis.local", phone: "" }
      ]
    }
  };

  function get(key) {
    return DROS[key] || DROS.GENERAL;
  }

  function primaryOwner(key) {
    const dro = get(key);
    return dro.owners[0];
  }

  // Choose owner based on simple location hint inside the description
  // (campus-y words → Cornell owners; else city of Ithaca first).
  function pickOwner(droKey, description) {
    const dro = get(droKey);
    const text = (description || "").toLowerCase();
    const onCampus = /\b(cornell|campus|north campus|west campus|collegetown|dorm|ho plaza|baker|risley|donlon|mcfaddin|carpenter|olin|uris|statler|sage|balch|jameson|appel|rpcc|rpu|barton|teagle|helen newman|noyes|willard straight|ho-plaza|libe slope|ag quad|arts quad|engineering quad)\b/i.test(text);
    if (onCampus) {
      // prefer Cornell-scoped owner if any
      const cornellOwner = dro.owners.find(o => /cornell/i.test(o.scope));
      if (cornellOwner) return cornellOwner;
    }
    return dro.owners[0];
  }

  return { DROS, EMERGENCY, get, primaryOwner, pickOwner, list: () => Object.values(DROS) };
})();
