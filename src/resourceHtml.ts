// Shared HTML rendering for the resource details sidebar webview.

interface CostComponentDetail {
  name: string;
  unit: string;
  price: string;
  monthlyQuantity: string;
  monthlyCost: string;
}

interface PolicyDetail {
  risk?: string;
  effort?: string;
  downtime?: string;
  riskDescription?: string;
  effortDescription?: string;
  downtimeDescription?: string;
  additionalDetails?: string;
  shortTitle?: string;
}

interface ViolationDetail {
  policyName: string;
  message: string;
  blockPullRequest: boolean;
  monthlySavings?: string;
  policyDetail?: PolicyDetail;
}

interface TagViolationDetail {
  policyName: string;
  blockPR: boolean;
  message: string;
  policyMessage?: string;
  missingTags?: string[];
  invalidTags?: {
    key: string;
    value: string;
    suggestion?: string;
    message?: string;
    validValues?: string[];
  }[];
}

export interface ResourceDetail {
  name: string;
  type: string;
  monthlyCost: string;
  costComponents: CostComponentDetail[];
  violations: ViolationDetail[];
  tagViolations: TagViolationDetail[];
}

export interface ResourceDetailsResult {
  resource?: ResourceDetail;
  scanning: boolean;
  needsLogin?: boolean;
}

export interface GuardrailStatus {
  name: string;
  message: string;
  blockPr: boolean;
  totalMonthlyCost?: string;
  threshold?: string;
}

export interface StatusInfo {
  version: string;
  workspaceRoot: string;
  loggedIn: boolean;
  scanning: boolean;
  projectCount: number;
  projectNames: string[];
  resourceCount: number;
  violationCount: number;
  tagIssueCount: number;
  configFound: boolean;
  triggeredGuardrails?: GuardrailStatus[];
}

export interface OrgEntry {
  id: string;
  name: string;
  slug: string;
}

export interface OrgInfo {
  organizations: OrgEntry[];
  selectedOrgId: string;
  hasExplicitSelection: boolean;
}

export interface WorkspaceSummaryResource {
  name: string;
  line: number;
  monthlyCost?: string;
  policyIssues: number;
  tagIssues: number;
}

export interface WorkspaceSummaryFile {
  path: string;
  uri: string;
  resources: WorkspaceSummaryResource[];
}

export interface WorkspaceSummaryResult {
  files: WorkspaceSummaryFile[];
}

export interface RenderOptions {
  codiconUri?: string;
  cspSource?: string;
  fileIconUris?: Record<string, string>;
  orgInfo?: OrgInfo;
  guardrails?: GuardrailStatus[];
}

