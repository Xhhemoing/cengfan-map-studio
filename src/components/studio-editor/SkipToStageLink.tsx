import type { MouseEvent } from "react";
import { STUDIO_STAGE_TARGET_ID } from "./stage-target";

/**
 * 键盘跳转链接：视觉隐藏（.skip-link 工具类），获得键盘焦点时浮出到顶栏上方。
 * 应用使用 hash 路由（#/project/<id>），原生片段跳转会改写 location.hash
 * 并触发路由切换，因此这里拦截默认行为、改为把焦点移到主工作区容器。
 */
export function SkipToStageLink() {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    document.getElementById(STUDIO_STAGE_TARGET_ID)?.focus();
  };
  return (
    <a className="skip-link" href={`#${STUDIO_STAGE_TARGET_ID}`} onClick={handleClick}>
      跳到主要内容
    </a>
  );
}
