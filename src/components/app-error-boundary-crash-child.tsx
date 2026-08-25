// 崩溃屏用例共用的“必定抛错”子树。单独成文件而不是并进
// app-error-boundary-test-harness.tsx：那个装置只导出助手函数，
// 一旦混入组件导出，react-refresh/only-export-components 会把其余导出全部标警。
export const Boom = () => {
  throw new Error("boom");
};