const STYLES = `
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    padding: 8px;
    margin: 0;
    position: relative;
    min-height: 100vh;
    box-sizing: border-box;
  }
  .state {
    text-align: center;
    padding: 24px 8px;
    color: var(--vscode-descriptionForeground);
  }
  .header {
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--vscode-widget-border);
  }
  .resource-name {
    font-weight: bold;
    word-break: break-all;
  }
  .resource-cost {
    font-weight: normal;
    color: var(--vscode-charts-green);
    margin-left: auto;
  }
  .section {
    margin-bottom: 12px;
  }
  details > summary { list-style: none; }
  details > summary::-webkit-details-marker { display: none; }
  details > summary::before {
    content: '[+]';
    display: inline-block;
    width: 2em;
    text-align: center;
    margin-right: 4px;
    font-family: var(--vscode-editor-font-family);
    font-size: 0.75em;
    opacity: 0.7;
    flex-shrink: 0;
  }
  details[open] > summary::before { content: '[-]'; }
  .section summary {
    cursor: pointer;
    font-weight: bold;
    padding: 4px 0;
    user-select: none;
    display: flex;
    align-items: baseline;
    gap: 4px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9em;
    margin-top: 4px;
  }
  th, td {
    text-align: left;
    padding: 3px 6px;
    border-bottom: 1px solid var(--vscode-widget-border);
  }
  .num { text-align: right; }
  .violation {
    padding: 1px 8px;
    margin: 6px 0;
    border-left: 3px solid var(--vscode-widget-border);
  }
  .violation > summary {
    cursor: pointer;
    padding-bottom: 6px;
    font-weight: bold;
    user-select: none;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    overflow-wrap: break-word;
    word-break: break-word;
  }
  .violation-message {
    color: var(--vscode-foreground);
    line-height: 1.5;
    overflow-wrap: break-word;
    word-break: break-word;
  }
  .badges { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 4px; }
  .badge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 0.8em;
    font-weight: 600;
    background: var(--vscode-editor-inactiveSelectionBackground);
    color: var(--vscode-foreground);
  }
  .badge.blocking {
    background: var(--vscode-inputValidation-errorBackground);
    color: var(--vscode-inputValidation-errorForeground);
  }
  a { color: var(--vscode-textLink-foreground); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .login-btn {
    display: inline-block;
    padding: 6px 14px;
    margin-top: 12px;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: var(--vscode-font-size);
    font-family: var(--vscode-font-family);
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  .login-btn:hover { background: var(--vscode-button-hoverBackground); }
  .savings {
    margin-top: 4px;
    color: var(--vscode-charts-green);
    font-weight: 600;
  }
  .policy-details {
    margin-top: 6px;
    padding: 6px;
    border-radius: 3px;
    background: var(--vscode-editor-background);
    font-size: 0.9em;
    color: var(--vscode-foreground);
  }
  .detail-row { margin: 6px 0; line-height: 1.5; }
  .tag-list {
    margin-top: 4px;
    font-size: 0.9em;
    line-height: 1.5;
  }
  .tag-message {
    margin-top: 2px;
    font-size: 0.85em;
    color: var(--vscode-descriptionForeground);
  }
  .policy-message {
    margin-top: 4px;
    font-size: 0.9em;
  }
  code {
    background: var(--vscode-textCodeBlock-background);
    padding: 1px 4px;
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family);
  }
  .empty-links {
    position: absolute;
    bottom: 16px;
    left: 8px;
    right: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.9em;
  }
  .empty-links a {
    color: var(--vscode-textLink-foreground);
    text-decoration: none;
  }
  .empty-links a:hover { text-decoration: underline; }
  #ic-filter-bar {
    padding: 4px 0 6px;
    position: sticky;
    top: 0;
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    z-index: 1;
  }
  #ic-filter {
    width: 100%;
    box-sizing: border-box;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px;
    padding: 3px 6px;
    font-size: 12px;
    font-family: inherit;
    outline: none;
  }
  #ic-filter:focus { border-color: var(--vscode-focusBorder); }
  #ic-tree {
    margin: 0 -8px;
    padding-bottom: 80px;
    user-select: none;
  }
  .ic-row {
    display: flex;
    align-items: center;
    height: 22px;
    gap: 4px;
    cursor: default;
    box-sizing: border-box;
    padding-right: 8px;
  }
  .ic-collapsible { cursor: pointer; }
  .ic-row:hover { background: var(--vscode-list-hoverBackground); }
  .ic-resource { cursor: pointer; justify-content: space-between; }
  .ic-chevron { flex-shrink: 0; font-size: 14px; width: 16px; text-align: center; color: var(--vscode-descriptionForeground); }
  .ic-icon { flex-shrink: 0; font-size: 14px; }
  .ic-file-img { flex-shrink: 0; width: 14px; height: 14px; object-fit: contain; }
  .ic-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ic-resource-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--vscode-editor-font-family);
    font-size: 0.85em;
    color: var(--vscode-foreground);
  }
  .ic-badge-issues {
    flex-shrink: 0;
    padding: 0 5px;
    border-radius: 3px;
    font-size: 0.75em;
    line-height: 16px;
    white-space: nowrap;
    margin-right: 8px;
    background: var(--vscode-inputValidation-warningBackground);
    color: var(--vscode-inputValidation-warningForeground);
  }
  .login-status {
    margin-top: 4px;
    font-size: 0.9em;
  }
  .issue-list {
    list-style: none;
    padding: 0;
    margin: 6px 0 0 0;
  }
  .issue-list li {
    padding: 6px 0;
    border-bottom: 1px solid var(--vscode-widget-border);
  }
  .issue-list li:last-child { border-bottom: none; }
  .issue-list a {
    color: var(--vscode-foreground);
    text-decoration: none;
    display: block;
  }
  .issue-list a:hover .resource-link-name { color: var(--vscode-textLink-foreground); }
  .file-path {
    font-family: var(--vscode-editor-font-family);
    font-size: 0.8em;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 4px;
    word-break: break-all;
  }
  .resource-row-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
  }
  .resource-link-name {
    font-family: var(--vscode-editor-font-family);
    font-size: 0.85em;
    word-break: break-all;
    line-height: 1.4;
  }
  .resource-row-cost {
    color: var(--vscode-charts-green);
    font-size: 0.85em;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .resource-row-issues {
    display: flex;
    gap: 4px;
    flex-wrap: nowrap;
    flex-shrink: 0;
    margin-left: 6px;
  }
  [data-tooltip] {
    position: relative;
  }
  [data-tooltip]::after {
    content: attr(data-tooltip);
    position: absolute;
    bottom: calc(100% + 4px);
    left: 50%;
    transform: translateX(-50%);
    background: var(--vscode-editorHoverWidget-background);
    color: var(--vscode-editorHoverWidget-foreground);
    border: 1px solid var(--vscode-editorHoverWidget-border);
    padding: 3px 8px;
    border-radius: 3px;
    font-size: 0.85em;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.1s;
    z-index: 10;
  }
  [data-tooltip]:hover::after { opacity: 1; }
  .back-nav {
    margin-bottom: 8px;
  }
  .back-nav a {
    color: var(--vscode-textLink-foreground);
    text-decoration: none;
    font-size: 0.9em;
  }
  .back-nav a:hover { text-decoration: underline; }
  .status-table { font-size: 0.9em; }
  .status-table td:first-child {
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
    padding-right: 12px;
  }
  .status-table td { border-bottom: none; }
  .project-list {
    list-style: none;
    padding: 0;
    margin: 4px 0 0 0;
    font-size: 0.9em;
  }
  .project-list li { padding: 2px 0; }
  .status-indicators {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.9em;
  }
  .guardrail-banner {
    padding: 7px 10px;
    margin-bottom: 8px;
    border-radius: 3px;
    border-left: 3px solid;
  }
  .guardrail-banner.blocking {
    background: var(--vscode-inputValidation-errorBackground);
    color: var(--vscode-inputValidation-errorForeground);
    border-color: var(--vscode-inputValidation-errorBorder);
  }
  .guardrail-banner.warning {
    background: var(--vscode-inputValidation-warningBackground);
    color: var(--vscode-inputValidation-warningForeground);
    border-color: var(--vscode-inputValidation-warningBorder);
  }
  .guardrail-banner-name { font-weight: bold; margin-bottom: 2px; }
  .guardrail-banner-message { font-size: 0.9em; }
  .guardrail-banner-cost { font-size: 0.85em; margin-top: 4px; opacity: 0.9; }
  .copilot-fix {
    display: flex;
    justify-content: flex-end;
    margin-top: 8px;
  }
  .copilot-fix-btn {
    display: inline-block;
    padding: 3px 8px;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: 0.85em;
    font-family: var(--vscode-font-family);
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  .copilot-fix-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .org-footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 5px 8px;
    border-top: 1px solid var(--vscode-panel-border);
    background: var(--vscode-sideBar-background);
    font-size: 0.9em;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .org-footer .org-name {
    color: var(--vscode-foreground);
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .org-footer .org-dot { color: var(--vscode-charts-green); font-size: 0.75em; }
  .org-footer .org-label { color: var(--vscode-descriptionForeground); font-weight: normal; }
  .org-footer a { color: var(--vscode-textLink-foreground); font-size: 0.85em; }
  body.has-footer { padding-bottom: 36px; }
  body.has-footer .empty-links { bottom: 52px; }
`;

