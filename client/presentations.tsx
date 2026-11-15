import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { z } from "zod";
import type { Board, Card, Command, Section } from "../shared/model";
import { FocusStrip } from "./focus";
import { Btn, Disclosure, Label, Row, useColors } from "./ui";

export const presentationSchema = z.object({
  presentation: z.enum(["panorama", "atelier", "compass", "canvas"]),
});
export type Presentation = z.infer<typeof presentationSchema>["presentation"];
type Props = {
  board: Board;
  compact: boolean;
  busy: boolean;
  onSave: (command: Extract<Command, { type: "focus" }>) => unknown;
  onEdit: (section: Section, card: Card) => void;
  onResume: () => void;
  onArea: (id: string | null) => void;
};

export function CompassOverview({
  board,
  compact,
  busy,
  onSave,
  onEdit,
  onResume,
  onArea,
}: Props) {
  const c = useColors();
  const focused = board.sections
    .flatMap((s) => s.cards.map((card) => ({ section: s, card })))
    .filter((x) => board.focus.cardIds.includes(x.card.id));
  const next = focused.find((x) => x.card.id === board.focus.cardIds[0]);
  const decisions = board.memories.filter((m) => m.kind === "decision");
  const latest = decisions.at(-1);
  const later = board.sections.flatMap((s) =>
    s.cards
      .filter((card) => card.lane === "later" && !card.done)
      .map((card) => ({ section: s, card })),
  );
  return (
    <View style={{ gap: 16 }}>
      <View
        style={{
          flexDirection: compact ? "column" : "row",
          gap: 24,
          alignItems: "flex-start",
        }}
      >
        <View style={{ flex: compact ? undefined : 1.5, gap: 14 }}>
          <Label large>O próximo passo</Label>
          {next ? (
            <>
              <Text
                style={{
                  color: c.foreground,
                  fontWeight: "600",
                  fontSize: 26,
                  lineHeight: 34,
                }}
              >
                {next.card.firstStep ||
                  next.card.title ||
                  "Defina um primeiro passo"}
              </Text>
              <Label muted>
                {next.card.firstStep
                  ? next.card.title
                  : "Este é o primeiro card do foco escolhido por você."}
              </Label>
              <Row>
                <Btn
                  primary
                  disabled={busy}
                  onPress={() => onEdit(next.section, next.card)}
                >
                  Abrir próximo passo
                </Btn>
                <Btn onPress={() => onArea(next.section.id)}>
                  Ver área deste passo
                </Btn>
              </Row>
            </>
          ) : (
            <>
              <Label>
                Escolha um card no quadro para definir por onde começar.
              </Label>
              <Btn onPress={() => onArea(null)}>Explorar todas as áreas</Btn>
            </>
          )}
          <View
            style={{
              borderTopWidth: 1,
              borderColor: c.border,
              paddingTop: 12,
              gap: 7,
            }}
          >
            <Row>
              <Label>Onde parei</Label>
              <Btn onPress={onResume}>Editar retomada</Btn>
            </Row>
            <Label muted>
              {board.whereStopped || "Anote uma frase para retomar o trabalho."}
            </Label>
            {latest && (
              <>
                <Label>Última decisão</Label>
                <Label muted>{latest.text}</Label>
              </>
            )}
          </View>
          <FocusStrip
            board={board}
            compact={compact}
            busy={busy}
            onSave={onSave}
            onEdit={onEdit}
          />
        </View>
        <View
          style={{
            flex: compact ? undefined : 1,
            gap: 10,
            alignSelf: "stretch",
            backgroundColor: c.surface1,
            padding: 14,
            borderRadius: 8,
          }}
        >
          <Label large>Todas as áreas</Label>
          {board.sections.length === 0 ? (
            <Label muted>
              As áreas que você criar aparecerão neste índice.
            </Label>
          ) : (
            board.sections.map((s) => (
              <View
                key={s.id}
                style={{
                  borderTopWidth: 1,
                  borderColor: c.border,
                  paddingTop: 8,
                  gap: 4,
                }}
              >
                <Btn onPress={() => onArea(s.id)}>
                  {s.title || "Área sem título"}
                </Btn>
                <Label
                  muted
                >{`${s.cards.filter((card) => card.lane === "now" && !card.done).length} Agora · ${s.cards.filter((card) => card.lane === "later" && !card.done).length} Depois · ${s.cards.filter((card) => card.done).length} concluídos`}</Label>
              </View>
            ))
          )}
          <Btn onPress={() => onArea(null)}>Ver quadro completo</Btn>
        </View>
      </View>
      {later.length > 0 && (
        <Disclosure block label={`Para depois (${later.length})`}>
          <View style={{ gap: 8 }}>
            {later.slice(0, 5).map(({ section, card }) => (
              <Row key={card.id}>
                <Btn disabled={busy} onPress={() => onEdit(section, card)}>
                  {card.title || "Card sem título"}
                </Btn>
                <Label muted>{section.title}</Label>
              </Row>
            ))}
            {later.length > 5 && (
              <Label muted>
                O índice acima permite explorar todos os cards de Depois.
              </Label>
            )}
          </View>
        </Disclosure>
      )}
    </View>
  );
}

export function AtelierRail({
  board,
  busy,
  onSave,
  onEdit,
  onResume,
  children,
}: Props & { children: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 8 }}>
        <Label large>Apoio ao raciocínio</Label>
        <Label muted>Foco, sugestões do agente e decisões confirmadas.</Label>
      </View>
      <FocusStrip
        board={board}
        compact
        busy={busy}
        onSave={onSave}
        onEdit={onEdit}
      />
      <View
        style={{
          gap: 8,
          borderTopWidth: 1,
          borderColor: c.border,
          paddingTop: 14,
        }}
      >
        <Row>
          <Label>Onde parei</Label>
          <Btn onPress={onResume}>Editar retomada</Btn>
        </Row>
        <Label muted>{board.whereStopped || "Uma frase para retomar."}</Label>
      </View>
      {children}
      <View
        style={{
          gap: 10,
          borderTopWidth: 1,
          borderColor: c.border,
          paddingTop: 14,
        }}
      >
        <Label large>Decisões confirmadas</Label>
        {board.memories
          .filter((m) => m.kind === "decision")
          .slice(-3)
          .reverse()
          .map((m) => (
            <View key={m.id} style={{ gap: 4 }}>
              <Label>{m.text}</Label>
              <Label muted>{m.rationale}</Label>
            </View>
          ))}
        {!board.memories.some((m) => m.kind === "decision") && (
          <Label muted>
            Registre decisões no card ou na aba Contexto e decisões.
          </Label>
        )}
      </View>
    </View>
  );
}
