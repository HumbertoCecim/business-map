import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { Board, Card, Section, Suggestion } from "../shared/model";
import {
  canvasLayout,
  canvasNotes,
  canvasSelection,
} from "../shared/canvas-layout";
import { Label, Row, useColors } from "./ui";

type Props = {
  board: Board;
  width: number;
  compact: boolean;
  busy: boolean;
  onEditSection: (section: Section) => void;
  onEditCard: (section: Section, card: Card) => void;
  onArea: (id: string) => void;
  onReview: (suggestion?: Suggestion) => void;
};

function SheetAction({
  label,
  onPress,
  children,
  disabled = false,
  selected = false,
  dashed = false,
  note = false,
  emphasized = false,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  selected?: boolean;
  dashed?: boolean;
  note?: boolean;
  emphasized?: boolean;
}) {
  const c = useColors();
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={({ pressed }) => ({
        minHeight: note ? 44 : 28,
        minWidth: 0,
        maxWidth: "100%",
        overflow: "hidden",
        flexShrink: 1,
        padding: focused ? 3 : 4,
        borderWidth: focused ? 2 : 1,
        borderColor:
          focused || selected || emphasized
            ? c.accent
            : dashed
              ? c.foregroundMuted
              : note
                ? c.border
                : "transparent",
        borderStyle: dashed ? "dashed" : "solid",
        backgroundColor:
          note || hovered || pressed ? c.surface2 : "transparent",
        borderRadius: note ? 3 : 2,
        opacity: disabled ? 0.5 : 1,
        gap: 2,
      })}
    >
      {children}
    </Pressable>
  );
}