export function renderPage(body: string, opts?: RenderOptions): string {
  const { orgInfo, guardrails, cspSource, codiconUri } = opts ?? {};
  const footer = orgInfo && orgInfo.organizations?.length > 0 ? renderOrgFooter(orgInfo) : '';
  const banner = guardrails && guardrails.length > 0 ? renderGuardrailsBanner(guardrails) : '';
  const extraSrc = cspSource ? ` ${cspSource}` : '';
  const codiconLink = codiconUri ? `<link rel="stylesheet" href="${codiconUri}">` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'${extraSrc}; script-src 'unsafe-inline'; font-src${
    extraSrc || ' none'
  }; img-src${extraSrc || ' none'};">
${codiconLink}
<style>
${STYLES}
</style>
<script>window.__vscode = acquireVsCodeApi();</script>
</head>
<body class="${footer ? 'has-footer' : ''}">${banner}${body}
${footer}
<script>
(function() {
  const vscode = window.__vscode;
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('.copilot-fix-btn');
    if (btn) {
      vscode.postMessage({ command: 'fixWithCopilot', prompt: btn.dataset.prompt });
      return;
    }
    const cmd = e.target.closest('[data-command]');
    if (cmd) {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('infracost', { detail: { command: cmd.dataset.command } }));
    }
  });
  document.addEventListener('infracost', function(e) {
    vscode.postMessage(e.detail);
  });
})();
</script>
</body>
</html>`;
}

function renderFooterLinks(): string {
  return `<div class="empty-links">
  <a href="#" data-command="troubleshoot">Troubleshooting</a>
  <a href="https://infracost.io/community-chat">Join the Slack</a>
  <a href="https://github.com/infracost/vscode-infracost/discussions">Raise an issue</a>
