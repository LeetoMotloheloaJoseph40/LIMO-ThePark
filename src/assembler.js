// =====================================================================================
// assembler.js  -  turns LIMO assembly text into 32-bit machine code.
//
//   assemble(text)  returns  { ok, lines, errors, labels, words }
//
//   ok      true if there were no errors
//   lines   one record per instruction: address, hex, binary, and the fields (for colours)
//   errors  one record per mistake: line number, plain-language message, suggestion
//   labels  the label table, e.g. { loop: 12, done: 28 }
//   words   the machine code as a list of numbers (empty if there were errors)
//
// HOW TO READ THIS FILE: go from top to bottom. It is in the order you would do the job by hand.
//   PART 1  small helper tools (reading numbers and registers, cutting out bits)
//   PART 2  how each instruction FORMAT is laid out in 32 bits (your M1 format diagram)
//   PART 3  reading the operands of one instruction
//   PART 4  PASS 1: find the labels and give every instruction an address
//   PART 5  PASS 2: encode every instruction
//   PART 6  assemble(): runs pass 1, then pass 2
//
// A note on "throw" and "catch": when the assembler finds a mistake in a line, it "throws"
// a problem. Think of it as a jump to an error handler: tlola hae, error_handler.
// The handler ("catch") records the problem and carries on with the next line, so the
// student sees ALL their mistakes at once instead of only the first.
// =====================================================================================

import {
  INSTRUCTIONS, MNEMONIC_ALIASES, REGISTER_LOOKUP, RANGES, INSTRUCTION_MEMORY_BYTES,
} from './isa.js';


// =====================================================================================
// PART 1: HELPER TOOLS
// =====================================================================================

// Is this name in this table?  ("Does the table have a row called 'loop'?")
function hasKey(table, key) {
  return Object.prototype.hasOwnProperty.call(table, key);
}

// Make a "problem" that can be thrown (jumped to the error handler).
function problem(message, suggestion) {
  const error = new Error(message);
  error.suggestion = suggestion || '';
  error.isLimoProblem = true;      // lets the handler tell our problems from real bugs
  return error;
}

// Is every character of `text` one of the characters in `allowed`?  (and text is not empty)
function allCharsIn(text, allowed) {
  if (text.length === 0) return false;
  for (const ch of text) {
    if (!allowed.includes(ch)) return false;
  }
  return true;
}

// ---- Clean up one line of source text -------------------------------------------------
// 1. cut off the comment (everything from # or ; onwards)
// 2. turn curly apostrophes into the plain ' (M1 section 2.4)
// 3. turn tabs into spaces, remove spaces at both ends, make everything lower case
//    (LIMO is case-insensitive)
function cleanLine(raw) {
  let text = raw;

  let cutAt = text.length;
  const hashPos = text.indexOf('#');
  const semicolonPos = text.indexOf(';');
  if (hashPos !== -1 && hashPos < cutAt) cutAt = hashPos;
  if (semicolonPos !== -1 && semicolonPos < cutAt) cutAt = semicolonPos;
  text = text.slice(0, cutAt);

  text = text.split('\u2018').join("'");   // left curly '
  text = text.split('\u2019').join("'");   // right curly '
  text = text.split('\u02BC').join("'");   // modifier letter apostrophe
  text = text.split('\t').join(' ');

  return text.trim().toLowerCase();
}

// ---- Numbers ----------------------------------------------------------------------------
// Is this text a number?  Accepts 10, -5, +7, 0x1F, -0x10.
function isNumber(text) {
  let body = text;
  if (body.startsWith('-') || body.startsWith('+')) body = body.slice(1);
  let allowedDigits = '0123456789';
  if (body.startsWith('0x')) {
    body = body.slice(2);
    allowedDigits = '0123456789abcdef';
  }
  return allCharsIn(body, allowedDigits);
}

