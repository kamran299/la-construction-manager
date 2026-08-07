export const CONSTRUCTION_TEMPLATE = [
  { phase: "Preconstruction", tasks: [
    ["Site feasibility and due diligence", "GC / Architect", 5],
    ["Boundary and topographic survey", "Surveyor", 3],
    ["Geotechnical and soils report", "Geotechnical Engineer", 5],
    ["Schematic design and owner approval", "Architect / Owner", 15],
    ["Construction documents", "Architect", 20],
    ["Structural engineering", "Structural Engineer", 10],
    ["Title 24 and energy documentation", "Energy Consultant", 5],
    ["Permit submittal and corrections", "Architect / GC", 30],
    ["Subcontractor bidding and contracts", "GC", 10],
    ["Mobilization and site logistics", "GC", 3],
  ] },
  { phase: "Foundation", tasks: [
    ["Site protection and construction layout", "GC / Surveyor", 2],
    ["Erosion and sediment control", "Site Contractor", 2],
    ["Demolition, clearing, and grubbing", "Demolition Contractor", 3],
    ["Excavation and rough grading", "Excavation Contractor", 5],
    ["Footing and foundation formwork", "Concrete Contractor", 3],
    ["Underground plumbing and utilities", "Plumber / Utility Trades", 4],
    ["Rebar, embeds, and hold-downs", "Concrete / Steel Contractor", 4],
    ["Foundation inspection", "City / Engineer", 1],
    ["Footing and foundation concrete pour", "Concrete Contractor", 2],
    ["Concrete curing and form stripping", "Concrete Contractor", 5],
    ["Waterproofing and foundation drainage", "Waterproofing Contractor", 3],
    ["Backfill and compaction", "Excavation Contractor", 3],
  ] },
  { phase: "Framing", tasks: [
    ["Sill plates and floor framing", "Framing Contractor", 5],
    ["First-floor wall framing", "Framing Contractor", 7],
    ["Upper-floor framing", "Framing Contractor", 7],
    ["Roof framing", "Framing Contractor", 7],
    ["Wall and roof sheathing", "Framing Contractor", 5],
    ["Windows and exterior doors", "Window Installer", 5],
    ["Roofing dry-in", "Roofing Contractor", 5],
    ["Shear, framing, and hardware corrections", "Framing Contractor", 3],
    ["Framing and shear inspection", "City / Engineer", 2],
  ] },
  { phase: "MEP Rough-in", tasks: [
    ["MEP coordination and layout", "GC / MEP Trades", 2],
    ["Plumbing rough-in", "Plumbing Contractor", 7],
    ["Electrical rough-in", "Electrical Contractor", 7],
    ["Low-voltage and security rough-in", "Low-voltage Contractor", 3],
    ["Fire sprinkler rough-in", "Fire Sprinkler Contractor", 4],
    ["HVAC ductwork and equipment rough-in", "HVAC Contractor", 5],
    ["Gas piping and pressure test", "Plumbing Contractor", 3],
    ["Rough MEP inspections and corrections", "City / MEP Trades", 3],
  ] },
  { phase: "Insulation & Drywall", tasks: [
    ["Air sealing and fire blocking", "Insulation / Framing Contractor", 2],
    ["Wall and ceiling insulation", "Insulation Contractor", 4],
    ["Insulation inspection", "City", 1],
    ["Drywall hanging", "Drywall Contractor", 5],
    ["Drywall tape and finish coats", "Drywall Contractor", 7],
    ["Level 5 finish or texture", "Drywall Contractor", 3],
    ["Interior primer", "Painting Contractor", 3],
  ] },
  { phase: "Finishes", tasks: [
    ["Exterior cladding and trim", "Exterior Finish Contractor", 10],
    ["Exterior painting", "Painting Contractor", 5],
    ["Cabinet installation", "Cabinet Contractor", 7],
    ["Interior doors, casing, and millwork", "Finish Carpenter", 8],
    ["Tile and waterproofed finish areas", "Tile Contractor", 8],
    ["Wood and resilient flooring", "Flooring Contractor", 7],
    ["Countertop fabrication and installation", "Countertop Contractor", 4],
    ["Interior painting", "Painting Contractor", 7],
    ["Plumbing fixtures and trim", "Plumbing Contractor", 4],
    ["Electrical devices, fixtures, and trim", "Electrical Contractor", 4],
    ["HVAC registers, controls, and startup", "HVAC Contractor", 2],
    ["Appliances and equipment", "Appliance Installer", 2],
    ["Final grading, hardscape, and landscaping", "Site / Landscape Contractor", 7],
  ] },
  { phase: "Final Inspection", tasks: [
    ["GC quality-control punch list", "GC", 5],
    ["MEP final inspections", "City / MEP Trades", 2],
    ["Building final inspection", "City", 2],
    ["Inspection corrections", "GC / Subcontractors", 5],
    ["Systems testing and commissioning", "GC / MEP Trades", 2],
    ["Final construction cleaning", "Cleaning Contractor", 2],
  ] },
  { phase: "Closeout", tasks: [
    ["Owner orientation and walkthrough", "GC / Owner", 1],
    ["Owner punch-list completion", "GC / Subcontractors", 5],
    ["Warranties, manuals, and as-built documents", "GC", 2],
    ["Final lien releases and closeout records", "GC / Accounting", 3],
    ["Certificate of occupancy documentation", "GC / City", 1],
    ["Keys, access, and final handover", "GC / Owner", 1],
  ] },
];

