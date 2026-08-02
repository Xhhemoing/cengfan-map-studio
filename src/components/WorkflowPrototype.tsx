import {
  ArrowDownToLine,
  Check,
  ChevronDown,
  CircleHelp,
  FileSpreadsheet,
  Image,
  LayoutTemplate,
  MapPinned,
  Palette,
  Plus,
  Sparkles,
  Type,
  Upload,
  UsersRound,
  WandSparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import "./workflow-prototype.css";

type AreaId = "roster" | "map" | "layout" | "content" | "assets" | "deliver";
type Selection = "canvas" | "map" | "zhejiang" | "title" | "cards";

const areas: Array<{ id: AreaId; label: string; hint: string; icon: typeof UsersRound }> = [
  { id: "roster", label: "名单", hint: "18 条已检查", icon: UsersRound },
  { id: "map", label: "地图", hint: "省份卡片", icon: MapPinned },
  { id: "layout", label: "版式", hint: "自动布局完成", icon: LayoutTemplate },
  { id: "content", label: "内容", hint: "标题与嘉宾", icon: Type },
  { id: "assets", label: "素材", hint: "4 个已使用", icon: Palette },
  { id: "deliver", label: "交付", hint: "可导出", icon: ArrowDownToLine },
];

const mapModes = ["省份卡片", "城市卡片", "院校卡片", "地图图钉", "人数热力"];
const students = [
  ["沈安然", "浙江大学", "杭州市"],
  ["周知远", "复旦大学", "上海市"],
  ["林沐言", "武汉大学", "武汉市"],
  ["陈一舟", "北京大学", "北京市"],
];

function PanelTitle({ label, detail }: { label: string; detail: string }) {
  return <header className="prototype-panel-title"><div><p>{detail}</p><h2>{label}</h2></div><button type="button" aria-label={`了解${label}`}><CircleHelp size={16} /></button></header>;
}

function WorkflowTabs({ active, onChange }: { active: AreaId; onChange: (id: AreaId) => void }) {
  return <nav className="prototype-steps" aria-label="海报制作流程">
    {areas.map(({ id, label, hint }, index) => (
      <button key={id} type="button" aria-label={label} aria-current={active === id ? "step" : undefined} onClick={() => onChange(id)}>
        <span className="prototype-step-number">{active === id ? <Check size={14} /> : index + 1}</span>
        <span><strong>{label}</strong><small>{hint}</small></span>
      </button>
    ))}
  </nav>;
}

function LeftPanel({ active }: { active: AreaId }) {
  if (active === "roster") return <section className="prototype-side-panel"><PanelTitle label="名单检查" detail="准备数据" /><div className="prototype-import-actions"><button type="button"><FileSpreadsheet size={16} />上传表格</button><button type="button"><Plus size={16} />手动添加</button></div><div className="prototype-status-note"><Check size={15} /><span>16 个城市已定位，2 条海外去向单独保留。</span></div><div className="prototype-roster-list">{students.map(([name, university, city]) => <div key={name}><span className="prototype-avatar">{name.slice(0, 1)}</span><p><strong>{name}</strong><small>{university} · {city}</small></p><Check size={15} /></div>)}</div><button className="prototype-text-action" type="button">查看全部 18 条名单</button></section>;
  if (active === "map") return <section className="prototype-side-panel"><PanelTitle label="地图表达" detail="选择读图方式" /><div className="prototype-mode-list">{mapModes.map((mode, index) => <button key={mode} type="button" className={index === 0 ? "is-selected" : ""}><span>{mode}</span><small>{index === 0 ? "按省份汇总名单" : index === 4 ? "突出人数分布" : "实时切换"}</small></button>)}</div><div className="prototype-action-block"><p>浙江省已选中</p><button type="button"><Image size={16} />应用省份贴图</button></div></section>;
  if (active === "layout") return <section className="prototype-side-panel"><PanelTitle label="版式结构" detail="让信息均衡可读" /><div className="prototype-template"><div className="prototype-template-preview"><i /><i /><i /></div><div><strong>风景插画版</strong><small>1500 × 1000 · 横向</small></div><ChevronDown size={16} /></div><div className="prototype-layout-options"><label><span>卡片样式</span><b>紧凑 <ChevronDown size={14} /></b></label><label><span>连接线</span><b>折线 <ChevronDown size={14} /></b></label><label><span>画布背景</span><b><i className="prototype-color-dot" />暖白</b></label></div><button className="prototype-primary-action" type="button"><WandSparkles size={16} />重新智能排版</button><p className="prototype-footnote">系统会避开标题和地图内容区；移动单张卡片不会影响其他卡片。</p></section>;
  if (active === "content") return <section className="prototype-side-panel"><PanelTitle label="海报内容" detail="补充班级记忆" /><div className="prototype-content-actions"><button type="button"><Type size={16} />新增文字</button><button type="button"><UsersRound size={16} />添加嘉宾</button></div><div className="prototype-content-list"><button type="button">主标题 <small>我们的毕业去向</small></button><button type="button">副标题 <small>山高水长，来日再聚</small></button><button type="button">特别备注 <small>2026 届高三（2）班</small></button></div></section>;
  if (active === "assets") return <section className="prototype-side-panel"><PanelTitle label="省份贴图" detail="浙江省 · 已筛选" /><button className="prototype-upload" type="button"><Upload size={16} />上传浙江素材</button><div className="prototype-asset-grid">{["西湖", "龙井", "烟雨", "水墨"].map((asset, index) => <button key={asset} type="button" className={index === 0 ? "is-selected" : ""}><span className={`prototype-asset-art art-${index}`} /><strong>{asset}</strong></button>)}</div><button className="prototype-text-action" type="button">管理全部素材与字体</button></section>;
  return <section className="prototype-side-panel"><PanelTitle label="交付检查" detail="准备输出" /><div className="prototype-delivery-status"><div><Check size={16} /><span><strong>名单完整</strong><small>18 人已显示</small></span></div><div><Check size={16} /><span><strong>版式已检查</strong><small>未发现卡片遮挡</small></span></div><div><span className="prototype-warning-dot">!</span><span><strong>2 条海外去向</strong><small>不会显示在中国地图</small></span></div></div><button className="prototype-primary-action" type="button"><ArrowDownToLine size={16} />导出 2× PNG</button><button className="prototype-secondary-action" type="button">保存到本机</button></section>;
}

function Poster({ selection, onSelect }: { selection: Selection; onSelect: (value: Selection) => void }) {
  const cards = useMemo(() => [
    ["浙江", "3 人", "杭州 · 宁波", "card-zhejiang"],
    ["北京", "4 人", "北京大学 · 清华大学", "card-beijing"],
    ["上海", "3 人", "复旦大学 · 同济大学", "card-shanghai"],
    ["湖北", "2 人", "武汉大学", "card-hubei"],
  ], []);
  return <main className="prototype-stage" aria-label="海报画布预览"><div className="prototype-canvas-toolbar"><span>实时预览</span><div><button type="button">网格</button><button type="button">适应画布</button><b>78%</b></div></div><article className="prototype-poster" data-selection={selection}><header><span>2026 CLASS OF SENIORS</span><button type="button" aria-label="选择标题" onClick={() => onSelect("title")}><h1>班级毕业去向图</h1><p>山高水长，来日再聚</p></button><em>高三（2）班 · 18 人</em></header><section className="prototype-map-paper"><button type="button" className="prototype-province zhejiang" aria-label="选择浙江省" onClick={() => onSelect("zhejiang")}><span>浙江</span><i /></button><button type="button" className="prototype-province beijing" aria-label="选择北京" onClick={() => onSelect("map")}><span>北京</span><i /></button><button type="button" className="prototype-province hubei" aria-label="选择湖北" onClick={() => onSelect("map")}><span>湖北</span><i /></button><div className="prototype-map-outline"><span>中国毕业去向</span></div></section><section className="prototype-poster-cards">{cards.map(([province, count, school, className]) => <button key={province} type="button" className={`prototype-poster-card ${className}`} onClick={() => onSelect("cards")}><span>{province}</span><b>{count}</b><small>{school}</small></button>)}</section><footer><span>毕业快乐</span><span>KEEP GOING · KEEP GROWING</span></footer></article></main>;
}

function Inspector({ selection }: { selection: Selection }) {
  const content = selection === "zhejiang"
    ? { title: "浙江省", detail: "3 名同学 · 已应用西湖贴图", actions: ["使用浙江贴图", "优化邻省配色", "恢复默认外观"] }
    : selection === "title"
      ? { title: "标题属性", detail: "文本 · 已选中", actions: ["更换字体", "调整对齐", "编辑文案"] }
      : selection === "cards"
        ? { title: "数据卡片", detail: "省份分组 · 紧凑样式", actions: ["一键智能排版", "设置显示字段", "调整连接线"] }
        : selection === "map"
          ? { title: "地图属性", detail: "矢量地图 · 省份标签已开启", actions: ["更换地图颜色", "切换图片地图", "编辑热力色阶"] }
          : { title: "画布属性", detail: "1500 × 1000 · 横向", actions: ["更换背景", "调整安全边距", "设置画布尺寸"] };
  return <aside className="prototype-inspector"><div className="prototype-inspector-label">当前选择</div><h2>{content.title}</h2><p>{content.detail}</p><div className="prototype-inspector-preview"><div className="prototype-inspector-swatch" /><span><strong>即时生效</strong><small>每次修改均可撤销</small></span></div><div className="prototype-inspector-actions">{content.actions.map((action, index) => <button key={action} type="button" className={index === 0 ? "is-primary" : ""}>{action}</button>)}</div><div className="prototype-inspector-divider" /><h3>快速设置</h3><label>透明度 <input aria-label="透明度" type="range" min="0" max="100" defaultValue="92" /></label><label>显示状态 <button type="button" className="prototype-toggle" aria-label="显示状态"><i />显示</button></label></aside>;
}

export function WorkflowPrototype() {
  const [active, setActive] = useState<AreaId>("map");
  const [selection, setSelection] = useState<Selection>("canvas");

  return <div className="workflow-prototype"><header className="prototype-header"><div className="prototype-brand"><span className="prototype-brand-mark"><MapPinned size={18} /></span><span><strong>蹭饭地图工作室</strong><small>流程工作台 · 原型</small></span></div><WorkflowTabs active={active} onChange={setActive} /><div className="prototype-header-actions"><button type="button" className="prototype-ai"><Sparkles size={16} />AI 助手</button><button type="button" className="prototype-export">导出</button></div></header><div className="prototype-workspace"><LeftPanel active={active} /><Poster selection={selection} onSelect={setSelection} /><Inspector selection={selection} /></div></div>;
}
