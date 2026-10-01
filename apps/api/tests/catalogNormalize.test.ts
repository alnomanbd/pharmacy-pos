import { describe, it, expect } from 'vitest';
import {
  tidy,
  stripRedundantStrength,
  canonicalCompany,
  companyKey,
  canonicalGeneric,
  genericKey,
  canonicalDosageForm,
  canonicalStrength,
  strengthKey,
  canonicalBrand,
  brandKey,
  normaliseCatalogRow,
} from '../src/services/catalogNormalize.js';

/**
 * The catalogue is going to be enriched from several sources over months. These
 * tests are the contract that makes that safe: the same real-world thing, spelled
 * differently by two sources, must end up as one row — and two different things
 * must never be merged, however similar they look.
 */

describe('tidy', () => {
  it('collapses whitespace and normalises typographic punctuation', () => {
    expect(tidy('  Beximco   Pharmaceuticals  ')).toBe('Beximco Pharmaceuticals');
    expect(tidy('Sandoz’ Ltd')).toBe("Sandoz' Ltd");
    expect(tidy('Novo–Nordisk')).toBe('Novo-Nordisk');
    expect(tidy(null)).toBe('');
  });
});

describe('canonicalCompany', () => {
  it('never renames a company', () => {
    // The company is *registered* as "ACI Limited" — medex.com.bd lists it that
    // way, and so does the invoice. An earlier version rewrote every "Limited"
    // to "Ltd." for tidiness, which made the catalogue disagree with the
    // registry. Two spellings are prevented at import instead, by matching on a
    // fingerprint, so the first source's spelling survives untouched.
    expect(canonicalCompany('ACI Limited')).toBe('ACI Limited');
    expect(canonicalCompany('Square Pharmaceuticals PLC.')).toBe('Square Pharmaceuticals PLC.');
    expect(canonicalCompany('Beximco Pharmaceuticals Ltd.')).toBe('Beximco Pharmaceuticals Ltd.');
  });

  it('fixes a shouting or lower-case name', () => {
    expect(canonicalCompany('BEXIMCO PHARMACEUTICALS LTD')).toBe('Beximco Pharmaceuticals Ltd');
    expect(canonicalCompany('beximco pharmaceuticals ltd.')).toBe('Beximco Pharmaceuticals Ltd.');
  });

  it('leaves a deliberately mixed-case name alone', () => {
    // Rewriting these is how a correct name becomes a wrong one.
    expect(canonicalCompany('GlaxoSmithKline Bangladesh Ltd.')).toBe(
      'GlaxoSmithKline Bangladesh Ltd.',
    );
    expect(canonicalCompany('Radiant Pharmaceuticals Ltd.')).toBe('Radiant Pharmaceuticals Ltd.');
  });

  it('still keys the spellings together, which is what stops the duplicate', () => {
    expect(companyKey('ACI Limited')).toBe(companyKey('ACI Ltd.'));
    expect(companyKey('Square Pharmaceuticals PLC.')).toBe(companyKey('Square Pharmaceuticals'));
  });

  it('drops a trailing comma an export left behind', () => {
    expect(canonicalCompany('Opsonin Pharma Ltd.,')).toBe('Opsonin Pharma Ltd.');
  });
});

describe('companyKey', () => {
  it('agrees across the spellings of one company', () => {
    const keys = [
      'Beximco Pharmaceuticals Ltd.',
      'Beximco Pharmaceuticals',
      'BEXIMCO PHARMA LTD',
      'Beximco  Pharmaceuticals   Limited',
    ].map(companyKey);
    expect(new Set(keys).size).toBe(1);
  });

  it('agrees for the "Laboratories"/"Labs" pair', () => {
    expect(companyKey('ACME Laboratories Ltd.')).toBe(companyKey('Acme Labs'));
  });

  it('keeps genuinely different companies apart', () => {
    expect(companyKey('Square Pharmaceuticals Ltd.')).not.toBe(companyKey('Sandoz Ltd.'));
    expect(companyKey('Incepta Pharmaceuticals Ltd.')).not.toBe(companyKey('Ibn Sina Pharma'));
  });

  it('is a proposal, not a merge', () => {
    // Dropping the industry words is what makes "Beximco Pharma" match, and it
    // is also what makes these two collide — a name that differs only in the
    // dropped word keys the same while being a different company. So the key
    // only ever *proposes*: `catalog:audit` reports the pair and a person
    // decides. An importer that merged on a fingerprint would quietly reassign
    // a hundred medicines to the wrong maker.
    expect(companyKey('Delta Pharma Ltd.')).toBe(companyKey('Delta Laboratories Ltd.'));
  });
});

