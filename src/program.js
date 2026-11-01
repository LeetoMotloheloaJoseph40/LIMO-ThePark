// =====================================================================================
// program.js  -  the glue between the assembler and the pipeline core.
//
//   buildInstructionMemory(assembly)  returns a Uint32Array holding the program
//
// docs/interfaces.md section 3 says the core only needs `words`, copied into instruction memory:
//     const imem = new Uint32Array(1024); imem.set(result.words);
// That one line is fine when everything is correct, but it fails badly in two cases:
//   - the program had errors (words is empty, so the simulator would silently run an empty program)
//   - the program is longer than instruction memory (imem.set would throw a confusing RangeError)
// This function checks both and says what is wrong in plain language.
// =====================================================================================

import { INSTRUCTION_MEMORY_BYTES } from './isa.js';

export function buildInstructionMemory(assembly) {
  if (!assembly || assembly.ok !== true) {
    throw new Error('Fix the assembler errors before loading the program.');
  }
  const capacity = INSTRUCTION_MEMORY_BYTES / 4;       // 1024 words (spec section 2)
  if (assembly.words.length > capacity) {
    throw new Error(`The program has ${assembly.words.length} instructions; instruction memory holds ${capacity}.`);
  }
  const imem = new Uint32Array(capacity);              // every word we do not fill stays 0x00000000
  imem.set(assembly.words);
  return imem;
}
