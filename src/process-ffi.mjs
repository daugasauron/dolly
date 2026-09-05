/*
 * Process-local wasm64 libffi dispatcher.
 *
 * This module can see only one process's private memory and function table.
 * It supplies WebAssembly's missing dynamically typed call operation without
 * adding a browser capability or another import to a process executable.
 */

const FFI_OK = 0;
const FFI_BAD_TYPEDEF = 1;
const FFI_WASM64_EMSCRIPTEN = 2;
const VARARGS_FLAG = 1;
const MAX_ARGS = 1000;

const FFI_TYPE_VOID = 0;
const FFI_TYPE_INT = 1;
const FFI_TYPE_FLOAT = 2;
const FFI_TYPE_DOUBLE = 3;
const FFI_TYPE_LONGDOUBLE = 4;
const FFI_TYPE_UINT8 = 5;
const FFI_TYPE_SINT8 = 6;
const FFI_TYPE_UINT16 = 7;
const FFI_TYPE_SINT16 = 8;
const FFI_TYPE_UINT32 = 9;
const FFI_TYPE_SINT32 = 10;
const FFI_TYPE_UINT64 = 11;
const FFI_TYPE_SINT64 = 12;
const FFI_TYPE_STRUCT = 13;
const FFI_TYPE_POINTER = 14;
const FFI_TYPE_COMPLEX = 15;

const FFI_CALL = 120;
const FFI_CLOSURE_ALLOC = 121;
const FFI_CLOSURE_FREE = 122;
const FFI_CLOSURE_PREP = 123;
const localOperations = new Set([
  FFI_CALL,
  FFI_CLOSURE_ALLOC,
  FFI_CLOSURE_FREE,
  FFI_CLOSURE_PREP,
]);

function uleb(value) {
  const bytes = [];
  let remaining = BigInt(value);
  do {
    let byte = Number(remaining & 0x7fn);
    remaining >>= 7n;
    if (remaining !== 0n) byte |= 0x80;
    bytes.push(byte);
  } while (remaining !== 0n);
  return bytes;
}

function section(id, body) {
  return [id, ...uleb(body.length), ...body];
}

function wasmName(value) {
  const bytes = new TextEncoder().encode(value);
  return [...uleb(bytes.length), ...bytes];
}

function wasmType(name) {
  switch (name) {
    case "i32": return 0x7f;
    case "i64": return 0x7e;
    case "f32": return 0x7d;
    case "f64": return 0x7c;
    default: throw new TypeError(`unsupported FFI Wasm type ${name}`);
  }
}

/* Wrap a JavaScript closure in a real, exactly typed WebAssembly function so
 * it can occupy a funcref table slot. The generated module has no memory,
 * globals, or ambient imports: just the one supplied closure. */
function typedWasmFunction(function_, parameters, result) {
  const functionType = [
    0x60,
    ...uleb(parameters.length),
    ...parameters.map(wasmType),
    ...(result === null ? [0] : [1, wasmType(result)]),
  ];
  const typeSection = section(1, [1, ...functionType]);
  const importSection = section(2, [
    1,
    ...wasmName("dolly"),
    ...wasmName("closure"),
    0,
    0,
  ]);
  const exportSection = section(7, [
    1,
    ...wasmName("closure"),
    0,
    0,
  ]);
  const bytes = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d,
    0x01, 0x00, 0x00, 0x00,
    ...typeSection,
    ...importSection,
    ...exportSection,
  ]);
  const module = new WebAssembly.Module(bytes);
  return new WebAssembly.Instance(module, {
    dolly: { closure: function_ },
  }).exports.closure;
}

