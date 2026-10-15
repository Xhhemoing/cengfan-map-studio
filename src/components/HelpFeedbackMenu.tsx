/**
 * 帮助与反馈入口：把 GitHub Issue 模板与用户指南收进一个折叠菜单。
 * 只有外链，没有表单与上传；唯一离开本机的信息是粗粒度的系统 / 浏览器 / 运行方式。
 */
import { CircleHelp, Copy } from "lucide-react";
import "./HelpFeedbackMenu.css";
import { useDisclosureDismissal } from "../lib/use-disclosure-dismissal";
import { useClipboardFeedback } from "../lib/use-clipboard-feedback";
import {
  APP_VERSION,
  CHANGELOG_URL,
  ISSUE_CHOOSER_URL,
  USER_GUIDE_URL,
  buildIssueUrl,
  describeClientEnvironment,
  formatEnvironmentForIssue,
  type ClientEnvironment,
} from "../lib/feedback-links";

function currentEnvironment(): ClientEnvironment {
  if (typeof window === "undefined") {
    return describeClientEnvironment({ userAgent: "", hostname: "", port: "" });
  }
  return describeClientEnvironment({
    userAgent: window.navigator?.userAgent ?? "",
    hostname: window.location?.hostname ?? "",
    port: window.location?.port ?? "",
  });
}

function HelpLink({ href, label, hint }: { href: string; label: string; hint: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`${label}（${hint}，新窗口打开）`}>
      {label}
    </a>
  );
}

export function HelpFeedbackMenu({
  environment,
  variant = "studio",
  onCopyEnvironment,
}: {
  /** 由调用方注入以便测试；缺省时从 window 现算。 */
  environment?: ClientEnvironment;
  variant?: "studio" | "workbench";
  /** 复制成功后的回执，交给宿主决定怎么提示。 */
  onCopyEnvironment?: (text: string) => void;
}) {
  const disclosureRef = useDisclosureDismissal();
  const resolved = environment ?? currentEnvironment();
  const environmentText = formatEnvironmentForIssue(resolved);
  const { copy, status } = useClipboardFeedback(environmentText);
  const copyEnvironment = async () => {
    if (await copy(environmentText)) onCopyEnvironment?.(environmentText);
  };

  return (
    <details ref={disclosureRef} className={["help-menu", variant === "workbench" ? "help-menu--workbench" : ""].filter(Boolean).join(" ")}>
      <summary className="secondary-button" aria-label="帮助与反馈">
        <CircleHelp size={16} /> <span>帮助</span>
      </summary>
      <div className="help-menu__popover">
        <section>
          <strong>告诉我们</strong>
          <HelpLink href={buildIssueUrl("feedback")} label="使用意见" hint="GitHub" />
          <HelpLink href={buildIssueUrl("bug", resolved)} label="遇到问题" hint="GitHub，已预填系统与运行方式" />
          <HelpLink href={buildIssueUrl("feature")} label="功能建议" hint="GitHub" />
        </section>
        <section>
          <strong>先自己看看</strong>
          <HelpLink href={USER_GUIDE_URL} label="用户指南" hint="GitHub" />
          <HelpLink href={CHANGELOG_URL} label="更新日志" hint="GitHub" />
          <HelpLink href={ISSUE_CHOOSER_URL} label="全部反馈入口" hint="GitHub" />
        </section>
        <section className="help-menu__environment">
          <div className="help-menu__environment-line">
            <small>{environmentText}</small>
            <button type="button" aria-label="复制环境信息" title="复制环境信息" disabled={status === "copying"} onClick={() => void copyEnvironment()}>
              <Copy size={15} />
            </button>
          </div>
          {status === "copied" && <small role="status">已复制环境信息</small>}
          {status === "error" && <small role="alert">无法复制，请手动选择环境信息后复制。</small>}
          <small>版本 v{APP_VERSION}</small>
          <small>只会带上系统与浏览器版本，不会上传名单或工程内容。</small>
        </section>
      </div>
    </details>
  );
}
