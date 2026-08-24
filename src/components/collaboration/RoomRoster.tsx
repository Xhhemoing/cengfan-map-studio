/**
 * Room member roster for the collaboration popover. Every row communicates
 * its role as a text badge plus an aria-label — never by color or the crown
 * emoji alone (the crown stays decorative and aria-hidden).
 */
import { describeRole, type RosterEntry } from "../../lib/collaboration-identity";

export function RoomRoster({ entries }: { entries: RosterEntry[] }) {
  if (entries.length === 0) return null;
  const hasAnonymous = entries.some((entry) => entry.isAnonymous);
  return (
    <div className="collaboration-roster">
      <ul className="collaboration-members" aria-label="房间成员">
        {entries.map((entry) => {
          const role = describeRole(entry.role);
          return (
            <li
              key={entry.clientId}
              data-member-role={entry.role}
              aria-label={`${entry.displayName}，${role.label}，${role.capability}`}
            >
              {entry.role === "owner" && <span aria-hidden="true">👑</span>}
              <span className="collaboration-members__name">
                {entry.isSelf ? `${entry.displayName}（我）` : entry.displayName}
              </span>
              <span className="collaboration-members__role">{role.label}</span>
            </li>
          );
        })}
      </ul>
      {hasAnonymous && (
        <small className="collaboration-members__note">其他成员的昵称只保存在对方设备上，此处以成员编号代替。</small>
      )}
    </div>
  );
}
