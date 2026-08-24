/**
 * Room nickname field for the collaboration popover. The value is a local
 * per-device preference (not an account) and is sent through the existing
 * create/join `displayName` request field, so edits apply the next time this
 * device creates or joins a room.
 */
import { useId } from "react";
import { COLLABORATION_DISPLAY_NAME } from "../../lib/app-constants";
import { MAX_DISPLAY_NAME_LENGTH } from "../../lib/collaboration-identity";

export function DisplayNameInput({
  value,
  connected,
  onChange,
}: {
  value: string;
  /** Disabled while in a room: the nickname travels with create/join only. */
  connected: boolean;
  /** Receives the raw input; normalization happens at save and send time. */
  onChange: (next: string) => void;
}) {
  const inputId = useId();
  return (
    <div className="collaboration-display-name">
      <label htmlFor={inputId}>房间内昵称</label>
      <input
        id={inputId}
        value={value}
        maxLength={MAX_DISPLAY_NAME_LENGTH}
        disabled={connected}
        placeholder={COLLABORATION_DISPLAY_NAME}
        onChange={(event) => onChange(event.target.value)}
      />
      <small>
        {connected
          ? "已在房间内，断开后可修改昵称"
          : "只保存在这台电脑，不是账号；创建或加入房间时随请求发送"}
      </small>
    </div>
  );
}