// Turn number text into a real number.
function toNumber(text) {
  let body = text;
  let negative = false;
  if (body.startsWith('-')) { negative = true; body = body.slice(1); }
  else if (body.startsWith('+')) { body = body.slice(1); }

  let value;
  if (body.startsWith('0x')) value = parseInt(body.slice(2), 16);
  else value = parseInt(body, 10);

  if (negative) return -value;
  return value;
}

// ---- "Did you mean ...?" helper (an optional extra, just a spell-checker) ----------------
// editDistance = how many single-letter changes turn word a into word b.
// "kopanyaa" -> "kopanya" is distance 1 (delete one letter).
function editDistance(a, b) {
  const table = [];
  for (let i = 0; i <= a.length; i++) {
    table.push([]);
    for (let j = 0; j <= b.length; j++) table[i].push(0);
  }
  for (let i = 0; i <= a.length; i++) table[i][0] = i;
  for (let j = 0; j <= b.length; j++) table[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      let cost = 1;
      if (a[i - 1] === b[j - 1]) cost = 0;
      let best = table[i - 1][j] + 1;                          // delete
      if (table[i][j - 1] + 1 < best) best = table[i][j - 1] + 1;           // insert
      if (table[i - 1][j - 1] + cost < best) best = table[i - 1][j - 1] + cost; // change
      table[i][j] = best;
    }
  }
  return table[a.length][b.length];
}

// The candidate most like `word`, or null if none is within maxDistance.
function closestWord(word, candidates, maxDistance) {
  let bestWord = null;
  let bestDistance = maxDistance + 1;
  for (const candidate of candidates) {
    const distance = editDistance(word, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestWord = candidate;
    }
  }
  return bestWord;
}

// ---- Registers ---------------------------------------------------------------------------
// "t0" -> 10,  "noto" -> 0,  "p31" -> 31.   Like looking a name up in spec section 2.2.
function getRegister(name) {
  if (hasKey(REGISTER_LOOKUP, name)) {
    return REGISTER_LOOKUP[name];
  }
  // looks like p-something but not in the table, e.g. p32
  if (name.length >= 2 && name[0] === 'p' && allCharsIn(name.slice(1), '0123456789')) {
    throw problem(`"${name}" is not a LIMO register.`, 'Registers run from p0 to p31.');
  }
  const guess = closestWord(name, Object.keys(REGISTER_LOOKUP), 1);
  let hint = 'Registers are p0-p31, or names like noto, hae, lesupa, n0, b0, t0.';
  if (guess !== null) hint = `Did you mean "${guess}"? ` + hint;
  throw problem(`"${name}" is not a LIMO register.`, hint);
}

// ---- Immediates --------------------------------------------------------------------------
// Read a number and check it fits the allowed range (M1 section 2.3).
function getImmediate(text, range, what) {
  if (!isNumber(text)) {
    throw problem(`"${text}" is not a number.`, `Write the ${what} in decimal (10) or hex (0x0A).`);
  }
  const value = toNumber(text);
  if (value < range.min || value > range.max) {
    throw problem(
      `The ${what} ${text} does not fit: allowed range is ${range.min} to ${range.max}.`,
      'Build bigger values with kopanyah + chetse + kopanya.');
  }
  return value;
}

// ---- Memory operands:  4(p1)  means "offset 4, base register p1" -------------------------
function getMemoryOperand(text, range) {
  const open = text.indexOf('(');
  const close = text.lastIndexOf(')');
  if (open === -1 || close !== text.length - 1 || close < open) {
    throw problem(`"${text}" is not a memory operand.`, 'Write it as offset(register), for example 4(p1).');
  }
  let offsetText = text.slice(0, open).trim();
  if (offsetText === '') offsetText = '0';                   // "(p1)" means offset 0
  const registerText = text.slice(open + 1, close).trim();
  return {
    offset: getImmediate(offsetText, range, 'offset'),
    register: getRegister(registerText),
  };
}

