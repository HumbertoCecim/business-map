import { useState } from "react";
import { Text, View } from "react-native";
import type { Board, Card, Command, Section } from "../shared/model";
import { Btn, Label, Pane, Row, useColors } from "./ui";

export function FocusStrip({
  board,
  compact,
  busy,
  onSave,
  onEdit,
}: {
  board: Board;
  compact: boolean;
  busy: boolean;
  onSave: (command: Extract<Command, { type: "focus" }>) => unknown;
  onEdit: (section: Section, card: Card) => void;
}) {
  const [settings, setSettings] = useState(false);
  const c = useColors();
  return (
    <Pane accent>
      <Row>
        <Label large>Foco</Label>
        <Label
          muted
        >{`${board.focus.cardIds.length}/${board.focus.limit} · você escolhe`}</Label>
        <Btn onPress={() => setSettings(!settings)}>
          {settings ? "Fechar opções de foco" : "Opções de foco"}
        </Btn>
      </Row>
      {settings && (
        <Row>
          <Btn
            disabled={busy}
            onPress={() =>
              onSave({
                type: "focus",
                ...board.focus,
                visible: !board.focus.visible,
              })
            }
          >
            {board.focus.visible ? "Ocultar foco" : "Mostrar foco"}
          </Btn>
          {([1, 3, 5] as const).map((n) => (
            <Btn
              key={n}
              selected={board.focus.limit === n}
              disabled={busy}
              onPress={() =>
                onSave({
                  type: "focus",
                  ...board.focus,
                  limit: n,
                  cardIds: board.focus.cardIds.slice(0, n),
                })
              }
            >{`${n}`}</Btn>
          ))}
        </Row>
      )}
      {board.focus.visible && (
        <View
          style={{
            flexDirection: compact ? "column" : "row",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          {board.focus.cardIds.length === 0 && (
            <Label muted>
              Adicione cards ao foco para escolher os próximos passos.
            </Label>
          )}
          {board.focus.cardIds.map((id, index) => {
            const s = board.sections.find((s) =>
              s.cards.some((card) => card.id === id),
            );
            const card = s?.cards.find((card) => card.id === id);
            if (!s || !card) return null;
            return (
              <View
                key={id}
                style={{
                  flex: compact ? undefined : 1,
                  minWidth: compact ? 0 : 130,
                  gap: 5,
                }}
              >
                <Btn
                  disabled={busy}
                  onPress={() => onEdit(s, card)}
                >{`${index + 1}. ${card.title || "Sem título"}`}</Btn>
                <Text
                  numberOfLines={2}
                  style={{
                    color: c.foregroundMuted,
                    fontSize: 13,
                    lineHeight: 19,
                  }}
                >
                  {card.firstStep || "Defina um primeiro passo."}
                </Text>
                {settings && (
                  <Row>
                    {index > 0 && (
                      <Btn
                        disabled={busy}
                        onPress={() => {
                          const ids = [...board.focus.cardIds];
                          [ids[index - 1], ids[index]] = [
                            ids[index],
                            ids[index - 1],
                          ];
                          onSave({
                            type: "focus",
                            ...board.focus,
                            cardIds: ids,
                          });
                        }}
                      >
                        Subir no foco
                      </Btn>
                    )}
                    <Btn
                      disabled={busy}
                      onPress={() =>
                        onSave({
                          type: "focus",
                          ...board.focus,
                          cardIds: board.focus.cardIds.filter((x) => x !== id),
                        })
                      }
                    >
                      Remover do foco
                    </Btn>
                  </Row>
                )}
              </View>
            );
          })}
        </View>
      )}
    </Pane>
  );
}
