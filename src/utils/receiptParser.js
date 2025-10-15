const TOTAL_KEYWORDS = [
  'total',
  'amount due',
  'amount',
  'balance due',
  'grand total'
];

const MERCHANT_STOPWORDS = [
  'receipt',
  'date',
  'time',
  'order',
  'total',
  'amount',
  'invoice',
  'transaction',
  'auth',
  'approved',
  'change',
  'subtotal',
  'tax',
  'cash',
  'credit',
  'debit',
  'merchant',
  'customer',
  'store',
  'thank',
  'tip'
];

function normalizeLine(line) {
  return (line || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\S\r\n]+/g, ' ');
}

function findTotal(lines) {
  const currencyRegex = /([$€£])?\s*([0-9]+[0-9,]*(?:\.[0-9]{2})?)/;
  const totals = [];

  lines.forEach((rawLine, index) => {
    const line = normalizeLine(rawLine);
    if (!line) return;

    const lower = line.toLowerCase();
    const containsKeyword = TOTAL_KEYWORDS.some(keyword => lower.includes(keyword));

    const match = line.match(currencyRegex);
    if (!match) return;

    const [, symbol, amount] = match;
    const numeric = parseFloat(amount.replace(/,/g, ''));
    if (Number.isNaN(numeric)) return;

    totals.push({
      value: numeric,
      formatted: `${symbol || ''}${numeric.toFixed(2)}`,
      priority: containsKeyword ? 1 : 2,
      index
    });
  });

  if (totals.length === 0) {
    return null;
  }

  totals.sort((a, b) => a.priority - b.priority || b.value - a.value || b.index - a.index);
  return totals[0].formatted;
}

function parseDate(raw) {
  const parts = raw.split(/[\/\-\.]/).map(part => part.trim());
  if (parts.length !== 3) return null;

  let [first, second, third] = parts.map(part => part.replace(/\D+/g, ''));
  if (!first || !second || !third) return null;

  if (third.length === 2) {
    const currentYear = new Date().getFullYear();
    const currentCentury = Math.floor(currentYear / 100) * 100;
    const yearCandidate = parseInt(third, 10);
    third = (yearCandidate + currentCentury + (yearCandidate > currentYear % 100 ? -100 : 0)).toString();
  }

  const candidates = [
    { year: third, month: first, day: second },
    { year: third, month: second, day: first }
  ];

  for (const candidate of candidates) {
    const year = parseInt(candidate.year, 10);
    const month = parseInt(candidate.month, 10);
    const day = parseInt(candidate.day, 10);

    if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) {
      continue;
    }

    const iso = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(iso.getTime())) {
      continue;
    }

    return iso.toISOString().slice(0, 10);
  }

  return null;
}

const DATE_PATTERNS = [
  /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/,
  /(20\d{2})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/
];

function findDate(lines) {
  for (const rawLine of lines) {
    const line = normalizeLine(rawLine);
    if (!line) continue;

    for (const pattern of DATE_PATTERNS) {
      const match = line.match(pattern);
      if (!match) continue;

      const iso = parseDate(match[0]);
      if (iso) return iso;
    }
  }

  return null;
}

function findMerchant(lines) {
  for (const rawLine of lines) {
    const line = normalizeLine(rawLine);
    if (!line) continue;

    const hasLetter = /[a-zA-Z]/.test(line);
    if (!hasLetter) continue;

    const lower = line.toLowerCase();
    if (MERCHANT_STOPWORDS.some(stopword => lower.includes(stopword))) {
      continue;
    }

    const mostlyLetters = line.replace(/[^a-zA-Z]/g, '').length / line.length > 0.4;
    if (!mostlyLetters) continue;

    return line;
  }

  return null;
}

export function parseReceiptSuggestions(text) {
  if (!text || typeof text !== 'string') {
    return {
      total: null,
      date: null,
      merchant: null
    };
  }

  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return {
      total: null,
      date: null,
      merchant: null
    };
  }

  return {
    total: findTotal(lines),
    date: findDate(lines),
    merchant: findMerchant(lines)
  };
}

export default parseReceiptSuggestions;