describe('canonicalGeneric', () => {
  it('gives combinations one separator and one casing', () => {
    const forms = [
      'Amoxicillin+Clavulanic Acid',
      'amoxicillin + clavulanic acid',
      'Amoxicillin +Clavulanic Acid',
      'AMOXICILLIN + CLAVULANIC ACID',
    ].map(canonicalGeneric);
    expect(new Set(forms).size).toBe(1);
    expect(forms[0]).toBe('Amoxicillin + Clavulanic Acid');
  });

  it('keeps a salt form in the stored name', () => {
    // The box says "Hydrochloride"; the bill should too.
    expect(canonicalGeneric('cetirizine dihydrochloride')).toBe('Cetirizine Dihydrochloride');
  });
});

describe('genericKey', () => {
  it('sees through the salt form', () => {
    expect(genericKey('Cetirizine Dihydrochloride')).toBe(genericKey('Cetirizine'));
    expect(genericKey('Amlodipine Besylate')).toBe(genericKey('amlodipine'));
    expect(genericKey('Ceftriaxone Sodium')).toBe(genericKey('Ceftriaxone'));
  });

  it('ignores the order of a combination', () => {
    expect(genericKey('Amoxicillin + Clavulanic Acid')).toBe(
      genericKey('Clavulanic Acid + Amoxicillin'),
    );
  });

  it('keeps different molecules apart', () => {
    expect(genericKey('Paracetamol')).not.toBe(genericKey('Paracetamol + Caffeine'));
    expect(genericKey('Cefixime')).not.toBe(genericKey('Cefuroxime'));
  });
});

describe('canonicalDosageForm', () => {
  it('expands the common abbreviations', () => {
    expect(canonicalDosageForm('tab')).toBe('Tablet');
    expect(canonicalDosageForm('CAPS')).toBe('Capsule');
    expect(canonicalDosageForm('syp')).toBe('Syrup');
    expect(canonicalDosageForm('eye drops')).toBe('Eye Drop');
    expect(canonicalDosageForm('IM/IV Injection')).toBe('IM/IV Injection');
  });

  it('keeps an unknown form rather than forcing it into a known one', () => {
    expect(canonicalDosageForm('powder for suspension')).toBe('Powder for Suspension');
    expect(canonicalDosageForm('Tablet (Enteric Coated)')).toBe('Tablet (Enteric Coated)');
  });
});

describe('canonicalStrength', () => {
  it('spaces the unit and normalises its case', () => {
    expect(canonicalStrength('500mg')).toBe('500 mg');
    expect(canonicalStrength('500 MG')).toBe('500 mg');
    expect(canonicalStrength('120mg/5ml')).toBe('120 mg/5 ml');
    expect(canonicalStrength('40 iu')).toBe('40 IU');
  });

  it('never converts a unit', () => {
    // 0.5 mg and 500 mcg are the same dose. The bill must read the way
    // the box does, or a pharmacist cannot check it.
    expect(canonicalStrength('0.5 mg')).toBe('0.5 mg');
    expect(canonicalStrength('500 mcg')).toBe('500 mcg');
    expect(canonicalStrength('500ug')).toBe('500 mcg');
  });

  it('gives combination strengths one shape', () => {
    expect(canonicalStrength('(10 mg+30 mg)/5 ml')).toBe('(10 mg + 30 mg)/5 ml');
  });

  it('matches across spacing with the key', () => {
    expect(strengthKey('500mg')).toBe(strengthKey('500 MG'));
    expect(strengthKey('120 mg/5 ml')).toBe(strengthKey('120mg/5ml'));
    expect(strengthKey('250 mg')).not.toBe(strengthKey('500 mg'));
  });
});

