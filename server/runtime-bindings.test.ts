// @vitest-environment node
// 监听端口与绑定网卡的解析：这两项决定进程对外暴露面，回归必须钉死默认值。
import { describe, expect, it } from "vitest";
import {
  DEFAULT_BIND_HOST,
  DEFAULT_PORT,
  resolveBindHost,
  resolvePort,
} from "./runtime-bindings";

describe("runtime bindings", () => {
  it("falls back to the default port for malformed values", () => {
    // 默认参数取自 process.env.PORT：先摘掉宿主环境，否则开发机上导出了 PORT 就会假失败。
    const previous = process.env.PORT;
    delete process.env.PORT;
    try {
      expect(resolvePort(undefined)).toBe(DEFAULT_PORT);
      expect(resolvePort("")).toBe(DEFAULT_PORT);
      expect(resolvePort("0")).toBe(DEFAULT_PORT);
      expect(resolvePort("-1")).toBe(DEFAULT_PORT);
      expect(resolvePort("70000")).toBe(DEFAULT_PORT);
      expect(resolvePort("not-a-port")).toBe(DEFAULT_PORT);
      expect(resolvePort("8790")).toBe(8790);
      process.env.PORT = "9001";
      expect(resolvePort()).toBe(9001);
    } finally {
      if (previous === undefined) delete process.env.PORT;
      else process.env.PORT = previous;
    }
  });

  it("keeps binding to every interface unless HOST says otherwise", () => {
    const previous = process.env.HOST;
    delete process.env.HOST;
    try {
      // 默认必须保持 0.0.0.0：容器与既有部署依赖它，改默认会让人升级后连不上。
      expect(resolveBindHost(undefined)).toBe(DEFAULT_BIND_HOST);
      expect(resolveBindHost("")).toBe(DEFAULT_BIND_HOST);
      expect(resolveBindHost("   ")).toBe(DEFAULT_BIND_HOST);
      // 放在 nginx / caddy 后面时，必须能把进程收回环回地址，不让端口直接对公网。
      expect(resolveBindHost("127.0.0.1")).toBe("127.0.0.1");
      expect(resolveBindHost(" 127.0.0.1 ")).toBe("127.0.0.1");
      expect(resolveBindHost("::1")).toBe("::1");
      // 环境变量是运维唯一的开关，必须真的被读到。
      process.env.HOST = "127.0.0.1";
      expect(resolveBindHost()).toBe("127.0.0.1");
    } finally {
      if (previous === undefined) delete process.env.HOST;
      else process.env.HOST = previous;
    }
  });
});
