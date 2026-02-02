/**
 * Country Resolution Tests (F015)
 *
 * Tests for offline country-to-ISO2 resolution.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveCountryToIso2,
  getCountryName,
  isValidIso2,
  ISO2_SET,
  ISO3_TO_ISO2,
  NAME_TO_ISO2,
  ABBREV_TO_ISO2,
} from './index';

describe('resolveCountryToIso2', () => {
  describe('F015 Step 1: ISO2 code resolution', () => {
    it('returns SA for "SA"', () => {
      expect(resolveCountryToIso2('SA')).toBe('SA');
    });

    it('returns SA for lowercase "sa"', () => {
      expect(resolveCountryToIso2('sa')).toBe('SA');
    });

    it('returns AE for "AE"', () => {
      expect(resolveCountryToIso2('AE')).toBe('AE');
    });

    it('returns EG for "EG"', () => {
      expect(resolveCountryToIso2('EG')).toBe('EG');
    });

    it('returns JO for "JO"', () => {
      expect(resolveCountryToIso2('JO')).toBe('JO');
    });

    it('returns QA for "QA"', () => {
      expect(resolveCountryToIso2('QA')).toBe('QA');
    });

    it('returns US for "US"', () => {
      expect(resolveCountryToIso2('US')).toBe('US');
    });

    it('returns GB for "GB"', () => {
      expect(resolveCountryToIso2('GB')).toBe('GB');
    });

    it('returns null for invalid 2-letter code "XX"', () => {
      expect(resolveCountryToIso2('XX')).toBe(null);
    });
  });

  describe('F015 Step 2: ISO3 code resolution', () => {
    it('returns SA for "SAU"', () => {
      expect(resolveCountryToIso2('SAU')).toBe('SA');
    });

    it('returns SA for lowercase "sau"', () => {
      expect(resolveCountryToIso2('sau')).toBe('SA');
    });

    it('returns AE for "ARE"', () => {
      expect(resolveCountryToIso2('ARE')).toBe('AE');
    });

    it('returns EG for "EGY"', () => {
      expect(resolveCountryToIso2('EGY')).toBe('EG');
    });

    it('returns JO for "JOR"', () => {
      expect(resolveCountryToIso2('JOR')).toBe('JO');
    });

    it('returns QA for "QAT"', () => {
      expect(resolveCountryToIso2('QAT')).toBe('QA');
    });

    it('returns US for "USA"', () => {
      expect(resolveCountryToIso2('USA')).toBe('US');
    });

    it('returns GB for "GBR"', () => {
      expect(resolveCountryToIso2('GBR')).toBe('GB');
    });

    it('returns null for invalid 3-letter code "XYZ"', () => {
      expect(resolveCountryToIso2('XYZ')).toBe(null);
    });
  });

  describe('F015 Step 3: Country name resolution', () => {
    it('returns SA for "Saudi Arabia"', () => {
      expect(resolveCountryToIso2('Saudi Arabia')).toBe('SA');
    });

    it('returns AE for "United Arab Emirates"', () => {
      expect(resolveCountryToIso2('United Arab Emirates')).toBe('AE');
    });

    it('returns EG for "Egypt"', () => {
      expect(resolveCountryToIso2('Egypt')).toBe('EG');
    });

    it('returns JO for "Jordan"', () => {
      expect(resolveCountryToIso2('Jordan')).toBe('JO');
    });

    it('returns QA for "Qatar"', () => {
      expect(resolveCountryToIso2('Qatar')).toBe('QA');
    });

    it('returns US for "United States"', () => {
      expect(resolveCountryToIso2('United States')).toBe('US');
    });

    it('returns GB for "United Kingdom"', () => {
      expect(resolveCountryToIso2('United Kingdom')).toBe('GB');
    });

    it('returns CN for "China"', () => {
      expect(resolveCountryToIso2('China')).toBe('CN');
    });

    it('returns IN for "India"', () => {
      expect(resolveCountryToIso2('India')).toBe('IN');
    });

    it('returns DE for "Germany"', () => {
      expect(resolveCountryToIso2('Germany')).toBe('DE');
    });
  });

  describe('abbreviation resolution', () => {
    it('returns SA for "KSA"', () => {
      expect(resolveCountryToIso2('KSA')).toBe('SA');
    });

    it('returns SA for lowercase "ksa"', () => {
      expect(resolveCountryToIso2('ksa')).toBe('SA');
    });

    it('returns AE for "UAE"', () => {
      expect(resolveCountryToIso2('UAE')).toBe('AE');
    });

    it('returns GB for "UK"', () => {
      expect(resolveCountryToIso2('UK')).toBe('GB');
    });

    it('returns ZA for "RSA"', () => {
      expect(resolveCountryToIso2('RSA')).toBe('ZA');
    });

    it('returns CN for "PRC"', () => {
      expect(resolveCountryToIso2('PRC')).toBe('CN');
    });

    it('returns KR for "ROK"', () => {
      expect(resolveCountryToIso2('ROK')).toBe('KR');
    });

    it('returns KP for "DPRK"', () => {
      expect(resolveCountryToIso2('DPRK')).toBe('KP');
    });
  });

  describe('name variations and edge cases', () => {
    it('returns SA for "The Kingdom of Saudi Arabia"', () => {
      expect(resolveCountryToIso2('The Kingdom of Saudi Arabia')).toBe('SA');
    });

    it('returns SA for "Kingdom of Saudi Arabia"', () => {
      expect(resolveCountryToIso2('Kingdom of Saudi Arabia')).toBe('SA');
    });

    it('returns AE for "Emirates"', () => {
      expect(resolveCountryToIso2('Emirates')).toBe('AE');
    });

    it('returns JO for "Hashemite Kingdom of Jordan"', () => {
      expect(resolveCountryToIso2('Hashemite Kingdom of Jordan')).toBe('JO');
    });

    it('returns QA for "State of Qatar"', () => {
      expect(resolveCountryToIso2('State of Qatar')).toBe('QA');
    });

    it('returns EG for "Arab Republic of Egypt"', () => {
      expect(resolveCountryToIso2('Arab Republic of Egypt')).toBe('EG');
    });

    it('handles uppercase "SAUDI ARABIA"', () => {
      expect(resolveCountryToIso2('SAUDI ARABIA')).toBe('SA');
    });

    it('handles lowercase "saudi arabia"', () => {
      expect(resolveCountryToIso2('saudi arabia')).toBe('SA');
    });

    it('handles mixed case "Saudi ARABIA"', () => {
      expect(resolveCountryToIso2('Saudi ARABIA')).toBe('SA');
    });

    it('handles leading/trailing whitespace', () => {
      expect(resolveCountryToIso2('  Saudi Arabia  ')).toBe('SA');
    });

    it('handles extra internal whitespace', () => {
      expect(resolveCountryToIso2('Saudi   Arabia')).toBe('SA');
    });

    it('returns GB for "Great Britain"', () => {
      expect(resolveCountryToIso2('Great Britain')).toBe('GB');
    });

    it('returns GB for "England"', () => {
      expect(resolveCountryToIso2('England')).toBe('GB');
    });

    it('returns US for "America"', () => {
      expect(resolveCountryToIso2('America')).toBe('US');
    });

    it('returns US for "United States of America"', () => {
      expect(resolveCountryToIso2('United States of America')).toBe('US');
    });

    it('returns NL for "The Netherlands"', () => {
      expect(resolveCountryToIso2('The Netherlands')).toBe('NL');
    });

    it('returns NL for "Holland"', () => {
      expect(resolveCountryToIso2('Holland')).toBe('NL');
    });

    it('returns CZ for "Czech Republic"', () => {
      expect(resolveCountryToIso2('Czech Republic')).toBe('CZ');
    });

    it('returns CZ for "Czechia"', () => {
      expect(resolveCountryToIso2('Czechia')).toBe('CZ');
    });

    it('returns RU for "Russia"', () => {
      expect(resolveCountryToIso2('Russia')).toBe('RU');
    });

    it('returns RU for "Russian Federation"', () => {
      expect(resolveCountryToIso2('Russian Federation')).toBe('RU');
    });
  });

  describe('acceptance fixtures from F002', () => {
    // ACC005: "Riyadh, KSA" - countryText = "KSA"
    it('ACC005: resolves "KSA" to "SA"', () => {
      expect(resolveCountryToIso2('KSA')).toBe('SA');
    });

    // ACC006: "Dubai, United Arab Emirates" - countryText = "United Arab Emirates"
    it('ACC006: resolves "United Arab Emirates" to "AE"', () => {
      expect(resolveCountryToIso2('United Arab Emirates')).toBe('AE');
    });

    // ACC007 & ACC008: whitespace/case normalization (already covered above)
  });

  describe('problematic fixtures from F002', () => {
    // PROB001: "Riyadh, KSA" - KSA abbreviation
    it('PROB001: resolves "KSA" to "SA"', () => {
      expect(resolveCountryToIso2('KSA')).toBe('SA');
    });

    // PROB002: "Riyadh, SA" - ISO2 code
    it('PROB002: resolves "SA" to "SA"', () => {
      expect(resolveCountryToIso2('SA')).toBe('SA');
    });

    // PROB003: "Jeddah, SAU" - ISO3 code
    it('PROB003: resolves "SAU" to "SA"', () => {
      expect(resolveCountryToIso2('SAU')).toBe('SA');
    });

    // PROB009: "Dubai, UAE" - UAE abbreviation
    it('PROB009: resolves "UAE" to "AE"', () => {
      expect(resolveCountryToIso2('UAE')).toBe('AE');
    });

    // PROB011: "RIYADH, SAUDI ARABIA" - uppercase
    it('PROB011: resolves "SAUDI ARABIA" to "SA"', () => {
      expect(resolveCountryToIso2('SAUDI ARABIA')).toBe('SA');
    });

    // PROB013: "The Kingdom of Saudi Arabia" - formal name with article
    it('PROB013: resolves "The Kingdom of Saudi Arabia" to "SA"', () => {
      expect(resolveCountryToIso2('The Kingdom of Saudi Arabia')).toBe('SA');
    });
  });

  describe('empty and null handling', () => {
    it('returns null for undefined', () => {
      expect(resolveCountryToIso2(undefined)).toBe(null);
    });

    it('returns null for empty string', () => {
      expect(resolveCountryToIso2('')).toBe(null);
    });

    it('returns null for whitespace-only string', () => {
      expect(resolveCountryToIso2('   ')).toBe(null);
    });
  });

  describe('unrecognized input', () => {
    it('returns null for unknown country name', () => {
      expect(resolveCountryToIso2('Unknown Country')).toBe(null);
    });

    it('returns null for random string', () => {
      expect(resolveCountryToIso2('abc123')).toBe(null);
    });

    it('returns null for partial match', () => {
      expect(resolveCountryToIso2('Saudi')).toBe(null);
    });

    it('returns null for invalid ISO2-like code', () => {
      expect(resolveCountryToIso2('ZZ')).toBe(null);
    });
  });
});

describe('getCountryName', () => {
  it('returns "Saudi Arabia" for "SA"', () => {
    expect(getCountryName('SA')).toBe('Saudi Arabia');
  });

  it('returns "United Arab Emirates" for "AE"', () => {
    expect(getCountryName('AE')).toBe('United Arab Emirates');
  });

  it('returns "Egypt" for "EG"', () => {
    expect(getCountryName('EG')).toBe('Egypt');
  });

  it('returns "Jordan" for "JO"', () => {
    expect(getCountryName('JO')).toBe('Jordan');
  });

  it('returns "Qatar" for "QA"', () => {
    expect(getCountryName('QA')).toBe('Qatar');
  });

  it('handles lowercase input', () => {
    expect(getCountryName('sa')).toBe('Saudi Arabia');
  });

  it('returns undefined for invalid code', () => {
    expect(getCountryName('XX')).toBe(undefined);
  });
});

describe('isValidIso2', () => {
  it('returns true for valid ISO2 "SA"', () => {
    expect(isValidIso2('SA')).toBe(true);
  });

  it('returns true for valid ISO2 "AE"', () => {
    expect(isValidIso2('AE')).toBe(true);
  });

  it('handles lowercase input', () => {
    expect(isValidIso2('sa')).toBe(true);
  });

  it('returns false for ISO3 code "SAU"', () => {
    expect(isValidIso2('SAU')).toBe(false);
  });

  it('returns false for single letter', () => {
    expect(isValidIso2('S')).toBe(false);
  });

  it('returns false for invalid code "XX"', () => {
    expect(isValidIso2('XX')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidIso2('')).toBe(false);
  });
});

describe('mapping data integrity', () => {
  it('has at least 195 ISO2 codes', () => {
    expect(ISO2_SET.size).toBeGreaterThanOrEqual(195);
  });

  it('has matching ISO3 to ISO2 count', () => {
    expect(ISO3_TO_ISO2.size).toBeGreaterThanOrEqual(195);
  });

  it('has country names for priority countries', () => {
    const priorityCountries = ['SA', 'AE', 'EG', 'JO', 'QA', 'US', 'GB', 'CN', 'IN', 'DE'];
    for (const iso2 of priorityCountries) {
      expect(ISO2_SET.has(iso2)).toBe(true);
      expect(NAME_TO_ISO2.size).toBeGreaterThan(0);
    }
  });

  it('has common abbreviations', () => {
    expect(ABBREV_TO_ISO2.get('KSA')).toBe('SA');
    expect(ABBREV_TO_ISO2.get('UAE')).toBe('AE');
    expect(ABBREV_TO_ISO2.get('UK')).toBe('GB');
  });
});
