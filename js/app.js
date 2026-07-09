// app.js — 儿科常用药物说明书

// ============================================================
// 数据
// ============================================================
const DRUGS = [];
let currentPage = 1;
const PAGE_SIZE = 15;
let searchResults = [];
let selectedDrug = null;
let isCalcOpen = false;
var _justEvaluated = false;

// ============================================================
// 格式化函数
// ============================================================
function processLineBreaks(text) {
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '<br>');
  const boxChars = '┏┓┗┛┃┣┫┠┨┎┒┖┚┌┐└┘├┤┬┴┼┕┍┑┙┥┦┧┪┫';
  const boxRe = new RegExp('(?<!<br>|<br/>)(?<!^)([' + boxChars + '])', 'g');
  text = text.replace(boxRe, '<br>$1');
  text = text.replace(/(?<!^)(?<!<br>|<br\/>)▶/g, '<br>▶');
  text = text.replace(/(?<!<br>|<br\/>)(?<!^)（(\d+)）/g, '<br>（$1）');
  text = text.replace(/│/g, '&nbsp;&nbsp;&nbsp;');
  return text;
}

function applyHighlight(text) {
  var parts = text.indexOf('<br>') >= 0 ? text.split('<br>') : [text];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    p = p.replace(/▶/g, "<span class='highlight-blue'>▶</span>");
    p = p.replace(/■/g, "<span class='highlight-green'>■</span>");
    p = p.replace(/●/g, "<span class='highlight-orange'>●</span>");
    p = p.replace(/♦/g, "<span class='highlight-purple'>♦</span>");
    p = p.replace(/▼/g, "<span class='highlight-purple'>▼</span>");
    p = p.replace(/▲/g, "<span class='highlight-purple'>▲</span>");
    p = p.replace(/★/g, "<span class='highlight-red'>★</span>");
    p = p.replace(/\((?:≤|<|≥|>|max)(?!\s*\d+(?:\.\d+)?\s*(?:m|月|y|岁))[^\)]*\)/g,
      "<span class='highlight-red'>$&</span>");
    p = p.replace(/((?:≤|<|≥|>|max)\s?\d+(?:\.\d+)?\s?(?:g|mg|ml|片|μg|mcg|U|IU|万U|万单位|万)(?:\([^)]*\))?(?:\/[^\/\s,;]+)*)/g,
      "<span class='highlight-red'>$1</span>");
    p = p.replace(/((?:≥|≤|>|<)\s?\d+(?:\.\d+)?\s?(?:h|小时|d|天))(?!\s*-\s*\d+)/g,
      "<span class='highlight-red'>$1</span>");
    parts[i] = p;
  }
  return parts.join('<br>');
}

