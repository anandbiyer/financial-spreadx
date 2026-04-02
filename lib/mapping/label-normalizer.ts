/**
 * M1 — Label Normalizer
 *
 * Pure string transformations applied before any dictionary lookup.
 */

const ABBREVIATIONS: Record<string, string> = {
  pbt: 'profit before tax',
  pat: 'profit after tax',
  eps: 'earnings per share',
  ppe: 'property plant and equipment',
  npa: 'non performing assets',
  roa: 'return on assets',
  roe: 'return on equity',
  nii: 'net interest income',
  nim: 'net interest margin',
  crar: 'capital to risk weighted assets ratio',
  gnpa: 'gross non performing assets',
  nnpa: 'net non performing assets',
};

/**
 * Normalize a raw extracted label into a clean, lowercase string
 * suitable for dictionary lookup.
 */
export function normalizeLabel(rawLabel: string): string {
  let label = rawLabel;

  // 1. Handle multi-line labels: if there's a line with CJK characters
  //    followed by an English line, keep only the English portion
  if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(label)) {
    const lines = label.split(/\n|\r\n?/);
    const englishLines = lines.filter(
      (line) => !/[\u4e00-\u9fff\u3400-\u4dbf]/.test(line) && line.trim().length > 0,
    );
    if (englishLines.length > 0) {
      label = englishLines.join(' ');
    }
  }

  // 2. Strip leading Roman numerals: "VII. Profit" → "Profit"
  label = label.replace(
    /^(?:M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3}))\.\s*/i,
    '',
  );

  // 3. Strip leading Arabic numerals: "12. Revenue" → "Revenue"
  label = label.replace(/^\d+[\.\)\-]\s*/, '');

  // 3a. Strip lettered sub-item prefixes: "(a) Cash..." / "(ii) Trade..." → "Cash..."
  label = label.replace(/^\([a-z]{1,3}\)\s+/i, '');
  // Also strip Roman numeral sub-items in parens: "(i)", "(ii)", "(iii)"
  label = label.replace(/^\((?:i{1,3}|iv|vi{0,3}|ix|x)\)\s+/i, '');

  // 4. Remove note references: "(Note 21)", "(note 3.1)", "(Refer Note 5)"
  label = label.replace(/\(?\s*(?:refer\s+)?note\s+[\d\.]+\s*\)?/gi, '');

  // 5. Strip parenthetical qualifiers: "(Restated)", "(net)", "(audited)"
  label = label.replace(
    /\(\s*(?:restated|re-stated|revised|net|audited|unaudited|continued|contd)\s*\)/gi,
    '',
  );

  // 6. Normalize whitespace and lowercase
  label = label.replace(/\s+/g, ' ').trim().toLowerCase();

  // 7. Expand abbreviations (only if the entire label matches)
  if (ABBREVIATIONS[label]) {
    label = ABBREVIATIONS[label];
  }

  return label;
}
