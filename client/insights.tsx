import { useState } from "react";
import { Text, View } from "react-native";
import type { Suggestion } from "../shared/model";
import { Btn, Disclosure, Label, Row, useColors } from "./ui";
import { AgentSource } from "./labels";

/** Contextual agent material stays visibly separate from human content. */
export function RelatedInsights({
  suggestions,
  busy,
  onIncorporate,
  onReview,
  compact = false,
}: {
  suggestions: Suggestion[];
  busy: boolean;
  onIncorporate: (s: Suggestion) => void;
  onReview: () => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const c = useColors();
  const kept = suggestions.filter((s) => s.status === "kept");
  const pending = suggestions.filter((s) => s.status === "pending");
  if (!kept.length && !pending.length) return null;
  if (compact)
    return (
      <Btn
        disabled={busy}
        onPress={onReview}
      >{`Revisar ${kept.length + pending.length} dica${kept.length + pending.length === 1 ? "" : "s"} do agente`}</Btn>
    );
  const visible = [...kept, ...(open ? pending : [])];
  return (
    <View
      style={{
        backgroundColor: c.surface2,
        borderColor: c.border,
        borderLeftWidth: 1,
        padding: 10,
        gap: 8,
        borderRadius: 6,
      }}
    >
      <Label muted>Dicas do agente</Label>
      {pending.length > 0 && (
        <Btn
          onPress={() => setOpen(!open)}
        >{`${open ? "Ocultar" : "Ver"} ${pending.length} pendente${pending.length === 1 ? "" : "s"}`}</Btn>
      )}
      {visible.map((s) => (
        <View key={s.id} style={{ gap: 5 }}>
          <Text
            style={{ color: c.foreground, fontWeight: "600", fontSize: 13 }}
          >
            {s.title || "Sugestão"} ·{" "}
            {s.status === "kept" ? "mantida" : "pendente"}
          </Text>
          <Text style={{ color: c.foreground, lineHeight: 20, fontSize: 13 }}>
            {s.text}
          </Text>
          <AgentSource agentId={s.sourceAgentId} />
          {s.stale && (
            <Label muted>Revise o contexto anterior antes de incorporar.</Label>
          )}
          <Disclosure block label="Detalhes da origem">
            <Label
              muted
            >{`Agente: ${s.sourceAgentId}\nRevisão base: ${s.baseRevision}\nSugestão: ${s.id}`}</Label>
          </Disclosure>
          <Row>
            <Btn disabled={busy} onPress={() => onIncorporate(s)}>
              {s.kind === "map_draft"
                ? "Revisar no Business Map"
                : s.kind === "memory"
                ? "Revisar memória"
                : s.kind === "structure"
                  ? "Revisar estrutura"
                  : "Editar com esta dica"}
            </Btn>
          </Row>
        </View>
      ))}
      <Btn onPress={onReview}>Revisar todas as sugestões</Btn>
    </View>
  );
}