export function createProcessFfi({
  memory,
  getInstance,
  getTable,
  growTable,
  setTable,
}) {
  if (!(memory instanceof WebAssembly.Memory) ||
      typeof getInstance !== "function" || typeof getTable !== "function" ||
      typeof growTable !== "function" || typeof setTable !== "function") {
    throw new TypeError("invalid process FFI configuration");
  }

  const closures = new Map();
  const freeTableIndices = [];

  function asBigInt(value, description) {
    if (typeof value === "bigint") return BigInt.asUintN(64, value);
    if (Number.isSafeInteger(value) && value >= 0) return BigInt(value);
    throw new RangeError(`invalid ${description}`);
  }

  function address(value, size = 0, description = "FFI address") {
    const integer = asBigInt(value, description);
    if (integer > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new RangeError(`${description} exceeds JavaScript's exact address range`);
    }
    const result = Number(integer);
    const length = memory.buffer.byteLength;
    if (!Number.isSafeInteger(size) || size < 0 || result > length - size ||
        (size !== 0 && result === 0)) {
      throw new RangeError(`${description} is outside process memory`);
    }
    return result;
  }

  function view(value, size, description) {
    return new DataView(memory.buffer, address(value, size, description), size);
  }

  function bytes(value, size, description) {
    return new Uint8Array(memory.buffer, address(value, size, description), size);
  }

  function readPointer(value, offset = 0) {
    return view(asBigInt(value, "pointer") + BigInt(offset), 8, "pointer field")
      .getBigUint64(0, true);
  }

  function writePointer(value, offset, pointer) {
    view(asBigInt(value, "pointer") + BigInt(offset), 8, "pointer field")
      .setBigUint64(0, asBigInt(pointer, "pointer value"), true);
  }

  function typeInfo(typePointer) {
    const pointer = asBigInt(typePointer, "ffi_type pointer");
    const data = view(pointer, 24, "ffi_type");
    const size = data.getBigUint64(0, true);
    if (size > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new RangeError("FFI type is too large");
    }
    return {
      pointer,
      size: Number(size),
      alignment: data.getUint16(8, true),
      id: data.getUint16(10, true),
      elements: data.getBigUint64(16, true),
    };
  }

  function unboxType(typePointer) {
    let type = typeInfo(typePointer);
    for (let depth = 0; type.id === FFI_TYPE_STRUCT; ++depth) {
      if (depth === 64) throw new TypeError("recursive singleton FFI structure");
      if (type.size > 16) break;
      if (type.elements === 0n) return { ...type, id: FFI_TYPE_VOID };
      const first = readPointer(type.elements, 0);
      if (first === 0n) return { ...type, id: FFI_TYPE_VOID };
      if (readPointer(type.elements, 8) !== 0n) break;
      type = typeInfo(first);
    }
    return type;
  }

  function cifInfo(cifPointer) {
    const pointer = asBigInt(cifPointer, "ffi_cif pointer");
    const data = view(pointer, 36, "ffi_cif");
    const abi = data.getUint32(0, true);
    const nargs = data.getUint32(4, true);
    const argTypes = data.getBigUint64(8, true);
    const returnType = data.getBigUint64(16, true);
    const flags = data.getUint32(28, true);
    const fixed = data.getUint32(32, true);
    if (abi !== FFI_WASM64_EMSCRIPTEN || nargs > MAX_ARGS || fixed > nargs ||
        returnType === 0n || (nargs !== 0 && argTypes === 0n)) {
      throw new TypeError("invalid wasm64 ffi_cif");
    }
    const types = [];
    for (let index = 0; index < nargs; ++index) {
      const typePointer = readPointer(argTypes, index * 8);
      if (typePointer === 0n) throw new TypeError("null FFI argument type");
      types.push(unboxType(typePointer));
    }
    return {
      pointer,
      nargs,
      fixed,
      flags,
      types,
      returnType: unboxType(returnType),
    };
  }

  function stack() {
    const global = getInstance()?.exports?.__stack_pointer;
    if (!(global instanceof WebAssembly.Global) ||
        typeof global.value !== "bigint") {
      throw new TypeError("process has no memory64 stack pointer");
    }
    const original = BigInt.asUintN(64, global.value);
    let current = original;
    return {
      allocate(size, alignment) {
        if (!Number.isSafeInteger(size) || size < 0 ||
            !Number.isSafeInteger(alignment) || alignment <= 0 ||
            (alignment & (alignment - 1)) !== 0) {
          throw new RangeError("invalid FFI stack allocation");
        }
        const count = BigInt(size);
        const boundary = BigInt(alignment);
        if (count > current) throw new RangeError("FFI stack exhausted");
        current = (current - count) & -boundary;
        address(current, size, "FFI stack allocation");
        return current;
      },
      publish() {
        current &= -16n;
        address(current, 0, "FFI stack pointer");
        global.value = current;
      },
      restore() {
        global.value = original;
      },
    };
  }

  function copy(target, source, size) {
    const destination = bytes(target, size, "FFI structure destination");
    const input = new Uint8Array(bytes(source, size, "FFI structure source"));
    destination.set(input);
  }

  function readArgument(pointer, type) {
    const location = asBigInt(pointer, "FFI argument pointer");
    switch (type.id) {
      case FFI_TYPE_INT:
      case FFI_TYPE_UINT32:
      case FFI_TYPE_SINT32:
        return [view(location, 4, "FFI i32 argument").getUint32(0, true)];
      case FFI_TYPE_FLOAT:
        return [view(location, 4, "FFI f32 argument").getFloat32(0, true)];
      case FFI_TYPE_DOUBLE:
        return [view(location, 8, "FFI f64 argument").getFloat64(0, true)];
      case FFI_TYPE_UINT8:
        return [view(location, 1, "FFI u8 argument").getUint8(0)];
      case FFI_TYPE_SINT8:
        return [view(location, 1, "FFI i8 argument").getInt8(0)];
      case FFI_TYPE_UINT16:
        return [view(location, 2, "FFI u16 argument").getUint16(0, true)];
      case FFI_TYPE_SINT16:
        return [view(location, 2, "FFI i16 argument").getInt16(0, true)];
      case FFI_TYPE_UINT64:
      case FFI_TYPE_SINT64:
      case FFI_TYPE_POINTER:
        return [view(location, 8, "FFI i64 argument").getBigUint64(0, true)];
      case FFI_TYPE_LONGDOUBLE: {
        const data = view(location, 16, "FFI long-double argument");
        return [data.getBigUint64(0, true), data.getBigUint64(8, true)];
      }
      case FFI_TYPE_COMPLEX:
        throw new TypeError("complex FFI arguments are unsupported");
      default:
        throw new TypeError(`unsupported FFI argument type ${type.id}`);
    }
  }

  function storeResult(pointer, type, result) {
    const location = asBigInt(pointer, "FFI result pointer");
    switch (type.id) {
      case FFI_TYPE_VOID:
        return;
      case FFI_TYPE_INT:
      case FFI_TYPE_UINT32:
      case FFI_TYPE_SINT32:
        view(location, 4, "FFI i32 result").setUint32(0, result, true);
        return;
      case FFI_TYPE_FLOAT:
        view(location, 4, "FFI f32 result").setFloat32(0, result, true);
        return;
      case FFI_TYPE_DOUBLE:
        view(location, 8, "FFI f64 result").setFloat64(0, result, true);
        return;
      case FFI_TYPE_UINT8:
      case FFI_TYPE_SINT8:
        view(location, 1, "FFI i8 result").setUint8(0, result);
        return;
      case FFI_TYPE_UINT16:
      case FFI_TYPE_SINT16:
        view(location, 2, "FFI i16 result").setUint16(0, result, true);
        return;
      case FFI_TYPE_UINT64:
      case FFI_TYPE_SINT64:
      case FFI_TYPE_POINTER:
        view(location, 8, "FFI i64 result").setBigUint64(
          0, BigInt.asUintN(64, result), true,
        );
        return;
      case FFI_TYPE_COMPLEX:
        throw new TypeError("complex FFI results are unsupported");
      default:
        throw new TypeError(`unsupported FFI result type ${type.id}`);
    }
  }

  function tableFunction(indexValue, description) {
    const index = asBigInt(indexValue, `${description} table index`);
    if (index >= BigInt(getTable().length)) {
      throw new RangeError(`${description} table index is out of range`);
    }
    let function_;
    try {
      function_ = getTable().get(Number(index));
    } catch (numberError) {
      try {
        function_ = getTable().get(index);
      } catch {
        throw numberError;
      }
    }
    if (typeof function_ !== "function") {
      throw new TypeError(`${description} table slot is empty`);
    }
    return function_;
  }

  function performCall(packet) {
    const cif = cifInfo(packet.getBigUint64(0, true));
    const functionIndex = packet.getBigUint64(8, true);
    const returnValue = packet.getBigUint64(16, true);
    const argumentValues = packet.getBigUint64(24, true);
    const frame = stack();
    const arguments_ = [];
    const returnByArgument =
      cif.returnType.id === FFI_TYPE_STRUCT ||
      cif.returnType.id === FFI_TYPE_LONGDOUBLE;
    if (returnByArgument) arguments_.push(returnValue);

    for (let index = 0; index < cif.fixed; ++index) {
      const argumentPointer = readPointer(argumentValues, index * 8);
      const type = cif.types[index];
      if (type.id === FFI_TYPE_STRUCT) {
        const temporary = frame.allocate(type.size, type.alignment);
        copy(temporary, argumentPointer, type.size);
        arguments_.push(temporary);
      } else {
        arguments_.push(...readArgument(argumentPointer, type));
      }
    }

    if ((cif.flags & VARARGS_FLAG) !== 0) {
      const structures = [];
      for (let index = cif.nargs - 1; index >= cif.fixed; --index) {
        const argumentPointer = readPointer(argumentValues, index * 8);
        const type = cif.types[index];
        switch (type.id) {
          case FFI_TYPE_UINT8:
          case FFI_TYPE_SINT8: {
            const slot = frame.allocate(1, 1);
            bytes(slot, 1, "FFI variadic byte")[0] =
              bytes(argumentPointer, 1, "FFI variadic byte source")[0];
            break;
          }
          case FFI_TYPE_UINT16:
          case FFI_TYPE_SINT16: {
            const slot = frame.allocate(2, 2);
            copy(slot, argumentPointer, 2);
            break;
          }
          case FFI_TYPE_INT:
          case FFI_TYPE_UINT32:
          case FFI_TYPE_SINT32:
          case FFI_TYPE_FLOAT: {
            const slot = frame.allocate(4, 4);
            copy(slot, argumentPointer, 4);
            break;
          }
          case FFI_TYPE_DOUBLE:
          case FFI_TYPE_UINT64:
          case FFI_TYPE_SINT64:
          case FFI_TYPE_POINTER: {
            const slot = frame.allocate(8, 8);
            copy(slot, argumentPointer, 8);
            break;
          }
          case FFI_TYPE_LONGDOUBLE: {
            const slot = frame.allocate(16, 8);
            copy(slot, argumentPointer, 16);
            break;
          }
          case FFI_TYPE_STRUCT: {
            const pointerSlot = frame.allocate(8, 8);
            structures.push({ pointerSlot, argumentPointer, type });
            break;
          }
          default:
            throw new TypeError(`unsupported variadic FFI type ${type.id}`);
        }
      }
      const variadicArguments = frame.allocate(0, 1);
      arguments_.push(variadicArguments);
      for (const structure of structures) {
        const temporary = frame.allocate(
          structure.type.size, structure.type.alignment,
        );
        copy(temporary, structure.argumentPointer, structure.type.size);
        writePointer(structure.pointerSlot, 0, temporary);
      }
    } else if (cif.fixed !== cif.nargs) {
      throw new TypeError("inconsistent variadic FFI metadata");
    }

    frame.publish();
    let result;
    try {
      result = tableFunction(functionIndex, "FFI target")(...arguments_);
    } finally {
      frame.restore();
    }
    if (!returnByArgument) storeResult(returnValue, cif.returnType, result);
  }

  function resultWasmType(type) {
    switch (type.id) {
      case FFI_TYPE_VOID: return null;
      case FFI_TYPE_INT:
      case FFI_TYPE_UINT8:
      case FFI_TYPE_SINT8:
      case FFI_TYPE_UINT16:
      case FFI_TYPE_SINT16:
      case FFI_TYPE_UINT32:
      case FFI_TYPE_SINT32:
        return "i32";
      case FFI_TYPE_FLOAT: return "f32";
      case FFI_TYPE_DOUBLE: return "f64";
      case FFI_TYPE_UINT64:
      case FFI_TYPE_SINT64:
      case FFI_TYPE_POINTER:
        return "i64";
      case FFI_TYPE_STRUCT:
      case FFI_TYPE_LONGDOUBLE:
        return null;
      default:
        throw new TypeError(`unsupported FFI closure result type ${type.id}`);
    }
  }

  function argumentWasmTypes(type) {
    switch (type.id) {
      case FFI_TYPE_INT:
      case FFI_TYPE_UINT8:
      case FFI_TYPE_SINT8:
      case FFI_TYPE_UINT16:
      case FFI_TYPE_SINT16:
      case FFI_TYPE_UINT32:
      case FFI_TYPE_SINT32:
        return ["i32"];
      case FFI_TYPE_FLOAT: return ["f32"];
      case FFI_TYPE_DOUBLE: return ["f64"];
      case FFI_TYPE_LONGDOUBLE: return ["i64", "i64"];
      case FFI_TYPE_UINT64:
      case FFI_TYPE_SINT64:
      case FFI_TYPE_STRUCT:
      case FFI_TYPE_POINTER:
        return ["i64"];
      default:
        throw new TypeError(`unsupported FFI closure argument type ${type.id}`);
    }
  }

  function writeCallbackArgument(pointer, type, values, index) {
    switch (type.id) {
      case FFI_TYPE_UINT8:
      case FFI_TYPE_SINT8:
        view(pointer, 1, "FFI callback byte").setUint8(0, values[index]);
        return index + 1;
      case FFI_TYPE_UINT16:
      case FFI_TYPE_SINT16:
        view(pointer, 2, "FFI callback i16").setUint16(0, values[index], true);
        return index + 1;
      case FFI_TYPE_INT:
      case FFI_TYPE_UINT32:
      case FFI_TYPE_SINT32:
        view(pointer, 4, "FFI callback i32").setUint32(0, values[index], true);
        return index + 1;
      case FFI_TYPE_FLOAT:
        view(pointer, 4, "FFI callback f32").setFloat32(0, values[index], true);
        return index + 1;
      case FFI_TYPE_DOUBLE:
        view(pointer, 8, "FFI callback f64").setFloat64(0, values[index], true);
        return index + 1;
      case FFI_TYPE_UINT64:
      case FFI_TYPE_SINT64:
      case FFI_TYPE_POINTER:
        view(pointer, 8, "FFI callback i64").setBigUint64(
          0, BigInt.asUintN(64, values[index]), true,
        );
        return index + 1;
      case FFI_TYPE_LONGDOUBLE: {
        const data = view(pointer, 16, "FFI callback long double");
        data.setBigUint64(0, BigInt.asUintN(64, values[index]), true);
        data.setBigUint64(8, BigInt.asUintN(64, values[index + 1]), true);
        return index + 2;
      }
      default:
        throw new TypeError(`unsupported FFI callback type ${type.id}`);
    }
  }

  function callbackResult(pointer, type) {
    switch (resultWasmType(type)) {
      case null: return undefined;
      case "i32": return view(pointer, 4, "FFI callback result").getUint32(0, true);
      case "i64": return view(pointer, 8, "FFI callback result").getBigUint64(0, true);
      case "f32": return view(pointer, 4, "FFI callback result").getFloat32(0, true);
      case "f64": return view(pointer, 8, "FFI callback result").getFloat64(0, true);
      default: throw new TypeError("invalid FFI callback result");
    }
  }

  function prepareClosure(closure, cif, callbackIndex, userData) {
    const returnByArgument =
      cif.returnType.id === FFI_TYPE_STRUCT ||
      cif.returnType.id === FFI_TYPE_LONGDOUBLE;
    const parameters = [];
    if (returnByArgument) parameters.push("i64");
    for (let index = 0; index < cif.fixed; ++index) {
      parameters.push(...argumentWasmTypes(cif.types[index]));
    }
    if ((cif.flags & VARARGS_FLAG) !== 0) parameters.push("i64");
    const result = returnByArgument ? null : resultWasmType(cif.returnType);

    return typedWasmFunction((...arguments_) => {
      const frame = stack();
      let valueIndex = 0;
      const returnPointer = returnByArgument
        ? asBigInt(arguments_[valueIndex++], "FFI closure return pointer")
        : frame.allocate(8, 8);
      const argumentArray = frame.allocate(cif.nargs * 8, 8);

      for (let index = 0; index < cif.fixed; ++index) {
        const type = cif.types[index];
        let argumentPointer;
        if (type.id === FFI_TYPE_STRUCT) {
          const source = asBigInt(
            arguments_[valueIndex++], "FFI closure structure pointer",
          );
          argumentPointer = frame.allocate(type.size, type.alignment);
          copy(argumentPointer, source, type.size);
        } else {
          const alignment = type.id === FFI_TYPE_UINT8 || type.id === FFI_TYPE_SINT8 ||
              type.id === FFI_TYPE_UINT16 || type.id === FFI_TYPE_SINT16
            ? 4 : Math.max(1, Math.min(type.alignment, 8));
          argumentPointer = frame.allocate(Math.max(type.size, 1), alignment);
          valueIndex = writeCallbackArgument(
            argumentPointer, type, arguments_, valueIndex,
          );
        }
        writePointer(argumentArray, index * 8, argumentPointer);
      }

      if ((cif.flags & VARARGS_FLAG) !== 0) {
        let variadic = asBigInt(
          arguments_[arguments_.length - 1], "FFI closure variadic pointer",
        );
        for (let index = cif.fixed; index < cif.nargs; ++index) {
          const type = cif.types[index];
          if (type.id === FFI_TYPE_STRUCT) {
            const source = readPointer(variadic, 0);
            const copyPointer = frame.allocate(type.size, type.alignment);
            copy(copyPointer, source, type.size);
            writePointer(argumentArray, index * 8, copyPointer);
          } else {
            writePointer(argumentArray, index * 8, variadic);
          }
          variadic += 8n;
        }
      }

      frame.publish();
      try {
        tableFunction(callbackIndex, "FFI closure callback")(
          cif.pointer, returnPointer, argumentArray, userData,
        );
      } finally {
        frame.restore();
      }
      return returnByArgument
        ? undefined : callbackResult(returnPointer, cif.returnType);
    }, parameters, result);
  }

  function allocateClosure(request, response) {
    if (request.size !== 8 || response.size < 8) return -22n;
    const closure = view(request.address, 8, "FFI closure allocation request")
      .getBigUint64(0, true);
    address(closure, 32, "FFI closure");
    if (closures.has(closure)) return -22n;
    const index = freeTableIndices.length === 0
      ? growTable(1n) : freeTableIndices.pop();
    closures.set(closure, { index, prepared: false });
    view(response.address, 8, "FFI closure allocation response")
      .setBigUint64(0, index, true);
    return 8n;
  }

  function freeClosure(request) {
    if (request.size !== 8) return -22n;
    const closure = view(request.address, 8, "FFI closure free request")
      .getBigUint64(0, true);
    const record = closures.get(closure);
    if (!record) return -22n;
    setTable(record.index, null);
    freeTableIndices.push(record.index);
    closures.delete(closure);
    return 0n;
  }

  function configureClosure(request) {
    if (request.size !== 40) return -22n;
    const packet = view(request.address, 40, "FFI closure preparation request");
    const closure = packet.getBigUint64(0, true);
    const cifPointer = packet.getBigUint64(8, true);
    const callbackIndex = packet.getBigUint64(16, true);
    const userData = packet.getBigUint64(24, true);
    const code = packet.getBigUint64(32, true);
    const record = closures.get(closure);
    if (!record || code !== record.index) return -22n;
    const cif = cifInfo(cifPointer);
    const wrapper = prepareClosure(closure, cif, callbackIndex, userData);
    setTable(record.index, wrapper);
    writePointer(closure, 0, record.index);
    writePointer(closure, 8, cifPointer);
    writePointer(closure, 16, callbackIndex);
    writePointer(closure, 24, userData);
    record.prepared = true;
    return BigInt(FFI_OK);
  }

  return Object.freeze({
    handles(operation) {
      return localOperations.has(operation);
    },
    call(operation, request, response) {
      if (operation === FFI_CALL) {
        if (request.size !== 32 || response.size !== 0) return -22n;
        performCall(view(request.address, 32, "FFI call request"));
        return 0n;
      }
      if (operation === FFI_CLOSURE_ALLOC) {
        return allocateClosure(request, response);
      }
      if (operation === FFI_CLOSURE_FREE) return freeClosure(request);
      if (operation === FFI_CLOSURE_PREP) return configureClosure(request);
      throw new TypeError("unknown process-local FFI operation");
    },
  });
}
