/** The source package and its resource toggle never apply a publication filter. */
export function SourceProjectNotice({ total, hidden }: { total?: number; hidden?: number }) {
  return <p className="export-resource-warning" role="note" aria-label="源工程分享提醒">
    <strong>源工程不是公开图片。</strong>
    .cengfan 保存完整名单{total === undefined ? "" : `（${total} 条，其中隐藏 ${hidden ?? 0} 条）`}，隐藏学生或不显示姓名不会删除源数据。
    不包含资源包也不会移除名单。请仅用于本人备份或交给获授权的制作者；公开分享前另行检查图片中的个人信息。
  </p>;
}
