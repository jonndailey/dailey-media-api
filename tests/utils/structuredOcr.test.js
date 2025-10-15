import buildStructuredOcrData from '../../src/utils/structuredOcr.js';

const makeWord = (text, x0, y0, x1, y1, confidence = 95.5) => ({
  text,
  confidence,
  boundingBox: { x0, y0, x1, y1 },
  baseline: null,
  page: 0,
  block: 0,
  paragraph: 0,
  line: 0,
  word: 0
});

const makeLine = (text, boundingBox, words, confidence = 92.4) => ({
  text,
  confidence,
  boundingBox,
  baseline: null,
  page: 0,
  block: 0,
  paragraph: 0,
  line: 0,
  words
});

describe('buildStructuredOcrData', () => {
  it('extracts key value pairs and form fields', () => {
    const lines = [
      makeLine(
        'Invoice Number: 12345',
        { x0: 10, y0: 10, x1: 280, y1: 32 },
        [
          makeWord('Invoice', 10, 10, 80, 32),
          makeWord('Number:', 90, 10, 170, 32),
          makeWord('12345', 180, 10, 240, 32)
        ]
      ),
      makeLine(
        'Customer Name    Jane Doe',
        { x0: 10, y0: 40, x1: 300, y1: 62 },
        [
          makeWord('Customer', 10, 40, 100, 62),
          makeWord('Name', 110, 40, 170, 62),
          makeWord('Jane', 190, 40, 240, 62),
          makeWord('Doe', 250, 40, 290, 62)
        ]
      ),
      makeLine(
        'Signature ____________',
        { x0: 10, y0: 70, x1: 320, y1: 92 },
        [
          makeWord('Signature', 10, 70, 110, 92),
          makeWord('____________', 120, 70, 320, 92)
        ]
      )
    ];

    const result = buildStructuredOcrData({ lines, words: lines.flatMap(line => line.words) });

    expect(result.keyValuePairs).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'Invoice Number', value: '12345' }),
      expect.objectContaining({ key: 'Customer Name', value: 'Jane Doe' })
    ]));

    expect(result.formFields).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'blank', label: 'Signature' })
    ]));
  });

  it('detects tabular rows with consistent columns', () => {
    const headerWords = [
      makeWord('Item', 20, 120, 70, 142),
      makeWord('Qty', 110, 120, 150, 142),
      makeWord('Price', 200, 120, 260, 142)
    ];

    const row1Words = [
      makeWord('Coffee', 18, 150, 90, 172),
      makeWord('2', 120, 150, 140, 172),
      makeWord('$10.00', 190, 150, 260, 172)
    ];

    const row2Words = [
      makeWord('Sandwich', 18, 180, 110, 202),
      makeWord('1', 120, 180, 140, 202),
      makeWord('$7.50', 190, 180, 250, 202)
    ];

    const lines = [
      makeLine('Item Qty Price', { x0: 18, y0: 120, x1: 260, y1: 142 }, headerWords),
      makeLine('Coffee 2 $10.00', { x0: 18, y0: 150, x1: 260, y1: 172 }, row1Words),
      makeLine('Sandwich 1 $7.50', { x0: 18, y0: 180, x1: 260, y1: 202 }, row2Words)
    ];

    const result = buildStructuredOcrData({
      lines,
      words: lines.flatMap(line => line.words)
    });

    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].header).toEqual(['Item', 'Qty', 'Price']);
    expect(result.tables[0].rows).toEqual([
      ['Coffee', '2', '$10.00'],
      ['Sandwich', '1', '$7.50']
    ]);
  });
});