const REMODEL_CLOSEOUT = { phase: "Closeout", tasks: [
  ["Final inspection and corrections", "GC / City", 2],
  ["Final cleaning", "Cleaning Contractor", 1],
  ["Owner walkthrough and punch list", "GC / Owner", 2],
  ["Warranties, manuals, and final handover", "GC", 1],
] };

const REMODEL_PRECONSTRUCTION = { phase: "Planning & Protection", tasks: [
  ["Existing-condition review and measurements", "GC / Designer", 2],
  ["Scope, selections, and owner approval", "GC / Owner", 3],
  ["Permit review and procurement", "GC", 5],
  ["Dust protection and site setup", "GC", 1],
] };

const KITCHEN_TASKS = [
  ["Kitchen demolition and disposal", "Demolition Contractor", 2], ["Framing and substrate repairs", "Framing Contractor", 2],
  ["Plumbing, electrical, gas, and HVAC rough-in", "MEP Trades", 4], ["Rough inspections", "City / MEP Trades", 1],
  ["Drywall, patching, and paint preparation", "Drywall / Painting Contractor", 3], ["Cabinet installation", "Cabinet Contractor", 4],
  ["Countertop template and installation", "Countertop Contractor", 4], ["Backsplash and finish flooring", "Tile / Flooring Contractor", 3],
  ["Appliances, plumbing, and electrical trim", "MEP / Appliance Trades", 3], ["Painting and finish carpentry", "Painting / Finish Carpenter", 3],
];
const BATHROOM_TASKS = [
  ["Bathroom demolition and disposal", "Demolition Contractor", 2], ["Framing and subfloor repairs", "Framing Contractor", 2],
  ["Plumbing, electrical, and ventilation rough-in", "MEP Trades", 3], ["Rough inspections", "City / MEP Trades", 1],
  ["Shower pan, waterproofing, and flood test", "Tile Contractor", 3], ["Drywall and tile substrate", "Drywall / Tile Contractor", 2],
  ["Tile installation and grout", "Tile Contractor", 5], ["Vanity, countertop, and millwork", "Cabinet / Finish Contractor", 2],
  ["Plumbing fixtures, lighting, and accessories", "MEP Trades", 2], ["Painting and finish work", "Painting Contractor", 2],
];
const FLOORING_TASKS = [
  ["Existing flooring removal and disposal", "Flooring Contractor", 2], ["Subfloor inspection and repairs", "Flooring / Framing Contractor", 2],
  ["Moisture testing and floor preparation", "Flooring Contractor", 1], ["Flooring material acclimation", "Flooring Contractor", 2],
  ["Flooring installation", "Flooring Contractor", 4], ["Baseboards, transitions, and trim", "Finish Carpenter", 2],
  ["Touch-up painting and final cleaning", "Painting / Cleaning Contractor", 2],
];

const makeRemodelTemplate = (work) => [REMODEL_PRECONSTRUCTION, { phase: "Remodel Work", tasks: work }, REMODEL_CLOSEOUT];
export const PROJECT_TEMPLATES = {
  "new-construction": CONSTRUCTION_TEMPLATE,
  "whole-home-remodel": [REMODEL_PRECONSTRUCTION,
    { phase: "Demolition", tasks: [["Selective demolition and disposal", "Demolition Contractor", 5], ["Hazardous-material coordination", "GC / Specialty Contractor", 2], ["Existing-condition repairs", "GC / Framing Contractor", 3]] },
    { phase: "Framing & Exterior", tasks: [["Structural and framing modifications", "Framing Contractor", 7], ["Windows and exterior doors", "Window Installer", 4], ["Roofing and weatherproofing repairs", "Roofing / Waterproofing Contractor", 4]] },
    { phase: "MEP Rough-in", tasks: [["Plumbing rough-in", "Plumbing Contractor", 5], ["Electrical and low-voltage rough-in", "Electrical Contractor", 5], ["HVAC rough-in", "HVAC Contractor", 4], ["Rough inspections and corrections", "City / MEP Trades", 2]] },
    { phase: "Interior Finishes", tasks: [...BATHROOM_TASKS.slice(4), ...KITCHEN_TASKS.slice(5), ...FLOORING_TASKS.slice(2)] }, REMODEL_CLOSEOUT],
  "kitchen-remodel": makeRemodelTemplate(KITCHEN_TASKS),
  "bathroom-remodel": makeRemodelTemplate(BATHROOM_TASKS),
  "flooring-remodel": makeRemodelTemplate(FLOORING_TASKS),
  "kitchen-bath-flooring": [REMODEL_PRECONSTRUCTION, { phase: "Kitchen", tasks: KITCHEN_TASKS }, { phase: "Bathrooms", tasks: BATHROOM_TASKS }, { phase: "Flooring", tasks: FLOORING_TASKS }, REMODEL_CLOSEOUT],
};

export function getProjectTemplate(type = "new-construction") { return PROJECT_TEMPLATES[type] || CONSTRUCTION_TEMPLATE; }
export const DEFAULT_PHASES = CONSTRUCTION_TEMPLATE.map(({ phase }) => phase);

export function buildProjectTasks(phases, template = CONSTRUCTION_TEMPLATE) {
  const phaseIds = new Map(phases.map(({ id, name }) => [name, id]));
  return template.flatMap(({ phase, tasks }) => tasks.map(([name, responsibleTrade, durationDays], index) => ({
    phase_id: phaseIds.get(phase),
    name,
    responsible_trade: responsibleTrade,
    duration_days: durationDays,
    weight: durationDays,
    sort_order: index + 1,
  }))).filter(({ phase_id: phaseId }) => phaseId);
}