describe('canonicalBrand', () => {
  it('leaves the trademark alone', () => {
    // A brand name is what is printed on the box, casing included.
    expect(canonicalBrand('XPA')).toBe('XPA');
    expect(canonicalBrand('Napa Extend')).toBe('Napa Extend');
    expect(canonicalBrand('  Seclo  ')).toBe('Seclo');
  });

  it('removes nothing — a trademark survives whole', () => {
    // An earlier version stripped a trailing form word. It destroyed real DGDA
    // names: "Benzyl Lotion" became "Benzyl", unfindable by the name on the box.
    expect(canonicalBrand('Benzyl Lotion')).toBe('Benzyl Lotion');
    expect(canonicalBrand('Napa Suppository')).toBe('Napa Suppository');
    expect(canonicalBrand('Seclo Capsule')).toBe('Seclo Capsule');
  });

  it('keys brands ignoring case and punctuation', () => {
    expect(brandKey('Cef-3')).toBe(brandKey('cef 3'));
    expect(brandKey('Napa')).not.toBe(brandKey('Napa Extend'));
  });
});

describe('normaliseCatalogRow', () => {
  it('normalises every field an import row carries, and touches nothing else', () => {
    const row = normaliseCatalogRow({
      brandName: '  moxacil  ',
      genericName: 'amoxicillin+clavulanic acid',
      companyName: 'SQUARE PHARMACEUTICALS LTD.',
      dosageForm: 'tab',
      strength: '500mg',
      packSize: '  10 x 10 ',
      price: '1.20',
      _line: 7,
    });
    expect(row).toMatchObject({
      brandName: 'Moxacil',
      genericName: 'Amoxicillin + Clavulanic Acid',
      companyName: 'Square Pharmaceuticals Ltd.',
      dosageForm: 'Tablet',
      strength: '500 mg',
      packSize: '10 x 10',
      price: '1.20',
      _line: 7,
    });
  });

  it('leaves a row with nothing to normalise unchanged', () => {
    expect(normaliseCatalogRow({ price: '5', status: 'active' })).toEqual({
      price: '5',
      status: 'active',
    });
  });
});

describe('route suffixes on a generic name', () => {
  it('strips the route, which the dosage-form column already carries', () => {
    // The registry export splits one molecule into four generics this way, and a
    // pharmacist filtering by "Acyclovir" then cannot see the eye ointment.
    expect(canonicalGeneric('Acyclovir (Oral)')).toBe('Acyclovir');
    expect(canonicalGeneric('Ciprofloxacin (Ophthalmic)')).toBe('Ciprofloxacin');
    expect(canonicalGeneric('Salbutamol (Inhaler)')).toBe('Salbutamol');
    expect(canonicalGeneric('Betamethasone + Neomycin Sulphate (Topical)')).toBe(
      'Betamethasone + Neomycin Sulphate',
    );
  });

  it('keeps a parenthetical that is part of the molecule', () => {
    // The source of the albumin is not a route, and dropping it would merge two
    // genuinely different products.
    expect(canonicalGeneric('Albumin (Human)')).toBe('Albumin (Human)');
    expect(canonicalGeneric('Insulin (Human)')).toBe('Insulin (Human)');
  });

  it('keys a kept parenthetical against the bare molecule anyway', () => {
    // The key only proposes: "Albumin (Human)" vs "Albumin" is worth a look.
    expect(genericKey('Albumin (Human)')).toBe(genericKey('Albumin'));
  });
});