</div>`;
}

function renderOrgFooter(orgInfo: OrgInfo): string {
  const active = orgInfo.organizations.find((o) => o.id === orgInfo.selectedOrgId);
  if (!active) {
    return '';
  }
  const changeLink =
    orgInfo.organizations.length > 1 ? `<a href="#" data-command="selectOrg">Change</a>` : '';
  return `<div class="org-footer"><span class="org-name"><span class="org-dot">●</span><span class="org-label">Organization:</span>${esc(
    active.name
  )}</span>${changeLink}</div>`;
}

function renderGuardrailsBanner(guardrails: GuardrailStatus[]): string {
  return guardrails
    .map((g) => {
      const cls = g.blockPr ? 'blocking' : 'warning';
      const icon = g.blockPr ? '⛔' : '⚠️';
      const costParts: string[] = [];
      if (g.totalMonthlyCost) costParts.push(`Total: ${esc(g.totalMonthlyCost)}/mo`);
      if (g.threshold) costParts.push(`Limit: ${esc(g.threshold)}`);
      const costLine =
        costParts.length > 0
          ? `<div class="guardrail-banner-cost">${costParts.join('&nbsp;&nbsp;')}</div>`
          : '';
      return `<div class="guardrail-banner ${cls}"><div class="guardrail-banner-name">${icon} ${esc(
        g.name
      )}</div><div class="guardrail-banner-message">${esc(g.message)}</div>${costLine}</div>`;
    })
    .join('');
}

export function renderEmpty(files: WorkspaceSummaryFile[], opts?: RenderOptions): string {
  const filesJson = JSON.stringify(
    files.map((f) => ({
      path: f.path,
      uri: f.uri,
      resources: f.resources.map((r) => ({
        name: r.name,
        line: r.line,
        monthlyCost: r.monthlyCost ?? '',
        policyIssues: r.policyIssues || 0,
        tagIssues: r.tagIssues || 0,
      })),
    }))
  )
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');

  const body = `
