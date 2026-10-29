/**
 * CrazyPartSnatcher OEM Engine
 * High-performance, zero-dependency normalizer & catalog schema resolver
 * for commercial vehicle (Truck, Trailer, Bus, Agricultural) & automotive OEM part numbers.
 */

export interface ManufacturerDetection {
  manufacturer: string;
  confidence: 'high' | 'medium' | 'low';
  sampleFormatted?: string;
  description: string;
}

/**
 * Normalizes an OEM, OES or aftermarket part number for strict database indexing,
 * cross-referencing, and edge resolution.
 *
 * Strips all whitespace, dots, hyphens, slashes, brackets, and punctuation,
 * converting all characters to standardized uppercase alphanumeric string (`[A-Z0-9]`).
 */
export function normalizeOem(input: unknown): string {
  if (typeof input !== 'string') {
    if (input === null || input === undefined) return '';
    input = String(input);
  }
  return (input as string)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

/**
 * Validates whether an input string syntactically represents a commercial vehicle
 * or automotive part number reference.
 */
export function isLikelyOem(input: unknown): boolean {
  const normalized = normalizeOem(input);
  if (normalized.length < 3 || normalized.length > 25) return false;
  return /[0-9]/.test(normalized) || /^[A-Z]{3,8}$/.test(normalized);
}

/**
 * Generates all realistic search variations and supplier catalog notations
 * for a given part number to intercept inconsistent user queries, CSV supplier imports,
 * and legacy catalog formats across commercial vehicle brands.
 */
export function generateSearchVariants(input: string): string[] {
  const normalized = normalizeOem(input);
  if (!normalized) return [];

  const rawTrimmed = typeof input === 'string' ? input.trim() : '';
  const variants = new Set<string>();

  // Always include canonical normalized form first
  variants.add(normalized);

  // Include trimmed original input if not identical
  if (rawTrimmed && rawTrimmed !== normalized) {
    variants.add(rawTrimmed);
  }

  // 1. MAN Truck & Bus: 11-digit numeric pattern (e.g. 81.50110.0144)
  if (/^\d{11}$/.test(normalized)) {
    const p1 = normalized.slice(0, 2);
    const p2 = normalized.slice(2, 7);
    const p3 = normalized.slice(7);
    variants.add(`${p1}.${p2}.${p3}`);
    variants.add(`${p1}.${p2}-${p3}`);
    variants.add(`${p1} ${p2} ${p3}`);
    variants.add(`${p1}-${p2}-${p3}`);
  }

  // 2. Mercedes-Benz / Daimler Truck
  // Pattern A: Leading 'A' followed by 10 digits (e.g. A 000 420 00 20)
  if (/^A\d{10}$/.test(normalized)) {
    const digits = normalized.slice(1);
    const g1 = digits.slice(0, 3);
    const g2 = digits.slice(3, 6);
    const g3 = digits.slice(6, 8);
    const g4 = digits.slice(8, 10);

    variants.add(digits);
    variants.add(`A ${g1} ${g2} ${g3} ${g4}`);
    variants.add(`A ${g1} ${g2} ${digits.slice(6)}`);
    variants.add(`${g1} ${g2} ${g3} ${g4}`);
    variants.add(`${g1} ${g2} ${digits.slice(6)}`);
    variants.add(`A-${g1}-${g2}-${g3}-${g4}`);
  }
  // Pattern B: 10 digits without leading 'A' (e.g. 0004200020 or 9604200120)
  else if (/^\d{10}$/.test(normalized)) {
    const g1 = normalized.slice(0, 3);
    const g2 = normalized.slice(3, 6);
    const g3 = normalized.slice(6, 8);
    const g4 = normalized.slice(8, 10);

    variants.add(`A${normalized}`);
    variants.add(`A ${g1} ${g2} ${g3} ${g4}`);
    variants.add(`${g1} ${g2} ${g3} ${g4}`);
    variants.add(`${g1} ${g2} ${normalized.slice(6)}`);
  }

  // 3. Bosch: 10-character code starting with digit or 'F' (e.g. 0 281 002 461, F 00M 144 144)
  if (/^[0-9F]\d{9}$/.test(normalized)) {
    const c1 = normalized.slice(0, 1);
    const c2 = normalized.slice(1, 4);
    const c3 = normalized.slice(4, 7);
    const c4 = normalized.slice(7);
    variants.add(`${c1} ${c2} ${c3} ${c4}`);
    variants.add(`${c1}-${c2}-${c3}-${c4}`);
    variants.add(`${normalized.slice(0, 4)} ${c3} ${c4}`);
  }

  // 4. DAF & Scania: 7-digit numeric pattern (e.g. 140 5525, 1 440 304)
  if (/^\d{7}$/.test(normalized)) {
    variants.add(`${normalized.slice(0, 3)} ${normalized.slice(3)}`);
    variants.add(`${normalized.slice(0, 1)} ${normalized.slice(1, 4)} ${normalized.slice(4)}`);
  }

  // 5. Volvo Trucks & Renault Trucks: 8 digits (e.g. 20 512 891) or Renault 10 digits (74 20 512 891)
  if (/^\d{8}$/.test(normalized)) {
    const v1 = normalized.slice(0, 2);
    const v2 = normalized.slice(2, 5);
    const v3 = normalized.slice(5);
    variants.add(`${v1} ${v2} ${v3}`);
    variants.add(`74${normalized}`);
    variants.add(`74 ${v1} ${v2} ${v3}`);
  } else if (/^74\d{8}$/.test(normalized)) {
    const inner = normalized.slice(2);
    variants.add(inner);
    variants.add(`74 ${inner.slice(0, 2)} ${inner.slice(2, 5)} ${inner.slice(5)}`);
  }

  // 6. BPW Bergische Achsen: 10-digit pattern (e.g. 05.801.00.00.0 or 0580100000)
  if (/^0[1-9]\d{8}$/.test(normalized)) {
    const b1 = normalized.slice(0, 2);
    const b2 = normalized.slice(2, 5);
    const b3 = normalized.slice(5, 7);
    const b4 = normalized.slice(7, 9);
    const b5 = normalized.slice(9);
    variants.add(`${b1}.${b2}.${b3}.${b4}.${b5}`);
    variants.add(`${b1} ${b2} ${b3} ${b4} ${b5}`);
  }

  // 7. SAF-HOLLAND: 9-digit pattern (e.g. 3.200.1001.00 or 3200100100)
  if (/^3\d{8,9}$/.test(normalized)) {
    if (normalized.length === 10) {
      variants.add(`${normalized.slice(0, 1)}.${normalized.slice(1, 4)}.${normalized.slice(4, 8)}.${normalized.slice(8)}`);
    } else {
      variants.add(`${normalized.slice(0, 1)}.${normalized.slice(1, 4)}.${normalized.slice(4)}`);
    }
  }

  // 8. DT Spare Parts: 6 or 7 digits (e.g. 4.61234, 2.12345)
  if (/^\d{6}$/.test(normalized)) {
    variants.add(`${normalized.slice(0, 1)}.${normalized.slice(1)}`);
  } else if (/^\d{7}$/.test(normalized)) {
    variants.add(`${normalized.slice(0, 2)}.${normalized.slice(2)}`);
  }

  // 9. Knorr-Bremse: 'K' prefix + 6 digits (e.g. K000123) or 'II' + 5 digits
  if (/^K\d{6}$/.test(normalized)) {
    variants.add(normalized.slice(1));
    variants.add(`K ${normalized.slice(1)}`);
    variants.add(`K.${normalized.slice(1)}`);
  } else if (/^\d{6}$/.test(normalized)) {
    variants.add(`K${normalized}`);
  }

  // 10. Hella: Typically 3 alphanumeric + 6 digits + 3 digits (e.g. 1EL 010 440-021)
  if (/^[A-Z0-9]{3}\d{6}\d{3}$/.test(normalized)) {
    const h1 = normalized.slice(0, 3);
    const h2 = normalized.slice(3, 6);
    const h3 = normalized.slice(6, 9);
    const h4 = normalized.slice(9);
    variants.add(`${h1} ${h2} ${h3}-${h4}`);
    variants.add(`${h1} ${h2} ${h3} ${h4}`);
    variants.add(`${h1}-${h2}-${h3}-${h4}`);
  }

  // 11. VAG (Volkswagen / Audi / SEAT / Skoda)
  if (/^[0-9A-Z]{3}\d{3}\d{3}[A-Z]{0,2}$/.test(normalized)) {
    const v1 = normalized.slice(0, 3);
    const v2 = normalized.slice(3, 6);
    const v3 = normalized.slice(6, 9);
    const suffix = normalized.slice(9);
    variants.add(`${v1} ${v2} ${v3}${suffix ? ' ' + suffix : ''}`);
    variants.add(`${v1}-${v2}-${v3}${suffix ? '-' + suffix : ''}`);
  }

  // 12. Leading Zero Variations
  if (normalized.startsWith('0') && normalized.length > 4) {
    const trimmedZeroes = normalized.replace(/^0+/, '');
    if (trimmedZeroes.length >= 4) {
      variants.add(trimmedZeroes);
    }
  } else if (/^\d{5,9}$/.test(normalized)) {
    variants.add(`0${normalized}`);
  }

  return Array.from(variants);
}

/**
 * Detects catalog formats, structural matches, and confidence levels for commercial vehicle brands.
 */
export function detectManufacturerDetails(input: string): ManufacturerDetection[] {
  const normalized = normalizeOem(input);
  if (!normalized) return [];

  const results: ManufacturerDetection[] = [];

  // MAN Truck & Bus: 11-digit numeric
  if (/^\d{11}$/.test(normalized)) {
    const isManPrefix = /^(81|51|82|83|85|36|64)/.test(normalized);
    results.push({
      manufacturer: 'MAN',
      confidence: isManPrefix ? 'high' : 'medium',
      sampleFormatted: `${normalized.slice(0, 2)}.${normalized.slice(2, 7)}.${normalized.slice(7)}`,
      description: isManPrefix
        ? 'Matches MAN Truck & Bus 11-digit schema (main assembly group prefix)'
        : 'Matches generic MAN 11-digit numeric part structure'
    });
  }

  // Mercedes-Benz / Daimler Truck
  if (/^A\d{10}$/.test(normalized)) {
    const digits = normalized.slice(1);
    results.push({
      manufacturer: 'Mercedes-Benz / Daimler Truck',
      confidence: 'high',
      sampleFormatted: `A ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8, 10)}`,
      description: "Standard Daimler 'A' prefix followed by 10-digit commercial vehicle hierarchy"
    });
  } else if (/^\d{10}$/.test(normalized) && /^(000|960|940|970|651|642|541|457)/.test(normalized)) {
    results.push({
      manufacturer: 'Mercedes-Benz / Daimler Truck',
      confidence: 'medium',
      sampleFormatted: `A ${normalized.slice(0, 3)} ${normalized.slice(3, 6)} ${normalized.slice(6, 8)} ${normalized.slice(8, 10)}`,
      description: 'Matches 10-digit Daimler commercial vehicle schema (omitted leading A)'
    });
  }

  // BPW Bergische Achsen (Trailer Axles)
  if (/^0[1-9]\d{8}$/.test(normalized)) {
    results.push({
      manufacturer: 'BPW Bergische Achsen',
      confidence: 'high',
      sampleFormatted: `${normalized.slice(0, 2)}.${normalized.slice(2, 5)}.${normalized.slice(5, 7)}.${normalized.slice(7, 9)}.${normalized.slice(9)}`,
      description: 'Matches BPW heavy-duty trailer axle & brake assembly 10-digit schema'
    });
  }

  // SAF-HOLLAND (Trailer Suspensions & Axles)
  if (/^3\d{8,9}$/.test(normalized)) {
    results.push({
      manufacturer: 'SAF-HOLLAND',
      confidence: 'high',
      sampleFormatted: normalized.length === 10
        ? `${normalized.slice(0, 1)}.${normalized.slice(1, 4)}.${normalized.slice(4, 8)}.${normalized.slice(8)}`
        : `${normalized.slice(0, 1)}.${normalized.slice(1, 4)}.${normalized.slice(4)}`,
      description: 'Matches SAF-HOLLAND trailer axle & suspension part numbering system'
    });
  }

  // Bosch: 10 chars starting with 0, 1, 2, or F
  if (/^[0-9F]\d{9}$/.test(normalized)) {
    const isBoschTypical = /^(028|098|044|045|198|F00)/.test(normalized);
    results.push({
      manufacturer: 'Bosch',
      confidence: isBoschTypical ? 'high' : 'medium',
      sampleFormatted: `${normalized.slice(0, 1)} ${normalized.slice(1, 4)} ${normalized.slice(4, 7)} ${normalized.slice(7)}`,
      description: 'Matches Bosch 10-character automotive product catalog schema'
    });
  }

  // WABCO: 10-digit numeric typically starting with 4
  if (/^4\d{9}$/.test(normalized)) {
    results.push({
      manufacturer: 'WABCO',
      confidence: 'medium',
      sampleFormatted: `${normalized.slice(0, 3)} ${normalized.slice(3, 6)} ${normalized.slice(6, 9)} ${normalized.slice(9)}`,
      description: 'Matches WABCO commercial braking & pneumatic 10-digit schema'
    });
  }

  // Knorr-Bremse: 'K' + 6 digits or 'II' + 5 digits
  if (/^K\d{6}$/.test(normalized)) {
    results.push({
      manufacturer: 'Knorr-Bremse',
      confidence: 'high',
      sampleFormatted: `K${normalized.slice(1)}`,
      description: "Standard Knorr-Bremse commercial vehicle 'K' reference schema"
    });
  } else if (/^II\d{5}$/.test(normalized)) {
    results.push({
      manufacturer: 'Knorr-Bremse',
      confidence: 'high',
      sampleFormatted: normalized,
      description: 'Legacy Knorr-Bremse pneumatic valve & brake assembly schema'
    });
  }

  // DAF & Scania: 7 digits
  if (/^\d{7}$/.test(normalized)) {
    const isScaniaRange = /^(13|14|15|17|18|19|20|21|22|23|24)\d{5}$/.test(normalized);
    const isDafRange = /^(0|14|16|17|18|19)\d{5}$/.test(normalized);

    if (isScaniaRange) {
      results.push({
        manufacturer: 'Scania',
        confidence: 'medium',
        sampleFormatted: `${normalized.slice(0, 1)} ${normalized.slice(1, 4)} ${normalized.slice(4)}`,
        description: 'Matches Scania 7-digit truck & bus part numbering'
      });
    }

    if (isDafRange) {
      results.push({
        manufacturer: 'DAF',
        confidence: 'medium',
        sampleFormatted: `${normalized.slice(0, 3)} ${normalized.slice(3)}`,
        description: 'Matches DAF 7-digit commercial vehicle numbering'
      });
    }

    if (!isScaniaRange && !isDafRange) {
      results.push({
        manufacturer: 'DAF / Scania',
        confidence: 'low',
        sampleFormatted: `${normalized.slice(0, 3)} ${normalized.slice(3)}`,
        description: 'Matches 7-digit commercial vehicle reference schema'
      });
    }
  }

  // Volvo Trucks / Renault Trucks: 8 digits or 10 digits (74...)
  if (/^\d{8}$/.test(normalized)) {
    results.push({
      manufacturer: 'Volvo Trucks',
      confidence: 'medium',
      sampleFormatted: `${normalized.slice(0, 2)} ${normalized.slice(2, 5)} ${normalized.slice(5)}`,
      description: 'Matches Volvo Trucks 8-digit group reference format'
    });
  } else if (/^74\d{8}$/.test(normalized)) {
    results.push({
      manufacturer: 'Renault Trucks',
      confidence: 'high',
      sampleFormatted: `74 ${normalized.slice(2, 4)} ${normalized.slice(4, 7)} ${normalized.slice(7)}`,
      description: 'Matches Renault Trucks 10-digit group schema (Volvo Group 74-prefix)'
    });
  }

  // Iveco: 8 to 10 digits
  if (/^(50|58|42|99)\d{6,8}$/.test(normalized)) {
    results.push({
      manufacturer: 'Iveco',
      confidence: 'medium',
      sampleFormatted: normalized,
      description: 'Matches Iveco commercial vehicle part numbering series'
    });
  }

  // DT Spare Parts: 6 or 7 digits (e.g. 4.61234)
  if (/^[1-9]\d{5,6}$/.test(normalized)) {
    results.push({
      manufacturer: 'DT Spare Parts',
      confidence: 'low',
      sampleFormatted: `${normalized.slice(0, normalized.length - 5)}.${normalized.slice(normalized.length - 5)}`,
      description: 'Matches DT Spare Parts catalog numbering (X.XXXXX)'
    });
  }

  // Hella: 3 alpha prefix + 6 digits + 3 digits (e.g. 1EL 010 440-021)
  if (/^[A-Z0-9]{3}\d{9}$/.test(normalized)) {
    const isHellaPrefix = /^(1EL|8JA|6PA|2VP|9EL|1LL|1EE|2BA|8JS)/.test(normalized);
    if (isHellaPrefix) {
      results.push({
        manufacturer: 'Hella',
        confidence: 'high',
        sampleFormatted: `${normalized.slice(0, 3)} ${normalized.slice(3, 6)} ${normalized.slice(6, 9)}-${normalized.slice(9)}`,
        description: 'Matches Hella lighting, electrical & sensor part schema'
      });
    }
  }

  // Febi Bilstein: 5 or 6 digits numeric
  if (/^\d{5,6}$/.test(normalized)) {
    results.push({
      manufacturer: 'Febi Bilstein',
      confidence: 'low',
      sampleFormatted: normalized,
      description: 'Matches Febi Bilstein aftermarket article numbering'
    });
  }

  // VAG (Volkswagen / Audi / SEAT / Skoda)
  if (/^[0-9A-Z]{3}\d{3}\d{3}[A-Z]{0,2}$/.test(normalized)) {
    results.push({
      manufacturer: 'VAG (Volkswagen / Audi / SEAT / Skoda)',
      confidence: 'medium',
      sampleFormatted: `${normalized.slice(0, 3)} ${normalized.slice(3, 6)} ${normalized.slice(6, 9)}${normalized.length > 9 ? ' ' + normalized.slice(9) : ''}`,
      description: 'Matches VAG 3-3-3 component and subgroup structure'
    });
  }

  return results;
}

/**
 * Returns detected brand names as a flat array of strings.
 */
export function detectManufacturerFormat(input: string): string[] {
  const details = detectManufacturerDetails(input);
  return details.map((d) => d.manufacturer);
}

/**
 * Formats a raw or normalized OEM number into its conventional standard display format.
 */
export function formatOemDisplay(input: string, preferredManufacturer?: string): string {
  const normalized = normalizeOem(input);
  if (!normalized) return '';

  const details = detectManufacturerDetails(normalized);
  if (preferredManufacturer) {
    const match = details.find((d) =>
      d.manufacturer.toLowerCase().includes(preferredManufacturer.toLowerCase())
    );
    if (match?.sampleFormatted) return match.sampleFormatted;
  }

  const best = details.sort((a, b) => {
    const score = { high: 3, medium: 2, low: 1 };
    return score[b.confidence] - score[a.confidence];
  })[0];

  return best?.sampleFormatted || normalized;
}
