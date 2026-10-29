const avatarColors = ["plum", "indigo", "rose", "teal", "amber", "blue"];

export function getDisplayName(name, email) {
  return name?.trim() || email?.split("@")[0] || "Employee";
}

function initialsFor(name, email) {
  return getDisplayName(name, email)
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "E";
}

function colorFor(name, email) {
  const identity = getDisplayName(name, email);
  let hash = 0;
  for (const character of identity) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return avatarColors[hash % avatarColors.length];
}

export default function EmployeeAvatar({ name, email, className = "" }) {
  const displayName = getDisplayName(name, email);
  return (
    <span
      aria-label={`${displayName} avatar`}
      className={`employee-avatar avatar-${colorFor(name, email)}${className ? ` ${className}` : ""}`}
      role="img"
    >
      {initialsFor(name, email)}
    </span>
  );
}