<div id="ic-filter-bar"><input id="ic-filter" type="text" placeholder="Filter..."></div>
<div id="ic-tree"></div>
${renderFooterLinks()}
<script>
(function () {
  var FILES = ${filesJson};
  var FILE_ICONS = ${JSON.stringify(opts?.fileIconUris ?? {})};
  var TREE = null;

  function filterTree(nodes, q) {
    var result = [];
    nodes.forEach(function (node) {
      if (node.type === 'folder') {
        var filtered = filterTree(node.children, q);
        if (filtered.length > 0) result.push({ type: 'folder', label: node.label, children: filtered });
      } else if (node.type === 'file') {
        var filenameMatch = node.label.toLowerCase().indexOf(q) !== -1;
        if (filenameMatch) {
          result.push(node);
        } else {
          var matched = node.resources.filter(function (r) { return r.name.toLowerCase().indexOf(q) !== -1; });
          if (matched.length > 0) result.push({ type: 'file', label: node.label, uri: node.uri, resources: matched });
        }
      }
    });
    return result;
  }

  function render(q) {
    var isFiltering = !!(q && q.length > 0);
    var nodes = isFiltering ? filterTree(TREE, q.toLowerCase()) : TREE;
    var root = document.getElementById('ic-tree');
    root.innerHTML = '';
    if (FILES.length === 0 || (isFiltering && nodes.length === 0)) {
      var msg = document.createElement('div');
      msg.className = 'state';
      msg.textContent = FILES.length === 0 ? 'No resources found' : 'No matches';
      root.appendChild(msg);
    } else {
      renderNodes(nodes, root, 0, isFiltering);
    }
  }

  function buildTree(files) {
    var roots = [];
    files.forEach(function (file) {
      var parts = file.path.replace(/\\\\/g, '/').split('/').filter(Boolean);
      if (parts.length > 0) insertFile(roots, parts, file);
    });
    sortNodes(roots);
    return roots;
  }

  function insertFile(nodes, parts, file) {
    if (parts.length === 1) {
      nodes.push({ type: 'file', label: parts[0], uri: file.uri, resources: file.resources });
      return;
    }
    var label = parts[0];
    var folder = null;
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].type === 'folder' && nodes[i].label === label) { folder = nodes[i]; break; }
    }
    if (!folder) {
      folder = { type: 'folder', label: label, children: [] };
      nodes.push(folder);
    }
    insertFile(folder.children, parts.slice(1), file);
  }

  function sortNodes(nodes) {
    nodes.sort(function (a, b) {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
    });
    nodes.forEach(function (n) { if (n.type === 'folder') sortNodes(n.children); });
  }

  function fileIconNode(name) {
    var ext = name.split('.').pop() || '';
    var uri = FILE_ICONS[ext];
    if (uri) {
      var img = document.createElement('img');
      img.src = uri;
      img.className = 'ic-file-img';
      return img;
    }
    return icon('file-code');
  }

  function el(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  function icon(name) {
    return el('i', 'codicon codicon-' + name);
  }

  function renderNodes(nodes, container, depth, forceExpand) {
    nodes.forEach(function (node) {
      if (node.type === 'folder') renderFolder(node, container, depth, forceExpand);
      else renderFile(node, container, depth);
    });
  }

  function renderCollapsible(labelText, iconName, chevronName, children, container, depth, forceExpand) {
    var item = el('div', 'ic-item');
    var row = el('div', 'ic-row ic-collapsible');
    row.style.paddingLeft = (depth * 8 + 4) + 'px';

    var startExpanded = forceExpand || chevronName === 'chevron-down';
    var chevron = icon(startExpanded ? 'chevron-down' : 'chevron-right');
    chevron.className += ' ic-chevron';
    var nodeIcon = icon(iconName);
    nodeIcon.className += ' ic-icon';
    var label = el('span', 'ic-label');
    label.textContent = labelText;

    row.appendChild(chevron);
    row.appendChild(nodeIcon);
    row.appendChild(label);

    var childContainer = el('div', 'ic-children');
    if (!startExpanded) childContainer.style.display = 'none';
    renderNodes(children, childContainer, depth + 1, forceExpand);

    row.addEventListener('click', function () {
      var expanded = item.dataset.expanded !== 'false';
      item.dataset.expanded = expanded ? 'false' : 'true';
      chevron.className = 'codicon codicon-' + (expanded ? 'chevron-right' : 'chevron-down') + ' ic-chevron';
      nodeIcon.className = 'codicon codicon-' + (expanded ? iconName.replace('opened', 'closed').replace('-opened', '') : iconName) + ' ic-icon';
      childContainer.style.display = expanded ? 'none' : '';
    });

    item.appendChild(row);
    item.appendChild(childContainer);
    container.appendChild(item);
  }

  function renderFolder(node, container, depth, forceExpand) {
    renderCollapsible(node.label, 'folder-opened', 'chevron-down', node.children, container, depth, forceExpand);
  }

  function renderFile(node, container, depth) {
    var item = el('div', 'ic-item');
    var row = el('div', 'ic-row ic-collapsible');
    row.style.paddingLeft = (depth * 8 + 4) + 'px';

    var chevron = icon('chevron-down');
    chevron.className += ' ic-chevron';
    var nodeIcon = fileIconNode(node.label);
    var label = el('span', 'ic-label');
    label.textContent = node.label;

    row.appendChild(chevron);
    row.appendChild(nodeIcon);
    row.appendChild(label);

    var childContainer = el('div', 'ic-children');
    var sortedResources = node.resources.slice().sort(function (a, b) {
      var ia = (a.policyIssues || 0) + (a.tagIssues || 0);
      var ib = (b.policyIssues || 0) + (b.tagIssues || 0);
      if (ib !== ia) return ib - ia;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
    sortedResources.forEach(function (r) { renderResource(r, node.uri, childContainer, depth + 1); });

    row.addEventListener('click', function () {
      var expanded = item.dataset.expanded !== 'false';
      item.dataset.expanded = expanded ? 'false' : 'true';
      chevron.className = 'codicon codicon-' + (expanded ? 'chevron-right' : 'chevron-down') + ' ic-chevron';
      childContainer.style.display = expanded ? 'none' : '';
    });

    item.appendChild(row);
    item.appendChild(childContainer);
    container.appendChild(item);
  }

  function renderResource(r, uri, container, depth) {
    var row = el('div', 'ic-row ic-resource');
    row.style.paddingLeft = (depth * 8 + 42) + 'px';

    var name = el('span', 'ic-resource-name');
    name.textContent = r.name;
    row.appendChild(name);

    var totalIssues = (r.policyIssues || 0) + (r.tagIssues || 0);
    if (totalIssues > 0) {
      var badge = el('span', 'ic-badge-issues');
      badge.textContent = totalIssues + ' issue' + (totalIssues !== 1 ? 's' : '');
      row.appendChild(badge);
    }

    row.addEventListener('click', function () {
      document.dispatchEvent(new CustomEvent('infracost', {
        detail: { command: 'revealResource', uri: uri, line: r.line }
      }));
    });

    container.appendChild(row);
  }

  TREE = buildTree(FILES);

  var filterInput = document.getElementById('ic-filter');
  var vs = window.__vscode;
  var savedState = vs ? vs.getState() : null;
  var initialFilter = (savedState && savedState.filter) || '';
  if (filterInput && initialFilter) filterInput.value = initialFilter;
  render(initialFilter);

  if (filterInput) {
    filterInput.addEventListener('input', function () {
      var q = filterInput.value;
      if (vs) vs.setState({ filter: q });
      render(q);
    });
  }
})();
</script>`;

  return renderPage(body, opts);
}

export function renderScanning(opts?: RenderOptions): string {
  return renderPage(`<div class="state">Scanning...</div>`, opts);
}

export function renderLogin(): string {
  return renderPage(`<div class="state">
  <p>Login to Infracost Cloud to see Costs, FinOps policies, and Tagging issues.</p>
  <button class="login-btn" data-command="login">Login to Infracost</button>
</div>
${renderFooterLinks()}`);
}

export function renderLoginVerifying(userCode: string): string {
  return renderPage(`<div class="state">
  <p>Verify the code in your browser matches:</p>
  <div style="font-size:1.4em;font-weight:bold;letter-spacing:2px;margin:12px 0;">${esc(
    userCode
  )}</div>
  <p style="color:var(--vscode-descriptionForeground);margin-top:8px;">Waiting for login to complete, this may take a few seconds…</p>
</div>
${renderFooterLinks()}`);
}

export function renderTroubleshooting(status: StatusInfo, opts?: RenderOptions): string {
  const serverStatus = status.version
    ? '<span style="color:var(--vscode-charts-green);">● Server running</span>'
    : '<span style="color:var(--vscode-editorError-foreground);">● Server not running</span>';

  const loginStatus = status.loggedIn
    ? '<span style="color:var(--vscode-charts-green);">● Logged in</span>'
    : '<span style="color:var(--vscode-descriptionForeground);">○ Not logged in</span> — <a href="#" data-command="login">Login</a>';

  const configStatus = status.configFound
    ? `Found (${status.projectCount} project${status.projectCount !== 1 ? 's' : ''})`
    : '<span style="color:var(--vscode-editorWarning-foreground);">Not found</span>';

  const projects =
    status.projectNames && status.projectNames.length > 0
      ? status.projectNames.map((n) => `<li>${esc(n)}</li>`).join('')
      : '<li style="color:var(--vscode-descriptionForeground);">None</li>';

  return renderPage(
    `
<div class="back-nav"><a href="#" data-command="back">&larr; Back</a></div>
<div class="section status-indicators">
  <div>${serverStatus}</div>
  <div>${loginStatus}</div>
</div>
<div class="section">
  <strong>Details</strong>
  <table class="status-table">
    <tr><td>Server version</td><td>${esc(status.version || 'N/A')}</td></tr>
    <tr><td>Workspace</td><td>${esc(status.workspaceRoot || 'Not set')}</td></tr>
    <tr><td>Scan</td><td>${esc(status.scanning ? 'In progress' : 'Idle')}</td></tr>
    <tr><td>Config</td><td>${configStatus}</td></tr>
    <tr><td>Resources</td><td>${status.resourceCount}</td></tr>
    <tr><td>Policy issues</td><td>${status.violationCount}</td></tr>
    <tr><td>Tag issues</td><td>${status.tagIssueCount}</td></tr>
  </table>
</div>
<div class="section">
  <strong>Projects</strong>
  <ul class="project-list">${projects}</ul>
</div>
<div class="section">
  <strong>Actions</strong>
  <ul class="project-list">
    <li><a href="#" data-command="restartClient">Restart client</a></li>
    <li><a href="#" data-command="restartLsp">Restart language server</a></li>
    <li><a href="#" data-command="viewLogs">View logs</a></li>
    <li><a href="#" data-command="generateBundle">Generate support bundle</a></li>
  </ul>
</div>
`,
    opts
  );
}

export function renderResult(
  data: ResourceDetailsResult,
  copilotAvailable: boolean,
  opts?: RenderOptions
): string {
  if (data.scanning) {
    return renderScanning(opts);
  }
  if (data.needsLogin) {
    return renderLogin();
  }
  if (!data.resource) {
    return renderEmpty([], opts);
  }
  return renderPage(renderResource(data.resource, copilotAvailable), opts);
}

function renderResource(r: ResourceDetail, copilotAvailable: boolean): string {
  const parts: string[] = [];

  parts.push(`<div class="back-nav"><a href="#" data-command="back">&larr; Back</a></div>`);

  parts.push(`
    <div class="header">
      <div class="resource-name">${esc(r.name)}</div>
    </div>
  `);

  if (r.costComponents && r.costComponents.length > 0) {
    parts.push(`
      <details class="section">
        <summary>Cost Components <span class="resource-cost">${esc(
          r.monthlyCost
        )}/mo</span></summary>
        <table>
          <thead><tr><th>Component</th><th>Qty</th><th>Price</th><th>Monthly</th></tr></thead>
          <tbody>
            ${r.costComponents
              .map(
                (c) => `
              <tr>
                <td>${esc(c.name)}</td>
                <td class="num">${esc(c.monthlyQuantity)} ${esc(c.unit)}</td>
                <td class="num">${esc(c.price)}</td>
                <td class="num">${esc(c.monthlyCost)}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </details>
    `);
  }

  if (r.violations && r.violations.length > 0) {
    parts.push(`
      <details class="section" open>
        <summary>FinOps Issues (${r.violations.length})</summary>
        ${r.violations.map((v) => renderViolation(v, r.name, copilotAvailable)).join('')}
      </details>
    `);
  }

  if (r.tagViolations && r.tagViolations.length > 0) {
    parts.push(`
      <details class="section" open>
        <summary>Tag Issues (${r.tagViolations.length})</summary>
        ${r.tagViolations.map((v) => renderTagViolation(v, r.name, copilotAvailable)).join('')}
      </details>
    `);
  }

  return parts.join('');
}

