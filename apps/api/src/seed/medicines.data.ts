// Condensed DGDA-style medicine reference data for a runnable demo.
// Structure mirrors the public DGDA Registry: group -> generic -> brand/company/strength.
// For the FULL DGDA import, drop `dgda-products.csv` in `backend/` and run
// `npm run seed:medicines:full` (columns and sourcing: PROJECT_DOCS/MEDICINE_DATA.md).

export interface SeedMedicineRow {
  group: string;
  generic: string;
  brand: string;
  company: string;
  dosageForm: string;
  strength: string;
  packSize: string;
}

export const seedMedicines: SeedMedicineRow[] = [
  // Analgesics & Antipyretics
  { group: 'Analgesics & Antipyretics', generic: 'Paracetamol', brand: 'Napa', company: 'Beximco Pharmaceuticals', dosageForm: 'Tablet', strength: '500 mg', packSize: "20's" },
  { group: 'Analgesics & Antipyretics', generic: 'Paracetamol', brand: 'Ace', company: 'Square Pharmaceuticals', dosageForm: 'Tablet', strength: '500 mg', packSize: "20's" },
  { group: 'Analgesics & Antipyretics', generic: 'Paracetamol', brand: 'Napa Extra', company: 'Beximco Pharmaceuticals', dosageForm: 'Tablet', strength: '500 mg + 65 mg', packSize: "20's" },
  { group: 'Analgesics & Antipyretics', generic: 'Ibuprofen', brand: 'Brufen', company: 'ACI Limited', dosageForm: 'Tablet', strength: '400 mg', packSize: "50's" },
  { group: 'Analgesics & Antipyretics', generic: 'Diclofenac Sodium', brand: 'Voltaren', company: 'Novartis Bangladesh', dosageForm: 'Tablet', strength: '50 mg', packSize: "20's" },
  { group: 'Analgesics & Antipyretics', generic: 'Ketorolac', brand: 'Keto', company: 'Opsonin Pharma', dosageForm: 'Injection', strength: '30 mg/ml', packSize: '1 ml' },

  // Antibiotics
  { group: 'Antibiotics', generic: 'Amoxicillin', brand: 'Moxacil', company: 'Beximco Pharmaceuticals', dosageForm: 'Capsule', strength: '500 mg', packSize: "20's" },
  { group: 'Antibiotics', generic: 'Amoxicillin + Clavulanic Acid', brand: 'Ospamox', company: 'Opsonin Pharma', dosageForm: 'Tablet', strength: '625 mg', packSize: "14's" },
  { group: 'Antibiotics', generic: 'Azithromycin', brand: 'Zithrocin', company: 'Square Pharmaceuticals', dosageForm: 'Tablet', strength: '500 mg', packSize: "5's" },
  { group: 'Antibiotics', generic: 'Ciprofloxacin', brand: 'Ciproxin', company: 'Novartis Bangladesh', dosageForm: 'Tablet', strength: '500 mg', packSize: "10's" },
  { group: 'Antibiotics', generic: 'Cefuroxime Axetil', brand: 'Xorimax', company: 'Renata Limited', dosageForm: 'Tablet', strength: '250 mg', packSize: "10's" },
  { group: 'Antibiotics', generic: 'Metronidazole', brand: 'Flagyl', company: 'Sanofi Bangladesh', dosageForm: 'Tablet', strength: '400 mg', packSize: "20's" },

  // Antidiabetics
  { group: 'Antidiabetics', generic: 'Metformin', brand: 'Glucophage', company: 'Square Pharmaceuticals', dosageForm: 'Tablet', strength: '500 mg', packSize: "50's" },
  { group: 'Antidiabetics', generic: 'Metformin + Glibenclamide', brand: 'Diamicron', company: 'Opsonin Pharma', dosageForm: 'Tablet', strength: '5/500 mg', packSize: "30's" },
  { group: 'Antidiabetics', generic: 'Insulin (glargine)', brand: 'Lantus', company: 'Sanofi Bangladesh', dosageForm: 'Injection', strength: '100 IU/ml', packSize: '3 ml' },
  { group: 'Antidiabetics', generic: 'Sitagliptin', brand: 'Sitag', company: 'Renata Limited', dosageForm: 'Tablet', strength: '100 mg', packSize: "14's" },

  // Antihypertensives & Cardiac
  { group: 'Antihypertensives', generic: 'Amlodipine', brand: 'Amdepin', company: 'Renata Limited', dosageForm: 'Tablet', strength: '5 mg', packSize: "30's" },
  { group: 'Antihypertensives', generic: 'Losartan', brand: 'Losar', company: 'Square Pharmaceuticals', dosageForm: 'Tablet', strength: '50 mg', packSize: "30's" },
  { group: 'Antihypertensives', generic: 'Telmisartan', brand: 'Telmis', company: 'Beximco Pharmaceuticals', dosageForm: 'Tablet', strength: '40 mg', packSize: "28's" },
  { group: 'Antihypertensives', generic: 'Bisoprolol', brand: 'Cardicor', company: 'Opsonin Pharma', dosageForm: 'Tablet', strength: '5 mg', packSize: "30's" },
  { group: 'Antihypertensives', generic: 'Atorvastatin', brand: 'Atorva', company: 'Square Pharmaceuticals', dosageForm: 'Tablet', strength: '20 mg', packSize: "30's" },

  // GI
  { group: 'Gastrointestinal', generic: 'Omeprazole', brand: 'Maxpro', company: 'Square Pharmaceuticals', dosageForm: 'Capsule', strength: '20 mg', packSize: "30's" },
  { group: 'Gastrointestinal', generic: 'Pantoprazole', brand: 'Peptacid', company: 'Beximco Pharmaceuticals', dosageForm: 'Tablet', strength: '40 mg', packSize: "30's" },
  { group: 'Gastrointestinal', generic: 'Esomeprazole', brand: 'Esomac', company: 'Incepta Pharmaceuticals', dosageForm: 'Capsule', strength: '40 mg', packSize: "14's" },
  { group: 'Gastrointestinal', generic: 'Domperidone', brand: 'Motilium', company: 'Opsonin Pharma', dosageForm: 'Tablet', strength: '10 mg', packSize: "100's" },

  // Respiratory
  { group: 'Respiratory', generic: 'Salbutamol', brand: 'Ventolin', company: 'GlaxoSmithKline (GSK) Bangladesh', dosageForm: 'Inhaler', strength: '100 mcg/dose', packSize: '200 doses' },
  { group: 'Respiratory', generic: 'Levosalbutamol', brand: 'Levotrol', company: 'Renata Limited', dosageForm: 'Syrup', strength: '0.5 mg/5ml', packSize: '100 ml' },
  { group: 'Respiratory', generic: 'Montelukast', brand: 'Montair', company: 'ACI Limited', dosageForm: 'Tablet', strength: '10 mg', packSize: "30's" },
  { group: 'Respiratory', generic: 'Cetirizine', brand: 'Alerid', company: 'Beximco Pharmaceuticals', dosageForm: 'Tablet', strength: '10 mg', packSize: "30's" },

  // Vitamins & Minerals
  { group: 'Vitamins & Minerals', generic: 'Vitamin D3', brand: 'Vita-D', company: 'Square Pharmaceuticals', dosageForm: 'Capsule', strength: '50000 IU', packSize: "4's" },
  { group: 'Vitamins & Minerals', generic: 'Iron + Folic Acid', brand: 'Fefol', company: 'Sanofi Bangladesh', dosageForm: 'Capsule', strength: '150 mg/0.5 mg', packSize: "30's" },
  { group: 'Vitamins & Minerals', generic: 'Multivitamin (prenatal)', brand: 'Pregvit', company: 'Incepta Pharmaceuticals', dosageForm: 'Tablet', strength: 'Multistrength', packSize: "30's" },
  { group: 'Vitamins & Minerals', generic: 'Calcium Carbonate', brand: 'Shelcal', company: 'Zydus Cadila Bangladesh', dosageForm: 'Tablet', strength: '500 mg', packSize: "30's" },

  // ANC / Gynae
  { group: 'ANC / Gynae & Obs', generic: 'Folic Acid', brand: 'Folicare', company: 'ACI Limited', dosageForm: 'Tablet', strength: '5 mg', packSize: "30's" },
  { group: 'ANC / Gynae & Obs', generic: 'Dydrogesterone', brand: 'Duphaston', company: 'Abbott Bangladesh', dosageForm: 'Tablet', strength: '10 mg', packSize: "20's" },
  { group: 'ANC / Gynae & Obs', generic: 'Nifedipine (retard)', brand: 'Nifepin Retard', company: 'Square Pharmaceuticals', dosageForm: 'Tablet', strength: '20 mg', packSize: "30's" },

  // Dental
  { group: 'Dental', generic: 'Chlorhexidine Gluconate', brand: 'Seclo', company: 'ACI Limited', dosageForm: 'Mouthwash', strength: '0.12%', packSize: '250 ml' },
  { group: 'Dental', generic: 'Lidocaine', brand: 'Xylocaine', company: 'Opsonin Pharma', dosageForm: 'Injection (dental)', strength: '2%', packSize: '2 ml' },

  // Topical / Dermatology
  { group: 'Dermatology', generic: 'Clotrimazole', brand: 'Candid', company: 'Renata Limited', dosageForm: 'Cream', strength: '1%', packSize: '20 g' },
  { group: 'Dermatology', generic: 'Hydrocortisone', brand: 'Locoid', company: 'Astella Pharma', dosageForm: 'Cream', strength: '1%', packSize: '15 g' },
];

export const medicineGroups = [...new Set(seedMedicines.map((m) => m.group))].sort();

export const medicineCompanies = [...new Set(seedMedicines.map((m) => m.company))].sort();

export const medicineGenerics = [...new Set(seedMedicines.map((m) => m.generic))].sort();
