import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startService } from "../../local/server";
import { setHumanSession } from "../service-client";

/** Real local service, isolated runtime credentials, no provider/model execution. */
export async function adapterServices(roots: string[], options: { pair?: boolean } = {}) {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), "business-adapter-runtime-"));
  const priorHome = process.env.BUSINESS_MAP_HOME;
  process.env.BUSINESS_MAP_HOME = runtimeHome;
  const services: Awaited<ReturnType<typeof startService>>[] = [];
  const close = async () => {
    try { for (const service of services.reverse()) await service.stop(); }
    finally {
      if (priorHome === undefined) delete process.env.BUSINESS_MAP_HOME;
      else process.env.BUSINESS_MAP_HOME = priorHome;
      if (path.dirname(runtimeHome) !== path.resolve(os.tmpdir()) || !path.basename(runtimeHome).startsWith("business-adapter-runtime-")) throw new Error("Invalid test runtime cleanup target.");
      await rm(runtimeHome, { recursive: true, force: true });
    }
  };
  try {
    for (const root of roots) {
      const service = await startService({ root });
      services.push(service);
      // Test capability comes from this process's service instance, never its locator file.
      if (options.pair !== false) await setHumanSession(root, service.runtime.humanToken);
    }
    return { services, close };
  } catch (error) { await close(); throw error; }
}