function renderViolation(
  v: ViolationDetail,
  resourceName: string,
  copilotAvailable: boolean
): string {
  const badges: string[] = [];
  if (v.blockPullRequest) {
    badges.push(`<span class="badge blocking">Blocking</span>`);
  }

  const badgesHtml = badges.length > 0 ? `<div class="badges">${badges.join('')}</div>` : '';

  let details = '';
  if (v.policyDetail) {
    const pd = v.policyDetail;
    const rows: string[] = [];
    if (pd.riskDescription) {
      rows.push(
        `<div class="detail-row"><strong>Risk</strong><div>${linkify(
          pd.riskDescription
        )}</div></div>`
      );
    }
    if (pd.effortDescription) {
      rows.push(
        `<div class="detail-row"><strong>Effort</strong><div>${linkify(
          pd.effortDescription
        )}</div></div>`
      );
    }
    if (pd.downtimeDescription) {
      rows.push(
        `<div class="detail-row"><strong>Downtime</strong><div>${linkify(
          pd.downtimeDescription
        )}</div></div>`
      );
    }
    if (pd.additionalDetails) {
      rows.push(`<div class="detail-row">${linkify(pd.additionalDetails)}</div>`);
    }
    if (rows.length > 0) {
      details = `<div class="policy-details">${rows.join('')}</div>`;
    }
  }

  const savings =
    v.monthlySavings && v.monthlySavings !== '$0.00'
      ? `<div class="savings">Potential savings: ${esc(
          v.monthlySavings.replace(/^-/, '')
        )}/mo</div>`
      : '';

  let copilotBtn = '';
  if (copilotAvailable) {
    const promptParts = [
      `Fix the following FinOps policy violation on resource "${resourceName}":`,
      v.message,
    ];
    if (v.policyDetail?.additionalDetails) {
      promptParts.push(v.policyDetail.additionalDetails);
    }
    const prompt = promptParts.join('\n\n');
    copilotBtn = `<div class="copilot-fix"><button class="copilot-fix-btn" data-prompt="${escAttr(
      prompt
    )}">Fix with Copilot</button></div>`;
  }

  return `
    <details class="violation" open>
      <summary>${esc(v.policyDetail?.shortTitle || v.policyName)}${badgesHtml}</summary>
      <div class="violation-message">${linkify(v.message)}</div>
      ${savings}
      ${details}
      ${copilotBtn}
    </details>
  `;
}

