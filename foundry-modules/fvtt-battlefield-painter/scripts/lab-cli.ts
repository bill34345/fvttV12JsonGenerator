import { createModuleLabConfig, installLocal, verifyInstall } from "./lab";

const action = process.argv[2] ?? "verify-install";
if (action === "install") {
  console.log(
    JSON.stringify(
      await installLocal(createModuleLabConfig(), process.argv.includes("--apply")),
      null,
      2,
    ),
  );
} else if (action === "verify-install") {
  console.log(
    JSON.stringify(await verifyInstall(createModuleLabConfig()), null, 2),
  );
} else {
  throw new Error(`Unsupported action: ${action}`);
}
