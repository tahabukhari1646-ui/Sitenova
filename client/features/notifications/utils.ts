// Stage 15.7 §9: 0 -> no badge, 1-99 -> exact number, >=100 -> "99+" so a
// large count can never break the navbar layout.
export function formatUnreadBadge(unread: number): string | null {
  if (unread <= 0) return null;
  if (unread >= 100) return "99+";
  return String(unread);
}

export function getBellAccessibleLabel(unread: number): string {
  return unread > 0 ? `Notifications, ${unread} unread` : "Notifications";
}