function renderTagViolation(
  v: TagViolationDetail,
  resourceName: string,
  copilotAvailable: boolean
): string {
  const badges: string[] = [];
  if (v.blockPR) {
    badges.push(`<span class="badge blocking">Blocking</span>`);
  }

  let tagList = '';
  if (v.missingTags && v.missingTags.length > 0) {
    tagList += `<div class="tag-list"><strong>Missing:</strong> ${v.missingTags
      .map((t) => `<code>${esc(t)}</code>`)
      .join(', ')}</div>`;
  }
  if (v.invalidTags && v.invalidTags.length > 0) {
    tagList += v.invalidTags
      .map(
        (t) =>
          `<div class="tag-list"><strong>${esc(t.key)}:</strong> <code>${esc(t.value)}</code>${
            t.message ? `<div class="tag-message">${esc(t.message)}</div>` : ''
          }${t.suggestion ? ` (suggestion: <code>${esc(t.suggestion)}</code>)` : ''}${
            t.validValues && t.validValues.length > 0
              ? `<div class="tag-list">Valid values: ${t.validValues
                  .map((val) => `<code>${esc(val)}</code>`)
                  .join(', ')}</div>`
              : ''
          }</div>`
      )
      .join('');
  }

  let copilotBtn = '';
  if (copilotAvailable) {
    const promptParts = [`Fix the following tag policy violation on resource "${resourceName}":`];
    if (v.missingTags && v.missingTags.length > 0) {
      promptParts.push(v.missingTags.map((t) => `Tag "${t}" is required but missing.`).join('\n'));
    }
    if (v.invalidTags && v.invalidTags.length > 0) {
      for (const t of v.invalidTags) {
        let line = `Tag "${t.key}" has an invalid value "${t.value}".`;
        if (t.message) {
          line += ` ${t.message}`;
        }
        if (t.validValues && t.validValues.length > 0) {
          line += ` Valid values: ${t.validValues.join(', ')}.`;
        }
        promptParts.push(line);
      }
    }
    if (v.policyMessage) {
      promptParts.push(v.policyMessage);
    }
    const prompt = promptParts.join('\n\n');
    copilotBtn = `<div class="copilot-fix"><button class="copilot-fix-btn" data-prompt="${escAttr(
      prompt
    )}">Fix with Copilot</button></div>`;
  }

  const badgesHtml = badges.length > 0 ? `<div class="badges">${badges.join('')}</div>` : '';

  return `
    <details class="violation" open>
      <summary>${esc(v.policyName)}${badgesHtml}</summary>
      ${v.policyMessage ? `<div class="violation-message">${esc(v.policyMessage)}</div>` : ''}
      ${tagList}
      ${copilotBtn}
    </details>
  `;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '&#10;');
}

function linkify(s: string): string {
  return esc(s)
    .replace(/&lt;a href=&quot;(.*?)&quot;(.*?)&gt;(.*?)&lt;\/a&gt;/g, (_, url, _attrs, text) => {
      const href = url.replace(/&amp;/g, '&');
      if (!/^https?:\/\//i.test(href)) {
        return text;
      }
      return `<a href="${url}">${text}</a>`;
    })
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}