// ---- Cutting out bits ----------------------------------------------------------------------
// getBits(value, 12, 5) returns bits 12 down to 5 of value, like writing imm[12:5].
//   Step 1:  value >> low           shift right so bit `low` becomes bit 0     (like a right shift)
//   Step 2:  & mask                 keep only the lowest (high-low+1) bits     (like `le` with a mask)
// For a negative number the bits are its two's complement, exactly as in hardware.
function getBits(value, high, low) {
  const width = high - low + 1;
  const mask = (1 << width) - 1;          // width ones, e.g. width 5 -> 0b11111
  return (value >> low) & mask;
}


// =====================================================================================
// PART 2: THE FORMATS - how each instruction is laid out in 32 bits (M1 section 2.3)
// =====================================================================================

// A "field" is one coloured box in the format diagram: its name, its width in bits, its value.
function makeField(name, width, value) {
  return { name: name, bits: width, value: value };
}

// Returns the list of fields, LEFT TO RIGHT (bit 31 first), exactly as in your M1 diagram.
// `v` holds the values: v.rd, v.rs1, v.rs2 and v.imm (whichever the instruction uses).
function buildFields(ins, v) {
  if (ins.fmt === 'R') {
    //  funct7 | rs2 | rs1 | funct3 | rd | opcode
    return [
      makeField('funct7', 7, ins.funct7),
      makeField('rs2', 5, v.rs2),
      makeField('rs1', 5, v.rs1),
      makeField('funct3', 3, ins.funct3),
      makeField('rd', 5, v.rd),
      makeField('opcode', 7, ins.opcode),
    ];
  }

  if (ins.fmt === 'I' && ins.shift) {
    //  funct7 | shamt | rs1 | funct3 | rd | opcode          (chetse)
    return [
      makeField('funct7', 7, ins.funct7),
      makeField('shamt', 5, v.imm),
      makeField('rs1', 5, v.rs1),
      makeField('funct3', 3, ins.funct3),
      makeField('rd', 5, v.rd),
      makeField('opcode', 7, ins.opcode),
    ];
  }

  if (ins.fmt === 'I') {
    //  imm[11:0] | rs1 | funct3 | rd | opcode
    return [
      makeField('imm[11:0]', 12, getBits(v.imm, 11, 0)),
      makeField('rs1', 5, v.rs1),
      makeField('funct3', 3, ins.funct3),
      makeField('rd', 5, v.rd),
      makeField('opcode', 7, ins.opcode),
    ];
  }

  if (ins.fmt === 'S') {
    //  imm[11:5] | rs2 | rs1 | funct3 | imm[4:0] | opcode    (the immediate is split in two)
    return [
      makeField('imm[11:5]', 7, getBits(v.imm, 11, 5)),
      makeField('rs2', 5, v.rs2),
      makeField('rs1', 5, v.rs1),
      makeField('funct3', 3, ins.funct3),
      makeField('imm[4:0]', 5, getBits(v.imm, 4, 0)),
      makeField('opcode', 7, ins.opcode),
    ];
  }

  if (ins.fmt === 'B') {
    //  imm[12] | imm[10:5] | rs2 | rs1 | funct3 | imm[4:1] | imm[11] | opcode
    //  (bit 0 of a branch offset is always 0, so it is not stored)
    return [
      makeField('imm[12]', 1, getBits(v.imm, 12, 12)),
      makeField('imm[10:5]', 6, getBits(v.imm, 10, 5)),
      makeField('rs2', 5, v.rs2),
      makeField('rs1', 5, v.rs1),
      makeField('funct3', 3, ins.funct3),
      makeField('imm[4:1]', 4, getBits(v.imm, 4, 1)),
      makeField('imm[11]', 1, getBits(v.imm, 11, 11)),
      makeField('opcode', 7, ins.opcode),
    ];
  }

  if (ins.fmt === 'J') {
    //  imm[20] | imm[10:1] | imm[11] | imm[19:12] | rd | opcode
    return [
      makeField('imm[20]', 1, getBits(v.imm, 20, 20)),
      makeField('imm[10:1]', 10, getBits(v.imm, 10, 1)),
      makeField('imm[11]', 1, getBits(v.imm, 11, 11)),
      makeField('imm[19:12]', 8, getBits(v.imm, 19, 12)),
      makeField('rd', 5, v.rd),
      makeField('opcode', 7, ins.opcode),
    ];
  }

  throw new Error('Unknown format ' + ins.fmt);   // cannot happen unless isa.js is wrong
}

