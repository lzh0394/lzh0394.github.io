/**
 * 构建脚本：按正确顺序执行 Hugo 与 Pagefind。
 *
 * 顺序很重要 —— Pagefind 是「索引一个已经构建好的静态站点」，
 * 它读的是 public/ 里生成的 HTML，所以必须跑在 Hugo 之后。
 *
 * 用法：
 *   node scripts/build.mjs            构建站点并生成搜索索引
 *   node scripts/build.mjs --serve    启动开发服务器（不做索引）
 *   node scripts/build.mjs --clean    先清空 public/ 再构建
 *
 * 任何传给本脚本的参数都会原样转交给 hugo。
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);

/**
 * 按优先级找一个可用的 Hugo：
 *
 *   1. HUGO_BIN 环境变量 —— 显式指定
 *   2. .tools/hugo/hugo[.exe] —— scripts/setup.ps1 下载到仓库内的（被 gitignore）
 *   3. PATH 上的 hugo —— CI 里由 GitHub Actions 安装
 *
 * 第 3 条是必需的：CI 用 peaceiris/actions-hugo 装 Hugo 并放进 PATH，
 * 但第 2 条那个目录在 CI 里根本不存在（它被 gitignore 了）。
 * 只认第 2 条会导致"本地能构建、CI 报找不到 Hugo"。
 */
const hugoBin =
  process.env.HUGO_BIN ||
  [
    path.join(root, '.tools', 'hugo', 'hugo.exe'),
    path.join(root, '.tools', 'hugo', 'hugo'),
  ].find(existsSync) ||
  'hugo'; // 交给 PATH 解析

// 提前确认 PATH 上的 hugo 是否真的可用，好给出可操作的提示
if (hugoBin === 'hugo') {
  const probe = spawnSync('hugo', ['version'], { stdio: 'ignore', shell: false });
  if (probe.error || probe.status !== 0) {
    console.error(
      '\n找不到 Hugo 可执行文件。三种解决办法，任选其一：\n' +
        '\n  1) 下载到仓库内（推荐，只需一次）：\n' +
        '       powershell -ExecutionPolicy Bypass -File scripts/setup.ps1\n' +
        '\n  2) 自己装好 Hugo 后，用环境变量指向它：\n' +
        '       $env:HUGO_BIN = "C:\\path\\to\\hugo.exe"\n' +
        '\n  3) 把 hugo 放进 PATH\n'
    );
    process.exit(1);
  }
}

/** 运行一个命令，输出直接透传到当前终端。 */
function run(command, commandArgs, label) {
  console.log(`\n> ${label}`);
  // stdio: 'inherit' 是刻意选择：让子进程直接写终端，
  // 而不是经由管道回传，避免在受限环境下无法建立管道。
  // 不加 shell: true —— 参数里带引号或空格时 shell 拼接容易出错
  // （Node 也会为此报 DEP0190 警告）。
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(`\n执行失败: ${result.error.message}\n`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`\n${label} 退出码 ${result.status}，已中止。\n`);
    process.exit(result.status ?? 1);
  }
}

const isServe = args.includes('--serve') || args.includes('server');

run(hugoBin, args, `hugo ${args.join(' ')}`.trim());

if (isServe) {
  // 开发服务器是长驻进程，上面不会返回；这里只是可读性上的兜底。
  process.exit(0);
}

// 跳过索引的几种情况：
//  - 只想构建产物            → 传 --no-index
//  - 构建草稿预览            → 草稿不该进索引
const skipIndex = args.includes('--no-index') || args.includes('--buildDrafts') || args.includes('-D');

if (skipIndex) {
  console.log('\n已跳过 Pagefind 索引（--no-index 或草稿构建）。\n');
  process.exit(0);
}

if (!existsSync(path.join(root, 'public', 'index.html'))) {
  console.error('\npublic/index.html 不存在，Hugo 似乎没有产出站点，跳过索引。\n');
  process.exit(1);
}

// 优先直接用 Pagefind 的真实可执行文件，而不是 node_modules/.bin 里的
// 包装脚本。原因：在 Windows 上 Node 直接 spawn .cmd 文件会报 EINVAL，
// 而绕过 shell 调用 .cmd 又会引入参数转义问题。
const pagefindBin = [
  // 平台专属包里的原生二进制（npm 会按当前平台自动装上）
  'node_modules/@pagefind/windows-x64/bin/pagefind_extended.exe',
  'node_modules/@pagefind/windows-x64/bin/pagefind.exe',
  'node_modules/@pagefind/linux-x64/bin/pagefind',
  'node_modules/@pagefind/linux-arm64/bin/pagefind',
  'node_modules/@pagefind/darwin-x64/bin/pagefind',
  'node_modules/@pagefind/darwin-arm64/bin/pagefind',
  // 兜底：POSIX 下的包装脚本
  'node_modules/.bin/pagefind',
]
  .map((p) => path.join(root, ...p.split('/')))
  .find(existsSync);

if (!pagefindBin) {
  console.error('\n找不到 Pagefind 可执行文件。请先运行: npm install\n');
  process.exit(1);
}

// --force-language zh：站点是中文，Pagefind 据语言选择分词/词干策略。
// 注意 Pagefind 对中文不做词干还原（它会在 stderr 提示），
// 搜索仍然可用，只是不会做同根词匹配。
run(
  pagefindBin,
  ['--site', 'public', '--glob', '**/*.html', '--force-language', 'zh'],
  'pagefind --site public'
);

console.log('\n完成。产物在 public/，搜索索引在 public/pagefind/。\n');
