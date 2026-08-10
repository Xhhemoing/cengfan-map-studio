import { useEffect, useRef, useState } from "react";
import { universityEmblems } from "../data/university-emblems";

export interface UniversityEmblemProps {
  /** 大学名称（用于查校徽资源与占位首字）。为空时不渲染。 */
  university: string;
  /** 显示尺寸（px），默认 24。 */
  size?: number;
  className?: string;
  alt?: string;
}

/**
 * 懒加载大学校徽。
 *
 * 校徽 webp 资源按需获取：IntersectionObserver 在元素进入视口后才设置
 * `<img src>`，视口外不发出网络请求（符合"需要时再获取"）。没有校徽的
 * 大学（universityEmblemsMissing）或加载失败时，回退为首字圆形占位。
 */
export function UniversityEmblem({ university, size = 24, className, alt }: UniversityEmblemProps) {
  // 无 IntersectionObserver 的环境（旧浏览器）直接视为已入视口。
  const [inView, setInView] = useState(() => typeof IntersectionObserver === "undefined");
  const [failed, setFailed] = useState(false);
  const hostRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || inView) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: "48px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView]);

  if (!university) return null;

  const src = universityEmblems[university];
  const initial = university.trim().charAt(0) || "校";
  const style = { width: size, height: size };
  const showImage = inView && src && !failed;

  return (
    <span
      ref={hostRef}
      className={`university-emblem${className ? ` ${className}` : ""}`}
      style={style}
      role="img"
      aria-label={alt ?? `${university}校徽`}
      aria-hidden={!showImage}
    >
      {showImage ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="university-emblem__placeholder" aria-hidden>
          {initial}
        </span>
      )}
    </span>
  );
}