// Glue the fields together into one 32-bit number.
// For each field: "make room on the right, then put the field there" (shift left, then OR).
// We multiply by 2^bits instead of using << because JavaScript's << would turn a number
// with bit 31 set into a negative number.
function fieldsToWord(fields) {
  let word = 0;
  for (const field of fields) {
    word = word * Math.pow(2, field.bits) + field.value;
  }
  return word;
}


// =====================================================================================
// PART 3: READING THE OPERANDS OF ONE INSTRUCTION
// =====================================================================================

// Work out the offset for a branch or jump.
//   - If the operand is a number (lekana p1, p2, 8) it already IS the byte offset.
//   - If it is a label name:   offset = (address of label) - (address of THIS instruction)
//     e.g. nyane at address 12, done at address 28  ->  offset = 28 - 12 = 16
function getTarget(text, thisAddress, labels, range, kind) {
  let offset;
  if (isNumber(text)) {
    offset = toNumber(text);
  } else {
    if (!hasKey(labels, text)) {
      const guess = closestWord(text, Object.keys(labels), 2);
      let hint = 'Define it by writing name: before an instruction.';
      if (guess !== null) hint = `Did you mean "${guess}"?`;
      throw problem(`The label "${text}" is not defined anywhere in the program.`, hint);
    }
    offset = labels[text] - thisAddress;
  }
  if (offset % 2 !== 0) {
    throw problem(`The ${kind} offset ${offset} is odd; offsets must be even.`,
      'Use a label, or an even number of bytes.');
  }
  if (offset < range.min || offset > range.max) {
    throw problem(`The ${kind} target is ${offset} bytes away, outside the reach ${range.min} to ${range.max}.`,
      'Move the label closer, or jump via a register with khutla.');
  }
  return offset;
}

// Read the operands and return their values: { rd, rs1, rs2, imm } (only those that apply).
// `ops` is the list of operand texts, e.g. ['p3', 'p1', 'p2'].
function readOperands(mnemonic, ins, ops, thisAddress, labels) {
  // 1. How many operands should there be?
  let expected = 3;                                   // R-type, kopanyah, chetse, branches
  if (ins.syntax === 'LOAD' || ins.syntax === 'STORE' || ins.syntax === 'JUMP') expected = 2;
  if (ops.length !== expected) {
    throw problem(`"${mnemonic}" needs ${expected} operands but you wrote ${ops.length}.`,
      `Format: ${ins.usage}`);
  }

  // 2. Read them according to the instruction's syntax
  if (ins.syntax === 'RRR') {                         // kopanya rd, rs1, rs2
    return { rd: getRegister(ops[0]), rs1: getRegister(ops[1]), rs2: getRegister(ops[2]) };
  }
  if (ins.syntax === 'RRI') {                         // kopanyah rd, rs1, imm
    return { rd: getRegister(ops[0]), rs1: getRegister(ops[1]), imm: getImmediate(ops[2], RANGES.I, 'immediate') };
  }
  if (ins.syntax === 'RRS') {                         // chetse rd, rs1, shamt
    return { rd: getRegister(ops[0]), rs1: getRegister(ops[1]), imm: getImmediate(ops[2], RANGES.SHAMT, 'shift amount') };
  }
  if (ins.syntax === 'LOAD') {                        // tshela rd, imm(rs1)   and   khutla rd, imm(rs1)
    const memory = getMemoryOperand(ops[1], RANGES.I);
    return { rd: getRegister(ops[0]), rs1: memory.register, imm: memory.offset };
  }
  if (ins.syntax === 'STORE') {                       // boloka rs2, imm(rs1)
    const memory = getMemoryOperand(ops[1], RANGES.S);
    return { rs2: getRegister(ops[0]), rs1: memory.register, imm: memory.offset };
  }
  if (ins.syntax === 'BRANCH') {                      // lekana rs1, rs2, label
    return {
      rs1: getRegister(ops[0]),
      rs2: getRegister(ops[1]),
      imm: getTarget(ops[2], thisAddress, labels, RANGES.B, 'branch'),
    };
  }
  if (ins.syntax === 'JUMP') {                        // tlola rd, label
    return {
      rd: getRegister(ops[0]),
      imm: getTarget(ops[1], thisAddress, labels, RANGES.J, 'jump'),
    };
  }
  throw new Error('Unknown syntax ' + ins.syntax);    // cannot happen unless isa.js is wrong
}


