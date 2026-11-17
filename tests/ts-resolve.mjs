// Permet d'exécuter les tests .ts avec Node (import sans extension, comme dans le code Vite) :
//   node --import ./tests/ts-resolve.mjs --experimental-strip-types tests/generate.test.ts
import { register } from "node:module";
register("data:text/javascript," + encodeURIComponent(`export async function resolve(s, c, n) { try { return await n(s, c); } catch (e) { if (e.code === "ERR_MODULE_NOT_FOUND" && s.startsWith(".")) return n(s + ".ts", c); throw e; } }`));
