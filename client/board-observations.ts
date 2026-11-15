import type { RpcOutput } from "@getpaseo/plugin";
import { getBoardRpc } from "../shared/rpc";
import { ProjectObservations } from "../shared/observations";
export const boardObservations = new ProjectObservations<
  RpcOutput<typeof getBoardRpc>
>((next, previous) => {
  if (
    previous &&
    previous.fingerprint !== "missing" &&
    next.fingerprint === "missing"
  )
    throw new Error(
      "O arquivo canônico desapareceu. Último estado válido preservado; restaure o arquivo antes de continuar.",
    );
});
