import type { MouseEvent } from "react";
import { STUDIO_STAGE_TARGET_ID } from "./stage-target";

/**
 * 键盘跳转链接：视觉隐藏（.skip-link 工具类），获得键盘焦点时浮出到顶栏上方。
 * 应用使用 hash 路由（#/project/<id>），原生片段跳转会改写 location.hash
 * 并触发路由切换，因此这里拦截默认行为、改为把焦点移到目标容器。
 * 默认指向工作室主工作区（#studio-stage）；其他整页壳（如全局设置）可传入
 * 自己的 targetId/label 复用同一模式，互不占用对方的落点 id。
 */
export function SkipToStageLink({
  targetId = STUDIO_STAGE_TARGET_ID,
  label = "跳到主要内容",
}: {
  targetId?: string;
  label?: string;
} = {}) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    document.getElementById(targetId)?.focus();
  };
  return (
    <a className="skip-link" href={`#${targetId}`} onClick={handleClick}>
      {label}
    </a>
  );
}
