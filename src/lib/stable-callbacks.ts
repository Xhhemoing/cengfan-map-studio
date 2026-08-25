import { useEffect, useMemo, useRef } from "react";

type CallbackMap = Record<string, (...args: never[]) => unknown>;

/**
 * 把每次渲染都新建的一组回调换成身份稳定的包装。PosterCanvas 与它下面的图层都按 prop
 * 身份 memo,渲染期新建的箭头函数会让这些 memo 每帧失效——平移时整棵画布都会重画。
 *
 * 采用 latest-ref 模式:ref 在渲染后的 effect 中同步(lint 禁止渲染期写 ref),初始值
 * 即首帧闭包,覆盖首帧事件窗口。包装只在首帧按当时的键建一次,调用方必须每次返回同样
 * 形状的对象。
 */
export function useStableCallbacks<T extends CallbackMap>(callbacks: T): T {
  const latest = useRef(callbacks);
  useEffect(() => {
    latest.current = callbacks;
  });

  return useMemo(() => {
    const stable: CallbackMap = {};
    for (const key of Object.keys(callbacks)) {
      stable[key] = (...args: never[]) => latest.current[key]?.(...args);
    }
    return stable as T;
    // 键集合固定,包装只建一次;回调本体每次渲染后经 ref 更新。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
