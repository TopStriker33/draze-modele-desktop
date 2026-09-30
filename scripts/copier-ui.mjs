// tsc ne copie que le TypeScript : les écrans locaux (HTML/CSS/JS) doivent
// arriver dans dist/ui pour que `loadFile` les trouve dans l'app empaquetée.
import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const racine = fileURLToPath(new URL("..", import.meta.url));
const vers = path.join(racine, "dist", "ui");
await mkdir(vers, { recursive: true });
await cp(path.join(racine, "src", "ui"), vers, { recursive: true });
console.log(`ui copiée vers ${vers}`);
