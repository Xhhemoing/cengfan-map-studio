import { useMemo, useState } from "react";
import type { EditorCommand } from "../lib/editor-commands";
import { requestAiProposal, type AiProposal } from "../lib/ai-client";

export function AiAssistant({
  studentCount,
  templateId,
  dataView,
  onPreview,
  onApply,
}: {
  studentCount: number;
  templateId: string;
  dataView: string;
  onPreview: (commands: EditorCommand[]) => void;
  onApply: (commands: EditorCommand[], label: string) => void;
}) {
  const [message, setMessage] = useState("按城市分组，并改成紧凑卡片");
  const [proposal, setProposal] = useState<AiProposal | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedCommands = useMemo(() => {
    if (!proposal) return [];
    return proposal.commands.filter((command) => selected[command.id]);
  }, [proposal, selected]);

  const runProposal = async () => {
    setLoading(true);
    setError("");
    try {
      const next = await requestAiProposal({
        message,
        studentCount,
        templateId,
        dataView,
      });
      setProposal(next);
      const initial: Record<string, boolean> = {};
      for (const command of next.commands) {
        initial[command.id] = true;
      }
      setSelected(initial);
      onPreview(next.commands);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 请求失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ai-assistant">
      <div className="panel-heading">
        <span>AI 助手</span>
        <small>{proposal?.provider || "local/backend"}</small>
      </div>
      <textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        rows={3}
        placeholder="例如：按城市分组，并放大地图"
      />
      <button className="wide-button" onClick={runProposal} disabled={loading}>
        {loading ? "生成中..." : "生成修改方案"}
      </button>
      {error && <p className="panel-note">{error}</p>}
      {proposal && (
        <div className="ai-proposal">
          <p className="panel-note">{proposal.explanation}</p>
          {proposal.commands.length === 0 ? (
            <p className="panel-note">这是解释模式，没有可应用命令。</p>
          ) : (
            <>
              <div className="review-list">
                {proposal.commands.map((command) => (
                  <label key={command.id} className="review-row">
                    <input
                      type="checkbox"
                      checked={Boolean(selected[command.id])}
                      onChange={(event) => {
                        const nextSelected = {
                          ...selected,
                          [command.id]: event.target.checked,
                        };
                        setSelected(nextSelected);
                        const commands = proposal.commands.filter(
                          (item) => nextSelected[item.id],
                        );
                        onPreview(commands);
                      }}
                    />
                    <span>
                      <strong>{command.label}</strong>
                      <small>
                        {String(command.before)} → {String(command.after)} · {command.risk}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
              <button
                className="wide-button"
                disabled={selectedCommands.length === 0}
                onClick={() =>
                  onApply(selectedCommands, `AI：${selectedCommands.map((item) => item.label).join("、")}`)
                }
              >
                应用所选（{selectedCommands.length}）
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
