/* Pure drawing and import rules. This module is also embedded in index.html. */
export function positiveInteger(value, label = '개수') {
  const text = String(value).trim();
  if (!/^\d+$/.test(text) || BigInt(text) < 1n) throw new Error(`${label}는 1 이상의 정수로 입력해주세요.`);
  return BigInt(text);
}

export function integer(value, label = '번호') {
  const text = String(value).trim();
  if (!/^-?\d+$/.test(text)) throw new Error(`${label}는 정수로 입력해주세요.`);
  return BigInt(text);
}

export function randomBelow(limit, source = globalThis.crypto) {
  if (limit < 1n) throw new RangeError('추첨 범위가 비어 있습니다.');
  if (limit === 1n) return 0n;
  if (!source?.getRandomValues) throw new Error('이 브라우저에서 안전한 난수를 사용할 수 없습니다. 최신 Chrome, Edge, Firefox 또는 Safari로 열어주세요.');
  const bits = (limit - 1n).toString(2).length;
  const bytes = new Uint8Array(Math.ceil(bits / 8));
  const mask = 255 >>> (bytes.length * 8 - bits);
  while (true) {
    for (let offset = 0; offset < bytes.length; offset += 65536) source.getRandomValues(bytes.subarray(offset, offset + 65536));
    bytes[0] &= mask;
    let candidate = 0n;
    for (const byte of bytes) candidate = (candidate << 8n) | BigInt(byte);
    if (candidate < limit) return candidate;
  }
}

export function makePool({ mode, start, count, entries }) {
  if (mode === 'numbers') {
    const first = integer(start, '시작 번호');
    const size = positiveInteger(count, '후보 수');
    return { size, labelAt: index => (first + index).toString(), idAt: index => `n:${index}` };
  }
  const names = entries.map(value => String(value).trim()).filter(Boolean);
  if (!names.length) throw new Error('이름이나 번호를 한 개 이상 입력해주세요.');
  return { size: BigInt(names.length), labelAt: index => names[Number(index)], idAt: index => `e:${index}` };
}

// Lazy Fisher-Yates: memory is proportional to draws, never to pool size.
export function makeSampler(size, repeat = false, random = randomBelow) {
  let remaining = size;
  const swaps = new Map();
  return {
    get remaining() { return repeat ? size : remaining; },
    next() {
      if (remaining < 1n) throw new Error('뽑을 수 있는 후보가 모두 선정됐어요.');
      if (repeat) return random(size);
      const position = random(remaining);
      const selected = swaps.get(position) ?? position;
      const last = remaining - 1n;
      if (position !== last) swaps.set(position, swaps.get(last) ?? last);
      else swaps.delete(position);
      swaps.delete(last);
      remaining--;
      return selected;
    }
  };
}

export function validateDraw(pool, people, rounds, repeat) {
  const perRound = positiveInteger(people, '한 번에 뽑을 인원');
  const roundCount = positiveInteger(rounds, '반복 횟수');
  const total = perRound * roundCount;
  if (!repeat && total > pool.size) throw new Error(`총 ${total.toLocaleString('ko-KR')}명을 뽑으려면 후보를 늘리거나 중복 허용을 켜주세요. 현재 후보는 ${pool.size.toLocaleString('ko-KR')}명입니다.`);
  return { perRound, roundCount, total };
}

export function detectDelimiter(text) {
  const counts = { ',': 0, '\t': 0, ';': 0 };
  let quote = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quote && text[i + 1] === '"') i++;
      else quote = !quote;
    } else if (!quote) {
      if (char === '\r' || char === '\n') break;
      if (char in counts) counts[char]++;
    }
  }
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
}

export function parseCSV(input, delimiter = detectDelimiter(input)) {
  const text = input.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], field = '', quoted = false, closed = false;
  const pushRow = () => { row.push(field); if (row.some(cell => cell.trim())) rows.push(row); row = []; field = ''; closed = false; };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else field += char;
    } else if (char === '"' && !field && !closed) quoted = true;
    else if (char === delimiter) { row.push(field); field = ''; closed = false; }
    else if (char === '\n' || char === '\r') { if (char === '\r' && text[i + 1] === '\n') i++; pushRow(); }
    else if (closed && !/\s/.test(char)) throw new Error('닫힌 따옴표 뒤에 문자가 있습니다. CSV 형식을 확인해주세요.');
    else if (!closed) field += char;
  }
  if (quoted) throw new Error('CSV의 따옴표가 닫히지 않았습니다. 파일 내용을 확인해주세요.');
  if (field || row.length) pushRow();
  return rows;
}

export function columnEntries(rows, column = 0, hasHeader = true) {
  return rows.slice(hasHeader ? 1 : 0).map(row => (row[column] ?? '').trim()).filter(Boolean);
}

export function csvCell(value) {
  let text = String(value);
  // Prevent spreadsheet formula execution in downloaded result files.
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function safeJSON(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
}

export function formatCount(value) {
  const n = BigInt(value);
  const s = n.toString();
  return s.length > 15 ? `${s.slice(0, 3)}… (${s.length}자리)` : n.toLocaleString('ko-KR');
}
