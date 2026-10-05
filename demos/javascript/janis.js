// Janis: the Node-shaped runtime surface for ordinary upstream JavaScript.
// Every operation bottoms out in the in-Wasm Dolly object. This file has no
// browser globals, native host modules, filesystem mounts, or socket fallback.

globalThis.global = globalThis;

// V8's error.stack: the error's own line, then one line per frame.
Error.prepareStackTrace = (error, frames) => {
  let header;
  try {
    const name = error?.name === undefined ? "Error" : String(error.name);
    const message = error?.message === undefined ? "" : String(error.message);
    header = !name ? message : !message ? name : `${name}: ${message}`;
  } catch { header = "Error"; }
  return header + frames.map((frame) => {
    const name = frame.getFunctionName();
    if (frame.isNative()) return `\n    at ${name || "<anonymous>"} (native)`;
    const location = `${frame.getFileName()}:${frame.getLineNumber()}:${frame.getColumnNumber()}`;
    return name ? `\n    at ${name} (${location})` : `\n    at ${location}`;
  }).join("");
};

// QuickJS intentionally does not ship ICU. Pi only consumes Intl.Segmenter,
// so Janis supplies that single API in-process instead of importing locale
// services from the browser. This keeps terminal editing Unicode-safe for the
// common grapheme cases (marks, emoji modifiers/ZWJ sequences, flags, CRLF,
// and Hangul syllables) and provides the word-like grouping Pi uses for cursor
// movement and mouse selection.
const janisUnicodeMark = /\p{Mark}/u;
const janisUnicodeWord = /[\p{Alphabetic}\p{Number}]/u;
const janisUnicodeWhitespace = /\s/u;
const janisEmojiModifier = /\p{Emoji_Modifier}/u;

function janisHangulClass(codepoint) {
  if (codepoint >= 0x1100 && codepoint <= 0x115f ||
      codepoint >= 0xa960 && codepoint <= 0xa97c) return "L";
  if (codepoint >= 0x1160 && codepoint <= 0x11a7 ||
      codepoint >= 0xd7b0 && codepoint <= 0xd7c6) return "V";
  if (codepoint >= 0x11a8 && codepoint <= 0x11ff ||
      codepoint >= 0xd7cb && codepoint <= 0xd7fb) return "T";
  if (codepoint >= 0xac00 && codepoint <= 0xd7a3) {
    return (codepoint - 0xac00) % 28 === 0 ? "LV" : "LVT";
  }
  return "";
}

function janisGraphemeContinues(previous, current, regionalCount) {
  const previousCodepoint = previous.codePointAt(0);
  const currentCodepoint = current.codePointAt(0);
  if (previousCodepoint === 0x0d && currentCodepoint === 0x0a) return true;
  if (janisUnicodeMark.test(current) || janisEmojiModifier.test(current) ||
      currentCodepoint === 0x200d || currentCodepoint === 0xfe0e ||
      currentCodepoint === 0xfe0f || currentCodepoint === 0x20e3) return true;
  if (previousCodepoint === 0x200d) return true;

  const previousHangul = janisHangulClass(previousCodepoint);
  const currentHangul = janisHangulClass(currentCodepoint);
  if (previousHangul === "L" &&
      (currentHangul === "L" || currentHangul === "V" || currentHangul === "LV" ||
       currentHangul === "LVT")) return true;
  if ((previousHangul === "LV" || previousHangul === "V") &&
      (currentHangul === "V" || currentHangul === "T")) return true;
  if ((previousHangul === "LVT" || previousHangul === "T") &&
      currentHangul === "T") return true;

  const previousRegional = previousCodepoint >= 0x1f1e6 && previousCodepoint <= 0x1f1ff;
  const currentRegional = currentCodepoint >= 0x1f1e6 && currentCodepoint <= 0x1f1ff;
  return previousRegional && currentRegional && regionalCount % 2 === 1;
}

function janisSegmentGraphemes(input) {
  const result = [];
  let segment = "";
  let segmentIndex = 0;
  let index = 0;
  let previous = "";
  let regionalCount = 0;
  for (const current of input) {
    const currentCodepoint = current.codePointAt(0);
    const currentRegional = currentCodepoint >= 0x1f1e6 && currentCodepoint <= 0x1f1ff;
    if (segment !== "" && !janisGraphemeContinues(previous, current, regionalCount)) {
      result.push({ segment, index: segmentIndex, input });
      segment = "";
      segmentIndex = index;
      regionalCount = 0;
    }
    if (segment === "") segmentIndex = index;
    segment += current;
    regionalCount = currentRegional ? regionalCount + 1 : 0;
    previous = current;
    index += current.length;
  }
  if (segment !== "") result.push({ segment, index: segmentIndex, input });
  return result;
}

function janisWordClass(character) {
  if (janisUnicodeWhitespace.test(character)) return "space";
  if (janisUnicodeWord.test(character) || janisUnicodeMark.test(character) ||
      character === "_") return "word";
  return "other";
}

function janisSegmentWords(input) {
  const graphemes = janisSegmentGraphemes(input);
  const result = [];
  let current;
  let currentClass = "";
  for (const item of graphemes) {
    const itemClass = janisWordClass(item.segment);
    // Match Intl's useful behavior for Pi: words and whitespace are runs,
    // while punctuation remains independently selectable.
    if (current && itemClass === currentClass && itemClass !== "other") {
      current.segment += item.segment;
      continue;
    }
    current = {
      segment: item.segment,
      index: item.index,
      input,
      isWordLike: itemClass === "word",
    };
    result.push(current);
    currentClass = itemClass;
  }
  return result;
}

class JanisSegments {
  constructor(items, input) { this.items = items; this.input = input; }
  [Symbol.iterator]() { return this.items[Symbol.iterator](); }
  containing(index = 0) {
    const position = Number(index);
    if (!Number.isInteger(position) || position < 0 || position >= this.input.length) {
      return undefined;
    }
    return this.items.find((item) =>
      position >= item.index && position < item.index + item.segment.length);
  }
}

class JanisSegmenter {
  constructor(locales = undefined, options = {}) {
    const granularity = options.granularity ?? "grapheme";
    if (granularity !== "grapheme" && granularity !== "word" &&
        granularity !== "sentence") {
      throw new RangeError(`unsupported segmenter granularity: ${granularity}`);
    }
    this.locale = Array.isArray(locales) ? locales[0] ?? "en" : locales ?? "en";
    this.granularity = granularity;
  }
  segment(value) {
    const input = String(value);
    const items = this.granularity === "grapheme"
      ? janisSegmentGraphemes(input)
      : this.granularity === "word"
        ? janisSegmentWords(input)
        : input.split(/(?<=[.!?])(?:\s+|$)/u).filter(Boolean).map((segment, index, all) => ({
            segment,
            index: all.slice(0, index).reduce((length, part) => length + part.length, 0),
            input,
          }));
    return new JanisSegments(items, input);
  }
  resolvedOptions() { return { locale: String(this.locale), granularity: this.granularity }; }
  static supportedLocalesOf(locales) {
    return locales === undefined ? [] : Array.isArray(locales) ? [...locales] : [locales];
  }
}

// The rest of Janis's Intl is CLDR's en-US only, in the zone Date's local time
// uses, and says so in resolvedOptions(); what it cannot format throws.
const janisIntlUnsupported = (what) => { throw new RangeError(`Janis Intl does not support ${what}`); };
const janisLocalZone = () => {
  const offset = -new Date().getTimezoneOffset();
  return offset === 0 ? "UTC" : offset % 60 === 0 ? `Etc/GMT${offset > 0 ? "-" : "+"}${Math.abs(offset / 60)}` : janisIntlUnsupported("a fractional-hour local time zone");
};
// Etc/GMT-9 is nine hours east of UTC, written GMT+9.
const janisZoneName = (zone) => zone === "UTC" ? "UTC" : `GMT${zone[7] === "-" ? "+" : "-"}${zone.slice(8)}`;

// Rounds |value| × 10^shift half away from zero in its shortest decimal form,
// as ICU does: the point moves in decimal, so 1.005 as a percent is 100.5.
function janisRoundDecimal(value, fraction, shift = 0) {
  const [mantissa, exponentText] = Math.abs(value).toExponential().split("e");
  const digits = mantissa.replace(".", "");
  let point = Number(exponentText) + 1 + shift;
  let kept = digits.slice(0, Math.max(0, point + fraction)).padEnd(Math.max(0, point + fraction), "0");
  if (point + fraction < 0) kept = "";
  const next = point + fraction >= 0 ? Number(digits[point + fraction] ?? 0) : 0;
  let integer = BigInt(kept || "0") + (next >= 5 ? 1n : 0n);
  let text = integer.toString().padStart(fraction + 1, "0");
  return fraction ? `${text.slice(0, -fraction)}.${text.slice(-fraction)}` : text;
}
function janisGroup(text) {
  const [integer, fraction] = text.split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+$)/g, ",");
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}
function janisFormatNumber(value, minimum, maximum, shift = 0) {
  let text = janisRoundDecimal(value, maximum, shift);
  if (text.includes(".")) {
    text = text.replace(/0+$/, "");
    const fraction = text.split(".")[1] ?? "";
    if (fraction.length < minimum) text += "0".repeat(minimum - fraction.length);
    text = text.replace(/\.$/, "");
  }
  return text;
}
function janisSignificant(value, digits, shift = 0) {
  if (value === 0) return "0";
  const magnitude = Math.floor(Math.log10(Math.abs(value))) + shift;
  return janisFormatNumber(value, 0, Math.max(0, digits - 1 - magnitude), shift);
}