// =====================================================================================
// PART 4: PASS 1 - find the labels, give each instruction an address
//
// Why a separate pass? Because  nyane t0, t2, done  jumps FORWARD to a label the assembler
// has not met yet. So first we walk the whole program and write down where every label is.
// =====================================================================================

function isValidLabelName(name) {
  const letters = 'abcdefghijklmnopqrstuvwxyz_';
  if (name.length === 0 || !letters.includes(name[0])) return false;      // must start with a letter or _
  const allowed = letters + '0123456789' + "'";                          // then letters, digits, _ or '
  return allCharsIn(name, allowed);
}

// Returns { items, labels }.  items = the instructions found, each with its address.
// Mistakes are added to the `errors` list.
function passOne(sourceText, errors) {
  const labels = {};          // the label table:  name -> address
  const items = [];           // the instructions, in order
  let address = 0;            // like a program counter: 0, 4, 8, 12 ...

  const rawLines = String(sourceText).split('\n');

  for (let index = 0; index < rawLines.length; index++) {
    const lineNumber = index + 1;                     // humans count lines from 1
    const rawLine = rawLines[index].split('\r').join('');
    let text = cleanLine(rawLine);
    if (text === '') continue;                        // blank or comment-only line

    try {
      // ---- Labels at the start of the line:   loop:   or   a: b: kopanya ... ----
      while (true) {
        const colonPos = text.indexOf(':');
        if (colonPos === -1) break;                   // no colon: no label (any more)
        const name = text.slice(0, colonPos);
        if (name.includes(' ') || name.includes(',') || name.includes('(') || name.includes(')')) {
          break;                                      // that colon is not a label marker
        }
        if (!isValidLabelName(name)) {
          throw problem(`"${name}" is not a valid label name.`,
            "Labels start with a letter or _ and contain letters, digits, _ or '.");
        }
        if (hasKey(labels, name)) {
          throw problem(`The label "${name}" is defined twice.`, 'Give each label a different name.');
        }
        if (hasKey(INSTRUCTIONS, name) || hasKey(REGISTER_LOOKUP, name)) {
          throw problem(`"${name}" cannot be a label because it is already an instruction or register name.`,
            'Choose another name.');
        }
        labels[name] = address;                       // write it in the label table
        text = text.slice(colonPos + 1).trim();       // continue with what comes after the label
      }
      if (text === '') continue;                      // the line was only a label

      // ---- The instruction: the first word is the mnemonic, the rest are operands ----
      const spacePos = text.indexOf(' ');
      let mnemonic = text;
      let rest = '';
      if (spacePos !== -1) {
        mnemonic = text.slice(0, spacePos);
        rest = text.slice(spacePos).trim();
      }
      let operands = [];
      if (rest !== '') {
        const pieces = rest.split(',');
        for (const piece of pieces) operands.push(piece.trim());
      }
      for (const operand of operands) {
        if (operand === '') {
          throw problem('There is an empty operand (check for a missing or extra comma).',
            'Operands are separated by single commas.');
        }
      }

      items.push({ lineNumber: lineNumber, source: rawLine, mnemonic: mnemonic, operands: operands, address: address });
      address = address + 4;                          // every instruction is 4 bytes
    } catch (e) {
      if (!e.isLimoProblem) throw e;                  // a real bug in this program: do not hide it
      errors.push({ line: lineNumber, message: `Line ${lineNumber}: ${e.message}`, suggestion: e.suggestion });
    }
  }

  if (address > INSTRUCTION_MEMORY_BYTES) {
    errors.push({
      line: 0,
      message: `Program is ${address} bytes; instruction memory holds ${INSTRUCTION_MEMORY_BYTES}.`,
      suggestion: 'Shorten the program.',
    });
  }

  return { items: items, labels: labels };
}


