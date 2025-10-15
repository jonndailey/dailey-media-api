function normalizeBoundingBox(box) {
  if (!box || typeof box !== 'object') {
    return null;
  }

  const { x0, y0, x1, y1 } = box;
  if (
    [x0, y0, x1, y1].some(value => typeof value !== 'number' || Number.isNaN(value))
  ) {
    return null;
  }

  return {
    x0,
    y0,
    x1,
    y1
  };
}

function mergeBoundingBoxes(boxes) {
  const normalized = boxes
    .map(normalizeBoundingBox)
    .filter(Boolean);

  if (!normalized.length) {
    return null;
  }

  const x0 = Math.min(...normalized.map(box => box.x0));
  const y0 = Math.min(...normalized.map(box => box.y0));
  const x1 = Math.max(...normalized.map(box => box.x1));
  const y1 = Math.max(...normalized.map(box => box.y1));

  return { x0, y0, x1, y1 };
}

function detectKeyValuePairs(lines = []) {
  const pairs = [];

  lines.forEach((line, index) => {
    const text = (line.text || '').trim();
    if (!text) {
      return;
    }

    let key = null;
    let value = null;

    if (text.includes(':')) {
      const [rawKey, ...rest] = text.split(':');
      key = rawKey.trim();
      value = rest.join(':').trim();
    } else {
      const parts = text.split(/\s{2,}/).map(part => part.trim()).filter(Boolean);
      if (parts.length >= 2) {
        key = parts[0];
        value = parts.slice(1).join(' ');
      }
    }

    if (!key || key.length < 2 || !value) {
      return;
    }

    pairs.push({
      key,
      value,
      lineIndex: index,
      confidence: typeof line.confidence === 'number'
        ? Number(line.confidence.toFixed(2))
        : null,
      boundingBox: normalizeBoundingBox(line.boundingBox)
    });
  });

  return pairs;
}

function buildTableRow(line) {
  if (!line || !Array.isArray(line.words) || line.words.length < 2) {
    return null;
  }

  const wordEntries = line.words
    .map(word => {
      const text = (word.text || '').trim();
      if (!text) {
        return null;
      }

      const box = normalizeBoundingBox(word.boundingBox);
      const center =
        box && typeof box.x0 === 'number' && typeof box.x1 === 'number'
          ? (box.x0 + box.x1) / 2
          : null;

      return {
        text,
        center,
        box
      };
    })
    .filter(Boolean);

  if (wordEntries.length < 2) {
    return null;
  }

  const columns = [];
  const columnThreshold = 28;

  wordEntries.forEach(entry => {
    const position = entry.center ?? (columns.length ? columns[columns.length - 1].position + 120 : 0);
    let targetColumn = columns.find(column => Math.abs(column.position - position) <= columnThreshold);

    if (!targetColumn) {
      targetColumn = {
        position,
        words: [],
        boxes: []
      };
      columns.push(targetColumn);
    }

    targetColumn.words.push(entry.text);
    if (entry.box) {
      targetColumn.boxes.push(entry.box);
    }
  });

  if (columns.length < 2) {
    return null;
  }

  columns.sort((a, b) => a.position - b.position);

  return {
    cells: columns.map(column => column.words.join(' ').trim()),
    columnPositions: columns.map(column => column.position),
    boundingBox: normalizeBoundingBox(line.boundingBox),
    confidence: typeof line.confidence === 'number'
      ? Number(line.confidence.toFixed(2))
      : null
  };
}

function columnsAreSimilar(reference = [], candidate = []) {
  if (!reference.length || reference.length !== candidate.length) {
    return false;
  }

  const tolerance = 36;
  return reference.every((position, index) => Math.abs(position - candidate[index]) <= tolerance);
}

function detectTables(lines = []) {
  const tables = [];
  let currentTable = null;

  const finalizeTable = () => {
    if (!currentTable) {
      return;
    }

    const boxes = currentTable.rows
      .map(row => row.boundingBox)
      .filter(Boolean);

    const tableBoundingBox = mergeBoundingBoxes(boxes);

    const confidences = currentTable.rows
      .map(row => row.confidence)
      .filter(value => typeof value === 'number');

    const averageConfidence = confidences.length
      ? Number(
        (confidences.reduce((total, value) => total + value, 0) / confidences.length)
          .toFixed(2)
      )
      : null;

    const [firstRow, ...restRows] = currentTable.rows;
    const headerCandidate = firstRow.cells;
    const isHeader = headerCandidate.every(cell => /[A-Za-z]/.test(cell));

    tables.push({
      header: isHeader ? headerCandidate : null,
      rows: isHeader ? restRows.map(row => row.cells) : currentTable.rows.map(row => row.cells),
      columnCount: currentTable.columnPositions.length,
      boundingBox: tableBoundingBox,
      lineStart: currentTable.lineStart,
      lineEnd: currentTable.lineEnd,
      confidence: averageConfidence
    });

    currentTable = null;
  };

  lines.forEach((line, index) => {
    const row = buildTableRow(line);

    if (!row) {
      finalizeTable();
      return;
    }

    if (
      currentTable &&
      columnsAreSimilar(currentTable.columnPositions, row.columnPositions)
    ) {
      currentTable.rows.push(row);
      currentTable.lineEnd = index;
      return;
    }

    finalizeTable();

    currentTable = {
      columnPositions: row.columnPositions,
      rows: [row],
      lineStart: index,
      lineEnd: index
    };
  });

  finalizeTable();
  return tables.filter(table => table.rows.length >= 2 || (table.header && table.rows.length >= 1));
}

function detectFormFields(lines = []) {
  const fields = [];

  lines.forEach((line, index) => {
    const text = (line.text || '').trim();
    if (!text) {
      return;
    }

    const checkboxMatch = text.match(/^(?<label>.+?)\s*\[(?<value>[xX\s])\]/);
    if (checkboxMatch && checkboxMatch.groups) {
      fields.push({
        type: 'checkbox',
        label: checkboxMatch.groups.label.trim(),
        value: checkboxMatch.groups.value.toLowerCase() === 'x',
        lineIndex: index,
        confidence: typeof line.confidence === 'number'
          ? Number(line.confidence.toFixed(2))
          : null,
        boundingBox: normalizeBoundingBox(line.boundingBox)
      });
      return;
    }

    const blankMatch = text.match(/^(?<label>.+?)(?:[:\-])?\s*(?<blank>[_\.]{4,})$/);
    if (blankMatch && blankMatch.groups) {
      fields.push({
        type: 'blank',
        label: blankMatch.groups.label.trim(),
        lineIndex: index,
        confidence: typeof line.confidence === 'number'
          ? Number(line.confidence.toFixed(2))
          : null,
        boundingBox: normalizeBoundingBox(line.boundingBox)
      });
    }
  });

  return fields;
}

export function buildStructuredOcrData({ lines = [], words = [], text = '' } = {}) {
  const keyValuePairs = detectKeyValuePairs(lines);
  const tables = detectTables(lines);
  const formFields = detectFormFields(lines);

  return {
    keyValuePairs,
    tables,
    formFields,
    stats: {
      linesAnalyzed: lines.length,
      wordsAnalyzed: words.length,
      textLength: text.length
    }
  };
}

export default buildStructuredOcrData;
