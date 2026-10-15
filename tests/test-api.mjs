import { registerProperties, registerChangeType, getChangeType, getProperty, listProperties, _resetRegistries } from "../scripts/api.mjs";
import { check, throws } from "./check.mjs";

_resetRegistries();
const good = { id: "flaming", slot: "prefix", cost: 3, weight: 10, appliesTo: ["weapon"], changes: [] };
let res = registerProperties("test", [good]);
check("valid property registers", res.added.length === 1 && res.errors.length === 0);
check("registered property keeps its source", getProperty("flaming")?.source === "test");
check("registered property is a copy", (good.cost = 99, getProperty("flaming").cost === 3));

res = registerProperties("other", [{ ...good }]);
check("duplicate id is rejected", res.added.length === 0 && /already registered/.test(res.errors[0]));

res = registerProperties("test", [{ id: "bad", slot: "middle", cost: -1, appliesTo: [], changes: {} }]);
check("invalid property is rejected with every problem", res.added.length === 0 && res.errors.length >= 4, res.errors.join("; "));
check("invalid property is not half-registered", getProperty("bad") === null);
check("listProperties filters", listProperties((p) => p.slot === "prefix").length === 1);

registerChangeType("itemField", () => {});
check("change type registers", typeof getChangeType("itemField") === "function");
throws("duplicate change type throws", () => registerChangeType("itemField", () => {}));
throws("change type needs a function", () => registerChangeType("other", null));
