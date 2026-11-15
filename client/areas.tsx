import type { ReactNode } from "react";
import { Text, View } from "react-native";
import type { Board, Card, Command, Section, Target } from "../shared/model";
import type { Presentation } from "./presentations";
import { Btn, Disclosure, Label, Row, useColors } from "./ui";
import { makeId } from "../shared/model";
const newCard = (): Card => ({
  id: makeId("card"),
  title: "",
  text: "",
  firstStep: "",
  lane: "later",
  done: false,
  important: false,
  urgent: false,
});
type Props = {
  board: Board;
  presentation: Presentation;
  compact: boolean;
  sidebar?: boolean;
  expanded: string | null;
  width: number;
  busy: boolean;
  onSave: (cmd: Command) => unknown;
  onEditSection: (s: Section) => void;
  onEditCard: (s: Section, c: Card) => void;
  onExpand: (id: string | null) => void;
  onDelete: (cmd: Command) => void;
  onDecision: (card: Card) => void;
  hasInsights: (kind: Target["kind"], id: string) => boolean;
  renderInsights: (kind: Target["kind"], id: string) => ReactNode;
};
export function BoardAreas({
  board,
  presentation,
  compact,
  sidebar = false,
  expanded,
  width,
  busy,
  onSave,
  onEditSection,
  onEditCard,
  onExpand,
  onDelete,
  onDecision,
  hasInsights,
  renderInsights,
}: Props) {
  const c = useColors();
  const sectionActions = (s: Section) => (
    <>
      <Btn onPress={() => onEditSection(s)} disabled={busy}>
        Editar área
      </Btn>
      <Btn onPress={() => onExpand(expanded === s.id ? null : s.id)}>
        {expanded === s.id ? "Voltar ao grid" : "Expandir área"}
      </Btn>
    </>
  );
  const cardStateActions = (s: Section, card: Card) => (
    <>
      <Btn
        onPress={() =>
          onSave({
            type: "card.save",
            sectionId: s.id,
            card: { ...card, done: !card.done },
          })
        }
        disabled={busy}
      >
        {card.done ? "Reabrir" : "Concluir"}
      </Btn>
      <Btn
        onPress={() =>
          onSave({
            type: "focus",
            ...board.focus,
            cardIds: board.focus.cardIds.includes(card.id)
              ? board.focus.cardIds.filter((id) => id !== card.id)
              : [...board.focus.cardIds, card.id],
          })
        }
        disabled={
          busy ||
          card.done ||
          (!board.focus.cardIds.includes(card.id) &&
            board.focus.cardIds.length >= board.focus.limit)
        }
      >
        {board.focus.cardIds.includes(card.id)
          ? "Remover do foco"
          : "Adicionar ao foco"}
      </Btn>
    </>
  );

  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 16,
        alignItems: "flex-start",
      }}
    >
      {board.sections
        .filter((s) => !expanded || s.id === expanded)
        .map((s) => (
          <View
            key={s.id}
            style={{
              flexBasis:
                compact || expanded || presentation === "atelier"
                  ? "100%"
                  : width > 1050
                    ? "31%"
                    : "47%",
              flexGrow: 1,
              minWidth: compact ? 0 : 280,
            }}
          >
            <View
              style={{
                gap: 12,
                paddingTop: 12,
                borderTopWidth: 1,
                borderColor: c.border,
              }}
            >
              <Row>
                <Label large>{s.title || "Área sem título"}</Label>
                <Label
                  muted
                >{`${s.cards.length} ${s.cards.length === 1 ? "card" : "cards"}`}</Label>
              </Row>
              <View
                style={{
                  flexDirection: compact || !expanded ? "column" : "row",
                  gap: 12,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Label muted lines={sidebar && !expanded ? 2 : undefined}>
                    {s.questions ||
                      "Adicione perguntas que orientem o raciocínio."}
                  </Label>
                </View>
                {hasInsights("section", s.id) && (
                  <View style={{ flex: 1 }}>
                    {renderInsights("section", s.id)}
                  </View>
                )}
              </View>
              <Row>
                {!sidebar && sectionActions(s)}
                <Btn onPress={() => onEditCard(s, newCard())} disabled={busy}>
                  Novo card
                </Btn>
                <Disclosure>
                  <Label muted>
                    {s.sourceSuggestionId
                      ? `Origem: sugestão confirmada · ${board.suggestions.find((x) => x.id === s.sourceSuggestionId)?.title || "estrutura revisada"}`
                      : "Origem: autoria humana"}
                  </Label>
                  {sidebar && sectionActions(s)}
                  <Btn
                    onPress={() =>
                      onSave({
                        type: "section.move",
                        id: s.id,
                        direction: "up",
                      })
                    }
                    disabled={busy || board.sections[0]?.id === s.id}
                  >
                    ↑ Área
                  </Btn>
                  <Btn
                    onPress={() =>
                      onSave({
                        type: "section.move",
                        id: s.id,
                        direction: "down",
                      })
                    }
                    disabled={busy || board.sections.at(-1)?.id === s.id}
                  >
                    ↓ Área
                  </Btn>
                  <Btn
                    danger
                    onPress={() =>
                      onDelete({
                        type: "section.delete",
                        id: s.id,
                      })
                    }
                    disabled={busy}
                  >
                    Excluir área
                  </Btn>
                </Disclosure>
              </Row>
              {s.cards.map((card, index) => (
                <View
                  key={card.id}
                  style={{
                    backgroundColor: c.surface0,
                    borderWidth: presentation === "atelier" ? 0 : 1,
                    borderBottomWidth: 1,
                    borderColor: board.focus.cardIds.includes(card.id)
                      ? c.accent
                      : c.border,
                    borderRadius: presentation === "atelier" ? 0 : 10,
                    padding: 14,
                    gap: 9,
                  }}
                >
                  <Row>
                    <Text
                      style={{
                        color: card.done ? c.foregroundMuted : c.foreground,
                        fontSize: 17,
                        fontWeight: "600",
                        textDecorationLine: card.done ? "line-through" : "none",
                      }}
                    >
                      {card.title || "Card sem título"}
                    </Text>
                    <Label muted>
                      {card.done
                        ? "Concluído"
                        : card.lane === "now"
                          ? "Agora"
                          : "Depois"}
                    </Label>
                    {card.important && <Label muted>Importante</Label>}
                    {card.urgent && <Label muted>Urgente</Label>}
                  </Row>
                  <View
                    style={{
                      flexDirection: compact || !expanded ? "column" : "row",
                      gap: 12,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        numberOfLines={
                          expanded || presentation === "atelier" ? undefined : 5
                        }
                        style={{
                          color: c.foreground,
                          lineHeight: 22,
                        }}
                      >
                        {card.text || "Sem conteúdo ainda."}
                      </Text>
                      {!!card.firstStep && (
                        <Label
                          muted
                        >{`Primeiro passo: ${card.firstStep}`}</Label>
                      )}
                    </View>
                    {hasInsights("card", card.id) && (
                      <View style={{ flex: 1 }}>
                        {renderInsights("card", card.id)}
                      </View>
                    )}
                  </View>
                  <Row>
                    <Btn onPress={() => onEditCard(s, card)} disabled={busy}>
                      Editar card
                    </Btn>
                    {!sidebar && cardStateActions(s, card)}
                    <Disclosure>
                      <Label muted>
                        {card.sourceSuggestionId
                          ? `Origem: sugestão confirmada · ${board.suggestions.find((x) => x.id === card.sourceSuggestionId)?.title || "card revisado"}`
                          : "Origem: autoria humana"}
                      </Label>
                      {sidebar && cardStateActions(s, card)}
                      <Btn
                        onPress={() =>
                          onSave({
                            type: "card.move",
                            id: card.id,
                            sectionId: s.id,
                            direction: "up",
                          })
                        }
                        disabled={busy || index === 0}
                      >
                        ↑ Card
                      </Btn>
                      <Btn
                        onPress={() =>
                          onSave({
                            type: "card.move",
                            id: card.id,
                            sectionId: s.id,
                            direction: "down",
                          })
                        }
                        disabled={busy || index === s.cards.length - 1}
                      >
                        ↓ Card
                      </Btn>
                      <Btn onPress={() => onDecision(card)}>
                        Registrar decisão
                      </Btn>
                      <Btn
                        danger
                        onPress={() =>
                          onDelete({
                            type: "card.delete",
                            id: card.id,
                          })
                        }
                        disabled={busy}
                      >
                        Excluir card
                      </Btn>
                    </Disclosure>
                  </Row>
                  {expanded && board.sections.length > 1 && (
                    <Row>
                      <Label muted>Mover para:</Label>
                      {board.sections
                        .filter((x) => x.id !== s.id)
                        .map((dest) => (
                          <Btn
                            key={dest.id}
                            disabled={busy}
                            onPress={() =>
                              onSave({
                                type: "card.move",
                                id: card.id,
                                sectionId: dest.id,
                                direction: "down",
                              })
                            }
                          >
                            {dest.title || "Sem título"}
                          </Btn>
                        ))}
                    </Row>
                  )}
                </View>
              ))}
            </View>
          </View>
        ))}
    </View>
  );
}
