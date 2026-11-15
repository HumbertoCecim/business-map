import { createContext, useContext, useState, type ReactNode } from "react";
import type { PluginTheme } from "@getpaseo/plugin";
import { Pressable, Text, TextInput, View } from "react-native";
export const ThemeContext = createContext<PluginTheme | null>(null);
export function useColors() {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error("Tema ausente");
  return theme.colors;
}
export function Label({
  children,
  muted = false,
  large = false,
  lines,
}: {
  children: ReactNode;
  muted?: boolean;
  large?: boolean;
  lines?: number;
}) {
  const c = useColors();
  return (
    <Text
      numberOfLines={lines}
      style={{
        color: muted ? c.foregroundMuted : c.foreground,
        fontSize: large ? 21 : 14,
        lineHeight: large ? 28 : 21,
        fontWeight: large ? "600" : "400",
      }}
    >
      {children}
    </Text>
  );
}
export function Row({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
      }}
    >
      {children}
    </View>
  );
}
export function Disclosure({
  children,
  label = "Mais ações",
  block = false,
  dense = false,
}: {
  children: ReactNode;
  label?: string;
  block?: boolean;
  dense?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Btn dense={dense} selected={open} onPress={() => setOpen(!open)}>
        {open ? "Fechar ações" : label}
      </Btn>
      {open &&
        (block ? (
          <View style={{ gap: 8 }}>{children}</View>
        ) : (
          <Row>{children}</Row>
        ))}
    </View>
  );
}
export function Pane({
  children,
  accent = false,
}: {
  children: ReactNode;
  accent?: boolean;
}) {
  const c = useColors();
  return (
    <View
      style={{
        backgroundColor: c.surface1,
        borderColor: accent ? c.accent : c.border,
        borderWidth: 1,
        borderRadius: 14,
        padding: 16,
        gap: 12,
      }}
    >
      {children}
    </View>
  );
}
export function Btn({
  children,
  onPress,
  disabled = false,
  primary = false,
  danger = false,
  selected = false,
  dense = false,
}: {
  children: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
  selected?: boolean;
  dense?: boolean;
}) {
  const c = useColors();
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={children}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={({ pressed }) => ({
        minHeight: dense ? 32 : 40,
        paddingVertical: dense ? (focused ? 4 : 5) : focused ? 8 : 9,
        paddingHorizontal: dense ? (focused ? 8 : 9) : focused ? 11 : 12,
        borderWidth: focused ? 2 : 1,
        borderColor: focused || selected || primary ? c.accent : c.border,
        borderRadius: 9,
        backgroundColor: primary
          ? c.accent
          : selected || hovered || pressed
            ? c.surface2
            : c.surface1,
        opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
      })}
    >
      <Text
        style={{
          color: primary
            ? c.accentForeground
            : danger
              ? c.statusDanger
              : c.foreground,
          fontSize: 13,
          fontWeight: "500",
        }}
      >
        {children}
      </Text>
    </Pressable>
  );
}
export function Field({
  label,
  value,
  onChange,
  multiline = false,
  placeholder = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const c = useColors();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Label muted>{label}</Label>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor={c.foregroundMuted}
        style={{
          color: c.foreground,
          backgroundColor: c.surface0,
          borderWidth: 1,
          borderColor: focused ? c.accent : c.border,
          borderRadius: 9,
          padding: 12,
          minHeight: multiline ? 112 : 44,
          textAlignVertical: "top",
          fontSize: 14,
        }}
      />
    </View>
  );
}