/** A single contiguous sheet; every edit delegates to the existing board editor. */
export function CanvasSheet({
  board,
  width,
  compact,
  busy,
  onEditSection,
  onEditCard,
  onArea,
  onReview,
}: Props) {
  const c = useColors();
  const narrow = compact || width < 800;
  const arrangement = canvasLayout(
    board.sections.map((s) => s.id),
    narrow ? (width >= 560 ? 2 : 1) : 5,
  );
  const [selected, setSelected] = useState<{
    sectionId: string;
    cardId?: string;
  } | null>(null);
  const proposals = board.suggestions.filter((s) => s.status === "pending");
  const structureProposals = proposals.filter(
    (s) => s.kind === "structure" && s.structure.length > 0,
  );
  const candidateSections = structureProposals.flatMap((s) =>
    s.structure.map((item, index) => ({ suggestion: s, item, index })),
  );
  function edit(sectionId: string, cardId?: string) {
    const item = canvasSelection(board, sectionId, cardId);
    if (!item) return;
    setSelected({ sectionId, cardId });
    if (item.card) onEditCard(item.section, item.card);
    else onEditSection(item.section);
  }
  function cell(sectionId: string, stacked: boolean, wide: boolean) {
    const section = board.sections.find((s) => s.id === sectionId)!;
    const limit = narrow ? 1 : stacked ? 2 : wide ? 4 : 3;
    const notes = canvasNotes(section, limit);
    const related = proposals.filter(
      (s) =>
        s.target.id === section.id ||
        section.cards.some((card) => card.id === s.target.id),
    );
    return (
      <View
        key={section.id}
        style={{
          flex: 1,
          minWidth: 0,
          backgroundColor: c.surface0,
          padding: narrow ? 10 : 8,
          gap: 5,
          borderRightWidth: 1,
          borderBottomWidth: 1,
          borderColor: c.border,
          minHeight: narrow ? 130 : stacked ? 154 : 174,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 3,
            minWidth: 0,
            width: "100%",
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <SheetAction
              label={`Editar área ${section.title || "sem título"}`}
              onPress={() => edit(section.id)}
              disabled={busy}
              selected={selected?.sectionId === section.id && !selected.cardId}
            >
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  lineHeight: 17,
                  color: c.foreground,
                }}
              >
                {section.title || "Área sem título"}
              </Text>
            </SheetAction>
          </View>
          <Text
            accessibilityLabel={`${section.cards.length} cards nesta área`}
            style={{ color: c.foregroundMuted, fontSize: 11 }}
          >
            {section.cards.length}
          </Text>
        </View>
        {!!section.questions && (
          <Text
            numberOfLines={1}
            style={{ fontSize: 11, lineHeight: 15, color: c.foregroundMuted }}
          >
            {section.questions}
          </Text>
        )}
        <View
          style={{
            gap: 4,
            minWidth: 0,
            width: "100%",
            flexDirection: wide && !narrow ? "row" : "column",
            flexWrap: "wrap",
          }}
        >
          {notes.visible.map((card) => {
            const focused = board.focus.cardIds.includes(card.id);
            return (
              <View
                key={card.id}
                style={
                  wide && !narrow
                    ? { flexBasis: "47%", flexGrow: 1, minWidth: 0 }
                    : { minWidth: 0, maxWidth: "100%", alignSelf: "stretch" }
                }
              >
                <SheetAction
                  note
                  emphasized={focused}
                  label={`Editar card ${card.title || "sem título"}. ${card.done ? "Concluído" : card.lane === "now" ? "Agora" : "Depois"}${focused ? ". No foco humano" : ""}${card.important ? ". Importante" : ""}${card.urgent ? ". Urgente" : ""}`}
                  onPress={() => edit(section.id, card.id)}
                  disabled={busy}
                  selected={selected?.cardId === card.id}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      minWidth: 0,
                      width: "100%",
                      gap: 4,
                      alignItems: "center",
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      style={{
                        flex: 1,
                        flexShrink: 1,
                        minWidth: 0,
                        color: c.foreground,
                        fontSize: 12,
                        fontWeight: "600",
                        lineHeight: 16,
                        textDecorationLine: card.done ? "line-through" : "none",
                      }}
                    >
                      {card.title || "Card sem título"}
                    </Text>
                    <Text
                      style={{
                        color: focused ? c.accent : c.foregroundMuted,
                        fontSize: 10,
                        lineHeight: 14,
                      }}
                    >
                      {focused
                        ? "Foco"
                        : card.done
                          ? "Feito"
                          : card.lane === "now"
                            ? "Agora"
                            : "Depois"}
                    </Text>
                  </View>
                  <Text
                    numberOfLines={1}
                    style={{
                      minWidth: 0,
                      maxWidth: "100%",
                      flexShrink: 1,
                      fontSize: 11,
                      lineHeight: 15,
                      color: c.foregroundMuted,
                    }}
                  >{`${card.important ? "Importante · " : ""}${card.urgent ? "Urgente · " : ""}${card.text || card.firstStep || "Sem texto"}`}</Text>
                </SheetAction>
              </View>
            );
          })}
        </View>
        {section.cards.length === 0 && (
          <Text
            style={{ fontSize: 12, lineHeight: 17, color: c.foregroundMuted }}
          >
            Ainda sem notas.
          </Text>
        )}
        <View
          style={{
            marginTop: "auto",
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 3,
            alignItems: "center",
            paddingTop: 3,
          }}
        >
          <SheetAction
            label={`Abrir área ${section.title || "sem título"} com todos os ${section.cards.length} cards`}
            onPress={() => onArea(section.id)}
          >
            <Text
              style={{ color: c.foregroundMuted, fontSize: 11, lineHeight: 15 }}
            >
              {notes.remaining > 0
                ? `+${notes.remaining} · ver todas`
                : "Abrir área"}
            </Text>
          </SheetAction>
          {related.length > 0 && (
            <SheetAction
              dashed
              label={`Revisar ${related.length} propostas ligadas à área ${section.title}`}
              onPress={() => onReview()}
            >
              <Text
                style={{
                  color: c.foregroundMuted,
                  fontSize: 10,
                  lineHeight: 14,
                }}
              >{`${related.length} proposta${related.length === 1 ? "" : "s"}`}</Text>
            </SheetAction>
          )}
        </View>
      </View>
    );
  }
  return (
    <View style={{ gap: 10 }}>
      <View
        accessibilityLabel={`Canvas com ${board.sections.length} áreas e ${board.sections.reduce((n, s) => n + s.cards.length, 0)} cards`}
        style={{
          borderTopWidth: 1,
          borderLeftWidth: 1,
          borderColor: c.border,
          backgroundColor: c.surface0,
        }}
      >
        {arrangement.bands.map((band, index) => (
          <View
            key={index}
            style={{ flexDirection: "row", alignItems: "stretch" }}
          >
            {band.columns.map((column, columnIndex) => (
              <View
                key={columnIndex}
                style={{ flex: column.span, minWidth: 0 }}
              >
                {column.sectionIds.map((id) =>
                  cell(id, column.sectionIds.length > 1, column.span > 1),
                )}
              </View>
            ))}
          </View>
        ))}
      </View>
      <Row>
        <Text
          style={{ fontSize: 11, lineHeight: 16, color: c.foregroundMuted }}
        >
          Notas do quadro · foco e marcações escolhidos por você
        </Text>
        <Text
          style={{ fontSize: 11, lineHeight: 16, color: c.foregroundMuted }}
        >
          Tracejado: proposta pendente
        </Text>
      </Row>
      {candidateSections.length > 0 && (
        <View style={{ gap: 7, paddingTop: 4 }}>
          <Label
            muted
          >{`Áreas propostas pelo agente (${candidateSections.length}) · fora do quadro até sua confirmação`}</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {candidateSections
              .slice(0, narrow ? 2 : 4)
              .map(({ suggestion, item, index }) => (
                <View
                  key={`${suggestion.id}:${index}`}
                  style={{
                    flexBasis: narrow ? "100%" : "23%",
                    flexGrow: 1,
                    minWidth: 0,
                  }}
                >
                  <SheetAction
                    dashed
                    note
                    label={`Revisar área proposta ${item.title || "sem título"}`}
                    disabled={busy}
                    onPress={() => onReview(suggestion)}
                  >
                    <Text
                      numberOfLines={1}
                      style={{
                        fontSize: 12,
                        fontWeight: "500",
                        lineHeight: 17,
                        color: c.foregroundMuted,
                      }}
                    >
                      {item.title || "Área proposta"}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontSize: 11,
                        lineHeight: 15,
                        color: c.foregroundMuted,
                      }}
                    >
                      {item.questions || "Prévia editável"}
                    </Text>
                  </SheetAction>
                </View>
              ))}
          </View>
          {candidateSections.length > (narrow ? 2 : 4) && (
            <SheetAction
              label="Revisar demais áreas propostas"
              onPress={() => onReview()}
            >
              <Label
                muted
              >{`+${candidateSections.length - (narrow ? 2 : 4)} propostas na revisão`}</Label>
            </SheetAction>
          )}
        </View>
      )}
    </View>
  );
}