class JanisNumberFormat {
  #style; #notation; #minimum; #maximum; #grouping; #explicitDigits;
  constructor(_locales = undefined, options = {}) {
    options ??= {};
    for (const key of Object.keys(options)) {
      if (!["style", "notation", "minimumFractionDigits", "maximumFractionDigits", "useGrouping", "compactDisplay"].includes(key) ||
          (key === "compactDisplay" && options[key] !== "short")) janisIntlUnsupported(`NumberFormat option ${key}`);
    }
    this.#style = options.style ?? "decimal";
    this.#notation = options.notation ?? "standard";
    if (!["decimal", "percent"].includes(this.#style)) janisIntlUnsupported(`NumberFormat style ${this.#style}`);
    if (!["standard", "compact"].includes(this.#notation)) janisIntlUnsupported(`NumberFormat notation ${this.#notation}`);
    const defaultMaximum = this.#style === "percent" ? 0 : 3;
    this.#minimum = options.minimumFractionDigits ?? 0;
    this.#maximum = Math.max(this.#minimum, options.maximumFractionDigits ?? (options.minimumFractionDigits !== undefined ? Math.max(this.#minimum, defaultMaximum) : defaultMaximum));
    this.#explicitDigits = options.minimumFractionDigits !== undefined || options.maximumFractionDigits !== undefined;
    this.#grouping = options.useGrouping ?? true;
  }
  format(value) {
    value = Number(value);
    if (!Number.isFinite(value)) return Number.isNaN(value) ? "NaN" : `${value < 0 ? "-" : ""}∞`;
    const negative = value < 0 || Object.is(value, -0);
    const magnitude = Math.abs(value), percent = this.#style === "percent" ? 2 : 0;
    let text, suffix = "";
    if (this.#notation === "compact") {
      const units = ["", "K", "M", "B", "T"];
      const scale = magnitude * 10 ** percent;
      let unit = Math.min(units.length - 1, scale >= 1000 ? Math.floor(Math.log10(scale) / 3) : 0);
      for (;;) {
        const shift = percent - 3 * unit;
        // ICU's compact rounding: integers from 10 up, otherwise two significant digits.
        text = this.#explicitDigits ? janisFormatNumber(magnitude, this.#minimum, this.#maximum, shift)
          : scale / 1000 ** unit >= 10 ? janisFormatNumber(magnitude, 0, 0, shift) : janisSignificant(magnitude, 2, shift);
        if (Number(text) < 1000 || unit === units.length - 1) break;
        unit++;
      }
      suffix = units[unit];
    } else text = janisFormatNumber(magnitude, this.#minimum, this.#maximum, percent);
    if (this.#grouping) text = janisGroup(text);
    return `${negative && Number(text.replaceAll(",", "")) !== 0 ? "-" : ""}${text}${suffix}${this.#style === "percent" ? "%" : ""}`;
  }
  resolvedOptions() {
    return { locale: "en-US", numberingSystem: "latn", style: this.#style, notation: this.#notation,
      minimumFractionDigits: this.#minimum, maximumFractionDigits: this.#maximum, useGrouping: this.#grouping ? "auto" : false };
  }
  static supportedLocalesOf() { return ["en-US"]; }
}

const janisWeekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const janisMonths = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const janisDateFields = ["weekday", "year", "month", "day", "hour", "minute", "second"];
class JanisDateTimeFormat {
  #options;
  constructor(_locales = undefined, options = {}, defaults = "date") {
    options = { ...(options ?? {}) };
    for (const key of Object.keys(options)) {
      if (![...janisDateFields, "timeZone", "timeZoneName", "hour12", "hourCycle", "dateStyle", "timeStyle"].includes(key))
        janisIntlUnsupported(`DateTimeFormat option ${key}`);
    }
    const local = janisLocalZone();
    const zone = options.timeZone === undefined ? local : String(options.timeZone);
    if (zone !== local && !/^(UTC|Etc\/UTC|GMT|Etc\/GMT)$/i.test(zone)) janisIntlUnsupported(`time zone ${zone}`);
    const styles = { full: { weekday: "long", month: "long", day: "numeric", year: "numeric" },
      long: { month: "long", day: "numeric", year: "numeric" }, medium: { month: "short", day: "numeric", year: "numeric" },
      short: { month: "numeric", day: "numeric", year: "2-digit" } };
    const times = { full: { timeZoneName: "long" }, long: { timeZoneName: "short" }, medium: {}, short: { second: undefined } };
    if (options.dateStyle) Object.assign(options, styles[options.dateStyle] ?? janisIntlUnsupported(`dateStyle ${options.dateStyle}`));
    if (options.timeStyle) Object.assign(options, { hour: "numeric", minute: "2-digit", second: "2-digit" },
      times[options.timeStyle] ?? janisIntlUnsupported(`timeStyle ${options.timeStyle}`));
    if (!janisDateFields.some((field) => options[field] !== undefined)) {
      if (defaults !== "time") Object.assign(options, { year: "numeric", month: "numeric", day: "numeric" });
      if (defaults !== "date") Object.assign(options, { hour: "numeric", minute: "2-digit", second: "2-digit" });
    }
    options.utc = /^(UTC|Etc\/UTC|GMT|Etc\/GMT)$/i.test(zone);
    options.timeZone = options.utc ? "UTC" : zone;
    options.hour12 = options.hour12 ?? (options.hourCycle ? options.hourCycle === "h11" || options.hourCycle === "h12" : true);
    this.#options = options;
  }
  format(value = Date.now()) {
    const o = this.#options, date = new Date(value instanceof Date ? value.getTime() : Number(value));
    if (Number.isNaN(date.getTime())) throw new RangeError("Invalid time value");
    const get = (name) => o.utc ? date[`getUTC${name}`]() : date[`get${name}`]();
    const two = (number) => String(number).padStart(2, "0");
    const year = o.year === "2-digit" ? two(get("FullYear") % 100) : o.year ? String(get("FullYear")) : "";
    const month = get("Month"), day = o.day === "2-digit" ? two(get("Date")) : o.day ? String(get("Date")) : "";
    const weekday = o.weekday ? janisWeekdays[get("Day")].slice(0, o.weekday === "long" ? undefined : o.weekday === "short" ? 3 : 1) : "";
    let datePart;
    if (o.month === "numeric" || o.month === "2-digit") {
      const number = o.month === "2-digit" ? two(month + 1) : String(month + 1);
      datePart = [number, day, year].filter(Boolean).join("/");
    } else if (o.month) {
      const name = janisMonths[month].slice(0, o.month === "long" ? undefined : o.month === "short" ? 3 : 1);
      datePart = day && year ? `${name} ${day}, ${year}` : day ? `${name} ${day}` : year ? `${name} ${year}` : name;
    } else if (day || year) {
      if (day && year) janisIntlUnsupported("a day and year without a month");
      datePart = day || year;
    } else datePart = "";
    if (weekday && datePart) datePart = `${weekday}, ${datePart}`;
    let timePart = "";
    if (o.hour || o.minute || o.second) {
      if (!o.hour) janisIntlUnsupported("minutes or seconds without an hour");
      const hours = get("Hours");
      const hour = o.hour12 ? (hours % 12 || 12) : hours;
      const fields = [o.hour === "2-digit" || !o.hour12 ? two(hour) : String(hour)];
      if (o.minute) fields.push(two(get("Minutes")));
      if (o.second) fields.push(two(get("Seconds")));
      timePart = fields.join(":") + (o.hour12 ? (hours < 12 ? " AM" : " PM") : "");
      if (o.timeZoneName) timePart += ` ${o.timeZoneName === "long" ? (o.timeZone === "UTC" ? "Coordinated Universal Time" : janisZoneName(o.timeZone)) : janisZoneName(o.timeZone)}`;
    }
    if (!datePart) return weekday && timePart ? `${weekday} ${timePart}` : weekday || timePart;
    if (!timePart) return datePart;
    return o.dateStyle === "full" || o.dateStyle === "long" ? `${datePart} at ${timePart}` : `${datePart}, ${timePart}`;
  }
  resolvedOptions() {
    const { utc, ...options } = this.#options;
    return { locale: "en-US", calendar: "gregory", numberingSystem: "latn", ...options };
  }
  static supportedLocalesOf() { return ["en-US"]; }
}

class JanisRelativeTimeFormat {
  #style; #numeric;
  constructor(_locales = undefined, options = {}) {
    this.#style = options?.style ?? "long";
    this.#numeric = options?.numeric ?? "always";
    if (!["long", "short", "narrow"].includes(this.#style)) janisIntlUnsupported(`RelativeTimeFormat style ${this.#style}`);
  }
  format(value, unit) {
    value = Number(value);
    unit = String(unit).replace(/s$/, "");
    const names = { second: ["second", "sec.", "s"], minute: ["minute", "min.", "m"], hour: ["hour", "hr.", "h"], day: ["day", "day", "d"],
      week: ["week", "wk.", "w"], month: ["month", "mo.", "mo"], quarter: ["quarter", "qtr.", "q"], year: ["year", "yr.", "y"] };
    if (!names[unit]) throw new RangeError(`Invalid unit argument for format() '${unit}'`);
    const style = ["long", "short", "narrow"].indexOf(this.#style);
    if (this.#numeric === "auto") {
      const words = { day: ["yesterday", "today", "tomorrow"], second: [null, "now", null] };
      const named = words[unit]?.[value + 1] ?? (["week", "month", "quarter", "year"].includes(unit) && Math.abs(value) <= 1 && Number.isInteger(value)
        ? `${["last", "this", "next"][value + 1]} ${style === 0 ? unit : names[unit][1]}` : unit === "minute" || unit === "hour" ? (value === 0 ? `this ${unit}` : null) : null);
      if (named) return named;
    }
    const amount = janisGroup(janisFormatNumber(Math.abs(value), 0, 3));
    const name = names[unit][style];
    const plural = Math.abs(value) !== 1 && (style === 0 || (style === 1 && unit === "day")) ? "s" : "";
    const text = style === 2 ? `${amount}${name}` : `${amount} ${name}${plural}`;
    return value < 0 || Object.is(value, -0) ? `${text} ago` : `in ${text}`;
  }
  resolvedOptions() { return { locale: "en-US", style: this.#style, numeric: this.#numeric, numberingSystem: "latn" }; }
  static supportedLocalesOf() { return ["en-US"]; }
}

class JanisLocale {
  constructor(tag) {
    const match = /^([a-z]{2,3})(?:-([A-Z][a-z]{3}))?(?:-([A-Z]{2}|\d{3}))?$/i.exec(String(tag));
    if (!match) throw new RangeError(`Incorrect locale information provided: ${tag}`);
    this.language = match[1].toLowerCase();
    this.script = match[2] && match[2][0].toUpperCase() + match[2].slice(1).toLowerCase();
    this.region = match[3]?.toUpperCase();
    this.baseName = [this.language, this.script, this.region].filter(Boolean).join("-");
  }
  toString() { return this.baseName; }
}

// ECMA-402 lets DateTimeFormat and NumberFormat be called without new.
const janisCallable = (Class) => Object.assign(function(...args) { return new Class(...args); },
  { prototype: Class.prototype, supportedLocalesOf: Class.supportedLocalesOf });
globalThis.Intl = { Segmenter: JanisSegmenter, NumberFormat: janisCallable(JanisNumberFormat),
  DateTimeFormat: janisCallable(JanisDateTimeFormat), RelativeTimeFormat: JanisRelativeTimeFormat, Locale: JanisLocale };
// ECMA-402 defines the locale methods through Intl.
Date.prototype.toLocaleString = function(locales, options) { return new JanisDateTimeFormat(locales, options, "any").format(this); };
Date.prototype.toLocaleDateString = function(locales, options) { return new JanisDateTimeFormat(locales, options, "date").format(this); };
Date.prototype.toLocaleTimeString = function(locales, options) { return new JanisDateTimeFormat(locales, options, "time").format(this); };
Number.prototype.toLocaleString = function(locales, options) { return new JanisNumberFormat(locales, options).format(this); };

// Node's EventEmitter is a plain constructor that legacy code calls as
// EventEmitter.call(this). Listeners live beside the object, so neither that
// call nor a subclass constructor has anything to set up.
const janisListeners = new WeakMap();
function janisEvents(emitter) {
  let events = janisListeners.get(emitter);
  if (!events) janisListeners.set(emitter, events = new Map());
  return events;
}
function JanisEventEmitter() {}
Object.assign(JanisEventEmitter.prototype, {
  on(name, listener) {
    if (typeof listener !== "function") throw new TypeError("listener must be a function");
    const listeners = janisEvents(this).get(name) ?? [];
    listeners.push(listener);
    janisEvents(this).set(name, listeners);
    return this;
  },
  addListener(name, listener) { return this.on(name, listener); },
  prependListener(name, listener) {
    const listeners = janisEvents(this).get(name) ?? [];
    listeners.unshift(listener);
    janisEvents(this).set(name, listeners);
    return this;
  },
  once(name, listener) {
    const wrapped = (...args) => {
      this.removeListener(name, wrapped);
      listener.apply(this, args);
    };
    wrapped.listener = listener;
    return this.on(name, wrapped);
  },
  prependOnceListener(name, listener) {
    const wrapped = (...args) => {
      this.removeListener(name, wrapped);
      listener.apply(this, args);
    };
    wrapped.listener = listener;
    return this.prependListener(name, wrapped);
  },
  off(name, listener) { return this.removeListener(name, listener); },
  removeListener(name, listener) {
    const listeners = janisEvents(this).get(name);
    if (!listeners) return this;
    const filtered = listeners.filter((candidate) =>
      candidate !== listener && candidate.listener !== listener);
    if (filtered.length) janisEvents(this).set(name, filtered);
    else janisEvents(this).delete(name);
    return this;
  },
  removeAllListeners(name = undefined) {
    if (name === undefined) janisEvents(this).clear();
    else janisEvents(this).delete(name);
    return this;
  },
  emit(name, ...args) {
    const listeners = [...(janisEvents(this).get(name) ?? [])];
    if (name === "error" && listeners.length === 0) throw args[0];
    for (const listener of listeners) listener.apply(this, args);
    return listeners.length !== 0;
  },
  listeners(name) { return [...(janisEvents(this).get(name) ?? [])]; },
  rawListeners(name) { return this.listeners(name); },
  listenerCount(name) { return janisEvents(this).get(name)?.length ?? 0; },
  eventNames() { return [...janisEvents(this).keys()]; },
  setMaxListeners() { return this; },
  getMaxListeners() { return 0; },
});
// Enumerable, as Node assigns them: they are named exports of node:events.
Object.assign(JanisEventEmitter, {
  listenerCount: (emitter, name) => emitter.listenerCount(name),
  once: (emitter, name) => new Promise((resolve, reject) => {
    emitter.once(name, (...args) => resolve(args));
    if (name !== "error") emitter.once("error", reject);
  }),
});

// node:stream is the legacy Stream constructor, also callable as
// Stream.call(this), with the stream classes as its properties.
function JanisStream() {}
Object.setPrototypeOf(JanisStream, JanisEventEmitter);
Object.setPrototypeOf(JanisStream.prototype, JanisEventEmitter.prototype);
JanisStream.prototype.pipe = function(destination) {
  this.on("data", (chunk) => destination.write(chunk));
  this.once("end", () => destination.end());
  return destination;
};

function unsupported(what, code = "ENOSYS") {
  return () => { throw Object.assign(new Error(`Janis does not support ${what}`), { code }); };
}

class JanisTimer {
  constructor(id) { this.id = id; }
  ref() { const timer = janisTimers.get(this.id); if (timer) timer.ref = true; return this; }
  unref() { const timer = janisTimers.get(this.id); if (timer) timer.ref = false; return this; }
  hasRef() { return janisTimers.get(this.id)?.ref ?? false; }
  refresh() {
    const timer = janisTimers.get(this.id);
    if (timer) timer.due = Date.now() + timer.delay;
    return this;
  }
  [Symbol.toPrimitive]() { return this.id; }
}

let janisNextTimerId = 1;
const janisTimers = new Map();
function janisCreateTimer(callback, delay, repeat, args) {
  if (typeof callback !== "function") throw new TypeError("callback must be a function");
  const milliseconds = Math.max(0, Number(delay) || 0);
  const id = janisNextTimerId++;
  janisTimers.set(id, {
    callback,
    args,
    delay: milliseconds,
    due: Date.now() + milliseconds,
    repeat,
    ref: true,
  });
  return new JanisTimer(id);
}
globalThis.setTimeout = (callback, delay = 0, ...args) =>
  janisCreateTimer(callback, delay, false, args);
globalThis.setInterval = (callback, delay = 0, ...args) =>
  janisCreateTimer(callback, delay, true, args);
globalThis.clearTimeout = (handle) => janisTimers.delete(Number(handle?.id ?? handle));
globalThis.clearInterval = globalThis.clearTimeout;
globalThis.setImmediate = (callback, ...args) => janisCreateTimer(callback, 0, false, args);
globalThis.clearImmediate = globalThis.clearTimeout;

function runDueTimers() {
  const now = Date.now();
  for (const [id, timer] of [...janisTimers]) {
    if (timer.due > now) continue;
    if (timer.repeat) timer.due = now + Math.max(1, timer.delay);
    else janisTimers.delete(id);
    timer.callback(...timer.args);
  }
}

function timerPromise(delay, value, options = {}) {
  return new Promise((resolve, reject) => {
    const signal = options.signal;
    if (signal?.aborted) { reject(abortError(signal.reason)); return; }
    const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(abortError(signal.reason)); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(value); }, delay);
    if (options.ref === false) timer.unref();
    signal?.addEventListener("abort", abort);
  });
}

class JanisStringDecoder {
  #decoder;
  constructor(encoding = "utf8") {
    this.#decoder = new TextDecoder(encoding, { ignoreBOM: true });
    this.encoding = "utf8";
  }
  write(bytes) { return typeof bytes === "string" ? bytes : this.#decoder.decode(bytes, { stream: true }); }
  end(bytes) {
    return typeof bytes === "string" ? bytes + this.#decoder.decode() : this.#decoder.decode(bytes);
  }
}

// Non-terminal line input for file scanners, pipes and simple questions.
class JanisReadline extends JanisEventEmitter {
  closed = false;
  constructor(options, output) {
    super();
    if (options?.on) options = { input: options, output };
    const { input, crlfDelay = 100 } = options;
    if (!input?.on) throw new TypeError("readline requires an input stream");
    if (options.terminal === true) throw new Error("Janis readline does not implement terminal editing");
    this.input = input;
    this.output = options.output;
    const decoder = new JanisStringDecoder();
    let pending = "", lastCR = null;
    const accept = text => {
      if (!text || this.closed) return;
      if (lastCR !== null && text[0] === "\n" && Date.now() - lastCR <= Math.max(100, crlfDelay)) text = text.slice(1);
      lastCR = null;
      let start = 0;
      for (let index = 0; index < text.length && !this.closed; index++) {
        const char = text[index];
        if (char !== "\r" && char !== "\n") continue;
        const line = pending + text.slice(start, index);
        pending = "";
        if (char === "\r") {
          if (text[index + 1] === "\n") index++;
          else if (index === text.length - 1) lastCR = Date.now();
        }
        start = index + 1;
        this.emit("line", line);
      }
      pending += text.slice(start);
    };
    const data = chunk => accept(decoder.write(chunk));
    const end = () => {
      accept(decoder.end());
      if (pending && !this.closed) this.emit("line", pending);
      this.close();
    };
    const error = value => { this.close(); this.emit("error", value); };
    const close = () => this.close();
    this.detach = () => {
      for (const [name, listener] of [["data", data], ["end", end], ["error", error], ["close", close]]) input.off(name, listener);
    };
    input.on("data", data).on("end", end).on("error", error).on("close", close);
    input.resume();
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.detach();
    this.input.pause();
    this.emit("close");
  }
  question(text, callback) {
    if (this.closed) throw new Error("readline is closed");
    this.output?.write(text);
    this.once("line", callback);
  }
  [Symbol.asyncIterator]() {
    const lines = [];
    let done = this.closed, failure, wake;
    const line = value => { lines.push(value); wake?.(); };
    const close = () => { done = true; wake?.(); };
    const error = value => { failure = value; done = true; wake?.(); };
    this.on("line", line).on("close", close).on("error", error);
    const detach = () => this.off("line", line).off("close", close).off("error", error);
    return {
      next: async () => {
        while (!lines.length && !done) await new Promise(resolve => { wake = resolve; });
        if (failure) { detach(); throw failure; }
        if (lines.length) return { value: lines.shift(), done: false };
        detach();
        return { done: true };
      },
      return: async () => { this.close(); lines.length = 0; detach(); return { done: true }; },
      [Symbol.asyncIterator]() { return this; },
    };
  }
}

class JanisStdin extends JanisEventEmitter {
  get isTTY() { return Boolean(Dolly.isatty(0)); }
  isRaw = false;
  readable = true;
  readableEncoding = null;
  #resumed = null;
  #decoder;
  on(name, listener) {
    super.on(name, listener);
    if (name === "data" && this.#resumed !== false) this.#resumed = true;
    return this;
  }
  setEncoding(encoding) {
    this.#decoder = new JanisStringDecoder(encoding);
    this.readableEncoding = this.#decoder.encoding;
    return this;
  }
  setRawMode(value) {
    if (this.isTTY) Dolly.setRawMode(Boolean(value));
    this.isRaw = Boolean(value);
    return this;
  }
  resume() { this.#resumed = true; return this; }
  pause() { this.#resumed = false; return this; }
  // An unreferenced stdin still reads while other work keeps the loop alive.
  refed = true;
  ref() { this.refed = true; return this; }
  unref() { this.refed = false; return this; }
  isActive() { return this.readable && (this.#resumed && this.listenerCount("data") > 0 || this.listenerCount("readable") > 0); }
  // Paused mode: 'readable' listeners pull buffered input with read().
  #queue = [];
  read() {
    if (!this.#queue.length) return null;
    const chunk = typeof this.#queue[0] === "string" ? this.#queue.join("") : Buffer.concat(this.#queue);
    this.#queue.length = 0;
    this.emit("data", chunk);
    return chunk;
  }
  publish(bytes) {
    if (!bytes.length || !this.isActive()) return;
    const chunk = this.#decoder ? this.#decoder.write(bytes) : Buffer.from(bytes);
    if (!chunk.length) return;
    if (this.listenerCount("readable") === 0) return void this.emit("data", chunk);
    this.#queue.push(chunk);
    this.emit("readable");
  }
  finish() {
    if (!this.readable) return;
    this.readable = false;
    this.#resumed = false;
    const tail = this.#decoder?.end();
    if (tail) this.emit("data", tail);
    this.emit("end");
  }
  pipe(destination) {
    this.on("data", (chunk) => destination.write(chunk));
    this.once("end", () => destination.end());
    return destination;
  }
}

class JanisOutput extends JanisEventEmitter {
  writable = true;
  writableLength = 0;
  #error;
  constructor(error = false) { super(); this.#error = error; }
  get isTTY() { return Boolean(Dolly.isatty(this.#error ? 2 : 1)); }
  get columns() { return Dolly.terminalSize().columns || 80; }
  get rows() { return Dolly.terminalSize().rows || 24; }
  write(value, _encoding, callback) {
    const bytes = value instanceof Uint8Array ? value : String(value);
    const status = this.#error ? Dolly.stderr(bytes) : Dolly.stdout(bytes);
    if (typeof _encoding === "function") _encoding();
    else callback?.();
    return Boolean(status);
  }
  end(value, encoding, callback) {
    if (value !== undefined) this.write(value, encoding);
    callback?.();
    this.emit("finish");
  }
}

const janisStdin = new JanisStdin();
const janisStdout = new JanisOutput(false);
const janisStderr = new JanisOutput(true);
let janisTerminalSize = Dolly.terminalSize();

Object.assign(process, {
  stdin: janisStdin,
  stdout: janisStdout,
  stderr: janisStderr,
  platform: "wasm",
  arch: "wasm64",
  version: "v22.19.0-janis",
  versions: { node: "22.19.0", quickjs: "ng", janis: "0", dolly: "0" },
  features: {},
  release: { name: "janis" },
  execPath: "/usr/bin/janis",
  execArgv: [],
  argv0: "janis",
  // Node's exit: listeners see the code, then the process ends; no catch intercepts it.
  exit(code) {
    if (code !== undefined) process.exitCode = code;
    janisEmitExit();
    Dolly.exit(Number(process.exitCode ?? 0));
  },
  kill(pid, signal = "SIGTERM") {
    if (pid === process.pid && signal === "SIGWINCH") janisStdout.emit("resize");
    else Dolly.processKill(pid, childSignal(signal));
    return true;
  },
  hrtime(previous = undefined) {
    let elapsed = process.hrtime.bigint();
    if (previous) elapsed -= BigInt(previous[0]) * 1000000000n + BigInt(previous[1]);
    return [Number(elapsed / 1000000000n), Number(elapsed % 1000000000n)];
  },
  uptime: () => performance.now() / 1000,
  memoryUsage: unsupported("process.memoryUsage"),
  resourceUsage: unsupported("process.resourceUsage"),
});
process.hrtime.bigint = () => BigInt(Math.round(performance.now() * 1e6));
// Node's argv[1] is the script's absolute path ("-" for stdin).
if (globalThis.scriptPath && globalThis.scriptPath !== "-") process.argv[1] = resolvePath(globalThis.scriptPath);
const janisProcessEvents = new JanisEventEmitter();
for (const method of [
  "on", "addListener", "prependListener", "once", "prependOnceListener",
  "off", "removeListener", "removeAllListeners", "listeners", "rawListeners",
  "listenerCount", "eventNames", "setMaxListeners", "getMaxListeners",
]) {
  process[method] = (...args) => {
    const result = janisProcessEvents[method](...args);
    return result === janisProcessEvents ? process : result;
  };
}
process.emit = (name, ...args) => janisProcessEvents.emit(name, ...args);
let janisExiting = false;
function janisEmitExit() {
  if (janisExiting) return;
  janisExiting = true;
  process.emit("exit", Number(process.exitCode ?? 0));
}
// The native runner calls this when the event loop drains, as Node emits 'exit'.
globalThis.__janisExiting = janisEmitExit;

// Buffer operations used by Pi, TypeBox, model clients, and extension loaders.
Buffer.isEncoding = (encoding) => /^(?:utf-?8|utf8|hex|base64|ascii|latin1|binary)$/i.test(encoding);
Buffer.compare = (left, right) => {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index++) if (left[index] !== right[index]) return left[index] - right[index];
  return left.length - right.length;
};
Buffer.prototype.equals = function(other) { return Buffer.compare(this, other) === 0; };
Buffer.prototype.slice = Buffer.prototype.subarray;
Buffer.prototype.readUInt8 = function(offset = 0) { return this[offset]; };
Buffer.prototype.readUInt16LE = function(offset = 0) { return this[offset] | this[offset + 1] << 8; };
Buffer.prototype.readUInt16BE = function(offset = 0) { return this[offset] << 8 | this[offset + 1]; };
Buffer.prototype.readUInt32LE = function(offset = 0) {
  return (this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16) + this[offset + 3] * 0x1000000;
};
Buffer.prototype.readUInt32BE = function(offset = 0) {
  return this[offset] * 0x1000000 + (this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3]);
};
Buffer.prototype.writeUInt32LE = function(value, offset = 0) {
  for (let index = 0; index < 4; index++) this[offset + index] = value >>> (index * 8);
  return offset + 4;
};
Buffer.prototype.writeUInt32BE = function(value, offset = 0) {
  for (let index = 0; index < 4; index++) this[offset + index] = value >>> ((3 - index) * 8);
  return offset + 4;
};
Buffer.prototype.write = function(value, offset = 0, length = undefined, encoding = "utf8") {
  const bytes = Buffer.from(value, encoding);
  const count = Math.min(length ?? bytes.length, bytes.length, this.length - offset);
  this.set(bytes.subarray(0, count), offset);
  return count;
};
Buffer.prototype.copy = function(target, targetStart = 0, sourceStart = 0, sourceEnd = this.length) {
  const source = this.subarray(sourceStart, sourceEnd);
  const count = Math.min(source.length, target.length - targetStart);
  target.set(source.subarray(0, count), targetStart);
  return count;
};

function normalizePath(...values) {
  const joined = values.filter((value) => value !== "").join("/");
  const absolute = joined.startsWith("/");
  const parts = [];
  for (const part of joined.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length && parts.at(-1) !== "..") parts.pop();
      else if (!absolute) parts.push("..");
    }
    else parts.push(part);
  }
  return `${absolute ? "/" : ""}${parts.join("/")}` || (absolute ? "/" : ".");
}
function resolvePath(...values) {
  let resolved = "";
  for (let index = values.length - 1; index >= -1; index--) {
    const value = index >= 0 ? String(values[index]) : Dolly.cwd();
    if (!value) continue;
    resolved = `${value}/${resolved}`;
    if (value.startsWith("/")) break;
  }
  return normalizePath(resolved);
}
function pathToFileURL(path) {
  if (typeof path !== "string") throw new TypeError("file path must be a string");
  let resolved = resolvePath(path);
  if (path.endsWith("/") && !resolved.endsWith("/")) resolved += "/";
  return new URL(`file://${resolved.split("/").map(encodeURIComponent).join("/")}`);
}
function fileURLToPath(value) {
  const url = value instanceof URL ? value : new URL(value);
  if (url.protocol !== "file:" || (url.hostname && url.hostname !== "localhost") ||
      url.username || url.password || url.port || !url.pathname.startsWith("/") ||
      /%2f/i.test(url.pathname)) throw new TypeError("unsupported file URL");
  return decodeURIComponent(url.pathname);
}
function dirname(path) {
  path = normalizePath(String(path));
  if (path === "/") return "/";
  const index = path.lastIndexOf("/");
  return index < 0 ? "." : index === 0 ? "/" : path.slice(0, index);
}
function basename(path, suffix = "") {
  const value = normalizePath(String(path)).split("/").at(-1) ?? "";
  return suffix && value.endsWith(suffix) ? value.slice(0, -suffix.length) : value;
}
function extname(path) {
  const name = basename(path);
  const index = name.lastIndexOf(".");
  return index <= 0 ? "" : name.slice(index);
}
function relative(from, to) {
  const left = resolvePath(from).split("/").filter(Boolean);
  const right = resolvePath(to).split("/").filter(Boolean);
  while (left.length && right.length && left[0] === right[0]) { left.shift(); right.shift(); }
  return [...left.map(() => ".."), ...right].join("/") || "";
}
const janisPath = {
  sep: "/",
  delimiter: ":",
  normalize: normalizePath,
  resolve: resolvePath,
  join: (...values) => normalizePath(...values.map(String)),
  dirname,
  basename,
  extname,
  relative,
  isAbsolute: (path) => String(path).startsWith("/"),
  parse(path) {
    const dir = dirname(path); const base = basename(path); const ext = extname(path);
    return { root: String(path).startsWith("/") ? "/" : "", dir, base, ext, name: ext ? base.slice(0, -ext.length) : base };
  },
  format(parts) {
    const directory = parts.dir || parts.root || "";
    const base = parts.base || `${parts.name ?? ""}${parts.ext ?? ""}`;
    return directory === "/" ? `/${base}` : directory ? `${directory}/${base}` : base;
  },
  toNamespacedPath: (path) => path,
};
janisPath.posix = janisPath;
janisPath.win32 = janisPath;

class JanisStats {
  constructor(native) { Object.assign(this, native); }
  isFile() { return this.kind === "file"; }
  isDirectory() { return this.kind === "directory"; }
  isSymbolicLink() { return this.kind === "symlink"; }
  isBlockDevice() { return false; }
  isCharacterDevice() { return false; }
  isFIFO() { return false; }
  isSocket() { return false; }
  get mtime() { return new Date(this.mtimeMs); }
  get ctime() { return this.mtime; }
  get birthtime() { return this.mtime; }
}
class JanisDirent extends JanisStats {
  constructor(name, native) { super(native); this.name = name; this.parentPath = ""; this.path = ""; }
}
// Native Dolly filesystem errors carry errno code and syscall; add the path.
function fsNative(path, operation) {
  try { return operation(); }
  catch (error) { error.path ??= String(path); throw error; }
}
function fsStat(path) {
  return new JanisStats(fsNative(path, () => Dolly.fsStat(String(path))));
}
function fsLstat(path) {
  return new JanisStats(fsNative(path, () => Dolly.fsLstat(String(path))));
}
function fsFstat(descriptor) {
  return new JanisStats(Dolly.fsFstat(fsDescriptor(descriptor)));
}
function fsExists(path) { try { Dolly.fsAccess(String(path)); return true; } catch { return false; } }
function isFile(path) { try { return fsStat(path).isFile(); } catch { return false; } }
function fsMkdir(path, options = {}) {
  path = resolvePath(path);
  if (!(options === true || options?.recursive)) return void fsNative(path, () => Dolly.fsMkdir(path));
  let current = "";
  for (const part of path.split("/").filter(Boolean)) {
    current += `/${part}`;
    try { fsNative(current, () => Dolly.fsMkdir(current)); }
    catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (!fsStat(current).isDirectory())
        throw Object.assign(new Error(`not a directory: ${current}`), { code: "ENOTDIR", path: current, syscall: "mkdir" });
    }
  }
}
function fsMkdtemp(prefix) {
  for (;;) {
    const path = `${prefix}${Math.random().toString(36).slice(2, 8).padEnd(6, "0")}`;
    try { fsNative(path, () => Dolly.fsMkdir(path)); return path; }
    catch (error) { if (error.code !== "EEXIST") throw error; }
  }
}
function fsRead(path, options = undefined) {
  const bytes = withFile(path, options?.flag ?? "r", (fd) => {
    const chunks = [];
    const block = Buffer.alloc(65536);
    for (;;) {
      const count = readSync(fd, block, 0, block.length);
      if (!count) return Buffer.concat(chunks);
      chunks.push(Buffer.from(block.subarray(0, count)));
    }
  });
  const encoding = typeof options === "string" ? options : options?.encoding;
  return encoding ? bytes.toString(encoding) : bytes;
}
function fsWrite(path, data, options = undefined) {
  const encoding = typeof options === "string" ? options : options?.encoding ?? "utf8";
  const bytes = ArrayBuffer.isView(data) ? fsBytes(data) : Buffer.from(String(data), encoding);
  withFile(path, options?.flag ?? "w", (fd) => {
    for (let offset = 0; offset < bytes.length;) {
      const count = writeSync(fd, bytes, offset, bytes.length - offset);
      if (!count) throw Object.assign(new Error("write made no progress"), { code: "EIO" });
      offset += count;
    }
  });
}
function fsAppend(path, data, options = undefined) {
  fsWrite(path, data, typeof options === "string"
    ? { encoding: options, flag: "a" } : { flag: "a", ...options });
}
function withFile(path, flags, operation) {
  if (typeof path === "number") return operation(fsDescriptor(path));
  const fd = openSync(path, flags);
  try { return operation(fd); } finally { closeSync(fd); }
}
function fsReaddir(path, options = undefined) {
  const names = fsNative(path, () => Dolly.fsReaddir(String(path)));
  if (!options?.withFileTypes) return names;
  return names.map((name) => Object.assign(new JanisDirent(name, fsLstat(janisPath.join(path, name))), {
    parentPath: String(path), path: String(path),
  }));
}
function fsRemove(path, options = {}) {
  path = String(path);
  let metadata;
  try { metadata = fsLstat(path); }
  catch (error) {
    if (options?.force && error.code === "ENOENT") return;
    throw error;
  }
  if (metadata.isDirectory()) {
    if (options?.recursive) for (const name of fsReaddir(path)) fsRemove(janisPath.join(path, name), options);
    fsNative(path, () => Dolly.fsRmdir(path));
  } else fsNative(path, () => Dolly.fsUnlink(path));
}
function fsRealpath(path) {
  return fsNative(path, () => Dolly.realpath(String(path)));
}

function janisGlobSegment(pattern, value) {
  if (value.startsWith(".") && !pattern.startsWith(".")) return false;
  let source = "^";
  for (let index = 0; index < pattern.length; index++) {
    const character = pattern[index];
    if (character === "*") source += ".*";
    else if (character === "?") source += ".";
    else if (character === "[") {
      const close = pattern.indexOf("]", index + 1);
      if (close < 0) source += "\\[";
      else {
        let body = pattern.slice(index + 1, close);
        if (body.startsWith("!")) body = `^${body.slice(1)}`;
        else if (body.startsWith("^")) body = `\\${body}`;
        source += `[${body.replaceAll("\\", "\\\\")}]`;
        index = close;
      }
    }
    else source += character.replace(/[\\^$.*+?(){}|]/g, "\\$&");
  }
  return new RegExp(`${source}$`, "u").test(value);
}

function janisGlobMatches(pattern, path) {
  const patternParts = pattern.split("/").filter((part) => part !== "");
  const pathParts = path.split("/").filter((part) => part !== "");
  const memo = new Map();
  const visit = (patternIndex, pathIndex) => {
    const key = `${patternIndex}:${pathIndex}`;
    if (memo.has(key)) return memo.get(key);
    let matched;
    if (patternIndex === patternParts.length) matched = pathIndex === pathParts.length;
    else if (patternParts[patternIndex] === "**") {
      while (patternParts[patternIndex + 1] === "**") patternIndex++;
      matched = visit(patternIndex + 1, pathIndex) ||
        (pathIndex < pathParts.length && !pathParts[pathIndex].startsWith(".") &&
          visit(patternIndex, pathIndex + 1));
    }
    else matched = pathIndex < pathParts.length &&
      janisGlobSegment(patternParts[patternIndex], pathParts[pathIndex]) &&
      visit(patternIndex + 1, pathIndex + 1);
    memo.set(key, matched);
    return matched;
  };
  return visit(0, 0);
}

function janisGlobWalk(root) {
  const entries = [];
  const walk = (directory, relativeDirectory) => {
    for (const name of fsReaddir(directory).sort()) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${name}` : name;
      const absolutePath = janisPath.join(directory, name);
      const metadata = fsLstat(absolutePath);
      entries.push({ relativePath, absolutePath, metadata });
      // Do not traverse symbolic links: glob walks must remain cycle-free.
      if (metadata.isDirectory()) walk(absolutePath, relativePath);
    }
  };
  walk(root, "");
  return entries;
}

function fsGlobSync(pattern, options = {}) {
  if (options.followSymlinks) {
    throw Object.assign(new Error("Janis glob does not follow symbolic links"), {
      code: "ERR_METHOD_NOT_IMPLEMENTED",
    });
  }
  const cwdValue = options.cwd instanceof URL
    ? decodeURIComponent(options.cwd.pathname)
    : options.cwd ?? Dolly.cwd();
  const cwd = resolvePath(String(cwdValue));
  const patterns = (Array.isArray(pattern) ? pattern : [pattern]).map(String);
  const found = new Map();
  for (let candidatePattern of patterns) {
    const absolute = candidatePattern.startsWith("/");
    while (candidatePattern.startsWith("./")) candidatePattern = candidatePattern.slice(2);
    const root = absolute ? "/" : cwd;
    const matchPattern = absolute ? candidatePattern.slice(1) : candidatePattern;
    for (const entry of janisGlobWalk(root)) {
      if (!janisGlobMatches(matchPattern, entry.relativePath)) continue;
      const value = absolute ? entry.absolutePath : entry.relativePath;
      found.set(value, entry);
    }
  }

  const excluded = options.exclude;
  const excludePatterns = Array.isArray(excluded) ? excluded.map(String) : [];
  return [...found.entries()].sort(([left], [right]) => left.localeCompare(right))
    .filter(([value, entry]) => {
      const visible = options.withFileTypes
        ? Object.assign(new JanisDirent(basename(value), entry.metadata), {
            parentPath: dirname(entry.absolutePath), path: dirname(entry.absolutePath),
          })
        : value;
      if (typeof excluded === "function" && excluded(visible)) return false;
      return !excludePatterns.some((excludedPattern) =>
        janisGlobMatches(excludedPattern, value));
    })
    .map(([value, entry]) => options.withFileTypes
      ? Object.assign(new JanisDirent(basename(value), entry.metadata), {
          parentPath: dirname(entry.absolutePath), path: dirname(entry.absolutePath),
        })
      : value);
}

function callbackResult(operation, callback) {
  queueMicrotask(() => {
    try { callback(null, operation()); } catch (error) { callback(error); }
  });
}
function fsDescriptor(descriptor) {
  if (!Number.isInteger(descriptor) || descriptor < 0 || descriptor > 0x7fffffff) {
    throw Object.assign(new Error("invalid file descriptor"), { code: "EBADF" });
  }
  return descriptor;
}
function fsBytes(buffer) {
  if (!ArrayBuffer.isView(buffer)) throw new TypeError("file I/O requires an ArrayBuffer view");
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}
function fsIndex(value, name, limit = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 0 || value > limit) {
    throw Object.assign(new RangeError(`${name} is out of range`), { code: "ERR_OUT_OF_RANGE" });
  }
  return value;
}
function fsMode(mode) {
  const value = typeof mode === "string" && /^[0-7]+$/.test(mode) ? Number.parseInt(mode, 8) : mode;
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff)
    throw Object.assign(new TypeError("mode must be an unsigned integer or an octal string"), { code: "ERR_INVALID_ARG_VALUE" });
  return value;
}
function fsCopyFile(from, to, mode = 0) {
  const { COPYFILE_EXCL, COPYFILE_FICLONE_FORCE } = janisFs.constants;
  if (fsIndex(mode, "mode", 7) & COPYFILE_FICLONE_FORCE)
    throw Object.assign(new Error("Dolly files cannot be cloned copy-on-write"), { code: "ENOTSUP", syscall: "copyfile" });
  fsWrite(to, fsRead(from), { flag: mode & COPYFILE_EXCL ? "wx" : "w" });
}
function openSync(path, flags = "r") {
  if (typeof flags === "string") {
    const c = Dolly.fsConstants;
    const modes = {
      r: c.O_RDONLY, "r+": c.O_RDWR,
      rs: c.O_RDONLY | c.O_SYNC, "rs+": c.O_RDWR | c.O_SYNC,
      w: c.O_WRONLY | c.O_CREAT | c.O_TRUNC, "w+": c.O_RDWR | c.O_CREAT | c.O_TRUNC,
      a: c.O_WRONLY | c.O_CREAT | c.O_APPEND, "a+": c.O_RDWR | c.O_CREAT | c.O_APPEND,
    };
    modes.wx = modes.w | c.O_EXCL; modes["wx+"] = modes["w+"] | c.O_EXCL;
    modes.ax = modes.a | c.O_EXCL; modes["ax+"] = modes["a+"] | c.O_EXCL;
    if (!Object.hasOwn(modes, flags)) throw new TypeError(`unsupported file flags: ${flags}`);
    flags = modes[flags];
  }
  fsIndex(flags, "flags", 0x7fffffff);
  const c = Dolly.fsConstants;
  const supported = c.O_WRONLY | c.O_RDWR | c.O_CREAT | c.O_EXCL | c.O_TRUNC |
    c.O_APPEND | c.O_DIRECTORY | c.O_NOFOLLOW | c.O_SYNC;
  if (flags & ~supported) {
    throw Object.assign(new Error("unsupported file flags"), { code: "ENOTSUP" });
  }
  return fsNative(path, () => Dolly.fsOpen(String(path), flags));
}
function closeSync(descriptor) { return Dolly.fsClose(fsDescriptor(descriptor)); }
function fileIo(writing, descriptor, buffer, offset, length, position) {
  descriptor = fsDescriptor(descriptor);
  const bytes = fsBytes(buffer);
  offset = fsIndex(offset ?? 0, "offset", bytes.length);
  length = fsIndex(length ?? bytes.length - offset, "length", bytes.length - offset);
  if (position != null) fsIndex(position, "position");
  return (writing ? Dolly.fsWrite : Dolly.fsRead)(descriptor, bytes, offset, length, position);
}
function writeSync(descriptor, data, offset, length, position = null) {
  if (typeof data === "string") {
    const bytes = Buffer.from(data, length ?? "utf8");
    return fileIo(true, descriptor, bytes, 0, bytes.length, offset);
  }
  if (offset && typeof offset === "object") ({ offset, length, position } = offset);
  return fileIo(true, descriptor, data, offset, length, position);
}
function readSync(descriptor, buffer, offset, length, position = null) {
  if (offset && typeof offset === "object") ({ offset, length, position } = offset);
  return fileIo(false, descriptor, buffer, offset, length, position);
}

class JanisReadable extends JanisStream {
  readable = true;
  readableEncoding = null;
  #decoder;
  setEncoding(encoding) {
    this.#decoder = new JanisStringDecoder(encoding);
    this.readableEncoding = this.#decoder.encoding;
    return this;
  }
  pipe(destination) { this.on("data", (chunk) => destination.write(chunk)); this.once("end", () => destination.end()); return destination; }
  push(chunk) {
    if (!this.readable) return false;
    if (chunk === null) {
      this.readable = false;
      const tail = this.#decoder?.end();
      if (tail) this.emit("data", tail);
      this.readableEnded = true;
      this.emit("end");
    } else {
      const value = this.#decoder ? this.#decoder.write(chunk) : chunk;
      if (!this.#decoder || value.length) this.emit("data", value);
    }
    return true;
  }
  resume() { return this; }
  pause() { return this; }
  destroy(error) { this.destroyed = true; if (error) this.emit("error", error); this.emit("close"); return this; }
  [Symbol.asyncIterator]() {
    const chunks = []; let done = false; let wake;
    this.on("data", (chunk) => { chunks.push(chunk); wake?.(); });
    this.on("end", () => { done = true; wake?.(); });
    return { next: async () => { while (!chunks.length && !done) await new Promise((resolve) => { wake = resolve; }); return chunks.length ? { value: chunks.shift(), done: false } : { done: true }; } };
  }
  static from(value) {
    const stream = new JanisReadable();
    queueMicrotask(async () => { for await (const chunk of value) stream.push(chunk); stream.push(null); });
    return stream;
  }
}
const endArguments = (chunk, encoding, callback) => typeof chunk === "function" ? [undefined, undefined, chunk]
  : typeof encoding === "function" ? [chunk, undefined, encoding] : [chunk, encoding, callback];
// A failed write destroys the stream with its error, as in Node.
function streamWrite(stream, chunk, encoding, callback) {
  if (typeof encoding === "function") [encoding, callback] = [undefined, encoding];
  const done = error => { if (error) stream.destroy(error); callback?.(error); };
  if (stream._write) stream._write(chunk, encoding, done);
  else done();
  return true;
}
class JanisWritable extends JanisStream {
  writable = true;
  writableLength = 0;
  constructor(options = {}) { super(); if (options.write) this._write = options.write; }
  write(chunk, encoding, callback) { return streamWrite(this, chunk, encoding, callback); }
  end(chunk, encoding, callback) {
    [chunk, encoding, callback] = endArguments(chunk, encoding, callback);
    if (chunk !== undefined) this.write(chunk, encoding);
    callback?.();
    this.writableFinished = true;
    this.emit("finish");
  }
  destroy(error) { this.destroyed = true; if (error) this.emit("error", error); this.emit("close"); return this; }
}
class JanisDuplex extends JanisReadable {
  write(chunk, encoding, callback) { return streamWrite(this, chunk, encoding, callback); }
  end(chunk, encoding, callback) {
    [chunk, encoding, callback] = endArguments(chunk, encoding, callback);
    if (chunk !== undefined) this.write(chunk, encoding);
    const finish = () => { callback?.(); this.writableFinished = true; this.emit("finish"); this.push(null); };
    if (!this._flush) return finish();
    this._flush((error, output) => {
      if (error) return void this.destroy(error);
      if (output !== undefined) this.push(output);
      finish();
    });
  }
}
class JanisTransform extends JanisDuplex {
  constructor(options = {}) {
    super();
    if (options.transform) this._transform = options.transform;
    if (options.flush) this._flush = options.flush;
  }
  _write(chunk, encoding, callback) {
    if (this._transform) this._transform(chunk, encoding, (error, output) => { if (output !== undefined) this.push(output); callback(error); });
    else { this.push(chunk); callback(); }
  }
}
class JanisPassThrough extends JanisTransform {}

function createReadStream(path, options = {}) {
  if (typeof options === "string") options = { encoding: options };
  const { start = 0, end = Number.MAX_SAFE_INTEGER } = options;
  fsIndex(end, "end");
  fsIndex(start, "start", end);
  const stream = new JanisReadable();
  if (options.encoding) stream.setEncoding(options.encoding);
  queueMicrotask(() => {
    try {
      withFile(path, options.flags ?? "r", (fd) => {
        const block = Buffer.alloc(65536);
        for (let position = start, count; position <= end; position += count) {
          count = readSync(fd, block, 0, Math.min(block.length, end - position + 1), position);
          if (!count) break;
          stream.push(Buffer.from(block.subarray(0, count)));
        }
      });
      stream.push(null);
      stream.emit("close");
    } catch (error) { stream.emit("error", error); }
  });
  return stream;
}
function createWriteStream(path, options = {}) {
  if (options.start !== undefined) unsupported("createWriteStream start; open the file and write at a position")();
  const chunks = [];
  const stream = new JanisWritable();
  stream._write = (chunk, _encoding, callback) => { chunks.push(Buffer.from(chunk)); callback(); };
  stream.end = (chunk, encoding, callback) => {
    [chunk, encoding, callback] = endArguments(chunk, encoding, callback);
    if (chunk !== undefined) stream.write(chunk, encoding);
    try { fsWrite(path, Buffer.concat(chunks), { flag: options.flags ?? "w" }); }
    catch (error) { return void stream.destroy(error); }
    callback?.();
    stream.writableFinished = true;
    stream.emit("finish");
    stream.emit("close");
  };
  return stream;
}

// Dolly has no change notification, so fs.watch compares metadata every
// second and fs.watchFile at its interval, both on unreferenced-able timers.
function janisWatchSnapshot(path, recursive) {
  const metadata = fsStat(path);
  if (!metadata.isDirectory()) return new Map([["", `${metadata.mtimeMs}:${metadata.size}`]]);
  const entries = new Map();
  const walk = (directory, prefix) => {
    for (const name of fsReaddir(directory)) {
      let child;
      try { child = fsLstat(janisPath.join(directory, name)); } catch { continue; }
      entries.set(prefix + name, `${child.kind}:${child.mtimeMs}:${child.size}`);
      if (recursive && child.isDirectory()) walk(janisPath.join(directory, name), `${prefix}${name}/`);
    }
  };
  walk(path, "");
  return entries;
}
class JanisFSWatcher extends JanisEventEmitter {
  #timer; #snapshot;
  constructor(path, options, listener) {
    super();
    path = String(path);
    const recursive = Boolean(options.recursive);
    this.#snapshot = fsNative(path, () => janisWatchSnapshot(path, recursive));
    if (listener) this.on("change", listener);
    this.#timer = setInterval(() => {
      let next;
      try { next = janisWatchSnapshot(path, recursive); } catch { next = new Map(); }
      for (const [name, value] of next) {
        const before = this.#snapshot.get(name);
        if (before !== value) this.emit("change", before === undefined ? "rename" : "change", name || basename(path));
      }
      for (const name of this.#snapshot.keys()) if (!next.has(name)) this.emit("change", "rename", name || basename(path));
      this.#snapshot = next;
    }, 1000);
    if (options.persistent === false) this.#timer.unref();
  }
  close() { clearInterval(this.#timer); this.emit("close"); }
  ref() { this.#timer.ref(); return this; }
  unref() { this.#timer.unref(); return this; }
}
const janisStatWatchers = new Map();
function janisWatchFile(path, options, listener) {
  if (typeof options === "function") [options, listener] = [{}, options];
  path = String(path);
  const current = () => { try { return fsStat(path); } catch { return new JanisStats({ size: 0, mode: 0, mtimeMs: 0, kind: "other" }); } };
  let watcher = janisStatWatchers.get(path);
  if (!watcher) {
    watcher = new JanisEventEmitter();
    let previous = current();
    const timer = setInterval(() => {
      const next = current();
      if (next.mtimeMs === previous.mtimeMs && next.size === previous.size && next.kind === previous.kind) return;
      [previous, next.previous] = [next, previous];
      watcher.emit("change", next, next.previous);
    }, options?.interval ?? 5007);
    if (options?.persistent === false) timer.unref();
    Object.assign(watcher, { timer, ref() { timer.ref(); return this; }, unref() { timer.unref(); return this; } });
    janisStatWatchers.set(path, watcher);
  }
  watcher.on("change", listener);
  return watcher;
}
function janisUnwatchFile(path, listener) {
  const watcher = janisStatWatchers.get(String(path));
  if (!watcher) return;
  if (listener) watcher.off("change", listener);
  else watcher.removeAllListeners("change");
  if (watcher.listenerCount("change")) return;
  clearInterval(watcher.timer);
  janisStatWatchers.delete(String(path));
}

const janisFs = {
  constants: { ...Dolly.fsConstants, F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1,
    COPYFILE_EXCL: 1, COPYFILE_FICLONE: 2, COPYFILE_FICLONE_FORCE: 4 },
  Stats: JanisStats,
  Dirent: JanisDirent,
  existsSync: fsExists,
  statSync: fsStat,
  lstatSync: fsLstat,
  fstatSync: fsFstat,
  readFileSync: fsRead,
  writeFileSync: fsWrite,
  appendFileSync: fsAppend,
  mkdirSync: fsMkdir,
  readdirSync: fsReaddir,
  globSync: fsGlobSync,
  glob(pattern, options, callback) {
    if (typeof options === "function") { callback = options; options = {}; }
    callbackResult(() => fsGlobSync(pattern, options), callback);
  },
  unlinkSync: (path) => fsNative(path, () => Dolly.fsUnlink(String(path))),
  rmdirSync: (path, options) => {
    if (options?.recursive) unsupported("the deprecated fs.rmdir recursive option; use fs.rm")();
    fsNative(path, () => Dolly.fsRmdir(String(path)));
  },
  rmSync: fsRemove,
  renameSync: (from, to) => Dolly.fsRename(String(from), String(to)),
  copyFileSync: fsCopyFile,
  realpathSync: fsRealpath,
  accessSync: (path, mode = 0) => fsNative(path, () => Dolly.fsAccess(String(path), fsIndex(mode ?? 0, "mode", 7))),
  utimesSync: (path, atime, mtime) => fsNative(path, () => Dolly.fsUtimes(
    String(path), atime instanceof Date ? atime.getTime() / 1000 : Number(atime),
    mtime instanceof Date ? mtime.getTime() / 1000 : Number(mtime))),
  chmodSync: (path, mode) => fsNative(path, () => Dolly.fsChmod(String(path), fsMode(mode))),
  symlinkSync: (target, path) => Dolly.fsSymlink(String(target), String(path)),
  linkSync: (existing, path) => Dolly.fsLink(String(existing), String(path)),
  readlinkSync: (path) => Dolly.fsReadlink(String(path)),
  truncateSync: (path, length = 0) => typeof path === "number"
    ? Dolly.fsFtruncate(fsDescriptor(path), fsIndex(length, "length")) : Dolly.fsTruncate(String(path), fsIndex(length, "length")),
  ftruncateSync: (descriptor, length = 0) => Dolly.fsFtruncate(fsDescriptor(descriptor), fsIndex(length, "length")),
  fsyncSync: (descriptor) => Dolly.fsFsync(fsDescriptor(descriptor)),
  openSync,
  closeSync,
  readSync,
  writeSync,
  createReadStream,
  createWriteStream,
  mkdtempSync: fsMkdtemp,
  watch: (path, options, listener) => {
    if (typeof options === "function") [options, listener] = [{}, options];
    return new JanisFSWatcher(path, typeof options === "string" ? {} : options ?? {}, listener);
  },
  watchFile: janisWatchFile,
  unwatchFile: janisUnwatchFile,
};

const janisFsPromises = {
  open: async (path, flags) => {
    let fd = openSync(path, flags);
    const current = () => fsDescriptor(fd);
    return {
      get fd() { return fd; },
      read: async (buffer, offset, length, position) => ({ bytesRead: readSync(current(), buffer, offset, length, position), buffer }),
      write: async (buffer, offset, length, position) => ({ bytesWritten: writeSync(current(), buffer, offset, length, position), buffer }),
      readFile: async (options) => fsRead(current(), options),
      writeFile: async (data, options) => fsWrite(current(), data, options),
      appendFile: async (data, options) => fsAppend(current(), data, options),
      close: async () => { if (fd !== -1) { closeSync(fd); fd = -1; } },
      stat: async () => fsFstat(current()),
      truncate: async (length) => janisFs.ftruncateSync(current(), length),
      sync: async () => janisFs.fsyncSync(current()),
      datasync: async () => janisFs.fsyncSync(current()),
    };
  },
};
for (const name of ["access", "stat", "lstat", "fstat", "readFile", "writeFile", "appendFile", "mkdir",
  "readdir", "unlink", "rmdir", "rm", "rename", "copyFile", "realpath", "utimes", "mkdtemp", "chmod",
  "symlink", "link", "readlink", "truncate"]) {
  const sync = janisFs[`${name}Sync`];
  janisFsPromises[name] = async (...args) => sync(...args);
  janisFs[name] = (...args) => {
    const callback = typeof args.at(-1) === "function" ? args.pop() : undefined;
    if (!callback) return janisFsPromises[name](...args);
    callbackResult(() => sync(...args), callback);
  };
}
janisFsPromises.constants = janisFs.constants;
janisFs.promises = janisFsPromises;
janisFs.fsync = (descriptor, callback) => callbackResult(() => janisFs.fsyncSync(descriptor), callback);
janisFs.ftruncate = (descriptor, length, callback) => {
  if (typeof length === "function") [length, callback] = [0, length];
  callbackResult(() => janisFs.ftruncateSync(descriptor, length), callback);
};

const janisChildren = new Map();
const childSignals = { SIGINT: 2, SIGKILL: 9, SIGTERM: 15 };
function unsupportedChild(message) { return Object.assign(new Error(message), { code: "ENOTSUP" }); }
function childSignal(signal = "SIGTERM") {
  const number = typeof signal === "string" ? childSignals[signal] : signal;
  if (![0, 2, 9, 15].includes(number)) throw unsupportedChild("Dolly supports signal 0, SIGINT, SIGKILL and SIGTERM");
  return number;
}
function abortError(reason) {
  return Object.assign(new Error("The operation was aborted", { cause: reason }), { name: "AbortError", code: "ABORT_ERR" });
}
function childString(value) {
  const text = String(value);
  if (text.includes("\0")) throw new TypeError("process strings cannot contain NUL");
  return text;
}
function childOptions(command, args, options) {
  if (options.detached || options.uid !== undefined || options.gid !== undefined ||
      options.serialization !== undefined || options.windowsVerbatimArguments)
    throw unsupportedChild("Dolly does not support detached processes, identities or IPC");
  if (options.timeout !== undefined && (!Number.isInteger(options.timeout) || options.timeout < 0 || options.timeout > 86400000))
    throw new RangeError("child timeout is out of range");
  if (options.maxBuffer !== undefined && (!Number.isSafeInteger(options.maxBuffer) || options.maxBuffer < 0))
    throw new RangeError("maxBuffer must be a nonnegative integer");
  const killSignal = childSignal(options.killSignal);
  if (killSignal === 0) throw unsupportedChild("a child kill signal must terminate");
  let stdio = options.stdio ?? "pipe";
  if (typeof stdio === "string") stdio = [stdio, stdio, stdio];
  if (!Array.isArray(stdio) || stdio.length > 3) throw unsupportedChild("Dolly only inherits stdin, stdout and stderr");
  stdio = [0, 1, 2].map(index => stdio[index] ?? "pipe");
  if (stdio.some(value => !["pipe", "ignore", "inherit"].includes(value) &&
      !(Number.isInteger(value) && value >= 0) && !(Number.isInteger(value?.fd) && value.fd >= 0)))
    throw unsupportedChild("unsupported child stdio");
  const cwd = resolvePath(childString(options.cwd ?? Dolly.cwd()));
  const env = Object.entries(options.env ?? process.env).filter(([, value]) => value !== undefined)
    .map(([key, value]) => {
      if (!key || key.includes("=")) throw new TypeError("invalid environment name");
      return childString(key) + "=" + childString(value);
    });
  const environment = Object.fromEntries(env.map(entry => { const index = entry.indexOf("="); return [entry.slice(0, index), entry.slice(index + 1)]; }));
  let path = childString(command);
  let argv = [childString(options.argv0 ?? path), ...args.map(childString)];
  if (options.shell) {
    const text = [path, ...args.map(childString)].join(" ");
    path = typeof options.shell === "string" ? childString(options.shell) : "/bin/slop";
    argv = [path, "-c", text];
  }
  if (!path.includes("/")) {
    path = (environment.PATH ?? "/bin:/usr/bin").split(":")
      .map(directory => janisPath.resolve(cwd, directory, path)).find(candidate => {
        try { return fsStat(candidate).isFile(); } catch (error) { if (error.code === "ENOENT" || error.code === "ENOTDIR") return false; throw error; }
      });
    if (!path) throw Object.assign(new Error(`executable not found: ${command}`), { code: "ENOENT", path: String(command), syscall: "spawn" });
  } else path = janisPath.resolve(cwd, path);
  return { path, argv, env, cwd, stdio, killSignal };
}
function closeChildFd(record, index) {
  if (record.fds[index] !== null) Dolly.fsClose(record.fds[index]);
  record.fds[index] = null;
}
function childInput(record) {
  const stream = new JanisWritable();
  stream.write = (chunk, encoding, callback) => {
    if (typeof encoding === "function") { callback = encoding; encoding = undefined; }
    if (record.inputEnded || record.fds[0] === null) {
      const error = Object.assign(new Error("child stdin is closed"), { code: "EPIPE" });
      queueMicrotask(() => { callback?.(error); stream.emit("error", error); });
      return false;
    }
    const bytes = Buffer.from(chunk, encoding);
    if (bytes.length === 0) { queueMicrotask(() => callback?.()); return true; }
    record.input.push({ bytes, offset: 0, callback });
    stream.writableLength += bytes.length;
    return stream.writableLength < 65536;
  };
  stream.end = (chunk, encoding, callback) => {
    if (typeof chunk === "function") { callback = chunk; chunk = undefined; }
    if (typeof encoding === "function") { callback = encoding; encoding = undefined; }
    if (chunk !== undefined) stream.write(chunk, encoding);
    if (callback) stream.once("finish", callback);
    record.inputEnded = true;
    stream.writable = false;
    return stream;
  };
  stream.destroy = error => {
    closeChildFd(record, 0);
    record.input.length = 0;
    stream.writableLength = 0;
    stream.writable = false;
    if (error) stream.emit("error", error);
    stream.emit("close");
    return stream;
  };
  return stream;
}
function childOutput(record, index) {
  const stream = new JanisReadable();
  stream.pause = () => { record.paused[index] = true; return stream; };
  stream.resume = () => { record.paused[index] = false; return stream; };
  stream.destroy = error => {
    closeChildFd(record, index);
    stream.readable = false;
    if (error) stream.emit("error", error);
    stream.emit("close");
    return stream;
  };
  return stream;
}
class JanisChildProcess extends JanisEventEmitter {}
function spawn(command, args = [], options = {}) {
  if (!Array.isArray(args)) { options = args ?? {}; args = []; }
  // Invalid arguments throw; unavailable process facilities and executables
  // fail through the ChildProcess error event without starting a child.
  let config, startError;
  try { config = childOptions(command, args, options); }
  catch (error) { if (error.code !== "ENOENT" && error.code !== "ENOTSUP") throw error; startError = error; }
  const child = new JanisChildProcess();
  const record = { child, fds: [null, null, null], paused: [false, false, false], input: [], inputEnded: false, waited: false,
    closed: false, pumping: false, ref: true, timer: null, abort: null, signal: options.signal };
  child.pid = undefined;
  child.exitCode = null;
  child.signalCode = null;
  child.killed = false;
  child.stdin = child.stdout = child.stderr = null;
  child.kill = (signal = "SIGTERM") => {
    const number = childSignal(signal);
    if (!child.pid || record.waited || record.closed) return false;
    try { Dolly.processKill(child.pid, number); }
    catch (error) { if (error.code === "ESRCH") return false; throw error; }
    if (number !== 0) child.killed = true;
    return true;
  };
  child.ref = () => { record.ref = true; return child; };
  child.unref = () => { record.ref = false; return child; };
  const owned = [];
  try {
    if (startError) throw startError;
    const descriptors = config.stdio.map((mode, index) => {
      if (mode === "inherit") return index;
      if (mode === "pipe") {
        const pair = Dolly.fsPipe();
        owned.push(...pair);
        record.fds[index] = pair[index === 0 ? 1 : 0];
        return pair[index === 0 ? 0 : 1];
      }
      if (mode === "ignore") {
        const descriptor = Dolly.fsOpen("/dev/null", index === 0 ? Dolly.fsConstants.O_RDONLY : Dolly.fsConstants.O_WRONLY);
        owned.push(descriptor);
        return descriptor;
      }
      return typeof mode === "number" ? mode : mode.fd;
    });
    child.pid = Dolly.processSpawn(config.path, config.argv, config.env, config.cwd, descriptors, -1);
    child.spawnfile = config.path;
    child.spawnargs = config.argv;
    for (const descriptor of owned) if (!record.fds.includes(descriptor)) Dolly.fsClose(descriptor);
    owned.length = 0;
    child.stdin = record.fds[0] === null ? null : childInput(record);
    child.stdout = record.fds[1] === null ? null : childOutput(record, 1);
    child.stderr = record.fds[2] === null ? null : childOutput(record, 2);
    janisChildren.set(child, record);
    if (options.timeout > 0) record.timer = setTimeout(() => { record.timedOut = true; child.kill(config.killSignal); }, options.timeout);
    record.abort = () => { if (child.kill(config.killSignal)) child.emit("error", abortError(options.signal.reason)); };
    options.signal?.addEventListener("abort", record.abort);
    queueMicrotask(() => {
      child.emit("spawn");
      if (options.signal?.aborted) record.abort();
    });
  } catch (error) {
    for (const descriptor of owned) Dolly.fsClose(descriptor);
    record.closed = true;
    queueMicrotask(() => { child.emit("error", error); child.emit("close", null, null); });
  }
  child.stdio = [child.stdin, child.stdout, child.stderr];
  return child;
}
function pumpChildren() {
  let completed = false;
  for (const record of [...janisChildren.values()]) {
    if (record.pumping || record.closed) continue;
    record.pumping = true;
    const { child } = record;
    try {
      const queries = record.fds.map((fd, index) => [fd ?? -1, index === 0 ? Dolly.fsConstants.POLLOUT : Dolly.fsConstants.POLLIN]);
      const ready = Dolly.fsPoll(queries, 0);
      for (const index of [1, 2]) {
        if (record.fds[index] === null || !ready[index] || record.paused[index] ||
            (!record.waited && child.stdio[index].listenerCount("data") === 0)) continue;
        const bytes = Buffer.alloc(16384);
        const count = Dolly.fsRead(record.fds[index], bytes, 0, bytes.length);
        if (count) child.stdio[index].push(bytes.subarray(0, count));
        else { closeChildFd(record, index); child.stdio[index].push(null); }
      }
      if (record.fds[0] !== null) {
        if (ready[0] & (Dolly.fsConstants.POLLERR | Dolly.fsConstants.POLLHUP)) {
          const error = record.input.length ? Object.assign(new Error("child closed stdin"), { code: "EPIPE" }) : undefined;
          child.stdin.destroy(error);
        } else if (record.input.length && ready[0]) {
          const entry = record.input[0];
          const count = Dolly.fsWrite(record.fds[0], entry.bytes, entry.offset, Math.min(16384, entry.bytes.length - entry.offset));
          entry.offset += count;
          child.stdin.writableLength -= count;
          if (entry.offset === entry.bytes.length) { record.input.shift(); entry.callback?.(); }
          if (!record.input.length) child.stdin.emit("drain");
        }
        if (record.fds[0] !== null && record.inputEnded && !record.input.length) {
          closeChildFd(record, 0);
          child.stdin.emit("finish");
          child.stdin.emit("close");
        }
      }
      if (!record.waited) {
        const result = Dolly.processWait(child.pid);
        if (result !== null) {
          record.waited = true;
          child.exitCode = result.status;
          child.signalCode = Object.keys(childSignals).find(name => childSignals[name] === result.signal) ?? null;
          clearTimeout(record.timer);
          record.signal?.removeEventListener("abort", record.abort);
          if (record.fds[0] !== null) child.stdin.destroy();
          child.emit("exit", child.exitCode, child.signalCode);
        }
      }
      if (record.waited && record.fds.every(fd => fd === null)) {
        completed = true;
        record.closed = true;
        janisChildren.delete(child);
        child.emit("close", child.exitCode, child.signalCode);
      }
    } finally { record.pumping = false; }
  }
  return completed;
}
function spawnSync(command, args = [], options = {}) {
  if (!Array.isArray(args)) { options = args ?? {}; args = []; }
  const child = spawn(command, args, options);
  const record = janisChildren.get(child);
  let closed = false, error;
  const chunks = [[], []];
  const lengths = [0, 0];
  const maxBuffer = options.maxBuffer ?? 1024 * 1024;
  child.on("error", value => { error = value; });
  child.once("close", () => { closed = true; });
  for (const [index, stream] of [[0, child.stdout], [1, child.stderr]]) {
    stream?.on("data", bytes => {
      lengths[index] += bytes.length;
      if (lengths[index] > maxBuffer) {
        error = Object.assign(new Error("child output exceeded maxBuffer"), { code: "ENOBUFS" });
        child.kill("SIGKILL");
      } else chunks[index].push(Buffer.from(bytes));
    });
  }
  child.stdin?.end(options.input ?? Buffer.alloc(0));
  try {
    while (!closed) {
      Dolly.pumpJobs();
      if (!closed) globalThis.__janisPump();
    }
  } catch (failure) {
    child.kill("SIGKILL");
    child.stdout?.removeAllListeners("data");
    child.stderr?.removeAllListeners("data");
    while (!closed) { pumpChildren(); if (!closed) Dolly.fsPoll([], 1); }
    throw failure;
  }
  const output = chunks.map(parts => Buffer.concat(parts));
  if (record?.timedOut && !error) error = Object.assign(new Error("child timed out"), { code: "ETIMEDOUT" });
  const decode = bytes => options.encoding && options.encoding !== "buffer" ? bytes.toString(options.encoding) : bytes;
  return { pid: child.pid, status: child.exitCode, signal: child.signalCode, error,
    stdout: decode(output[0]), stderr: decode(output[1]), output: [null, ...output.map(decode)] };
}
function execFileSync(command, args, options = {}) {
  if (!Array.isArray(args)) { options = args ?? {}; args = []; }
  const result = spawnSync(command, args, options);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw Object.assign(new Error(String(result.stderr) || `command exited ${result.status ?? result.signal}`),
      { status: result.status, signal: result.signal, stdout: result.stdout, stderr: result.stderr });
  }
  return result.stdout;
}
function execResult(child, options, callback) {
  const buffers = [[], []], lengths = [0, 0];
  const maximum = options.maxBuffer ?? 1024 * 1024;
  let failure;
  for (const [index, stream] of [[0, child.stdout], [1, child.stderr]]) {
    stream?.on("data", chunk => {
      const bytes = Buffer.from(chunk);
      lengths[index] += bytes.length;
      if (lengths[index] <= maximum) buffers[index].push(bytes);
      else if (!failure) {
        failure = Object.assign(new Error("child output exceeded maxBuffer"), { code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" });
        child.kill(options.killSignal);
      }
    });
  }
  child.once("error", error => { failure = error; });
  child.once("close", (status, signal) => {
    const output = buffers.map(parts => {
      const bytes = Buffer.concat(parts);
      return options.encoding === "buffer" ? bytes : bytes.toString(options.encoding ?? "utf8");
    });
    if (!failure && (status !== 0 || signal !== null))
      failure = Object.assign(new Error("command exited " + (signal ?? status)), { code: status, signal, killed: child.killed });
    if (failure) Object.assign(failure, { stdout: output[0], stderr: output[1] });
    callback?.(failure ?? null, ...output);
  });
  child.stdin?.end();
  return child;
}
function exec(command, options, callback) {
  if (typeof options === "function") { callback = options; options = {}; }
  options ??= {};
  return execResult(spawn(command, [], { ...options, shell: options.shell ?? true }), options, callback);
}
function execFile(command, args, options, callback) {
  if (typeof args === "function") {
    callback = args; args = []; options = {};
  } else if (!Array.isArray(args)) {
    if (typeof options === "function") callback = options;
    options = args ?? {}; args = [];
  } else if (typeof options === "function") {
    callback = options; options = {};
  }
  options ??= {};
  return execResult(spawn(command, args, options), options, callback);
}
const janisChildProcess = {
  ChildProcess: JanisChildProcess,
  spawn,
  spawnSync,
  exec,
  execSync: (command, options = {}) => execFileSync(command, [], { ...options, shell: true }),
  execFile,
  execFileSync,
};

function rotateRight(value, count) {
  return value >>> count | value << 32 - count;
}

function sha256(input) {
  const bytes = Buffer.from(input);
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = Buffer.alloc(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const bitLength = BigInt(bytes.length) * 8n;
  for (let index = 0; index < 8; index++)
    padded[paddedLength - 1 - index] = Number(bitLength >> BigInt(index * 8) & 0xffn);

  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const state = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const words = new Uint32Array(64);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index++) {
      const at = offset + index * 4;
      words[index] = (padded[at] << 24 | padded[at + 1] << 16 |
        padded[at + 2] << 8 | padded[at + 3]) >>> 0;
    }
    for (let index = 16; index < 64; index++) {
      const s0 = rotateRight(words[index - 15], 7) ^
        rotateRight(words[index - 15], 18) ^ words[index - 15] >>> 3;
      const s1 = rotateRight(words[index - 2], 17) ^
        rotateRight(words[index - 2], 19) ^ words[index - 2] >>> 10;
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index++) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = e & f ^ ~e & g;
      const first = (h + sum1 + choice + constants[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = a & b ^ a & c ^ b & c;
      const second = (sum0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + first) >>> 0;
      d = c; c = b; b = a; a = (first + second) >>> 0;
    }
    [a, b, c, d, e, f, g, h].forEach((value, index) => {
      state[index] = (state[index] + value) >>> 0;
    });
  }
  const output = Buffer.alloc(32);
  state.forEach((value, index) => output.writeUInt32BE(value, index * 4));
  return output;
}

function sha1(input) {
  const bytes = Buffer.from(input);
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = Buffer.alloc(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const bitLength = BigInt(bytes.length) * 8n;
  for (let index = 0; index < 8; index++)
    padded[paddedLength - 1 - index] = Number(bitLength >> BigInt(index * 8) & 0xffn);
  const state = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const words = new Uint32Array(80);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index++) words[index] = padded.readUInt32BE(offset + index * 4);
    for (let index = 16; index < 80; index++)
      words[index] = rotateRight(words[index - 3] ^ words[index - 8] ^ words[index - 14] ^ words[index - 16], 31);
    let [a, b, c, d, e] = state;
    for (let index = 0; index < 80; index++) {
      const [mix, constant] = index < 20 ? [b & c | ~b & d, 0x5a827999] : index < 40 ? [b ^ c ^ d, 0x6ed9eba1]
        : index < 60 ? [b & c | b & d | c & d, 0x8f1bbcdc] : [b ^ c ^ d, 0xca62c1d6];
      const next = (rotateRight(a, 27) + mix + e + constant + words[index]) >>> 0;
      e = d; d = c; c = rotateRight(b, 2) >>> 0; b = a; a = next;
    }
    [a, b, c, d, e].forEach((value, index) => { state[index] = (state[index] + value) >>> 0; });
  }
  const output = Buffer.alloc(20);
  state.forEach((value, index) => output.writeUInt32BE(value, index * 4));
  return output;
}

function md5(input) {
  const bytes = Buffer.from(input);
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = Buffer.alloc(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const bitLength = BigInt(bytes.length) * 8n;
  for (let index = 0; index < 8; index++)
    padded[paddedLength - 8 + index] = Number(bitLength >> BigInt(index * 8) & 0xffn);

  const shifts = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const constants = Array.from({ length: 64 }, (_, index) =>
    Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0);
  const state = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  const words = new Uint32Array(16);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index++) {
      const at = offset + index * 4;
      words[index] = (padded[at] | padded[at + 1] << 8 |
        padded[at + 2] << 16 | padded[at + 3] << 24) >>> 0;
    }
    let [a, b, c, d] = state;
    for (let index = 0; index < 64; index++) {
      let value;
      let word;
      if (index < 16) { value = b & c | ~b & d; word = index; }
      else if (index < 32) { value = d & b | ~d & c; word = (5 * index + 1) % 16; }
      else if (index < 48) { value = b ^ c ^ d; word = (3 * index + 5) % 16; }
      else { value = c ^ (b | ~d); word = 7 * index % 16; }
      const sum = (a + value + constants[index] + words[word]) >>> 0;
      const rotated = sum << shifts[index] | sum >>> 32 - shifts[index];
      a = d; d = c; c = b; b = (b + rotated) >>> 0;
    }
    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
  }
  const output = Buffer.alloc(16);
  state.forEach((value, index) => output.writeUInt32LE(value, index * 4));
  return output;
}
function createHash(algorithm) {
  algorithm = String(algorithm).toLowerCase().replaceAll("-", "");
  const digests = { sha256, sha1, md5 };
  if (!Object.hasOwn(digests, algorithm))
    throw Object.assign(new Error(`Janis does not implement hash '${algorithm}'`), { code: "ERR_OSSL_EVP_UNSUPPORTED" });
  const chunks = [];
  return {
    update(value, encoding) { chunks.push(Buffer.from(value, encoding)); return this; },
    digest(encoding) {
      const input = Buffer.concat(chunks);
      const bytes = digests[algorithm](input);
      return encoding ? bytes.toString(encoding) : bytes;
    },
    copy() { const copy = createHash(algorithm); copy.update(Buffer.concat(chunks)); return copy; },
  };
}
function createHmac(algorithm, key) {
  const blockSize = 64;
  let normalized = Buffer.from(key);
  if (normalized.length > blockSize)
    normalized = createHash(algorithm).update(normalized).digest();
  const padded = Buffer.alloc(blockSize);
  padded.set(normalized);
  const inner = Buffer.from(padded);
  const outer = Buffer.from(padded);
  for (let index = 0; index < blockSize; index++) {
    inner[index] ^= 0x36;
    outer[index] ^= 0x5c;
  }
  const chunks = [];
  return {
    update(value, encoding) { chunks.push(Buffer.from(value, encoding)); return this; },
    digest(encoding) {
      const inside = createHash(algorithm).update(inner)
        .update(Buffer.concat(chunks)).digest();
      const bytes = createHash(algorithm).update(outer).update(inside).digest();
      return encoding ? bytes.toString(encoding) : bytes;
    },
  };
}

// QuickJS exposes entropy helpers on the global crypto object but not Web
// Crypto's digest API. PKCE and similar upstream protocols only need this
// small, deterministic operation; keep it in-Wasm beside Janis's measured
// Node hash implementation instead of importing browser crypto authority.
crypto.subtle ??= {
  async digest(algorithm, data) {
    const name = String(
      typeof algorithm === "string" ? algorithm : algorithm?.name ?? "",
    ).toLowerCase().replaceAll("-", "");
    if (name !== "sha256" && name !== "sha1") {
      throw new DOMException(`Janis Web Crypto does not implement digest '${name}'`, "NotSupportedError");
    }
    const digest = (name === "sha1" ? sha1 : sha256)(Buffer.from(data));
    const output = new Uint8Array(digest.length);
    output.set(digest);
    return output.buffer;
  },
};
const janisCrypto = {
  randomBytes: (size, callback) => { const bytes = Buffer.from(Dolly.random(size)); if (callback) queueMicrotask(() => callback(null, bytes)); return bytes; },
  randomFillSync: (buffer, offset = 0, size = buffer.length - offset) => { buffer.set(Dolly.random(size), offset); return buffer; },
  randomUUID: crypto.randomUUID,
  createHash,
  createHmac,
  timingSafeEqual: (left, right) => {
    if (left.length !== right.length)
      throw new RangeError("Input buffers must have the same byte length");
    let difference = 0;
    for (let index = 0; index < left.length; index++)
      difference |= left[index] ^ right[index];
    return difference === 0;
  },
  webcrypto: crypto,
  subtle: crypto.subtle,
  createPrivateKey: unsupported("crypto key objects"),
  createPublicKey: unsupported("crypto key objects"),
  constants: {},
};

const janisOs = {
  EOL: "\n",
  devNull: "/dev/null",
  homedir: () => process.env.HOME || "/home/dolly",
  tmpdir: () => process.env.TMPDIR || "/tmp",
  platform: () => "wasm",
  arch: () => "wasm64",
  type: () => "Dolly",
  release: () => "0",
  hostname: () => "dolly",
  version: () => "Dolly",
  userInfo: () => ({ username: "dolly", uid: 0, gid: 0, shell: "/bin/slop", homedir: process.env.HOME || "/home/dolly" }),
  cpus: unsupported("os.cpus"),
  totalmem: unsupported("os.totalmem"),
  freemem: unsupported("os.freemem"),
  endianness: () => "LE",
  // Only the signals a Dolly child can report.
  constants: { signals: { ...childSignals } },
};

function formatValue(value) {
  if (typeof value === "string") return value;
  if (typeof value === "function") {
    const kind = /^class\b/.test(Function.prototype.toString.call(value)) ? "class" : value.constructor?.name ?? "Function";
    return kind === "class" ? `[class ${value.name || "(anonymous)"}]`
      : value.name ? `[${kind}: ${value.name}]` : `[${kind} (anonymous)]`;
  }
  try { return JSON.stringify(value) ?? String(value); } catch { return String(value); }
}
// Node's strict deep equality: Object.is for primitives, equal prototypes and
// own enumerable keys, and contents for dates, regular expressions, views,
// maps and sets (members compared by deep equality).
function isDeepStrictEqual(left, right, seen = new Map()) {
  if (Object.is(left, right)) return true;
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null ||
      Object.getPrototypeOf(left) !== Object.getPrototypeOf(right) ||
      Object.prototype.toString.call(left) !== Object.prototype.toString.call(right)) return false;
  if (seen.get(left) === right) return true;
  seen.set(left, right);
  const equal = (a, b) => isDeepStrictEqual(a, b, seen);
  if (left instanceof Date && left.getTime() !== right.getTime()) return false;
  if (left instanceof RegExp && String(left) !== String(right)) return false;
  if (ArrayBuffer.isView(left) && (left.byteLength !== right.byteLength ||
      Buffer.compare(new Uint8Array(left.buffer, left.byteOffset, left.byteLength),
        new Uint8Array(right.buffer, right.byteOffset, right.byteLength)) !== 0)) return false;
  if (left instanceof Map || left instanceof Set) {
    if (left.size !== right.size) return false;
    const unmatched = [...right];
    for (const entry of left) {
      const index = unmatched.findIndex((candidate) => left instanceof Map
        ? equal(entry[0], candidate[0]) && equal(entry[1], candidate[1]) : equal(entry, candidate));
      if (index < 0) return false;
      unmatched.splice(index, 1);
    }
  }
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && equal(left[key], right[key]));
}
const janisUtil = {
  isDeepStrictEqual: (left, right) => isDeepStrictEqual(left, right),
  inspect: (value) => formatValue(value),
  format: (format, ...args) => {
    if (typeof format !== "string") return [format, ...args].map(formatValue).join(" ");
    let index = 0;
    const output = format.replace(/%[sdijoOf%]/g, (token) => {
      if (token === "%%") return "%";
      const value = args[index++];
      if (token === "%d" || token === "%i" || token === "%f") return String(Number(value));
      if (token === "%j") { try { return JSON.stringify(value); } catch { return "[Circular]"; } }
      return formatValue(value);
    });
    return [output, ...args.slice(index).map(formatValue)].join(" ");
  },
  promisify: (fn) => (...args) => new Promise((resolve, reject) => fn(...args, (error, value) => error ? reject(error) : resolve(value))),
  callbackify: (fn) => (...args) => { const callback = args.pop(); Promise.resolve(fn(...args)).then((value) => callback(null, value), callback); },
  inherits: (constructor, superConstructor) => { Object.setPrototypeOf(constructor.prototype, superConstructor.prototype); Object.setPrototypeOf(constructor, superConstructor); },
  types: { isUint8Array: (value) => value instanceof Uint8Array, isArrayBuffer: (value) => value instanceof ArrayBuffer, isDate: (value) => value instanceof Date },
  TextEncoder,
  TextDecoder,
  deprecate: (fn) => fn,
  debuglog: () => () => {},
  stripVTControlCharacters: (value) => String(value).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, ""),
};

// Calls back once: when the stream ends or finishes, errors, or closes early.
function streamFinished(stream, options, callback = options) {
  const prematureClose = () => Object.assign(new Error("Premature close"), { code: "ERR_STREAM_PREMATURE_CLOSE" });
  const listeners = { end: () => settle(), finish: () => settle(), error: settle, close: () => settle(prematureClose()) };
  const cleanup = () => { for (const name in listeners) stream.off(name, listeners[name]); };
  function settle(error) { cleanup(); callback(error); }
  if (stream.readableEnded || stream.writableFinished) queueMicrotask(settle);
  else if (stream.destroyed) queueMicrotask(() => settle(prematureClose()));
  else for (const name in listeners) stream.on(name, listeners[name]);
  return cleanup;
}
function streamPipeline(...streams) {
  const callback = streams.pop();
  let settled = false;
  const settle = error => {
    if (settled) return;
    settled = true;
    if (error) for (const stream of streams) stream.destroy?.();
    callback(error);
  };
  streams.forEach((stream, index) => {
    if (index + 1 < streams.length) stream.pipe(streams[index + 1]);
    stream.on("error", settle);
  });
  streamFinished(streams.at(-1), settle);
  return streams.at(-1);
}
const janisStream = Object.assign(JanisStream, {
  Stream: JanisStream,
  Readable: JanisReadable,
  Writable: JanisWritable,
  Duplex: JanisDuplex,
  Transform: JanisTransform,
  PassThrough: JanisPassThrough,
  pipeline: streamPipeline,
  finished: streamFinished,
});
const settledBy = operation => (...args) => new Promise((resolve, reject) =>
  operation(...args, error => error ? reject(error) : resolve()));
const janisStreamPromises = { pipeline: settledBy(streamPipeline), finished: settledBy(streamFinished) };
janisStream.promises = janisStreamPromises;
async function streamBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
const janisStreamConsumers = {
  buffer: streamBuffer,
  text: async (stream) => (await streamBuffer(stream)).toString(),
  json: async (stream) => JSON.parse((await streamBuffer(stream)).toString()),
  arrayBuffer: async (stream) => (await streamBuffer(stream)).slice().buffer,
};

function janisDiagnosticChannel(name) {
  return {
    name,
    hasSubscribers: false,
    publish() {},
    subscribe() {},
    unsubscribe() {},
    bindStore() {},
    unbindStore() {},
    runStores(_context, callback, thisArg, ...args) {
      return callback.apply(thisArg, args);
    },
  };
}
const janisDiagnosticsChannel = {
  channel: janisDiagnosticChannel,
  hasSubscribers: () => false,
  subscribe() {},
  unsubscribe() {},
  tracingChannel(name) {
    const tracing = {
      start: janisDiagnosticChannel(`${name}:start`),
      end: janisDiagnosticChannel(`${name}:end`),
      asyncStart: janisDiagnosticChannel(`${name}:asyncStart`),
      asyncEnd: janisDiagnosticChannel(`${name}:asyncEnd`),
      error: janisDiagnosticChannel(`${name}:error`),
      hasSubscribers: false,
      traceSync(callback, context, thisArg, ...args) {
        return callback.apply(thisArg, args);
      },
      tracePromise(callback, context, thisArg, ...args) {
        return Promise.resolve(callback.apply(thisArg, args));
      },
      traceCallback(callback, position, context, thisArg, ...args) {
        return callback.apply(thisArg, args);
      },
    };
    return tracing;
  },
};

const janisQuerystring = {
  stringify(value = {}) {
    const parameters = new URLSearchParams();
    for (const [name, item] of Object.entries(value)) {
      if (Array.isArray(item)) for (const entry of item) parameters.append(name, entry);
      else parameters.append(name, item ?? "");
    }
    return parameters.toString();
  },
  parse(value = "") {
    const result = Object.create(null);
    for (const [name, item] of new URLSearchParams(String(value))) {
      if (!(name in result)) result[name] = item;
      else if (Array.isArray(result[name])) result[name].push(item);
      else result[name] = [result[name], item];
    }
    return result;
  },
  escape: encodeURIComponent,
  unescape: decodeURIComponent,
};
janisQuerystring.encode = janisQuerystring.stringify;
janisQuerystring.decode = janisQuerystring.parse;

class JanisUndiciDispatcher extends JanisEventEmitter {
  close() { return Promise.resolve(); }
  destroy() { return Promise.resolve(); }
  dispatch() { throw new Error("Janis dispatches HTTP through global fetch"); }
}
class JanisUndiciAgent extends JanisUndiciDispatcher {}
let janisGlobalDispatcher = new JanisUndiciAgent();
const janisUndici = {
  Dispatcher: JanisUndiciDispatcher,
  Agent: JanisUndiciAgent,
  Client: JanisUndiciAgent,
  Pool: JanisUndiciAgent,
  ProxyAgent: JanisUndiciAgent,
  EnvHttpProxyAgent: JanisUndiciAgent,
  setGlobalDispatcher(dispatcher) { janisGlobalDispatcher = dispatcher; },
  getGlobalDispatcher() { return janisGlobalDispatcher; },
  // Pi calls install() to keep Node's global fetch and its dispatcher paired.
  // Janis fetch has no socket dispatcher: it already terminates at Dolly.http.
  install() {},
  fetch: (...args) => globalThis.fetch(...args),
  Headers,
  Response,
  FormData,
};

class JanisAsyncLocalStorage {
  #store;
  disable() { this.#store = undefined; }
  enterWith(store) { this.#store = store; }
  getStore() { return this.#store; }
  run(store, callback, ...args) {
    const previous = this.#store;
    this.#store = store;
    try { return callback(...args); } finally { this.#store = previous; }
  }
  exit(callback, ...args) { return this.run(undefined, callback, ...args); }
  static bind(callback) { return callback; }
  static snapshot() { return (callback, ...args) => callback(...args); }
}
class JanisAsyncResource {
  runInAsyncScope(callback, thisArg, ...args) { return callback.apply(thisArg, args); }
  emitDestroy() { return this; }
  asyncId() { return 1; }
  triggerAsyncId() { return 0; }
  static bind(callback) { return callback; }
}
const janisAsyncHooks = {
  AsyncLocalStorage: JanisAsyncLocalStorage,
  AsyncResource: JanisAsyncResource,
  createHook: () => ({ enable() { return this; }, disable() { return this; } }),
  executionAsyncId: () => 1,
  triggerAsyncId: () => 0,
  executionAsyncResource: () => ({}),
};

class JanisConsole {
  constructor(stdout = janisStdout, stderr = janisStderr) {
    this.stdout = stdout;
    this.stderr = stderr;
  }
  log(...values) { this.stdout.write(`${values.map(formatValue).join(" ")}\n`); }
  info(...values) { this.log(...values); }
  debug(...values) { this.log(...values); }
  warn(...values) { this.stderr.write(`${values.map(formatValue).join(" ")}\n`); }
  error(...values) { this.warn(...values); }
  dir(value) { this.log(value); }
  time() {}
  timeEnd() {}
  trace(...values) { this.error(...values); }
}

class JanisReadableStream {
  constructor(source = {}) {
    this.source = source;
    this.queue = [];
    this.done = false;
    this.waiters = [];
    const controller = {
      enqueue: (value) => { this.queue.push(value); this.#wake(); },
      close: () => { this.done = true; this.#wake(); },
      error: (error) => { this.error = error; this.done = true; this.#wake(); },
      desiredSize: 1,
    };
    this.controller = controller;
    source.start?.(controller);
  }
  #wake() { for (const wake of this.waiters.splice(0)) wake(); }
  getReader() {
    return {
      read: async () => {
        if (!this.queue.length && !this.done) {
          this.source.pull?.(this.controller);
          if (!this.queue.length && !this.done) {
            await new Promise((resolve) => this.waiters.push(resolve));
          }
        }
        if (this.error) throw this.error;
        return this.queue.length
          ? { value: this.queue.shift(), done: false }
          : { value: undefined, done: true };
      },
      cancel: async (reason) => this.cancel(reason),
      releaseLock() {},
    };
  }
  async cancel(reason) { this.done = true; await this.source.cancel?.(reason); this.#wake(); }
  async pipeTo(destination) {
    for await (const chunk of this) await destination.getWriter().write(chunk);
    await destination.getWriter().close();
  }
  [Symbol.asyncIterator]() {
    const reader = this.getReader();
    return { next: () => reader.read(), return: async () => { await reader.cancel(); return { done: true }; } };
  }
}
class JanisWritableStream {
  constructor(sink = {}) { this.sink = sink; }
  getWriter() {
    return {
      write: async (chunk) => this.sink.write?.(chunk),
      close: async () => this.sink.close?.(),
      abort: async (reason) => this.sink.abort?.(reason),
      ready: Promise.resolve(),
      closed: Promise.resolve(),
    };
  }
}
class JanisTransformStream {
  constructor() {
    const chunks = [];
    this.writable = new JanisWritableStream({ write: (chunk) => chunks.push(chunk) });
    this.readable = new JanisReadableStream({
      pull(controller) {
        if (chunks.length) controller.enqueue(chunks.shift());
      },
    });
  }
}
globalThis.ReadableStream ??= JanisReadableStream;
globalThis.WritableStream ??= JanisWritableStream;
globalThis.TransformStream ??= JanisTransformStream;
const janisStreamWeb = {
  ReadableStream: globalThis.ReadableStream,
  WritableStream: globalThis.WritableStream,
  TransformStream: globalThis.TransformStream,
};

const janisVm = {
  runInThisContext: (source) => (0, eval)(String(source)),
  runInNewContext: (source, context = {}) => {
    const names = Object.keys(context);
    return Function(...names, String(source))(...names.map((name) => context[name]));
  },
  runInContext: (source, context) => janisVm.runInNewContext(source, context),
  createContext: (context = {}) => context,
  isContext: (context) => context !== null && typeof context === "object",
  compileFunction: (source, parameters = []) => Function(...parameters, String(source)),
};
janisVm.Script = class Script {
  constructor(source) { this.source = String(source); }
  runInThisContext() { return janisVm.runInThisContext(this.source); }
  runInContext(context) { return janisVm.runInContext(this.source, context); }
  runInNewContext(context) { return janisVm.runInNewContext(this.source, context); }
  createCachedData() { return Buffer.alloc(0); }
};

const janisV8 = {
  getCachedDataVersionTag: () => 0,
  getHeapStatistics: () => ({}),
  getHeapSpaceStatistics: () => [],
  getHeapSnapshot: unsupported("heap snapshots"),
  setFlagsFromString() {},
  serialize: (value) => Buffer.from(JSON.stringify(value)),
  deserialize: (value) => JSON.parse(Buffer.from(value).toString()),
};

const janisDns = {
  lookup(_hostname, options, callback) {
    if (typeof options === "function") callback = options;
    queueMicrotask(() => callback?.(Object.assign(new Error("Janis has no DNS socket API"), { code: "ENOSYS" })));
  },
  promises: {
    lookup: async () => { throw Object.assign(new Error("Janis has no DNS socket API"), { code: "ENOSYS" }); },
  },
};

class JanisModule {
  constructor(id = "", parent = null) {
    this.id = String(id);
    this.filename = this.id;
    this.path = dirname(this.filename);
    this.exports = {};
    this.loaded = false;
    this.parent = parent;
    this.children = [];
    this.paths = JanisModule._nodeModulePaths(this.path);
    this.require = createJanisRequire(this.filename);
  }
  static _nodeModulePaths(from) {
    const paths = [];
    let directory = resolvePath(from);
    for (;;) {
      paths.push(janisPath.join(directory, "node_modules"));
      const parent = dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
    return paths;
  }
}

const janisBuiltinModuleNames = [
  "assert", "assert/strict", "async_hooks", "buffer", "child_process",
  "console", "constants", "crypto", "diagnostics_channel", "dns", "events",
  "fs", "fs/promises", "http", "http2", "https", "module", "net", "os",
  "path", "path/posix", "path/win32", "perf_hooks", "process", "querystring", "readline", "sqlite",
  "stream", "stream/consumers", "stream/promises", "stream/web", "string_decoder", "timers",
  "timers/promises", "tls", "tty", "url", "util", "util/types", "v8", "vm",
  "worker_threads", "zlib", "undici",
];

function janisModuleFile(candidate) {
  return [candidate, `${candidate}.js`, `${candidate}.mjs`, `${candidate}.cjs`,
    `${candidate}/index.js`, `${candidate}/index.mjs`].find(isFile);
}

// Matching conditions are tried in the exports object's own key order.
function janisExportTarget(value, conditions) {
  if (typeof value === "string") return value;
  const candidates = Array.isArray(value) ? value : value && typeof value === "object"
    ? Object.keys(value).filter((key) => conditions.includes(key)).map((key) => value[key]) : [];
  for (const candidate of candidates) {
    const target = janisExportTarget(candidate, conditions);
    if (target !== undefined) return target;
  }
  return undefined;
}

function janisMappedTarget(map, key, conditions) {
  if (Object.hasOwn(map, key)) return janisExportTarget(map[key], conditions);
  let best;
  for (const pattern of Object.keys(map)) {
    const star = pattern.indexOf("*");
    if (star < 0 || pattern.indexOf("*", star + 1) >= 0) continue;
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    if (!key.startsWith(prefix) || !key.endsWith(suffix) ||
        key.length < prefix.length + suffix.length) continue;
    const target = janisExportTarget(map[pattern], conditions);
    if (target === undefined || (best && prefix.length <= best.prefix.length)) continue;
    best = {
      prefix,
      match: key.slice(prefix.length, key.length - suffix.length),
      target,
    };
  }
  return best?.target?.replaceAll("*", () => best.match);
}

const janisConditions = (forRequire) => [forRequire ? "require" : "import", "node", "default"];

function janisPackageExport(exportsValue, subpath, conditions) {
  const key = subpath ? `./${subpath}` : ".";
  if (typeof exportsValue === "string" || Array.isArray(exportsValue))
    return subpath ? undefined : janisExportTarget(exportsValue, conditions);
  if (!exportsValue || typeof exportsValue !== "object") return undefined;
  if (!Object.keys(exportsValue).some((entry) => entry.startsWith(".")))
    return subpath ? undefined : janisExportTarget(exportsValue, conditions);
  return janisMappedTarget(exportsValue, key, conditions);
}

function janisPackageImport(specifier, baseName, forRequire = false) {
  if (specifier === "#" || specifier.startsWith("#/")) {
    throw Object.assign(new Error(`Invalid package import specifier '${specifier}'`), {
      code: "ERR_INVALID_MODULE_SPECIFIER",
    });
  }
  let directory = String(baseName).startsWith("/") ? dirname(baseName) : Dolly.cwd();
  for (;;) {
    const manifestPath = janisPath.join(directory, "package.json");
    if (fsExists(manifestPath)) {
      let manifest;
      try { manifest = JSON.parse(fsRead(manifestPath, "utf8")); }
      catch (error) {
        throw Object.assign(new Error(`Invalid package manifest '${manifestPath}': ${error.message}`), {
          code: "ERR_INVALID_PACKAGE_CONFIG",
        });
      }
      const target = manifest.imports && typeof manifest.imports === "object"
        ? janisMappedTarget(manifest.imports, specifier, janisConditions(forRequire))
        : undefined;
      if (target === undefined) {
        throw Object.assign(new Error(`Package import '${specifier}' is not defined by '${manifestPath}'`), {
          code: "ERR_PACKAGE_IMPORT_NOT_DEFINED",
        });
      }
      if (!target.startsWith("./"))
        return janisResolveModule(target, manifestPath, forRequire);
      const candidate = normalizePath(directory, target);
      if (candidate !== directory && !candidate.startsWith(`${directory}/`)) {
        throw Object.assign(new Error(`Package import '${specifier}' escapes its package root`), {
          code: "ERR_INVALID_PACKAGE_TARGET",
        });
      }
      const resolved = janisModuleFile(candidate);
      if (resolved !== undefined) return resolved;
      throw Object.assign(new Error(`Cannot find package import '${specifier}'`), {
        code: "ERR_MODULE_NOT_FOUND",
      });
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw Object.assign(new Error(`Package import '${specifier}' has no package scope`), {
    code: "ERR_PACKAGE_IMPORT_NOT_DEFINED",
  });
}

// Node's format rules: the extension, then the nearest package.json "type". A
// file with neither is ambiguous: CommonJS unless it only parses as an ES module.
function janisModuleFormat(path) {
  if (path.endsWith(".mjs")) return "module";
  if (path.endsWith(".cjs")) return "commonjs";
  let directory = dirname(path);
  for (;;) {
    const manifestPath = janisPath.join(directory, "package.json");
    if (fsExists(manifestPath)) {
      let type;
      try { type = JSON.parse(fsRead(manifestPath, "utf8")).type; }
      catch (error) {
        throw Object.assign(new Error(`Invalid package manifest '${manifestPath}': ${error.message}`), {
          code: "ERR_INVALID_PACKAGE_CONFIG",
        });
      }
      return type === "module" || type === "commonjs" ? type : "ambiguous";
    }
    const parent = dirname(directory);
    if (parent === directory) return "ambiguous";
    directory = parent;
  }
}

// The wrapper detection compiled stays ready for the require that follows.
const janisDetectedCommonJs = new Map();
function janisCompileCommonJs(source, filename) {
  if (source.charCodeAt(0) === 0xfeff) source = source.slice(1);
  return Dolly.compileCommonJs(source.startsWith("#!") ? `//${source.slice(2)}` : source, filename);
}
function janisIsCommonJs(path) {
  const format = janisModuleFormat(path);
  if (format !== "ambiguous" || janisDetectedCommonJs.has(path)) return format !== "module";
  try { janisDetectedCommonJs.set(path, janisCompileCommonJs(Dolly.readFile(path), path)); }
  catch (error) { if (error instanceof SyntaxError) return false; throw error; }
  return true;
}

// An ES module view of a value, its default export plus its identifier keys.
function janisModuleView(expression, value) {
  const names = value !== null && (typeof value === "object" || typeof value === "function")
    ? Object.keys(value).filter((key) => key !== "default" && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)).sort()
    : [];
  return [`const value = ${expression};`, "export default value;",
    ...names.map((key) => `export const ${key} = value[${JSON.stringify(key)}];`), ""].join("\n");
}

// Synthetic module sources for the native loader: node: built-ins, and
// CommonJS files imported from ESM. Others load from their files.
globalThis.__janisModuleSource = (name) => {
  if (name.startsWith("node:")) {
    const builtin = name.slice("node:".length);
    return janisModuleView(`globalThis.__janisBuiltin(${JSON.stringify(builtin)})`, globalThis.__janisBuiltin(builtin));
  }
  if (name.endsWith(".json") || !janisIsCommonJs(name)) return undefined;
  return janisModuleView(`globalThis.__janisRequireCjs(${JSON.stringify(name)})`, globalThis.__janisRequireCjs(name));
};

function janisResolveModule(specifier, baseName, forRequire = false) {
  specifier = String(specifier);
  if (specifier.startsWith("#"))
    return janisPackageImport(specifier, baseName, forRequire);
  if (specifier.startsWith("node:") ||
      janisBuiltinModuleNames.includes(specifier)) {
    return `node:${specifier.replace(/^node:/, "")}`;
  }
  const parts = specifier.split("/");
  const packageParts = specifier.startsWith("@") ? 2 : 1;
  if (parts.length < packageParts || parts.slice(0, packageParts).some((part) =>
    !part || part === "." || part === ".." || part.includes("\\"))) {
    throw Object.assign(new Error(`Invalid bare module specifier '${specifier}'`), {
      code: "ERR_INVALID_MODULE_SPECIFIER",
    });
  }
  const packageName = parts.slice(0, packageParts).join("/");
  const subpath = parts.slice(packageParts).join("/");
  if (subpath.split("/").some((part) => part === "." || part === ".." || part.includes("\\"))) {
    throw Object.assign(new Error(`Invalid bare module specifier '${specifier}'`), {
      code: "ERR_INVALID_MODULE_SPECIFIER",
    });
  }

  let directory = String(baseName).startsWith("/")
    ? dirname(baseName)
    : Dolly.cwd();
  const roots = [];
  for (;;) {
    roots.push(janisPath.join(directory, "node_modules"));
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  roots.push("/usr/lib/node_modules");

  for (const root of roots) {
    const packageRoot = janisPath.join(root, packageName);
    const manifestPath = janisPath.join(packageRoot, "package.json");
    if (!fsExists(manifestPath)) continue;
    let manifest;
    try { manifest = JSON.parse(fsRead(manifestPath, "utf8")); }
    catch (error) {
      throw Object.assign(new Error(`Invalid package manifest '${manifestPath}': ${error.message}`), {
        code: "ERR_INVALID_PACKAGE_CONFIG",
      });
    }

    let target;
    if (manifest.exports !== undefined) {
      target = janisPackageExport(manifest.exports, subpath, janisConditions(forRequire));
      if (target === undefined) {
        throw Object.assign(new Error(`Package '${packageName}' does not export './${subpath}'`), {
          code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
        });
      }
    } else if (subpath) target = `./${subpath}`;
    else {
      target = manifest.module ?? manifest.main ?? "./index.js";
      if (typeof target === "string" && !target.startsWith(".") && !target.startsWith("/"))
        target = `./${target}`;
    }
    if (typeof target !== "string" || !target.startsWith("./")) {
      throw Object.assign(new Error(`Package '${packageName}' has an unsupported export target`), {
        code: "ERR_INVALID_PACKAGE_TARGET",
      });
    }
    const candidate = normalizePath(packageRoot, target);
    if (candidate !== packageRoot && !candidate.startsWith(`${packageRoot}/`)) {
      throw Object.assign(new Error(`Package '${packageName}' export escapes its package root`), {
        code: "ERR_INVALID_PACKAGE_TARGET",
      });
    }
    const resolved = janisModuleFile(candidate);
    if (resolved !== undefined) return resolved;
    throw Object.assign(new Error(`Cannot find exported module '${specifier}'`), {
      code: "ERR_MODULE_NOT_FOUND",
    });
  }
  throw Object.assign(new Error(`Cannot find package '${packageName}' from '${baseName}'`), {
    code: "ERR_MODULE_NOT_FOUND",
  });
}
globalThis.__janisResolveModule = janisResolveModule;

const janisRequireCache = Object.create(null);
let janisMainModule;
function janisRunCommonJs(module, compiled, filename) {
  compiled.call(module.exports, module.exports, module.require, module, filename,
    filename.startsWith("/") ? dirname(filename) : ".");
  module.loaded = true;
}
function createJanisRequire(filename = "/usr/lib/janis/index.js") {
  const base = dirname(filename);
  const require = (specifier) => {
    const name = String(specifier).replace(/^node:/, "");
    if (janisBuiltinModuleNames.includes(name)) return globalThis.__janisBuiltin(name);
    const resolved = require.resolve(String(specifier));
    if (resolved.endsWith(".json")) return JSON.parse(fsRead(resolved, "utf8"));
    const cached = janisRequireCache[resolved];
    if (cached) return cached.exports;
    if (!janisIsCommonJs(resolved)) {
      throw Object.assign(new Error(`Janis cannot require ES module '${resolved}'; import it`), {
        code: "ERR_REQUIRE_ESM",
      });
    }
    const compiled = janisDetectedCommonJs.get(resolved) ?? janisCompileCommonJs(Dolly.readFile(resolved), resolved);
    janisDetectedCommonJs.delete(resolved);
    const child = new JanisModule(resolved);
    janisRequireCache[resolved] = child;
    try { janisRunCommonJs(child, compiled, resolved); }
    catch (error) {
      delete janisRequireCache[resolved];
      throw error;
    }
    return child.exports;
  };
  require.resolve = (specifier) => {
    const value = String(specifier);
    const name = value.replace(/^node:/, "");
    if (janisBuiltinModuleNames.includes(name)) return value.startsWith("node:") ? value : name;
    if (!value.startsWith("/") && !value.startsWith("./") && !value.startsWith("../"))
      return janisResolveModule(value, filename, true);
    const candidate = value.startsWith("/") ? normalizePath(value) : resolvePath(base, value);
    const resolved = [candidate, `${candidate}.js`, `${candidate}.cjs`, `${candidate}.json`, `${candidate}/index.js`].find(isFile);
    if (resolved) return resolved;
    throw Object.assign(new Error(`Cannot find module '${specifier}'`), {
      code: "MODULE_NOT_FOUND",
    });
  };
  require.resolve.paths = (specifier) =>
    janisBuiltinModuleNames.includes(String(specifier).replace(/^node:/, ""))
      ? null
      : JanisModule._nodeModulePaths(base);
  require.cache = janisRequireCache;
  require.extensions = { ".js": true, ".json": true };
  Object.defineProperty(require, "main", { get: () => janisMainModule, enumerable: true });
  return require;
}
globalThis.__janisRequireCjs = (path) => createJanisRequire(String(path))(String(path));

// The entry: CommonJS runs here; true asks the native runner for an ES module.
// -e and stdin are named [eval] and [stdin] and resolve from the cwd, as in Node.
globalThis.__janisMain = (source, name) => {
  const file = name !== "[eval]" && name !== "[stdin]";
  const filename = file ? resolvePath(name) : name;
  const format = file ? janisModuleFormat(filename) : "ambiguous";
  if (format === "module") return true;
  let compiled;
  try { compiled = janisCompileCommonJs(source, filename); }
  catch (error) {
    if (format === "ambiguous" && error instanceof SyntaxError) return true;
    throw error;
  }
  janisMainModule = new JanisModule(file ? filename : resolvePath(name));
  janisMainModule.id = ".";
  if (file) janisRequireCache[filename] = janisMainModule;
  process.mainModule = janisMainModule;
  janisRunCommonJs(janisMainModule, compiled, filename);
  return false;
};
globalThis.__janisImportMetaResolve = (specifier, baseName) => {
  specifier = String(specifier);
  if (specifier.startsWith("node:")) return specifier;
  if (janisBuiltinModuleNames.includes(specifier)) return `node:${specifier}`;
  if (specifier.startsWith("file:")) return new URL(specifier).href;
  if (specifier.startsWith("/")) return `file://${normalizePath(specifier)}`;
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    return `file://${normalizePath(dirname(String(baseName)), specifier)}`;
  }
  return `file://${janisResolveModule(specifier, baseName)}`;
};

const janisTls = {
  connect: () => { throw new Error("Janis has no TLS sockets; use fetch"); },
  createSecureContext: () => ({}),
  checkServerIdentity: () => undefined,
  rootCertificates: [],
  TLSSocket: class TLSSocket extends JanisEventEmitter {},
};

function janisIPv4(value) {
  const parts = `${value}`.split(".");
  return parts.length === 4 && parts.every(part => /^(0|[1-9][0-9]{0,2})$/.test(part) && Number(part) <= 255);
}

function janisIPv6(value) {
  let address = `${value}`;
  const zone = address.indexOf("%");
  if (zone !== -1) {
    if (!/^[0-9a-zA-Z.:-]+$/.test(address.slice(zone + 1))) return false;
    address = address.slice(0, zone);
  }
  const groups = address.split(":");
  if (groups.at(-1).includes(".")) {
    if (!janisIPv4(groups.at(-1))) return false;
    groups.splice(-1, 1, "0", "0");
    address = groups.join(":");
  }
  const halves = address.split("::");
  if (halves.length > 2) return false;
  const parts = halves.flatMap(part => part === "" ? [] : part.split(":"));
  return parts.every(part => /^[0-9a-fA-F]{1,4}$/.test(part)) &&
    (halves.length === 2 ? parts.length < 8 : parts.length === 8);
}

const janisBuiltinModules = {
  "assert/strict": undefined,
  async_hooks: janisAsyncHooks,
  assert: Object.assign((condition, message) => { if (!condition) throw new Error(message || "Assertion failed"); }, { strictEqual: (a, b) => { if (a !== b) throw new Error("Expected values to be strictly equal"); } }),
  buffer: { Buffer, SlowBuffer: Buffer, INSPECT_MAX_BYTES: 50, constants: {} },
  child_process: janisChildProcess,
  console: { Console: JanisConsole, ...console },
  constants: janisFs.constants,
  crypto: janisCrypto,
  diagnostics_channel: janisDiagnosticsChannel,
  dns: janisDns,
  // Janis never warns about listener counts, so there is no limit to set.
  events: Object.assign(JanisEventEmitter, { EventEmitter: JanisEventEmitter, setMaxListeners() {} }),
  fs: janisFs,
  "fs/promises": janisFsPromises,
  module: {
    Module: JanisModule,
    createRequire: (filename) => createJanisRequire(
      filename instanceof URL || String(filename).startsWith("file:") ? fileURLToPath(filename) : String(filename),
    ),
    builtinModules: [...janisBuiltinModuleNames, ...janisBuiltinModuleNames.map((name) => `node:${name}`)],
    isBuiltin: (name) => Boolean(janisBuiltinModules[String(name).replace(/^node:/, "")]),
  },
  os: janisOs,
  path: janisPath,
  "path/posix": janisPath,
  "path/win32": janisPath.win32,
  perf_hooks: { performance },
  process,
  querystring: janisQuerystring,
  readline: {
    createInterface: (options, output) => new JanisReadline(options, output),
    emitKeypressEvents: unsupported("readline keypress events"),
    clearLine: unsupported("readline terminal editing"),
    cursorTo: unsupported("readline terminal editing"),
    moveCursor: unsupported("readline terminal editing"),
  },
  stream: janisStream,
  "stream/consumers": janisStreamConsumers,
  "stream/promises": janisStreamPromises,
  "stream/web": janisStreamWeb,
  string_decoder: { StringDecoder: JanisStringDecoder },
  "timers/promises": { setTimeout: timerPromise, setImmediate: (value) => Promise.resolve(value) },
  timers: { setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, clearImmediate },
  tls: janisTls,
  tty: { isatty: (fd) => Boolean(Dolly.isatty(Number(fd))), ReadStream: JanisStdin, WriteStream: JanisOutput },
  undici: janisUndici,
  url: {
    URL,
    URLSearchParams,
    pathToFileURL,
    fileURLToPath,
    domainToASCII: (value) => String(value),
    domainToUnicode: (value) => String(value),
    format: (url) => String(url),
    parse: (value) => new URL(value),
  },
  util: janisUtil,
  "util/types": janisUtil.types,
  v8: janisV8,
  vm: janisVm,
  // One thread. Worker stays a named export, since static imports of it must
  // link (Pi's codemode imports it); constructing one fails with ENOSYS.
  worker_threads: { isMainThread: true, parentPort: null, threadId: 0, workerData: null,
    Worker: class Worker { constructor() { unsupported("worker threads")(); } } },
};

janisBuiltinModules["assert/strict"] = janisBuiltinModules.assert;
janisBuiltinModules.http2 = {
  constants: {},
  connect: () => { throw new Error("Janis has no HTTP/2 sockets; use fetch"); },
};
janisBuiltinModules.sqlite = {
  DatabaseSync: class DatabaseSync {
    constructor() { throw new Error("Janis does not provide SQLite yet"); }
  },
};

for (const name of ["http", "https", "net"]) {
  class SocketLike extends JanisEventEmitter { setTimeout() { return this; } setNoDelay() { return this; } destroy() { this.emit("close"); } }
  class ServerLike extends JanisEventEmitter {
    listening = false;
    listen() {
      // Node reports bind failures asynchronously. Keeping that shape lets
      // applications such as Pi fall back to a displayed/manual OAuth code
      // without pretending Dolly can open a host or browser socket.
      queueMicrotask(() => {
        const error = Object.assign(
          new Error("Janis has no listening socket API"),
          { code: "ENOSYS", syscall: "listen" },
        );
        this.emit("error", error);
      });
      return this;
    }
    address() { return null; }
    close(callback) {
      this.listening = false;
      queueMicrotask(() => {
        callback?.();
        this.emit("close");
      });
      return this;
    }
  }
  janisBuiltinModules[name] = {
    Agent: class extends JanisEventEmitter { destroy() {} },
    ClientRequest: SocketLike,
    IncomingMessage: JanisReadable,
    Server: ServerLike,
    createServer: (listener) => {
      const server = new ServerLike();
      if (typeof listener === "function") server.on("request", listener);
      return server;
    },
    Socket: SocketLike,
    request: () => { throw new Error("Janis has no sockets; use fetch"); },
    get: () => { throw new Error("Janis has no sockets; use fetch"); },
    isIP: value => janisIPv4(value) ? 4 : janisIPv6(value) ? 6 : 0,
    isIPv4: janisIPv4,
    isIPv6: janisIPv6,
    METHODS: [],
    STATUS_CODES: {},
  };
}
// Addresses as integers; an IPv4 address and its ::ffff: mapping are the same.
function janisAddressValue(address, type = "ipv4") {
  address = String(address);
  if (type === "ipv4") {
    if (!janisIPv4(address)) throw Object.assign(new Error(`Invalid IPv4 address: ${address}`), { code: "ERR_INVALID_ADDRESS" });
    return { family: 4, value: address.split(".").reduce((sum, part) => sum << 8n | BigInt(part), 0n) };
  }
  if (!janisIPv6(address) || address.includes("%"))
    throw Object.assign(new Error(`Invalid IPv6 address: ${address}`), { code: "ERR_INVALID_ADDRESS" });
  let groups = address.split(":");
  if (groups.at(-1).includes(".")) {
    const low = janisAddressValue(groups.at(-1)).value;
    groups.splice(-1, 1, (low >> 16n).toString(16), (low & 0xffffn).toString(16));
  }
  const gap = groups.indexOf("");
  if (gap >= 0) {
    const parts = groups.filter((group) => group !== "");
    groups = [...parts.slice(0, gap), ...Array(8 - parts.length).fill("0"), ...parts.slice(gap)];
    if (groups.length > 8) groups = groups.slice(0, 8);
  }
  const value = groups.reduce((sum, group) => sum << 16n | BigInt(`0x${group || 0}`), 0n);
  return value >> 32n === 0xffffn ? { family: 4, value: value & 0xffffffffn } : { family: 6, value };
}
class JanisBlockList {
  #rules = [];
  #add(type, start, end, text) {
    const first = janisAddressValue(start, type), last = janisAddressValue(end, type);
    if (first.family !== last.family || first.value > last.value)
      throw Object.assign(new RangeError("The start address must be at or before the end address"), { code: "ERR_INVALID_ARG_VALUE" });
    this.#rules.unshift({ family: first.family, start: first.value, end: last.value, text });
  }
  addAddress(address, type = "ipv4") { this.#add(type, address, address, `Address: ${type === "ipv4" ? "IPv4" : "IPv6"} ${address}`); }
  addRange(start, end, type = "ipv4") { this.#add(type, start, end, `Range: ${type === "ipv4" ? "IPv4" : "IPv6"} ${start}-${end}`); }
  addSubnet(network, prefix, type = "ipv4") {
    const bits = type === "ipv4" ? 32n : 128n;
    if (!Number.isInteger(prefix) || prefix < 0 || BigInt(prefix) > bits)
      throw Object.assign(new RangeError(`The prefix must be between 0 and ${bits}`), { code: "ERR_OUT_OF_RANGE" });
    const { family, value } = janisAddressValue(network, type);
    const span = (1n << (bits - BigInt(prefix))) - 1n;
    const [start, end] = family === 4 && type === "ipv6"
      ? [value & ~span, value | span].map((part) => part & 0xffffffffn) : [value & ~span, value | span];
    this.#rules.unshift({ family, start, end, text: `Subnet: ${type === "ipv4" ? "IPv4" : "IPv6"} ${network}/${prefix}` });
  }
  check(address, type = "ipv4") {
    const { family, value } = janisAddressValue(address, type);
    return this.#rules.some((rule) => rule.family === family && rule.start <= value && value <= rule.end);
  }
  get rules() { return this.#rules.map((rule) => rule.text); }
}
Object.assign(janisBuiltinModules.net, {
  connect: unsupported("TCP sockets; use fetch"),
  createConnection: unsupported("TCP sockets; use fetch"),
  BlockList: JanisBlockList,
});
const unavailableZlib = unsupported("zlib", "ERR_METHOD_NOT_IMPLEMENTED");
janisBuiltinModules.zlib = {
  constants: {},
  codes: {},
  gzipSync: unavailableZlib,
  gunzipSync: unavailableZlib,
  deflateSync: unavailableZlib,
  deflateRawSync: unavailableZlib,
  inflateSync: unavailableZlib,
  crc32: unavailableZlib,
  createGunzip: unavailableZlib,
  createGzip: unavailableZlib,
  createInflate: unavailableZlib,
  createDeflate: unavailableZlib,
};
// The classes exist for modules that subclass them at load; constructing fails.
for (const name of ["Deflate", "Inflate", "Gzip", "Gunzip", "DeflateRaw", "InflateRaw", "Unzip", "BrotliCompress", "BrotliDecompress"])
  janisBuiltinModules.zlib[name] = function() { unavailableZlib(); };

globalThis.__janisBuiltin = (name) => {
  name = String(name).replace(/^node:/, "");
  const module = janisBuiltinModules[name];
  if (module === undefined) throw new Error(`Janis does not provide module '${name}'`);
  return module;
};
// Node returns undefined for names that are not built in. Keep the strict
// throwing lookup for statically bundled imports, but expose Node's probing
// behavior through process.getBuiltinModule().
process.getBuiltinModule = (name) =>
  janisBuiltinModules[String(name).replace(/^node:/, "")];

if (typeof globalThis.Event !== "function") {
  globalThis.Event = class Event { constructor(type) { this.type = type; } };
}
if (typeof globalThis.EventTarget !== "function") {
  globalThis.EventTarget = class EventTarget {
    #events = new JanisEventEmitter();
    addEventListener(name, listener) { this.#events.on(name, listener); }
    removeEventListener(name, listener) { this.#events.off(name, listener); }
    dispatchEvent(event) { return this.#events.emit(event.type, event); }
  };
}

function janisStreamPump() {
  runDueTimers();
  return pumpChildren();
}

// Node's error paths: an escaped error goes to 'uncaughtException' listeners;
// a rejection still unhandled after microtasks drain goes to
// 'unhandledRejection' listeners, otherwise it is uncaught.
globalThis.__janisUncaught = (error, origin = "uncaughtException") => {
  if (!process.listenerCount("uncaughtException")) return false;
  process.emit("uncaughtException", error, origin);
  return true;
};
const janisRejections = new Map();
globalThis.__janisRejection = (promise, reason, handled) => {
  if (handled) janisRejections.delete(promise);
  else janisRejections.set(promise, reason);
};
function janisReportRejections() {
  for (const [promise, reason] of janisRejections) {
    janisRejections.delete(promise);
    if (process.listenerCount("unhandledRejection")) process.emit("unhandledRejection", reason, promise);
    else if (!globalThis.__janisUncaught(reason, "unhandledRejection")) throw reason;
  }
}

// Called by quickjs-main.c after draining each microtask batch. It blocks only
// inside the Wasm worker and keeps the runtime alive exactly while referenced
// timers or resumed stdin listeners exist.
globalThis.__janisPump = () => {
  janisReportRejections();
  if (janisStreamPump()) return true;
  const pumpedHttp = Boolean(globalThis.__dollyHttpPump?.());
  const referenced = [...janisTimers.values()].filter((timer) => timer.ref);
  const wantsInput = janisStdin.isActive();
  const activeChildren = [...janisChildren.values()].some(record => record.ref);
  if (!(wantsInput && janisStdin.refed) && referenced.length === 0 && !pumpedHttp && !activeChildren) return false;
  const nextDue = referenced.length
    ? Math.max(0, Math.min(...referenced.map((timer) => timer.due)) - Date.now())
    : 1000;
  // The worker has one deliberately synchronous event pump. A short timed
  // input wait yields to the browser broker while an HTTP request is active;
  // this preserves timer-driven TUI animation and consumes response chunks as
  // they arrive without adding threads or host async authority.
  const wait = Math.min(pumpedHttp || activeChildren ? 10 : 1000, nextDue);
  let bytes = new Uint8Array(0);
  if (!wantsInput) Dolly.fsPoll([], wait);
  else if (!janisStdin.isTTY) {
    if (Dolly.fsPoll([[0, Dolly.fsConstants.POLLIN]], wait)[0]) bytes = Dolly.readStdin(4096);
    else { janisStreamPump(); return true; }
  } else bytes = Dolly.readRaw(wait);
  const size = Dolly.terminalSize();
  if (size.columns !== janisTerminalSize.columns || size.rows !== janisTerminalSize.rows) {
    janisTerminalSize = size;
    janisStdout.emit("resize");
  }
  janisStdin.publish(bytes);
  if (wantsInput && !janisStdin.isTTY && bytes.length === 0) janisStdin.finish();
  janisStreamPump();
  globalThis.__dollyHttpPump?.();
  return true;
};

globalThis.__janisCleanup = () => {
  for (const record of janisChildren.values()) {
    record.child.kill("SIGKILL");
    if (!record.waited) Dolly.processWait(record.child.pid);
    clearTimeout(record.timer);
    record.signal?.removeEventListener("abort", record.abort);
    for (let index = 0; index < 3; ++index) closeChildFd(record, index);
  }
  janisChildren.clear();
};