// =====================================================================================
// PART 5: PASS 2 - encode every instruction
// =====================================================================================

function passTwo(items, labels, errors) {
  const lines = [];
  const words = [];

  for (const item of items) {
    try {
      // 1. Look up the mnemonic in the instruction table (spec section 2.4)
      let mnemonic = item.mnemonic;
      if (!hasKey(INSTRUCTIONS, mnemonic) && hasKey(MNEMONIC_ALIASES, mnemonic)) {
        mnemonic = MNEMONIC_ALIASES[mnemonic];        // apostrophe-free alias
      }
      if (!hasKey(INSTRUCTIONS, mnemonic)) {
        const candidates = Object.keys(INSTRUCTIONS).concat(Object.keys(MNEMONIC_ALIASES));
        const guess = closestWord(mnemonic, candidates, 2);
        let hint = 'LIMO instructions: ' + Object.keys(INSTRUCTIONS).join(', ') + '.';
        if (guess !== null) hint = `Did you mean "${guess}"?`;
        throw problem(`"${item.mnemonic}" is not a LIMO instruction.`, hint);
      }
      const ins = INSTRUCTIONS[mnemonic];

      // 2. Read the operands (registers, immediate, label offset)
      const values = readOperands(mnemonic, ins, item.operands, item.address, labels);

      // 3. Lay the values out in the format's fields, then glue them into one 32-bit word
      const fields = buildFields(ins, values);
      const word = fieldsToWord(fields);

      // 4. Record the result (binary and hex for display, fields for colour-coding)
      const fieldRecords = [];
      for (const field of fields) {
        fieldRecords.push({
          name: field.name,
          bits: field.bits,
          value: field.value,
          binary: field.value.toString(2).padStart(field.bits, '0'),
        });
      }
      words.push(word);
      lines.push({
        line: item.lineNumber,
        source: item.source,
        address: item.address,
        mnemonic: mnemonic,
        format: ins.fmt,
        rv32i: ins.rv32i,
        word: word,
        hex: '0x' + word.toString(16).toUpperCase().padStart(8, '0'),
        binary: word.toString(2).padStart(32, '0'),
        fields: fieldRecords,
      });
    } catch (e) {
      if (!e.isLimoProblem) throw e;
      errors.push({ line: item.lineNumber, message: `Line ${item.lineNumber}: ${e.message}`, suggestion: e.suggestion });
    }
  }

  return { lines: lines, words: words };
}


// =====================================================================================
// PART 6: assemble() - the one function the rest of the project calls
// =====================================================================================

export function assemble(sourceText) {
  const errors = [];

  const first = passOne(sourceText, errors);                       // PASS 1
  const second = passTwo(first.items, first.labels, errors);       // PASS 2

  errors.sort((a, b) => a.line - b.line);                          // show mistakes in line order

  const ok = errors.length === 0;
  let words = [];
  if (ok) words = second.words;                                    // no machine code if any error

  return { ok: ok, lines: second.lines, errors: errors, labels: first.labels, words: words };
}