describe('stripRedundantStrength', () => {
  it('removes the strength DGDA writes into the brand name', () => {
    // A customer asks for "Zeocin", and the same product in another source is listed
    // as plain "Zeocin" — the two never match while the number is attached.
    expect(stripRedundantStrength('Zeocin 500', '500 mg')).toBe('Zeocin');
    expect(stripRedundantStrength('Turbocef 250', '250 mg/5 ml')).toBe('Turbocef');
    expect(stripRedundantStrength('Napa 500mg', '500 mg')).toBe('Napa');
    expect(stripRedundantStrength('Monas-10', '10 mg')).toBe('Monas');
  });

  it('keeps a trailing number that is not the strength', () => {
    // Plenty of real trademarks end in a number.
    expect(stripRedundantStrength('Cef-3', '200 mg')).toBe('Cef-3');
    expect(stripRedundantStrength('B-50', '10 mg')).toBe('B-50');
    expect(stripRedundantStrength('Zimax 500', '250 mg')).toBe('Zimax 500');
  });

  it('never empties the name', () => {
    expect(stripRedundantStrength('500', '500 mg')).toBe('500');
    expect(stripRedundantStrength('', '500 mg')).toBe('');
  });

  it('leaves a brand with no trailing number alone', () => {
    expect(stripRedundantStrength('Napa Extend', '665 mg')).toBe('Napa Extend');
    expect(stripRedundantStrength('Benzyl Lotion', '1.25 gm/5 ml')).toBe('Benzyl Lotion');
  });
});

describe('spelling corrections', () => {
  it('corrects the typos that are in the published data', () => {
    // Each one is a second entry in the generic list for a drug that already has
    // one — so a pharmacist filtering by Tenoxicam does not see the Tanoxicam brand.
    expect(canonicalGeneric('Inferferon Alfa-2a')).toBe('Interferon Alfa-2a');
    expect(canonicalGeneric('Trustuzumab')).toBe('Trastuzumab');
    expect(canonicalGeneric('Norephinephrine')).toBe('Norepinephrine');
    expect(canonicalGeneric('Tanoxicam')).toBe('Tenoxicam');
    expect(canonicalGeneric('Anastrozol')).toBe('Anastrozole');
    expect(canonicalGeneric('Insulin Glargin')).toBe('Insulin Glargine');
  });

  it('corrects a typo inside a combination', () => {
    expect(canonicalGeneric('Potassium Chloride + Magnessium Chloride')).toBe(
      'Potassium Chloride + Magnesium Chloride',
    );
  });

  it('picks one of two correct spellings, the one on the box', () => {
    // Aciclovir (INN) and Acyclovir (USAN) are both right; a catalogue has to
    // choose, and the choice is what Bangladeshi packs say.
    expect(canonicalGeneric('Aciclovir')).toBe('Acyclovir');
    expect(canonicalGeneric('Torsemide')).toBe('Torasemide');
  });

  it('gives a combination one separator, whichever the source used', () => {
    expect(canonicalGeneric('Multivitamin & Multimineral')).toBe('Multivitamin + Multimineral');
    expect(canonicalGeneric('Multivitamin+Multimineral')).toBe('Multivitamin + Multimineral');
  });

  it('leaves a name it has no opinion about exactly as written', () => {
    expect(canonicalGeneric('Esomeprazole')).toBe('Esomeprazole');
    expect(canonicalGeneric('Insulin (Human) R')).toBe('Insulin (Human) R');
  });
});

describe('strengthKey ignores the order of a combination', () => {
  it('matches the same combination written either way round', () => {
    // The registry writes Salflu as "100 mcg + 50 mcg" and the drug index as
    // "50 mcg + 100 mcg". Order-sensitive matching missed 124 products this way,
    // each landing in the catalogue twice: one row with a registration number and
    // no price, the other with a price and no registration.
    expect(strengthKey('100 mcg + 50 mcg')).toBe(strengthKey('50 mcg + 100 mcg'));
    expect(strengthKey('500 mg + 65 mg')).toBe(strengthKey('65 mg + 500 mg'));
    expect(strengthKey('200 mcg + 200 mg + 100 mg')).toBe(strengthKey('100 mg + 200 mg + 200 mcg'));
  });

  it('matches across the bracket-and-slash shapes the sources use', () => {
    expect(strengthKey('500 IU + 5 mg/gm')).toBe(strengthKey('(5 mg + 500 IU)/gm'));
  });

  it('still tells different strengths apart', () => {
    expect(strengthKey('5 mg + 500 mg')).not.toBe(strengthKey('10 mg + 500 mg'));
    expect(strengthKey('250 mg')).not.toBe(strengthKey('500 mg'));
    expect(strengthKey('500 mg')).toBe(strengthKey('500mg'));
  });
});
