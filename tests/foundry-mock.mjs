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

/** Compendiums: id → { documentName, collection, metadata, index: [entries] }. */
export const packs = new Map();
export function addPack(id, entries, { label = id, packageName = id.split(".")[0], packageType = "system" } = {}) {
  packs.set(id, {
    documentName: "Item", collection: id, metadata: { label, packageName, packageType },
    getIndex: async () => entries.map((e) => ({ ...e, uuid: `Compendium.${id}.Item.${e._id}` })),
  });
}

export const settings = new Map();
export const menus = new Map();
const settingsApi = {
  register: (scope, key, cfg) => { settings.set(`${scope}.${key}`, { cfg, value: structuredClone(cfg.default) }); },
  // Foundry v12 refuses a menu whose type isn't an application class (FormApplication or ApplicationV2).
  registerMenu: (scope, key, cfg) => {
    if (!(typeof cfg?.type === "function" && cfg.type.prototype instanceof ApplicationV2)) {
      throw new Error("You must provide a menu type that is a FormApplication or ApplicationV2 instance or subclass");
    }
    menus.set(`${scope}.${key}`, cfg);
  },
  get: (scope, key) => structuredClone(settings.get(`${scope}.${key}`)?.value),
  set: async (scope, key, value) => {
    writes.push({ op: "settings.set", key: `${scope}.${key}`, value: structuredClone(value) });
    const s = settings.get(`${scope}.${key}`); s.value = structuredClone(value); s.cfg.onChange?.(value);
  },
};

export function install({ isGM = true } = {}) {
  globalThis.foundry = {
    applications: { api: { ApplicationV2, HandlebarsApplicationMixin: (C) => C } },
    utils: { deepClone: (x) => structuredClone(x) },
  };
  globalThis.game = {
    user: { isGM },
    i18n: { localize: (k) => k, format: (k, d) => `${k} ${JSON.stringify(d)}` },
    folders,
    packs: Object.assign(packs, { filter: (fn) => [...packs.values()].filter(fn) }),
    settings: settingsApi,
    system: { id: "dnd5e", title: "D&D Fifth Edition" },
    modules: { get: () => null },
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
