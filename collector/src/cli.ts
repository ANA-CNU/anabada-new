import { CollectorBootstrap } from "./application/application.js";

await CollectorBootstrap.create(process.env).run(process.argv);
