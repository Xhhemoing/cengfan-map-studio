#!/usr/bin/env node
/**
 * 蹭饭图宣发流程 — 内容生成脚本
 *
 * 用途：基于模板批量生成小红书/B站/抖音的宣发内容草稿
 * 使用：node scripts/宣发流程-内容生成.mjs --type xhs --theme painpoint
 *
 * 支持类型：
 *   xhs        小红书图文笔记（痛点/成果/情感 3 阶段）
 *   xhs-video  小红书短视频脚本
 *   bilibili   B站教程脚本（5-8 分钟）
 *   douyin     抖音 15-30 秒快闪脚本
 *
 * 主题（theme）：
 *   painpoint  痛点唤醒
 *   result     成果展示
 *   emotion    情感共鸣
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
const type = args.find(a => a.startsWith('--type='))?.split('=')[1] || 'xhs';
const theme = args.find(a => a.startsWith('--theme='))?.split('=')[1] || 'painpoint';
const count = parseInt(args.find(a => a.startsWith('--count='))?.split('=')[1] || '3');

const OUTPUT_DIR = join(process.cwd(), 'docs', '宣发草稿');
if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

const TEMPLATES = {
  xhs: {
    painpoint: [
      {
        title: '毕业季做蹭饭图，我花了 3 天 vs 5 分钟',
        body: [
          '【痛点】班主任收到学生名单，让我做「去向地图」……',
          'Excel 导出表格太丑，领导说「能不能做得好看点」？',
          '手动画地图要画 3 天，学生名单一改还要重画……',
          '',
          '【解决】试试蹭饭图：',
          '1. 导入 Excel → 3 分钟出初稿',
          '2. 智能布局自动避让，卡片不重叠',
          '3. 支持手动微调 + 实时预览',
          '4. 一键导出高清 PNG/PDF',
          '',
          '【效果】毕业典礼直接用，领导满意，学生也喜欢！',
          '',
          '#毕业季 #蹭饭图 #班级去向地图 #毕业墙 #班主任必备 #开源工具'
        ]
      },
      {
        title: 'Excel 做地图太丑？试试这个开源工具',
        body: [
          '【场景】班委要做毕业地图，Excel 做出来像表格……',
          '想加校徽、贴图，但不会 PS；想换字体、颜色，但排版太麻烦。',
          '',
          '【蹭饭图的答案】',
          '✓ 内置 10+ 卡片模板，一键切换风格',
          '✓ 上传字体、贴图、校徽，按省份绑定',
          '✓ 素材库一键应用，实时看到效果',
          '✓ 支持导出项目包，下次直接复用',
          '',
          '【真实案例】某高中 68 人班级，导入名单后 5 分钟初稿',
          '',
          '#毕业季 #蹭饭图 #班级去向地图 #毕业墙 #设计工具 #开源'
        ]
      },
      {
        title: '班主任再也不用手动画地图了',
        body: [
          '【真实反馈】「以前做毕业墙，要画 3 天地图，学生名单改了还要重画。」',
          '「用了蹭饭图，导入 Excel 3 分钟出图，领导当场表扬！」',
          '',
          '【核心功能】',
          '• Excel/CSV 导入，自动匹配姓名、去向、省份',
          '• 智能布局 + 手动微调，卡片不重叠',
          '• 素材库：字体、贴图、校徽、颜色',
          '• 协作编辑：班委分工协作',
          '• 高清导出：PNG / PDF / 项目包',
          '',
          '【开源地址】github.com/Xhhemoing/cengfan-map-studio',
          '欢迎 Star & 贡献！',
          '',
          '#毕业季 #蹭饭图 #班主任必备 #开源工具 #毕业墙'
        ]
      }
    ],
    result: [
      {
        title: '我们班 47 人去向地图，3 小时出图',
        body: [
          '【背景】某 985 高校附属中学，47 人班级',
          '【挑战】毕业典礼前 2 天才拿到最终名单，需要快速出图',
          '',
          '【制作过程】',
          '1. 导入 Excel 名单 → 自动匹配省份',
          '2. 选择「紧凑卡片」模板 → 智能布局完成',
          '3. 手动微调 3 个重叠卡片 → 5 分钟完成',
          '4. 上传校徽 + 班级字体 → 一键应用',
          '5. 导出高清 PNG + PDF',
          '',
          '【数据洞察】',
          '• 985/211：32 人（68%）',
          '• 本省留存：28 人（60%）',
          '• 最远去向：北京、上海、深圳',
          '',
          '【学生反馈】「第一次看到全班的未来，哭了」',
          '',
          '#毕业季 #蹭饭图 #班级去向地图 #985 #毕业墙'
        ]
      }
    ],
    emotion: [
      {
        title: '看见全班的未来，我突然懂了什么叫「毕业」',
        body: [
          '【老照片】2019 年毕业典礼，全班 52 人合影',
          '【新地图】2026 年，用蹭饭图更新了去向',
          '',
          '【变化】',
          '• 3 人读博（北京大学、清华大学、中科院）',
          '• 8 人出国（美国、英国、德国）',
          '• 12 人进入互联网大厂（字节、阿里、腾讯）',
          '• 5 人考公（国家部委、省级机关）',
          '',
          '【感慨】「如果当年有这个工具，我们就能更早规划未来」',
          '「这张图，我保存了 3 年，希望再保存 30 年」',
          '',
          '#毕业季 #蹭饭图 #班级去向地图 #毕业回忆 #情感'
        ]
      }
    ]
  },
  bilibili: {
    painpoint: [
      {
        title: '【毕业季】Excel 做毕业地图太丑？5 分钟出图教程',
        duration: '6:30',
        outline: [
          '00:00 开场：痛点展示（Excel 乱码、手动画歪图）',
          '00:30 介绍蹭饭图：开源、免费、3 分钟出图',
          '01:00 安装与启动（npm install + npm run dev）',
          '02:00 导入 Excel 名单 → 自动匹配',
          '03:30 智能布局 + 手动微调',
          '04:30 素材库：字体、贴图、校徽',
          '05:30 导出高清 PNG/PDF',
          '06:00 真实案例展示 + 总结'
        ]
      }
    ]
  },
  douyin: {
    painpoint: [
      {
        title: '毕业墙 15 秒快闪',
        duration: '0:15',
        script: [
          '0-3s：Excel 乱码 + 手动画歪图（痛点）',
          '3-8s：蹭饭图导入名单 → 3 分钟出图（解决）',
          '8-12s：高清导出 + 毕业典礼现场（成果）',
          '12-15s：文字：「毕业季必备工具」+ 二维码'
        ]
      }
    ]
  }
};

function generateContent(type, theme) {
  const templates = TEMPLATES[type]?.[theme] || [];
  if (templates.length === 0) {
    console.error(`未找到模板: type=${type}, theme=${theme}`);
    return;
  }

  const timestamp = new Date().toISOString().slice(0, 10);
  const fileName = `${type}-${theme}-${timestamp}.md`;
  const filePath = join(OUTPUT_DIR, fileName);

  let content = `# 蹭饭图宣发草稿 — ${type.toUpperCase()} / ${theme}\n\n`;
  content += `生成时间: ${new Date().toLocaleString('zh-CN')}\n`;
  content += `主题: ${theme}\n`;
  content += `数量: ${Math.min(count, templates.length)}\n\n`;
  content += '---\n\n';

  const selected = templates.slice(0, count);
  selected.forEach((tpl, i) => {
    content += `## ${i + 1}. ${tpl.title}\n\n`;
    if (tpl.duration) content += `时长: ${tpl.duration}\n\n`;
    if (tpl.outline) {
      content += '### 大纲\n\n';
      tpl.outline.forEach(line => content += `- ${line}\n`);
      content += '\n';
    }
    if (tpl.script) {
      content += '### 脚本\n\n';
      tpl.script.forEach(line => content += `- ${line}\n`);
      content += '\n';
    }
    if (tpl.body) {
      content += '### 正文\n\n';
      tpl.body.forEach(line => content += `${line}\n`);
      content += '\n';
    }
    content += '---\n\n';
  });

  writeFileSync(filePath, content, 'utf8');
  console.log(`✓ 已生成: ${filePath}`);
}

generateContent(type, theme);
console.log(`\n完成！草稿已保存到 ${OUTPUT_DIR}`);