function parseMarkdownTable(text) {
  var lines = text.split('\n');
  var firstThree = lines.slice(0, 3);
  var hasSep = firstThree.some(function(l) { return /^\s*\|(?:[-\s]+\|)+\s*$/.test(l); });
  if (!hasSep || lines.length < 3) return null;

  var headerIdx = -1;
  for (var i = 0; i < lines.length; i++) {
    if (/^\s*\|.*\|\s*$/.test(lines[i])) { headerIdx = i; break; }
  }
  if (headerIdx === -1) return null;

  var dataStart = headerIdx + 1;
  while (dataStart < lines.length && /\|\s*-+\s*\|/.test(lines[dataStart])) dataStart++;
  if (dataStart >= lines.length) return null;

  var tableEnd = dataStart;
  while (tableEnd < lines.length && lines[tableEnd] !== '') tableEnd++;

  var tableLines = lines.slice(dataStart, tableEnd);
  var afterTable = tableEnd < lines.length ? lines.slice(tableEnd + 1).join('<br>') : '';
  var headerRows = lines.slice(headerIdx, dataStart).filter(function(l) { return !/\|\s*-+\s*\|/.test(l); });

  var allHeaderCells = [];
  var maxCols = 0;
  for (var h = 0; h < headerRows.length; h++) {
    var cells = headerRows[h].split('|').map(function(c) { return c.trim(); });
    if (cells.length > 0 && cells[0] === '') cells.shift();
    if (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
    allHeaderCells.push(cells);
    if (cells.length > maxCols) maxCols = cells.length;
  }
  if (allHeaderCells.length === 0) return null;
  var nCols = maxCols;

  var html = "<table class='drug-table'><thead>";
  for (var h = 0; h < allHeaderCells.length; h++) {
    var row = allHeaderCells[h];
    while (row.length < nCols) row.push('');
    html += '<tr>';
    for (var c = 0; c < row.length; c++) html += "<th>" + row[c] + "</th>";
    html += '</tr>';
  }
  html += '</thead><tbody>';
  for (var r = 0; r < tableLines.length; r++) {
    var line = tableLines[r].trim();
    if (line === '') continue;
    var cells = line.split('|').map(function(c) { return c.trim(); });
    if (cells.length > 0 && cells[0] === '') cells.shift();
    if (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
    if (cells.length === 0) continue;
    html += '<tr>';
    for (var c = 0; c < cells.length && c < nCols; c++) html += "<td>" + cells[c] + "</td>";
    html += '</tr>';
  }
  html += '</tbody></table>';
  if (afterTable && afterTable !== '<br>') {
    afterTable = applyHighlight(afterTable);
    html += "<div style='margin-top:8px;font-size:14px'>" + afterTable + "</div>";
  }
  return html;
}

function formatDrugText(text) {
  if (!text) return '';
  var tableHtml = parseMarkdownTable(text);
  return tableHtml ? tableHtml : applyHighlight(processLineBreaks(text));
}

function renderField(label, value, isBlock) {
  if (!value) return '';
  if (isBlock) {
    return "<div class='field-row-detail'><span class='field-label'>【" + label + "】</span><div class='field-value-block'>" + value + "</div></div>";
  } else {
    return "<div class='field-row-detail'><span class='field-label'>【" + label + "】</span><span class='field-value'>" + value + "</span></div>";
  }
}

// ============================================================
// 页面切换
// ============================================================
function goPage(name) {
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.getElementById('page-' + name).classList.add('active');
  if (name === 'search') document.getElementById('search-input').focus();
  if (name === 'list') renderList();
}

function backToList() { goPage('list'); renderList(); }

// 列表页内联筛选
var _fullResults = [];
function reSearch() {
  var q = document.getElementById('list-search-input').value.trim().toLowerCase();
  if (!q) { searchResults = _fullResults; currentPage = 1; renderList(); return; }
  var filtered = _fullResults.filter(function(d) {
    return d['药物'].toLowerCase().indexOf(q) >= 0 || d['首拼'].toLowerCase().indexOf(q) >= 0 || d['适应症'].toLowerCase().indexOf(q) >= 0;
  });
  searchResults = filtered;
  currentPage = 1;
  renderList();
}

// ============================================================
// 搜索
// ============================================================
function doSearch() {
  var q = document.getElementById('search-input').value.trim();
  if (!q) return;
  var keys = q.split(/\s+/);
  var results = DRUGS.filter(function(d) {
    for (var k = 0; k < keys.length; k++) {
      var kw = keys[k].toLowerCase();
      if (d['药物'].indexOf(kw) >= 0 || d['首拼'].toLowerCase().indexOf(kw) >= 0 || d['适应症'].indexOf(kw) >= 0) continue;
      return false;
    }
    return true;
  });
  if (results.length === 0) {
    document.getElementById('modal-overlay').classList.add('show');
    return;
  }
  searchResults = results;
  _fullResults = results;
  currentPage = 1;
  goPage('list');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('show');
  document.getElementById('search-input').focus();
}

// ============================================================
// 列表渲染
// ============================================================
function renderList() {
  var info = document.getElementById('search-info');
  var q = document.getElementById('search-input').value.trim();
  var filterQ = document.getElementById('list-search-input').value.trim();
  if (filterQ) {
    info.textContent = '搜索 "' + q + '" — 筛选 "' + filterQ + '" — 共 ' + searchResults.length + ' 条';
  } else {
    info.textContent = '搜索 "' + q + '" — 共 ' + searchResults.length + ' 条结果';
  }

  var start = (currentPage - 1) * PAGE_SIZE;
  var end = Math.min(start + PAGE_SIZE, searchResults.length);
  var pageData = searchResults.slice(start, end);

  var html = "<table id='list-table'><thead><tr><th>药物</th><th>分类信息</th></tr></thead><tbody>";
  for (var i = 0; i < pageData.length; i++) {
    var d = pageData[i];
    var idx = start + i;
    html += "<tr onclick='showDetail(" + idx + ")'><td class='drug-name'>" + d['药物'] + "</td><td class='drug-cat'>" + d['分类信息'] + "</td></tr>";
  }
  html += "</tbody></table>";

  var totalPages = Math.ceil(searchResults.length / PAGE_SIZE);
  html += "<div class='pagination'><button onclick='prevPage()' " + (currentPage <= 1 ? "disabled" : "") + ">上一页</button><span>" + currentPage + "/" + totalPages + "</span><button onclick='nextPage()' " + (currentPage >= totalPages ? "disabled" : "") + ">下一页</button></div>";

  document.getElementById('list-container').innerHTML = html;
}

function prevPage() { if (currentPage > 1) { currentPage--; renderList(); } }
function nextPage() { var total = Math.ceil(searchResults.length / PAGE_SIZE); if (currentPage < total) { currentPage++; renderList(); } }

// ============================================================
// 详情
// ============================================================
function showDetail(idx) {
  var d = searchResults[idx];
  selectedDrug = d;
  var html = "<div class='detail-title-row'><span class='drug-title'>" + d['药物'] + "</span><span class='drug-tag'>" + d['分类信息'] + "</span></div>";
  html += "<hr style='margin:10px 0;border:none;border-top:1px solid #eee'>";

  if (d['来源'] === '普通药物') {
    html += renderField("目录层级", d['分类信息'], false);
    html += renderField("途径", d['途径'], false);
    html += renderField("适应症", formatDrugText(d['适应症']), true);
    html += renderField("儿童用法用量", formatDrugText(d['儿童用法用量']), true);
    html += renderField("注意事项", formatDrugText(d['注意事项']), true);
  } else {
    html += renderField("化学结构 / 代次", d['分类信息'], false);
    html += renderField("途径", d['途径'], false);
    html += renderField("抗菌谱", formatDrugText(d['抗菌谱']), true);
    html += renderField("适应症", formatDrugText(d['适应症']), true);
    html += renderField("用法用量", formatDrugText(d['用法用量']), true);
    html += renderField("注意事项", formatDrugText(d['注意事项']), true);
  }

  document.getElementById('detail-content').innerHTML = html;
  goPage('detail');
}

// ============================================================
// 截图
// ============================================================
function takeScreenshot() {
  var area = document.getElementById('detail-area');
  if (!area) return;
  html2canvas(area, { scale: 2, backgroundColor: '#ffffff', useCORS: true }).then(function(canvas) {
    var link = document.createElement('a');
    var name = (selectedDrug ? selectedDrug['药物'] : 'drug_info').replace(/[%％()（）\[\]\/:：]/g, '').trim();
    name = name.length > 30 ? name.substring(0, 30) : name;
    link.download = name + '_说明书.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  });
}

// ============================================================
// 计算器
// ============================================================
function buildCalc() {
  var grid = document.getElementById('calc-grid');
  var btns = [
    {t:'C',c:'calc-func',f:'calcClear()'},{t:'⌫',c:'calc-func',f:'calcBackspace()'},
    {t:'/',c:'calc-op',f:"calcInput('/')"},{t:'*',c:'calc-op',f:"calcInput('*')"},
    {t:'7',f:"calcInput('7')"},{t:'8',f:"calcInput('8')"},{t:'9',f:"calcInput('9')"},{t:'-',c:'calc-op',f:"calcInput('-')"},
    {t:'4',f:"calcInput('4')"},{t:'5',f:"calcInput('5')"},{t:'6',f:"calcInput('6')"},{t:'+',c:'calc-op',f:"calcInput('+')"},
    {t:'1',f:"calcInput('1')"},{t:'2',f:"calcInput('2')"},{t:'3',f:"calcInput('3')"},{t:'.',f:"calcInput('.')"},
    {t:'0',f:"calcInput('0')"},{t:'00',f:"calcInput('00')"},{t:'=',id:'btn-equal',f:'calcEvaluate()'}
  ];
  var html = '';
  for (var i = 0; i < btns.length; i++) {
    var b = btns[i];
    html += "<button class='calc-btn " + (b.c||'') + "'" + (b.id?" id='"+b.id+"'":"") + " onclick=\"" + b.f + "\">" + b.t + "</button>";
  }
  grid.innerHTML = html;
}

function toggleCalc() {
  isCalcOpen = !isCalcOpen;
  var c = document.getElementById('calc-container');
  c.classList.toggle('show', isCalcOpen);
  if (isCalcOpen) {
    var detail = document.getElementById('detail-area');
    if (detail) {
      var r = detail.getBoundingClientRect();
      var bw = c.offsetWidth || 230;
      c.style.position = 'fixed';
      c.style.right = Math.max(5, (window.innerWidth - r.right)) + 'px';
      c.style.bottom = Math.max(5, (window.innerHeight - r.bottom)) + 'px';
      c.style.left = '';
      c.style.top = '';
    } else {
      c.style.position = 'fixed';
      c.style.right = '10px';
      c.style.bottom = '80px';
      c.style.left = '';
      c.style.top = '';
    }
  }
}
function calcInput(v) {
  var d = document.getElementById('calc-display');
  if (_justEvaluated && /^[\d.]/.test(v)) { d.value = ''; }
  _justEvaluated = false;
  d.value += v;
}
function calcClear() { document.getElementById('calc-display').value = ''; }
function calcBackspace() {
  var d = document.getElementById('calc-display');
  d.value = d.value.slice(0, -1);
}
function calcEvaluate() {
  var d = document.getElementById('calc-display');
  if (!d.value) return;
  try {
    var r = Function('"use strict"; return (' + d.value + ')')();
    d.value = Number.isInteger(r) ? r : r.toFixed(2);
    _justEvaluated = true;
  } catch(e) { d.value = 'Error'; }
}

// 拖拽（只响应 calc-drag-icon，避开 × 按钮；支持触摸）
var dragEl = null, dx = 0, dy = 0;

function startDrag(e) {
  var t = e.touches ? e.touches[0] : e;
  var target = e.target;
  // 只从 ☰ 图标（calc-drag-icon）开始拖动，点击 ✕ 不触发
  if (!target || !target.classList || !target.classList.contains('calc-drag-icon')) return;
  var c = document.getElementById('calc-container');
  if (!c.classList.contains('show')) return;
  c.style.position = 'fixed';
  c.style.right = '';
  c.style.bottom = '';
  dragEl = c;
  var rect = dragEl.getBoundingClientRect();
  dx = t.clientX - rect.left;
  dy = t.clientY - rect.top;
  e.preventDefault();
}

function moveDrag(e) {
  if (!dragEl) return;
  var t = e.touches ? e.touches[0] : e;
  dragEl.style.left = (t.clientX - dx) + 'px';
  dragEl.style.top = (t.clientY - dy) + 'px';
  dragEl.style.right = 'auto';
  dragEl.style.bottom = 'auto';
  e.preventDefault();
}

function endDrag() { dragEl = null; }

document.addEventListener('mousedown', startDrag);
document.addEventListener('mousemove', moveDrag);
document.addEventListener('mouseup', endDrag);
document.addEventListener('touchstart', startDrag, {passive: false});
document.addEventListener('touchmove', moveDrag, {passive: false});
document.addEventListener('touchend', endDrag);

// ============================================================
// 加载数据
// ============================================================
function loadData() {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', 'data/drugs.json', true);
  xhr.onload = function() {
    if (xhr.status === 200) {
      var data = JSON.parse(xhr.responseText);
      for (var i = 0; i < data.length; i++) DRUGS.push(data[i]);
      console.log('✅ 加载完成：' + DRUGS.length + ' 条药品');
    }
  };
  xhr.send();
}

// 初始化
buildCalc();
loadData();
