// Minimal Foundry v12 + dnd5e globals, enough to drive the builder's logic in Node.
// Records every world write in `writes` so tests can assert exactly what PMI changed.
export const writes = [];
export const notes = [];

class ApplicationV2 {
  constructor() { this.element = { querySelector: () => null, addEventListener: () => {} }; this.rendered = 0; }
  render() { this.rendered++; return this; }
  _onRender() {}
}

export class MockItem {
  static validateThrows = false;
  constructor(data) {
    if (MockItem.validateThrows) throw new Error("mock validation failure");
    Object.assign(this, structuredClone(data));
    this.id ??= `item${writes.length}`;
    this.sheet = { render: () => {} };
  }
  toObject() { const { sheet, ...rest } = this; return structuredClone(rest); }
  getFlag(scope, key) { return this.flags?.[scope]?.[key]; }
  static async create(data) { writes.push({ op: "Item.create", data: structuredClone(data) }); return new MockItem(data); }
}
MockItem.implementation = MockItem;

class MockFolder {
  constructor(data) { Object.assign(this, data); this.id = `folder${folders.length}`; }
  getFlag(scope, key) { return this.flags?.[scope]?.[key]; }
  static async create(data) { writes.push({ op: "Folder.create", data: structuredClone(data) }); const f = new MockFolder(data); folders.push(f); return f; }
}
MockFolder.implementation = MockFolder;
export const folders = [];

export const uuids = new Map();

export function install({ isGM = true } = {}) {
  globalThis.foundry = {
    applications: { api: { ApplicationV2, HandlebarsApplicationMixin: (C) => C } },
    utils: { deepClone: (x) => structuredClone(x) },
  };
  globalThis.game = {
    user: { isGM },
    i18n: { localize: (k) => k, format: (k, d) => `${k} ${JSON.stringify(d)}` },
    folders,
    packs: { get: () => null },
    items: { get: () => null },
  };
  globalThis.ui = { notifications: { warn: (m) => notes.push(["warn", m]), info: (m) => notes.push(["info", m]), error: (m) => notes.push(["error", m]) } };
  globalThis.CONFIG = { DND5E: { itemRarity: {} } };
  globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 } };
  globalThis.Item = MockItem;
  globalThis.Folder = MockFolder;
  globalThis.TextEditor = { enrichHTML: async (h) => h, getDragEventData: () => null };
  globalThis.fromUuid = async (u) => uuids.get(u) ?? null;
}
