import { parseReceiptSuggestions } from '../../src/utils/receiptParser.js';

describe('parseReceiptSuggestions', () => {
  it('detects total, date, and merchant in a typical receipt', () => {
    const text = `Coffee Spot\n123 Main Street\nDate: 10/15/2025\nItem A 12.99\nTOTAL $45.67`;

    const suggestions = parseReceiptSuggestions(text);

    expect(suggestions.total).toBe('$45.67');
    expect(suggestions.date).toBe('2025-10-15');
    expect(suggestions.merchant).toBe('Coffee Spot');
  });

  it('handles missing data gracefully', () => {
    const suggestions = parseReceiptSuggestions('random text without numbers');

    expect(suggestions.total).toBeNull();
    expect(suggestions.date).toBeNull();
    expect(suggestions.merchant).toBe('random text without numbers');
  });
});
